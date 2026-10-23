import { test, expect } from '@playwright/test';

test('加载多页 OFD 并显示页码', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('.ofdh5-page')).toHaveCount(12);
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.locator('.bar')).toContainText('第 1 页 / 12');
  expect(errors).toEqual([]);
});

test('下一页按钮切换页码', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.locator('.bar')).toContainText('第 2 页 / 12');
});

test('销毁后容器清空', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toBeVisible();
  const empty = await page.evaluate(() => {
    // Vue 2 的 $mount('#app') 会用根组件元素替换 #app，故通过根元素取实例
    const vm = (document.querySelector('.app') as any).__vue__;
    vm.$refs.viewer.destroy();
    return document.querySelector('.ofd-viewer')!.innerHTML;
  });
  expect(empty).toBe('');
});
