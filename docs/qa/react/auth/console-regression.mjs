import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const report = { checks: [], pageErrors: [], consoleErrors: [] };
page.on('pageerror', error => report.pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
async function route(path) {
  await page.evaluate(value => { location.hash = value; }, path);
  await page.waitForURL(`**/#${path}`);
  await page.locator('#main-content h1').waitFor();
}
try {
  await page.goto('http://127.0.0.1:5173/#/auth/buyer/login?demo=network');
  await page.locator('[name=email]').fill('react-network@example.com');
  await page.locator('[name=password]').fill('Transient123!');
  await page.locator('[data-auth-submit]').click();
  await page.waitForURL('**/#/auth/buyer/error?demo=network');
  assert.equal(await page.locator('#main-content h1').textContent(), '연결 상태를 확인해 주세요');
  await page.getByRole('link', { name: '로그인으로 돌아가기', exact: true }).click();
  assert.equal(await page.locator('[name=email]').inputValue(), 'react-network@example.com');
  assert.equal(await page.locator('[name=password]').inputValue(), 'Transient123!');
  report.checks.push('Network error recovery retains form values');

  await route('/auth/buyer/login?scenario=123:59');
  assert.equal(await page.locator('[name=email]').inputValue(), 'loop@example.com');
  assert.equal(await page.locator('[name=password]').inputValue(), '');
  await route('/preview');
  await route('/auth/buyer/login');
  assert.equal(await page.locator('[name=email]').inputValue(), 'react-network@example.com');
  assert.equal(await page.locator('[name=password]').inputValue(), 'Transient123!');
  report.checks.push('Gallery service forms are isolated; returning to normal service restores its draft');

  await route('/auth/buyer/signup?consent=00');
  assert.equal(await page.locator('.auth-layout').getAttribute('data-figma-node'), '152:6946');
  await page.locator('[name=privacy]').check();
  assert.equal(await page.locator('.auth-layout').getAttribute('data-figma-node'), '152:7054');
  assert(await page.locator('[data-auth-submit]').isDisabled());
  await page.locator('[name=privacy]').uncheck();
  await page.locator('[name=terms]').check();
  assert.equal(await page.locator('.auth-layout').getAttribute('data-figma-node'), '152:7162');
  await page.locator('[name=privacy]').check();
  assert.equal(await page.locator('.auth-layout').getAttribute('data-figma-node'), '123:189');
  assert(await page.locator('[data-auth-submit]').isEnabled());
  report.checks.push('Buyer consent combinations update disabled state and all four Figma annotations');

  await route('/auth/buyer/session-expired');
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#main-content h1').textContent(), '다시 로그인해 주세요');
  assert.equal(await page.locator('.auth-state').getAttribute('data-figma-node'), '202:8424');
  await page.getByRole('link', { name: '다시 로그인', exact: true }).click();
  await page.waitForURL('**/#/auth/buyer/login');
  report.checks.push('Session expiry refresh keeps the recovery view visible');
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.passed = true;
} catch (error) { report.passed = false; report.error = error.message; throw error; }
finally {
  await writeFile(new URL('./console-regression.json', import.meta.url), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
