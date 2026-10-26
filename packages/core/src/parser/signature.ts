import { unzipSync } from 'fflate';
import { OfdZip, resolvePath } from '../zip';
import { createResources, type Page, type ResourceReader } from '../types';
import { parseDocumentMeta } from './document';
import { parseOfdPackage } from './package';
import { parsePage } from './content';
import { bindResourceSource } from './resources';
import { allByLocalName, attr, firstByLocalName, parseXml } from './xml';

/** PK\x03\x04 */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function matchMagic(data: Uint8Array, offset: number): boolean {
  if (offset + ZIP_MAGIC.length > data.length) return false;
  for (let i = 0; i < ZIP_MAGIC.length; i++) {
    if (data[offset + i] !== ZIP_MAGIC[i]) return false;
  }
  return true;
}

/** 扫描二进制里所有 ZIP 本地文件头偏移（签名值里通常内嵌一个完整的签章外观包） */
export function findZipOffsets(data: Uint8Array): number[] {
  const offsets: number[] = [];
  const end = data.length - ZIP_MAGIC.length;
  for (let i = 0; i <= end; i++) {
    if (matchMagic(data, i)) offsets.push(i);
  }
  return offsets;
}

/**
 * 从签名值（PKCS#7 SignedValue.dat）里解出内嵌的签章外观包，返回其首页。
 * 从最靠前的 ZIP 魔数开始尝试；解压或解析失败依次尝试下一个候选偏移，全部失败返回 null。
 */
export function parseSealPackage(data: Uint8Array): Page | null {
  if (!data || data.length < ZIP_MAGIC.length) return null;
  for (const offset of findZipOffsets(data)) {
    try {
      const zip = new OfdZip(data.subarray(offset));
      if (!zip.has('OFD.xml')) continue;

      const pkg = parseOfdPackage(zip.readText('OFD.xml'));
      const docRoot = pkg.docRoots[0];
      if (!docRoot || !zip.has(docRoot)) continue;

      const documentXml = zip.readText(docRoot);
      const meta = parseDocumentMeta(documentXml, docRoot);
      const ref = meta.pages[0];
      if (!ref || !zip.has(ref.loc)) continue;

      const resources = bindResourceSource(createResources(), zip, docRoot);
      const page = parsePage(
        zip.readText(ref.loc),
        0,
        resources,
        { width: meta.width, height: meta.height },
        ref.loc,
      );
      if (page.width > 0 && page.height > 0 && page.items.length > 0) return page;
    } catch {
      // 该偏移不是可解析的 OFD 包，换下一个候选
      continue;
    }
  }
  return null;
}

/** Document.xml 里 <ofd:Signatures> 指向的索引；缺失时退到规范约定的 Signs/Signatures.xml */
function signatureIndexPath(doc: Document, docRoot: string, reader: ResourceReader): string | null {
  const element = firstByLocalName(doc, 'Signatures');
  const ref = element ? (attr(element, 'BaseLoc') ?? (element.textContent ?? '').trim()) : '';
  if (ref) {
    const path = resolvePath(docRoot, ref);
    if (reader.has(path)) return path;
  }
  const fallback = resolvePath(docRoot, 'Signs/Signatures.xml');
  return reader.has(fallback) ? fallback : null;
}

/** 签名值文件：优先 <ofd:SignedValue>，否则取 Signature.xml 同目录的 SignedValue.dat */
function signedValuePathOf(signatureDoc: Document, signaturePath: string): string | null {
  const ref = firstByLocalName(signatureDoc, 'SignedValue')?.textContent?.trim();
  return ref ? resolvePath(signaturePath, ref) : resolvePath(signaturePath, 'SignedValue.dat');
}

function pageRefOf(signatureDoc: Document): string | undefined {
  return attr(firstByLocalName(signatureDoc, 'StampAnnot'), 'PageRef') ?? undefined;
}

/**
 * 解析 Signs/Signatures.xml → 每个签名的签章外观页，按「外层文档 Page ID」分组。
 * 任何不认识的结构都跳过，不向上抛异常。
 */
/** 签章外观页 + 它在页面上的落点（来自 Signature.xml 的 <ofd:StampAnnot Boundary>） */
export interface SealPackage {
  page: Page;
  boundary?: [number, number, number, number];
}

function stampBoundaryOf(doc: Document): [number, number, number, number] | undefined {
  const element = allByLocalName(doc, 'StampAnnot')[0];
  const parts = (attr(element, 'Boundary') ?? '').trim().split(/\s+/).map(Number).filter(Number.isFinite);
  if (parts.length < 4) return undefined;
  return [parts[0], parts[1], parts[2], parts[3]];
}

export function parseSignatureSeals(
  reader: ResourceReader,
  docRoot: string,
  documentXml: string,
): Map<string, SealPackage[]> {
  const result = new Map<string, SealPackage[]>();
  let indexPath: string | null = null;
  try {
    indexPath = signatureIndexPath(parseXml(documentXml, 'Document.xml'), docRoot, reader);
    if (!indexPath || !reader.has(indexPath)) return result;

    const index = parseXml(reader.readText(indexPath), 'Signatures.xml');
    for (const signature of allByLocalName(index, 'Signature')) {
      const baseLoc = attr(signature, 'BaseLoc');
      if (!baseLoc) continue;
      const signaturePath = resolvePath(indexPath, baseLoc);
      if (!reader.has(signaturePath)) continue;

      try {
        const signatureDoc = parseXml(reader.readText(signaturePath), 'Signature.xml');
        const pageId = pageRefOf(signatureDoc);
        const valuePath = signedValuePathOf(signatureDoc, signaturePath);
        const bytes = valuePath ? reader.read(valuePath) : null;
        const page = bytes ? parseSealPackage(bytes) : null;
        if (!pageId || !page) continue;

        const pages = result.get(pageId) ?? [];
        pages.push({ page, boundary: stampBoundaryOf(signatureDoc) });
        result.set(pageId, pages);
      } catch (error) {
        console.warn('[ofdh5] 签名解析失败，跳过:', signaturePath, error);
      }
    }
  } catch (error) {
    console.warn('[ofdh5] Signatures.xml 解析失败，跳过:', indexPath ?? '(未找到)', error);
  }
  return result;
}
