import type { TextItem } from '../types';

export interface PlacedGlyph {
  char: string;
  /** 对象坐标系中的绘制位置（mm），与 canvas fillText 的 x/y 一致 */
  x: number;
  y: number;
  /** 到下一个字的步进（mm）；最后一个字为 0 */
  advance: number;
}

/**
 * 计算每个字的绝对绘制位置。
 *
 * OFD 的 DeltaX 只给出 n-1 个步进，最后一个字没有步进，必须接在上一个字后面，
 * 否则会跳回行首和第一个字重叠；竖向文字靠 DeltaY 前进，此时 x 保持不动。
 * 绘制层与文本层共用这一份结果，保证选中框和画出来的字严格对齐。
 *
 * @param measure 返回字符宽度（mm），由调用方按当前字体测量
 */
export function layoutGlyphs(
  item: TextItem,
  measure: (text: string) => number,
): PlacedGlyph[] {
  const out: PlacedGlyph[] = [];
  let cursor = item.glyphs[0]?.x ?? 0;

  for (let i = 0; i < item.glyphs.length; i++) {
    const glyph = item.glyphs[i];
    const char = item.text[i];
    if (!char) continue;

    // 有 DeltaX/DeltaY 的字用自身坐标；否则接在上一个字后面
    const positioned = i === 0 || glyph.deltaX != null || glyph.deltaY != null;
    const x = positioned ? glyph.x : cursor;

    if (glyph.deltaX != null) cursor = x + glyph.deltaX;
    else if (glyph.deltaY == null) cursor = x + measure(char);
    else cursor = x;

    out.push({ char, x, y: glyph.y, advance: cursor - x });
  }

  return out;
}
