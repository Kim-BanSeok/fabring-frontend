import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi } from '../src/react/services/live-api.js';
import { createHttpClient } from '../src/react/services/http-client.js';
import { aiSessionIdentifier, aiAnswerInput, aiSession, aiAborted } from '../src/react/services/ai-contract.js';

const id = '0123456789abcdef01234567';
const otherId = '1123456789abcdef01234567';
const response = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status });
const session = (patch = {}) => ({ sessionId: id, session_status: 'IN_PROGRESS', ai_draft: {}, unconfirmed_fields: [],
  next_question: { field: 'sale_type', text: '판매 형태를 알려 주세요.', options: ['SCRAP', 'ROLL'] }, is_complete: false, ...patch });
const detail = (patch = {}) => session({ messages: [{ role: 'assistant', content: '판매 형태를 알려 주세요.', created_at: '2026-10-12T12:00:00+09:00' }], fabric_id: null, ...patch });
const fabric = { title: '테스트 면 원단', sale_type: 'ROLL', price: 3000, remaining_length_cm: 270, width_cm: 150,
  length_cm: null, material: '면', thickness: '중간 두께', color: '네이비', has_defect: false, photos: [] };
const profile = role => ({ userId: 12, role, hasStore: false, email: 'local@example.test', nickname: '검증계정', seller_approval_status: 'APPROVED' });
async function authenticated(fetchBusiness, { role = 'SELLER', ...options } = {}) {
  const calls = [];
  const user = profile(role);
  const api = createLiveApi({ storage: null, ...options, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/login')) return response({ accessToken: 'placeholder-test-token', expiresIn: 3600, user });
    if (url.endsWith('/users/me')) return response(user);
    return fetchBusiness(url, init);
  } });
  api.commitLogin(await api.login({ email: user.email, password: 'placeholder' }));
  return { api, calls };
}

test('session identifier is an exact lowercase24hex value; no path/query injection', () => {
  assert.equal(aiSessionIdentifier(id), id);
  for (const value of [null, 123, 'ABCDEF0123456789ABCDEF01', 'short', `${id}?mode=demo`, `${id}/../users`]) {
    assert.throws(() => aiSessionIdentifier(value), error => error.code === 'VALIDATION_ERROR');
  }
});

test('answer input trims documented values and cannot silently prioritize selected over free text', () => {
  assert.deepEqual(aiAnswerInput({ answer: '  폭 150, 3마  ', ignored: 'x' }), { answer: '폭 150, 3마' });
  assert.deepEqual(aiAnswerInput({ selected: 'ROLL' }), { selected: 'ROLL' });
  assert.deepEqual(aiAnswerInput({ finish: true }), { finish: true });
  assert.deepEqual(aiAnswerInput({ answer: '모름', finish: true }), { answer: '모름', finish: true });
  for (const input of [null, {}, { finish: false }, { answer: '' }, { answer: 'x'.repeat(1001) }, { selected: 'x'.repeat(51) }, { selected: 'ROLL', answer: '자투리' }, { finish: 'true' }]) {
    assert.throws(() => aiAnswerInput(input), error => error.code === 'VALIDATION_ERROR');
  }
});

test('a one-line fabric description is a question without option buttons', () => {
  const text = '어떤 원단인지 편하게 적어 주세요.';
  const actual = aiSession(session({ next_question: { field: 'listing', text } }), { open: true });
  assert.deepEqual(actual.next_question, { field: 'listing', text });
  assert.equal(actual.is_complete, false);
});

test('partial draft preserves missing fields and unknown material even when conversation is complete', () => {
  const raw = session({ ai_draft: { sale_type: 'SCRAP', width_cm: 50, length_cm: 110, material: 'UNKNOWN', description: '원단의 가치' },
    unconfirmed_fields: ['material', 'thickness', 'has_defect'], next_question: null, is_complete: true });
  const actual = aiSession(raw);
  assert.equal(actual.ai_draft.length_cm, 110); // The conversational draft can still offer conversion to ROLL.
  assert.equal(actual.ai_draft.material, 'UNKNOWN');
  assert.equal(actual.ai_draft.thickness, undefined);
  assert.equal(actual.ai_draft.has_defect, undefined);
  assert.equal(actual.ai_draft.description, '원단의 가치');
  assert.equal(actual.is_complete, true); // Not a claim that createFabric validation passed.
});

