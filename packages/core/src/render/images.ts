export type DecodedImage = ImageBitmap | HTMLImageElement;

export interface ImageSource {
  read(path: string): Uint8Array | null;
}

export interface ImageCache {
  load(id: string, path: string): Promise<DecodedImage | null>;
  get(id: string): DecodedImage | undefined;
  clear(): void;
  readonly size: number;
}

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

export function createImageCache(source: ImageSource, limit = 32): ImageCache {
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
    async load(id, path) {
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

      const task = decode(toBlob(data, ''))
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
