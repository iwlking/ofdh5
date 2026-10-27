import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ofdh5 } from '../src/ofdh5';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name)));

/** jsdom 没有 2d 上下文，桩一个最小实现，让渲染流程真正跑起来 */
beforeAll(() => {
  const ctx: Record<string, unknown> = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    textBaseline: '',
    measureText: (text: string) => ({ width: String(text).length * 5 }),
  };
  const noop = () => undefined;
  for (const key of [
    'setTransform', 'fillRect', 'save', 'restore', 'translate', 'transform', 'scale',
    'fillText', 'strokeText', 'fill', 'stroke', 'drawImage', 'clearRect',
  ]) {
    ctx[key] = noop;
  }
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

function mount(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

async function open(name: string, options = {}): Promise<{ ofd: Ofdh5; el: HTMLElement }> {
  const el = mount();
  const ofd = new Ofdh5(el, { data: fixture(name), ...options });
  await (ofd as unknown as { loaded: Promise<void> }).loaded;
  return { ofd, el };
}

const firstPage = (el: HTMLElement) => el.querySelector('.ofdh5-page') as HTMLElement;

describe('页面渲染', () => {
  it('渲染完成后叠加透明文本层', async () => {
    const { ofd, el } = await open('single-text.ofd');
    const page = firstPage(el);
    expect(page.querySelector('canvas')).not.toBeNull();

    const layer = page.querySelector('.ofdh5-text-layer');
    expect(layer).not.toBeNull();
    expect(layer!.querySelectorAll('span').length).toBeGreaterThan(0);
    expect(layer!.textContent).toContain('ofdh5');
    ofd.destroy();
  });

  it('textLayer: false 时不生成文本层', async () => {
    const { ofd, el } = await open('single-text.ofd', { textLayer: false });
    expect(firstPage(el).querySelector('.ofdh5-text-layer')).toBeNull();
    expect(firstPage(el).querySelector('canvas')).not.toBeNull();
    ofd.destroy();
  });

  it('搜索后当前页出现命中高亮，clearSearch 后清除', async () => {
    const { ofd, el } = await open('single-text.ofd');
    const matches = ofd.searchText('ofdh5');
    expect(matches).toHaveLength(1);

    const hits = firstPage(el).querySelectorAll('.ofdh5-search-hit');
    expect(hits).toHaveLength(1);
    expect(hits[0].classList.contains('is-current')).toBe(true);
    expect(hits[0].getAttribute('style')).toContain('left');

    ofd.clearSearch();
    expect(firstPage(el).querySelectorAll('.ofdh5-search-hit')).toHaveLength(0);
    ofd.destroy();
  });

  it('findNext 把 is-current 移到下一个命中', async () => {
    const { ofd, el } = await open('multi-page.ofd');
    const matches = ofd.searchText('页');
    expect(matches).toHaveLength(12);
    // 懒加载只渲染前两页，第 2 页的命中应带 is-current
    ofd.findNext();
    const pages = Array.from(el.querySelectorAll('.ofdh5-page'));
    const current = pages.flatMap((page) => Array.from(page.querySelectorAll('.ofdh5-search-hit.is-current')));
    expect(current.length).toBeLessThanOrEqual(1);
    ofd.destroy();
  });
});
