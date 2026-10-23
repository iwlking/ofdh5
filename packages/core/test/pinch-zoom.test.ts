import { describe, it, expect } from 'vitest';
import { distance, center, pinchScale, clamp } from '../src/interact/pinch-zoom';

describe('手势数学', () => {
  it('distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('center', () => {
    expect(center({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it('pinchScale 把距离比映射为缩放', () => {
    expect(pinchScale(100, 200, 1)).toBe(2);
    expect(pinchScale(100, 50, 1)).toBe(0.5);
  });

  it('clamp 限制范围', () => {
    expect(clamp(5, 1, 4)).toBe(4);
    expect(clamp(0.2, 1, 4)).toBe(1);
  });
});
