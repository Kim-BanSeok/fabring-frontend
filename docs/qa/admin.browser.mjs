import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const out = fileURLToPath(new URL('./', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
const errors = [], checks = [], dimensions = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
async function go(path) {
  await page.goto(`http://127.0.0.1:5173/#${path}`);
  await page.locator('#main-content h1').waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.notEqual(await page.locator('#main-content h1').textContent(), '화면을 불러오지 못했어요');
}
async function shot(name) {
  await page.waitForFunction(() => !document.querySelector('#feedback')?.textContent, { timeout: 6000 });
  await page.screenshot({ path: `${out}admin-${name}.png`, fullPage: true });
}
try {
  await go('/admin/dashboard');
  assert.equal(await page.locator('.admin-dashboard-table tbody tr').count(), 5);
  await shot('dashboard-desktop');
  await go('/admin/sellers?status=PENDING');
  assert.equal(await page.locator('.admin-seller-table tbody tr').count(), 1);
  await shot('sellers-desktop');
  await page.getByRole('link', { name: '이정원 판매자 상세보기' }).click();
  await page.getByRole('button', { name: '판매자 승인 거절', exact: true }).waitFor();
  await shot('seller-detail-desktop');
  await page.getByRole('button', { name: '판매자 승인 거절', exact: true }).click();
  await page.getByRole('button', { name: '판매자 승인', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '판매자 승인 거절', exact: true }).count(), 0);
  await page.getByRole('button', { name: '판매자 승인', exact: true }).click();
  await page.getByText('승인 완료 · 매장 정보가 준비되면 원단을 등록할 수 있어요.').waitFor();
  assert.equal(await page.locator('[data-admin-review-seller]').count(), 0);
  checks.push('Seller PENDING → REJECTED → APPROVED; legal action availability verified');

  await go('/admin/fabrics?status=PENDING');
  await shot('fabrics-desktop');
  await page.getByRole('link', { name: '내추럴 코튼 캔버스', exact: true }).click();
  await page.getByRole('link', { name: '게시 승인 거절', exact: true }).waitFor();
  await shot('fabric-detail-desktop');
  await page.getByRole('link', { name: '게시 승인 거절', exact: true }).click();
  await page.getByLabel('거절 사유').fill('   ');
  await page.getByRole('button', { name: '거절 확정', exact: true }).click();
  await page.getByText('거절 사유를 1~255자로 입력해 주세요.', { exact: true }).waitFor();
  await page.getByLabel('거절 사유').fill('사용 가능한 전체 길이를 확인할 수 있는 사진을 보완해 주세요.');
  await shot('fabric-reject-desktop');
  await page.getByRole('button', { name: '거절 확정', exact: true }).click();
  await page.getByRole('heading', { name: '등록 원단 상세', exact: true }).waitFor();
  await page.getByText('사용 가능한 전체 길이를 확인할 수 있는 사진을 보완해 주세요.', { exact: true }).waitFor();
  await go('/admin/fabrics?status=REJECTED');
  assert.equal(await page.locator('.admin-fabric-table tbody tr').count(), 1);
  checks.push('Fabric rejection trims/validates reason and displays it in detail and filtered result');

  await page.getByLabel('상태', { exact: true }).selectOption('PENDING');
  await page.waitForURL('**/#/admin/fabrics?status=PENDING');
  await page.getByRole('link', { name: '아이보리 코튼 거즈', exact: true }).click();
  await page.getByRole('link', { name: '원단 게시 승인', exact: true }).last().click();
  await page.getByRole('button', { name: '승인 확정', exact: true }).click();
  await page.getByText('게시 중 · 구매자에게 공개된 원단입니다.', { exact: true }).waitFor();
  await go('/admin/fabrics?status=POSTED');
  assert.equal(await page.locator('.admin-fabric-table tbody tr').count(), 4);
  await page.getByLabel('상태', { exact: true }).selectOption('SOLD_OUT');
  await page.getByRole('heading', { name: '판매 완료 원단이 없습니다.', exact: true }).waitFor();
  checks.push('Fabric approval updates state; native status selector and empty SOLD_OUT result verified');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, path] of [
    ['dashboard', '/admin/dashboard'], ['sellers', '/admin/sellers?status=APPROVED'],
    ['seller-detail', '/admin/sellers/seller-1'], ['fabrics', '/admin/fabrics?status=PENDING'],
    ['fabric-detail', '/admin/fabrics/fabric-pending-3'], ['fabric-reject', '/admin/fabrics/fabric-pending-3?action=reject'],
  ]) {
    await go(path);
    const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    dimensions.push({ label, ...bounds });
    await shot(`${label}-mobile`);
  }
  checks.push('Mobile screenshots and document bounds collected at 390px');
  const report = { checks, dimensions, errors, overflow: dimensions.filter(x => x.document > x.viewport || x.body > x.viewport) };
  await writeFile(`${out}admin-browser-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
