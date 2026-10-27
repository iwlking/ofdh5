import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ofdh5 } from '../src/ofdh5';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name)));

function mount(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

async function open(name: string): Promise<Ofdh5> {
  const ofd = new Ofdh5(mount(), { data: fixture(name) });
  await (ofd as unknown as { loaded: Promise<void> }).loaded;
  return ofd;
}

describe('多 DocBody 文档包', () => {
  it('把多个文档的页拼成连续页码', async () => {
    const ofd = await open('multi-doc.ofd');
    expect(ofd.getPageCount()).toBe(3);
    expect(ofd.getStatus().status).toBe('ready');
    ofd.destroy();
  });

  it('第二个文档的页排在第一个文档之后', async () => {
    const ofd = await open('multi-doc.ofd');
    const matches = ofd.searchText('第二份文档');
    expect(matches).toHaveLength(1);
    expect(matches[0].pageNum).toBe(3);
    ofd.destroy();
  });

  it('单文档包行为不变', async () => {
    const ofd = await open('multi-page.ofd');
    expect(ofd.getPageCount()).toBe(12);
    ofd.destroy();
  });
});

describe('全文搜索', () => {
  it('命中所有页并触发 search 事件', async () => {
    const el = mount();
    const ofd = new Ofdh5(el, { data: fixture('multi-page.ofd') });
    const onSearch = vi.fn();
    ofd.on('search', onSearch);
    await (ofd as unknown as { loaded: Promise<void> }).loaded;

    const matches = ofd.searchText('页');
    expect(matches).toHaveLength(12);
    expect(matches.map((match) => match.pageNum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch.mock.calls[0][0]).toBe('页');
    expect(onSearch.mock.calls[0][1]).toHaveLength(12);
    ofd.destroy();
  });

  it('findNext / findPrevious 在命中之间循环', async () => {
    const ofd = await open('multi-page.ofd');
    ofd.searchText('页');
    expect(ofd.getSearchState().current).toBe(0);

    expect(ofd.findNext()?.pageNum).toBe(2);
    expect(ofd.getSearchState().current).toBe(1);
    expect(ofd.findPrevious()?.pageNum).toBe(1);
    // 从第一个往前翻回到最后一个
    expect(ofd.findPrevious()?.pageNum).toBe(12);
    ofd.destroy();
  });

  it('clearSearch 清空状态与高亮', async () => {
    const ofd = await open('multi-page.ofd');
    ofd.searchText('页');
    ofd.clearSearch();
    expect(ofd.getSearchState()).toEqual({ keyword: '', matches: [], current: -1 });
    expect(ofd.findNext()).toBeNull();
    ofd.destroy();
  });

  it('没有命中时不跳转', async () => {
    const ofd = await open('single-text.ofd');
    expect(ofd.searchText('不存在的关键词')).toHaveLength(0);
    expect(ofd.getSearchState().current).toBe(-1);
    expect(ofd.findNext()).toBeNull();
    ofd.destroy();
  });
});
