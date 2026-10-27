import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 真实发票是本地数据，不入库；缺失时整组跳过
const INVOICE = resolve(__dirname, '../public/fixtures/044002000311_72262900.ofd');
test.skip(!existsSync(INVOICE), '本地发票样例缺失');


test('电子发票：模板页与正文都渲染出内容', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?file=/fixtures/044002000311_72262900.ofd');
  await page.waitForSelector('.ofdh5-page canvas', { timeout: 20000 });
  await page.waitForTimeout(900);

  const stats = await page.evaluate(() => {
    const canvas = document.querySelector('.ofdh5-page canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 240 || data[i + 1] < 240 || data[i + 2] < 240) ink += 1;
    }
    return { ink, total: canvas.width * canvas.height, w: canvas.width, h: canvas.height };
  });

  console.log('INK', JSON.stringify(stats));
  expect(stats.ink).toBeGreaterThan(stats.total * 0.01);
  await page.screenshot({ path: 'screenshots/invoice.png' });
  expect(errors).toEqual([]);
});

test('印章落在税局监制章位置（90,8 起 30x20），不在页脚', async ({ page }) => {
  await page.goto('/?file=/fixtures/044002000311_72262900.ofd');
  await page.waitForSelector('.ofdh5-page canvas', { timeout: 20000 });
  await page.waitForTimeout(900);

  const result = await page.evaluate(() => {
    const canvas = document.querySelector('.ofdh5-page canvas') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const ppmm = canvas.width / 210;
    const countRed = (box: number[]) => {
      let n = 0;
      for (let y = Math.floor(box[1] * ppmm); y < Math.floor(box[3] * ppmm); y++) {
        for (let x = Math.floor(box[0] * ppmm); x < Math.floor(box[2] * ppmm); x++) {
          const i = (y * canvas.width + x) * 4;
          if (data[i] > 140 && data[i + 1] < 130 && data[i + 2] < 130) n += 1;
        }
      }
      return n;
    };
    return { top: countRed([90, 8, 120, 28]), bottom: countRed([4.5, 104, 119.5, 124]) };
  });

  console.log('SEAL', JSON.stringify(result));
  expect(result.top).toBeGreaterThan(200);
  // 页脚区域仍有模板红线/文字，印章应当让顶部红色显著多于底部
  expect(result.top).toBeGreaterThan(result.bottom * 1.5);
});

