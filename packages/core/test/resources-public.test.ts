import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { OfdZip } from '../src/zip';
import { parsePage } from '../src/parser/content';
import { bindResourceSource, loadResources } from '../src/parser/resources';
import { parseColor } from '../src/parser/color';
import { parseOfdPackage } from '../src/parser/package';
import { parseDocumentMeta } from '../src/parser/document';
import { createResources } from '../src/types';
import type { OfdError } from '../src/errors';

function loadFixture(name: string, docRoot = 'Doc_0/Document.xml') {
  const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name))));
  const meta = parseDocumentMeta(zip.readText(docRoot), docRoot);
  const resources = bindResourceSource(createResources(), zip, docRoot);
  return { zip, meta, resources };
}

function zipOf(files: Record<string, string | Uint8Array>): OfdZip {
  const entries: Record<string, Uint8Array> = {};
  for (const [path, value] of Object.entries(files)) {
    entries[path] = typeof value === 'string' ? strToU8(value) : value;
  }
  return new OfdZip(zipSync(entries));
}

const OFD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" DocType="OFD" Version="1.1">
  <ofd:DocBody>
    <ofd:DocInfo><ofd:DocID>t</ofd:DocID><ofd:Creator>t</ofd:Creator></ofd:DocInfo>
    <ofd:DocRoot>Doc_0/Document.xml</ofd:DocRoot>
  </ofd:DocBody>
</ofd:OFD>`;

describe('Document 级 PublicRes（BaseLoc 独立 Res.xml）', () => {
  it('字体 / 图片 / ColorSpace / DrawParam 全部进入资源表', () => {
    const { zip, meta, resources } = loadFixture('publicres.ofd');
    const loc = meta.pages[0].loc;
    parsePage(zip.readText(loc), 0, resources, undefined, loc);

    expect(resources.fonts.get('9')).toEqual({
      id: '9',
      name: 'SimSun',
      family: '宋体',
      file: 'Doc_0/Res/Font_9.ttf',
    });

    const image = resources.images.get('50')!;
    expect(image.file).toBe('Doc_0/Res/logo.png');
    expect(image.mime).toBe('image/png');
    expect(zip.has(image.file)).toBe(true);

    expect(resources.colorSpaces!.get('10')).toEqual({ id: '10', type: 'RGB', bitsPerComponent: 8 });

    const drawParam = resources.drawParams!.get('20')!;
    expect(drawParam.lineWidth).toBe(0.8);
    expect(drawParam.stroke).toEqual({ value: '0 0 255', colorSpace: '10' });
    expect(drawParam.fill).toEqual({ value: '0 255 0', colorSpace: '10' });
  });

  it('PathObject 从 DrawParam 取到 LineWidth，颜色按 ColorSpace 解释', () => {
    const { zip, meta, resources } = loadFixture('publicres.ofd');
    const loc = meta.pages[0].loc;
    const page = parsePage(zip.readText(loc), 0, resources, undefined, loc);

    const path = page.items.find((item) => item.kind === 'path');
    expect(path?.kind).toBe('path');
    if (path?.kind !== 'path') return;
    // PathObject 没有 LineWidth 属性，取自 DrawParam="20"
    expect(path.lineWidth).toBe(0.8);
    // DrawParam 的描边色（RGB 蓝）
    expect(path.stroke).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    // 页面 FillColor ColorSpace="10" Value="255 0 0" → RGB 红
    expect(path.fill).toEqual({ r: 255, g: 0, b: 0, a: 1 });

    const text = page.items.find((item) => item.kind === 'text');
    expect(text?.kind).toBe('text');
    if (text?.kind !== 'text') return;
    expect(text.fontRef).toBe('9');
    expect(text.text).toBe('发票');
  });

  it('页面属性优先于 DrawParam', () => {
    const { zip, meta, resources } = loadFixture('publicres.ofd');
    const loc = meta.pages[0].loc;
    const source = zip
      .readText(loc)
      .replace('DrawParam="20" Stroke="true"', 'DrawParam="20" LineWidth="2" Stroke="true"');
    const page = parsePage(source, 0, resources, undefined, loc);
    const path = page.items.find((item) => item.kind === 'path');
    if (path?.kind !== 'path') throw new Error('expect path');
    expect(path.lineWidth).toBe(2);
  });

  it('loadResources 直接解析页面资源', () => {
    const { zip, meta } = loadFixture('publicres.ofd');
    const loc = meta.pages[0].loc;
    const resources = loadResources(zip, 'Doc_0/Document.xml', loc, zip.readText(loc));
    expect(resources.images.has('50')).toBe(true);
    expect(resources.drawParams!.has('20')).toBe(true);
  });
});

describe('页面级 PublicRes（BaseLoc）', () => {
  const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:CommonData>
    <ofd:PageArea><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:PageArea>
    <ofd:PublicRes>
      <ofd:Fonts><ofd:Font ID="1" FontName="DocFont" FamilyName="Doc"/></ofd:Fonts>
      <ofd:ColorSpaces><ofd:ColorSpace ID="30" Type="GRAY" BitsPerComponent="8"/></ofd:ColorSpaces>
    </ofd:PublicRes>
  </ofd:CommonData>
  <ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/></ofd:Pages>
</ofd:Document>`;

  const CONTENT = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:PathObject ID="2" Boundary="0 0 10 10" Stroke="true" Fill="true">
      <ofd:AbbreviatedData>M 0 0 L 10 0</ofd:AbbreviatedData>
      <ofd:FillColor ColorSpace="30" Value="0.5"/>
      <ofd:StrokeColor ColorSpace="30" Value="255"/>
    </ofd:PathObject>
  </ofd:Layer></ofd:Content>
  <ofd:PublicRes BaseLoc="Res.xml"/>
