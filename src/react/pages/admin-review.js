// Keep review navigation inside the admin workspace and outside gallery resets.
export function adminRoute(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  return `${path}${query.size ? `?${query}` : ''}`;
}

export function safeAdminReturn(value, fallback) {
  if (typeof value !== 'string' || !value.startsWith('/admin/')) return fallback;
  try {
    const url = new URL(value, 'https://admin.local');
    if (url.origin !== 'https://admin.local' || !/^\/admin\/(dashboard|approvals|sellers(?:\/[^/]+)?|fabrics(?:\/[^/]+)?)$/.test(url.pathname)) return fallback;
    const params = {};
    for (const key of ['status', 'id', 'result', 'listStatus', 'from']) {
      if (url.searchParams.has(key)) params[key] = url.searchParams.get(key);
    }
    return adminRoute(url.pathname, params);
  } catch { return fallback; }
}

export function reviewPath(kind, id, action, returnTo) {
  const fallback = `/admin/${kind}/${encodeURIComponent(id)}`;
  const target = safeAdminReturn(returnTo, fallback);
  const fromApproval = target.startsWith('/admin/approvals') || new URL(target, 'https://admin.local').searchParams.get('from') === 'approvals';
  return adminRoute(fallback, { action, from: fromApproval ? 'approvals' : undefined, returnTo: target });
}

export function canReviewSeller(status, next) {
  return (next === 'APPROVED' && ['PENDING', 'REJECTED'].includes(status)) || (next === 'REJECTED' && status === 'PENDING');
}

export async function confirmSellerReview(api, seller, next) {
  if (!canReviewSeller(seller.seller_approval_status, next)) throw new Error('판매자의 현재 승인 상태를 다시 확인해 주세요.');
  return api.reviewSeller(seller.id, next);
}

export function fabricPhotos(fabric) {
  const labels = { FULL: '전체 사진', ZOOM: '확대 사진', DEFECT: '하자 사진' };
  const photos = [];
  const candidates = [...(Array.isArray(fabric.images) ? fabric.images : []), ...(Array.isArray(fabric.photos) ? fabric.photos : []), ...(fabric.image_url ? [{ image_url: fabric.image_url }] : [])];
  for (const entry of candidates) {
    const url = typeof entry === 'string' ? entry : entry?.image_url;
    // Filenames alone and synthetic texture examples are not uploaded photos.
    if (typeof url !== 'string' || !/^(https?:\/\/|blob:|\/(?!\/))/.test(url) || photos.some(photo => photo.url === url)) continue;
    photos.push({ url, label: labels[entry?.image_type] || `사진 ${photos.length + 1}` });
  }
  return photos;
}
