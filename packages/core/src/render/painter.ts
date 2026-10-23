import type { ImageItem, Page, PageItem, PathItem, RgbColor, TextItem } from '../types';
import type { Viewport } from './viewport';
import { toCssColor } from '../parser/color';

export interface PaintOptions {
  background: string;
  fontFamily: (fontRef: string) => string;
  getImage: (item: ImageItem) => CanvasImageSource | null;
  onItemError?: (item: PageItem, error: unknown) => void;
}

function applyCtm(ctx: CanvasRenderingContext2D, item: PageItem): void {
  const [x, y] = item.boundary;
  ctx.translate(x, y);
  if (item.ctm && item.ctm.length >= 6) {
    const [a, b, c, d, e, f] = item.ctm;
    ctx.transform(a, b, c, d, e, f);
  }
}

function fillColor(color: RgbColor | undefined): string | null {
  return color ? toCssColor(color) : null;
}

function drawText(ctx: CanvasRenderingContext2D, item: TextItem, opts: PaintOptions): void {
  ctx.save();
  applyCtm(ctx, item);
  if (item.hScale && item.hScale !== 100) ctx.scale(item.hScale / 100, 1);

  const family = opts.fontFamily(item.fontRef);
  const weight = item.weight ? `${item.weight} ` : '';
  const style = item.italic ? 'italic ' : '';
  ctx.font = `${style}${weight}${item.size}px ${family}`;
  ctx.textBaseline = 'alphabetic';

  const color = fillColor(item.fill) ?? 'rgba(0,0,0,1)';
  ctx.fillStyle = color;
  if (item.stroke) {
    ctx.strokeStyle = fillColor(item.stroke) ?? color;
    ctx.lineWidth = item.size * 0.02;
  }

  let cursor = 0;
  for (let i = 0; i < item.glyphs.length; i++) {
    const glyph = item.glyphs[i];
    if (glyph.deltaX != null || i === 0) cursor = glyph.x;
    const char = item.text[i];
    if (char) {
      ctx.fillText(char, cursor, glyph.y);
      if (item.stroke) ctx.strokeText(char, cursor, glyph.y);
    }
    cursor += glyph.deltaX ?? (char ? ctx.measureText(char).width : 0);
  }
  ctx.restore();
}

function drawPath(ctx: CanvasRenderingContext2D, item: PathItem): void {
  if (typeof Path2D === 'undefined') return;
  const path = new Path2D(item.d);
  ctx.save();
  applyCtm(ctx, item);
  if (item.fill) {
    ctx.fillStyle = toCssColor(item.fill);
    ctx.fill(path, item.rule);
  }
  if (item.stroke) {
    ctx.strokeStyle = toCssColor(item.stroke);
    ctx.lineWidth = item.lineWidth ?? 1;
    ctx.stroke(path);
  }
  ctx.restore();
}

function drawImage(ctx: CanvasRenderingContext2D, item: ImageItem, opts: PaintOptions): void {
  const image = opts.getImage(item);
  if (!image) return;
  const [x, y, w, h] = item.boundary;
  ctx.save();
  applyCtm(ctx, item);
  ctx.drawImage(image, 0, 0, w, h);
  ctx.restore();
}

export function paintPage(
  ctx: CanvasRenderingContext2D,
  page: Page,
  vp: Viewport,
  opts: PaintOptions,
): void {
  const scale = vp.dpr * vp.pxPerMm;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = opts.background;
  ctx.fillRect(0, 0, page.width, page.height);

  for (const item of page.items) {
    try {
      if (item.kind === 'text') drawText(ctx, item, opts);
      else if (item.kind === 'path') drawPath(ctx, item);
      else drawImage(ctx, item, opts);
    } catch (error) {
      opts.onItemError?.(item, error);
      console.warn('[ofdh5] 对象绘制失败:', item.kind, error);
    }
  }
}
