import { OfdError } from '../errors';
import type {
  ColorSpec,
  ColorSpaceResource,
  DrawParamResource,
  PageResources,
  ResourceReader,
} from '../types';
import { createResources } from '../types';
import { resolvePath } from '../zip';
import { allByLocalName, attr, directChild, firstByLocalName, num, parseXml } from './xml';

function mimeOf(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.jb2') || lower.endsWith('.jbig2')) return 'image/jbig2';
  return 'application/octet-stream';
}

function serialize(element: Element): string {
  return new XMLSerializer().serializeToString(element);
}

function colorSpacesOf(resources: PageResources): Map<string, ColorSpaceResource> {
  if (!resources.colorSpaces) resources.colorSpaces = new Map<string, ColorSpaceResource>();
  return resources.colorSpaces;
}

function drawParamsOf(resources: PageResources): Map<string, DrawParamResource> {
  if (!resources.drawParams) resources.drawParams = new Map<string, DrawParamResource>();
  return resources.drawParams;
}

function compositesOf(resources: PageResources): Map<string, string> {
  if (!resources.composites) resources.composites = new Map<string, string>();
  return resources.composites;
}

/** 读取 DrawParam / 颜色的子元素形式：<ofd:StrokeColor Value ColorSpace Alpha/> */
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

/** 读取属性形式：DrawParam StrokeColor="255 0 0" */
function colorSpecAttr(element: Element, name: string): ColorSpec | undefined {
  const value = attr(element, name);
  if (value == null || !value.trim()) return undefined;
  return { value };
}

export function parseResourcesXml(source: string, baseLoc: string, resources: PageResources): PageResources {
  const doc = parseXml(source, 'Resources');
  const root = doc.documentElement;
  // <ofd:Res BaseLoc="Res"> 表示资源文件内的相对路径基准目录
  const dir = attr(root, 'BaseLoc');
  // resolvePath 以「文件路径」为基准，这里补上结尾的 / 表明是目录
  if (dir && root.children.length > 0) baseLoc = `${resolvePath(baseLoc, `${dir.replace(/\/+$/, '')}/`)}/`;

  for (const font of allByLocalName(root, 'Font')) {
    const id = attr(font, 'ID');
    if (!id) continue;
    const fileEl = firstByLocalName(font, 'FontFile');
    const file = fileEl?.textContent?.trim();
    resources.fonts.set(id, {
      id,
      name: attr(font, 'FontName') ?? '',
      family: attr(font, 'FamilyName') ?? attr(font, 'FontName') ?? '',
      file: file ? resolvePath(baseLoc, file) : undefined,
    });
  }

  for (const media of allByLocalName(root, 'MultiMedia')) {
    const id = attr(media, 'ID');
    const file = firstByLocalName(media, 'MediaFile')?.textContent?.trim();
    if (!id || !file) continue;
    const resolved = resolvePath(baseLoc, file);
    const format = attr(media, 'Format');
    resources.images.set(id, {
      id,
      file: resolved,
      mime: mimeOf(resolved),
      format: format == null ? undefined : format.trim().toUpperCase(),
    });
  }

  for (const colorSpace of allByLocalName(root, 'ColorSpace')) {
    const id = attr(colorSpace, 'ID');
    if (!id) continue;
    const bits = attr(colorSpace, 'BitsPerComponent');
    colorSpacesOf(resources).set(id, {
      id,
      type: (attr(colorSpace, 'Type') ?? '').trim().toUpperCase(),
      bitsPerComponent: bits == null ? undefined : num(bits),
    });
  }

  for (const drawParam of allByLocalName(root, 'DrawParam')) {
    const id = attr(drawParam, 'ID');
    if (!id) continue;
    const lineWidth = attr(drawParam, 'LineWidth');
    drawParamsOf(resources).set(id, {
      id,
      lineWidth: lineWidth == null ? undefined : num(lineWidth),
      stroke: colorSpecOf(directChild(drawParam, 'StrokeColor')) ?? colorSpecAttr(drawParam, 'StrokeColor'),
      fill: colorSpecOf(directChild(drawParam, 'FillColor')) ?? colorSpecAttr(drawParam, 'FillColor'),
    });
  }

  for (const composite of allByLocalName(root, 'CompositeObject')) {
    const id = attr(composite, 'ID');
    if (!id) continue;
    compositesOf(resources).set(id, serialize(composite));
  }

  return resources;
}

