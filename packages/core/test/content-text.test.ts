import { describe, it, expect } from 'vitest';
import { parsePage } from '../src/parser/content';
import { createResources } from '../src/types';

const PAGE = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:TextObject ID="2" Boundary="20 30 100 10" Font="9" Size="5" CTM="1 0 0 1 0 0" HScale="80" Weight="700">
      <ofd:FillColor Value="255 0 0" Alpha="128"/>
      <ofd:TextCode X="0" Y="5" DeltaX="5 5 5">ABC</ofd:TextCode>
    </ofd:TextObject>
  </ofd:Layer></ofd:Content>
</ofd:Page>`;

describe('parsePage 文本对象', () => {
  it('解析页尺寸与文本项', () => {
    const page = parsePage(PAGE, 0, createResources());
    expect(page.width).toBe(210);
    expect(page.height).toBe(297);
    expect(page.items).toHaveLength(1);

    const text = page.items[0];
    expect(text.kind).toBe('text');
    if (text.kind !== 'text') return;
    expect(text.boundary).toEqual([20, 30, 100, 10]);
    expect(text.size).toBe(5);
    expect(text.fontRef).toBe('9');
    expect(text.hScale).toBe(80);
    expect(text.weight).toBe(700);
    expect(text.text).toBe('ABC');
    expect(text.glyphs.map((g) => g.x)).toEqual([0, 5, 10]);
    expect(text.glyphs.map((g) => g.y)).toEqual([5, 5, 5]);
    expect(text.fill).toEqual({ r: 255, g: 0, b: 0, a: 0.502 });
  });

  it('DeltaX 只有一个值时对所有字符生效', () => {
    const xml = PAGE.replace('DeltaX="5 5 5"', 'DeltaX="4"');
    const text = parsePage(xml, 0, createResources()).items[0];
    if (text.kind !== 'text') throw new Error('expect text');
    expect(text.glyphs.map((g) => g.x)).toEqual([0, 4, 8]);
  });

  it('无 DeltaX 时 deltaX 为 undefined，交由渲染层度量', () => {
    const xml = PAGE.replace(' DeltaX="5 5 5"', '');
    const text = parsePage(xml, 0, createResources()).items[0];
    if (text.kind !== 'text') throw new Error('expect text');
    expect(text.glyphs.every((g) => g.deltaX === undefined)).toBe(true);
  });

  it('支持 Glyph 子元素形式', () => {
    const xml = PAGE.replace(
      '<ofd:TextCode X="0" Y="5" DeltaX="5 5 5">ABC</ofd:TextCode>',
      '<ofd:TextCode><ofd:Glyph Code="65" X="0" Y="5" DeltaX="5"/><ofd:Glyph Code="66" X="5" Y="5" DeltaX="5"/></ofd:TextCode>',
    );
    const text = parsePage(xml, 0, createResources()).items[0];
    if (text.kind !== 'text') throw new Error('expect text');
    expect(text.glyphs).toHaveLength(2);
    expect(text.glyphs[1].x).toBe(5);
    expect(text.glyphs[1].code).toBe(66);
  });

  it('无 Area 时回退到传入的默认尺寸', () => {
    const xml = PAGE.replace('<ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>', '');
    const page = parsePage(xml, 0, createResources(), { width: 100, height: 200 });
    expect(page.width).toBe(100);
    expect(page.height).toBe(200);
  });
});
