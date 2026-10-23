import type { Ofdh5Options, OfdStatus } from 'ofdh5';

export interface OfdViewerProps {
  url?: string;
  data?: ArrayBuffer | Uint8Array | Blob;
  goto?: number;
  scale?: number;
  zoomEnable?: boolean;
  scrollEnable?: boolean;
  lazyLoad?: boolean;
  loadingBar?: boolean;
  pageNum?: boolean;
  backTop?: boolean;
  maxZoom?: number;
  minZoom?: number;
}

export interface OfdViewerInstance {
  goToPage(page: number): void;
  nextPage(): void;
  prevPage(): void;
  zoomIn(): void;
  zoomOut(): void;
  setScale(scale: number): void;
  getStatus(): OfdStatus | null;
  destroy(): void;
}

export declare const OfdViewer: {
  new (): OfdViewerInstance;
  props: Record<keyof OfdViewerProps, unknown>;
};

export declare function toOptions(props: Partial<Ofdh5Options> & Record<string, unknown>): Ofdh5Options;

declare const plugin: {
  install(Vue: { component(name: string, comp: unknown): void }): void;
};

export default plugin;
export { Ofdh5 } from 'ofdh5';
export type { Ofdh5Options, OfdStatus } from 'ofdh5';
