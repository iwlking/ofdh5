import { test, expect } from '@playwright/test';

test('加载多页 OFD：页码胶囊与页面阴影', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('.ofdh5-page')).toHaveCount(12);
  await expect(page.locator('canvas').first()).toBeVisible();

  const pageNum = (await page.locator('.ofdh5-page-num').innerText()).replace(/\s+/g, '');
  expect(pageNum).toBe('1/12');
  expect(await page.locator('.ofdh5-page-num-bg').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgba(0, 0, 0, 0.5)');
  expect(await page.locator('.ofdh5-page').first().evaluate((el) => getComputedStyle(el).boxShadow))
    .toContain('rgb(169, 169, 169)');

  await page.screenshot({ path: 'screenshots/top.png' });
  expect(errors).toEqual([]);
});

test('下一页按钮切换页码，滚动后出现回到顶部按钮', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();

  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.ofdh5-page-now')).toHaveText('2');

  expect(await page.locator('.ofdh5-back-top').evaluate((el) => getComputedStyle(el).display)).toBe('none');
  await page.locator('.ofdh5-scroller').evaluate((el) => { el.scrollTop = 1400; });
  await expect(page.locator('.ofdh5-back-top')).toHaveCSS('display', 'block');
  await page.screenshot({ path: 'screenshots/scrolled.png' });

  await page.locator('.ofdh5-back-top').click();
  await expect(page.locator('.ofdh5-page-now')).toHaveText('1');
});

test('销毁后容器清空', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();
  const empty = await page.evaluate(() => {
    const vm = document.querySelector('.app').__vue__;
    vm.$refs.viewer.destroy();
    return document.querySelector('.ofd-viewer').innerHTML;
  });
  expect(empty).toBe('');
});

test('缩小不会小于加载尺寸（默认最小 = 1）', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();

  const before = await page.locator('.ofdh5-page canvas').first().boundingBox();

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '缩小' }).click();
    await page.waitForTimeout(120);
  }

  const after = await page.locator('.ofdh5-page canvas').first().boundingBox();
  expect(Math.abs(after!.width - before!.width)).toBeLessThan(1);

  const centerX = after!.x + after!.width / 2;
  expect(Math.abs(centerX - 195)).toBeLessThan(8);
});

test('缩放后页面盒子与 canvas 尺寸一致，内容不溢出', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '缩小' }).click();
    await page.waitForTimeout(120);
  }

  const m = await page.evaluate(() => {
    const box = document.querySelector('.ofdh5-page')!.getBoundingClientRect();
    const canvas = document.querySelector('.ofdh5-page canvas')!.getBoundingClientRect();
    return {
      boxW: box.width, canvasW: canvas.width,
      boxH: box.height, canvasH: canvas.height,
      overflowRight: canvas.right - box.right,
      overflowBottom: canvas.bottom - box.bottom,
    };
  });

  expect(Math.abs(m.boxW - m.canvasW)).toBeLessThan(1.5);
  expect(Math.abs(m.boxH - m.canvasH)).toBeLessThan(1.5);
  expect(Math.abs(m.overflowRight)).toBeLessThan(1.5);
  expect(Math.abs(m.overflowBottom)).toBeLessThan(1.5);
});


test('点击放大以容器中心为锚点，页面不往一侧跑', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();

  const before = await page.locator('.ofdh5-page').first().boundingBox();
  const beforeCenter = before!.x + before!.width / 2;

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '放大' }).click();
    await page.waitForTimeout(150);
  }

  const after = await page.locator('.ofdh5-page').first().boundingBox();
  const afterCenter = after!.x + after!.width / 2;

  console.log('ZOOM', JSON.stringify({ beforeCenter, afterCenter, scale: after!.width / before!.width }));
  expect(after!.width).toBeGreaterThan(before!.width * 1.2);
  // 以容器中心为锚点缩放：页面中心应当留在视口中心附近
  expect(Math.abs(afterCenter - 195)).toBeLessThan(12);
  expect(Math.abs(afterCenter - beforeCenter)).toBeLessThan(12);
});


test('首次加载时显示 loading 动效，加载完成后消失', async ({ page }) => {
  await page.route('**/fixtures/multi-page.ofd', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });

  await page.goto('/');

  const effect = page.locator('.ofdh5-load-effect');
  await expect(effect).toHaveCount(1);
  await expect(effect).toHaveCSS('opacity', '1');

  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20000 });
  await expect(effect).toHaveCSS('opacity', '0');
});

