const { chromium } = require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext(), page = await context.newPage(), results = [];
  try {
    for (const viewport of [{ width: 320, height: 844 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      await page.goto('http://127.0.0.1:5173/#/seller/calendar?month=2026-10&scenario=142%3A6919');
      await page.getByRole('heading', { name: '2026년 10월' }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(__dirname, `after-${viewport.width}x${viewport.height}-calendar.png`) });
      const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, rows: [...document.querySelectorAll('.seller-calendar-full .seller-calendar-day')].map(n => n.getBoundingClientRect().height), buttons: [...document.querySelectorAll('.seller-calendar-actions .button')].map(n => ({ text: n.textContent, top: n.getBoundingClientRect().top, width: n.getBoundingClientRect().width })) }));
      assert.equal(geometry.width, viewport.width);
      if (viewport.width < 640) assert.equal(new Set(geometry.buttons.map(n => n.top)).size, 1);
      await page.getByRole('link', { name: '다음 달', exact: true }).click();
      await page.getByRole('heading', { name: '2026년 11월' }).waitFor();
      await page.getByRole('link', { name: '이전 달', exact: true }).click();
      await page.getByRole('heading', { name: '2026년 10월' }).waitFor();
      results.push({ viewport, geometry, monthNavigation: 'passed' });
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(__dirname, 'calendar-results.json'), JSON.stringify(results, null, 2)); }
  console.log(JSON.stringify({ tested: results.length, passed: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
