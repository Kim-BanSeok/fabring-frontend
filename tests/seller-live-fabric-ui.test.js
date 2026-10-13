import test from 'node:test';
import assert from 'node:assert/strict';
import { createReservationMutation } from '../src/react/hooks/useReservationMutation.js';
import {
  emptyLiveFabricDraft, validateLiveFabricDraft, validateLivePhoto, liveFabricListPath,
  liveFabricPath, liveFabricListQuery, liveFabricFailure, uploadLiveFabricPhotos,
} from '../src/react/pages/seller/sellerLiveFabricModel.js';

const context = route => { const [path, query] = route.split('?'); return { path, query: new URLSearchParams(query) }; };
const file = name => new File(['test'], name, { type: 'image/png' });
const job = () => ({ fabric_id: '123', stage: 'PARTIAL', photos: ['FULL', 'ZOOM', 'DEFECT'].map(slot => ({ slot, file: file(`${slot}.png`), status: 'PENDING' })) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const draft = type => ({ ...emptyLiveFabricDraft(type), title: '직접 작성한 원단', width_cm: 140, length_cm: type === 'ROLL' ? 901 : 80, remaining_length_cm: type === 'ROLL' ? 901 : null, price: 5000, thickness: '얇음', color: '흰색', photos: [{ slot: 'FULL', file: file('원단.png') }] });

test('new live drafts do not silently publish demo fabric names, dimensions, prices, or filenames', () => {
  for (const type of ['ROLL', 'SCRAP']) {
    const value = emptyLiveFabricDraft(type);
    assert.equal(value.title, ''); assert.equal(value.price, ''); assert.equal(value.width_cm, '');
    assert.deepEqual(value.photos, []); assert.equal(value.sale_type, type);
  }
});

test('fabric validation accepts non-yard-multiple roll stock but enforces scrap boundaries and file selection', () => {
  assert.equal(validateLiveFabricDraft(draft('ROLL'), true), '');
  assert.equal(validateLiveFabricDraft(draft('SCRAP'), true), '');
  assert.match(validateLiveFabricDraft({ ...draft('ROLL'), remaining_length_cm: 89 }), /90cm/);
  for (const length_cm of [1, 29, 91, 150]) assert.equal(validateLiveFabricDraft({ ...draft('SCRAP'), length_cm }), '');
  assert.match(validateLiveFabricDraft({ ...draft('SCRAP'), length_cm: 0 }), /1cm 이상/);
  assert.match(validateLiveFabricDraft({ ...draft('ROLL'), price: 2147483648 }), /2,147,483,647/);
  assert.match(validateLiveFabricDraft({ ...draft('ROLL'), photos: [] }, true), /사진/);
  assert.equal(validateLiveFabricDraft({ ...draft('ROLL'), photos: [] }), '', 'editing does not invent a server photo minimum');
  assert.match(validateLiveFabricDraft({ ...draft('ROLL'), has_defect: true, defect_note: '  ' }), /하자/);
});

test('photo preflight checks supported type, filename and byte boundary without pretending to inspect image contents', () => {
  assert.equal(validateLivePhoto(file('원단.PNG')), '');
  assert.equal(validateLivePhoto({ type: 'image/png', name: 'large.png', size: 5 * 1024 * 1024 }), '');
  for (const input of [{ type: 'image/gif', name: 'a.gif', size: 2 }, { type: 'image/png', name: 'a.exe', size: 2 }, { type: 'image/png', name: 'a.png', size: 0 }, { type: 'image/png', name: 'a.png', size: 5 * 1024 * 1024 + 1 }]) assert.ok(validateLivePhoto(input));
});

test('list → detail → edit/photo/delete → list retains status and pagination with no foreign return URLs', () => {
  const list = context('/seller/fabrics?status=REJECTED&page=2&size=5&mode=live&id=120');
  const detail = context(liveFabricPath(list, '120'));
  assert.equal(detail.path, '/seller/fabrics/detail');
  for (const action of ['edit', 'photos', 'delete']) {
    const destination = context(liveFabricPath(detail, '120', action));
    assert.equal(liveFabricListPath(destination), '/seller/fabrics?status=REJECTED&page=2&size=5&mode=live');
    const backToDetail = context(liveFabricPath(destination, '120'));
    assert.equal(liveFabricListPath(backToDetail), '/seller/fabrics?status=REJECTED&page=2&size=5&mode=live');
  }
  assert.equal(liveFabricListPath(list, { status: 'POSTED', page: 0 }), '/seller/fabrics?status=POSTED&page=0&size=5&mode=live');
  for (const value of ['https://example.com', '//example.com', '/buyer/fabrics', '/seller/fabrics/edit', '/seller/fabrics#other']) {
    const ctx = context('/seller/fabrics/detail?id=1'); ctx.query.set('return', value);
    assert.equal(liveFabricListPath(ctx), '/seller/fabrics');
  }
});

test('seller listing forwards only server-supported status/page/size without client-side count assumptions', () => {
  assert.deepEqual(liveFabricListQuery(new URLSearchParams('status=ALL&page=2&size=5&id=1&keyword=ignored')), { page: '2', size: '5' });
  assert.deepEqual(liveFabricListQuery(new URLSearchParams('status=PENDING')), { status: 'PENDING' });
});

test('known failed photos alone retry while successful IDs stay recorded and the fabric is never recreated', async () => {
  const calls = [], snapshots = []; let failZoom = true;
  const api = { uploadFabricImage: async (id, input, slot) => {
    calls.push([id, input.name, slot]); if (slot === 'ZOOM' && failZoom) throw new Error('손상된 파일');
    return { id: `${slot}-saved`, image_url: `https://example.com/${slot}.png` };
  }, createFabric: () => assert.fail('Recovery must not recreate fabric') };
  let result = await uploadLiveFabricPhotos(api, job(), { onChange: value => snapshots.push(value) });
  assert.deepEqual(result.photos.map(photo => photo.status), ['DONE', 'FAILED', 'DONE']);
  assert.equal(result.stage, 'PARTIAL'); assert.equal(result.photos[0].imageId, 'FULL-saved');
  assert.equal(snapshots[0].photos[0].status, 'UNKNOWN', 'uncertainty is persisted before sending');
  failZoom = false; result = await uploadLiveFabricPhotos(api, result, { onChange: () => {} });
  assert.deepEqual(calls.map(call => call[2]), ['FULL', 'ZOOM', 'DEFECT', 'ZOOM']);
  assert.equal(result.stage, 'DONE'); assert.equal(result.photos[2].imageId, 'DEFECT-saved');
});

test('unknown photo upload stops the batch and is not automatically retried', async () => {
  const calls = [], api = { uploadFabricImage: async (_id, _file, slot) => { calls.push(slot); throw Object.assign(new Error('시간 초과'), { outcomeUnknown: true }); } };
  const result = await uploadLiveFabricPhotos(api, job(), { onChange: () => {} });
  assert.deepEqual(calls, ['FULL']); assert.deepEqual(result.photos.map(photo => photo.status), ['UNKNOWN', 'PENDING', 'PENDING']);
  assert.equal(result.stage, 'PARTIAL');
  const resumed = await uploadLiveFabricPhotos(api, result, { onChange: () => assert.fail('An uncertain batch may not resume before review') });
  assert.equal(resumed, result); assert.deepEqual(calls, ['FULL']);
  assert.equal(liveFabricFailure({ outcomeUnknown: true }).locked, true);
});

test('leaving while a photo is in flight preserves uncertainty and ignores late acknowledgements', async () => {
  const wait = deferred(), snapshots = []; let current = true, calls = 0;
  const api = { uploadFabricImage: async () => { calls++; return wait.promise; } };
  const promise = uploadLiveFabricPhotos(api, job(), { isCurrent: () => current, onChange: value => snapshots.push(value) });
  assert.equal(snapshots.at(-1).photos[0].status, 'UNKNOWN');
  current = false; wait.resolve({ id: 'new-image' }); await promise;
  assert.equal(calls, 1); assert.equal(snapshots.at(-1).photos[0].status, 'UNKNOWN');
});

test('double confirmation runs only one upload batch and account change blocks continuation', async () => {
  const wait = deferred(), snapshots = []; let sameSession = true, calls = 0;
  const operation = createReservationMutation({ isSessionCurrent: () => sameSession, onBusy: () => {}, onFailure: value => { if (value) assert.fail(value.message); } });
  const api = { uploadFabricImage: async () => { calls++; return wait.promise; } };
  const action = options => uploadLiveFabricPhotos(api, job(), { ...options, onChange: value => snapshots.push(value) });
  const first = operation.run(action), second = operation.run(action);
  assert.equal(calls, 1); sameSession = false; wait.resolve({ id: 'new-image' }); await Promise.all([first, second]);
  assert.equal(calls, 1); assert.equal(snapshots.length, 1); operation.dispose();
});

test('a user-confirmed saved or deliberately skipped photo is never resent during remaining-file recovery', async () => {
  const initial = job(), calls = [];
  initial.photos[0].status = 'DONE'; initial.photos[1].status = 'SKIPPED';
  const result = await uploadLiveFabricPhotos({ uploadFabricImage: async (_id, _file, slot) => { calls.push(slot); return { id: 'saved' }; } }, initial, { onChange: () => {} });
  assert.deepEqual(calls, ['DEFECT']); assert.equal(result.stage, 'DONE');
});
