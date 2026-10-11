const { chromium } = require('C:/Users/home/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const result = { passed: [], errors: [], warnings: [] };
  const check = (condition, name) => { if (!condition) throw Error(name); result.passed.push(name); };
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) result.warnings.push(message.text()); });
    const go = async route => { await page.goto('http://127.0.0.1:5173/#' + route); await page.locator('main h1').waitFor(); };
    await go('/buyer/fabrics/fabric-roll-1');
    check(await page.evaluate(() => [...document.scripts].some(script => new URL(script.src || '/', location.href).pathname === '/src/main.jsx')), 'React entry 사용');
    await page.locator('[data-buyer-photo="1"]').click();
    check(await page.locator('[data-buyer-gallery] .fabric-art--linen').count() === 1, '갤러리 선택을 React state로 반영');
    check(await page.locator('[data-buyer-photo][aria-pressed="true"]').count() === 1, '갤러리 선택 상태 단일 유지');
    await page.locator('[data-buyer-photo="2"]').click();
    check(await page.locator('[data-buyer-gallery] .fabric-art--gingham').count() === 1, '갤러리 두 번째 변경 정상');

    await go('/buyer/fabrics?sale_type=ROLL');
    await page.getByLabel('색상', { exact: true }).selectOption('내추럴');
    await page.getByRole('button', { name: '상세 조건 접기 ↑' }).click();
    await page.waitForURL('**collapsed=1');
    check(await page.locator('[data-figma-node="127:2823"]').count() === 1 && await page.locator('.buyer-compact-card').count() === 1, '선택한 필터를 유지하며 목록 접기');
    await page.getByRole('link', { name: '상세 조건 펼치기' }).click();
    check(await page.getByLabel('색상', { exact: true }).inputValue() === '내추럴', '조건 다시 펼칠 때 선택값 복원');
    await page.getByRole('button', { name: '조건 초기화' }).click();
    check(await page.getByLabel('색상', { exact: true }).inputValue() === '', '필터 초기화 시 선택값 초기화');
    await page.getByRole('button', { name: '필터 조건 선택' }).click();
    check(await page.evaluate(() => document.activeElement?.name === 'material'), '하단 필터 바로가기 포커스 유지');

    await go('/buyer/profile?edit=1');
    await page.getByLabel('닉네임').fill('<김루프>');
    await page.getByLabel('전화번호 (선택)').fill('123');
    await page.getByRole('button', { name: '저장하기', exact: true }).click();
    await page.waitForURL('**state=SAVED');
    await page.getByRole('link', { name: '마이페이지로' }).click();
    check((await page.locator('.buyer-info').textContent()).includes('<김루프>') && await page.locator('김루프').count() === 0, '프로필 저장 및 JSX 텍스트 escaping');
    check((await page.locator('.buyer-info').textContent()).includes('123'), '선택 연락처에 임의 최소 길이 제한 없음');
    await page.getByRole('link', { name: '정보 수정', exact: true }).click();
    check(await page.getByLabel('로그인 이메일').getAttribute('readonly') !== null, '로그인 이메일 읽기 전용 유지');
    await page.getByLabel('닉네임').fill('   ');
    await page.getByRole('button', { name: '저장하기', exact: true }).click();
    check(await page.locator('[data-buyer-error]').textContent() === '닉네임을 입력해 주세요.', '공백 닉네임 오류 표시');
    check(await page.locator('[data-buyer-error]').evaluate(node => document.activeElement === node), 'React 오류 상태 갱신 후 포커스');
    await page.getByRole('link', { name: '취소', exact: true }).click();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.waitForURL('**/auth/buyer/login');
    check(true, '프로필 로그아웃 → 구매자 로그인 연결');
    check(result.errors.length === 0 && result.warnings.length === 0, 'React 브라우저 오류 및 controlled/key 경고 없음');
  } finally {
    fs.writeFileSync(path.join(__dirname, 'react-interactions.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
