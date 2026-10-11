import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const phase = process.argv[2] || 'before';
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
const page = await browser.newPage();
await page.routeWebSocket('**', socket => socket.close());
const rows = [], errors=[];
page.on('pageerror', e=>errors.push(e.message));
const routes = {
  dashboard:'/admin/dashboard', sellers:'/admin/sellers', 'seller-detail':'/admin/sellers/seller-1',
  fabrics:'/admin/fabrics', approvals:'/admin/approvals', 'fabric-detail':'/admin/fabrics/fabric-pending-1',
  reject:'/admin/fabrics/fabric-pending-1?action=reject', approve:'/admin/fabrics/fabric-pending-1?action=approve',
  result:'/admin/fabrics/fabric-pending-1?sample=POSTED&result=POSTED', filter:'/admin/fabrics/filter', error:'/admin/error',
};
try {
  for (const [width,height] of [[1440,900],[1366,600],[1024,768],[390,844]]) {
    await page.setViewportSize({width,height});
    for (const [name,path] of Object.entries(routes)) {
      await page.goto('http://127.0.0.1:5173/#'+path);
      await page.locator('.admin-page h1').waitFor(); await page.evaluate(()=>document.fonts.ready);
      for (const position of ['top','middle','bottom']) {
        await page.evaluate(position=>{ const max=document.documentElement.scrollHeight-innerHeight; scrollTo(0, position==='top'?0:position==='middle'?max/2:max); },position);
        await page.waitForTimeout(25);
        await page.screenshot({path:new URL(`./${phase}-${name}-${width}x${height}-${position}.png`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
        const metrics=await page.evaluate(()=>{
          const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right}};
          return {scroll:scrollY,scrollHeight:document.documentElement.scrollHeight,overflow:document.documentElement.scrollWidth-innerWidth,
            tables:[...document.querySelectorAll('.table-wrapper')].map(el=>({client:el.clientWidth,scroll:el.scrollWidth})),
            cards:[...document.querySelectorAll('.admin-stat')].map(rect),
            reviewImage:document.querySelector('.admin-review-image')?rect(document.querySelector('.admin-review-image')):null,
            reviewProduct:document.querySelector('.admin-selected-product')?rect(document.querySelector('.admin-selected-product')):null,
            sidebar:document.querySelector('.admin-sidebar')?rect(document.querySelector('.admin-sidebar')):null,
            actions:[...document.querySelectorAll('.admin-page .actions')].map(rect),
          };
        });
        rows.push({width,height,name,position,...metrics});
      }
    }
  }
} finally { await writeFile(new URL(`./${phase}-metrics.json`,import.meta.url),JSON.stringify({rows,errors},null,2)); await browser.close(); }
console.log(JSON.stringify({phase,rows:rows.length,overflow:rows.filter(r=>r.overflow),errors}));
