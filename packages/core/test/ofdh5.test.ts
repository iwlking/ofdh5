import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ofdh5 } from '../src/ofdh5';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', name)));

function mount() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 400, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('Ofdh5', () => {
  it('加载合法包后进入 ready 并拿到页数', async () => {
    const el = mount();
    const ofd = new Ofdh5(el, { data: fixture('multi-page.ofd') });
    const ready = vi.fn();
    ofd.on('ready', ready);
    await (ofd as unknown as { loaded: Promise<void> }).loaded;
    expect(ready).toHaveBeenCalled();
    expect(ofd.getPageCount()).toBe(12);
    expect(ofd.getStatus().status).toBe('ready');
    ofd.destroy();
  });

  it('非法数据触发 error 与 complete(error)', async () => {
    const el = mount();
    const onError = vi.fn();
    const onComplete = vi.fn();
    const ofd = new Ofdh5(el, { data: new Uint8Array([0, 1, 2, 3]) });
    ofd.on('error', onError);
    ofd.on('complete', onComplete);
    await (ofd as unknown as { loaded: Promise<void> }).loaded;
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toContain('E_NOT_ZIP');
    expect(onComplete.mock.calls[0][0]).toBe('error');
    expect(ofd.getStatus().status).toBe('error');
    ofd.destroy();
  });

  it('缺 Document.xml 报 E_NO_ENTRY', async () => {
    const el = mount();
    const ofd = new Ofdh5(el, { data: fixture('broken.ofd') });
    await (ofd as unknown as { loaded: Promise<void> }).loaded;
    expect(ofd.getStatus().lastError!.code).toBe('E_NO_ENTRY');
    ofd.destroy();
  });

  it('事件回调的 this 指向实例', async () => {
    const el = mount();
    const ofd = new Ofdh5(el, { data: fixture('single-text.ofd') });
    let self: unknown = null;
    ofd.on('ready', function (this: unknown) { self = this; });
    await (ofd as unknown as { loaded: Promise<void> }).loaded;
    expect(self).toBe(ofd);
    ofd.destroy();
  });

  it('destroy 后状态为 destroyed 且容器清空', async () => {
    const el = mount();
    const ofd = new Ofdh5(el, { data: fixture('single-text.ofd') });
    await (ofd as unknown as { loaded: Promise<void> }).loaded;
    ofd.destroy();
    expect(ofd.getStatus().status).toBe('destroyed');
    expect(el.innerHTML).toBe('');
  });

  it('接受 pdfurl 别名', () => {
    const el = mount();
    const ofd = new Ofdh5(el, { pdfurl: './a.ofd' });
    expect((ofd as unknown as { opts: { url: string } }).opts.url).toBe('./a.ofd');
    ofd.destroy();
  });
});
