import { describe, it, expect, vi } from 'vitest';
import { pageAtOffset, ScrollWatcher } from '../src/interact/scroller';

describe('pageAtOffset', () => {
  // 每页高 600，共 3 页；视口高 800
  const offsets = [0, 600, 1200];
  const heights = [600, 600, 600];

  it('顶部时是第一页', () => {
    expect(pageAtOffset(offsets, heights, 0, 800)).toBe(0);
  });

  it('滚过 1/3 视口后切页', () => {
    expect(pageAtOffset(offsets, heights, 300, 800)).toBe(1);
    expect(pageAtOffset(offsets, heights, 900, 800)).toBe(2);
  });

  it('超出范围时收敛到最后一页', () => {
    expect(pageAtOffset(offsets, heights, 5000, 800)).toBe(2);
    expect(pageAtOffset(offsets, heights, -100, 800)).toBe(0);
  });
});

describe('ScrollWatcher', () => {
  it('滚动时回调并且只保留一次 rAF', async () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 100, writable: true });
    const onScroll = vi.fn();
    const watcher = new ScrollWatcher(el, onScroll);
    el.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 20));
    expect(onScroll).toHaveBeenCalled();
    watcher.destroy();
  });
});
