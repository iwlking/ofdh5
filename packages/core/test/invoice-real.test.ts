import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// 真实发票属于本地测试数据，不入库；缺失时跳过相关用例
const INVOICE_FIXTURE = resolve(__dirname, 'fixtures', 'invoice.ofd');
const hasInvoice = existsSync(INVOICE_FIXTURE);

import { OfdZip } from '../src/zip';
import { parseOfdPackage } from '../src/parser/package';
import { parseDocumentMeta } from '../src/parser/document';
import { parsePage } from '../src/parser/content';
import { bindResourceSource } from '../src/parser/resources';
import { createResources } from '../src/types';

function loadInvoice() {
  const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
  const pkg = parseOfdPackage(zip.readText('OFD.xml'));
  const docRoot = pkg.docRoots[0];
  const meta = parseDocumentMeta(zip.readText(docRoot), docRoot);
  const resources = bindResourceSource(createResources(), zip, docRoot);
  return { zip, meta, resources, docRoot };
}

describe.skipIf(!hasInvoice)('电子发票（真实样例）', () => {
  it('模板页参与渲染，页面对象不再只有正文', () => {
    const { zip, meta, resources } = loadInvoice();
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);

    expect(page.width).toBe(210);
    expect(page.height).toBe(140);

    const paths = page.items.filter((item) => item.kind === 'path');
    const texts = page.items.filter((item) => item.kind === 'text');
    // 模板页 22 路径 + 31 文本，页面自身 1 路径 + 30 文本 + 1 图片
    expect(page.items.length).toBeGreaterThan(80);
    expect(paths.length).toBeGreaterThanOrEqual(20);
    expect(texts.length).toBeGreaterThan(55);
  });

  it('模板页的发票标题被解析出来，且在背景层', () => {
    const { zip, meta, resources } = loadInvoice();
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);
    const allText = page.items
      .filter((item) => item.kind === 'text')
      .map((item) => (item as { text: string }).text)
      .join('|');
    expect(allText).toContain('发票');
  });

  it('DeltaX 的 g 语法被展开，字符不再重叠', () => {
    const { zip, meta, resources } = loadInvoice();
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);
    const title = page.items.find(
      (item) => item.kind === 'text' && (item as { text: string }).text.includes('发票'),
    ) as { glyphs: Array<{ x: number }>; text: string } | undefined;
    expect(title).toBeDefined();
    const xs = title!.glyphs.map((g) => g.x);
    expect(xs.length).toBe(title!.text.length);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    }
  });

  it('缺 Stroke/Fill 属性但带颜色的路径仍然绘制', () => {
    const { zip, meta, resources } = loadInvoice();
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);
    const stroked = page.items.filter((item) => item.kind === 'path' && (item as { stroke?: unknown }).stroke);
    expect(stroked.length).toBeGreaterThanOrEqual(20);
  });
});

describe.skipIf(!hasInvoice)('发票正文行位置（回归：末字回落行首）', () => {
  it('单位信息行 14 个字按 3.175mm 步进排开，末字落在行尾', () => {
    const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
    const pkg = parseOfdPackage(zip.readText('OFD.xml'));
    const docRoot = pkg.docRoots[0];
    const meta = parseDocumentMeta(zip.readText(docRoot), docRoot);
    const resources = bindResourceSource(createResources(), zip, docRoot);
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);

    const line = page.items.find(
      (item) => item.kind === 'text' && (item as { text: string }).text === '广州恒裕酒店管理股份有限公司',
    ) as { glyphs: Array<{ x: number }> } | undefined;
    expect(line).toBeDefined();

    const xs = line!.glyphs.map((g) => g.x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBeCloseTo(13 * 3.175, 3);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it('纳税人识别号 18 个字符按 2.54mm 步进，末字不重叠首字', () => {
    const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
    const pkg = parseOfdPackage(zip.readText('OFD.xml'));
    const docRoot = pkg.docRoots[0];
    const meta = parseDocumentMeta(zip.readText(docRoot), docRoot);
    const resources = bindResourceSource(createResources(), zip, docRoot);
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);

    const line = page.items.find(
      (item) => item.kind === 'text' && (item as { text: string }).text === '91440101MA5CTB0W7Y',
    ) as { glyphs: Array<{ x: number }> } | undefined;
    expect(line).toBeDefined();

    const xs = line!.glyphs.map((g) => g.x);
    expect(xs[0]).toBe(0);
    expect(xs[xs.length - 1]).toBeCloseTo(17 * 2.54, 3);
  });
});


describe.skipIf(!hasInvoice)('发票符号（⊗ 价税合计前缀）', () => {
  it('无 Stroke/Fill 属性也无颜色的路径按描边绘制，并继承 Layer 的 DrawParam 颜色', () => {
    const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
    const pkg = parseOfdPackage(zip.readText('OFD.xml'));
    const docRoot = pkg.docRoots[0];
    const meta = parseDocumentMeta(zip.readText(docRoot), docRoot);
    const resources = bindResourceSource(createResources(), zip, docRoot);
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);

    const symbol = page.items.find(
      (item) => item.kind === 'path' && Math.abs(item.boundary[0] - 57.5) < 0.01 && Math.abs(item.boundary[1] - 97.8) < 0.01,
    ) as { stroke?: { r: number; g: number; b: number }; fill?: unknown; d: string } | undefined;

    expect(symbol).toBeDefined();
    expect(symbol!.stroke).toBeDefined();
    expect(symbol!.fill).toBeUndefined();
    expect(symbol!.d).toContain('M');
    expect(symbol!.d.split('M').length).toBeGreaterThanOrEqual(4);
  });
});

