import test from 'node:test';
import assert from 'node:assert/strict';
import { inquiryDraftKey, inquiryDraft, submitInquiryDraft, selectedPhotos, uploadPhotoSummary, sellerCalendar, stockAfterReservation } from '../src/react/pages/seller/sellerUx.js';
import { formatDate, formatDateTime } from '../src/react/lib/format.js';
import { createMockApi } from '../src/prototype/services/mock-api.js';

const createApi = () => createMockApi({ getItem: () => null, setItem: () => {} });

test('inquiry drafts remain separate across tab changes and failed answers; only successful answer clears its draft', async () => {
  const drafts = new Map(), inquiry = { id: 'first', answer: '' }, second = { id: 'second', answer: '기존 답변' };
  const text = '  세탁 전에 한 번 확인해 주세요.\n사진도 확인했어요.  ';
  drafts.set(inquiryDraftKey(inquiry.id), text);
  drafts.set(inquiryDraftKey(second.id), '수정 중인 두 번째 답변');
  assert.equal(inquiryDraft(drafts, second), '수정 중인 두 번째 답변');
  assert.equal(inquiryDraft(drafts, inquiry), text);
  await assert.rejects(submitInquiryDraft({ answerInquiry: async () => { throw new Error('전송 실패'); } }, drafts, inquiry.id, text.trim()));
  assert.equal(inquiryDraft(drafts, inquiry), text);
  await submitInquiryDraft({ answerInquiry: async (id, content) => { assert.equal(id, inquiry.id); assert.equal(content, text.trim()); } }, drafts, inquiry.id, text.trim());
  assert.equal(drafts.has(inquiryDraftKey(inquiry.id)), false);
  assert.equal(inquiryDraft(drafts, second), '수정 중인 두 번째 답변');
});

test('answer registration uses the mock service then clears draft and formats the returned timestamp in KST', async () => {
  const api = createApi();
  const inquiry = await api.createInquiry({ fabric_id: 'fabric-roll-1', content: '세탁할 수 있나요?' });
  const drafts = new Map([[inquiryDraftKey(inquiry.id), '찬물 손세탁을 권장해요.']]);
  await api.setRole('SELLER');
  await submitInquiryDraft(api, drafts, inquiry.id, inquiryDraft(drafts, inquiry));
  const answered = api.getState().inquiries.find(item => item.id === inquiry.id);
  assert.equal(answered.answer, '찬물 손세탁을 권장해요.');
  assert.match(formatDateTime(answered.answered_at), /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
  assert.equal(drafts.size, 0);
  assert.equal(formatDateTime('2026-10-11T18:15:00Z'), '2026.10.12 03:15');
  assert.equal(formatDate('2026-10-11'), '2026.10.11');
});

test('month calendars start Monday, retain valid selected date, and reject stale or impossible dates', () => {
  assert.deepEqual(sellerCalendar('2026-10', '2026-10-15'), { year: 2026, number: 10, days: 31, offset: 3, selected: '2026-10-15' });
  assert.equal(sellerCalendar('2026-11', '2026-10-15').selected, '');
  assert.equal(sellerCalendar('2026-02', '2026-02-29').selected, '');
  assert.equal(sellerCalendar('2028-02', '2028-02-29').selected, '2028-02-29');
  assert.equal(sellerCalendar('2026-10', '2026-10-00').selected, '');
});

test('photos show only selected slots and partial-upload rows identify saved and failed files', () => {
  assert.deepEqual(selectedPhotos({ photo_names: [], photo_slots: {} }), []);
  const photos = selectedPhotos({ photo_names: ['하자.jpg'], photo_slots: { DEFECT: '하자.jpg' } });
  assert.equal(photos.length, 1); assert.equal(photos[0].slot, 'DEFECT');
  assert.equal(selectedPhotos({ photo_names: ['전체.png'], photo_slots: {} })[0].slot, 'FULL');
  assert.deepEqual(uploadPhotoSummary({ stage: 'PARTIAL', photo_names: ['전체.png', '확대.png'] }, { photos: ['전체.png'] }), [{ name: '전체.png', status: 'DONE' }, { name: '확대.png', status: 'FAILED' }]);
  assert.deepEqual(uploadPhotoSummary({ stage: 'PARTIAL', photo_names: ['동일.png', '동일.png'] }, { photos: ['동일.png'] }), [{ name: '동일.png', status: 'DONE' }, { name: '동일.png', status: 'FAILED' }]);
  assert.equal(uploadPhotoSummary({ stage: 'UNKNOWN', photo_names: ['전체.png'] }, { photos: [] })[0].status, 'WAITING');
});

test('reservation confirmation predicts the same stock as accept, cancel and pickup service transitions', async () => {
  for (const final of ['CANCELED', 'PICKED_UP']) {
    const api = createApi(), pickup = new Date(); pickup.setDate(pickup.getDate() + 7);
    const request = await api.createReservation({ fabric_id: 'fabric-roll-1', requested_length_cm: 180, pickup_date: `${pickup.getFullYear()}-${String(pickup.getMonth()+1).padStart(2,'0')}-${String(pickup.getDate()).padStart(2,'0')}`, pickup_time: '14:00' });
    const fabric = () => api.getState().fabrics.find(item => item.id === request.fabric_id);
    const expected = stockAfterReservation(fabric(), request, 'ACCEPTED');
    assert.deepEqual(expected.before, { remaining: 450, reserved: 0, available: 450 });
    assert.deepEqual(expected.after, { remaining: 450, reserved: 180, available: 270 });
    await api.setRole('SELLER'); await api.updateReservation(request.id, 'ACCEPTED');
    assert.equal(fabric().available_length_cm, expected.after.available);
    const after = stockAfterReservation(fabric(), request, final).after;
    await api.updateReservation(request.id, final);
    assert.equal(fabric().available_length_cm, after.available);
    assert.equal(fabric().remaining_length_cm, after.remaining);
    assert.equal(fabric().reserved_length_cm, after.reserved);
  }
});
