import type { Ofdh5Options } from 'ofdh5';

const OPTION_KEYS: Array<keyof Ofdh5Options> = [
  'url', 'pdfurl', 'data', 'goto', 'scale', 'scrollEnable', 'zoomEnable', 'resize',
  'lazyLoad', 'loadingBar', 'pageNum', 'backTop', 'tapZoomFactor', 'maxZoom', 'minZoom',
  'maxCachedPages', 'maxDpr', 'pageGap', 'backgroundColor', 'fontFallback', 'timeout',
];

export function toOptions(props: Partial<Ofdh5Options> & Record<string, unknown>): Ofdh5Options {
  const options: Ofdh5Options = {};
  for (const key of OPTION_KEYS) {
    const value = (props as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) {
      (options as Record<string, unknown>)[key] = value;
    }
  }
  return options;
}
