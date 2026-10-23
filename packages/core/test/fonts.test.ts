import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFontRegistry } from '../src/render/fonts';

describe('FontRegistry', () => {
  const original = globalThis.FontFace;
  afterEach(() => {
    (globalThis as any).FontFace = original;
  });

  it('没有 FontFace 时降级到回退字体栈并返回 false', async () => {
    delete (globalThis as any).FontFace;
    const registry = createFontRegistry('sans-serif');
    const ok = await registry.register('9', new Uint8Array([0, 1, 2]), 'SimSun');
    expect(ok).toBe(false);
    expect(registry.family('9')).toContain('SimSun');
    expect(registry.family('9')).toContain('sans-serif');
  });

  it('FontFace 加载失败时降级', async () => {
    (globalThis as any).FontFace = class {
      constructor() {}
      load() { return Promise.reject(new Error('bad font')); }
    };
    const registry = createFontRegistry('sans-serif');
    const ok = await registry.register('9', new Uint8Array([0]), 'SimSun');
    expect(ok).toBe(false);
  });

  it('加载成功时使用注册的 family', async () => {
    (globalThis as any).FontFace = class {
      constructor(public name: string, public src: unknown) {}
      load() { return Promise.resolve(this); }
    };
    (document as any).fonts = { add: vi.fn() };
    const registry = createFontRegistry('sans-serif');
    const ok = await registry.register('9', new Uint8Array([0]), 'SimSun');
    expect(ok).toBe(true);
    expect(registry.family('9')).toBe('"ofdh5-9"');
    expect((document as any).fonts.add).toHaveBeenCalledOnce();
  });

  it('未注册的字体返回回退栈', () => {
    const registry = createFontRegistry('serif');
    expect(registry.family('unknown', 'SimHei')).toBe('"SimHei", serif');
  });
});
