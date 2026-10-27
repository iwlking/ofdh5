import { EventBus } from './events';
import { OfdError, toOfdError } from './errors';
import { OfdZip } from './zip';
import { parseOfdPackage } from './parser/package';
import { parseDocumentMeta, type DocumentMeta } from './parser/document';
import { parsePage } from './parser/content';
import { parseAnnotations, stampItems, type StampAnnotation } from './parser/annotations';
import { parseSignatureSeals, type SealPackage } from './parser/signature';
import { bindResourceSource } from './parser/resources';
import { createResources, type ImageItem, type Page, type PageResources } from './types';
import { createFontRegistry, type FontRegistry } from './render/fonts';
import { createImageCache, isRasterImage, type ImageCache } from './render/images';
import { createViewport, type Viewport } from './render/viewport';
import { paintPage } from './render/painter';
import { buildTextLayer } from './ui/text-layer';
import { searchDocument, type SearchMatch, type SearchOptions } from './search';
import { createChrome, type Chrome } from './ui/chrome';
import { PinchZoom } from './interact/pinch-zoom';
import { ScrollWatcher, pageAtOffset } from './interact/scroller';

export interface Ofdh5Options {
  url?: string;
  pdfurl?: string;
  data?: ArrayBuffer | Uint8Array | Blob;
  goto?: number;
  scale?: number;
  scrollEnable?: boolean;
  zoomEnable?: boolean;
  resize?: boolean;
  lazyLoad?: boolean;
  /** 顶部加载进度条，默认关闭（首屏环形动效始终保留） */
  loadingBar?: boolean;
  /** 进度条与动效的最短展示时间（毫秒），避免小文件一闪而过，默认 400 */
  minLoadingDuration?: number;
  pageNum?: boolean;
  backTop?: boolean;
  tapZoomFactor?: number;
  maxZoom?: number;
  minZoom?: number;
  /** 越界回弹的阻尼系数，默认 0.35 */
  dampingFactor?: number;
  maxCachedPages?: number;
  maxDpr?: number;
  pageGap?: number;
  backgroundColor?: string;
  fontFallback?: string;
  /** 字体文件基地址（类似 pdfh5 的 standardFontDataUrl），无内嵌字体时按需 fetch */
  fontUrl?: string;
  /** 字体名映射：{ "楷体": "simkai.ttf" } 或 { "楷体": "MyKai" } */
  fontMap?: Record<string, string>;
  timeout?: number;
  /** 透明文本层：开启后文字可划选复制，搜索命中也依赖它定位，默认 true */
  textLayer?: boolean;
}

export type Ofdh5Events = {
  init: () => void;
  ready: () => void;
  error: (msg: string, time: number) => void;
  success: (msg: string, time: number) => void;
  complete: (status: 'success' | 'error', msg: string, time: number) => void;
  render: (num: number, pageTime: number, totalTime: number) => void;
  pageError: (pageNum: number, error: OfdError) => void;
  fontFallback: (pageNum: number, fontName: string) => void;
  zoom: (scale: number) => void;
  zoomStart: () => void;
  zoomEnd: (scale: number) => void;
  scroll: (data: { scrollTop: number; currentNum: number }) => void;
  backTop: () => void;
  zoomEnabled: (flag: boolean) => void;
  scrollEnabled: (flag: boolean) => void;
  search: (keyword: string, matches: SearchMatch[]) => void;
  show: () => void;
  hide: () => void;
  destroy: () => void;
};

export interface OfdStatus {
  status: 'init' | 'loading' | 'ready' | 'error' | 'destroyed';
  pageCount: number;
  currentPage: number;
  scale: number;
  renderedPages: number[];
  cachedPages: number;
  skippedObjects: number;
  lastError: { code: string; message: string } | null;
}

interface ResolvedOptions {
  url?: string;
  data?: ArrayBuffer | Uint8Array | Blob;
  goto: number;
  scale: number;
  scrollEnable: boolean;
  zoomEnable: boolean;
  resize: boolean;
  lazyLoad: boolean;
  loadingBar: boolean;
  minLoadingDuration: number;
  pageNum: boolean;
  backTop: boolean;
  tapZoomFactor: number;
  maxZoom: number;
  minZoom: number;
  dampingFactor: number;
  maxCachedPages: number;
  maxDpr: number;
  pageGap: number;
  backgroundColor: string;
  fontFallback: string;
  fontUrl?: string;
  fontMap?: Record<string, string>;
  timeout: number;
  textLayer: boolean;
}

