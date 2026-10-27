import { describe, it, expect } from 'vitest';
import { parsePage } from '../src/parser/content';
import { createResources } from '../src/types';
import { createViewport } from '../src/render/viewport';
import { textRunsOf, buildTextLayer } from '../src/ui/text-layer';

function pageXml(textCode: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">',
    '  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>',
    '  <ofd:Content><ofd:Layer ID="1">',
    '    <ofd:TextObject ID="2" Boundary="20 30 100 10" Font="9" Size="5" CTM="1 0 0 1 0 0" HScale="80" Weight="700">',
    '      <ofd:FillColor Value="0 0 0"/>',
    '      ' + textCode,
    '    </ofd:TextObject>',
    '  </ofd:Layer></ofd:Content>',
    '</ofd:Page>',
  ].join('\n');
}

const RUN = pageXml('<ofd:TextCode X="0" Y="5" DeltaX="5">ABC</ofd:TextCode>');
const WRAP = pageXml('<ofd:TextCode X="0" Y="5" DeltaY="0 8 0">ABC</ofd:TextCode>');
const PATH_ONLY = pageXml('<ofd:TextCode X="0" Y="5" DeltaX="5">A</ofd:TextCode>')
  .replace('<ofd:TextObject', '<ofd:PathObject')
  .replace('</ofd:TextObject>', '</ofd:PathObject>')
  .replace('<ofd:FillColor Value="0 0 0"/>', '<ofd:AbbreviatedData>M 0 0 L 10 0</ofd:AbbreviatedData>');

describe('textRunsOf', () => {
  it('连续的字合并成一个 span', () => {
    const page = parsePage(RUN, 0, createResources());
    const runs = textRunsOf(page, createViewport(page, 210, 1, 1), () => 'SimSun');
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('ABC');
    expect(runs[0].x).toBe(0);
    expect(runs[0].size).toBe(5);
    expect(runs[0].weight).toBe(700);
  });

  it('变换串依次包含 mm→px 缩放、boundary、CTM 与 HScale', () => {
    const page = parsePage(RUN, 0, createResources());
    const runs = textRunsOf(page, createViewport(page, 210, 1, 1), () => 'SimSun');
    // 页面宽 210mm、容器 210px，故 pxPerMm === 1
    expect(runs[0].transform).toBe('scale(1) translate(20px, 30px) matrix(1, 0, 0, 1, 0, 0) scaleX(0.8)');
  });

  it('换行（DeltaY）处断开成多个 span', () => {
    const page = parsePage(WRAP, 0, createResources());
    const runs = textRunsOf(page, createViewport(page, 210, 1, 1), () => 'SimSun');
    expect(runs.map((run) => run.text)).toEqual(['AB', 'C']);
    expect(runs[1].y).toBeGreaterThan(runs[0].y);
  });

  it('忽略非文本对象', () => {
    const page = parsePage(PATH_ONLY, 0, createResources());
    expect(page.items[0].kind).toBe('path');
    expect(textRunsOf(page, createViewport(page, 210, 1, 1), () => 'SimSun')).toHaveLength(0);
  });
});

describe('buildTextLayer', () => {
  it('生成透明文本层，span 位置与字形一致', () => {
    const page = parsePage(RUN, 0, createResources());
    const layer = buildTextLayer(page, createViewport(page, 210, 1, 1), () => 'SimSun');
    expect(layer.className).toBe('ofdh5-text-layer');

    const holder = layer.querySelector('.ofdh5-text-item') as HTMLElement;
    expect(holder.style.transform).toContain('translate(20px, 30px)');
    expect(holder.style.fontFamily).toBe('SimSun');
    expect(holder.style.fontWeight).toBe('700');

    const spans = layer.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    expect(spans[0].textContent).toBe('ABC');
    expect(spans[0].style.left).toBe('0px');
  });

  it('同一个文本对象复用一个容器', () => {
    const page = parsePage(WRAP, 0, createResources());
    const layer = buildTextLayer(page, createViewport(page, 210, 1, 1), () => 'SimSun');
    expect(layer.querySelectorAll('.ofdh5-text-item')).toHaveLength(1);
    expect(layer.querySelectorAll('span')).toHaveLength(2);
  });
});
