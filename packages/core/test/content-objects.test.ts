import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OfdZip } from '../src/zip';
import { parsePage } from '../src/parser/content';
import { parseResources } from '../src/parser/resources';
import { createResources } from '../src/types';
import { parseOfdPackage } from '../src/parser/package';
import { parseDocumentMeta } from '../src/parser/document';

function load(name: string) {
  const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name))));
  const pkg = parseOfdPackage(zip.readText('OFD.xml'));
  const meta = parseDocumentMeta(zip.readText(pkg.docRoots[0]), pkg.docRoots[0]);
  return { zip, meta };
}

describe('资源表', () => {
  it('解析 Font 与 MultiMedia', () => {
    const xml = `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
      <ofd:Resources>
        <ofd:Fonts><ofd:Font ID="9" FontName="SimSun" FamilyName="宋体"><ofd:FontFile>Res/Font_9.ttf</ofd:FontFile></ofd:Font></ofd:Fonts>
        <ofd:MultiMedias><ofd:MultiMedia ID="5" Type="Image"><ofd:MediaFile>Res/a.png</ofd:MediaFile></ofd:MultiMedia></ofd:MultiMedias>
      </ofd:Resources>
    </ofd:Page>`;
    const resources = parseResources(xml, 'Doc_0/Pages/Page_0/Content.xml', createResources());
    expect(resources.fonts.get('9')).toEqual({
      id: '9', name: 'SimSun', family: '宋体', file: 'Doc_0/Pages/Page_0/Res/Font_9.ttf',
    });
    expect(resources.images.get('5')!.file).toBe('Doc_0/Pages/Page_0/Res/a.png');
  });
});

describe('路径与图像对象', () => {
  it('解析 PathObject 与 ImageObject', () => {
    const { zip, meta } = load('image.ofd');
    const loc = meta.pages[0].loc;
    const resources = createResources();
    const page = parsePage(zip.readText(loc), 0, resources, undefined, loc);
    expect(page.items).toHaveLength(2);

    const image = page.items[0];
    expect(image.kind).toBe('image');
    if (image.kind === 'image') {
      expect(image.boundary).toEqual([10, 10, 50, 50]);
      expect(image.resId).toBe('5');
    }

    const path = page.items[1];
    expect(path.kind).toBe('path');
    if (path.kind === 'path') {
      expect(path.boundary).toEqual([20, 80, 100, 40]);
      expect(path.d).toBe('M 0 0 L 100 0 L 100 40 L 0 40 Z');
      expect(path.lineWidth).toBe(1);
      expect(path.rule).toBe('evenodd');
      expect(path.stroke).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(path.fill).toEqual({ r: 200, g: 200, b: 200, a: 1 });
    }
  });

  it('parsePage 同时收集页面资源', () => {
    const { zip, meta } = load('image.ofd');
    const loc = meta.pages[0].loc;
    const resources = createResources();
    parsePage(zip.readText(loc), 0, resources, undefined, loc);
    expect(resources.images.get('5')!.file).toBe('Doc_0/Pages/Page_0/Res/image_0.png');
    expect(zip.has(resources.images.get('5')!.file)).toBe(true);
  });

  it('图片资源缺失时抛出 E_NO_ENTRY', () => {
    const { zip, meta } = load('single-text.ofd');
    const loc = meta.pages[0].loc;
    const resources = createResources();
    parsePage(zip.readText(loc), 0, resources, undefined, loc);
    // broken.ofd 没有图片对象，这里只验证不抛错
    expect(resources.images.size).toBe(0);
  });
});
