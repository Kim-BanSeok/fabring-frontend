const {chromium}=require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
const out=__dirname,results={observations:[],checks:[],errors:[]};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();page.on('pageerror',e=>results.errors.push(e.message));
const go=async route=>{await page.goto('http://127.0.0.1:5173/#'+route);await page.locator('main h1').waitFor();await page.evaluate(()=>document.fonts.ready);};
const snap=async name=>{await page.waitForFunction(()=>!document.getElementById('feedback')?.textContent);await page.screenshot({path:path.join(out,'after-'+name+'.png'),fullPage:true});};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ3sAAAAASUVORK5CYII=','base64');
const file=name=>({name,mimeType:'image/png',buffer:png});
const check=async(name,fn)=>{try{await fn();results.checks.push({name,pass:true});}catch(e){results.checks.push({name,pass:false,error:e.message});await snap('failure-'+results.checks.length);}};
try{
await check('direct form previous + browser back keeps draft?',async()=>{
 await go('/seller/register/manual?type=ROLL&scenario=123%3A3466');
 await page.locator('[name=title]').fill('미저장 원단 이름');await page.locator('[name=price]').fill('7700');
 const before={title:await page.locator('[name=title]').inputValue(),price:await page.locator('[name=price]').inputValue()};await snap('01-direct-unsaved-before');
 await page.getByRole('link',{name:'이전',exact:true}).click();await page.getByRole('heading',{name:'새 원단 등록',exact:true}).waitFor();
 await page.goBack();await page.locator('#seller-fabric-form').waitFor();
 results.observations.push({issue:'direct-draft-loss',before,after:{title:await page.locator('[name=title]').inputValue(),price:await page.locator('[name=price]').inputValue()},url:page.url()});assert.equal(await page.locator('[name=title]').inputValue(),before.title);assert.equal(await page.locator('[name=price]').inputValue(),before.price);await snap('02-direct-unsaved-return');
 await page.locator('[name=price]').fill('');await page.getByRole('link',{name:'자투리 원단',exact:true}).click();await page.getByRole('heading',{name:'자투리 원단 입력',level:1,exact:true}).waitFor();await page.getByRole('link',{name:'롤 원단',exact:true}).click();await page.getByRole('heading',{name:'원단 등록 · 직접 입력',level:1,exact:true}).waitFor();assert.equal(await page.locator('[name=title]').inputValue(),before.title);assert.equal(await page.locator('[name=price]').inputValue(),'');
});
await check('missing photo error keeps correct validation after remembered input',async()=>{
 await go('/preview');
 await go('/seller/register/manual?type=ROLL&scenario=123%3A3466');
 await page.locator('[name=title]').fill('사진이 필요한 원단');
 for(const slot of ['FULL','ZOOM']){await page.locator(`[data-seller-action=remove-photo][data-slot=${slot}]`).click();await page.waitForFunction(s=>!document.querySelector(`[data-seller-action=remove-photo][data-slot=${s}]`),slot);}
 await page.locator('#seller-fabric-form button[type=submit]').click();await page.waitForURL('**/seller/register/error?type=ROLL');
 await page.getByText('원단 사진을 한 장 이상 선택해 주세요.',{exact:true}).waitFor();
});
await check('rejected photo + subsequent edit saved/reopened',async()=>{
 await go('/seller/fabrics/edit?id=fabric-pending-1&scenario=127%3A7322');
 await page.locator('[data-photo-slot=FULL]').setInputFiles(file('ux-replacement.png'));
 await page.getByText('ux-replacement.png',{exact:true}).waitFor();
 const photoSnapshotTitle=await page.locator('[name=title]').inputValue();
 await page.locator('[name=title]').fill('최종 보완한 원단 이름');await page.locator('[name=price]').fill('9200');
 await page.locator('#seller-fabric-form button[type=submit]').click();await page.getByRole('heading',{name:'내 원단 상세',exact:true}).waitFor();
 const detail=await page.locator('main').innerText();await snap('03-rejected-saved-detail');
 await page.getByRole('link',{name:'정보 수정',exact:true}).click();await page.locator('#seller-fabric-form').waitFor();
 results.observations.push({issue:'stale-edit-draft',photoSnapshotTitle,savedDetailContainsFinal:detail.includes('최종 보완한 원단 이름'),savedDetailContainsPrice:detail.includes('9,200'),reopened:{title:await page.locator('[name=title]').inputValue(),price:await page.locator('[name=price]').inputValue()}});assert.equal(await page.locator('[name=title]').inputValue(),'최종 보완한 원단 이름');assert.equal(await page.locator('[name=price]').inputValue(),'9200');await snap('04-rejected-edit-reopened');
});
await check('requested -> accepted -> picked up',async()=>{
 await go('/seller/reservations?status=REQUESTED&id=reservation-scenario&scenario=123%3A4387');
 await page.getByRole('link',{name:'수락',exact:true}).click();await page.getByRole('button',{name:'확인 후 수락',exact:true}).click();
 await page.getByRole('heading',{name:'수락된 예약',exact:true}).waitFor();
 await page.locator('.seller-reservation-actions').getByRole('link',{name:'수령 완료',exact:true}).click();await page.locator('#seller-reservation-page-confirm button[type=submit]').click();
 await page.getByRole('heading',{name:'수령 완료 예약',level:1,exact:true}).waitFor();
 results.observations.push({issue:'completed-guidance',copy:await page.locator('.seller-columns > section').nth(1).innerText(),url:page.url()});assert.equal(await page.getByRole('heading',{name:'재고 확인 후 처리',exact:true}).count(),0);assert.equal(await page.locator('.seller-reservation-actions').getByRole('link',{name:'수령 완료',exact:true}).count(),0);await snap('05-picked-up-desktop');
 await page.setViewportSize({width:390,height:844});await snap('06-picked-up-mobile');
});
await check('mobile form geometry + required boundaries',async()=>{
 await page.setViewportSize({width:390,height:844});
 await go('/seller/register/manual?type=ROLL&scenario=123%3A3466');
 const geometry=await page.locator('#seller-fabric-form').evaluate(n=>({formTop:n.getBoundingClientRect().top+scrollY,formHeight:n.scrollHeight,firstTextTop:n.querySelector('[name=title]').getBoundingClientRect().top+scrollY,submitTop:n.querySelector('button[type=submit]').getBoundingClientRect().top+scrollY,viewport:innerHeight,width:document.documentElement.scrollWidth}));
 await page.locator('[name=length_cm]').fill('89');const invalid=await page.locator('[name=length_cm]').evaluate(n=>!n.checkValidity());
 await page.locator('[name=length_cm]').fill('90');const valid=await page.locator('[name=length_cm]').evaluate(n=>n.checkValidity());
 results.observations.push({issue:'mobile-form-length',geometry,roll89Invalid:invalid,roll90Valid:valid});await snap('07-mobile-roll-form');
 await go('/seller/register/manual?type=SCRAP&scenario=127%3A6196');
 const bounds=[];for(const n of ['29','30','90','91']){await page.locator('[name=length_cm]').fill(n);bounds.push([n,await page.locator('[name=length_cm]').evaluate(n=>n.checkValidity())]);}results.checks.push({name:'scrap boundaries',bounds});
});
await check('AI input -> sample result -> manual photos -> partial retry',async()=>{
 await page.setViewportSize({width:1440,height:1000});await go('/seller/register/ai?type=ROLL&scenario=123%3A3842');
 await page.locator('[name=ai_request]').fill('면 원단 폭 150cm, 남은 길이 450cm입니다.');await page.getByRole('button',{name:'보내기',exact:true}).click();
 await page.getByRole('heading',{name:'AI가 정리한 내용을 확인해 주세요',exact:true}).waitFor();
 await page.getByRole('link',{name:'사진 추가',exact:true}).click();await page.locator('#seller-fabric-form').waitFor();
 await page.locator('[data-photo-slot=FULL]').setInputFiles(file('ai-front.png'));await page.getByText('ai-front.png',{exact:true}).waitFor();
 await page.locator('#seller-fabric-form button[type=submit]').click();await page.getByRole('heading',{name:'등록 내용 확인',exact:true}).waitFor();
 await page.locator('.prototype-tools summary').click();await page.locator('[name=demoUpload]').selectOption('PARTIAL');await page.locator('.prototype-tools summary').click();
 await page.locator('[data-seller-action=submit-fabric]').click();await page.getByRole('heading',{name:'일부 사진을 업로드하지 못했어요',exact:true}).waitFor();await snap('08-upload-partial');
 await page.locator('[data-seller-action=retry-photos]').click();await page.getByRole('heading',{name:'승인 신청을 보냈어요',exact:true}).waitFor();await snap('09-upload-retry-done');
});
await check('unknown create has no resend + inquiry answer completion',async()=>{
 await go('/seller/upload?scenario=210%3A8638');results.observations.push({issue:'unknown-recovery',buttons:await page.locator('main .actions').innerText()});
 await page.setViewportSize({width:390,height:844});await go('/seller/inquiries?scenario=123%3A4559');
 await page.locator('[name=answer]').fill('찬물 단독 세탁을 권해요. 제작 전 테스트해 주세요.');await page.locator('#seller-inquiry-form button[type=submit]').click();
 await page.getByRole('heading',{name:'답변을 등록했어요',exact:true}).waitFor();await snap('10-inquiry-answer-mobile');
});
await check('pending seller store save never approves',async()=>{
 await page.setViewportSize({width:1440,height:1000});await go('/seller/dashboard?scenario=144%3A6910');
 await page.getByRole('link',{name:'매장 정보 입력',exact:true}).click();
 await page.locator('[name=store_name]').fill('신규 테스트 매장');await page.locator('[name=address]').fill('양주시 테스트길 1');await page.locator('[name=phone_number]').fill('031-000-1111');
 await page.getByRole('button',{name:'매장 정보 저장',exact:true}).click();await page.getByRole('heading',{name:'변경 사항을 저장했어요',exact:true}).waitFor();
 await page.getByRole('link',{name:'새 원단 등록',exact:true}).click();await page.getByRole('heading',{name:/승인을 기다리고/}).waitFor();await snap('11-store-save-still-pending');
});
await check('320/390/1440 representative geometry',async()=>{
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:width===1440?1000:844});
  for(const [name,route] of [
   ['manual','/seller/register/manual?type=ROLL&scenario=123%3A3466'],
   ['completed','/seller/reservations?status=PICKED_UP&id=reservation-scenario&scenario=127%3A7892'],
   ['rejected','/seller/reservations?status=REJECTED&id=reservation-scenario&scenario=127%3A7753'],
   ['canceled','/seller/reservations?status=CANCELED&id=reservation-scenario&scenario=127%3A8022'],
   ['partial','/seller/upload?scenario=210%3A8628']]){
   await go(route);const actual=await page.evaluate(()=>document.documentElement.scrollWidth);assert.equal(actual,width,`${name}:${width}`);await snap(`${width}-${name}`);
  }
 }
});
}finally{fs.writeFileSync(path.join(out,'regression-results.json'),JSON.stringify(results,null,2));await browser.close();}
console.log(JSON.stringify(results,null,2));if(results.checks.some(x=>x.pass===false)||results.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
