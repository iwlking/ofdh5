import type { Glyph, Page, PageItem, PageResources, TextItem } from '../types';
import { parseColor } from './color';
import { abbreviatedToSvgPath } from './path-data';
import { allByLocalName, attr, directChild, firstByLocalName, num, nums, parseXml } from './xml';

export interface PageSize {
  width: number;
  height: number;
}

function parseBoundary(value: string | null): [number, number, number, number] {
  const parts = nums(value);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

function parseCtm(value: string | null): number[] | undefined {
  const parts = nums(value);
  if (parts.length < 6) return undefined;
  return parts.slice(0, 6);
}

function parseText(el: Element, pageWidth: number): TextItem {
  const textCode = directChild(el, 'TextCode');
  const glyphEls = textCode ? allByLocalName(textCode, 'Glyph') : [];

  let glyphs: Glyph[] = [];
  let text = '';

  if (glyphEls.length > 0) {
    glyphs = glyphEls.map((g) => ({
      x: num(attr(g, 'X')),
      y: num(attr(g, 'Y')),
      code: num(attr(g, 'Code')),
      deltaX: attr(g, 'DeltaX') != null ? num(attr(g, 'DeltaX')) : undefined,
    }));
    text = glyphs.map((g) => String.fromCodePoint(g.code)).join('');
  } else if (textCode) {
    const chars = Array.from(textCode.textContent ?? '');
    const deltaXs = nums(attr(textCode, 'DeltaX'));
    const deltaYs = nums(attr(textCode, 'DeltaY'));
    let x = num(attr(textCode, 'X'));
    const baseY = num(attr(textCode, 'Y'));
    glyphs = chars.map((char, index) => {
      const dx = deltaXs.length > 1 ? deltaXs[index] : deltaXs[0];
      const dy = deltaYs.length > 1 ? deltaYs[index] : deltaYs[0];
      const glyph: Glyph = {
        x,
        y: baseY + (dy ?? 0),
        code: char.codePointAt(0) ?? 0,
        deltaX: dx,
        deltaY: dy,
      };
      x += dx ?? 0;
      return glyph;
    });
    text = chars.join('');
  }

  const fillEl = directChild(el, 'FillColor');
  const strokeEl = directChild(el, 'StrokeColor');
  const hScale = attr(el, 'HScale');

  return {
    kind: 'text',
    boundary: parseBoundary(attr(el, 'Boundary')),
    ctm: parseCtm(attr(el, 'CTM')),
    fontRef: attr(el, 'Font') ?? '',
    size: num(attr(el, 'Size'), 3.5),
    fill: parseColor(attr(fillEl, 'Value'), attr(fillEl, 'Alpha')),
    stroke: parseColor(attr(strokeEl, 'Value'), attr(strokeEl, 'Alpha')),
    hScale: hScale == null ? undefined : num(hScale, 100),
    weight: attr(el, 'Weight') == null ? undefined : num(attr(el, 'Weight'), 400),
    italic: attr(el, 'Italic') === 'true',
    glyphs,
    text,
  } as TextItem & { stroke?: unknown };
}

export function parsePage(
  source: string,
  index: number,
  _resources: PageResources,
  fallback?: PageSize,
): Page {
  const doc = parseXml(source, `Content.xml(第 ${index + 1} 页)`);
  const root = doc.documentElement;

  const box = nums(firstByLocalName(root, 'PhysicalBox')?.textContent ?? '');
  const width = box[2] ?? fallback?.width ?? 210;
  const height = box[3] ?? fallback?.height ?? 297;

  const items: PageItem[] = [];
  for (const layer of allByLocalName(root, 'Layer')) {
    for (let i = 0; i < layer.children.length; i++) {
      const child = layer.children[i];
      if (child.localName === 'TextObject') items.push(parseText(child, width));
    }
  }

  return { index, width, height, items };
}

export { abbreviatedToSvgPath };
