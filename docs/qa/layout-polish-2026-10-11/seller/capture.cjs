const {chromium}=require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const phase=process.argv[2]||'before';
const screens=[
 ['dashboard','/seller/dashboard?scenario=123%3A2473'],
 ['method','/seller/register?scenario=123%3A3245'],
 ['approval','/seller/approval?scenario=209%3A8131'],
 ['upload-partial','/seller/upload?scenario=210%3A8628'],
 ['upload-done','/seller/upload?scenario=127%3A6713'],
 ['review','/seller/register/review?scenario=123%3A4153'],
 ['profile','/seller/profile?scenario=123%3A4699'],
 ['reservation','/seller/reservations?status=PICKED_UP&id=reservation-scenario&scenario=127%3A7892'],
 ['inquiry','/seller/inquiries?scenario=123%3A4559'],
 ['manual','/seller/register/manual?type=ROLL&scenario=123%3A3466'],
];
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),context=await browser.newContext(),page=await context.newPage(),results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));try{
for(const viewport of [{width:1440,height:900},{width:1366,height:600},{width:390,height:844},{width:320,height:844}]){
 await page.setViewportSize(viewport);
 for(const[name,route]of screens){
 await page.goto('http://127.0.0.1:5173/#'+route);await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);
 const geometry=await page.evaluate(()=>({width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,documentWidth:document.documentElement.scrollWidth,main:(()=>{const r=document.querySelector('main').getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height};})(),heading:(()=>{const r=document.querySelector('main h1').getBoundingClientRect();return{top:r.top,bottom:r.bottom};})(),buttons:[...document.querySelectorAll('main .actions .button')].map(n=>{const r=n.getBoundingClientRect();return{text:n.textContent,top:r.top,bottom:r.bottom,left:r.left,width:r.width,height:r.height};})}));
 await page.screenshot({path:path.join(__dirname,`${phase}-${viewport.width}x${viewport.height}-${name}.png`)});
 results.push({screen:name,viewport,route,geometry});
 }
}
}finally{fs.writeFileSync(path.join(__dirname,`${phase}-geometry.json`),JSON.stringify({results,errors},null,2));await browser.close();}console.log(JSON.stringify({screens:results.length,errors,overflow:results.filter(r=>r.geometry.documentWidth>r.viewport.width).map(r=>r.screen+':'+r.viewport.width)},null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
