import { describe, it, expect } from 'vitest';
import { createImageCache } from '../src/render/images';

describe('ImageCache', () => {
  it('未注册的资源返回 null', async () => {
    const cache = createImageCache({ read: () => null });
    expect(await cache.load('5', 'a.png')).toBeNull();
  });

  it('字节缺失时返回 null 而不抛错', async () => {
    const cache = createImageCache({ read: () => null });
    const result = await cache.load('5', 'missing.png');
    expect(result).toBeNull();
    expect(cache.size).toBe(0);
  });
});
