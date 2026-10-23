import { describe, it, expect } from 'vitest';
import { parseXml, attr, num, nums, firstByLocalName, allByLocalName, directChild } from '../src/parser/xml';

const SAMPLE = `<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Area><ofd:PhysicalBox>0 0 210 297</ofd:PhysicalBox></ofd:Area>
  <ofd:Content><ofd:Layer ID="1">
    <ofd:TextObject ID="2" Boundary="10 20 30 40" Size="3.5"/>
  </ofd:Layer></ofd:Content>
</ofd:Page>`;

describe('xml 工具', () => {
  it('忽略命名空间前缀按 localName 查找', () => {
    const doc = parseXml(SAMPLE, 'test');
    expect(firstByLocalName(doc, 'PhysicalBox')?.textContent).toBe('0 0 210 297');
    expect(allByLocalName(doc, 'TextObject')).toHaveLength(1);
  });

  it('读取无前缀属性', () => {
    const doc = parseXml(SAMPLE, 'test');
    const text = firstByLocalName(doc, 'TextObject')!;
    expect(attr(text, 'Boundary')).toBe('10 20 30 40');
    expect(attr(text, 'ID')).toBe('2');
    expect(attr(text, 'Missing')).toBeNull();
  });

  it('数字解析', () => {
    expect(num('3.5')).toBe(3.5);
    expect(num(null, 2)).toBe(2);
    expect(nums('1 0 0 1 10 20')).toEqual([1, 0, 0, 1, 10, 20]);
    expect(nums('1,2')).toEqual([1]);
  });

  it('directChild 只取直接子节点', () => {
    const doc = parseXml(SAMPLE, 'test');
    const page = doc.documentElement;
    expect(directChild(page, 'Area')).not.toBeNull();
    expect(directChild(page, 'PhysicalBox')).toBeNull();
  });

  it('非法 XML 抛出 E_PARSE_XML', () => {
    try {
      parseXml('<a><b></a>', 'bad.xml');
      throw new Error('should throw');
    } catch (e) {
      expect((e as { code: string }).code).toBe('E_PARSE_XML');
    }
  });
});
