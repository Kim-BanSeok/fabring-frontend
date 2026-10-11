import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();const rows=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {for(const [width,height] of [[1440,900],[1366,600],[1024,768],[390,844]]){await page.setViewportSize({width,height});for(const [name,path] of [['soldout','/admin/fabrics?status=SOLD_OUT'],['seller-empty','/admin/sellers?status=REJECTED'],['approval-empty','/admin/approvals?status=REJECTED']]){
await page.goto('http://127.0.0.1:5173/#'+path);await page.locator('.empty-state').waitFor();await page.evaluate(()=>document.fonts.ready);
for(const position of ['top','bottom']){await page.evaluate(position=>scrollTo(0,position==='top'?0:document.documentElement.scrollHeight),position);await page.screenshot({path:new URL(`./after-${name}-${width}x${height}-${position}.png`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});}
const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,emptyHeight:document.querySelector('.empty-state').getBoundingClientRect().height,scrollHeight:document.documentElement.scrollHeight}));assert.equal(metrics.overflow,0);assert(metrics.emptyHeight<280);rows.push({name,width,height,...metrics});
}}assert.deepEqual(errors,[]);}finally{await writeFile(new URL('./empty-verification.json',import.meta.url),JSON.stringify({rows,errors},null,2));await browser.close();}console.log(JSON.stringify({rows,errors}));