test('detail keeps history and confirmed fabric id; closed states cannot masquerade as editable', () => {
  const actual = aiSession(detail({ session_status: 'CONFIRMED', next_question: null, is_complete: true, fabric_id: 7 }), { detail: true, id });
  assert.equal(actual.fabric_id, '7');
  assert.equal(actual.messages[0].role, 'assistant');
  assert.equal(aiAborted({ sessionId: id, session_status: 'ABORTED', ai_draft: { material: 'UNKNOWN' }, unconfirmed_fields: ['material'] }, id).ai_draft.material, 'UNKNOWN');
  assert.throws(() => aiSession(detail({ session_status: 'CONFIRMED', next_question: null, is_complete: true, fabric_id: null }), { detail: true }), error => error.code === 'INVALID_RESPONSE');
});

test('malformed drafts/questions/history and wrong session IDs fail without filling fake data', () => {
  for (const raw of [null, {}, session({ sessionId: otherId }), session({ ai_draft: { thickness: 'UNKNOWN' } }),
    session({ ai_draft: { has_defect: 'false' } }), session({ ai_draft: { width_cm: 0 } }), session({ unconfirmed_fields: ['arbitrary'] }),
    session({ is_complete: true }), session({ next_question: { field: 'material', text: '소재', options: ['imaginary'] } }),
    session({ session_status: 'ABORTED' })]) {
    assert.throws(() => aiSession(raw, { id }), error => error.code === 'INVALID_RESPONSE');
  }
  assert.throws(() => aiSession(detail({ messages: [{ role: 'system', content: 'unsafe', created_at: 'invalid' }] }), { detail: true }), error => error.code === 'INVALID_RESPONSE');
});

test('start/get/answer/finish/abort use real endpoint contract and existing bearer', async () => {
  const { api, calls } = await authenticated((url) => response(url.endsWith('/abort')
    ? { sessionId: id, session_status: 'ABORTED', ai_draft: {}, unconfirmed_fields: [] }
    : url.endsWith(`/${id}`) ? detail() : session(), url.endsWith('/ai-sessions') ? 201 : 200));
  await api.startAiSession();
  assert.equal(calls.at(-1).init.body, undefined);
  assert.equal(calls.at(-1).init.method, 'POST');
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer placeholder-test-token');
  assert.equal((await api.getAiSession(id)).fabric_id, null);
  await api.answerAiSession(id, { selected: 'ROLL' });
  assert.equal(calls.at(-1).url, `/api/v1/ai-sessions/${id}/answers`);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { selected: 'ROLL' });
  await api.answerAiSession(id, { finish: true });
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { finish: true });
  await api.abortAiSession(id);
  assert.equal(calls.at(-1).init.body, undefined);
  await api.logout();
});

test('confirm uses AI confirm only, maps final draft to creation contract and retains photos for separate upload', async () => {
  const { api, calls } = await authenticated(() => response({ fabricId: 25, status: 'PENDING' }, 201));
  assert.deepEqual(await api.confirmAiSession(id, { ...fabric, ignored: 'x', ai_request: 'x' }), { id: '25', status: 'PENDING' });
  assert.equal(calls.at(-1).url, `/api/v1/ai-sessions/${id}/confirm`);
  const body = JSON.parse(calls.at(-1).init.body);
  assert.equal(body.detail.material, 'COTTON');
  assert.equal(body.detail.has_defect, false);
  assert.equal(body.detail.length_cm, null);
  assert.equal(body.remaining_length_cm, 270);
  assert.equal(body.photos, undefined);
  assert.equal(body.ai_request, undefined);
  const before = calls.length;
  await assert.rejects(api.confirmAiSession(id, { ...fabric, has_defect: undefined }), error => error.code === 'VALIDATION_ERROR');
  assert.equal(calls.length, before);
  await api.logout();
});

