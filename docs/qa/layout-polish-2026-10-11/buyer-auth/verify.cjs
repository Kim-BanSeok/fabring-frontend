const { chromium } = require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'); const path = require('node:path');
const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'before-metrics.json')));
const after = JSON.parse(fs.readFileSync(path.join(__dirname, 'after-metrics.json')));
const passed=[]; const check=(condition,message)=>{if(!condition)throw Error(message);passed.push(message);};
const screen=(metrics,name,width)=>metrics.results.find(row=>row.name===name&&row.width===width);
(async()=>{
  check(after.errors.length===0,'60개 전체뷰포트 캡처에 브라우저 오류 없음');
  check(after.results.every(row=>row.scrollWidth<=row.width),'1440·1366·390·320에서 가로 넘침 없음');
  const login=screen(after,'auth-login',1440);check(login.brand.height===login.form.height,'데스크톱 로그인 좌우 카드 높이 일치');
  for(const name of ['auth-login','auth-seller','auth-admin'])check(screen(after,name,1366).buttons.every(b=>b.bottom<=600),`1366×600 ${name}: 모든 로그인 행동이 뷰포트 안에 표시`);
  check(screen(after,'profile-done',1366).buttons.at(-1).bottom<screen(before,'profile-done',1366).buttons.at(-1).bottom,'짧은 창의 완료 화면 다음 행동을 위로 복구');
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage();
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      await page.goto('http://127.0.0.1:5173/#/buyer/reservations?example=1');await page.locator('main h1').waitFor();
      const tabs=await page.locator('.tabs[aria-label="픽업 예약 상태"] a').evaluateAll(nodes=>nodes.map(node=>({y:node.offsetTop,height:node.clientHeight,scroll:node.scrollWidth,width:node.clientWidth,text:node.textContent})));
      check(new Set(tabs.map(tab=>tab.y)).size===2&&tabs.every(tab=>tab.scroll<=tab.width&&tab.height>=41),`${width}px 예약 상태 5개가 잘림 없이 두 줄에 표시`);
      await page.getByRole('link',{name:'수령 완료',exact:true}).click();await page.waitForURL('**status=PICKED_UP*');await page.locator('.tabs a[aria-current="page"][href*="status=PICKED_UP"]').waitFor();
      check((await page.locator('.tabs[aria-current],.tabs [aria-current="page"]').textContent())==='수령 완료',`${width}px 재배치된 예약 상태 탭 이동 정상`);
      await page.goto('http://127.0.0.1:5173/#/buyer/pickup/fabric-roll-1');await page.locator('[data-buyer-pickup]').waitFor();
      check(await page.locator('.buyer-pickup-product').evaluate(node=>getComputedStyle(node).padding==='0px'),`${width}px 픽업 중첩 카드 여백 제거`);
    }
    for(const [name,route,width,height] of [['auth-bottom','/auth/buyer/login',1440,900],['auth-short-bottom','/auth/buyer/login',1366,600],['buyer-state-bottom','/buyer/profile?state=SAVED&example=1',1366,600],['auth-mobile-bottom','/auth/buyer/login',390,844],['buyer-error-bottom','/buyer/errors/insufficient?example=1',320,700]]){
      await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:5173/#'+route);await page.locator('main h1').waitFor();await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo(0,document.documentElement.scrollHeight);});
      await page.screenshot({path:path.join(__dirname,`after-${name}-${width}x${height}.png`)});
      if(name==='auth-bottom')check(await page.evaluate(()=>getComputedStyle(document.querySelector('.auth-shell')).backgroundColor===getComputedStyle(document.querySelector('.auth-layout')).backgroundColor),'구매자 로그인 내용과 하단 프레임 배경색 일치');
    }
  }finally{await browser.close();}
  fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify({passed,changes:['auth 브랜드 고정 최소높이 제거 및 로그인 카드 높이 정렬','짧은 데스크톱 로그인 여백 조정','완료/오류 화면 고정 최소높이를 내부 여백으로 변경','모바일 픽업 중첩 padding 제거','모바일 예약 5탭 3열 2행 정렬','구매자 auth 하단 배경 연결'],scope:['src/prototype/pages/buyer.css','src/prototype/pages/auth.css'],notes:'외부 프레임과 검토도구 변경은 root 작업이며 before/after에 함께 반영되어 있습니다.'},null,2));
  console.log(JSON.stringify({passed},null,2));
})().catch(error=>{console.error(error);process.exitCode=1});