/** 跨文档扁平化后的一页：记录它属于哪个 DocBody */
interface FlatPage {
  doc: number;
  id: string;
  loc: string;
}

/** 一份 DocBody 的上下文；资源 ID 只在文档内唯一，因此字体/图片缓存按文档隔离 */
interface OfdDocument {
  docRoot: string;
  meta: DocumentMeta;
  resources: PageResources;
  fonts: FontRegistry;
  images: ImageCache;
  annotations: Map<string, StampAnnotation[]> | null;
  /** 外层 PageID → 签名内嵌的印章外观页 */
  seals: Map<string, SealPackage[]> | null;
}

interface SearchState {
  keyword: string;
  matches: SearchMatch[];
  /** 当前命中在 matches 中的下标，-1 表示没有命中 */
  current: number;
}

function resolveOptions(raw: Ofdh5Options = {}): ResolvedOptions {
  return {
    url: raw.url ?? raw.pdfurl,
    data: raw.data,
    goto: raw.goto ?? 0,
    scale: raw.scale && raw.scale > 0 ? raw.scale : 1,
    scrollEnable: raw.scrollEnable !== false,
    zoomEnable: raw.zoomEnable !== false,
    resize: raw.resize !== false,
    lazyLoad: raw.lazyLoad !== false,
    // 顶部加载条默认关闭，需要时显式传 loadingBar: true
    loadingBar: raw.loadingBar === true,
    minLoadingDuration: raw.minLoadingDuration ?? 400,
    pageNum: raw.pageNum !== false,
    backTop: raw.backTop !== false,
    tapZoomFactor: raw.tapZoomFactor ?? 2,
    maxZoom: raw.maxZoom ?? 4,
    // 默认加载尺寸就是最小尺寸：缩小到 1 倍以内会回弹
    minZoom: raw.minZoom ?? 1,
    dampingFactor: raw.dampingFactor ?? 0.35,
    maxCachedPages: raw.maxCachedPages ?? 6,
    maxDpr: raw.maxDpr ?? 2,
    pageGap: raw.pageGap ?? 8,
    backgroundColor: raw.backgroundColor ?? '#fff',
    fontFallback: raw.fontFallback ?? 'sans-serif',
    fontUrl: raw.fontUrl,
    fontMap: raw.fontMap,
    timeout: raw.timeout ?? 30000,
    textLayer: raw.textLayer !== false,
  };
}

export class Ofdh5 {
  readonly version = '0.1.0';
  totalNum = 0;
  currentNum = 1;

  private readonly bus: EventBus<Ofdh5Events>;
  private readonly opts: ResolvedOptions;
  private readonly container: HTMLElement;

  private chrome: Chrome | null = null;
  private zoom: PinchZoom | null = null;
  private watcher: ScrollWatcher | null = null;

  private zip: OfdZip | null = null;
  private buffer: Uint8Array | null = null;
  /** 一个 DocBody 一份上下文，按 OFD.xml 里的 DocRoot 顺序 */
  private docs: OfdDocument[] = [];
  /** 跨文档的扁平页列表，下标即「页码 - 1」 */
  private flatPages: FlatPage[] = [];

  private pageCache = new Map<number, Page>();
  private loadingStartedAt = 0;
  private searchState: SearchState | null = null;
  private placeholders: HTMLElement[] = [];
  private rendered = new Set<number>();
  private rendering = new Set<number>();
  private skippedObjects = 0;

  private status: OfdStatus['status'] = 'init';
  private lastError: OfdStatus['lastError'] = null;
  private startedAt = 0;
  private resizeHandler: (() => void) | null = null;

  private resolveLoaded: (() => void) | null = null;
  /** 测试与外部等待加载结束用 */
  readonly loaded: Promise<void>;

  constructor(container: HTMLElement, options?: Ofdh5Options) {
    this.container = container;
    this.opts = resolveOptions(options);
    this.bus = new EventBus<Ofdh5Events>(this);
    this.loaded = new Promise<void>((resolve) => {
      this.resolveLoaded = resolve;
    });
    void this.init();
  }

