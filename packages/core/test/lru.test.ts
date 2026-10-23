import { describe, it, expect, vi } from 'vitest';
import { LruCache } from '../src/render/lru';

describe('LruCache', () => {
  it('超过上限时淘汰最久未使用项', () => {
    const evicted: string[] = [];
    const cache = new LruCache<string, string>(2, (_v, k) => evicted.push(k));
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a');            // a 变成最近使用
    cache.set('c', '3');       // 淘汰 b
    expect(evicted).toEqual(['b']);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('get 不存在的键返回 undefined', () => {
    expect(new LruCache<string, number>(2).get('x')).toBeUndefined();
  });

  it('delete 触发 onEvict', () => {
    const onEvict = vi.fn();
    const cache = new LruCache<string, number>(2, onEvict);
    cache.set('a', 1);
    cache.delete('a');
    expect(onEvict).toHaveBeenCalledWith(1, 'a');
    expect(cache.size).toBe(0);
  });
});
