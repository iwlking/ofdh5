import { decodeJbig2 } from './jbig2';

/** 位图栅格：ImageData 的结构子集，便于在无 DOM 的环境（jsdom）下传递解码结果 */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type DecodedImage =
  | ImageBitmap
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageData
  | RasterImage;

export interface ImageSource {
  read(path: string): Uint8Array | null;
}

export interface ImageCache {
  /** format 取自 MultiMedia/@Format，例如 GBIG2；缺省时按文件后缀判断 */
  load(id: string, path: string, format?: string): Promise<DecodedImage | null>;
  get(id: string): DecodedImage | undefined;
  clear(): void;
  readonly size: number;
}

export interface ImageCacheOptions {
  /** 注入 createImageBitmap，便于在没有该 API 的环境（jsdom）下测试 */
  createBitmap?: (image: RasterImage) => Promise<ImageBitmap>;
}

/** OFD 里 JBIG2 图像的 Format 取值 */
const JBIG2_FORMATS = new Set(['GBIG2', 'JBIG2', 'JBIG-2', 'JBG2']);

function toBlob(data: Uint8Array, mime: string): Blob {
  return new Blob([data.slice()], { type: mime || 'image/png' });
}

async function decode(blob: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* 回退到 HTMLImageElement */
    }
  }
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export function isJbig2Image(format: string | undefined, path: string): boolean {
  if (format && JBIG2_FORMATS.has(format.trim().toUpperCase())) return true;
  const lower = path.toLowerCase();
  return lower.endsWith('.jb2') || lower.endsWith('.jbig2');
}

/** 把 ImageData 画进离屏 canvas，得到可直接 drawImage 的源 */
function toCanvas(image: ImageData): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function decodeJbig2Image(
  data: Uint8Array,
  options: ImageCacheOptions,
): Promise<DecodedImage | null> {
  const image = await decodeJbig2(data);
  const raster: RasterImage = { width: image.width, height: image.height, data: image.data };
  // jsdom 等环境没有 ImageData，退化到纯栅格对象供测试断言
  const pixels = typeof ImageData === 'function' ? new ImageData(image.width, image.height) : null;
  if (pixels) pixels.data.set(image.data);

  const factory =
    options.createBitmap ??
    (typeof createImageBitmap === 'function'
      ? (source: RasterImage) => createImageBitmap(source as ImageData)
      : undefined);
  if (factory) {
    try {
      return await factory(pixels ?? raster);
    } catch {
      /* 回退到 canvas / 栅格 */
    }
  }
  if (pixels) {
    const canvas = toCanvas(pixels);
    if (canvas) return canvas;
  }
  return pixels ?? raster;
}

export function createImageCache(
  source: ImageSource,
  limit = 32,
  options: ImageCacheOptions = {},
): ImageCache {
  const cache = new Map<string, DecodedImage>();
  const pending = new Map<string, Promise<DecodedImage | null>>();

  function evictIfNeeded(): void {
    while (cache.size > limit) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      const image = cache.get(oldest.value);
      if (image && 'close' in image) image.close();
      cache.delete(oldest.value);
    }
  }

  return {
    async load(id, path, format) {
      const hit = cache.get(id);
      if (hit) {
        cache.delete(id);
        cache.set(id, hit);
        return hit;
      }
      const running = pending.get(id);
      if (running) return running;

      const data = source.read(path);
      if (!data) return null;

      const task = (
        isJbig2Image(format, path)
          ? decodeJbig2Image(data, options).catch((error) => {
              // 不支持的 JBIG2 只放弃这张图，不影响整页渲染
              console.warn('[ofdh5] JBIG2 图像解码失败，已跳过:', path, error);
              return null;
            })
          : decode(toBlob(data, ''))
      )
        .then((image) => {
          if (image) {
            cache.set(id, image);
            evictIfNeeded();
          }
          return image;
        })
        .finally(() => pending.delete(id));

      pending.set(id, task);
      return task;
    },
    get(id) {
      return cache.get(id);
    },
    clear() {
      for (const image of cache.values()) {
        if (image && 'close' in image) image.close();
      }
      cache.clear();
    },
    get size() {
      return cache.size;
    },
  };
}

/** 栅格结果不能直接 drawImage，需要上层跳过或先转成 ImageBitmap */
export function isRasterImage(image: DecodedImage): image is RasterImage {
  return 'data' in image;
}
