import { describe, it, expect } from 'vitest';
import { distance, center, pinchScale, clamp, PinchZoom } from '../src/interact/pinch-zoom';

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

describe('缩小后的居中（pdfh5 同款策略）', () => {
  function setup(hostW: number, hostH: number, baseW: number, baseH: number, minScale = 0.5) {
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: hostW, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: hostH, configurable: true });
    const target = document.createElement('div');
    const sizer = document.createElement('div');
    const zoom = new PinchZoom(host, target, sizer, {
      minScale: 0.5,
      maxScale: 4,
      tapZoomFactor: 2,
      enabled: true,
    });
    zoom.setBaseSize(baseW, baseH);
    return { host, target, sizer, zoom };
  }

  it('缩小到比视口小时水平垂直都居中，滚动容器不小于视口', () => {
    const { target, sizer, zoom } = setup(400, 800, 400, 600);
    zoom.setScale(0.5);
    expect(target.style.marginLeft).toBe('100px');
    expect(target.style.marginTop).toBe('250px');
    expect(sizer.style.width).toBe('400px');
    expect(sizer.style.height).toBe('800px');
  });

  it('放大后偏移归零，滚动容器随内容变大', () => {
    const { target, sizer, zoom } = setup(400, 800, 400, 600);
    zoom.setScale(2);
    expect(target.style.marginLeft).toBe('0px');
    expect(target.style.marginTop).toBe('0px');
    expect(sizer.style.width).toBe('800px');
    expect(sizer.style.height).toBe('1200px');
  });

  it('文档比视口矮时，1:1 也要垂直居中', () => {
    const { target } = setup(400, 800, 400, 600);
    expect(target.style.marginTop).toBe('100px');
    expect(target.style.marginLeft).toBe('0px');
  });
});

function fire(el: HTMLElement, type: string, points: Array<[number, number]>) {
  const event = new Event(type) as Event & { touches: unknown; preventDefault: () => void };
  event.touches = points.map(([x, y]) => ({ clientX: x, clientY: y }));
  event.preventDefault = () => {};
  el.dispatchEvent(event);
}

describe('缩小越界回弹（默认最小 = 加载尺寸）', () => {
  function create(min: number) {
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(host, 'clientHeight', { value: 800, configurable: true });
    const target = document.createElement('div');
    const sizer = document.createElement('div');
    const zoom = new PinchZoom(host, target, sizer, { minScale: min, maxScale: 4, tapZoomFactor: 2, enabled: true });
    zoom.setBaseSize(400, 600);
    return { host, zoom };
  }

  it('缩到 1 倍以下时按阻尼跟随，松手弹回 1', async () => {
    const { host, zoom } = create(1);
    expect(zoom.scale).toBe(1);

    fire(host, 'touchstart', [[0, 0], [100, 0]]);
    fire(host, 'touchmove', [[0, 0], [40, 0]]);   // 原始比例 0.4
    expect(zoom.scale).toBeLessThan(1);
    expect(zoom.scale).toBeGreaterThan(0.4);      // 被阻尼削弱

    fire(host, 'touchend', []);
    await new Promise((r) => setTimeout(r, 320));
    expect(zoom.scale).toBeCloseTo(1, 2);
  });

  it('放大不受下限影响', () => {
    const { host, zoom } = create(1);
    fire(host, 'touchstart', [[0, 0], [100, 0]]);
    fire(host, 'touchmove', [[0, 0], [200, 0]]);
    expect(zoom.scale).toBeCloseTo(2, 1);
  });
});
