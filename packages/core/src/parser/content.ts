import type { ColorSpec, DrawParamResource, Glyph, Page, PageItem, PageResources, RgbColor, TextItem } from '../types';
import { parseColor } from './color';
import { abbreviatedToSvgPath } from './path-data';
import { mergePageResources } from './resources';
import { allByLocalName, attr, directChild, firstByLocalName, num, nums, parseXml } from './xml';

const BLACK: RgbColor = { r: 0, g: 0, b: 0, a: 1 };

/** <ofd:FillColor Value="255 0 0" ColorSpace="10" Alpha="128"/> */
function colorSpecOf(element: Element | null): ColorSpec | undefined {
  if (!element) return undefined;
  const value = attr(element, 'Value');
  if (value == null || !value.trim()) return undefined;
  return {
    value,
    alpha: attr(element, 'Alpha') ?? undefined,
    colorSpace: attr(element, 'ColorSpace') ?? undefined,
  };
}

/** 按 ColorSpace 资源解释色值；ColorSpace 属性也可能直接写 RGB/GRAY/CMYK */
function resolveColor(spec: ColorSpec | undefined, resources: PageResources): RgbColor | undefined {
  if (!spec) return undefined;
  const ref = spec.colorSpace;
  const space = ref ? resources.colorSpaces?.get(ref)?.type ?? ref : undefined;
  return parseColor(spec.value, spec.alpha, space);
}

function drawParamOf(element: Element, resources: PageResources) {
  const id = attr(element, 'DrawParam');
  return id ? resources.drawParams?.get(id) : undefined;
}

export interface PageSize {
  width: number;
  height: number;
}

/**
 * OFD 的 DeltaX/DeltaY 支持 g 语法：g <count> <value> 表示连续 count 个字符都取该值。
 * 发票里几乎都用这种写法（如 g 10 6.5297）。
 */
function expandDelta(raw: string | null): number[] {
  if (!raw || !raw.trim()) return [];
  const tokens = raw.trim().split(/\s+/);
  const out: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'g') {
      const count = Number.parseInt(tokens[i + 1] ?? '', 10);
      const value = Number.parseFloat(tokens[i + 2] ?? '');
      if (Number.isFinite(count) && Number.isFinite(value)) {
        for (let k = 0; k < count; k++) out.push(value);
      }
      i += 2;
      continue;
    }
    const value = Number.parseFloat(tokens[i]);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
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

function parseText(el: Element, resources: PageResources): TextItem {
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
    const deltaXs = expandDelta(attr(textCode, 'DeltaX'));
    const deltaYs = expandDelta(attr(textCode, 'DeltaY'));
    // DeltaX/DeltaY 都是「步进量」，必须逐字累加：
    // 竖向文字靠 DeltaY 前进，多行文字靠一次负 DeltaX 回车 + 正 DeltaY 换行
    let x = num(attr(textCode, 'X'));
    let y = num(attr(textCode, 'Y'));
    glyphs = chars.map((char, index) => {
      const dx = deltaXs.length > 1 ? deltaXs[index] : deltaXs[0];
      const dy = deltaYs.length > 1 ? deltaYs[index] : deltaYs[0];
      const glyph: Glyph = {
        x,
        y,
        code: char.codePointAt(0) ?? 0,
        deltaX: dx,
        deltaY: dy,
      };
      x += dx ?? 0;
      y += dy ?? 0;
      return glyph;
    });
    text = chars.join('');
  }

  const fillEl = directChild(el, 'FillColor');
  const strokeEl = directChild(el, 'StrokeColor');
  const hScale = attr(el, 'HScale');
  const drawParam = drawParamOf(el, resources);

  return {
    kind: 'text',
    boundary: parseBoundary(attr(el, 'Boundary')),
    ctm: parseCtm(attr(el, 'CTM')),
    fontRef: attr(el, 'Font') ?? '',
    size: num(attr(el, 'Size'), 3.5),
    fill: resolveColor(colorSpecOf(fillEl) ?? drawParam?.fill, resources),
    stroke: resolveColor(colorSpecOf(strokeEl) ?? drawParam?.stroke, resources),
    hScale: hScale == null ? undefined : num(hScale, 100),
    weight: attr(el, 'Weight') == null ? undefined : num(attr(el, 'Weight'), 400),
    italic: attr(el, 'Italic') === 'true',
    glyphs,
    text,
  };
}

