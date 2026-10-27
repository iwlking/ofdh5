import { describe, it, expect } from 'vitest';
import { parsePage } from '../src/parser/content';
import { createResources } from '../src/types';
import { searchPage, searchDocument } from '../src/search';

function pageXml(text: string): string {
  const delta = '5';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">',
    '  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>',
    '  <ofd:Content><ofd:Layer ID="1">',
    '    <ofd:TextObject ID="2" Boundary="20 30 100 10" Font="9" Size="5" CTM="1 0 0 1 0 0">',
    '      <ofd:FillColor Value="0 0 0"/>',
    '      <ofd:TextCode X="0" Y="5" DeltaX="' + delta + '">' + text + '</ofd:TextCode>',
    '    </ofd:TextObject>',
    '  </ofd:Layer></ofd:Content>',
    '</ofd:Page>',
  ].join('\n');
}

const page1 = parsePage(pageXml('发票号码 12345'), 0, createResources());
const page2 = parsePage(pageXml('第二页 ABCdef'), 1, createResources());

describe('searchPage', () => {
  it('命中并给出页面坐标系下的矩形', () => {
    const hits = searchPage(page1, '12345');
    expect(hits).toHaveLength(1);
    expect(hits[0].text).toBe('12345');
    // 对象起点 20 + 前 5 个字（发票号码+空格）各 5mm
    expect(hits[0].rect.x).toBeCloseTo(20 + 25, 6);
    // 基线上移 0.88em 得到字顶，再加对象起点 y=30
    expect(hits[0].rect.y).toBeCloseTo(30 + 5 - 5 * 0.88, 6);
    expect(hits[0].rect.width).toBeCloseTo(25, 6);
  });

  it('默认忽略大小写，可开启大小写敏感', () => {
    expect(searchPage(page2, 'abc')).toHaveLength(1);
    expect(searchPage(page2, 'abc', { caseSensitive: true })).toHaveLength(0);
    expect(searchPage(page2, 'ABC', { caseSensitive: true })).toHaveLength(1);
  });

  it('同一行多次命中按顺序返回', () => {
    const page = parsePage(pageXml('ab ab ab'), 0, createResources());
    const hits = searchPage(page, 'ab');
    expect(hits).toHaveLength(3);
    expect(hits[0].rect.x).toBeLessThan(hits[1].rect.x);
    expect(hits[1].rect.x).toBeLessThan(hits[2].rect.x);
  });

  it('空关键字返回空', () => {
    expect(searchPage(page1, '')).toHaveLength(0);
    expect(searchPage(page1, '   ')).toHaveLength(0);
  });

  it('旋转文字取包围盒', () => {
    const rotated = parsePage(
      pageXml('发票号码').replace('CTM="1 0 0 1 0 0"', 'CTM="0 1 -1 0 0 0"'),
      0,
      createResources(),
    );
    const hits = searchPage(rotated, '发票');
    expect(hits).toHaveLength(1);
    expect(hits[0].rect.width).toBeGreaterThan(0);
    expect(hits[0].rect.height).toBeGreaterThan(0);
  });
});

describe('searchDocument', () => {
  it('按页码升序给出全局序号', () => {
    const matches = searchDocument([page1, page2], '页');
    expect(matches.map((match) => match.pageNum)).toEqual([2]);
    expect(matches[0].index).toBe(0);
  });

  it('跨页命中统一编号', () => {
    const matches = searchDocument([page1, page2], 'ABC');
    expect(matches).toHaveLength(1);
    expect(matches[0].pageNum).toBe(2);
    expect(matches[0].index).toBe(0);
  });
});
