import { decodeGenericRegion, type Bitmap } from './jbig2/generic';

export type Jbig2ErrorCode = 'E_JBIG2_UNSUPPORTED' | 'E_JBIG2_CORRUPT';

/** JBIG2 解码失败：unsupported 表示结构合法但当前不支持，上层应降级为「不渲染该图」 */
export class Jbig2Error extends Error {
  readonly code: Jbig2ErrorCode;
  /** 触发错误的段类型（T.88 7.3），便于定位 */
  readonly segmentType?: number;

  constructor(code: Jbig2ErrorCode, message: string, segmentType?: number) {
    super(message);
    this.name = 'Jbig2Error';
    this.code = code;
    this.segmentType = segmentType;
  }
}

export interface Jbig2Image {
  width: number;
  height: number;
  /** RGBA 像素，可直接交给 new ImageData(...) */
  data: Uint8ClampedArray;
}

const MAGIC = [0x97, 0x4a, 0x42, 0x32, 0x0d, 0x0a, 0x1a, 0x0a];

/** T.88 7.3 段类型 */
const SegType = {
  SymbolDictionary: 0,
  IntermediateTextRegion: 4,
  ImmediateTextRegion: 6,
  ImmediateLosslessTextRegion: 7,
  PatternDictionary: 16,
  IntermediateHalftoneRegion: 20,
  ImmediateHalftoneRegion: 22,
  ImmediateLosslessHalftoneRegion: 23,
  IntermediateGenericRegion: 36,
  ImmediateGenericRegion: 38,
  ImmediateLosslessGenericRegion: 39,
  IntermediateRefinementRegion: 40,
  ImmediateRefinementRegion: 42,
  ImmediateLosslessRefinementRegion: 43,
  PageInformation: 48,
  EndOfPage: 49,
  EndOfStripe: 50,
  EndOfFile: 51,
  Profiles: 52,
  Tables: 53,
  Extension: 62,
} as const;

/** 单张图允许的最大像素数，超过视为损坏，避免恶意数据撑爆内存 */
const MAX_PIXELS = 16 * 1024 * 1024;

const GENERIC_REGIONS = new Set<number>([
  SegType.IntermediateGenericRegion,
  SegType.ImmediateGenericRegion,
  SegType.ImmediateLosslessGenericRegion,
]);

const UNSUPPORTED_NAMES: Record<number, string> = {
  [SegType.SymbolDictionary]: '符号字典（Symbol Dictionary）',
  [SegType.IntermediateTextRegion]: '文本区域（Text Region）',
  [SegType.ImmediateTextRegion]: '文本区域（Text Region）',
  [SegType.ImmediateLosslessTextRegion]: '文本区域（Text Region）',
  [SegType.PatternDictionary]: '图案字典（Pattern Dictionary）',
  [SegType.IntermediateHalftoneRegion]: '半色调区域（Halftone Region）',
  [SegType.ImmediateHalftoneRegion]: '半色调区域（Halftone Region）',
  [SegType.ImmediateLosslessHalftoneRegion]: '半色调区域（Halftone Region）',
  [SegType.IntermediateRefinementRegion]: '细化区域（Refinement Region）',
  [SegType.ImmediateRefinementRegion]: '细化区域（Refinement Region）',
  [SegType.ImmediateLosslessRefinementRegion]: '细化区域（Refinement Region）',
  [SegType.Extension]: '扩展段（Extension）',
};

interface SegmentHeader {
  number: number;
  type: number;
  page: number;
  dataStart: number;
  length: number;
}

interface PlacedRegion {
  bitmap: Bitmap;
  x: number;
  y: number;
}

function corrupt(message: string): Jbig2Error {
  return new Jbig2Error('E_JBIG2_CORRUPT', message);
}

function readUint32(view: DataView, p: number): number {
  if (p + 4 > view.byteLength) throw corrupt('数据被截断（读取 4 字节失败）');
  return view.getUint32(p);
}

function readUint8(view: DataView, p: number): number {
  if (p + 1 > view.byteLength) throw corrupt('数据被截断（读取 1 字节失败）');
  return view.getUint8(p);
}