</ofd:Page>`;

  const PAGE_RES = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Fonts><ofd:Font ID="1" FontName="PageFont" FamilyName="Page"/></ofd:Fonts>
</ofd:Res>`;

  it('页面 PublicRes 与文档 PublicRes 合并，页面级覆盖同名 ID', () => {
    const zip = zipOf({
      'OFD.xml': OFD_XML,
      'Doc_0/Document.xml': DOCUMENT,
      'Doc_0/Pages/Page_0/Content.xml': CONTENT,
      'Doc_0/Pages/Page_0/Res.xml': PAGE_RES,
    });
    const meta = parseDocumentMeta(zip.readText('Doc_0/Document.xml'), 'Doc_0/Document.xml');
    const resources = bindResourceSource(createResources(), zip, 'Doc_0/Document.xml');
    const loc = meta.pages[0].loc;
    const page = parsePage(zip.readText(loc), 0, resources, undefined, loc);

    expect(resources.fonts.get('1')!.name).toBe('PageFont');
    expect(resources.colorSpaces!.get('30')!.type).toBe('GRAY');

    const path = page.items[0];
    if (path.kind !== 'path') throw new Error('expect path');
    // GRAY 单分量：0.5 → 128，255 → 255
    expect(path.fill).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(path.stroke).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(path.lineWidth).toBe(1);
  });

  it('页面 PublicRes BaseLoc 文件缺失时抛 E_NO_ENTRY 且信息可读', () => {
    const zip = zipOf({
      'OFD.xml': OFD_XML,
      'Doc_0/Document.xml': DOCUMENT,
      'Doc_0/Pages/Page_0/Content.xml': CONTENT.replace('BaseLoc="Res.xml"', 'BaseLoc="./Missing.xml"'),
    });
    const meta = parseDocumentMeta(zip.readText('Doc_0/Document.xml'), 'Doc_0/Document.xml');
    const resources = bindResourceSource(createResources(), zip, 'Doc_0/Document.xml');
    const loc = meta.pages[0].loc;

    let error: OfdError | null = null;
    try {
      parsePage(zip.readText(loc), 0, resources, undefined, loc);
    } catch (e) {
      error = e as OfdError;
    }
    expect(error?.code).toBe('E_NO_ENTRY');
    expect(error?.message).toContain('Doc_0/Pages/Page_0/Missing.xml');
    expect(error?.message).toContain('PublicRes');
  });

  it('Document.xml 的 PublicRes BaseLoc 文件缺失时抛 E_NO_ENTRY', () => {
    const zip = zipOf({
      'OFD.xml': OFD_XML,
      'Doc_0/Document.xml': DOCUMENT.replace('<ofd:PublicRes>', '<ofd:PublicRes BaseLoc="Missing.xml">'),
      'Doc_0/Pages/Page_0/Content.xml': CONTENT,
    });
    const meta = parseDocumentMeta(zip.readText('Doc_0/Document.xml'), 'Doc_0/Document.xml');
    const resources = bindResourceSource(createResources(), zip, 'Doc_0/Document.xml');
    const loc = meta.pages[0].loc;

    let error: OfdError | null = null;
    try {
      parsePage(zip.readText(loc), 0, resources, undefined, loc);
    } catch (e) {
      error = e as OfdError;
    }
    expect(error?.code).toBe('E_NO_ENTRY');
    expect(error?.message).toContain('Doc_0/Missing.xml');
    expect(error?.message).toContain('Document.xml');
  });
});