test('only sellers can call AI endpoints; forbidden roles never reach business HTTP', async () => {
  for (const role of ['BUYER', 'ADMIN']) {
    const { api, calls } = await authenticated(() => assert.fail('business call'), { role });
    const before = calls.length;
    for (const call of [() => api.startAiSession(), () => api.getAiSession(id), () => api.answerAiSession(id, { finish: true }), () => api.confirmAiSession(id, fabric), () => api.abortAiSession(id)]) {
      await assert.rejects(call(), error => error.code === 'FORBIDDEN');
    }
    assert.equal(calls.length, before); await api.logout();
  }
  const api = createLiveApi({ storage: null, fetchImpl: () => assert.fail('anonymous call') });
  await assert.rejects(api.startAiSession(), error => error.status === 401);
});

test('known AI503 preserves draft and differs from uncertain network/server/ACK outcomes; never auto-retries', async () => {
  let mode = 'unavailable', posts = 0;
  const { api } = await authenticated(() => {
    posts++;
    if (mode === 'network') throw new Error('offline');
    if (mode === 'ack') return response(session({ sessionId: otherId }));
    return response({ code: mode === 'unavailable' ? 'AI_UNAVAILABLE' : 'INTERNAL_ERROR', message: '응답 실패' }, mode === 'unavailable' ? 503 : 500);
  });
  await assert.rejects(api.answerAiSession(id, { answer: '50에 70' }), error => error.code === 'AI_UNAVAILABLE' && !error.outcomeUnknown);
  for (mode of ['network', 'server', 'ack']) {
    await assert.rejects(api.answerAiSession(id, { answer: '50에 70' }), error => error.outcomeUnknown === true);
  }
  assert.equal(posts, 4); await api.logout();
});

test('closed/missing/permission responses remain known and getSession recovers confirmed resource', async () => {
  let mode = 409;
  const { api } = await authenticated(() => mode === 200 ? response(detail({ session_status: 'CONFIRMED', is_complete: true, next_question: null, fabric_id: 23 }))
    : response({ code: mode === 409 ? 'AI_SESSION_CLOSED' : mode === 404 ? 'NOT_FOUND' : 'FORBIDDEN', message: '세션 확인' }, mode));
  for (mode of [409, 404, 403]) await assert.rejects(api.confirmAiSession(id, fabric), error => error.status === mode && !error.outcomeUnknown);
  mode = 200;
  assert.equal((await api.getAiSession(id)).fabric_id, '23');
  await api.logout();
});

test('AI answers can use longer request timeout while regular endpoint retains default', async () => {
  let call = 0;
  const client = createHttpClient({ timeoutMs: 2, fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
    call++;
    const timer = setTimeout(() => resolve(response('ok')), 15);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); });
  }) });
  assert.equal(await client('/answers', { timeoutMs: 100 }), 'ok');
  await assert.rejects(client('/regular'), error => error.code === 'TIMEOUT');
  assert.equal(call, 2);
});

test('AI timeout marks unknown once, without retrying a potentially accepted answer', async () => {
  let posts = 0;
  const { api } = await authenticated((_url, { signal }) => new Promise((resolve, reject) => {
    posts++;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }), { aiTimeoutMs: 3 });
  await assert.rejects(api.answerAiSession(id, { answer: '50에 70' }), error => error.code === 'TIMEOUT' && error.outcomeUnknown);
  assert.equal(posts, 1); await api.logout();
});

test('writes invalidate earlier session reads, and account/navigation changes discard late successes', async () => {
  let finish;
  const { api } = await authenticated((_url, { method }) => method === 'GET' ? new Promise(resolve => { finish = () => resolve(response(detail())); }) : response(session()));
  const read = api.getAiSession(id);
  await api.answerAiSession(id, { selected: 'ROLL' }); finish();
  await assert.rejects(read, error => error.name === 'AbortError');
  const another = api.getAiSession(id);
  await api.logout(); finish();
  await assert.rejects(another, error => error.name === 'AbortError');
});