/** 从候选位置向后探测第一个能完整落在缓冲区内的段头（最多 8 字节），兼容非标准前缀 */
function findFirstSegment(view: DataView, start: number): number {
  for (let p = start; p < Math.min(start + 8, view.byteLength); p++) {
    try {
      const header = readSegmentHeader(view, p);
      if (header.type <= 62 && header.dataStart + header.length <= view.byteLength) return p;
    } catch {
      /* 继续尝试下一个位置 */
    }
  }
  return start;
}

/** 解析段头，返回段数据起始位置与长度 */
function readSegmentHeader(view: DataView, start: number): SegmentHeader {
  const number = readUint32(view, start);
  const flags = readUint8(view, start + 4);
  const type = flags & 0x3f;
  const pageAssocSize = (flags & 0x40) !== 0;

  const referredFlags = readUint8(view, start + 5);
  let count = (referredFlags >> 5) & 7;
  let position = start + 6;
  if (referredFlags === 7) {
    count = readUint32(view, position - 1) & 0x1fffffff;
    position += 3;
    position += (count + 7) >> 3; // 保留标志位
  } else if (referredFlags === 5 || referredFlags === 6) {
    throw corrupt(`段 ${number} 的引用计数非法`);
  }

  // 被引用段号的字节宽度随段号大小变化
  let numberSize = 4;
  if (number <= 256) numberSize = 1;
  else if (number <= 65536) numberSize = 2;
  position += count * numberSize;

  const page = pageAssocSize ? readUint32(view, position) : readUint8(view, position);
  position += pageAssocSize ? 4 : 1;

  const length = readUint32(view, position);
  position += 4;

  return { number, type, page, dataStart: position, length };
}

/** 通用区域段头（T.88 7.4）：区域信息 16 字节 + 标志 1 字节 + 自适应模板像素 */
function isCausalAt(at: ReadonlyArray<readonly [number, number]>): boolean {
  return at.every(([x, y]) => y < 0 || (y === 0 && x < 0));
}

function parseGenericRegion(view: DataView, start: number) {
  const read = (headerExtra: number) => {
    const width = readUint32(view, start);
    const height = readUint32(view, start + 4);
    const x = view.getInt32(start + 8);
    const y = view.getInt32(start + 12);
    const flagsAt = start + 16 + headerExtra;
    const flags = readUint8(view, flagsAt);
    const mmr = (flags & 0x01) !== 0;
    const template = (flags >> 1) & 3;
    const prediction = (flags & 0x08) !== 0;
    const atCount = mmr ? 0 : template === 0 ? 4 : 1;
    if (flagsAt + 1 + atCount * 2 > view.byteLength) throw corrupt('通用区域的自适应模板像素被截断');
    const at: Array<[number, number]> = [];
    for (let i = 0; i < atCount; i++) {
      at.push([view.getInt8(flagsAt + 1 + i * 2), view.getInt8(flagsAt + 2 + i * 2)]);
    }
    return {
      width,
      height,
      x,
      y,
      mmr,
      template,
      prediction,
      at,
      dataStart: flagsAt + 1 + atCount * 2,
    };
  };

  if (start + 17 > view.byteLength) throw corrupt('通用区域段头被截断');
  const standard = read(0);
  // 少数国产封装在区域信息与标志字节之间多写入 1 字节，表现为自适应模板像素指向未来像素；
  // 此时把标志位与模板像素整体后移 1 字节再解析一次。
  if (!standard.mmr && !isCausalAt(standard.at)) {
    try {
      const shifted = read(1);
      if (isCausalAt(shifted.at)) return shifted;
    } catch {
      /* 保持标准解析结果 */
    }
  }
  return standard;
}

function blit(page: Uint8Array, pageWidth: number, pageHeight: number, region: PlacedRegion): void {
  const { bitmap } = region;
  const x0 = Math.max(0, region.x);
  const y0 = Math.max(0, region.y);
  const x1 = Math.min(pageWidth, region.x + bitmap.width);
  const y1 = Math.min(pageHeight, region.y + bitmap.height);
  for (let y = y0; y < y1; y++) {
    const src = (y - region.y) * bitmap.width - region.x;
    const dst = y * pageWidth;
    for (let x = x0; x < x1; x++) page[dst + x] = bitmap.data[src + x];
  }
}

