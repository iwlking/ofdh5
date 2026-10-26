import { describe, beforeEach, afterEach, it, expect } from 'vitest';
import { createChrome, STYLE_TEXT } from '../src/ui/chrome';

describe('createChrome', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('创建容器结构与样式', () => {
    const chrome = createChrome(container, { loadingBar: true, pageNum: true, backTop: true });
    expect(container.classList.contains('ofdh5')).toBe(true);
    expect(container.querySelector('.ofdh5-viewer')).not.toBeNull();
    expect(container.querySelector('.ofdh5-loading')).not.toBeNull();
    expect(container.querySelector('.ofdh5-page-num')).not.toBeNull();
    expect(container.querySelector('.ofdh5-back-top')).not.toBeNull();
    expect(document.head.querySelector('style')!.textContent).toBe(STYLE_TEXT);
    chrome.destroy();
  });

  it('按配置隐藏 UI', () => {
    const chrome = createChrome(container, { loadingBar: false, pageNum: false, backTop: false });
    expect(container.querySelector('.ofdh5-loading')).toBeNull();
    expect(container.querySelector('.ofdh5-page-num')).toBeNull();
    expect(container.querySelector('.ofdh5-back-top')).toBeNull();
    chrome.destroy();
  });

  it('更新页码与进度', () => {
    const chrome = createChrome(container, { loadingBar: true, pageNum: true, backTop: true });
    chrome.setPage(3, 12);
    expect(container.querySelector('.ofdh5-page-now')!.textContent).toBe('3');
    expect(container.querySelector('.ofdh5-page-total')!.textContent).toBe('12');
    chrome.setProgress(0.42);
    expect((container.querySelector('.ofdh5-progress') as HTMLElement).style.width).toBe('42%');
    chrome.destroy();
  });

  it('回到顶部按钮默认隐藏，滚动后显示', () => {
    const chrome = createChrome(container, { loadingBar: true, pageNum: true, backTop: true });
    const button = container.querySelector('.ofdh5-back-top') as HTMLElement;
    expect(button.classList.contains('is-visible')).toBe(false);
    chrome.setBackTopVisible(true);
    expect(button.classList.contains('is-visible')).toBe(true);
    chrome.setBackTopVisible(false);
    expect(button.classList.contains('is-visible')).toBe(false);
    chrome.destroy();
  });

  it('页码有背景层与文字层，样式取自 pdfh5', () => {
    const chrome = createChrome(container, { loadingBar: true, pageNum: true, backTop: true });
    expect(container.querySelector('.ofdh5-page-num-bg')).not.toBeNull();
    expect(container.querySelector('.ofdh5-page-num-text')).not.toBeNull();
    expect(container.querySelector('.ofdh5-glimmer')).not.toBeNull();
    expect(STYLE_TEXT).toContain('background:#fa8c16');
    expect(STYLE_TEXT).toContain('box-shadow:darkgrey');
    chrome.destroy();
  });

  it('销毁后移除所有子节点', () => {
    const chrome = createChrome(container, { loadingBar: true, pageNum: true, backTop: true });
    chrome.destroy();
    expect(container.innerHTML).toBe('');
    expect(container.classList.contains('ofdh5')).toBe(false);
  });
});

describe('加载动效', () => {
  let box: HTMLElement;
  beforeEach(() => {
    box = document.createElement('div');
    document.body.appendChild(box);
  });
  afterEach(() => box.remove());

  it('加载动效默认隐藏，showLoading/hideLoading 切换', () => {
    const chrome = createChrome(box, { loadingBar: true, pageNum: true, backTop: true });
    const effect = box.querySelector('.ofdh5-load-effect') as HTMLElement;
    expect(effect).not.toBeNull();
    expect(effect.classList.contains('is-active')).toBe(false);

    chrome.showLoading();
    expect(effect.classList.contains('is-active')).toBe(true);

    chrome.hideLoading();
    expect(effect.classList.contains('is-active')).toBe(false);
    chrome.destroy();
  });

});
