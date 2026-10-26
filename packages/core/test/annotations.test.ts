import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// 真实发票属于本地测试数据，不入库；缺失时跳过相关用例
const INVOICE_FIXTURE = resolve(__dirname, 'fixtures', 'invoice.ofd');
const hasInvoice = existsSync(INVOICE_FIXTURE);

import { OfdZip } from '../src/zip';
import { parseAnnotations, stampItems } from '../src/parser/annotations';
import { bindResourceSource } from '../src/parser/resources';
import { createResources } from '../src/types';

const FILES: Record<string, string> = {
  'Doc_0/Document.xml':
    '<Document><Annotations>Annots/Annotations.xml</Annotations></Document>',
  'Doc_0/Annots/Annotations.xml':
    '<Annotations><Page PageID="1"><FileLoc>Page_0/Annotation.xml</FileLoc></Page></Annotations>',
  'Doc_0/Annots/Page_0/Annotation.xml':
    '<PageAnnot><Annot Type="Stamp" ID="9" Subtype="Seal"><Appearance Boundary="1 2 30 30" ResourceID="77"/></Annot><Annot Type="Link" ID="10"/></PageAnnot>',
};

function stubReader(files: Record<string, string>) {
  return {
    has: (p: string) => p in files,
    read: (p: string) => null,
    readText: (p: string) => files[p],
  };
}

describe.skipIf(!hasInvoice)('签章注释', () => {
  it('只收集 Stamp 类型，解析外观边界与资源', () => {
    const map = parseAnnotations(stubReader(FILES), 'Doc_0/Document.xml', FILES['Doc_0/Document.xml']);
    const stamps = map.get('1')!;
    expect(stamps).toHaveLength(1);
    expect(stamps[0].boundary).toEqual([1, 2, 30, 30]);
    expect(stamps[0].resourceId).toBe('77');
  });

  it('有资源时生成图片对象', () => {
    const resources = createResources();
    resources.images.set('77', { id: '77', file: 'Doc_0/Res/seal.png', mime: 'image/png' });
    const map = parseAnnotations(stubReader(FILES), 'Doc_0/Document.xml', FILES['Doc_0/Document.xml']);
    const items = stampItems(map.get('1')!, resources);
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe('image');
    expect(items[0].boundary).toEqual([1, 2, 30, 30]);
  });

  it('无索引文件时返回空表', () => {
    const map = parseAnnotations(stubReader({}), 'Doc_0/Document.xml', '<Document/>');
    expect(map.size).toBe(0);
  });

  it('真实发票：Stamp 无外观资源，不产出图片（印章在签名值内）', () => {
    const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
    const docXml = zip.readText('Doc_0/Document.xml');
    const resources = bindResourceSource(createResources(), zip, 'Doc_0/Document.xml');
    const map = parseAnnotations(zip, 'Doc_0/Document.xml', docXml);
    const stamps = [...map.values()].flat();
    expect(stamps).toHaveLength(1);
    expect(stamps[0].subtype).toBe('SignatureInFile');
    expect(stamps[0].resourceId).toBeUndefined();
    expect(stampItems(stamps, resources)).toHaveLength(0);
  });
});
