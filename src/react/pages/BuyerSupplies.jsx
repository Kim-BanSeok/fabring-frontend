import { useCallback, useEffect, useState } from 'react';
import { Button, EmptyState, Notice, PageHeading } from '../components/ui.jsx';

const CATEGORIES = [
  ['', '전체'],
  ['TEXTILE', '섬유·원단'],
  ['APPAREL', '의류·봉제'],
  ['LEATHER', '피혁'],
  ['FOOD', '식품'],
  ['CHEMICAL', '화학'],
  ['PLASTIC', '플라스틱'],
  ['METAL', '금속·기계'],
  ['WOOD', '목재·가구'],
  ['PAPER', '종이·인쇄'],
  ['ELECTRIC', '전기·전자'],
  ['CONSTRUCTION', '건설자재'],
  ['OTHER', '기타'],
];

const pathFor = (category, page = 0) => {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (page) params.set('page', String(page));
  const search = params.toString();
  return `/buyer/supplies${search ? `?${search}` : ''}`;
};

export default function BuyerSupplies({ ctx }) {
  const category = CATEGORIES.some(([code]) => code === ctx.query.get('category')) ? ctx.query.get('category') : '';
  const page = Math.max(0, Number(ctx.query.get('page')) || 0);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    ctx.api.listFactories({ category: category || undefined, page, size: 20 }, { signal: controller.signal })
      .then(data => { if (active) setResult({ data, error: null, attempt }); })
      .catch(error => { if (active && error?.name !== 'AbortError') setResult({ data: null, error, attempt }); });
    return () => { active = false; controller.abort(); };
  }, [ctx.api, category, page, attempt]);
  const current = result?.attempt === attempt ? result : null;
  const data = current?.data;
  return <section className="buyer-page stack">
    <PageHeading title="부자재·공장 찾기" description="양주시 공장등록 정보를 업종별로 확인합니다." />
    <nav className="tabs" aria-label="업종">{CATEGORIES.map(([code, label]) => <Button key={code || 'all'} href={pathFor(code)} tone={category === code ? 'primary' : 'secondary'} aria-current={category === code ? 'page' : undefined}>{label}</Button>)}</nav>
    {!current && <Notice role="status">공장 목록을 불러오고 있어요.</Notice>}
    {current?.error && <Notice tone="error">{current.error.message || '공장 목록을 불러오지 못했어요.'}<div className="actions"><Button onClick={retry} tone="primary">다시 조회</Button></div></Notice>}
    {data && <>
      <p className="muted">전체 {data.totalElements}곳 · {data.totalPages ? data.page + 1 : 0} / {data.totalPages}페이지</p>
      {data.items.length ? <div className="table-wrapper"><table className="data-table"><caption className="admin-sr-only">공장 목록</caption><thead><tr><th scope="col">업체</th><th scope="col">생산품</th><th scope="col">주소</th><th scope="col">전화</th></tr></thead><tbody>{data.items.map(item => <tr key={item.factoryId}><td data-label="업체"><strong>{item.factory_name}</strong>{item.legal_dong && <small>{item.legal_dong}</small>}</td><td data-label="생산품">{item.industry || '정보 없음'}</td><td data-label="주소">{item.address || '정보 없음'}</td><td data-label="전화">{item.phone_number || '정보 없음'}</td></tr>)}</tbody></table></div> : <EmptyState title="이 조건의 공장이 없어요." description="다른 업종을 선택해 보세요." />}
      <nav className="actions" aria-label="공장 목록 페이지"><Button href={pathFor(category, Math.max(0, data.page - 1))} disabled={data.page <= 0}>이전</Button><Button href={pathFor(category, data.page + 1)} disabled={data.page + 1 >= data.totalPages}>다음</Button></nav>
    </>}
  </section>;
}
