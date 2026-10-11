const { chromium } = require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const mode = process.argv[2] || 'before';
const routes = [
  ['auth-login', '/auth/buyer/login'], ['auth-seller', '/auth/seller/login'], ['auth-admin', '/auth/admin/login'],
  ['auth-signup', '/auth/buyer/signup'], ['auth-error', '/auth/buyer/error'], ['auth-done', '/auth/buyer/signup-done'],
  ['home', '/buyer/home'], ['list', '/buyer/fabrics'], ['detail', '/buyer/fabrics/fabric-roll-1'],
  ['pickup', '/buyer/pickup/fabric-roll-1'], ['profile', '/buyer/profile'], ['profile-done', '/buyer/profile?state=SAVED&example=1'],
  ['buyer-error', '/buyer/errors/insufficient?example=1'], ['reservations', '/buyer/reservations?example=1'], ['supplies', '/buyer/supplies'],
];
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const results = [];
  try {
    const context = await browser.newContext(); const page = await context.newPage();
    const errors=[]; page.on('pageerror', e => errors.push(e.message));
    for (const [width,height] of [[1440,900],[1366,600],[390,844],[320,700]]) {
      await page.setViewportSize({width,height});
      for(const [name,route] of routes) {
        await page.goto('http://127.0.0.1:5173/#'+route); await page.locator('main h1').waitFor();
        await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
        await page.screenshot({path:path.join(__dirname,`${mode}-${name}-${width}x${height}.png`)});
        results.push({name,route,width,height,...await page.evaluate(()=>{
          const box=node=>{if(!node)return null;const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
          return{scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,main:box(document.querySelector('main')),shell:box(document.querySelector('.shell')),heading:box(document.querySelector('main h1')),brand:box(document.querySelector('.auth-brand-panel')),form:box(document.querySelector('.auth-form')),state:box(document.querySelector('.auth-state,.buyer-state-screen')),buttons:[...document.querySelectorAll('main .button')].map(node=>({text:node.textContent,...box(node)})),bottomChildren:[...document.querySelector('main').children].map(box)};
        })});
      }
    }
    fs.writeFileSync(path.join(__dirname,`${mode}-metrics.json`),JSON.stringify({errors,results},null,2));
    console.log(JSON.stringify({mode,screens:results.length,errors,overflow:results.filter(r=>r.scrollWidth>r.width).map(r=>({name:r.name,width:r.width,scrollWidth:r.scrollWidth}))}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
