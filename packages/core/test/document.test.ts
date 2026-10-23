import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOfdPackage } from '../src/parser/package';
import { parseDocumentMeta } from '../src/parser/document';
import { OfdZip } from '../src/zip';

const fixture = (name: string) =>
  new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name))));

describe('parseOfdPackage', () => {
  it('取出 DocRoot', () => {
    const zip = fixture('single-text.ofd');
    const pkg = parseOfdPackage(zip.readText('OFD.xml'));
    expect(pkg.docRoots).toEqual(['Doc_0/Document.xml']);
  });

  it('缺 DocRoot 时抛 E_NO_ENTRY', () => {
    try {
      parseOfdPackage('<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016"/>');
      throw new Error('should throw');
    } catch (e) {
      expect((e as { code: string }).code).toBe('E_NO_ENTRY');
    }
  });
});

describe('parseDocumentMeta', () => {
  it('解析页数与默认页尺寸', () => {
    const zip = fixture('multi-page.ofd');
    const meta = parseDocumentMeta(zip.readText('Doc_0/Document.xml'), 'Doc_0/Document.xml');
    expect(meta.pages).toHaveLength(12);
    expect(meta.width).toBe(210);
    expect(meta.height).toBe(297);
    expect(meta.pages[0]).toEqual({ id: '1', loc: 'Doc_0/Pages/Page_0/Content.xml' });
    expect(meta.pages[11].loc).toBe('Doc_0/Pages/Page_11/Content.xml');
  });

  it('缺 Pages 时抛 E_NO_ENTRY', () => {
    try {
      parseDocumentMeta('<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016"/>', 'Doc_0/Document.xml');
      throw new Error('should throw');
    } catch (e) {
      expect((e as { code: string }).code).toBe('E_NO_ENTRY');
    }
  });
});
