import test from 'node:test';
import assert from 'node:assert/strict';
import { createReservationMutation } from '../src/react/hooks/useReservationMutation.js';
import { sellerStoreDraft, sellerStoreInput, sellerStoreValidation, sellerStoreNeedsReview, sellerStoreFailure, startSellerStoreRead, saveSellerStore } from '../src/react/pages/seller/sellerStoreModel.js';

const draft = () => ({ store_name: '  양주 원단점  ', address: '  양주시 주소 · 2층  ', phone_number: '  031-000-0000  ', closed_days: ' 일요일 ', pickup_guide: ' 오전 방문 전 연락해 주세요. ' });
const seller = status => ({ id: 29, userId: 29, nickname: '매장 판매자', email: 'seller@example.test', role: 'SELLER', hasStore: false, seller_approval_status: status });
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('store input includes only store fields, trims text and clears optional fields without touching personal profile', () => {
  const value = sellerStoreInput({ ...draft(), nickname: '보내면 안 됨', personal_phone: '보내면 안 됨', detail_address: '별도 필드 없음', closed_days: '   ', pickup_guide: '' });
  assert.deepEqual(value, { store_name: '양주 원단점', address: '양주시 주소 · 2층', phone_number: '031-000-0000', closed_days: null, pickup_guide: null });
  assert.deepEqual(sellerStoreDraft(null), { store_name: '', address: '', phone_number: '', closed_days: '', pickup_guide: '' });
  assert.equal(sellerStoreDraft({ store_name: '현재 매장', closed_days: null }).store_name, '현재 매장');
});

test('store validation follows required and maximum lengths without inventing a phone pattern', () => {
  assert.equal(sellerStoreValidation(draft()), '');
  assert.equal(sellerStoreValidation({ ...draft(), phone_number: '매장에 문의' }), '');
  for (const [key, max] of [['store_name', 100], ['address', 255], ['phone_number', 20], ['closed_days', 100], ['pickup_guide', 5000]]) {
    assert.equal(sellerStoreValidation({ ...draft(), [key]: '가'.repeat(max) }), '');
    assert.ok(sellerStoreValidation({ ...draft(), [key]: '가'.repeat(max + 1) }));
  }
  for (const key of ['store_name', 'address', 'phone_number']) assert.ok(sellerStoreValidation({ ...draft(), [key]: '  ' }));
});

test('fresh read gets profile before store and exact no-store result remains null', async () => {
  const calls = [], results = [];
  const api = { refreshSellerProfile: async () => { calls.push('profile'); return seller('PENDING'); }, getMyStore: async () => { calls.push('store'); return null; } };
  const stop = startSellerStoreRead(api, false, value => results.push(value), assert.fail);
  await settle(); stop();
  assert.deepEqual(calls, ['profile', 'store']); assert.equal(results[0].store, null); assert.equal(results[0].seller.seller_approval_status, 'PENDING');
});

test('approval refresh does not depend on the store endpoint, and a store read failure never opens an empty form', async () => {
  let storeCalls = 0; const results = [], failures = [], error = new Error('서버 연결 실패');
  const api = { refreshSellerProfile: async () => seller('REJECTED'), getMyStore: async () => { storeCalls++; throw error; } };
  const approval = startSellerStoreRead(api, true, value => results.push(value), assert.fail);
  await settle(); approval(); assert.equal(storeCalls, 0); assert.equal(results[0].seller.seller_approval_status, 'REJECTED');
  const store = startSellerStoreRead(api, false, () => assert.fail('Read failure must not become no-store'), value => failures.push(value));
  await settle(); store(); assert.deepEqual(failures, [error]);
});

test('StrictMode cleanup skips its request and a late profile cannot start a store lookup or update an unmounted UI', async () => {
  const wait = deferred(); let profileCalls = 0, storeCalls = 0; const results = [];
  const api = { refreshSellerProfile: async () => { profileCalls++; return wait.promise; }, getMyStore: async () => { storeCalls++; return null; } };
  const first = startSellerStoreRead(api, false, value => results.push(value), assert.fail); first();
  const second = startSellerStoreRead(api, false, value => results.push(value), assert.fail); await settle(); second();
  wait.resolve(seller('APPROVED')); await settle();
  assert.equal(profileCalls, 1); assert.equal(storeCalls, 0); assert.deepEqual(results, []);
});

