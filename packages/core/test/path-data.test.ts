import { describe, it, expect } from 'vitest';
import { abbreviatedToSvgPath } from '../src/parser/path-data';

describe('abbreviatedToSvgPath', () => {
  it('矩形：M L C(闭合)', () => {
    expect(abbreviatedToSvgPath('M 0 0 L 10 0 L 10 10 L 0 10 C'))
      .toBe('M 0 0 L 10 0 L 10 10 L 0 10 Z');
  });

  it('三次贝塞尔 B → C', () => {
    expect(abbreviatedToSvgPath('M 0 0 B 1 1 2 2 3 3')).toBe('M 0 0 C 1 1 2 2 3 3');
  });

  it('二次贝塞尔 Q 原样保留', () => {
    expect(abbreviatedToSvgPath('M 0 0 Q 5 5 10 0')).toBe('M 0 0 Q 5 5 10 0');
  });

  it('圆弧 A 原样保留', () => {
    expect(abbreviatedToSvgPath('M 0 0 A 10 10 0 0 1 20 0')).toBe('M 0 0 A 10 10 0 0 1 20 0');
  });

  it('支持负数与小数', () => {
    expect(abbreviatedToSvgPath('M -1.5 2.25 L -3 -4')).toBe('M -1.5 2.25 L -3 -4');
  });

  it('容忍多余空白与未知指令', () => {
    expect(abbreviatedToSvgPath('  M 0 0   L 1 1  X 9 9 ')).toBe('M 0 0 L 1 1');
  });
});
