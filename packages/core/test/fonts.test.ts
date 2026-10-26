import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFontRegistry, fontStackFor } from '../src/render/fonts';

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
    // SimSun 走替换表：宋体系列栈，末尾是 serif
    expect(registry.family('9')).toContain('SimSun');
    expect(registry.family('9')).toContain('serif');
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

  it('未注册的字体按替换表返回字体栈', () => {
    const registry = createFontRegistry('serif');
    const stack = registry.family('unknown', 'SimHei');
    expect(stack).toContain('"SimHei"');
    expect(stack).toContain('sans-serif');
  });
});

describe('fontStackFor 字体替换', () => {
  it('中文族名映射到各平台可用字体', () => {
    const stack = fontStackFor('楷体', 'sans-serif');
    expect(stack).toContain('"KaiTi"');
    expect(stack).toContain('"Kaiti SC"');
    expect(stack).toContain('serif');
  });

  it('英文族名大小写不敏感', () => {
    expect(fontStackFor('KaiTi', 'serif')).toContain('"KaiTi"');
    expect(fontStackFor('COURIER NEW', 'serif')).toContain('monospace');
  });

  it('未知字体名保留原名并追加回退', () => {
    expect(fontStackFor('SomeFont', 'sans-serif')).toBe('"SomeFont", sans-serif');
  });

  it('支持自定义 fontMap', () => {
    expect(fontStackFor('楷体', 'sans-serif', { 楷体: 'MyKai' })).toBe('"MyKai", sans-serif');
  });

  it('空名直接返回回退', () => {
    expect(fontStackFor(undefined, 'serif')).toBe('serif');
  });
});

describe('动态字体加载（类似 pdfh5 的 standardFontDataUrl）', () => {
  const originals = {
    fetch: globalThis.fetch,
    FontFace: (globalThis as any).FontFace,
    fonts: (document as any).fonts,
  };
  afterEach(() => {
    (globalThis as any).fetch = originals.fetch;
    (globalThis as any).FontFace = originals.FontFace;
    (document as any).fonts = originals.fonts;
  });

  function mockEnv(ok: boolean) {
    const calls: string[] = [];
    (globalThis as any).fetch = async (url: string) => {
      calls.push(url);
      return { ok, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
    };
    (globalThis as any).FontFace = class {
      constructor(public name: string, public src: unknown) {}
      load() { return Promise.resolve(this); }
    };
    (document as any).fonts = { add: vi.fn() };
    return calls;
  }

  it('按 fontBaseUrl 拼接文件名并注册成功', async () => {
    const calls = mockEnv(true);
    const registry = createFontRegistry('sans-serif', { fontBaseUrl: 'https://cdn.example.com/fonts/' });
    const ok = await registry.register('61', null, '楷体');
    expect(ok).toBe(true);
    expect(calls[0]).toBe('https://cdn.example.com/fonts/' + encodeURIComponent('楷体.ttf'));
    expect(registry.family('61')).toBe('"ofdh5-61"');
  });

  it('fontMap 指定文件名时优先使用', async () => {
    const calls = mockEnv(true);
    const registry = createFontRegistry('sans-serif', {
      fontBaseUrl: 'https://cdn.example.com/fonts',
      fontMap: { 楷体: 'simkai.ttf' },
    });
    await registry.register('1', null, '楷体');
    expect(calls[0]).toBe('https://cdn.example.com/fonts/simkai.ttf');
  });

  it('拉取失败退回系统字体栈', async () => {
    mockEnv(false);
    const registry = createFontRegistry('sans-serif', { fontBaseUrl: 'https://cdn.example.com/fonts' });
    const ok = await registry.register('1', null, '宋体');
    expect(ok).toBe(false);
    expect(registry.family('1')).toContain('SimSun');
  });

  it('未配置 fontUrl 时不发起网络请求', async () => {
    const calls = mockEnv(true);
    const registry = createFontRegistry('sans-serif');
    const ok = await registry.register('1', null, '宋体');
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
