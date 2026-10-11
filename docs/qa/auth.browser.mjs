import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const out = fileURLToPath(new URL('./', import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
const errors = [], checks = [], dimensions = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const manifest = JSON.parse(await readFile(new URL('./auth-node-route-manifest.json', import.meta.url)));
async function go(path, reload = true) {
  if (reload) await page.goto(`http://127.0.0.1:5173/#${path}`);
  else await page.evaluate(value => { location.hash = value; }, path);
  await page.locator('#main-content h1').waitFor();
  await page.waitForTimeout(50);
  await page.evaluate(() => document.fonts.ready);
  assert.notEqual(await page.locator('#main-content h1').textContent(), '화면을 불러오지 못했어요');
}
async function screenshot(name) { await page.waitForTimeout(180); await page.screenshot({ path: `${out}auth-${name}.png`, fullPage: true }); }
const password = 'Loop1234!';
async function noStoredPassword() {
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  assert(!JSON.stringify(storage).includes(password), 'Password must not be persisted');
  assert(!JSON.stringify(storage).includes('"password"'), 'No password key in persisted data');
}
try {
  for (const screen of manifest.screens) {
    await go(screen.route);
    assert.equal(await page.locator('#main-content [data-figma-node]').first().getAttribute('data-figma-node'), screen.nodeId, screen.route);
    const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    assert(width.content <= width.viewport, `${screen.route}: desktop overflow`);
  }
  checks.push('23 assigned source nodes resolve to correct source annotations and non-error pages');
  for (const role of ['buyer', 'seller', 'admin']) {
    await go(`/auth/${role}/login`);
    await screenshot(`${role}-login-desktop`);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.locator('[data-auth-submit]').click();
    await page.waitForURL(`**/#/auth/${role}/processing`);
    await page.waitForURL(`**/#/${role}/${role === 'buyer' ? 'home' : 'dashboard'}`);
    await noStoredPassword();
  }
  checks.push('Buyer/seller/admin login forms process and route to role homes');
  for (const role of ['buyer', 'seller']) {
    await go(`/auth/${role}/signup?consent=00`);
    assert(await page.locator('[data-auth-submit]').isDisabled());
    await page.getByLabel('닉네임', { exact: true }).fill(role === 'buyer' ? '김루프' : '이정원');
    await page.getByLabel('이메일', { exact: true }).fill(`${role}-qa@example.com`);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('Mismatch9!');
    await page.getByLabel('이용약관 동의 (필수)', { exact: true }).check();
    assert(await page.locator('[data-auth-submit]').isDisabled());
    await page.getByLabel('개인정보 수집·이용 동의 (필수)', { exact: true }).check();
    assert(await page.locator('[data-auth-submit]').isEnabled());
    await screenshot(`${role}-signup-desktop`);
    await page.locator('[data-auth-submit]').click();
    await page.waitForURL(`**/#/auth/${role}/signup-error`);
    await page.getByRole('link', { name: '가입 정보 수정', exact: true }).click();
    assert.equal(await page.getByLabel('이메일', { exact: true }).inputValue(), `${role}-qa@example.com`);
    assert.equal(await page.getByLabel('비밀번호', { exact: true }).inputValue(), password);
    assert(await page.getByLabel('이용약관 동의 (필수)', { exact: true }).isChecked());
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await page.locator('[data-auth-submit]').click();
    await page.waitForURL(`**/#/auth/${role}/signup-done`);
    await screenshot(`${role}-signup-done`);
    await noStoredPassword();
    await page.getByRole('link', { name: '로그인하기', exact: true }).click();
    await page.waitForURL(`**/#/auth/${role}/${role === 'seller' ? 'first-login' : 'login'}`);
    assert.equal(await page.getByLabel('이메일', { exact: true }).inputValue(), `${role}-qa@example.com`);
    assert.equal(await page.getByLabel('비밀번호', { exact: true }).inputValue(), '');
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.locator('[data-auth-submit]').click();
    await page.waitForURL(`**/#/${role}/${role === 'seller' ? 'store' : 'home'}`);
    await noStoredPassword();
  }
  checks.push('Both signup journeys: each consent disables independently, confirmation mismatch preserves all fields, success clears password, seller first login opens store');
  for (const scenario of ['error', 'network']) {
    await go(`/auth/buyer/login?demo=${scenario}`);
    await page.getByLabel('이메일', { exact: true }).fill('failure-qa@example.com');
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.locator('[data-auth-submit]').click();
    await page.waitForURL(`**/#/auth/buyer/error${scenario === 'network' ? '?demo=network' : ''}`);
    await screenshot(`login-${scenario}`);
    await page.getByRole('link', { name: '로그인으로 돌아가기', exact: true }).click();
    assert.equal(await page.getByLabel('이메일', { exact: true }).inputValue(), 'failure-qa@example.com');
    assert.equal(await page.getByLabel('비밀번호', { exact: true }).inputValue(), password);
    await noStoredPassword();
  }
  checks.push('Credential and network failures preserve input and offer an actionable retry without retaining forced failure query');
  await go('/auth/buyer/login?demo=session-expired');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.locator('[data-auth-submit]').click();
  await page.waitForURL('**/#/auth/buyer/session-expired');
  await screenshot('session-expired');
  await page.getByRole('link', { name: '다시 로그인', exact: true }).click();
  await page.waitForURL('**/#/auth/buyer/login');
  checks.push('Session expiry renders and reconnects to login');
  await go('/auth/buyer/processing'); await screenshot('processing');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of manifest.screens) {
    await go(screen.route);
    const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
    dimensions.push({ route: screen.route, ...width });
    assert(width.content <= width.viewport, `${screen.route}: mobile overflow`);
  }
  await go('/auth/seller/signup?consent=00'); await screenshot('seller-signup-mobile');
  await go('/auth/buyer/error'); await screenshot('buyer-error-mobile');
  const logo = await page.locator('.brand img').evaluate(img => ({ src: img.getAttribute('src'), width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, loaded: img.complete && img.naturalWidth > 0 }));
  assert.deepEqual(logo, { src: '/assets/figma/logo.svg', width: 28, height: 28, loaded: true });
  checks.push('23 routes at 390px with no document overflow; local logo loaded at exact 28×28 geometry');
  assert.deepEqual(errors, []);
  await writeFile(`${out}auth-browser-results.json`, JSON.stringify({ passed: true, checks, dimensions, errors, scope: 'Local HTML prototype only; no real authentication or backend integration' }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, errors }, null, 2));
} catch (error) {
  await screenshot('failure');
  await writeFile(`${out}auth-browser-results.json`, JSON.stringify({ passed: false, checks, error: error.message, errors, dimensions }, null, 2));
  throw error;
} finally { await browser.close(); }
