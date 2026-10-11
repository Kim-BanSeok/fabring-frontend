const { chromium } = require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const results = { checks: [], errors: [], supplementaryScreens: [] };
  page.on('pageerror', error => results.errors.push(error.message));
  const go = async route => { await page.goto('http://127.0.0.1:5173/#' + route); await page.locator('main h1').waitFor(); };
  const check = async (name, fn) => {
    try { await fn(); results.checks.push({ name, pass: true }); }
    catch (error) { results.checks.push({ name, pass: false, error: error.message }); }
  };
  try {
    for (const viewport of [{ width: 1366, height: 600 }, { width: 320, height: 844 }]) {
      await page.setViewportSize(viewport);
      await check(`${viewport.width}: calendar link relocation`, async () => {
        await go('/seller/dashboard?scenario=123%3A2473');
        assert.equal(await page.locator('.seller-section-heading').getByRole('link', { name: '월별 픽업 일정 보기' }).count(), 1);
        await page.getByRole('link', { name: '월별 픽업 일정 보기' }).click();
        await page.getByRole('heading', { name: '픽업 일정', exact: true }).waitFor();
        const before = page.url(); await page.getByRole('link', { name: '다음 달', exact: true }).click();
        await page.waitForURL(url => url.href !== before);
        await page.getByRole('link', { name: '대시보드로', exact: true }).click();
        await page.getByRole('heading', { name: /반가워요/ }).waitFor();
      });
      await check(`${viewport.width}: registration method buttons`, async () => {
        await go('/seller/register?scenario=123%3A3245');
        await page.getByRole('link', { name: '직접 입력하기', exact: true }).click();
        await page.getByRole('link', { name: '롤 원단 입력', exact: true }).click();
        await page.locator('#seller-fabric-form').waitFor();
        await go('/seller/register?scenario=123%3A3245');
        await page.getByRole('link', { name: 'AI와 대화 시작', exact: true }).click();
        await page.getByRole('link', { name: '자투리 원단으로 시작', exact: true }).click();
        await page.locator('#seller-ai-form').waitFor();
      });
      await check(`${viewport.width}: partial photo retry`, async () => {
        await go('/seller/upload?scenario=210%3A8628');
        await page.getByRole('button', { name: '실패한 사진 다시 시도', exact: true }).click();
        await page.getByRole('heading', { name: '승인 신청을 보냈어요', exact: true }).waitFor();
        await page.getByRole('link', { name: '승인 대기 목록', exact: true }).click();
        await page.getByRole('heading', { name: '승인 대기 중인 원단', exact: true }).waitFor();
      });
      await check(`${viewport.width}: completed reservation stock button`, async () => {
        await go('/seller/reservations?status=PICKED_UP&id=reservation-scenario&scenario=127%3A7892');
        await page.getByRole('link', { name: '변경된 재고 확인', exact: true }).click();
        await page.getByRole('heading', { name: '재고 현황', exact: true }).waitFor();
      });
      for (const [name, route] of [
        ['type', '/seller/register/type?scenario=127%3A6016'],
        ['ai-result', '/seller/register/ai?type=ROLL&step=result&scenario=127%3A6528'],
        ['ai-error', '/seller/register/ai?type=ROLL&step=error&scenario=127%3A6588'],
        ['delete', '/seller/fabrics/delete?id=fabric-scrap-1&scenario=127%3A7448'],
        ['calendar', '/seller/calendar?month=2026-10&scenario=142%3A6919'],
        ['store', '/seller/store?scenario=127%3A5855']
      ]) {
        await go(route); await page.evaluate(() => document.fonts.ready);
        const width = await page.evaluate(() => document.documentElement.scrollWidth);
        await page.screenshot({ path: path.join(__dirname, `after-${viewport.width}x${viewport.height}-${name}.png`) });
        results.supplementaryScreens.push({ name, viewport, width, overflow: width > viewport.width });
      }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'click-results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.errors.length || results.checks.some(row => !row.pass) || results.supplementaryScreens.some(row => row.overflow)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
