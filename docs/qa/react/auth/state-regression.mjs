import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { getAuthState } from '../../../../src/react/pages/auth-state.js';

const state = { buyer: { email: 'loop@example.com', nickname: '김루프' } };
const report = { checks: [] };
function createFixture() {
  const drafts = new Map();
  const store = getAuthState(drafts);
  let calls = 0;
  const api = { loginDemo: async () => { calls += 1; return { first_login: false }; } };
  const input = { role: 'BUYER', email: 'loop@example.com', password: 'Transient123!' };
  return { drafts, store, input, api, calls: () => calls };
}

{
  const f = createFixture();
  f.store.updateForm(state, 'buyer', 'login', 'password', f.input.password);
  const operation = f.store.startRequest({ api: f.api, role: 'buyer', kind: 'login', input: f.input });
  let success = 0;
  const finish = result => { success += 1; f.store.finishSuccess(state, 'buyer', operation, result); };
  // React StrictMode's effect setup -> cleanup -> setup must retain one operation.
  const firstCleanup = f.store.subscribe(operation, finish, assert.fail);
  firstCleanup();
  const secondCleanup = f.store.subscribe(operation, finish, assert.fail);
  await operation.promise;
  assert.equal(f.calls(), 1);
  assert.equal(success, 1);
  assert.equal(f.store.pending('buyer'), null);
  assert.equal(f.store.initialForm(state, 'buyer', 'login').password, '');
  assert.equal(f.input.password, '');
  secondCleanup();
  report.checks.push('StrictMode reattachment: API and completion each once; successful passwords cleared');
}
{
  const f = createFixture();
  const operation = f.store.startRequest({ api: f.api, role: 'buyer', kind: 'login', input: f.input });
  f.store.subscribe(operation, assert.fail, assert.fail)();
  await operation.promise.catch(() => {});
  assert.equal(f.calls(), 0);
  assert.equal(f.store.pending('buyer'), null);
  report.checks.push('Leaving processing before completion cancels request and prevents late navigation');
}
{
  const f = createFixture();
  const operation = f.store.startRequest({ api: f.api, role: 'buyer', kind: 'login', input: f.input });
  const cleanup = f.store.subscribe(operation, assert.fail, assert.fail);
  f.drafts.clear();
  await operation.promise.catch(() => {});
  assert.equal(f.calls(), 0);
  cleanup();
  report.checks.push('Logout/reset draft clear invalidates outstanding operation');
}
{
  const first = createFixture(), second = createFixture();
  first.store.updateForm(state, 'buyer', 'login', 'email', 'isolated@example.com');
  first.store.recordFailure('buyer', 'login', { message: 'Isolated error' });
  assert.equal(second.store.initialForm(state, 'buyer', 'login').email, 'loop@example.com');
  assert.equal(second.store.failure('buyer', 'login'), undefined);
  assert.notEqual(first.store, second.store);
  report.checks.push('Separate service/scenario draft Maps cannot share inputs or error records');
}
report.passed = true;
await writeFile(new URL('./state-regression.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