test('pending/rejected sellers may register; UI uses explicit create only and stores acknowledgement before later reads', async () => {
  for (const approval of ['PENDING', 'REJECTED']) {
    const user = seller(approval), operations = [], calls = [];
    const api = { createStore: async input => { calls.push(input); return { id: 8 }; }, updateStore: () => assert.fail('No automatic PATCH'), updateSellerProfile: () => assert.fail('No personal profile write') };
    const result = await saveSellerStore(api, { existing: false, draft: draft(), onOperation: value => operations.push(value) });
    assert.equal(operations[0].status, 'UNKNOWN'); assert.equal(operations[1].status, 'CONFIRMED');
    assert.equal(result.id, 8); assert.equal(calls.length, 1); assert.equal(user.seller_approval_status, approval);
  }
});

test('existing store uses update only and preserves the user input object during success/failure', async () => {
  const input = draft(), before = structuredClone(input), calls = [];
  const api = { createStore: () => assert.fail('Existing store must not POST'), updateStore: async value => { calls.push(value); return { id: 7, ...value }; } };
  const result = await saveSellerStore(api, { existing: true, draft: input, onOperation: () => {} });
  assert.equal(result.kind, 'update'); assert.equal(result.id, 7); assert.equal(calls.length, 1); assert.deepEqual(input, before);
});

test('create conflict and unknown outcomes remain locked for fresh review and never automatically switch to PATCH', async () => {
  for (const error of [Object.assign(new Error('중복'), { code: 'STORE_ALREADY_EXISTS' }), Object.assign(new Error('시간 초과'), { outcomeUnknown: true })]) {
    const operations = [], input = draft(); let calls = 0;
    const api = { createStore: async () => { calls++; throw error; }, updateStore: () => assert.fail('Conflict recovery cannot automatically overwrite store') };
    await assert.rejects(saveSellerStore(api, { existing: false, draft: input, onOperation: value => operations.push(value) }), value => value === error);
    assert.equal(calls, 1); assert.equal(operations.at(-1).status, 'UNKNOWN'); assert.deepEqual(operations.at(-1).input, sellerStoreInput(input));
    assert.equal(sellerStoreNeedsReview(error), true); assert.ok(sellerStoreFailure(error));
  }
});

test('known field rejection unlocks correction while no-store PATCH response requires fresh registration check', async () => {
  for (const code of ['VALIDATION_ERROR', 'NOT_FOUND']) {
    const operations = [], error = Object.assign(new Error(code), { code });
    await assert.rejects(saveSellerStore({ updateStore: async () => { throw error; } }, { existing: true, draft: draft(), onOperation: value => operations.push(value) }));
    assert.equal(operations.at(-1)?.status || null, code === 'NOT_FOUND' ? 'UNKNOWN' : null);
  }
});

test('double submit sends one write and session change or departure leaves uncertainty without late success/navigation', async () => {
  for (const leave of ['session', 'page']) {
    const wait = deferred(), operations = []; let calls = 0, sameSession = true;
    const mutation = createReservationMutation({ isSessionCurrent: () => sameSession, onBusy: () => {}, onFailure: error => { if (error) assert.fail(error.message); } });
    const api = { createStore: async () => { calls++; return wait.promise; } };
    const run = options => saveSellerStore(api, { existing: false, draft: draft(), ...options, onOperation: value => operations.push(value) });
    const first = mutation.run(run), second = mutation.run(run); assert.equal(calls, 1);
    if (leave === 'session') sameSession = false; else mutation.dispose();
    wait.resolve({ id: 8 }); await Promise.all([first, second]);
    assert.equal(operations.length, 1); assert.equal(operations[0].status, 'UNKNOWN'); mutation.dispose();
  }
});

test('successful POST followed by failed fresh read preserves confirmed acknowledgement and never resends', async () => {
  let calls = 0, operation;
  const api = { createStore: async () => { calls++; return { id: 8 }; }, refreshSellerProfile: async () => seller('PENDING'), getMyStore: async () => { throw new Error('후속 조회 실패'); } };
  await saveSellerStore(api, { existing: false, draft: draft(), onOperation: value => { operation = value; } });
  const failures = [], stop = startSellerStoreRead(api, false, assert.fail, value => failures.push(value));
  await settle(); stop();
  assert.equal(calls, 1); assert.equal(operation.status, 'CONFIRMED'); assert.equal(operation.id, 8); assert.equal(failures.length, 1);
});
