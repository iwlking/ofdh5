import type { RgbColor } from '../types';

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** `0 0 0` 这类三分量色值：全部 <=1 时按 0-1 归一化，否则按 0-255 */
function isNormalized(parts: number[]): boolean {
  return parts.every((item) => item >= 0 && item <= 1);
}

export function parseColor(value: string | null, alpha?: string | null): RgbColor | undefined {
  if (!value || !value.trim()) return undefined;
  const parts = value
    .trim()
    .split(/\s+/)
    .map((item) => Number.parseFloat(item))
    .filter((item) => Number.isFinite(item));
  if (parts.length === 0) return undefined;

  let r = 0;
  let g = 0;
  let b = 0;

  if (parts.length === 1) {
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
      .map((item) => Math.max(0, Math.min(1, item)));
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
