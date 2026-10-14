import { useEffect, useRef, useState } from 'react';
import { Button, Notice, PageHeading, EmptyState } from '../components/ui.jsx';
import NaverFactoryMap from '../components/NaverFactoryMap.jsx';
import useFactoryResource from '../hooks/useFactoryResource.js';
import { internalReturn } from './buyer-model.js';
import { SUPPLY_CATEGORIES, factoryArea, supplyCategoryCode, supplyCategoryCodes } from './factory-categories.js';
import './factory-supplies.css';

export default function FactorySupplies({ ctx }) {
  const resource = useFactoryResource(ctx.api), heading = useRef(null);
  const [focusRevision, setFocusRevision] = useState(0);
  const from = internalReturn(ctx.query.get('from'), 'pattern');
  const product = supplyCategoryCode(ctx.query.get('product'));
  const routeId = ctx.path === '/buyer/supplies' ? '' : ctx.path.split('/')[3];
  const selectedId = routeId || ctx.query.get('selected');
  const items = resource.data?.items || [];
  const areas = [...new Set(items.map(factoryArea).filter(Boolean))];
  const area = areas.includes(ctx.query.get('area')) ? ctx.query.get('area') : '';
  const visible = items.filter((item) => (!product || supplyCategoryCodes(item.industry).includes(product)) && (!area || factoryArea(item) === area));
  const selected = visible.find((item) => item.id === selectedId) || (!selectedId ? visible[0] : null);
  const withQuery = (query) => {
    if (product) query.set('product', product);
    if (area) query.set('area', area);
    if (from) query.set('from', from);
    return query;
  };
  const listPath = ({ product: nextProduct = product, area: nextArea = area } = {}) => {
    const query = new URLSearchParams();
    if (nextProduct) query.set('product', nextProduct);
    if (nextArea) query.set('area', nextArea);
    if (from) query.set('from', from);
    const search = query.toString();
    return `/buyer/supplies${search ? `?${search}` : ''}`;
  };
  const route = (id, detail = false) => {
    const query = withQuery(new URLSearchParams(detail ? {} : { selected: id, focus: 'selected' }));
    return `/buyer/supplies${detail ? `/${encodeURIComponent(id)}` : ''}?${query}`;
  };
  const select = (id) => {
    setFocusRevision((value) => value + 1);
    return ctx.navigate(route(id), { replace: true, preserveScroll: true });
  };
  useEffect(() => { if (ctx.query.get('focus') === 'selected') heading.current?.focus({ preventScroll: true }); }, [selected?.id, ctx.query]);
  return <section className="buyer-page factory-supplies" data-figma-node="123:1637">
    <PageHeading title={routeId && selected ? selected.name : '부자재 관련 공장 찾기'} description="양주시청 공장등록 자료에서 생산품을 기준으로 선별한 업체입니다." />
    <Notice>소매 판매와 영업 여부는 확인되지 않았어요. 방문 전 업체에 공급 가능 여부를 확인해 주세요.</Notice>
    {resource.loading && <section className="panel" role="status">공장 정보를 불러오는 중이에요…</section>}
    {resource.error && <section className="panel"><Notice tone="error">{resource.error.message || '공장 정보를 불러오지 못했어요.'}</Notice><Button onClick={resource.retry} tone="primary">다시 불러오기</Button></section>}
    {resource.data && !items.length && <EmptyState title="조회된 부자재 후보가 없어요" description="공장등록 자료가 갱신되면 다시 확인해 주세요." />}
    {resource.data && items.length > 0 && <>
      <p className="factory-source">{items[0].data_source} · {area || product ? `${[area, product ? SUPPLY_CATEGORIES.find(([code]) => code === product)?.[1] : ''].filter(Boolean).join(' · ')} ${visible.length}곳` : `후보 ${items.length}곳`} · 위치 확인 {visible.filter((item) => item.latitude !== null).length}곳</p>
      <nav className="factory-categories" aria-label="부자재 분류">
        <Button href={listPath({ product: '' })} aria-current={!product ? 'page' : undefined}>분류 전체 {items.filter((item) => !area || factoryArea(item) === area).length}</Button>
        {SUPPLY_CATEGORIES.map(([code, label]) => {
          const count = items.filter((item) => supplyCategoryCodes(item.industry).includes(code) && (!area || factoryArea(item) === area)).length;
          return count ? <Button key={code} href={listPath({ product: code })} aria-current={product === code ? 'page' : undefined}>{label} {count}</Button> : null;
        })}
      </nav>
      <nav className="factory-categories" aria-label="공장 지역">
        <Button href={listPath({ area: '' })} aria-current={!area ? 'page' : undefined}>지역 전체 {items.filter((item) => !product || supplyCategoryCodes(item.industry).includes(product)).length}</Button>
        {areas.map((name) => {
          const count = items.filter((item) => factoryArea(item) === name && (!product || supplyCategoryCodes(item.industry).includes(product))).length;
          return count ? <Button key={name} href={listPath({ area: name })} aria-current={area === name ? 'page' : undefined}>{name} {count}</Button> : null;
        })}
      </nav>
      {visible.length === 0 && <EmptyState title="이 분류의 공장이 없어요" description="다른 분류를 선택해 주세요." />}
      {visible.length > 0 && <>
      {!routeId && <div className="buyer-supply-layout factory-supply-layout">
        <NaverFactoryMap items={visible} selectedId={selected?.id} onSelect={select} focusSelected={Boolean(selectedId)} focusRevision={focusRevision} />
        <section className="panel factory-list-panel"><h2>공장 목록 · {visible.length}곳</h2><ol className="buyer-store-list factory-store-list">
          {visible.map((item) => <li key={item.id}><a href={`#${route(item.id)}`} aria-current={selected?.id === item.id ? 'true' : undefined} onClick={(event) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); select(item.id);
          }}><strong>{item.name}</strong><span>{item.industry || '생산품 정보 없음'}</span><small>{item.address}</small><small>전화번호: {item.phone_number || '원본에 전화번호 없음'}</small><small>{item.latitude === null ? '위치 미확인' : '지도 위치 확인됨'}</small></a></li>)}
        </ol></section>
      </div>}
      {selected ? <section className="panel buyer-selected-store factory-selected"><h2 ref={heading} tabIndex={-1}>{selected.name}</h2>
        <dl className="factory-details"><div><dt>생산품</dt><dd>{selected.industry || '정보 없음'}</dd></div><div><dt>등록 주소</dt><dd>{selected.address}</dd></div><div><dt>전화번호</dt><dd>{selected.phone_number ? <a href={`tel:${selected.phone_number.replace(/[^\d+]/g, '')}`}>{selected.phone_number}</a> : '원본에 전화번호 없음'}</dd></div><div><dt>출처</dt><dd>{selected.data_source}</dd></div><div><dt>위치</dt><dd>{selected.latitude === null ? '주소에 맞는 위치를 확인하고 있어요.' : '지도 위치가 확인되었어요.'}</dd></div></dl>
        <div className="actions"><Button href={route(selected.id, !routeId)}>{routeId ? '지도와 목록으로 돌아가기' : '이 공장 주소와 전화 보기'}</Button></div>
      </section> : <EmptyState title="업체를 찾을 수 없어요" description="현재 공장 목록에서 다시 선택해 주세요."><Button href={listPath()}>공장 목록으로</Button></EmptyState>}
      </>}
    </>}
    {from && <div className="actions"><Button href={from}>도안으로 돌아가기</Button></div>}
  </section>;
}
