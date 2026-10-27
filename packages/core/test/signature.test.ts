import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// 真实发票属于本地测试数据，不入库；缺失时跳过相关用例
const INVOICE_FIXTURE = resolve(__dirname, 'fixtures', 'invoice.ofd');
const hasInvoice = existsSync(INVOICE_FIXTURE);

import { OfdZip } from '../src/zip';
import { parseOfdPackage } from '../src/parser/package';
import { parseAnnotations, stampItems, sealPageItems, transformItem } from '../src/parser/annotations';
import { parseSealPackage, parseSignatureSeals } from '../src/parser/signature';
import { bindResourceSource } from '../src/parser/resources';
import { createResources, type Page } from '../src/types';
import { Ofdh5 } from '../src/ofdh5';

function loadInvoice() {
  const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
  const pkg = parseOfdPackage(zip.readText('OFD.xml'));
  const docRoot = pkg.docRoots[0];
  const documentXml = zip.readText(docRoot);
  const resources = bindResourceSource(createResources(), zip, docRoot);
  return { zip, docRoot, documentXml, resources };
}

describe.skipIf(!hasInvoice)('签名印章（SignatureInFile）', () => {
  it('从 SignedValue.dat 解出 1 个印章页，且包含可绘制对象', () => {
    const { zip, docRoot, documentXml } = loadInvoice();
    const seals = parseSignatureSeals(zip, docRoot, documentXml);

    expect(seals.size).toBe(1);
    const pages = seals.get('1')!;
    expect(pages).toHaveLength(1);

    const page: Page = pages[0].page;
    expect(page.width).toBe(30);
    expect(page.height).toBe(20);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.some((item) => item.kind === 'path' || item.kind === 'image')).toBe(true);
  });

  it('印章按 Signature.xml 的 StampAnnot Boundary 落位', () => {
    const { zip, docRoot, documentXml, resources } = loadInvoice();
    const seals = parseSignatureSeals(zip, docRoot, documentXml);
    const stamps = [...parseAnnotations(zip, docRoot, documentXml).values()].flat();
    const items = stampItems(stamps, resources, seals.get('1'));

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      const [x, y, w, h] = item.boundary;
      expect(x).toBeGreaterThanOrEqual(90 - 1);
      expect(y).toBeGreaterThanOrEqual(8 - 1);
      expect(x + w).toBeLessThanOrEqual(90 + 30 + 1);
      expect(y + h).toBeLessThanOrEqual(8 + 20 + 1);
    }
  });

  it('30×20 的印章页放进 115×20 的外观区：scale=1，水平居中', () => {
    const page: Page = { index: 0, width: 30, height: 20, items: [] };
    const items = sealPageItems(
      { ...page, items: [{ kind: 'path', boundary: [0, 0, 30, 20], d: 'M 0 0 L 30 20', rule: 'nonzero' }] },
      [4.5, 104, 115, 20],
    );
    expect(items).toHaveLength(1);
    expect(items[0].boundary).toEqual([47, 104, 30, 20]);
  });

  it('transformItem 同步缩放字号、字形坐标与 CTM 平移分量', () => {
    const text = transformItem(
      {
        kind: 'text',
        boundary: [1, 2, 3, 4],
        ctm: [1, 0, 0, 1, 2, 3],
        fontRef: '4',
        size: 3,
        glyphs: [{ x: 1.5, y: 2, deltaX: 1, deltaY: 0.5, code: 65 }],
        text: 'A',
      },
      2,
      0,
      0,
    );

    expect(text.boundary).toEqual([2, 4, 6, 8]);
    if (text.kind !== 'text') throw new Error('应为文本对象');
    expect(text.size).toBe(6);
    expect(text.glyphs[0]).toMatchObject({ x: 3, y: 4, deltaX: 2, deltaY: 1 });
    expect(text.ctm).toEqual([1, 0, 0, 1, 4, 6]);
  });

  it('签名值损坏或没有内嵌 ZIP 时返回 null 且不抛异常', () => {
    expect(() => parseSealPackage(new Uint8Array([0, 1, 2, 3]))).not.toThrow();
    expect(parseSealPackage(new Uint8Array([0, 1, 2, 3]))).toBeNull();

    // 有 ZIP 魔数但内容不是合法 zip
    const fake = new Uint8Array(64);
    fake.set([0x50, 0x4b, 0x03, 0x04], 0);
    expect(() => parseSealPackage(fake)).not.toThrow();
    expect(parseSealPackage(fake)).toBeNull();

    // 截断的签名值
    expect(parseSealPackage(new Uint8Array())).toBeNull();
  });

  it('真实发票加载时不会因签名结构异常而失败', async () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
    document.body.appendChild(el);
    const ofd = new Ofdh5(el, {
      data: new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))),
    });
    await (ofd as unknown as { loaded: Promise<void> }).loaded;
    expect(ofd.getStatus().status).toBe('ready');
    expect(ofd.getPageCount()).toBe(1);
    ofd.destroy();
  });
});