  private async init(): Promise<void> {
    this.startedAt = performance.now();
    this.bus.trigger('init');
    try {
      if (!this.opts.url && !this.opts.data) {
        throw new OfdError('E_NETWORK', '缺少 url 或 data');
      }
      this.chrome = createChrome(this.container, {
        loadingBar: this.opts.loadingBar,
        pageNum: this.opts.pageNum,
        backTop: this.opts.backTop,
      });
      this.chrome.onBackTop(() => this.scrollToTop());
      this.loadingStartedAt = Date.now();
      this.chrome.showLoading();
      await this.load();
    } catch (error) {
      this.fail(error);
    } finally {
      this.complete();
    }
  }

  private async load(): Promise<void> {
    const buffer = await this.readSource();
    this.buffer = buffer;

    const zip = new OfdZip(buffer);
    if (zip.has('Encrypt.xml')) {
      throw new OfdError('E_ENCRYPTED', '暂不支持加密 OFD');
    }
    this.zip = zip;

    const pkg = parseOfdPackage(zip.readText('OFD.xml'));
    // 多 DocBody 包：逐个解析，任一文档损坏只跳过它自己
    for (const docRoot of [...new Set(pkg.docRoots)]) {
      try {
        this.docs.push(this.openDocument(zip, docRoot));
      } catch (error) {
        console.warn('[ofdh5] 文档解析失败，已跳过:', docRoot, error);
      }
    }
    if (this.docs.length === 0) {
      throw new OfdError('E_NO_ENTRY', 'OFD.xml 中的 DocRoot 均无法解析');
    }

    this.docs.forEach((doc, docIndex) => {
      for (const page of doc.meta.pages) {
        this.flatPages.push({ doc: docIndex, id: page.id, loc: page.loc });
      }
    });
    this.totalNum = this.flatPages.length;
    this.status = 'ready';

    this.buildPlaceholders();
    this.attachInteractions();
    this.chrome!.setPage(1, this.totalNum);
    this.chrome!.setProgress(0.15);
    this.bus.trigger('ready');

    await this.renderVisible();
    this.chrome!.setProgress(1);
    this.finishLoading();
    this.bus.trigger('success', 'load success', performance.now() - this.startedAt);

    if (this.opts.goto > 0) this.goToPage(this.opts.goto);
  }

  /** 解析一个 DocBody：Document.xml、资源、签章各自独立 */
  private openDocument(zip: OfdZip, docRoot: string): OfdDocument {
    const documentXml = zip.readText(docRoot);
    const meta = parseDocumentMeta(documentXml, docRoot);

    let annotations: Map<string, StampAnnotation[]> | null = null;
    try {
      annotations = parseAnnotations(zip, docRoot, documentXml);
    } catch (error) {
      console.warn('[ofdh5] 注释解析失败，跳过签章:', error);
    }
    // parseSignatureSeals 内部逐个签名 try/catch，异常结构只会被跳过
    const seals = parseSignatureSeals(zip, docRoot, documentXml);

    return {
      docRoot,
      meta,
      resources: bindResourceSource(createResources(), zip, docRoot),
      fonts: createFontRegistry(this.opts.fontFallback, {
        fontMap: this.opts.fontMap,
        fontBaseUrl: this.opts.fontUrl,
      }),
      images: createImageCache({ read: (path) => zip.read(path) }),
      annotations,
      seals,
    };
  }

