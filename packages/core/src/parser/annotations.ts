import type { ImageItem, Page, PageItem, PageResources, PathItem, TextItem } from '../types';
import type { ResourceReader } from '../types';
import type { SealPackage } from './signature';
import { allByLocalName, attr, directChild, firstByLocalName, nums, parseXml } from './xml';
import { resolvePath } from '../zip';

/** 签章/图章类注释（Annot Type="Stamp"），外观通常是资源里的一张图 */
export interface StampAnnotation {
  id: string;
  subtype?: string;
  boundary: [number, number, number, number];
  resourceId?: string;
}

function parseBoundary(value: string | null): [number, number, number, number] {
  const parts = nums(value);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

/**
 * 解析 Doc_0/Annots/Annotations.xml → 每页的 Stamp 注释。
 * 结构：Document.xml 的 <ofd:Annotations> 指向索引文件，索引里按 PageID 指向各自的 Annotation.xml。
 */
export function parseAnnotations(
  reader: ResourceReader,
  docRoot: string,
  documentXml: string,
): Map<string, StampAnnotation[]> {
  const result = new Map<string, StampAnnotation[]>();
  const doc = parseXml(documentXml, 'Document.xml');
  const indexLoc = firstByLocalName(doc, 'Annotations')?.textContent?.trim();
  if (!indexLoc) return result;

  const indexPath = resolvePath(docRoot, indexLoc);
  if (!reader.has(indexPath)) return result;

  const index = parseXml(reader.readText(indexPath), 'Annotations.xml');
  for (const pageEntry of allByLocalName(index, 'Page')) {
    const pageId = attr(pageEntry, 'PageID');
    const fileLoc = firstByLocalName(pageEntry, 'FileLoc')?.textContent?.trim();
    if (!pageId || !fileLoc) continue;
    const annotPath = resolvePath(indexPath, fileLoc);
    if (!reader.has(annotPath)) continue;

    const annotDoc = parseXml(reader.readText(annotPath), 'Annotation.xml');
    const stamps: StampAnnotation[] = [];
    for (const annot of allByLocalName(annotDoc, 'Annot')) {
      if (attr(annot, 'Type') !== 'Stamp') continue;
      const appearance = directChild(annot, 'Appearance');
      stamps.push({
        id: attr(annot, 'ID') ?? '',
        subtype: attr(annot, 'Subtype') ?? undefined,
        boundary: parseBoundary(attr(appearance, 'Boundary')),
        resourceId: attr(appearance, 'ResourceID') ?? undefined,
      });
    }
    if (stamps.length > 0) result.set(pageId, stamps);
  }
  return result;
}

function isIdentityCtm(ctm: number[]): boolean {
  return ctm[0] === 1 && ctm[1] === 0 && ctm[2] === 0 && ctm[3] === 1 && ctm[4] === 0 && ctm[5] === 0;
}

/**
 * 把印章页的单个对象变换到目标外观区域：等比缩放 + 平移。
 * - text 的字号、字形坐标、Delta 同步缩放；CTM 只缩放平移分量（线性部分保持不变，避免二次缩放）
 * - path/image 的 CTM 整体乘 scale：路径数据相对 boundary 原点，用矩阵承载缩放
 */
export function transformItem(item: PageItem, scale: number, dx: number, dy: number): PageItem {
  const boundary: [number, number, number, number] = [
    item.boundary[0] * scale + dx,
    item.boundary[1] * scale + dy,
    item.boundary[2] * scale,
    item.boundary[3] * scale,
  ];

  if (item.kind === 'text') {
    const text: TextItem = {
      ...item,
      boundary,
      size: item.size * scale,
      glyphs: item.glyphs.map((glyph) => ({
        ...glyph,
        x: glyph.x * scale,
        y: glyph.y * scale,
        deltaX: glyph.deltaX == null ? undefined : glyph.deltaX * scale,
        deltaY: glyph.deltaY == null ? undefined : glyph.deltaY * scale,
      })),
    };
    if (item.ctm && item.ctm.length >= 6) {
      const [a, b, c, d, e, f] = item.ctm;
      text.ctm = [a, b, c, d, e * scale, f * scale];
    }
    return text;
  }

  if (item.kind === 'path') {
    const path: PathItem = { ...item, boundary };
    if (item.ctm && item.ctm.length >= 6) {
      path.ctm = item.ctm.map((value) => value * scale);
    } else {
      path.ctm = [scale, 0, 0, scale, 0, 0];
    }
    return path;
  }

  // image：恒等 CTM 时由 boundary 决定尺寸，不必动 CTM
  const image: ImageItem = { ...item, boundary };
  if (item.ctm && item.ctm.length >= 6 && !isIdentityCtm(item.ctm)) {
    image.ctm = item.ctm.map((value) => value * scale);
  }
  return image;
}

/** 印章页坐标（mm）与 Annot Appearance Boundary（mm）同一量纲：等比缩放后居中 */
export function sealPageItems(
  page: Page,
  boundary: [number, number, number, number],
): PageItem[] {
  const [bx, by, bw, bh] = boundary;
  if (!(bw > 0 && bh > 0 && page.width > 0 && page.height > 0)) return [];
  const scale = Math.min(bw / page.width, bh / page.height);
  if (!Number.isFinite(scale) || scale <= 0) return [];
  const dx = bx + (bw - page.width * scale) / 2;
  const dy = by + (bh - page.height * scale) / 2;
  return page.items.map((item) => transformItem(item, scale, dx, dy));
}

/**
 * 把 Stamp 转成可渲染对象：
 * 1) 外观有 ResourceID → 资源里的图片；
 * 2) 没有 ResourceID 但提供了签名内嵌的印章页（sealPages）→ 变换印章页对象后叠加。
 */
export function stampItems(
  stamps: StampAnnotation[],
  resources: PageResources,
  sealPackages: SealPackage[] = [],
): PageItem[] {
  const items: PageItem[] = [];
  let sealIndex = 0;
  for (const stamp of stamps) {
    if (stamp.resourceId) {
      const resource = resources.images.get(stamp.resourceId);
      if (!resource) continue;
      items.push({
        kind: 'image',
        boundary: stamp.boundary,
        resId: stamp.resourceId,
        mime: resource.mime,
        width: 0,
        height: 0,
      });
      continue;
    }
    const seal = sealPackages[sealIndex++];
    if (!seal) continue;
    // StampAnnot 的 Boundary 才是印章真实落点，Annot/Appearance 的只是热区，优先级更低
    items.push(...sealPageItems(seal.page, seal.boundary ?? stamp.boundary));
  }
  return items;
}
