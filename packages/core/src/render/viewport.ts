export const MM_TO_PX = 96 / 25.4;

export interface PageSizeLike {
  width: number;
  height: number;
}

export interface Viewport {
  cssWidth: number;
  cssHeight: number;
  pxPerMm: number;
  dpr: number;
}

export function createViewport(page: PageSizeLike, containerWidth: number, scale: number, dpr: number): Viewport {
  const cssWidth = Math.max(1, Math.round(containerWidth * scale));
  const pxPerMm = cssWidth / page.width;
  return {
    cssWidth,
    cssHeight: Math.round(page.height * pxPerMm),
    pxPerMm,
    dpr,
  };
}

export function clampScale(scale: number, min: number, max: number): number {
  if (!Number.isFinite(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}
