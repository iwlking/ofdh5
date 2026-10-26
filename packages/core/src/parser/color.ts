import type { RgbColor } from '../types';

export type ColorSpaceType = 'RGB' | 'GRAY' | 'CMYK';

const COLOR_SPACES: ColorSpaceType[] = ['RGB', 'GRAY', 'CMYK'];

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** `0 0 0` 这类三分量色值：全部 <=1 时按 0-1 归一化，否则按 0-255 */
function isNormalized(parts: number[]): boolean {
  return parts.every((item) => item >= 0 && item <= 1);
}

/** 单通道：<=1 视为 0-1（规范里是 0~255，但不少生成器写归一化值） */
function grayChannel(value: number): number {
  return clampChannel(value <= 1 ? value * 255 : value);
}

function normalizeSpace(colorSpace?: string | null): ColorSpaceType | undefined {
  if (!colorSpace) return undefined;
  const key = colorSpace.trim().toUpperCase();
  return (COLOR_SPACES as string[]).includes(key) ? (key as ColorSpaceType) : undefined;
}

function cmykToRgb(parts: number[]): [number, number, number] {
  // OFD 规范 CMYK 分量为 0~255；兼容写成 0-1 的生成器
  const [c, m, y, k] = parts.slice(0, 4).map((item) => clampUnit(item > 1 ? item / 255 : item));
  return [Math.round(255 * (1 - c) * (1 - k)), Math.round(255 * (1 - m) * (1 - k)), Math.round(255 * (1 - y) * (1 - k))];
}

/**
 * 解析 OFD 色值。
 * - colorSpace 为 RGB/GRAY/CMYK 时按对应分量数解释（显式 ColorSpace 资源）
 * - 未知或未提供时退回启发式：1 分量灰度、3 分量 RGB、4 分量 CMYK
 */
export function parseColor(
  value: string | null,
  alpha?: string | null,
  colorSpace?: string | null,
): RgbColor | undefined {
  if (!value || !value.trim()) return undefined;
  const parts = value
    .trim()
    .split(/\s+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item));
  if (parts.length === 0) return undefined;

  const space = normalizeSpace(colorSpace);
  let r = 0;
  let g = 0;
  let b = 0;

  if (space === 'RGB' && parts.length >= 3) {
    const scale = isNormalized(parts) ? 255 : 1;
    r = clampChannel(parts[0] * scale);
    g = clampChannel(parts[1] * scale);
    b = clampChannel(parts[2] * scale);
  } else if (space === 'GRAY') {
    r = g = b = grayChannel(parts[0]);
  } else if (space === 'CMYK' && parts.length >= 4) {
    [r, g, b] = cmykToRgb(parts);
  } else if (parts.length === 1) {
    const gray = parts[0];
    r = g = b = clampChannel(gray <= 1 ? gray * 255 : gray);
  } else if (parts.length === 3) {
    const scale = isNormalized(parts) ? 255 : 1;
    r = clampChannel(parts[0] * scale);
    g = clampChannel(parts[1] * scale);
    b = clampChannel(parts[2] * scale);
  } else {
    // CMYK 近似：支持 0-1 与 0-100 两种写法
    const [c, m, y, k] = parts
      .slice(0, 4)
      .map((item) => (item > 1 ? item / 100 : item))
      .map((item) => clampUnit(item));
    r = Math.round(255 * (1 - c) * (1 - k));
    g = Math.round(255 * (1 - m) * (1 - k));
    b = Math.round(255 * (1 - y) * (1 - k));
  }

  let a = 1;
  if (alpha != null && alpha !== '') {
    const parsed = Number.parseFloat(alpha);
    if (Number.isFinite(parsed)) {
      // 128/255 这类换算会带来长尾小数，保留三位足够表达 8bit Alpha
      a = Math.round((parsed > 1 ? Math.min(1, parsed / 255) : Math.max(0, parsed)) * 1000) / 1000;
    }
  }

  return { r, g, b, a };
}

export function toCssColor(color: RgbColor): string {
  return `rgba(${color.r},${color.g},${color.b},${color.a})`;
}
