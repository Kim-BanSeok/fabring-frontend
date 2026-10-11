const {chromium}=require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage();const results=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  await page.goto('http://127.0.0.1:5173/#/seller/approval');
  const mount=async config=>{await page.evaluate(async config=>{window.sellerQa?.unmount();window.sellerQa=await (await import('/docs/qa/react/seller/strictmode-harness.jsx')).mountSellerTest(config);},config);await page.locator('#seller-test-host h1').waitFor();};
  const read=()=>page.evaluate(()=>({counts:window.sellerQa.counts,routes:window.sellerQa.routes,state:window.sellerQa.state(),errors:window.sellerQa.errors}));
  await mount({node:'210:8618',path:'/seller/upload'});
  await page.waitForFunction(()=>window.sellerQa.state().upload.stage==='DONE');let result=await read();assert.equal(result.counts.uploadPhotos,1);results.push({name:'StrictMode upload timer invokes once',counts:result.counts});
  await mount({node:'210:8618',path:'/seller/upload'});await page.evaluate(()=>window.sellerQa.unmount());await page.waitForTimeout(700);result=await read();assert.equal(result.counts.uploadPhotos||0,0);results.push({name:'upload timer cleanup on unmount',counts:result.counts});
  await mount({node:'127:6487',path:'/seller/register/ai',query:'type=ROLL&step=processing'});
  await page.waitForFunction(()=>window.sellerQa.routes.length===1);await page.waitForTimeout(750);result=await read();assert.equal(result.routes.length,1);results.push({name:'StrictMode AI processing navigates once',routes:result.routes});
  await mount({node:'127:6487',path:'/seller/register/ai',query:'type=ROLL&step=processing'});await page.evaluate(()=>window.sellerQa.unmount());await page.waitForTimeout(750);result=await read();assert.equal(result.routes.length,0);results.push({name:'AI timer cleanup on unmount',routes:result.routes});
  await mount({node:'123:4153',path:'/seller/register/review'});const before=(await read()).state.fabrics.length;
  await page.locator('#seller-test-host [data-seller-action=submit-fabric]').evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>window.sellerQa.state().upload?.stage==='DONE');result=await read();assert.equal(result.counts.createFabric,1);assert.equal(result.counts.uploadPhotos,1);assert.equal(result.state.fabrics.length,before+1);results.push({name:'rapid duplicate create click creates/uploads once',counts:result.counts});
  await mount({node:'123:4153',path:'/seller/register/review'});
  await page.locator('#seller-test-host [data-seller-action=submit-fabric]').click();await page.evaluate(()=>window.sellerQa.unmount());await page.waitForTimeout(450);result=await read();assert.equal(result.counts.createFabric||0,0);results.push({name:'creation delay cleanup prevents create after unmount',counts:result.counts});
  await mount({node:'123:4153',path:'/seller/register/review',demo:{createResult:'UNKNOWN'}});
  await page.locator('#seller-test-host [data-seller-action=submit-fabric]').click();await page.waitForFunction(()=>window.sellerQa.state().upload?.stage==='UNKNOWN');
  result=await read();assert.equal(result.counts.createFabric,1);assert.equal(result.counts.uploadPhotos||0,0);assert.equal(await page.locator('#seller-test-host [data-seller-action=submit-fabric]').count(),0);results.push({name:'unknown create response has no resend',counts:result.counts});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();fs.writeFileSync(path.join(__dirname,'strictmode-results.json'),JSON.stringify({results,errors},null,2));}
 console.log(JSON.stringify({results,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
