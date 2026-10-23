import { describe, it, expect } from 'vitest';
import { createViewport, clampScale, MM_TO_PX } from '../src/render/viewport';

describe('viewport', () => {
  it('mm→px 常数', () => {
    expect(MM_TO_PX).toBeCloseTo(3.7795, 3);
  });

  it('按容器宽度撑满页面', () => {
    const vp = createViewport({ width: 210, height: 297 }, 420, 1, 2);
    expect(vp.cssWidth).toBe(420);
    expect(vp.pxPerMm).toBe(2);
    expect(vp.cssHeight).toBe(594);
  });

  it('scale 线性放大', () => {
    const vp = createViewport({ width: 210, height: 297 }, 420, 1.5, 2);
    expect(vp.cssWidth).toBe(630);
    expect(vp.pxPerMm).toBe(3);
  });

  it('clampScale 限制在约束内', () => {
    expect(clampScale(5, 0.5, 4)).toBe(4);
    expect(clampScale(0.1, 0.5, 4)).toBe(0.5);
    expect(clampScale(2, 0.5, 4)).toBe(2);
  });
});
