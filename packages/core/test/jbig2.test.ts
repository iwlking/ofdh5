import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { decodeJbig2, Jbig2Error, type Jbig2Image } from '../src/render/jbig2';
import { createImageCache } from '../src/render/images';
import { OfdZip } from '../src/zip';
import { parseOfdPackage } from '../src/parser/package';
import { parseDocumentMeta } from '../src/parser/document';
import { bindResourceSource } from '../src/parser/resources';
import { parsePage } from '../src/parser/content';
import { createResources } from '../src/types';
import { paintPage } from '../src/render/painter';
import { createViewport } from '../src/render/viewport';

function invoiceImage(): Uint8Array {
  const files = unzipSync(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
  return files['Doc_0/Res/image_78.jb2'];
}

/** RGBA → 1bpp 指纹：黑像素数 + FNV-1a，避免解码回归成「看着像图」的噪声 */
function fingerprint(image: Jbig2Image): { black: number; hash: number } {
  let black = 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < image.data.length; i += 4) {
    const bit = image.data[i] === 0 ? 1 : 0;
    black += bit;
    hash = Math.imul((hash ^ bit) >>> 0, 0x01000193) >>> 0;
  }
  return { black, hash };
}

function sampleSegment(type: number): Uint8Array {
  const bytes = new Uint8Array(8 + 1 + 11);
  bytes.set([0x97, 0x4a, 0x42, 0x32, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(9, 1); // 段号
  bytes[13] = type;
  bytes[14] = 0; // 引用计数 0
  bytes[15] = 1; // 页号
  view.setUint32(16, 0); // 数据长度
  return bytes;
}

describe('JBIG2 解码（GBIG2）', () => {
  it('invoice.ofd 的 image_78.jb2 解出 100x100 二维码', async () => {
    const image = await decodeJbig2(invoiceImage());

    expect(image.width).toBe(100);
    expect(image.height).toBe(100);
    expect(image.data.length).toBe(100 * 100 * 4);
    expect(fingerprint(image)).toEqual({ black: 5085, hash: 0xbc4c3552 });
    expect(image.data[3]).toBe(255); // 不透明
  });

  it('数据被截断时抛出 Jbig2Error 而非崩溃', async () => {
    await expect(decodeJbig2(invoiceImage().subarray(0, 40))).rejects.toBeInstanceOf(Jbig2Error);
  });

  it('随机字节抛出 E_JBIG2_CORRUPT', async () => {
    const bytes = new Uint8Array(64);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + 11) & 0xff;
    await expect(decodeJbig2(bytes)).rejects.toMatchObject({ code: 'E_JBIG2_CORRUPT' });
  });

  it('不支持的段类型抛出带类型的错误', async () => {
    await expect(decodeJbig2(sampleSegment(0))).rejects.toMatchObject({
      code: 'E_JBIG2_UNSUPPORTED',
      segmentType: 0,
    });
  });

  it('发票页的图片资源带 GBIG2 格式并透传到 ImageItem', () => {
    const zip = new OfdZip(new Uint8Array(readFileSync(resolve(__dirname, 'fixtures', 'invoice.ofd'))));
    const pkg = parseOfdPackage(zip.readText('OFD.xml'));
    const docRoot = pkg.docRoots[0];
    const meta = parseDocumentMeta(zip.readText(docRoot), docRoot);
    const resources = bindResourceSource(createResources(), zip, docRoot);
    const page = parsePage(zip.readText(meta.pages[0].loc), 0, resources, undefined, meta.pages[0].loc);

    const image = page.items.find((item) => item.kind === 'image');
    expect(image).toBeDefined();
    expect(resources.images.get(image!.resId)?.format).toBe('GBIG2');
    expect(resources.images.get(image!.resId)?.mime).toBe('image/jbig2');
    expect(image!.kind === 'image' && image!.format).toBe('GBIG2');
  });

  it('带 CTM 的图片按单位正方形绘制，尺寸取自 CTM', () => {
    const calls: unknown[][] = [];
    const ctx = {
      setTransform() {},
      fillRect() {},
      save() {},
      restore() {},
      translate: (...args: unknown[]) => calls.push(['translate', ...args]),
      transform: (...args: unknown[]) => calls.push(['transform', ...args]),
      drawImage: (...args: unknown[]) => calls.push(['drawImage', ...args]),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    const page = {
      index: 0,
      width: 210,
      height: 140,
      items: [
        {
          kind: 'image' as const,
          boundary: [8.5, 3.5, 20, 20] as [number, number, number, number],
          ctm: [20, 0, 0, 20, 0, 0],
          resId: '78',
          mime: 'image/jbig2',
          format: 'GBIG2',
          width: 100,
          height: 100,
        },
      ],
    };
    const vp = createViewport(page, 420, 1, 1);
    paintPage(ctx, page, vp, {
      background: '#fff',
      fontFamily: () => 'sans-serif',
      getImage: () => ({ width: 100, height: 100 }) as unknown as CanvasImageSource,
    });

    const drawn = calls.find((call) => call[0] === 'drawImage');
    expect(drawn?.slice(2)).toEqual([0, 0, 1, 1]);
    expect(calls.find((call) => call[0] === 'translate')?.slice(1)).toEqual([8.5, 3.5]);
    expect(calls.find((call) => call[0] === 'transform')?.slice(1)).toEqual([20, 0, 0, 20, 0, 0]);
  });

  it('图片缓存按 GBIG2 分支解码，jsdom 下返回栅格位图', async () => {
    const cache = createImageCache({ read: () => invoiceImage() });
    const image = await cache.load('78', 'Doc_0/Res/image_78.jb2', 'GBIG2');

    expect(image).not.toBeNull();
    expect(image!.width).toBe(100);
    expect(image!.height).toBe(100);
    expect((image as { data: Uint8ClampedArray }).data.length).toBe(100 * 100 * 4);
  });

  it('JBIG2 解码失败时缓存返回 null，不影响其它图片', async () => {
    const cache = createImageCache({ read: () => new Uint8Array(16) });
    expect(await cache.load('bad', 'Doc_0/Res/bad.jb2', 'GBIG2')).toBeNull();
    expect(cache.size).toBe(0);
  });
});
