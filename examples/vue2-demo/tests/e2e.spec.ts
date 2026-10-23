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
