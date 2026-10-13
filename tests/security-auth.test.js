import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveApi, AUTH_STORAGE_KEY } from '../src/react/services/live-api.js';
const user = { userId: 1, role: 'BUYER', hasStore: false, nickname: 'test', email: 'test@example.invalid' };
const response = data => new Response(JSON.stringify({ success: true, data }));
const storage = () => { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };
test('oversized Unicode credentials are rejected before any HTTP request', async () => {
  let calls = 0; const api = createLiveApi({ storage: storage(), fetchImpl: async () => { calls++; } });
  await assert.rejects(api.login({ email: 'test@example.invalid', password: '가'.repeat(24) + 'A' }), { code: 'VALIDATION_ERROR' });
  await assert.rejects(api.signup({ role: 'BUYER', password: '😀'.repeat(18) + 'A' }), { code: 'VALIDATION_ERROR' });
  assert.equal(calls, 0);
});
test('logout calls the server with the copied token and reports confirmed revocation', async () => {
  const calls = [], state = storage();
  const api = createLiveApi({ storage: state, fetchImpl: async (url, options) => { calls.push({ url, options }); if (url.endsWith('/auth/login')) return response({ accessToken: 'test-token', expiresIn: 60, user }); if (url.endsWith('/users/me')) return response(user); return response(null); } });
  api.commitLogin(await api.login({ email: user.email, password: 'test-password' }));
  assert.deepEqual(await api.logout(), { serverRevoked: true });
  assert.equal(calls.at(-1).url, '/api/v1/auth/logout'); assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer test-token');
  assert.equal(state.getItem(AUTH_STORAGE_KEY), null);
});
test('offline logout clears local data while reporting that server revocation is unconfirmed', async () => {
  const state = storage(); const api = createLiveApi({ storage: state, fetchImpl: async url => { if (url.endsWith('/auth/login')) return response({ accessToken: 'test-token', expiresIn: 60, user }); if (url.endsWith('/users/me')) return response(user); throw new Error('offline'); } });
  api.commitLogin(await api.login({ email: user.email, password: 'test-password' }));
  assert.deepEqual(await api.logout(), { serverRevoked: false });
  assert.equal(state.getItem(AUTH_STORAGE_KEY), null);
});
