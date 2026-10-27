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
  /** 显示加载动效（首屏/切换文件时） */
  showLoading(): void;
  hideLoading(): void;
  setBackTopVisible(visible: boolean): void;
  onBackTop(handler: () => void): void;
  destroy(): void;
}

/** 视觉样式移植自 pdfh5 3.0（MIT）：页码胶囊、绿色进度条、回到顶部圆钮、页面阴影 */
export const STYLE_TEXT = `
.ofdh5{position:relative;width:100%;height:100%;overflow:hidden;background:#fff;}
.ofdh5-scroller{position:relative;width:100%;height:100%;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;transition:all .3s;}
.ofdh5-sizer{position:relative;width:100%;height:100%;}
.ofdh5-viewer{position:relative;top:0;left:0;padding:10px 8px;box-sizing:border-box;}
.ofdh5-page{margin:0 auto 8px auto;position:relative;overflow:visible;box-shadow:darkgrey 0px 1px 3px 0px;background-color:#fff;box-sizing:border-box;}
.ofdh5-page canvas{width:100%;height:100%;position:relative;z-index:100;user-select:none;pointer-events:none;display:block;}
.ofdh5-text-layer{position:absolute;top:0;left:0;width:100%;height:100%;z-index:101;overflow:hidden;line-height:1;-webkit-user-select:text;user-select:text;}
.ofdh5-text-layer .ofdh5-text-item{position:absolute;left:0;top:0;transform-origin:0 0;white-space:pre;}
.ofdh5-text-layer span{position:absolute;color:transparent;background:transparent;white-space:pre;transform-origin:0 0;cursor:text;}
.ofdh5-text-layer span::selection{background:rgba(250,140,22,.35);}
.ofdh5-search-hit{position:absolute;z-index:102;pointer-events:none;background:rgba(250,140,22,.35);border-radius:2px;}
.ofdh5-search-hit.is-current{background:rgba(250,140,22,.75);}
.ofdh5-page-error{display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:16px;background:#fff;}
.ofdh5-load-effect{position:absolute;top:50%;left:50%;width:44px;height:44px;margin:-22px 0 0 -22px;z-index:1002;opacity:0;pointer-events:none;transition:opacity .2s;}
.ofdh5-load-effect.is-active{opacity:1;}
.ofdh5-load-effect::after{content:'';display:block;width:100%;height:100%;box-sizing:border-box;border-radius:50%;border:3px solid rgba(0,0,0,.12);border-top-color:#fa8c16;animation:ofdh5-spin .8s linear infinite;}
@keyframes ofdh5-spin{to{transform:rotate(360deg)}}
.ofdh5-loading{position:absolute;width:100%;z-index:1000;background:#fff;height:4px;top:0;left:0;transition:all .3s;}
.ofdh5-progress{background:#fff;position:absolute;top:0;left:0;width:0%;height:100%;overflow:hidden;transition:width 200ms;}
.ofdh5-glimmer{position:absolute;top:0;left:0;height:100%;width:calc(100% + 150px);background:#fa8c16;}
.ofdh5-page-num{padding:0 7px;height:26px;position:absolute;top:20px;left:15px;z-index:997;border-radius:8px;transition:all .3s;}
.ofdh5-page-num-bg,.ofdh5-page-num-text{width:100%;height:100%;line-height:26px;text-align:center;position:absolute;top:0;left:0;color:#fff;border-radius:8px;font-size:16px;}
.ofdh5-page-num-bg{background:rgba(0,0,0,.5);}
.ofdh5-page-num-text{position:relative;}
.ofdh5-page-num span{color:#fff;font-size:16px;}
.ofdh5-back-top{width:50px;height:50px;line-height:50px;text-align:center;position:absolute;bottom:90px;right:15px;font-size:18px;z-index:999;border-radius:50%;background:rgba(0,0,0,.4) url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABmJLR0QAAAAAAAD5Q7t/AAAACXBIWXMAAAsSAAALEgHS3X78AAAA+klEQVRYw+2WUQ2DMBCG2TIBSJiESkACEpCAg83BcLBJmIQ5gClgDpiDby9tciGkoaUtZOESXuhdv7+X/pdm2dYC6IgX7Zh3THy+w9oN/rMASqBcE26iSA1XwCAEDIBKBc8F/KE/gB7IU8BbDXyJf2Z2tFFFAE8N6iRIi/jotXssuGn1FzhPrCu9BtCEhlcCrix5hbiYVSh46bKpELvcniO71Q51zWJ7ju3mUe9vzym7eR7Az57CbohTXBzAt9GknG9PoLY8KK4z6htLfeXTTXMZAfoZuWYWKC+YZWMAQuWZSP0k2wXsAnYB2xNwci1wGTKhO/COlLtu/ABVfTFsxwwYRgAAAABJRU5ErkJggg==) no-repeat center;background-size:50% 50%;transition:all .3s;display:none;cursor:pointer;}
.ofdh5-back-top:active{background-color:rgba(0,0,0,.6);}
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
    const glimmer = document.createElement('div');
    glimmer.className = 'ofdh5-glimmer';
    progress.appendChild(glimmer);
    loading.appendChild(progress);
    container.appendChild(loading);
  }

  const loadEffect = document.createElement('div');
  loadEffect.className = 'ofdh5-load-effect';
  container.appendChild(loadEffect);

  let pageNum: HTMLElement | null = null;
  let nowEl: HTMLElement | null = null;
  let totalEl: HTMLElement | null = null;
  if (options.pageNum) {
    pageNum = document.createElement('div');
    pageNum.className = 'ofdh5-page-num';

    const bg = document.createElement('div');
    bg.className = 'ofdh5-page-num-bg';

    const text = document.createElement('div');
    text.className = 'ofdh5-page-num-text';
    nowEl = document.createElement('span');
    nowEl.className = 'ofdh5-page-now';
    nowEl.textContent = '1';
    totalEl = document.createElement('span');
    totalEl.className = 'ofdh5-page-total';
    totalEl.textContent = '0';
    text.append(nowEl, document.createTextNode('/'), totalEl);

    pageNum.append(bg, text);
    container.appendChild(pageNum);
  }

  let backTop: HTMLElement | null = null;
  if (options.backTop) {
    backTop = document.createElement('div');
    backTop.className = 'ofdh5-back-top';
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
      if (!progress) return;
      const percent = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
      progress.style.width = percent;
    },
    showLoading() {
      if (loading) loading.style.display = 'block';
      if (progress) progress.style.width = '0%';
      loadEffect.classList.add('is-active');
    },
    hideLoading() {
      if (loading) loading.style.display = 'none';
      loadEffect.classList.remove('is-active');
    },
    setBackTopVisible(visible) {
      if (!backTop) return;
      backTop.classList.toggle('is-visible', visible);
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