describe('电子发票常见的 PublicRes 写法', () => {
  // <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>：元素文本即文件路径
  // <ofd:Res BaseLoc="Res">：资源文件内的相对路径基准目录
  const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Document xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:CommonData>
    <ofd:PageArea><ofd:PhysicalBox>0 0 0 0</ofd:PhysicalBox></ofd:PageArea>
    <ofd:DocumentRes>DocumentRes.xml</ofd:DocumentRes>
    <ofd:PublicRes>PublicRes.xml</ofd:PublicRes>
  </ofd:CommonData>
  <ofd:Pages><ofd:Page ID="1" BaseLoc="Pages/Page_0/Content.xml"/></ofd:Pages>
</ofd:Document>`;

  it('文本形式引用 + Res 的 BaseLoc 目录都生效', () => {
    const zip = zipOf({
      'OFD.xml': OFD_XML,
      'Doc_0/Document.xml': DOCUMENT,
      'Doc_0/PublicRes.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
  <ofd:ColorSpaces><ofd:ColorSpace ID="5" Type="RGB" BitsPerComponent="8"/></ofd:ColorSpaces>
  <ofd:Fonts><ofd:Font ID="29" FontName="楷体" FamilyName="楷体"/></ofd:Fonts>
</ofd:Res>`,
      'Doc_0/DocumentRes.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Res xmlns:ofd="http://www.ofdspec.org/2016" BaseLoc="Res">
  <ofd:DrawParams>
    <ofd:DrawParam ID="4" LineWidth="0.25">
      <ofd:FillColor Value="156 82 35" ColorSpace="5"/>
    </ofd:DrawParam>
  </ofd:DrawParams>
  <ofd:MultiMedias><ofd:MultiMedia ID="78" Type="Image" Format="GBIG2"><ofd:MediaFile>image_78.jb2</ofd:MediaFile></ofd:MultiMedia></ofd:MultiMedias>
</ofd:Res>`,
      'Doc_0/Pages/Page_0/Content.xml': `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 140</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="60">
    <ofd:PathObject ID="2" Boundary="0 0 10 10" DrawParam="4" Stroke="true" Fill="true">
      <ofd:AbbreviatedData>M 0 0 L 10 0</ofd:AbbreviatedData>
    </ofd:PathObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`,
      'Doc_0/Res/image_78.jb2': new Uint8Array([0x97, 0x4a, 0x42, 0x32]),
    });

    const meta = parseDocumentMeta(zip.readText('Doc_0/Document.xml'), 'Doc_0/Document.xml');
    const resources = bindResourceSource(createResources(), zip, 'Doc_0/Document.xml');
    const loc = meta.pages[0].loc;
    const page = parsePage(zip.readText(loc), 0, resources, undefined, loc);

    expect(resources.fonts.get('29')!.family).toBe('楷体');
    expect(resources.colorSpaces!.get('5')!.type).toBe('RGB');
    expect(resources.drawParams!.get('4')!.lineWidth).toBe(0.25);
    // BaseLoc="Res" 目录 + MediaFile，且文件确实在包里
    expect(resources.images.get('78')!.file).toBe('Doc_0/Res/image_78.jb2');
    expect(zip.has(resources.images.get('78')!.file)).toBe(true);

    const path = page.items[0];
    if (path.kind !== 'path') throw new Error('expect path');
    expect(path.fill).toEqual({ r: 156, g: 82, b: 35, a: 1 });
    expect(path.lineWidth).toBe(0.25);
  });
});

describe('ColorSpace 分量解释', () => {
  it('RGB 三分量按 0-255 解释', () => {
    expect(parseColor('255 0 0', undefined, 'RGB')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('GRAY 只取单分量', () => {
    expect(parseColor('0.5', undefined, 'GRAY')).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it('CMYK 按 0-255 解释（与启发式 0-100 区分）', () => {
    const color = parseColor('128 0 0 0', undefined, 'CMYK')!;
    expect(color.r).toBe(127);
    expect(color.g).toBe(255);
    expect(color.b).toBe(255);
    // 未指定 ColorSpace 时退回旧启发式
    expect(parseColor('128 0 0 0')!.r).toBe(0);
  });

  it('colorSpace 兼容小写与未知值', () => {
    expect(parseColor('0 0 255', undefined, 'rgb')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
    expect(parseColor('0 0 255', undefined, 'Pattern')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
  });
});
