const { chromium } = require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const out = __dirname;
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const results = { observed: {}, smoke: [], errors: [] };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => results.errors.push(error.message));
    const go = async route => { await page.goto('http://127.0.0.1:5173/#' + route); await page.locator('main h1').waitFor(); await page.evaluate(() => document.fonts.ready); };
    const snap = async name => { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }); };
    const form = selector => page.locator(selector).evaluate(node => Object.fromEntries(new FormData(node)));
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('yangju-loop-html-v1')));

    await go('/buyer/fabrics?sale_type=ROLL');
    await page.getByLabel('색상', { exact: true }).selectOption('내추럴');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.waitForURL('**view=search');
    const filteredRoute = new URL(page.url()).hash;
    await snap('01-filtered-results-desktop');
    await page.getByRole('link', { name: '상세 보기', exact: true }).click();
    await page.locator('.buyer-breadcrumb a').click();
    results.observed.searchReturn = { from: filteredRoute, to: new URL(page.url()).hash, selectedColor: await page.getByLabel('색상', { exact: true }).inputValue() };
    await snap('02-search-return-cleared-desktop');

    await go('/buyer/pickup/fabric-roll-1');
    await page.getByLabel('요청 수량 (1마=90cm)').fill('3');
    await page.getByLabel('희망 픽업 시간').fill('16:30');
    await page.getByLabel('요청 사항').fill('방문 전에 두께를 확인하고 싶어요.');
    const pickupBefore = await form('[data-buyer-pickup]');
    await snap('03-pickup-draft-before-desktop');
    await page.getByRole('link', { name: '원단 상세로 돌아가기' }).click();
    await page.goBack(); await page.locator('[data-buyer-pickup]').waitFor();
    results.observed.pickupDraft = { before: pickupBefore, after: await form('[data-buyer-pickup]') };
    await snap('04-pickup-draft-lost-desktop');

    await go('/buyer/inquiries?compose=1&fabric_id=fabric-scrap-1');
    await page.getByLabel('문의 내용 (1~1,000자)').fill('세탁 후 수축이 있는지 궁금합니다.');
    const inquiryBefore = await form('[data-buyer-inquiry]');
    await page.locator('.site-nav').getByRole('link', { name: '원단목록' }).click();
    await page.goBack(); await page.locator('[data-buyer-inquiry]').waitFor();
    results.observed.inquiryDraft = { before: inquiryBefore, after: await form('[data-buyer-inquiry]') };

    await go('/buyer/fabrics/fabric-scrap-2');
    results.observed.recommendation = { detailClaim: await page.getByRole('heading', { name: '이 원단으로 만들 수 있어요' }).textContent() };
    await snap('05-recommendation-claim-desktop');
    await page.getByRole('link', { name: '제작 조건 확인' }).click();
    results.observed.recommendation.resultHeading = await page.locator('main h1').textContent();
    await snap('06-recommendation-no-result-desktop');

    await go('/buyer/pickup/fabric-roll-1');
    await page.getByLabel('요청 수량 (1마=90cm)').fill('5');
    await page.getByRole('button', { name: '픽업 요청 보내기' }).click();
    await page.waitForURL('**submitted=*');
    const id = (await state()).reservations.find(item => item.fabric_id === 'fabric-roll-1').id;
    await page.getByRole('link', { name: '요청 상세 확인' }).click();
    results.smoke.push({ action: '5마 요청 → 접수 → 상세', heading: await page.locator('main h1').textContent() });
    await go('/seller/reservations?status=REQUESTED&id=' + encodeURIComponent(id));
    await page.getByRole('link', { name: '수락', exact: true }).click();
    await page.getByRole('button', { name: '확인 후 수락', exact: true }).click();
    await page.waitForURL('**status=ACCEPTED**');
    await go('/buyer/fabrics/fabric-roll-1');
    const stock = (await state()).fabrics.find(item => item.id === 'fabric-roll-1');
    results.observed.noAvailability = { available: stock.available_length_cm, detailBadge: await page.locator('.buyer-detail-panel .badge').textContent(), detailRequestLink: await page.getByRole('link', { name: '픽업 요청하기', exact: true }).count() };
    await snap('07-zero-available-detail-desktop');
    await page.getByRole('link', { name: '픽업 요청하기', exact: true }).click();
    Object.assign(results.observed.noAvailability, { quantity: await page.getByLabel('요청 수량 (1마=90cm)').inputValue(), max: await page.getByLabel('요청 수량 (1마=90cm)').getAttribute('max'), submitDisabled: await page.getByRole('button', { name: '픽업 요청 보내기' }).isDisabled(), hasStockRecovery: await page.getByRole('link', { name: /기존 예약|다른 원단|예약 내역/ }).count() });
    await snap('08-zero-available-pickup-desktop');
    await go('/buyer/reservations/' + encodeURIComponent(id));
    await page.getByRole('link', { name: '예약 취소', exact: true }).click();
    await page.getByRole('button', { name: '예약 취소하기', exact: true }).click();
    await page.waitForURL('**status=CANCELED');
    results.smoke.push({ action: '실제 수락 예약 취소', status: (await state()).reservations.find(item => item.id === id).status, available: (await state()).fabrics.find(item => item.id === 'fabric-roll-1').available_length_cm });

    await page.setViewportSize({ width: 390, height: 844 });
    await go('/buyer/supplies');
    await page.locator('.buyer-store-list').getByRole('link', { name: /3. 그린 봉제 공방/ }).click();
    results.observed.mobileMapSelection = await page.evaluate(() => ({ scrollY, selectedCardTop: [...document.querySelectorAll('main section')].find(section => section.querySelector('h2')?.textContent === '선택한 판매처 · 예시')?.getBoundingClientRect().top, height: innerHeight, selectedName: [...document.querySelectorAll('main section')].find(section => section.querySelector('h2')?.textContent === '선택한 판매처 · 예시')?.querySelectorAll('h2')[1]?.textContent, focus: document.activeElement?.textContent }));
    await snap('09-mobile-store-selection-full');
    await page.screenshot({ path: path.join(out, '10-mobile-store-selection-viewport.png') });

    for (const [name, route] of [['pickup', '/buyer/pickup/fabric-roll-1'], ['reservation', '/buyer/reservations?status=CANCELED'], ['inquiry', '/buyer/inquiries?compose=1&fabric_id=fabric-roll-1'], ['pattern', '/buyer/patterns/pouch?fabric_id=fabric-roll-1'], ['error', '/buyer/errors/insufficient?example=1']]) {
      await go(route); await snap('mobile-' + name);
      results.smoke.push({ action: '390px ' + name, ...(await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight, h1Top: document.querySelector('main h1').getBoundingClientRect().top }))) });
    }
    await go('/buyer/patterns/pouch?fabric_id=fabric-check');
    await page.getByRole('link', { name: '부자재 둘러보기' }).click();
    results.observed.patternSupplyReturn = { route: new URL(page.url()).hash, returnLinks: await page.getByRole('link', { name: /도안|제작 조건/ }).count() };
    await page.getByRole('link', { name: '판매처 안내 보기' }).click();
    results.smoke.push({ action: '도안 → 부자재 → 판매처 상세', heading: await page.locator('main h1').textContent() });
  } finally {
    fs.writeFileSync(path.join(out, 'audit-results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
