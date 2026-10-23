import { describe, it, expect } from 'vitest';
import { parseColor, toCssColor } from '../src/parser/color';

describe('parseColor', () => {
  it('三个分量按 0-255 解析', () => {
    expect(parseColor('255 0 0')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it('三个分量全部 <=1 时按 0-1 解析', () => {
    expect(parseColor('1 1 1')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('单分量按灰度解析', () => {
    expect(parseColor('0.5')).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it('四分量按 CMYK 近似转 RGB', () => {
    const c = parseColor('0 0 0 1')!;
    expect(c.r).toBe(0);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
  });

  it('Alpha 归一化', () => {
    expect(parseColor('0 0 0', '128')!.a).toBeCloseTo(0.5, 1);
    expect(parseColor('0 0 0', '0.5')!.a).toBe(0.5);
  });

  it('空值返回 undefined', () => {
    expect(parseColor(null)).toBeUndefined();
    expect(parseColor('')).toBeUndefined();
  });
});

describe('toCssColor', () => {
  it('输出 rgba 字符串', () => {
    expect(toCssColor({ r: 0, g: 0, b: 0, a: 1 })).toBe('rgba(0,0,0,1)');
  });
});
