import { describe, it, expect, vi, beforeAll } from 'vitest';
import { paintPage } from '../src/render/painter';
import type { Page } from '../src/types';
import { createViewport } from '../src/render/viewport';

beforeAll(() => {
  (globalThis as any).Path2D = class {
    constructor(public d: string) {}
  };
});

function recordingCtx() {
  const calls: Array<[string, ...unknown[]]> = [];
  const record = (name: string) => (...args: unknown[]) => calls.push([name, ...args]);
  return {
    calls,
    canvas: { width: 0, height: 0 },
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    transform: record('transform'),
    scale: record('scale'),
    setTransform: record('setTransform'),
    fillRect: record('fillRect'),
    fillText: record('fillText'),
    fill: record('fill'),
    stroke: record('stroke'),
    drawImage: record('drawImage'),
    measureText: (text: string) => ({ width: text.length * 2 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D & { calls: Array<[string, ...unknown[]]> };
}

const page: Page = {
  index: 0,
  width: 100,
  height: 200,
  items: [
    {
      kind: 'text',
      boundary: [10, 20, 50, 10],
      fontRef: '9',
      size: 5,
      fill: { r: 0, g: 0, b: 0, a: 1 },
      glyphs: [
        { x: 0, y: 5, deltaX: 5, code: 65 },
        { x: 5, y: 5, deltaX: 5, code: 66 },
      ],
      text: 'AB',
    },
    {
      kind: 'path',
      boundary: [0, 0, 100, 100],
      d: 'M 0 0 L 10 0',
      lineWidth: 1,
      stroke: { r: 255, g: 0, b: 0, a: 1 },
      rule: 'nonzero',
    },
    {
      kind: 'image',
      boundary: [0, 0, 10, 10],
      resId: '5',
      mime: 'image/png',
      width: 1,
      height: 1,
    },
  ],
};

describe('paintPage', () => {
  it('铺底色并设置毫米坐标系', () => {
    const ctx = recordingCtx();
    const vp = createViewport(page, 200, 1, 2);
    paintPage(ctx, page, vp, {
      background: '#fff',
      fontFamily: () => 'sans-serif',
      getImage: () => ({ width: 1, height: 1 }) as unknown as CanvasImageSource,
    });
    const names = ctx.calls.map((c) => c[0]);
    expect(names[0]).toBe('setTransform');
    expect(ctx.calls[0].slice(1)).toEqual([vp.dpr * vp.pxPerMm, 0, 0, vp.dpr * vp.pxPerMm, 0, 0]);
    expect(names).toContain('fillRect');
    expect(ctx.calls.find((c) => c[0] === 'fillRect')!.slice(1)).toEqual([0, 0, 100, 200]);
  });

  it('逐字按 DeltaX 推进', () => {
    const ctx = recordingCtx();
    const vp = createViewport(page, 200, 1, 2);
    paintPage(ctx, page, vp, {
      background: '#fff',
      fontFamily: () => 'sans-serif',
      getImage: () => null,
    });
    const texts = ctx.calls.filter((c) => c[0] === 'fillText');
    expect(texts).toHaveLength(2);
    expect(texts[0].slice(1)).toEqual(['A', 0, 5]);
    expect(texts[1].slice(1)).toEqual(['B', 5, 5]);
  });

  it('路径使用 Path2D 并同时填充与描边', () => {
    const ctx = recordingCtx();
    const vp = createViewport(page, 200, 1, 2);
    paintPage(ctx, page, vp, {
      background: '#fff',
      fontFamily: () => 'sans-serif',
      getImage: () => null,
    });
    expect(ctx.calls.some((c) => c[0] === 'stroke')).toBe(true);
  });

  it('图片缺失时跳过不抛错', () => {
    const ctx = recordingCtx();
    const vp = createViewport(page, 200, 1, 2);
    expect(() =>
      paintPage(ctx, page, vp, {
        background: '#fff',
        fontFamily: () => 'sans-serif',
        getImage: () => null,
      }),
    ).not.toThrow();
  });

  it('单个对象异常不影响其他对象', () => {
    const ctx = recordingCtx();
    ctx.fillText = () => { throw new Error('boom'); };
    const vp = createViewport(page, 200, 1, 2);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      paintPage(ctx, page, vp, {
        background: '#fff',
        fontFamily: () => 'sans-serif',
        getImage: () => null,
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('文字逐字定位的回归用例', () => {
  function makePage(items: Page['items']): Page {
    return { index: 0, width: 100, height: 200, items };
  }

  it('最后一个字没有 DeltaX 时接在行尾，不能跳回行首', () => {
    const ctx = recordingCtx();
    const page = makePage([
      {
        kind: 'text',
        boundary: [0, 0, 100, 10],
        fontRef: '9',
        size: 4,
        fill: { r: 0, g: 0, b: 0, a: 1 },
        glyphs: [
          { x: 0, y: 5, deltaX: 3, code: 65 },
          { x: 3, y: 5, deltaX: 3, code: 66 },
          { x: 6, y: 5, code: 67 },
        ],
        text: 'ABC',
      },
    ]);
    paintPage(ctx, page, createViewport(page, 200, 1, 2), {
      background: '#fff',
      fontFamily: () => 'sans-serif',
      getImage: () => null,
    });
    const xs = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[2]);
    expect(xs).toEqual([0, 3, 6]);
  });

  it('竖排文字只用 DeltaY：x 不变、y 累加', () => {
    const ctx = recordingCtx();
    const page = makePage([
      {
        kind: 'text',
        boundary: [0, 0, 10, 40],
        fontRef: '9',
        size: 4,
        fill: { r: 0, g: 0, b: 0, a: 1 },
        glyphs: [
          { x: 0, y: 0, deltaY: 6.35, code: 65 },
          { x: 0, y: 6.35, deltaY: 6.35, code: 66 },
          { x: 0, y: 12.7, code: 67 },
        ],
        text: 'ABC',
      },
    ]);
    paintPage(ctx, page, createViewport(page, 200, 1, 2), {
      background: '#fff',
      fontFamily: () => 'sans-serif',
      getImage: () => null,
    });
    const calls = ctx.calls.filter((c) => c[0] === 'fillText');
    expect(calls.map((c) => c[2])).toEqual([0, 0, 0]);
    expect(calls.map((c) => c[3])).toEqual([0, 6.35, 12.7]);
  });
});

