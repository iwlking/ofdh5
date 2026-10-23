import { OfdError } from '../errors';
import { allByLocalName, parseXml } from './xml';

export interface OfdPackageInfo {
  docRoots: string[];
}

export function parseOfdPackage(source: string): OfdPackageInfo {
  const doc = parseXml(source, 'OFD.xml');
  const roots = allByLocalName(doc, 'DocRoot')
    .map((el) => (el.textContent ?? '').trim())
    .filter(Boolean);
  if (roots.length === 0) {
    throw new OfdError('E_NO_ENTRY', 'OFD.xml 中缺少 DocRoot');
  }
  return { docRoots: roots };
}
