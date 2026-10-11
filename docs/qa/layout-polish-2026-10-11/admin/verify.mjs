import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
const page=await browser.newPage({viewport:{width:390,height:844}});
const report={checks:[],errors:[],accessibility:[]};
page.on('pageerror', e=>report.errors.push(e.message));
async function go(path){await page.goto('http://127.0.0.1:5173/#'+path);await page.locator('.admin-page h1').waitFor();}
async function inspectTable(label){
  const table=page.getByRole('table'); assert.equal(await table.count(),1);
  const snapshot=await table.ariaSnapshot();
  assert(snapshot.includes('columnheader'));
  report.accessibility.push({label,snapshot});
  const geometry=await table.evaluate(el=>{
    const parent=el.closest('.table-wrapper').getBoundingClientRect();
    return {width:el.getBoundingClientRect().width,parentWidth:parent.width,
      hiddenCells:[...el.querySelectorAll('tbody td')].filter(td=>{const r=td.getBoundingClientRect();return r.left<parent.left-1||r.right>parent.right+1||r.width<=0}).length,
      missingLabels:[...el.querySelectorAll('tbody td')].filter(td=>!td.dataset.label).length};
  });
  assert.equal(geometry.hiddenCells,0);assert.equal(geometry.missingLabels,0);assert(geometry.width<=geometry.parentWidth+1);
}
try {
  const before=JSON.parse(await readFile(new URL('./before-metrics.json',import.meta.url)));
  const after=JSON.parse(await readFile(new URL('./after-metrics.json',import.meta.url)));
  assert.equal(after.rows.length,132);assert.deepEqual(after.errors,[]);assert(after.rows.every(row=>row.overflow===0));
  assert(after.rows.filter(row=>row.width===390).every(row=>row.tables.every(table=>table.scroll<=table.client)));
  report.checks.push('11 screen families × four viewports × top/middle/bottom: 132 captures, zero document overflow/page errors; mobile tables need no horizontal scrolling');
  for(const name of ['approvals','dashboard','fabrics']){
    const old=before.rows.find(r=>r.width===1024&&r.name===name&&r.position==='top');
    const next=after.rows.find(r=>r.width===1024&&r.name===name&&r.position==='top');
    report[name+'Height']={before:old.scrollHeight,after:next.scrollHeight};
  }
  await go('/admin/dashboard');await inspectTable('dashboard');
  await go('/admin/fabrics');await inspectTable('fabrics');
  await page.locator('.admin-fabric-title').first().click();
  await page.waitForURL('**/#/admin/fabrics/fabric-pending-1');
  await page.locator('#main-content').getByRole('link',{name:'원단 게시 승인',exact:true}).click();
  await page.getByRole('button',{name:'승인 확정',exact:true}).click();
  await page.waitForURL('**/admin/fabrics/fabric-pending-1?result=POSTED');
  assert.equal(await page.locator('.admin-page h1').textContent(),'원단 게시를 승인했습니다');await inspectTable('approval result');
  report.checks.push('Mobile product row → detail → approval confirmation → result works; remaining list retains accessible table headers');
  await go('/admin/sellers');await inspectTable('sellers');
  await page.getByRole('link',{name:'이정원 판매자 상세보기'}).click();
  await page.getByRole('button',{name:'판매자 승인',exact:true}).click();
  await page.getByRole('heading',{name:'판매자 승인 완료',exact:true}).waitFor();
  report.checks.push('Mobile seller detail link and approval action remain visible and functional');
  await page.setViewportSize({width:1024,height:768});await go('/admin/approvals');
  assert(await page.locator('[name=reviewFabric]').isVisible());
  const nextId=await page.locator('[name=reviewFabric] option').last().getAttribute('value');
  await page.locator('[name=reviewFabric]').selectOption(nextId);
  assert(page.url().includes('id='+nextId));
  const layout=await page.locator('.admin-selected-product').evaluate(el=>{const a=el.children[0].getBoundingClientRect(),b=el.children[1].getBoundingClientRect();return {imageX:a.x,textX:b.x,imageY:a.y,textY:b.y}});
  assert(layout.textX>layout.imageX);assert.equal(layout.textY,layout.imageY);
  report.checks.push('1024px approval selector changes the selected fabric; image and detail remain in the same row');
  assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=e.message;throw e;}
finally{await writeFile(new URL('./verification.json',import.meta.url),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({...report,accessibility:report.accessibility.map(x=>x.label)},null,2));}
