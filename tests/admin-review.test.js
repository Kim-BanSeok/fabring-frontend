import test from 'node:test';
import assert from 'node:assert/strict';
import { adminRoute, canReviewSeller, confirmSellerReview, fabricPhotos, reviewPath, safeAdminReturn } from '../src/react/pages/admin-review.js';
import { createMockApi } from '../src/prototype/services/mock-api.js';

test('review confirmation returns to the same selected approval queue', () => {
  const origin = adminRoute('/admin/approvals', { status: 'PENDING', id: 'fabric-2' });
  for (const action of ['approve', 'reject']) {
    const route = new URL(reviewPath('fabrics', 'fabric-2', action, origin), 'https://example.test');
    assert.equal(route.pathname, '/admin/fabrics/fabric-2');
    assert.equal(route.searchParams.get('from'), 'approvals');
    assert.equal(route.searchParams.get('returnTo'), origin);
    assert.equal(route.searchParams.get('action'), action);
  }
});

test('direct product detail retains its original list status when cancelling', () => {
  const origin = '/admin/fabrics/fabric-2?listStatus=PENDING';
  const route = new URL(reviewPath('fabrics', 'fabric-2', 'reject', origin), 'https://example.test');
  assert.equal(route.searchParams.get('returnTo'), origin);
  assert.equal(route.searchParams.has('from'), false);
});

test('return destinations cannot leave admin or reset isolated scenarios', () => {
  const fallback = '/admin/approvals';
  for (const path of ['https://example.test', '//example.test/admin/approvals', '/buyer/fabrics/1', '/admin/../buyer/home', '/admin/fabrics/x/../../../buyer/home', 'javascript:alert(1)', '/admin/approvals/extra']) {
    assert.equal(safeAdminReturn(path, fallback), fallback);
  }
  assert.equal(safeAdminReturn('/admin/approvals?status=PENDING&id=a&scenario=123%3A1&mode=live&sample=POSTED', fallback), '/admin/approvals?status=PENDING&id=a');
});

test('admin preview return retains the result and admin menu context', () => {
  const result = adminRoute('/admin/fabrics/fabric-2', { result: 'POSTED', from: 'approvals' });
  const preview = new URL(adminRoute('/admin/fabrics/fabric-2', { preview: 1, from: 'approvals', returnTo: result }), 'https://example.test');
  assert.equal(safeAdminReturn(preview.searchParams.get('returnTo'), '/admin/approvals'), result);
  assert.equal(preview.pathname.startsWith('/admin/'), true);
});

test('seller review policy allows pending approve/reject and rejected approve only', () => {
  assert.equal(canReviewSeller('PENDING', 'APPROVED'), true);
  assert.equal(canReviewSeller('PENDING', 'REJECTED'), true);
  assert.equal(canReviewSeller('REJECTED', 'APPROVED'), true);
  for (const [status, next] of [['APPROVED', 'APPROVED'], ['APPROVED', 'REJECTED'], ['REJECTED', 'REJECTED'], ['PENDING', 'PENDING']]) assert.equal(canReviewSeller(status, next), false);
});

test('building confirmation and cancellation routes never changes a seller; explicit confirm does', async () => {
  const memory = new Map();
  const api = createMockApi({ getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) });
  await api.setRole('ADMIN');
  const seller = api.getState().sellers.find(item => item.seller_approval_status === 'PENDING');
  assert.ok(seller);
  const route = new URL(reviewPath('sellers', seller.id, 'approve', '/admin/sellers/' + seller.id + '?listStatus=PENDING'), 'https://example.test');
  safeAdminReturn(route.searchParams.get('returnTo'), '/admin/sellers');
  assert.equal(api.getState().sellers.find(item => item.id === seller.id).seller_approval_status, 'PENDING');
  await confirmSellerReview(api, seller, 'APPROVED');
  assert.equal(api.getState().sellers.find(item => item.id === seller.id).seller_approval_status, 'APPROVED');
  await assert.rejects(() => confirmSellerReview(api, api.getState().sellers.find(item => item.id === seller.id), 'REJECTED'));
});

test('invalid seller transitions never call the adapter and service failures propagate', async () => {
  let calls = 0;
  const api = { reviewSeller: async () => { calls++; throw new Error('연결되지 않은 기능입니다.'); } };
  await assert.rejects(() => confirmSellerReview(api, { id: 4, seller_approval_status: 'APPROVED' }, 'REJECTED'));
  assert.equal(calls, 0);
  await assert.rejects(() => confirmSellerReview(api, { id: 4, seller_approval_status: 'PENDING' }, 'APPROVED'), /연결되지 않은 기능/);
  assert.equal(calls, 1);
});

test('gallery uses only available URLs, retains image labels, and deduplicates a cover', () => {
  assert.deepEqual(fabricPhotos({ photos: ['demo-texture.png', 'my-upload.jpg'], image_url: null }), []);
  const photos = fabricPhotos({ images: [{ image_url: '/uploads/full.jpg', image_type: 'FULL' }, { image_url: 'https://example.test/defect.jpg', image_type: 'DEFECT' }], photos: ['blob:local-preview', 'javascript:alert(1)', '//unsafe.test/photo'], image_url: '/uploads/full.jpg' });
  assert.deepEqual(photos, [{ url: '/uploads/full.jpg', label: '전체 사진' }, { url: 'https://example.test/defect.jpg', label: '하자 사진' }, { url: 'blob:local-preview', label: '사진 3' }]);
});
