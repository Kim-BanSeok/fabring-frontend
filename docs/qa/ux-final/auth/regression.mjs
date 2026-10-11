import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const out = fileURLToPath(new URL('./', import.meta.url));
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const p = await browser.newPage({ viewport: { width:390, height:844 } });
// Other agents edit this shared dev server. Disable only hot reload in the QA browser.
await p.routeWebSocket('**', socket => socket.close());
const report = { checks:[], geometry:[], errors:[], hotReloadDisabled:true };
p.on('pageerror', error => report.errors.push(error.message));
async function go(path) { await p.goto('http://127.0.0.1:5173/#'+path); await p.locator('#main-content h1').waitFor(); await p.evaluate(()=>document.fonts.ready); await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(100); }
async function shot(name, fullPage=false) { await p.screenshot({path:out+'after-'+name+'.png',fullPage}); }
const password='UxCheck123!';
try {
  for(const width of [390,1440]) {
    await p.setViewportSize({width,height:width===390?844:1050});
    for(const role of ['buyer','seller','admin']) {
      await go(`/auth/${role}/login`);
      const geometry=await p.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,width:r.width}};return {brand:rect('.auth-brand-panel'),form:rect('.auth-form'),submit:rect('[data-auth-submit]'),tools:rect('.prototype-tools'),logo:rect('.brand img'),viewport:innerHeight,overflow:document.documentElement.scrollWidth-innerWidth}});
      assert.equal(geometry.overflow,0); assert(geometry.submit.bottom<=geometry.viewport); assert.equal(geometry.logo.width,28); assert.equal(geometry.logo.height,28);
      if(width===1440) { assert.equal(geometry.brand.width,572);assert.equal(geometry.brand.height,720);assert.equal(geometry.form.top,158); }
      report.geometry.push({width,role,...geometry}); await shot(`${width}-${role}-login`);
      await p.locator('[name=password]').fill(password); await p.locator('[data-auth-submit]').click();
      await p.waitForURL(`**/#/${role}/${role==='buyer'?'home':'dashboard'}`);
      await p.goBack(); await p.waitForURL(`**/#/auth/${role}/login`);
      assert.equal(await p.locator('[name=password]').inputValue(),'');
      report.checks.push(`${width} ${role}: login success -> browser back skips processing; password cleared`);
    }
  }
  for(const width of [390,1440]) {
    await p.setViewportSize({width,height:width===390?844:1050});
    await go('/auth/buyer/login?demo=error'); await p.locator('[name=email]').fill('ux-back@example.com'); await p.locator('[name=password]').fill(password); await p.locator('[data-auth-submit]').click();
    await p.waitForURL('**/#/auth/buyer/error'); await p.goBack(); await p.waitForURL('**/#/auth/buyer/login?demo=error');
    assert.equal(await p.locator('[name=email]').inputValue(),'ux-back@example.com'); assert.equal(await p.locator('[name=password]').inputValue(),password);
    report.checks.push(`${width}: login error browser back preserves inputs and skips processing`);
    await go('/auth/seller/signup?consent=00'); assert(await p.locator('[data-auth-submit]').isDisabled());
    await p.locator('[name=terms]').check(); assert(await p.locator('[data-auth-submit]').isDisabled()); await p.locator('[name=privacy]').check(); assert(await p.locator('[data-auth-submit]').isEnabled());
    await p.locator('[name=email]').fill('ux-seller-final@example.com'); await p.locator('[name=password]').fill(password); await p.locator('[name=confirm]').fill('Mismatch123!'); await p.locator('[data-auth-submit]').click();
    await p.waitForURL('**/#/auth/seller/signup-error'); await p.getByRole('link',{name:'가입 정보 수정',exact:true}).click();
    assert.equal(await p.locator('[name=password]').inputValue(),password); assert(await p.locator('[name=terms]').isChecked());
    await p.locator('[name=confirm]').fill(password); await p.locator('[data-auth-submit]').click(); await p.waitForURL('**/#/auth/seller/signup-done');
    await p.goBack(); await p.waitForURL('**/#/auth/seller/signup'); assert.equal(await p.locator('[name=password]').inputValue(),'');
    await shot(`${width}-signup-return`,true); report.checks.push(`${width}: consent gating, mismatch recovery and signup completion browser back`);
  }
  await go('/auth/seller/first-login'); assert.equal(await p.locator('[name=email]').inputValue(),'ux-seller-final@example.com'); assert.equal(await p.locator('[name=password]').inputValue(),'');
  await p.locator('[name=password]').fill(password); await p.locator('[data-auth-submit]').click(); await p.waitForURL('**/#/seller/store'); await p.goBack(); await p.waitForURL('**/#/auth/seller/first-login'); assert.equal(await p.locator('[name=password]').inputValue(),'');
  report.checks.push('Seller first login -> store -> browser back returns to first login with empty password');
  await p.setViewportSize({width:390,height:844}); await go('/auth/buyer/processing'); assert.equal(await p.locator('#main-content h1').textContent(),'로그인을 다시 시작해 주세요');
  await p.getByRole('link',{name:'로그인으로 돌아가기',exact:true}).click(); await p.waitForURL('**/#/auth/buyer/login'); await p.locator('[name=password]').fill(password); await p.locator('[data-auth-submit]').click(); await p.waitForURL('**/#/auth/buyer/processing'); await p.reload();
  await p.getByRole('link',{name:'로그인으로 돌아가기',exact:true}).waitFor(); await shot('390-processing-reload-recovery'); report.checks.push('Direct and interrupted/reloaded processing provide recovery');
  await go('/auth/buyer/processing?scenario=125:2498'); assert.equal(await p.locator('#main-content h1').textContent(),'로그인 중입니다'); await p.getByRole('link',{name:'로그인으로 돌아가기',exact:true}).waitFor(); await shot('390-processing-gallery'); report.checks.push('Explicit scenario keeps the processing view and provides recovery');
  await go('/auth/buyer/login'); await p.locator('.prototype-tools summary').click();
  const overlap=await p.evaluate(()=>{const f=document.querySelector('.auth-form').getBoundingClientRect(),t=document.querySelector('.prototype-tools').getBoundingClientRect();return Math.max(0,Math.min(f.right,t.right)-Math.max(f.left,t.left))*Math.max(0,Math.min(f.bottom,t.bottom)-Math.max(f.top,t.top))});assert.equal(overlap,0); await shot('390-tools-flow',true); report.checks.push('Expanded common review tools do not overlap auth form');
  report.passwordPersisted=await p.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('UxCheck123!')); assert.equal(report.passwordPersisted,false); assert.deepEqual(report.errors,[]); report.passed=true;
  console.log(JSON.stringify(report,null,2));
} catch(error) { report.passed=false; report.error=error.message; await shot('failure',true); throw error; }
finally { await writeFile(out+'regression-after.json',JSON.stringify(report,null,2)); await browser.close(); }
