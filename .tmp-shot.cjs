const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('D:/02_projects/public/ofdh5/node_modules/playwright-core');

const root = 'D:/02_projects/public/ofdh5';
const types = { '.html':'text/html', '.js':'application/javascript', '.ofd':'application/octet-stream', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/examples/umd-demo.html';
  const file = path.join(root, p);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise((r) => server.listen(5191, '127.0.0.1', r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://127.0.0.1:5191/examples/umd-demo.html', { waitUntil: 'load' });
  await page.waitForSelector('.ofdh5-page canvas', { timeout: 20000 });
  await page.waitForTimeout(600);

  fs.mkdirSync(path.join(root, 'docs/screenshots'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'docs/screenshots/umd-top.png') });

  const beforeVisible = await page.locator('.ofdh5-back-top').evaluate((el) => getComputedStyle(el).display);
  await page.locator('.ofdh5-scroller').evaluate((el) => { el.scrollTop = 1400; });
  await page.waitForTimeout(600);
  const afterVisible = await page.locator('.ofdh5-back-top').evaluate((el) => getComputedStyle(el).display);
  await page.screenshot({ path: path.join(root, 'docs/screenshots/umd-scrolled.png') });

  const pageNumText = await page.locator('.ofdh5-page-num').innerText();
  const canvasCount = await page.locator('.ofdh5-page canvas').count();
  console.log(JSON.stringify({ beforeVisible, afterVisible, pageNumText: pageNumText.replace(/\s+/g,''), canvasCount, errors }, null, 2));

  await browser.close();
  server.close();
})();
