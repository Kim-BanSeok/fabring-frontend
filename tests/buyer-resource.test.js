import test from 'node:test';
import assert from 'node:assert/strict';
import { startFabricRequest } from '../src/react/hooks/useFabricResource.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
const pending = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('StrictMode setup → cleanup before request startup produces no duplicate HTTP', async () => {
  const calls = [], success = [], errors = [];
  const api = { listFabrics: async (...args) => { calls.push(args); return { content: [] }; } };
  const request = { kind: 'list', query: { sale_type: 'SCRAP', page: 0 } };
  startFabricRequest(api, request, value => success.push(value), error => errors.push(error))();
  const stop = startFabricRequest(api, request, value => success.push(value), error => errors.push(error));
  await settle();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], request.query);
  assert.equal(calls[0][1].signal.aborted, false);
  assert.equal(success.length, 1);
  assert.equal(errors.length, 0);
  stop();
});

test('leaving a detail aborts its signal and ignores a late response from an adapter without cancellation', async () => {
  const old = pending(), current = pending(), values = [], failures = [], calls = [];
  const api = { getFabric: (id, { signal }) => { calls.push({ id, signal }); return id === '1' ? old.promise : current.promise; } };
  const first = startFabricRequest(api, { kind: 'detail', id: '1' }, value => values.push(value), error => failures.push(error));
  await settle();
  first();
  const second = startFabricRequest(api, { kind: 'detail', id: '2' }, value => values.push(value), error => failures.push(error));
  await settle();
  current.resolve({ id: '2' });
  old.resolve({ id: '1' });
  await settle();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls[1].signal.aborted, false);
  assert.deepEqual(values, [{ id: '2' }]);
  assert.deepEqual(failures, []);
  second();
});

test('cleanup ignores late failures while an active request reports its distinct error once', async () => {
  const deferred = pending(), failures = [];
  const api = { getFabric: () => deferred.promise };
  const stop = startFabricRequest(api, { kind: 'detail', id: '1' }, () => assert.fail('No success expected'), error => failures.push(error));
  await settle(); stop(); deferred.reject(new Error('late offline'));
  await settle();
  assert.deepEqual(failures, []);
  const missing = Object.assign(new Error('not found'), { status: 404 });
  const stopMissing = startFabricRequest({ getFabric: () => Promise.reject(missing) }, { kind: 'detail', id: '2' }, () => assert.fail('No success expected'), error => failures.push(error));
  await settle();
  assert.deepEqual(failures, [missing]);
  stopMissing();
});

test('synchronous query validation errors are surfaced without leaking an unhandled rejection', async () => {
  const invalid = Object.assign(new Error('bad query'), { status: 400 }), failures = [];
  const stop = startFabricRequest({ listFabrics: () => { throw invalid; } }, { kind: 'list', query: { page: -1 } }, () => assert.fail('No success expected'), error => failures.push(error));
  await settle();
  assert.deepEqual(failures, [invalid]);
  stop();
});
