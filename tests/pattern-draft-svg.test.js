import test from 'node:test';
import assert from 'node:assert/strict';
import { patternPages, patternPageSvg, patternSvg } from '../src/react/pages/pattern-draft-svg.js';

const part = { part_name: '몸통', width_cm: 20, height_cm: 30, quantity: 2, note: '실선 재단' };

test('도안은 두 조각씩 나누고 모든 인쇄 시트와 5cm 눈금을 유지한다', () => {
  const draft = { title: '다섯 조각', parts: Array.from({ length: 5 }, (_, index) => ({ ...part, part_name: `조각 ${index}` })) };
  assert.deepEqual(patternPages(draft.parts).map(page => page.length), [2, 2, 1]);
  const svg = patternSvg(draft, { watermark: true });
  assert.match(svg, /width="297mm" height="630mm"/);
  assert.equal(svg.match(/5 × 5 cm/g).length, 3);
  assert.match(patternPageSvg(draft, 2), /조각 4/);
  assert.doesNotMatch(patternPageSvg(draft, 2), /조각 0/);
});

test('AI가 반환한 제목·부품·비고의 XML 문자가 실행 가능한 태그가 되지 않는다', () => {
  const attack = '<script>alert("x")</script>&';
  const svg = patternSvg({ title: attack, parts: [{ ...part, part_name: attack, note: attack }] });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;&amp;/);
  assert.deepEqual(patternPages([]), [[]]);
  assert.match(patternPageSvg({ title: '빈 도안', parts: [] }, 0), /viewBox="0 0 297 210"/);
});
