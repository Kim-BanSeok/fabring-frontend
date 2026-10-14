import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Notice, PageHeading } from '../components/ui.jsx';
import { formatPrice } from '../lib/format.js';

const date = value => String(value).slice(0, 10).replaceAll('-', '.');
const queryOf = ctx => ({
  target_type: 'PATTERN',
  page: /^\d+$/.test(ctx.query.get('page') || '') ? ctx.query.get('page') : '0',
  size: '20',
});
const listPath = (target, page = 0) => `/buyer/favorites?target_type=${target}&page=${page}`;

async function findSaved(api, targetType, targetId, signal) {
  const id = String(Number(targetId));
  for (let page = 0; ; page += 1) {
    const result = await api.listFavorites({ target_type: targetType, page, size: 50 }, { signal });
    const match = result.items.find(item => item.target_id === id);
    if (match || page + 1 >= result.totalPages) return match || null;
  }
}

export function FavoriteButton({ api, targetType, targetId, noun }) {
  const [state, setState] = useState({ loading: true, saved: null, busy: false, error: '' });
  const reload = useCallback(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setState(current => ({ ...current, loading: true, error: '' }));
      findSaved(api, targetType, targetId, controller.signal).then(
        saved => { if (!controller.signal.aborted) setState({ loading: false, saved, busy: false, error: '' }); },
        error => {
          if (controller.signal.aborted) return;
          setState({ loading: false, saved: null, busy: false, error: error.message || '관심 상태를 확인하지 못했어요.' });
        },
      );
    });
    return () => controller.abort();
  }, [api, targetType, targetId]);
  useEffect(() => reload(), [reload]);
  async function toggle() {
    if (state.busy || state.loading) return;
    setState(current => ({ ...current, busy: true, error: '' }));
    try {
      if (state.saved) {
        await api.deleteFavorite(state.saved.id);
        setState({ loading: false, saved: null, busy: false, error: '' });
      } else {
        const created = await api.createFavorite(targetType, targetId);
        setState({ loading: false, saved: { id: created.id, target_id: String(Number(targetId)) }, busy: false, error: '' });
      }
    } catch (error) {
      if (error.code === 'FAVORITE_DUPLICATED') {
        setState(current => ({ ...current, busy: false, loading: true, error: '' }));
        reload();
        return;
      }
      setState(current => ({ ...current, busy: false, error: error.message || '관심 목록을 바꾸지 못했어요.' }));
    }
  }
  return <div className="stack">
    {state.error && <Notice tone={state.error.includes('확인하지 못했어요') ? 'warning' : 'error'}>{state.error}</Notice>}
    <Button type="button" tone={state.saved ? 'secondary' : 'primary'} disabled={state.loading || state.busy} onClick={toggle} data-favorite={targetType} data-id={targetId}>
      {state.loading ? '관심 상태 확인 중…' : state.busy ? '처리 중…' : state.saved ? `${noun} 관심 해제` : `${noun} 관심 저장`}
    </Button>
  </div>;
}

function itemStatus(item) {
  if (item.target_type === 'PATTERN') return item.is_active ? '사용 중인 도안' : '지금은 사용할 수 없는 도안';
  if (item.is_deleted) return '삭제된 원단';
  return { POSTED: '판매 중', SOLD_OUT: '판매 완료', PENDING: '게시 심사 중', REJECTED: '게시 거절' }[item.fabric_status] || '상태 확인 필요';
}
function itemHref(item) {
  if (item.target_type === 'PATTERN') return item.is_active ? `/buyer/patterns/${encodeURIComponent(item.target_id)}` : '';
  return item.fabric_status === 'POSTED' && !item.is_deleted ? `/buyer/fabrics/${encodeURIComponent(item.target_id)}` : '';
}

export function FavoriteList({ ctx }) {
  const query = queryOf(ctx);
  const key = JSON.stringify(query);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const request = JSON.parse(key);
    const controller = new AbortController();
    const identity = { key, attempt };
    ctx.api.listFavorites(request, { signal: controller.signal }).then(
      data => setResult({ ...identity, data, error: null }),
      error => { if (!controller.signal.aborted) setResult({ ...identity, data: null, error }); },
    );
    return () => controller.abort();
  }, [ctx.api, key, attempt]);
  const current = result?.key === key && result?.attempt === attempt;
  const page = current ? result.data : null;
  const target = query.target_type;
  return <section className="buyer-page stack">
    <PageHeading title="관심 도안" description="저장한 도안입니다. 도안 사용이 멈춰도 목록에는 남아요." />
    {!current && <Notice role="status">관심 목록을 확인하고 있어요.</Notice>}
    {current && result.error && <><Notice tone="error">{result.error.message || '관심 목록을 불러오지 못했어요.'}</Notice><Button onClick={() => setAttempt(value => value + 1)} tone="primary">다시 조회</Button></>}
    {page && <>
      <p className="buyer-result-count">저장한 도안 {page.totalElements}건</p>
      {page.items.length ? page.items.map(item => {
        const href = itemHref(item);
        return <article className="panel stack" key={item.id}>
          <h2>{item.title}</h2>
          <p className="buyer-muted">{itemStatus(item)} · {date(item.created_at)}{item.price != null ? ` · ${formatPrice(item.price)}` : ''}</p>
          <div className="actions">{href && <Button href={href} tone="primary">{item.target_type === 'PATTERN' ? '도안 보기' : '원단 보기'}</Button>}<Button onClick={() => ctx.api.deleteFavorite(item.id).then(() => setAttempt(value => value + 1), () => setAttempt(value => value + 1))}>관심 해제</Button></div>
        </article>;
      }) : <EmptyState title={page.page > 0 ? '이 페이지에 저장된 도안이 없어요.' : '아직 저장한 도안이 없어요.'} description="도안 상세에서 관심 저장을 누를 수 있어요." />}
      <nav className="actions" aria-label="관심 목록 페이지">
        <Button href={listPath(target, Math.max(0, page.page - 1))} disabled={page.page <= 0}>이전 페이지</Button>
        <span className="muted">{page.totalPages ? page.page + 1 : 0} / {page.totalPages}페이지</span>
        <Button href={listPath(target, page.page + 1)} disabled={page.page + 1 >= page.totalPages}>다음 페이지</Button>
      </nav>
    </>}
  </section>;
}
