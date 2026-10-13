import test from 'node:test';
import assert from 'node:assert/strict';
import { aiFabricDraft, aiOptionLabel, aiMessageDisplay, aiSessionSnapshot, changeAiSaleType, reconcileAiRead, aiPath } from '../src/react/pages/seller/sellerAiModel.js';
import { validateLiveFabricDraft } from '../src/react/pages/seller/sellerLiveFabricModel.js';

const session = () => ({ sessionId: 'session-one', session_status: 'IN_PROGRESS', ai_draft: { sale_type: 'ROLL', title: '원단' }, unconfirmed_fields: [], next_question: { field: 'size', text: '크기를 알려 주세요' }, messages: [{ role: 'assistant', content: '크기를 알려 주세요', created_at: '2026-10-12T10:00:00+09:00' }], fabric_id: null });

test('AI partial drafts preserve unanswered values instead of inventing material, dimensions or defect answers', () => {
  const value = aiFabricDraft({ ai_draft: {} });
  assert.equal(value.sale_type, ''); assert.equal(value.material, '미확인');
  assert.equal(value.width_cm, ''); assert.equal(value.price, '');
  assert.equal(value.has_defect, null); assert.equal(value.thickness, ''); assert.equal(value.color, '');
});

test('AI wire codes and roll length map to the existing seller form without losing photo objects', () => {
  const photos = [{ slot: 'FULL', file: { name: 'fabric.png' } }];
  const draft = aiFabricDraft({ ai_draft: { sale_type: 'ROLL', material: 'COTTON', thickness: 'NORMAL', color_family: 'NAVY', remaining_length_cm: 270, has_defect: false } }, { photos, description: '판매자 메모' });
  assert.equal(draft.material, '면'); assert.equal(draft.thickness, '중간 두께'); assert.equal(draft.color, '네이비');
  assert.equal(draft.length_cm, 270); assert.equal(draft.remaining_length_cm, 270); assert.equal(draft.has_defect, false);
  assert.equal(draft.photos, photos); assert.equal(draft.description, '판매자 메모');
  const fromMemo = aiFabricDraft({ ai_draft: { description: '원단의 가치' } }, { description: '이전 메모' });
  assert.equal(fromMemo.description, '원단의 가치');
});

test('changing AI sale type keeps seller edits and photos but requires new dimensions for that type', () => {
  const draft = { sale_type: 'ROLL', title: '수정한 제목', length_cm: 270, remaining_length_cm: 270, photos: [{}] };
  assert.equal(changeAiSaleType(draft, 'ROLL'), draft);
  const changed = changeAiSaleType(draft, 'SCRAP');
  assert.equal(changed.title, draft.title); assert.equal(changed.photos, draft.photos);
  assert.equal(changed.length_cm, ''); assert.equal(changed.remaining_length_cm, null);
});

test('a fresh GET with unchanged IN_PROGRESS data never unlocks an uncertain answer or confirmation', () => {
  const before = session();
  for (const kind of ['answer', 'confirm', 'abort']) {
    const operation = { kind, snapshot: aiSessionSnapshot(before) };
    const record = reconcileAiRead({ session: before, operation, answer: '폭 150 3마' }, structuredClone(before));
    assert.equal(record.operation, operation); assert.equal(record.answer, '폭 150 3마');
  }
});

test('GET that contains a new answer message resolves an uncertain answer even if the same question repeats', () => {
  const before = session();
  const after = { ...before, messages: [...before.messages, { role: 'user', content: '20cm', created_at: '2026-10-12T10:01:00+09:00' }, ...before.messages] };
  const result = reconcileAiRead({ operation: { kind: 'answer', snapshot: aiSessionSnapshot(before) }, answer: '20cm' }, after);
  assert.equal(result.operation, null); assert.equal(result.answer, '');
});

test('confirmed recovery retains the seller-reviewed final form and selected photos for one registration', () => {
  const draft = { title: '최종 수정한 이름', photos: [{}] };
  const result = reconcileAiRead({ draft, operation: { kind: 'confirm' } }, { ...session(), session_status: 'CONFIRMED', fabric_id: '17' });
  assert.equal(result.draft, draft); assert.equal(result.session.fabric_id, '17'); assert.equal(result.operation, null);
});

test('known successful answers can recover a failed history read without re-sending the answer', () => {
  const record = reconcileAiRead({ operation: { kind: 'answer', acknowledged: true }, needsRead: true }, session());
  assert.equal(record.needsRead, false); assert.equal(record.operation, null);
});

test('AI final form rejects unanswered defect questions and retains the existing dimensional validation', () => {
  const draft = { ...aiFabricDraft({ ai_draft: { sale_type: 'ROLL', title: '면', width_cm: 150, remaining_length_cm: 270, material: 'COTTON', thickness: 'NORMAL', color_family: 'NAVY', price: 2000 } }), photos: [{ file: {} }] };
  assert.match(validateLiveFabricDraft(draft, true), /하자 여부/);
  assert.equal(validateLiveFabricDraft({ ...draft, has_defect: false }, true), '');
  assert.equal(validateLiveFabricDraft({ ...draft, sale_type: 'SCRAP', length_cm: 100, remaining_length_cm: null, has_defect: false }, true), '');
});

test('AI choice labels are human-readable and session routes encode identifiers', () => {
  assert.equal(aiOptionLabel('sale_type', 'SCRAP'), '자투리 1장');
  assert.equal(aiOptionLabel('color_family', 'NAVY'), '네이비');
  assert.equal(aiOptionLabel('has_defect', 'false'), '하자 없음');
  assert.equal(aiPath('id?foo#bar', 'edit'), '/seller/register/ai?session=id%3Ffoo%23bar&step=edit');
});

test('chat display translates only exact user option tokens without modifying authoritative messages', () => {
  for (const [content, expected] of [['ROLL', '롤 원단'], ['COTTON', '면'], ['NORMAL', '중간 두께'], ['NAVY', '네이비'], ['false', '하자 없음']]) {
    const message = Object.freeze({ role: 'user', content });
    assert.equal(aiMessageDisplay(message), expected);
    assert.equal(message.content, content);
  }
  for (const content of ['roll', 'COTTON 원단', '폭 150에 3마', ' false ']) assert.equal(aiMessageDisplay({ role: 'user', content }), content);
  assert.equal(aiMessageDisplay({ role: 'assistant', content: 'ROLL' }), 'ROLL');
});
