export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Glyph {
  /** 字符在对象坐标系中的绝对 x（mm） */
  x: number;
  /** 基线 y（mm） */
  y: number;
  /** 该字符步进宽度（mm），缺省时由字体度量决定 */
  deltaX?: number;
  deltaY?: number;
  code: number;
}

export interface BaseItem {
  boundary: [number, number, number, number];
  ctm?: number[];
  alpha?: number;
}

export interface TextItem extends BaseItem {
  kind: 'text';
  fontRef: string;
  /** 字号，mm */
  size: number;
  fill?: RgbColor;
  weight?: number;
  italic?: boolean;
  /** 横向缩放百分比，100 表示正常 */
  hScale?: number;
  glyphs: Glyph[];
  text: string;
}

export interface PathItem extends BaseItem {
  kind: 'path';
  d: string;
  lineWidth?: number;
  stroke?: RgbColor;
  fill?: RgbColor;
  rule: 'nonzero' | 'evenodd';
}

export interface ImageItem extends BaseItem {
  kind: 'image';
  resId: string;
  mime: string;
  width: number;
  height: number;
}

export type PageItem = TextItem | PathItem | ImageItem;

export interface Page {
  index: number;
  /** mm */
  width: number;
  /** mm */
  height: number;
  items: PageItem[];
}

export interface FontResource {
  id: string;
  name: string;
  family: string;
  file?: string;
}

export interface ImageResource {
  id: string;
  file: string;
  mime: string;
}

export interface PageResources {
  fonts: Map<string, FontResource>;
  images: Map<string, ImageResource>;
}

export function createResources(): PageResources {
  return { fonts: new Map(), images: new Map() };
}
