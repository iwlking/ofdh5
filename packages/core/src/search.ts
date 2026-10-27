import type { Page, TextItem } from './types';
import { layoutGlyphs, type PlacedGlyph } from './render/glyph-layout';

/** 页面坐标系（mm），原点在页面左上角 */
export interface SearchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchHit {
  text: string;
  rect: SearchRect;
}

export interface SearchMatch extends SearchHit {
  /** 全局序号，从 0 开始 */
  index: number;
  /** 页码，从 1 开始 */
  pageNum: number;
}

export interface SearchOptions {
  /** 默认 false：忽略大小写 */
  caseSensitive?: boolean;
}

/** 基线到字顶约占字号的 0.88，基线下延约 0.24 */
const ASCENT_RATIO = 0.88;
const DESCENT_RATIO = 0.24;

/** 无 canvas 时估算字符宽度：CJK/全角按 1em，其余按 0.5em */
function isWide(code: number): boolean {
  if (code >= 0x1100 && code <= 0x115f) return true;
  if (code >= 0x2e80 && code <= 0xa4cf) return true;
  if (code >= 0xac00 && code <= 0xd7a3) return true;
  if (code >= 0xf900 && code <= 0xfaff) return true;
  if (code >= 0xfe30 && code <= 0xfe6f) return true;
  if (code >= 0xff00 && code <= 0xff60) return true;
  if (code >= 0xffe0 && code <= 0xffe6) return true;
  return false;
}

function estimateWidth(char: string, size: number): number {
  return size * (isWide(char.codePointAt(0) ?? 0) ? 1 : 0.5);
}

/** 对象坐标系 → 页面坐标系：scale(HScale,1) → CTM → translate(boundary)，与绘制层一致 */
function mapPoint(item: TextItem, x: number, y: number): [number, number] {
  const [bx, by] = item.boundary;
  const hs = item.hScale && item.hScale !== 100 ? item.hScale / 100 : 1;
  const px = x * hs;
  if (item.ctm && item.ctm.length >= 6) {
    const [a, b, c, d, e, f] = item.ctm;
    return [bx + a * px + c * y + e, by + b * px + d * y + f];
  }
  return [bx + px, by + y];
}

/** 四个角一起变换，旋转/斜切的文字也能取到正确的包围盒 */
function boundingRect(item: TextItem, x0: number, y0: number, x1: number, y1: number): SearchRect {
  const corners: Array<[number, number]> = [
    mapPoint(item, x0, y0),
    mapPoint(item, x1, y0),
    mapPoint(item, x0, y1),
    mapPoint(item, x1, y1),
  ];
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

function rectOf(item: TextItem, glyphs: PlacedGlyph[]): SearchRect {
  const size = item.size;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  for (const glyph of glyphs) {
    left = Math.min(left, glyph.x);
    right = Math.max(right, glyph.x + Math.max(glyph.advance, estimateWidth(glyph.char, size)));
    top = Math.min(top, glyph.y);
  }
  if (!Number.isFinite(left)) return { x: 0, y: 0, width: 0, height: 0 };
  return boundingRect(item, left, top - size * ASCENT_RATIO, right, top + size * DESCENT_RATIO);
}

/** 在单个文本对象里找全部命中 */
function hitsInItem(item: TextItem, needle: string, caseSensitive: boolean): SearchHit[] {
  const glyphs = layoutGlyphs(item, (char) => estimateWidth(char, item.size));
  if (glyphs.length === 0) return [];

  // 用排好序的字序列当 haystack，保证命中下标能直接映射回 glyphs
  const haystack = glyphs.map((g) => g.char).join('');
  const source = caseSensitive ? haystack : haystack.toLowerCase();
  const target = caseSensitive ? needle : needle.toLowerCase();

  const hits: SearchHit[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(target, from);
    if (at < 0) break;
    const slice = glyphs.slice(at, at + target.length);
    hits.push({ text: slice.map((g) => g.char).join(''), rect: rectOf(item, slice) });
    from = at + Math.max(1, target.length);
  }
  return hits;
}

/** 搜索单页，按文本对象顺序返回命中 */
export function searchPage(page: Page, keyword: string, options: SearchOptions = {}): SearchHit[] {
  const needle = keyword.trim();
  if (!needle) return [];
  const caseSensitive = options.caseSensitive === true;

  const hits: SearchHit[] = [];
  for (const item of page.items) {
    if (item.kind !== 'text') continue;
    hits.push(...hitsInItem(item, needle, caseSensitive));
  }
  return hits;
}

/** 搜索整份文档，命中按页码升序编号 */
export function searchDocument(pages: Page[], keyword: string, options: SearchOptions = {}): SearchMatch[] {
  const matches: SearchMatch[] = [];
  pages.forEach((page, i) => {
    for (const hit of searchPage(page, keyword, options)) {
      matches.push({ ...hit, index: matches.length, pageNum: i + 1 });
    }
  });
  return matches;
}
