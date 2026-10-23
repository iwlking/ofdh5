import type { PageResources } from '../types';
import { resolvePath } from '../zip';
import { allByLocalName, attr, firstByLocalName, parseXml } from './xml';

function mimeOf(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'application/octet-stream';
}

export function parseResourcesXml(source: string, baseLoc: string, resources: PageResources): PageResources {
  const doc = parseXml(source, 'Resources');
  const root = doc.documentElement;

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
    resources.images.set(id, { id, file: resolved, mime: mimeOf(resolved) });
  }

  return resources;
}

/** 从 Content.xml 或 Res.xml 文本中解析资源 */
export function parseResources(source: string, baseLoc: string, resources: PageResources): PageResources {
  return parseResourcesXml(source, baseLoc, resources);
}
