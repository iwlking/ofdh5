import type { Page, TextItem } from '../types';
import type { Viewport } from '../render/viewport';
import { layoutGlyphs, type PlacedGlyph } from '../render/glyph-layout';

/** 量不到真实字体度量时的兜底：基线到字顶约占字号的 0.88 */
const DEFAULT_ASCENT_RATIO = 0.88;

export interface TextRunSpec {
  text: string;
  /** 对象坐标系中的起点（mm），尚未应用 boundary/CTM */
  x: number;
  y: number;
  /** 字号（mm） */
  size: number;
  /** 与 canvas ctx.font 同格式，供测量使用 */
  font: string;
  fontFamily: string;
  weight?: number;
  italic: boolean;
  /** CSS transform：已包含 boundary / CTM / HScale 与 mm→CSS px 的缩放 */
  transform: string;
}

let shared: CanvasRenderingContext2D | null | undefined;

/** 复用的 1x1 测量画布；jsdom 等无 canvas 环境返回 null，走兜底度量 */
function measureContext(): CanvasRenderingContext2D | null {
  if (shared !== undefined) return shared;
  shared = null;
  if (typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      shared = canvas.getContext('2d');
    } catch {
      shared = null;
    }
  }
  return shared;
}

export function measureWidth(font: string, text: string, fallback: number): number {
  const ctx = measureContext();
  if (!ctx) return fallback;
  try {
    ctx.font = font;
    const width = ctx.measureText(text).width;
    return Number.isFinite(width) && width > 0 ? width : fallback;
  } catch {
    return fallback;
  }
}

/** 基线到字顶的距离（mm），决定 span 的 top 偏移 */
export function ascentOf(font: string, size: number): number {
  const ctx = measureContext();
  if (!ctx) return size * DEFAULT_ASCENT_RATIO;
  try {
    ctx.font = font;
    const metrics = ctx.measureText('M') as TextMetrics & { fontBoundingBoxAscent?: number };
    const ascent = metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent;
    if (Number.isFinite(ascent) && (ascent as number) > 0) return ascent as number;
  } catch {
    /* 落到兜底 */
  }
  return size * DEFAULT_ASCENT_RATIO;
}

function fontOf(item: TextItem, fontFamily: (fontRef: string) => string): string {
  const family = fontFamily(item.fontRef);
  const weight = item.weight ? `${item.weight} ` : '';
  const style = item.italic ? 'italic ' : '';
  return `${style}${weight}${item.size}px ${family}`;
}

/**
 * boundary / CTM / HScale 的合成变换。
 *
 * 绘制层的顺序是 translate(boundary) → CTM → scale(HScale, 1)，而 CSS transform 从右往左作用，
 * 因此写成 scale(k) translate() matrix() scaleX()：最右侧先作用，最后统一乘 k 完成 mm→px。
 */
function transformOf(item: TextItem, pxPerMm: number): string {
  const [bx, by] = item.boundary;
  const [a, b, c, d, e, f] = item.ctm && item.ctm.length >= 6 ? item.ctm : [1, 0, 0, 1, 0, 0];
  const hs = item.hScale && item.hScale !== 100 ? item.hScale / 100 : 1;
  return `scale(${pxPerMm}) translate(${bx}px, ${by}px) matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f}) scaleX(${hs})`;
}

/** 把一串连续的字合并成 span，减少 DOM 节点数；不连续（换行、换列）则断开 */
function groupRuns(glyphs: PlacedGlyph[], size: number): Array<{ text: string; x: number; y: number }> {
  const tolerance = Math.max(0.02, size * 0.05);
  const runs: Array<{ text: string; x: number; y: number }> = [];
  let right = 0;

  for (const glyph of glyphs) {
    const last = runs[runs.length - 1];
    const contiguous = !!last && Math.abs(glyph.y - last.y) <= tolerance && Math.abs(glyph.x - right) <= tolerance;
    if (contiguous) last.text += glyph.char;
    else runs.push({ text: glyph.char, x: glyph.x, y: glyph.y });
    right = glyph.x + glyph.advance;
  }

  return runs;
}

/**
 * 计算一页的文本层内容。span 的位置与绘制层完全一致，
 * 因此可以直接用浏览器原生的划选 / 复制能力。
 */
export function textRunsOf(
  page: Page,
  vp: Viewport,
  fontFamily: (fontRef: string) => string,
): TextRunSpec[] {
  const specs: TextRunSpec[] = [];

  for (const item of page.items) {
    if (item.kind !== 'text' || item.glyphs.length === 0) continue;
    const font = fontOf(item, fontFamily);
    const glyphs = layoutGlyphs(item, (text) => measureWidth(font, text, item.size));
    if (glyphs.length === 0) continue;

    const transform = transformOf(item, vp.pxPerMm);
    const family = fontFamily(item.fontRef);
    for (const run of groupRuns(glyphs, item.size)) {
      specs.push({
        text: run.text,
        x: run.x,
        y: run.y,
        size: item.size,
        font,
        fontFamily: family,
        weight: item.weight,
        italic: item.italic === true,
        transform,
      });
    }
  }

  return specs;
}

/** 生成透明文本层 DOM：覆盖在 canvas 之上，负责划选与命中高亮 */
export function buildTextLayer(
  page: Page,
  vp: Viewport,
  fontFamily: (fontRef: string) => string,
): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ofdh5-text-layer';

  let holder: HTMLElement | null = null;
  let holderKey = '';

  for (const run of textRunsOf(page, vp, fontFamily)) {
    const key = `${run.transform}|${run.font}`;
    if (!holder || key !== holderKey) {
      holder = document.createElement('div');
      holder.className = 'ofdh5-text-item';
      holder.style.transform = run.transform;
      holder.style.fontFamily = run.fontFamily;
      holder.style.fontSize = `${run.size}px`;
      if (run.weight) holder.style.fontWeight = String(run.weight);
      if (run.italic) holder.style.fontStyle = 'italic';
      layer.appendChild(holder);
      holderKey = key;
    }

    const span = document.createElement('span');
    span.textContent = run.text;
    span.style.left = `${run.x}px`;
    span.style.top = `${run.y - ascentOf(run.font, run.size)}px`;
    holder.appendChild(span);
  }

  return layer;
}