  private async readSource(): Promise<Uint8Array> {
    if (this.opts.data) {
      if (this.opts.data instanceof ArrayBuffer) return new Uint8Array(this.opts.data);
      if (this.opts.data instanceof Uint8Array) return this.opts.data;
      return new Uint8Array(await (this.opts.data as Blob).arrayBuffer());
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), this.opts.timeout);
    try {
      const response = await fetch(this.opts.url as string, controller ? { signal: controller.signal } : {});
      if (!response.ok) throw new OfdError('E_NETWORK', `下载失败：HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (error instanceof OfdError) throw error;
      throw new OfdError('E_NETWORK', `下载失败：${(error as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPlaceholders(): void {
    const viewer = this.chrome!.viewer;
    viewer.innerHTML = '';
    this.placeholders = [];
    const width = this.contentWidth();

    for (let i = 0; i < this.totalNum; i++) {
      const size = this.fallbackSize(i);
      const ratio = size.height / size.width;
      const page = document.createElement('div');
      page.className = 'ofdh5-page';
      page.dataset.index = String(i);
      // 页面盒子的宽高必须跟渲染出来的 canvas 完全一致，否则阴影和内容会错位
      const pageWidth = Math.round(width * this.opts.scale);
      page.style.width = `${pageWidth}px`;
      page.style.height = `${Math.round(pageWidth * ratio)}px`;
      page.style.marginBottom = `${this.opts.pageGap}px`;
      viewer.appendChild(page);
      this.placeholders.push(page);
    }
  }

  private attachInteractions(): void {
    this.zoom = new PinchZoom(this.chrome!.scroller, this.chrome!.viewer, this.chrome!.sizer, {
      minScale: this.opts.minZoom,
      maxScale: this.opts.maxZoom,
      tapZoomFactor: this.opts.tapZoomFactor,
      damping: this.opts.dampingFactor,
      enabled: this.opts.zoomEnable,
      onZoom: (scale) => this.bus.trigger('zoom', scale),
      onZoomStart: () => this.bus.trigger('zoomStart'),
      onZoomEnd: (scale) => this.bus.trigger('zoomEnd', scale),
    });
    this.zoom.setBaseSize(this.chrome!.viewer.offsetWidth, this.chrome!.viewer.offsetHeight);

    this.watcher = new ScrollWatcher(this.chrome!.scroller, (scrollTop) => {
      const current = this.pageIndexAt(scrollTop);
      if (current !== this.currentNum - 1) {
        this.currentNum = current + 1;
        this.chrome!.setPage(this.currentNum, this.totalNum);
      }
      this.bus.trigger('scroll', { scrollTop, currentNum: this.currentNum });
      this.chrome!.setBackTopVisible(scrollTop > (this.chrome!.scroller.clientHeight || 600));
      void this.renderVisible();
    });

    if (this.opts.resize && typeof window !== 'undefined') {
      this.resizeHandler = () => {
        this.rendered.clear();
        this.buildPlaceholders();
        void this.renderVisible();
      };
      window.addEventListener('resize', this.resizeHandler);
    }
  }

  private documentOf(index: number): OfdDocument | null {
    const flat = this.flatPages[index];
    return flat ? this.docs[flat.doc] ?? null : null;
  }

  /** 文档声明的页尺寸，页面自身 PhysicalBox 缺失时兜底 */
  private fallbackSize(index: number): { width: number; height: number } {
    const meta = this.documentOf(index)?.meta;
    return { width: meta?.width ?? 210, height: meta?.height ?? 297 };
  }

  /** 注册当前已收集到但尚未注册的内嵌字体；每解析一页都调用一次 */
  private async ensureFonts(index: number): Promise<void> {
    const doc = this.documentOf(index);
    if (!doc || !this.zip) return;
    for (const [id, font] of doc.resources.fonts) {
      if (doc.fonts.has(id)) continue;
      const data = font.file ? this.zip.read(font.file) : null;
      const ok = await doc.fonts.register(id, data ?? null, font.family || font.name);
      if (!ok) this.bus.trigger('fontFallback', index + 1, font.name || font.family);
    }
  }

  private pageIndexAt(scrollTop: number): number {
    const offsets = this.placeholders.map((el) => el.offsetTop);
    const heights = this.placeholders.map((el) => el.offsetHeight);
    return pageAtOffset(offsets, heights, scrollTop, this.chrome!.scroller.clientHeight || 600);
  }

  private contentWidth(): number {
    const width = this.chrome!.scroller.clientWidth || this.container.clientWidth || 375;
    return width - 16;
  }

  private dpr(): number {
    const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(raw, this.opts.maxDpr);
  }

  private parsePageAt(index: number): Page {
    const cached = this.pageCache.get(index);
    if (cached) return cached;
    if (!this.zip) throw new OfdError('E_NO_ENTRY', '包未加载');

    const flat = this.flatPages[index];
    const doc = this.documentOf(index);
    if (!flat || !doc) throw new OfdError('E_NO_ENTRY', `第 ${index + 1} 页不存在`);

    const parsed = parsePage(
      this.zip.readText(flat.loc),
      index,
      doc.resources,
      this.fallbackSize(index),
      flat.loc,
    );

    const stamps = doc.annotations?.get(flat.id);
    if (stamps && stamps.length > 0) {
      // 印章叠加在正文之后，保证绘制在页面对象之上
      parsed.items.push(...stampItems(stamps, doc.resources, doc.seals?.get(flat.id) ?? []));
    }

    this.pageCache.set(index, parsed);
    return parsed;
  }

  private async prefetchImages(index: number, page: Page): Promise<void> {
    const doc = this.documentOf(index);
    if (!doc) return;
    const jobs: Array<Promise<unknown>> = [];
    for (const item of page.items) {
      if (item.kind !== 'image') continue;
      const resource = doc.resources.images.get(item.resId);
      if (!resource) continue;
      jobs.push(doc.images.load(resource.id, resource.file, resource.format));
    }
    await Promise.all(jobs);
  }

  private async renderPage(index: number): Promise<void> {
    if (index < 0 || index >= this.totalNum) return;
    if (this.rendered.has(index) || this.rendering.has(index)) return;
    this.rendering.add(index);
    const pageStarted = performance.now();
    const placeholder = this.placeholders[index];

    try {
      const doc = this.documentOf(index);
      if (!doc) throw new OfdError('E_NO_ENTRY', `第 ${index + 1} 页不存在`);
      const fontFamily = (fontRef: string) => doc.fonts.family(fontRef, doc.resources.fonts.get(fontRef)?.family);
      const page = this.parsePageAt(index);
      await this.ensureFonts(index);
      const width = this.contentWidth() * this.opts.scale;
      const viewport = createViewport(page, width, 1, this.dpr());
      await this.prefetchImages(index, page);

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.cssWidth * viewport.dpr);
      canvas.height = Math.round(viewport.cssHeight * viewport.dpr);
      // 以 canvas 实际尺寸为准回写页面盒子，scale 变化后仍严丝合缝
      placeholder.style.width = `${viewport.cssWidth}px`;
      placeholder.style.height = `${viewport.cssHeight}px`;
      canvas.style.width = `${viewport.cssWidth}px`;
      canvas.style.height = `${viewport.cssHeight}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new OfdError('E_CANVAS', '无法创建 canvas 上下文');

      paintPage(ctx, page, viewport, {
        background: this.opts.backgroundColor,
        fontFamily,
        getImage: (item) => {
          const decoded = doc.images.get(item.resId);
          if (!decoded || isRasterImage(decoded)) return null;
          return decoded as CanvasImageSource;
        },
        onItemError: () => {
          this.skippedObjects += 1;
        },
      });

      placeholder.innerHTML = '';
      placeholder.appendChild(canvas);
      if (this.opts.textLayer) placeholder.appendChild(buildTextLayer(page, viewport, fontFamily));
      this.rendered.add(index);
      this.applySearchHits(index, viewport);
      this.bus.trigger('render', index + 1, performance.now() - pageStarted, performance.now() - this.startedAt);
    } catch (error) {
      const err = toOfdError(error, 'E_RENDER');
      placeholder.innerHTML = `<div class="ofdh5-page-error">第 ${index + 1} 页渲染失败</div>`;
      this.bus.trigger('pageError', index + 1, err);
    } finally {
      this.rendering.delete(index);
    }
  }

  private async renderVisible(): Promise<void> {
    const current = this.currentNum - 1;
    const targets = this.opts.lazyLoad
      ? [current - 1, current, current + 1]
      : Array.from({ length: this.totalNum }, (_, i) => i);
    const valid = targets.filter((index) => index >= 0 && index < this.totalNum);
    for (let i = 0; i < valid.length; i++) {
      await this.renderPage(valid[i]);
      if (this.status !== 'ready') return;
      this.chrome?.setProgress((i + 1) / Math.max(1, valid.length));
    }
  }

  /** 保证进度条/动效至少展示 minLoadingDuration，避免快速加载时闪一下就没了 */
  private finishLoading(): void {
    const wait = Math.max(0, this.opts.minLoadingDuration - (Date.now() - this.loadingStartedAt));
    if (wait <= 0) {
      this.chrome?.hideLoading();
      return;
    }
    setTimeout(() => this.chrome?.hideLoading(), wait);
  }

  private fail(error: unknown): void {
    this.chrome?.hideLoading();
    const err = toOfdError(error, 'E_RENDER');
    this.status = 'error';
    this.lastError = { code: err.code, message: err.message };
    if (this.chrome) {
      this.chrome.viewer.innerHTML = `<div class="ofdh5-page-error">加载失败（${err.code}）</div>`;
    }
    this.bus.trigger('error', `${err.code}: ${err.message}`, performance.now() - this.startedAt);
  }

  private complete(): void {
    if (this.status !== 'error') this.status = 'ready';
    this.bus.trigger(
      'complete',
      this.status === 'error' ? 'error' : 'success',
      this.lastError ? this.lastError.message : 'ok',
      performance.now() - this.startedAt,
    );
    this.resolveLoaded?.();
  }

  on<K extends keyof Ofdh5Events>(type: K, callback: Ofdh5Events[K]): void {
    this.bus.on(type, callback);
  }

  off<K extends keyof Ofdh5Events>(type: K): void {
    this.bus.off(type);
  }

  trigger<K extends keyof Ofdh5Events>(type: K, ...args: Parameters<Ofdh5Events[K]>): void {
    this.bus.trigger(type, ...args);
  }

  getPageCount(): number {
    return this.totalNum;
  }

  getPageSize(index: number): { width: number; height: number } {
    const page = this.pageCache.get(index - 1);
    if (page) return { width: page.width, height: page.height };
    return this.fallbackSize(index - 1);
  }

  getCacheStats(): { rendered: number; cachedPages: number } {
    return { rendered: this.rendered.size, cachedPages: this.rendered.size };
  }

  getStatus(): OfdStatus {
    return {
      status: this.status,
      pageCount: this.totalNum,
      currentPage: this.currentNum,
      scale: this.zoom?.scale ?? this.opts.scale,
      renderedPages: [...this.rendered].map((i) => i + 1).sort((a, b) => a - b),
      cachedPages: this.rendered.size,
      skippedObjects: this.skippedObjects,
      lastError: this.lastError,
    };
  }

  /** 全文搜索：解析所有页并返回命中，同时跳到第一个命中并高亮 */
  searchText(keyword: string, options: SearchOptions = {}): SearchMatch[] {
    this.clearSearchHits();
    const matches = searchDocument(this.allPages(), keyword, options);
    this.searchState = { keyword, matches, current: matches.length > 0 ? 0 : -1 };
    if (matches.length > 0) {
      this.goToPage(matches[0].pageNum);
      this.refreshSearchHits();
    }
    this.bus.trigger('search', keyword, matches);
    return matches;
  }

  findNext(): SearchMatch | null {
    return this.stepSearch(1);
  }

  findPrevious(): SearchMatch | null {
    return this.stepSearch(-1);
  }

  /** 清除搜索状态与命中高亮 */
  clearSearch(): void {
    this.searchState = null;
    this.clearSearchHits();
  }

  getSearchState(): { keyword: string; matches: SearchMatch[]; current: number } {
    const state = this.searchState;
    return { keyword: state?.keyword ?? '', matches: state?.matches ?? [], current: state?.current ?? -1 };
  }

  private stepSearch(delta: number): SearchMatch | null {
    const state = this.searchState;
    if (!state || state.matches.length === 0) return null;
    const total = state.matches.length;
    state.current = ((state.current < 0 ? 0 : state.current) + delta + total) % total;
    const match = state.matches[state.current];
    this.goToPage(match.pageNum);
    this.refreshSearchHits();
    return match;
  }

  /** 解析全部页用于搜索；单页失败按空页处理，不影响其他页 */
  private allPages(): Page[] {
    const pages: Page[] = [];
    for (let i = 0; i < this.totalNum; i++) {
      try {
        pages.push(this.parsePageAt(i));
      } catch (error) {
        console.warn('[ofdh5] 搜索跳过解析失败的页:', i + 1, error);
        pages.push({ index: i, width: 0, height: 0, items: [] });
      }
    }
    return pages;
  }

  private refreshSearchHits(): void {
    for (const index of this.rendered) this.applySearchHits(index);
  }

  /** 在指定页重画命中框；vp 由 renderPage 传入，避免重复计算 */
  private applySearchHits(index: number, vp?: Viewport): void {
    const placeholder = this.placeholders[index];
    const state = this.searchState;
    if (!placeholder || !state) return;
    for (const el of Array.from(placeholder.querySelectorAll('.ofdh5-search-hit'))) el.remove();
    const page = this.pageCache.get(index);
    if (!page) return;
    const viewport = vp ?? createViewport(page, this.contentWidth() * this.opts.scale, 1, this.dpr());
    const k = viewport.pxPerMm;
    for (const match of state.matches) {
      if (match.pageNum !== index + 1) continue;
      const hit = document.createElement('div');
      hit.className = 'ofdh5-search-hit';
      if (match.index === state.current) hit.classList.add('is-current');
      hit.style.left = `${match.rect.x * k}px`;
      hit.style.top = `${match.rect.y * k}px`;
      hit.style.width = `${Math.max(2, match.rect.width * k)}px`;
      hit.style.height = `${Math.max(2, match.rect.height * k)}px`;
      placeholder.appendChild(hit);
    }
  }

  private clearSearchHits(): void {
    for (const placeholder of this.placeholders) {
      for (const el of Array.from(placeholder.querySelectorAll('.ofdh5-search-hit'))) el.remove();
    }
  }

  goToPage(pageNum: number): void {
    const index = Math.max(0, Math.min(this.totalNum - 1, Math.trunc(pageNum) - 1));
    const target = this.placeholders[index];
    if (!target || !this.chrome) return;
    this.chrome.scroller.scrollTop = target.offsetTop;
    this.currentNum = index + 1;
    this.chrome.setPage(this.currentNum, this.totalNum);
    void this.renderVisible();
  }

  nextPage(): void {
    this.goToPage(this.currentNum + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentNum - 1);
  }

  scrollToTop(): void {
    if (!this.chrome) return;
    this.chrome.scroller.scrollTop = 0;
    this.currentNum = 1;
    this.chrome.setPage(1, this.totalNum);
    this.bus.trigger('backTop');
  }

  zoomIn(): void {
    this.zoom?.setScale((this.zoom?.scale ?? 1) + 0.1);
  }

  zoomOut(): void {
    this.zoom?.setScale((this.zoom?.scale ?? 1) - 0.1);
  }

  setScale(scale: number): void {
    this.opts.scale = Math.max(0.1, scale);
    this.rendered.clear();
    this.placeholders.forEach((el) => { el.innerHTML = ''; });
    void this.renderVisible();
  }

  setZoomEnabled(enabled: boolean): void {
    this.opts.zoomEnable = enabled;
    if (this.zoom) this.zoom.setEnabled(enabled);
    this.bus.trigger('zoomEnabled', enabled);
  }

  isZoomEnabled(): boolean {
    return this.opts.zoomEnable;
  }

  setScrollEnabled(enabled: boolean): void {
    this.opts.scrollEnable = enabled;
    if (this.chrome) this.chrome.scroller.style.overflowY = enabled ? 'auto' : 'hidden';
    this.bus.trigger('scrollEnabled', enabled);
  }

  isScrollEnabled(): boolean {
    return this.opts.scrollEnable;
  }

  setZoomConstraints(constraints: { minScale: number; maxScale: number; step?: number }): void {
    this.opts.minZoom = constraints.minScale;
    this.opts.maxZoom = constraints.maxScale;
  }

  getZoomConstraints(): { minScale: number; maxScale: number; step: number } {
    return { minScale: this.opts.minZoom, maxScale: this.opts.maxZoom, step: 0.1 };
  }

  isZooming(): boolean {
    return (this.zoom?.scale ?? 1) !== 1;
  }

  show(): void {
    this.container.style.display = '';
    this.bus.trigger('show');
  }

  hide(): void {
    this.container.style.display = 'none';
    this.bus.trigger('hide');
  }

  download(filename = 'document.ofd'): void {
    if (!this.buffer) return;
    const blob = new Blob([this.buffer.slice()], { type: 'application/ofd' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  destroy(): void {
    this.zoom?.destroy();
    this.watcher?.destroy();
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    for (const doc of this.docs) { doc.images.clear(); }
    this.docs = [];
    this.flatPages = [];
    this.searchState = null;
    this.chrome?.destroy();
    this.pageCache.clear();
    this.rendered.clear();
    this.bus.trigger('destroy');
    this.bus.clear();
    this.status = 'destroyed';
    this.resolveLoaded?.();
  }
}
