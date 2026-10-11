const { chromium } = require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const result = { passed: [], screens: [], assets: [], errors: [] };
  const check = (condition, label) => { if (!condition) throw Error(label); result.passed.push(label); };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.on('pageerror', e => result.errors.push(e.message));
    const go = async route => { await page.goto('http://127.0.0.1:5173/#' + route); await page.locator('main h1').waitFor(); await page.evaluate(() => document.fonts.ready); };
    const shot = async name => { await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); }); await page.screenshot({ path: path.join(__dirname, 'fixed-' + name + '.png'), fullPage: true }); };
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('yangju-loop-html-v1')));
    const form = selector => page.locator(selector).evaluate(node => Object.fromEntries(new FormData(node)));

    await go('/buyer/fabrics?sale_type=ROLL');
    await page.getByLabel('색상', { exact: true }).selectOption('내추럴');
    await page.getByRole('button', { name: '검색', exact: true }).click(); await page.waitForURL('**view=search');
    const search = new URL(page.url()).hash;
    await page.getByRole('link', { name: '상세 보기', exact: true }).click();
    await page.getByRole('link', { name: '픽업 요청하기', exact: true }).click();
    await page.getByLabel('요청 수량 (1마=90cm)').fill('3');
    await page.getByLabel('희망 픽업 시간').fill('16:30');
    await page.getByLabel('요청 사항').fill('<확인> 두께를 보고 싶어요.');
    const before = await form('[data-buyer-pickup]');
    await page.getByRole('link', { name: '원단 상세로 돌아가기' }).click();
    await page.goBack(); await page.locator('[data-buyer-pickup]').waitFor();
    check(JSON.stringify(before) === JSON.stringify(await form('[data-buyer-pickup]')), '픽업 뒤로가기: 수량·일시·메모 유지');
    await shot('draft-restored-1440');
    await page.getByRole('link', { name: '원단 상세로 돌아가기' }).click();
    await page.locator('.buyer-breadcrumb a').click();
    check(new URL(page.url()).hash === search, '검색 → 상세 → 픽업 → 상세 → 검색 조건 유지');
    await go('/buyer/pickup/fabric-check');
    check(await page.getByLabel('요청 사항').inputValue() === '', '다른 원단에 픽업 초안이 섞이지 않음');
    await go('/buyer/errors/insufficient?fabric_id=fabric-roll-1');
    await page.getByRole('link', { name: '수량 다시 선택' }).click();
    check(JSON.stringify(before) === JSON.stringify(await form('[data-buyer-pickup]')), '재고 오류 복구 시 작성 내용 유지');
    await page.getByRole('button', { name: '픽업 요청 보내기' }).click(); await page.waitForURL('**submitted=*');
    const reservation = (await state()).reservations.find(r => r.fabric_id === 'fabric-roll-1');
    check(reservation.requested_length_cm === 270 && reservation.pickup_time === '16:30', '보존된 3마·16:30 요청 정상 접수');
    await go('/buyer/pickup/fabric-roll-1');
    check(await page.locator('[data-buyer-pickup]').count() === 0 && await page.getByRole('link', { name: '기존 예약 확인' }).count() === 1, '기존 내 요청은 중복 입력 대신 기존 예약 안내');
    await page.getByRole('link', { name: '기존 예약 확인' }).click();
    await page.getByRole('link', { name: '예약 요청 취소' }).click();
    await page.getByRole('button', { name: '예약 취소하기' }).click(); await page.waitForURL('**status=CANCELED');
    await go('/buyer/pickup/fabric-roll-1');
    check(await page.getByLabel('요청 사항').inputValue() === '' && await page.getByLabel('요청 수량 (1마=90cm)').inputValue() === '2', '성공 후 픽업 초안 삭제');

    await go('/buyer/inquiries?compose=1&fabric_id=fabric-scrap-1');
    const content = '<b>수축 여부 문의</b>';
    await page.getByLabel('문의 내용 (1~1,000자)').fill(content);
    await page.locator('.site-nav').getByRole('link', { name: '원단목록' }).click(); await page.goBack(); await page.locator('[data-buyer-inquiry]').waitFor();
    check(await page.getByLabel('문의 내용 (1~1,000자)').inputValue() === content && await page.locator('[data-buyer-inquiry] b').count() === 0, '문의 초안 복원과 HTML escaping');
    check((await page.locator('[data-buyer-inquiry-count]').textContent()).startsWith(String(content.length)), '문의 글자수 복원');
    await page.getByRole('link', { name: '작성 취소' }).click();
    await page.getByRole('link', { name: '판매자 문의' }).click();
    check(await page.getByLabel('문의 내용 (1~1,000자)').inputValue() === '', '명시적 문의 취소 시 초안 삭제');
    await page.getByLabel('문의 내용 (1~1,000자)').fill('새 문의입니다.');
    await page.getByRole('button', { name: '문의 등록', exact: true }).click(); await page.waitForURL('**state=DONE');
    await go('/buyer/inquiries?compose=1&fabric_id=fabric-scrap-1');
    check(await page.getByLabel('문의 내용 (1~1,000자)').inputValue() === '', '문의 성공 후 초안 삭제');

    await go('/buyer/fabrics/fabric-scrap-2');
    check(await page.getByRole('heading', { name: '이런 활용 아이디어가 있어요' }).count() === 1 && await page.getByRole('heading', { name: '이 원단으로 만들 수 있어요' }).count() === 0, '추천 판정 전 제작 가능 확정 표현 제거');
    await page.getByRole('link', { name: '제작 조건 확인' }).click();
    check((await page.locator('main h1').textContent()).includes('없어요'), '부적합 원단 판정 유지');
    await go('/buyer/fabrics/fabric-roll-1?return=https%3A%2F%2Fexample.com');
    check((await page.locator('.buyer-breadcrumb a').getAttribute('href')).startsWith('#/buyer/fabrics?'), '외부 return URL 거부');

    await page.setViewportSize({ width: 390, height: 844 });
    await go('/buyer/patterns/pouch?fabric_id=fabric-check');
    const pattern = new URL(page.url()).hash;
    await page.getByRole('link', { name: '부자재 둘러보기' }).click();
    await page.locator('.buyer-store-list').getByRole('link', { name: /3. 그린 봉제 공방/ }).click();
    await page.waitForFunction(() => document.activeElement?.id === 'buyer-selected-store-title');
    const selected = await page.locator('#buyer-selected-store-title').boundingBox();
    check(selected.y >= 0 && selected.y < 844, '390px 판매처 선택 결과가 보이고 포커스 이동');
    check(await page.getByRole('link', { name: '판매처 안내 보기', exact: true }).count() === 1 && await page.locator('.buyer-page > .actions a').count() === 1, '지도 하단 중복 판매처 버튼 제거');
    await shot('store-selected-390');
    await page.screenshot({ path: path.join(__dirname, 'fixed-store-selected-390-viewport.png') });
    await page.getByRole('link', { name: '판매처 안내 보기' }).click();
    await page.getByRole('link', { name: '도안으로 돌아가기' }).click();
    check(new URL(page.url()).hash === pattern, '도안 → 지도 선택 → 매장 상세 → 원래 원단 도안 복귀');

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const [name, route] of [['detail','/buyer/fabrics/fabric-roll-1'],['pickup','/buyer/pickup/fabric-roll-1'],['inquiry','/buyer/inquiries?compose=1&fabric_id=fabric-roll-1'],['supplies','/buyer/supplies'],['pattern','/buyer/patterns/pouch?fabric_id=fabric-check']]) {
        await go(route); await shot(name + '-' + width);
        const screen = await page.evaluate(() => ({ width:innerWidth, scroll:document.documentElement.scrollWidth, heading:document.querySelector('main h1')?.textContent }));
        result.screens.push({ name, ...screen }); check(screen.scroll <= width, `${width}px ${name} 가로 넘침 없음`);
        if(name==='detail')result.assets.push({width,images:await page.locator('img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),natural:[img.naturalWidth,img.naturalHeight],rendered:[img.getBoundingClientRect().width,img.getBoundingClientRect().height],complete:img.complete})))});
      }
    }

    const { createSeed } = await import(pathToFileURL(path.resolve('frontend/src/prototype/data/seed.js')));
    const seed=createSeed(); const roll=seed.fabrics.find(f=>f.id==='fabric-roll-1');roll.available_length_cm=0;roll.reserved_length_cm=450;
    seed.reservations=[{id:'reservation-other',fabric_id:roll.id,buyer_id:'buyer-other',status:'ACCEPTED',sale_type:'ROLL',requested_length_cm:450}];
    const zeroContext=await browser.newContext({viewport:{width:1440,height:1000}});
    await zeroContext.addInitScript(saved=>localStorage.setItem('yangju-loop-html-v1',JSON.stringify(saved)),seed);
    const zero=await zeroContext.newPage();zero.on('pageerror',e=>result.errors.push(e.message));
    await zero.goto('http://127.0.0.1:5173/#/buyer/fabrics/fabric-roll-1');await zero.locator('.buyer-detail-panel').waitFor();
    check(await zero.locator('.buyer-detail-panel .badge').textContent()==='현재 요청 불가' && await zero.getByRole('link',{name:'픽업 요청하기',exact:true}).count()===0,'0마 상세: 요청 불가 표시 및 요청 링크 제거');
    await zero.screenshot({path:path.join(__dirname,'fixed-zero-detail-1440.png'),fullPage:true});
    for(const width of [1440,390,320]){
      await zero.setViewportSize({width,height:width===1440?1000:844});
      await zero.goto('http://127.0.0.1:5173/#/buyer/pickup/fabric-roll-1');await zero.locator('.buyer-page').first().waitFor();
      check(await zero.locator('[name=requested_ma]').count()===0&&await zero.getByRole('link',{name:'다른 원단 찾기'}).count()===1,`${width}px 0마 폼 대신 재고 안내와 복구 행동`);
      await zero.screenshot({path:path.join(__dirname,'fixed-zero-pickup-'+width+'.png'),fullPage:true});
      check(await zero.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px 0마 상태 가로 넘침 없음`);
    }
    check(result.assets.every(row=>row.images.every(img=>img.complete&&img.natural[0]>0&&(!img.src.includes('tote.svg')||(img.rendered[0]===180&&img.rendered[1]===148))&&(!img.src.includes('logo.svg')||(img.rendered[0]===28&&img.rendered[1]===28)))),'로고 28×28 / 토트백 180×148 원본 크기 유지');
    check(result.errors.length===0,'브라우저 오류 없음');
  } finally {
    fs.writeFileSync(path.join(__dirname,'fix-verification.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
