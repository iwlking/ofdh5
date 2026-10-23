import { OfdError } from '../errors';
import { resolvePath } from '../zip';
import { allByLocalName, attr, firstByLocalName, nums, parseXml } from './xml';

export interface PageRef {
  id: string;
  loc: string;
}

export interface DocumentMeta {
  pages: PageRef[];
  /** mm */
  width: number;
  /** mm */
  height: number;
}

export function parseDocumentMeta(source: string, docRoot: string): DocumentMeta {
  const doc = parseXml(source, 'Document.xml');

  const box = nums(firstByLocalName(doc, 'PhysicalBox')?.textContent ?? '');
  const width = box[2] ?? 210;
  const height = box[3] ?? 297;

  const pageEls = allByLocalName(doc, 'Page');
  if (pageEls.length === 0) {
    throw new OfdError('E_NO_ENTRY', 'Document.xml 中缺少 Pages/Page');
  }

  const pages: PageRef[] = pageEls.map((el, index) => {
    const baseLoc = attr(el, 'BaseLoc');
    if (!baseLoc) {
      throw new OfdError('E_PARSE_XML', `第 ${index + 1} 页缺少 BaseLoc`);
    }
    return {
      id: attr(el, 'ID') ?? String(index + 1),
      loc: resolvePath(docRoot, baseLoc),
    };
  });

  return { pages, width, height };
}
