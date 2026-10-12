import test from 'node:test';
import assert from 'node:assert/strict';
import { createReservationMutation } from '../src/react/hooks/useReservationMutation.js';
import { profileDraftKey, profileOperationKey, profileDraft, profileInput, profileValidation, profileMatches, sameProfileAccount, startProfileRead, saveProfile } from '../src/react/pages/profile-model.js';

const user = { userId: 7, role: 'BUYER', email: 'buyer@example.test', nickname: '구매자', phone_number: '010-0000-0000' };
const draft = { nickname: '  새 닉네임  ', phone_number: '  ' };
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const auth = () => ({ status: 'authenticated', revision: 1 });

test('profile input trims allowed fields and clears optional phone without sending identity, role or store fields', () => {
  assert.deepEqual(profileInput({ ...draft, role: 'ADMIN', email: 'no@example.test', store_name: 'not sent' }), { nickname: '새 닉네임', phone_number: null });
  assert.deepEqual(profileDraft({ nickname: '이름', phone_number: null }), { nickname: '이름', phone_number: '' });
  assert.equal(profileValidation(draft), '');
  assert.ok(profileValidation({ ...draft, nickname: ' ' }));
  assert.equal(profileValidation({ nickname: '가'.repeat(50), phone_number: '1'.repeat(20) }), '');
  assert.ok(profileValidation({ ...draft, nickname: '가'.repeat(51) }));
  assert.ok(profileValidation({ ...draft, phone_number: '1'.repeat(21) }));
  assert.equal(profileValidation({ ...draft, phone_number: '문자로 연락' }), '');
});

test('draft/operation keys isolate account identities and roles; profile equality is not email based', () => {
  const other = { ...user, userId: 8 }, seller = { ...user, role: 'SELLER' };
  assert.notEqual(profileDraftKey(user), profileDraftKey(other));
  assert.notEqual(profileOperationKey(user), profileOperationKey(seller));
  assert.equal(sameProfileAccount(user, { ...user, id: '7', email: 'changed@example.test' }), true);
  assert.equal(sameProfileAccount(user, seller), false);
  assert.equal(profileMatches({ ...user, phone_number: '' }, { nickname: '구매자', phone_number: null }), true);
});

test('fresh profile read skips disposed StrictMode request and suppresses late session responses', async () => {
  const wait = deferred(), results = []; let revision = 1, calls = 0;
  const api = { getAuth: () => ({ status: 'authenticated', revision }), getMyProfile: async () => { calls++; return wait.promise; } };
  const first = startProfileRead(api, value => results.push(value), assert.fail); first();
  const second = startProfileRead(api, value => results.push(value), assert.fail); await settle();
  revision++; wait.resolve(user); await settle(); second();
  assert.equal(calls, 1); assert.deepEqual(results, []);
});

test('profile read surfaces errors without substituting blank account data', async () => {
  const failure = new Error('read failed'), errors = [];
  const stop = startProfileRead({ getAuth: auth, getMyProfile: async () => { throw failure; } }, assert.fail, error => errors.push(error));
  await settle(); stop(); assert.deepEqual(errors, [failure]);
});

test('a still-active GET invalidated by a profile/store write leaves loading and offers a successful fresh retry', async () => {
  const errors = [], results = []; let invalidated = true;
  const api = { getAuth: auth, getMyProfile: async ({ signal }) => {
    assert.equal(signal.aborted, false);
    if (invalidated) throw new DOMException('Aborted', 'AbortError');
    return user;
  } };
  const first = startProfileRead(api, value => results.push(value), error => errors.push(error));
  await settle(); first();
  assert.equal(errors.length, 1); assert.equal(errors[0].code, 'STALE_PROFILE_READ');
  assert.match(errors[0].message, /다시 조회/); assert.deepEqual(results, []);
  invalidated = false;
  const retry = startProfileRead(api, value => results.push(value), error => errors.push(error));
  await settle(); retry();
  assert.deepEqual(results, [user]); assert.equal(errors.length, 1);
});

test('profile save records uncertainty before one PATCH and acknowledges validated result', async () => {
  const operations = [], calls = [], input = profileInput(draft);
  const api = { updateProfile: async value => { calls.push(value); assert.equal(operations.at(-1).status, 'UNKNOWN'); return { ...user, ...value }; } };
  const result = await saveProfile(api, { user, draft, onOperation: value => operations.push(value) });
  assert.equal(calls.length, 1); assert.deepEqual(calls[0], input);
  assert.equal(result.nickname, '새 닉네임'); assert.equal(result.email, user.email);
  assert.equal(operations.at(-1).status, 'CONFIRMED'); assert.equal(draft.nickname, '  새 닉네임  ');
});

test('unknown writes stay locked; known validation rejection allows correction without auto retry', async () => {
  for (const unknown of [true, false]) {
    let calls = 0; const operations = [], failure = Object.assign(new Error('failed'), { outcomeUnknown: unknown });
    await assert.rejects(saveProfile({ updateProfile: async () => { calls++; throw failure; } }, { user, draft, onOperation: value => operations.push(value) }), failure);
    assert.equal(calls, 1); assert.equal(operations.at(-1)?.status || null, unknown ? 'UNKNOWN' : null);
  }
});

test('mismatched account or values in PATCH response never produces false success', async () => {
  for (const result of [{ ...user, ...profileInput(draft), userId: 8 }, user]) {
    const operations = [];
    await assert.rejects(saveProfile({ updateProfile: async () => result }, { user, draft, onOperation: value => operations.push(value) }), failure => failure.outcomeUnknown);
    assert.deepEqual(operations.map(value => value.status), ['UNKNOWN']);
  }
});

test('double submit sends once and navigation/session changes suppress late acknowledgement', async () => {
  for (const leave of ['page', 'session']) {
    const wait = deferred(), operations = []; let current = true, calls = 0;
    const mutation = createReservationMutation({ isSessionCurrent: () => current, onBusy: () => {}, onFailure: failure => { if (failure) assert.fail(failure); } });
    const action = options => saveProfile({ updateProfile: async () => { calls++; return wait.promise; } }, { user, draft, ...options, onOperation: value => operations.push(value) });
    const first = mutation.run(action), second = mutation.run(action);
    if (leave === 'page') mutation.dispose(); else current = false;
    wait.resolve({ ...user, ...profileInput(draft) }); await Promise.all([first, second]);
    assert.equal(calls, 1); assert.deepEqual(operations.map(value => value.status), ['UNKNOWN']); mutation.dispose();
  }
});