function toRgba(page: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(255);
  for (let i = 0, j = 0; i < page.length; i++, j += 4) {
    if (page[i]) {
      rgba[j] = 0;
      rgba[j + 1] = 0;
      rgba[j + 2] = 0;
    }
  }
  return rgba;
}

function decode(bytes: Uint8Array): Jbig2Image {
  if (bytes.length < 12) throw corrupt('JBIG2 数据过短');
  const hasHeader = MAGIC.every((b, i) => bytes[i] === b);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 文件头 = 8 字节标识 + 1 字节标志；OFD 里也常见省略文件头的裸段流。
  // 少数封装在标志字节后还写入了额外字节，因此向后探测第一个可自洽解析的段头。
  let offset = findFirstSegment(view, hasHeader ? Math.min(9, bytes.length) : 0);

  let pageWidth = 0;
  let pageHeight = 0;
  let defaultPixel = 0;
  const regions: PlacedRegion[] = [];
  let sawPageEnd = false;

  while (offset < bytes.length) {
    const header = readSegmentHeader(view, offset);
    const dataStart = header.dataStart;
    const dataEnd = dataStart + header.length;
    if (dataEnd > bytes.length) throw corrupt(`段 ${header.number} 的长度越界`);
    offset = dataEnd;

    if (header.type === SegType.PageInformation) {
      pageWidth = readUint32(view, dataStart);
      pageHeight = readUint32(view, dataStart + 4);
      const flags = readUint8(view, dataStart + 16);
      defaultPixel = flags & 1;
      continue;
    }

    if (GENERIC_REGIONS.has(header.type)) {
      const params = parseGenericRegion(view, dataStart);
      if (params.mmr) {
        throw new Jbig2Error('E_JBIG2_UNSUPPORTED', '暂不支持 MMR（G4）编码的通用区域', header.type);
      }
      if (!params.width || !params.height) continue;
      if (params.width * params.height > MAX_PIXELS) throw corrupt('通用区域尺寸超出上限');
      const bitmap = decodeGenericRegion(bytes.subarray(params.dataStart, dataEnd), {
        width: params.width,
        height: params.height,
        template: params.template,
        prediction: params.prediction,
        at: params.at,
      });
      regions.push({ bitmap, x: params.x, y: params.y });
      continue;
    }

    if (header.type === SegType.EndOfPage || header.type === SegType.EndOfFile) {
      sawPageEnd = true;
      break;
    }
    if (header.type === SegType.EndOfStripe || header.type === SegType.Profiles || header.type === SegType.Tables) {
      continue;
    }

    const name = UNSUPPORTED_NAMES[header.type] ?? `段类型 ${header.type}`;
    throw new Jbig2Error('E_JBIG2_UNSUPPORTED', `暂不支持${name}`, header.type);
  }

  if (regions.length === 0) throw corrupt(sawPageEnd ? '页面没有任何位图区域' : '未找到位图区域');

  if (!pageWidth || !pageHeight) {
    // 缺少页信息段时按区域包围盒推断
    let maxX = 0;
    let maxY = 0;
    for (const region of regions) {
      maxX = Math.max(maxX, region.x + region.bitmap.width);
      maxY = Math.max(maxY, region.y + region.bitmap.height);
    }
    pageWidth = maxX;
    pageHeight = maxY;
  }

  if (pageWidth * pageHeight > MAX_PIXELS) throw corrupt('页尺寸超出上限');

  const page = new Uint8Array(pageWidth * pageHeight);
  if (defaultPixel) page.fill(1);
  for (const region of regions) blit(page, pageWidth, pageHeight, region);

  return { width: pageWidth, height: pageHeight, data: toRgba(page, pageWidth, pageHeight) };
}

/**
 * 解码 JBIG2 / OFD 的 GBIG2 图像为 RGBA 位图。
 * 入口异步：先让出一次宏任务，避免大图解码抢占首帧。
 */
export async function decodeJbig2(bytes: Uint8Array): Promise<Jbig2Image> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return decode(bytes);
}
