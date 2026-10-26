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
  stroke?: RgbColor;
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
  /** 资源声明的格式（MultiMedia/@Format），如 GBIG2 */
  format?: string;
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
  /** MultiMedia/@Format，例如 GBIG2 / JBIG2 / PNG */
  format?: string;
}

/** 颜色值引用：Value 为原始色值文本，ColorSpace 为 ColorSpace 资源 ID（也可直接写 RGB/GRAY/CMYK） */
export interface ColorSpec {
  value: string;
  alpha?: string;
  colorSpace?: string;
}

export interface ColorSpaceResource {
  id: string;
  /** ColorSpace 的 Type，规范化成大写：RGB / GRAY / CMYK ... */
  type: string;
  bitsPerComponent?: number;
}

export interface DrawParamResource {
  id: string;
  lineWidth?: number;
  stroke?: ColorSpec;
  fill?: ColorSpec;
}

/** OFD 包的最小读取接口，OfdZip 天然满足 */
export interface ResourceReader {
  has(path: string): boolean;
  read(path: string): Uint8Array | null;
  readText(path: string): string;
}

/** 文档级资源上下文：parsePage 内部据此加载 Document.xml 的 CommonData/PublicRes */
export interface DocumentResourceContext {
  reader: ResourceReader;
  docRoot: string;
  /** Document.xml 级资源只解析一次 */
  loaded: boolean;
  /** TemplatePage ID → Content.xml 路径，供页面模板层渲染 */
  templates?: Map<string, string>;
}

export interface PageResources {
  fonts: Map<string, FontResource>;
  images: Map<string, ImageResource>;
  colorSpaces?: Map<string, ColorSpaceResource>;
  drawParams?: Map<string, DrawParamResource>;
  /** CompositeObject ID → 元素 XML 文本，供后续复合对象解析使用 */
  composites?: Map<string, string>;
  /** 由 facade（或测试）绑定，parsePage 不改变签名即可加载文档级 PublicRes */
  document?: DocumentResourceContext;
}

export function createResources(): PageResources {
  return {
    fonts: new Map(),
    images: new Map(),
    colorSpaces: new Map(),
    drawParams: new Map(),
    composites: new Map(),
  };
}
