import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { OfdZip, normalizePath, resolvePath } from '../src/zip';
import { OfdError } from '../src/errors';

function makeZip(files: Record<string, string>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = strToU8(content);
  return zipSync(entries);
}

describe('路径归一化', () => {
  it('去掉前导斜杠与 . 段', () => {
    expect(normalizePath('/Doc_0//Document.xml')).toBe('Doc_0/Document.xml');
    expect(normalizePath('./a/./b.xml')).toBe('a/b.xml');
  });

  it('解析相对路径', () => {
    expect(resolvePath('Doc_0/Document.xml', 'Pages/Page_0/Content.xml'))
      .toBe('Doc_0/Pages/Page_0/Content.xml');
    expect(resolvePath('Doc_0/Res.xml', './Font_1.ttf')).toBe('Doc_0/Font_1.ttf');
  });
});

describe('OfdZip', () => {
  it('读取文本文件', () => {
    const zip = new OfdZip(makeZip({ 'OFD.xml': '<ofd:OFD/>' }));
    expect(zip.readText('OFD.xml')).toContain('OFD');
    expect(zip.has("ofd.xml")).toBe(true); // 查找不区分大小写
    expect(zip.has('other.xml')).toBe(false);
  });

  it('不是 zip 时抛出 E_NOT_ZIP', () => {
    expect(() => new OfdZip(new Uint8Array([1, 2, 3, 4]))).toThrowError(OfdError);
    try {
      new OfdZip(new Uint8Array([1, 2, 3, 4]));
    } catch (e) {
      expect((e as OfdError).code).toBe('E_NOT_ZIP');
    }
  });

  it('缺文件时 readText 抛出 E_NO_ENTRY', () => {
    const zip = new OfdZip(makeZip({ 'a.xml': 'x' }));
    try {
      zip.readText('b.xml');
    } catch (e) {
      expect((e as OfdError).code).toBe('E_NO_ENTRY');
    }
  });
});