function parsePath(el: Element, resources: PageResources, layerParam?: DrawParamResource): PageItem {
  const data = firstByLocalName(el, 'AbbreviatedData')?.textContent ?? '';
  const strokeEl = directChild(el, 'StrokeColor');
  const fillEl = directChild(el, 'FillColor');
  const lineWidth = attr(el, 'LineWidth');
  // DrawParam 可以写在对象上，也可以被所在 Layer 继承
  const drawParam = drawParamOf(el, resources) ?? layerParam;
  const strokeAttr = attr(el, 'Stroke');
  const fillAttr = attr(el, 'Fill');
  const strokeColor = resolveColor(colorSpecOf(strokeEl) ?? drawParam?.stroke, resources);
  const fillColor = resolveColor(colorSpecOf(fillEl) ?? drawParam?.fill, resources);
  // 规范默认 false，但发票模板普遍省略属性、只给颜色，按「有颜色即绘制」推断
  let strokeOn = strokeAttr === 'true' || (strokeAttr == null && strokeColor != null);
  let fillOn = fillAttr === 'true' || (fillAttr == null && fillColor != null);
  // 既没属性也没颜色（如发票里 ⊗ 符号的路径）：按描边绘制，否则整块图形消失
  if (strokeAttr == null && fillAttr == null && !strokeEl && !fillEl) {
    strokeOn = true;
    fillOn = false;
  }
  return {
    kind: 'path',
    boundary: parseBoundary(attr(el, 'Boundary')),
    ctm: parseCtm(attr(el, 'CTM')),
    d: abbreviatedToSvgPath(data),
    // 属性优先，其次 DrawParam 资源，最后按规范默认 1mm
    lineWidth: lineWidth == null ? drawParam?.lineWidth ?? 1 : num(lineWidth, 1),
    stroke: strokeOn ? strokeColor ?? BLACK : undefined,
    fill: fillOn ? fillColor ?? BLACK : undefined,
    rule: attr(el, 'FillRule') === 'evenodd' ? 'evenodd' : 'nonzero',
  };
}

function parseImage(el: Element, resources: PageResources): PageItem {
  const resId = attr(el, 'ResourceID') ?? '';
  const resource = resources.images.get(resId);
  return {
    kind: 'image',
    boundary: parseBoundary(attr(el, 'Boundary')),
    ctm: parseCtm(attr(el, 'CTM')),
    resId,
    mime: resource?.mime ?? '',
    format: resource?.format,
    width: 0,
    height: 0,
  };
}

function translateItem(item: PageItem, dx: number, dy: number): PageItem {
  return {
    ...item,
    boundary: [item.boundary[0] + dx, item.boundary[1] + dy, item.boundary[2], item.boundary[3]],
  } as PageItem;
}

/** 复合对象：ResourceID 指向 <ofd:CompositeObjects> 里的容器，容器内部是独立的 Layer 结构 */
function parseComposite(el: Element, resources: PageResources): PageItem[] {
  const id = attr(el, 'ResourceID') ?? '';
  const xml = resources.composites?.get(id);
  if (!xml) return [];
  let inner: Document;
  try {
    inner = parseXml(xml, 'CompositeObject' + id);
  } catch {
    return [];
  }
  const children = collectItems(inner.documentElement, resources);
  const [bx, by] = parseBoundary(attr(el, 'Boundary'));
  return bx || by ? children.map((item) => translateItem(item, bx, by)) : children;
}

function collectItems(root: Element, resources: PageResources): PageItem[] {
  const items: PageItem[] = [];
  for (const layer of allByLocalName(root, 'Layer')) {
    const layerParam = drawParamOf(layer, resources);
    for (let i = 0; i < layer.children.length; i++) {
      const child = layer.children[i];
      if (child.localName === 'TextObject') items.push(parseText(child, resources));
      else if (child.localName === 'PathObject') items.push(parsePath(child, resources, layerParam));
      else if (child.localName === 'ImageObject') items.push(parseImage(child, resources));
      else if (child.localName === 'CompositeObject') items.push(...parseComposite(child, resources));
    }
  }
  return items;
}

export function parsePage(
  source: string,
  index: number,
  resources: PageResources,
  fallback?: PageSize,
  contentLoc = '',
): Page {
  const doc = parseXml(source, `Content.xml(第 ${index + 1} 页)`);
  const root = doc.documentElement;

  const box = nums(firstByLocalName(root, 'PhysicalBox')?.textContent ?? '');
  const width = box[2] ?? fallback?.width ?? 210;
  const height = box[3] ?? fallback?.height ?? 297;

  // Document 级 PublicRes/DocumentRes 与页面级 Resources/PublicRes 合并，页面级覆盖同名 ID
  const ctx = resources.document;
  mergePageResources(doc, contentLoc, resources, ctx?.reader, ctx?.docRoot);

  const background: PageItem[] = [];
  const foreground: PageItem[] = [];
  // mergePageResources 会重建 resources.document，这里必须重新取，否则拿不到 templates
  const docCtx = resources.document;
  for (const template of allByLocalName(root, 'Template')) {
    const templateId = attr(template, 'TemplateID');
    const loc = templateId ? docCtx?.templates?.get(templateId) : undefined;
    if (!loc || !docCtx?.reader.has(loc)) continue;
    try {
      const templateDoc = parseXml(docCtx.reader.readText(loc), 'TemplatePage' + templateId);
      mergePageResources(templateDoc, loc, resources, docCtx.reader, docCtx.docRoot);
      const templateItems = collectItems(templateDoc.documentElement, resources);
      if (attr(template, 'ZOrder') === 'Foreground') foreground.push(...templateItems);
      else background.push(...templateItems);
    } catch (error) {
      console.warn('[ofdh5] 模板页解析失败:', templateId, error);
    }
  }

  const items = [...background, ...collectItems(root, resources), ...foreground];
  return { index, width, height, items };
}

export { abbreviatedToSvgPath };