/** 从 Content.xml 或 Res.xml 文本中解析资源 */
export function parseResources(source: string, baseLoc: string, resources: PageResources): PageResources {
  return parseResourcesXml(source, baseLoc, resources);
}

/** 绑定 OFD 包上下文，parsePage 据此加载 Document.xml 的 CommonData/PublicRes */
export function bindResourceSource(
  resources: PageResources,
  reader: ResourceReader,
  docRoot: string,
): PageResources {
  resources.document = { reader, docRoot, loaded: false };
  return resources;
}

/**
 * 资源容器 <ofd:PublicRes>/<ofd:DocumentRes>/<ofd:Resources> 的三种写法：
 * 1) 内联资源（含 Fonts/MultiMedias 等子元素）
 * 2) BaseLoc="Res.xml" 空元素引用
 * 3) 元素文本即文件路径，例如 <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>（电子发票常见）
 */
function loadResourceContainer(
  element: Element,
  baseLoc: string,
  resources: PageResources,
  label: string,
  reader?: ResourceReader,
): void {
  const empty = element.children.length === 0;
  const textRef = empty ? (element.textContent ?? '').trim() : '';
  const ref = attr(element, 'BaseLoc') ?? (textRef || undefined);
  if (!ref) {
    parseResourcesXml(serialize(element), baseLoc, resources);
    return;
  }
  const file = resolvePath(baseLoc, ref);
  const where = `${label} 的 ${element.localName} 引用 "${ref}"`;
  if (!reader) {
    throw new OfdError('E_NO_ENTRY', `${where} 无法加载：未绑定 OFD 包上下文，缺少 ${file}`);
  }
  if (!reader.has(file)) {
    throw new OfdError('E_NO_ENTRY', `${where} 指向的资源文件不存在：${file}`);
  }
  parseResourcesXml(reader.readText(file), file, resources);
}

/** Document.xml 级资源：CommonData/PublicRes（内联或 BaseLoc）与 DocumentRes，只解析一次 */
function loadDocumentResources(reader: ResourceReader, docRoot: string, resources: PageResources): void {
  const ctx = resources.document;
  if (ctx && ctx.loaded && ctx.reader === reader && ctx.docRoot === docRoot) return;
  if (!reader.has(docRoot)) return;

  const doc = parseXml(reader.readText(docRoot), 'Document.xml');
  for (const element of allByLocalName(doc, 'PublicRes')) {
    loadResourceContainer(element, docRoot, resources, 'Document.xml', reader);
  }
  for (const element of allByLocalName(doc, 'DocumentRes')) {
    loadResourceContainer(element, docRoot, resources, 'Document.xml', reader);
  }

  // 模板页：<ofd:TemplatePage ID="2" BaseLoc="Tpls/Tpl_0/Content.xml"/>，相对 Document.xml 所在目录
  const templates = new Map<string, string>();
  for (const element of allByLocalName(doc, 'TemplatePage')) {
    const id = attr(element, 'ID');
    const baseLoc = attr(element, 'BaseLoc');
    if (id && baseLoc) templates.set(id, resolvePath(docRoot, baseLoc));
  }

  resources.document = { reader, docRoot, loaded: true, templates };
}

/**
 * 合并资源：先 Document 级 PublicRes/DocumentRes，再页面级 Resources/PublicRes（页面级覆盖同名 ID）。
 */
export function mergePageResources(
  page: Document,
  pageContentLoc: string,
  resources: PageResources,
  reader?: ResourceReader,
  docRoot?: string,
): PageResources {
  if (reader && docRoot) loadDocumentResources(reader, docRoot, resources);

  const root = page.documentElement;
  const label = `页面 ${pageContentLoc || 'Content.xml'}`;
  for (const element of allByLocalName(root, 'PublicRes')) {
    loadResourceContainer(element, pageContentLoc, resources, label, reader);
  }
  for (const element of allByLocalName(root, 'Resources')) {
    loadResourceContainer(element, pageContentLoc, resources, label, reader);
  }
  return resources;
}

/** 完整解析一个页面的资源（不含页面对象），供外部直接调用 */
export function loadResources(
  zip: ResourceReader,
  docRoot: string,
  pageContentLoc: string,
  pageXml: string,
  resources: PageResources = createResources(),
): PageResources {
  const page = parseXml(pageXml, `Content.xml(${pageContentLoc || '页面'})`);
  return mergePageResources(page, pageContentLoc, resources, zip, docRoot);
}
