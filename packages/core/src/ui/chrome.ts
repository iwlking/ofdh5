export interface ChromeOptions {
  loadingBar: boolean;
  pageNum: boolean;
  backTop: boolean;
}

export interface Chrome {
  viewer: HTMLElement;
  sizer: HTMLElement;
  scroller: HTMLElement;
  setPage(current: number, total: number): void;
  setProgress(ratio: number): void;
  hideLoading(): void;
  onBackTop(handler: () => void): void;
  destroy(): void;
}

export const STYLE_TEXT = `
.ofdh5{position:relative;width:100%;height:100%;overflow:hidden;background:#f5f5f5;}
.ofdh5-scroller{position:relative;width:100%;height:100%;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;}
.ofdh5-sizer{position:relative;width:100%;height:100%;}
.ofdh5-viewer{padding:10px 8px 40px 8px;box-sizing:border-box;}
.ofdh5-page{position:relative;margin:0 auto 8px auto;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);overflow:hidden;}
.ofdh5-page canvas{display:block;width:100%;height:100%;}
.ofdh5-page-error{display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;}
.ofdh5-loading{position:absolute;top:0;left:0;width:100%;height:3px;background:rgba(0,0,0,.06);z-index:10;}
.ofdh5-progress{height:100%;width:0;background:#7bcf34;transition:width .2s;}
.ofdh5-page-num{position:absolute;top:12px;left:12px;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.5);color:#fff;font-size:13px;line-height:20px;z-index:9;}
.ofdh5-back-top{position:absolute;right:15px;bottom:40px;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,.35);color:#fff;font-size:16px;line-height:40px;text-align:center;z-index:9;display:none;cursor:pointer;}
.ofdh5-back-top.is-visible{display:block;}
`;

let styleInjected = false;

export function createChrome(container: HTMLElement, options: ChromeOptions): Chrome {
  if (!styleInjected && typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.setAttribute('data-ofdh5', '');
    style.textContent = STYLE_TEXT;
    document.head.appendChild(style);
    styleInjected = true;
  }

  container.innerHTML = '';
  container.classList.add('ofdh5');

  const scroller = document.createElement('div');
  scroller.className = 'ofdh5-scroller';
  const sizer = document.createElement('div');
  sizer.className = 'ofdh5-sizer';
  const viewer = document.createElement('div');
  viewer.className = 'ofdh5-viewer';
  sizer.appendChild(viewer);
  scroller.appendChild(sizer);
  container.appendChild(scroller);

  let loading: HTMLElement | null = null;
  let progress: HTMLElement | null = null;
  if (options.loadingBar) {
    loading = document.createElement('div');
    loading.className = 'ofdh5-loading';
    progress = document.createElement('div');
    progress.className = 'ofdh5-progress';
    loading.appendChild(progress);
    container.appendChild(loading);
  }

  let pageNum: HTMLElement | null = null;
  let nowEl: HTMLElement | null = null;
  let totalEl: HTMLElement | null = null;
  if (options.pageNum) {
    pageNum = document.createElement('div');
    pageNum.className = 'ofdh5-page-num';
    nowEl = document.createElement('span');
    nowEl.className = 'ofdh5-page-now';
    nowEl.textContent = '1';
    totalEl = document.createElement('span');
    totalEl.className = 'ofdh5-page-total';
    totalEl.textContent = '0';
    pageNum.append(nowEl, document.createTextNode('/'), totalEl);
    container.appendChild(pageNum);
  }

  let backTop: HTMLElement | null = null;
  if (options.backTop) {
    backTop = document.createElement('div');
    backTop.className = 'ofdh5-back-top';
    backTop.textContent = '↑';
    container.appendChild(backTop);
  }

  let backTopHandler: (() => void) | null = null;
  const handleBackTopClick = () => backTopHandler?.();
  backTop?.addEventListener('click', handleBackTopClick);

  return {
    viewer,
    sizer,
    scroller,
    setPage(current, total) {
      if (nowEl) nowEl.textContent = String(current);
      if (totalEl) totalEl.textContent = String(total);
    },
    setProgress(ratio) {
      if (progress) progress.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    },
    hideLoading() {
      if (loading) loading.style.display = 'none';
    },
    onBackTop(handler) {
      backTopHandler = handler;
    },
    destroy() {
      backTop?.removeEventListener('click', handleBackTopClick);
      container.innerHTML = '';
      container.classList.remove('ofdh5');
      styleInjected = false;
      document.querySelector('style[data-ofdh5]')?.remove();
    },
  };
}
