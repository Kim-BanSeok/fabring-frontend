import { addQuery, keepList, currentRoute, price } from './buyer-model.js';

export const isPatternRoute = path => path === '/buyer/patterns' || path.startsWith('/buyer/patterns/') || path.startsWith('/buyer/recommendations/');
export const recommendationPath = (ctx, fabricId) => keepList(ctx, `/buyer/recommendations/${encodeURIComponent(fabricId)}`);
export const patternListReturn = value => {
  if (!value || /[\\#\r\n]/.test(value) || value.split('?')[0] !== '/buyer/patterns') return '';
  const incoming = new URLSearchParams(value.split('?')[1] || ''), query = new URLSearchParams();
  for (const name of ['keyword', 'category', 'page', 'size', 'fabric_id']) if (incoming.has(name)) query.set(name, incoming.get(name));
  const fabricReturn = incoming.get('return');
  if (fabricReturn && !/[\\#\r\n]/.test(fabricReturn) && fabricReturn.split('?')[0] === '/buyer/fabrics') {
    const filters = new URLSearchParams(fabricReturn.split('?')[1] || ''), kept = new URLSearchParams();
    for (const name of ['sale_type', 'material', 'thickness', 'color', 'color_family', 'keyword', 'sort', 'page', 'size', 'view', 'collapsed']) if (filters.has(name)) kept.set(name, filters.get(name));
    query.set('return', `/buyer/fabrics${kept.size ? `?${kept}` : ''}`);
  }
  return `/buyer/patterns${query.size ? `?${query}` : ''}`;
};
export function patternDetailPath(ctx, id, fabricId) {
  let path = keepList(ctx, addQuery(`/buyer/patterns/${encodeURIComponent(id)}`, 'fabric_id', fabricId));
  return addQuery(path, 'patterns_return', patternListReturn(ctx.path === '/buyer/patterns' ? currentRoute(ctx) : ctx.query.get('patterns_return')));
}
export const patternPickupPath = (ctx, fabricId, patternId) => addQuery(keepList(ctx, `/buyer/pickup/${encodeURIComponent(fabricId)}?pattern_id=${encodeURIComponent(patternId)}`), 'patterns_return', patternListReturn(ctx.query.get('patterns_return')));
export function selectedRecommendation(result, patternId) {
  const canonical = /^\d+$/.test(String(patternId)) && Number.isSafeInteger(Number(patternId)) && Number(patternId) > 0 ? String(Number(patternId)) : '';
  return result?.available ? result.items.find(item => item.pattern_id === canonical) || null : null;
}
export function recommendationPurchase(item, fabric) {
  return fabric.sale_type === 'ROLL' ? `${item.yards}마(${item.purchase_length_cm}cm) · ${price(item.estimated_price)}` : `자투리 한 장 전체 · ${price(fabric.price)}`;
}
export function recommendedPickupIssue(result, patternId, fabric, requestedMa, freshFabric = fabric) {
  const item = selectedRecommendation(result, patternId);
  if (!item || item.judgement !== 'SUITABLE') return '선택한 도안의 제작 조건이 바뀌었어요. 추천 결과를 다시 확인해 주세요.';
  if (freshFabric.price !== fabric.price || freshFabric.sale_type !== fabric.sale_type) return '원단 가격 또는 판매 방식이 변경되었어요. 추천 결과에서 현재 정보를 확인한 뒤 다시 요청해 주세요.';
  if (fabric.sale_type === 'ROLL' && item.estimated_price !== fabric.price * item.yards) return '원단 가격이 변경되었어요. 추천 결과에서 현재 금액을 확인한 뒤 다시 요청해 주세요.';
  if (fabric.sale_type === 'ROLL' && (!Number.isSafeInteger(requestedMa) || requestedMa < item.yards)) return `현재 이 도안에는 ${item.yards}마(${item.purchase_length_cm}cm) 이상 필요해요. 수량을 확인해 주세요.`;
  return '';
}
export const patternListPagePath = (ctx, page) => addQuery(currentRoute(ctx), 'page', String(page));
