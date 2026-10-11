import { chromium } from 'file:///C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { writeFile } from 'node:fs/promises';
const phase=process.argv[2]||'before';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage();const rows=[];
try {for(const width of [1151,1200,768]){await page.setViewportSize({width,height:768});for(const name of ['approvals','fabrics']){
await page.goto(`http://127.0.0.1:5173/#/admin/${name}`);await page.locator('.admin-page h1').waitFor();await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>scrollTo(0,(document.documentElement.scrollHeight-innerHeight)/2));
await page.screenshot({path:new URL(`./${phase}-edge-${name}-${width}.png`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
rows.push({width,name,...await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,table:[...document.querySelectorAll('.table-wrapper')].map(el=>({client:el.clientWidth,scroll:el.scrollWidth})),details:[...document.querySelectorAll('.admin-review-details dd')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),height:document.documentElement.scrollHeight}))});
}}}finally{await writeFile(new URL(`./${phase}-edges.json`,import.meta.url),JSON.stringify(rows,null,2));await browser.close();}console.log(JSON.stringify(rows));
