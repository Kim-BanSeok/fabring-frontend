import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Button, Badge, Notice, PageHeading, EmptyState, Field } from '../components/ui.jsx';
import usePatternResource from '../hooks/usePatternResource.js';
import { fabricFilterLabel } from '../services/fabric-contract.js';
import { addQuery, keepList, detailPath, dimensions, currentRoute, availability, pickupPath } from './buyer-model.js';
import { recommendationPath, patternDetailPath, patternPickupPath, patternListReturn, selectedRecommendation, recommendationPurchase, patternListPagePath } from './buyer-pattern-model.js';
import { inquiryFlowPath } from './inquiry-model.js';
import { FavoriteButton } from './FavoritePages.jsx';
import './buyer-patterns.css';

const Info = ({ rows }) => <dl className="buyer-info">{rows.map(([name, value], index) => <Fragment key={`${name}-${index}`}><dt>{name}</dt><dd>{value}</dd></Fragment>)}</dl>;
const Page = ({ children }) => <div className="buyer-page">{children}</div>;
const labels = (values, kind) => values.map(value => fabricFilterLabel(kind, value) || value).join(', ') || '등록 정보 없음';

function useReadHeading(resource) {
  const owned = useRef(false);
  useLayoutEffect(() => {
    const heading = document.querySelector('#main-content h1');
    if (resource.loading) {
      owned.current = document.activeElement === heading;
      const track = event => { owned.current = event.target === heading; };
      document.addEventListener('focusin', track);
      return () => document.removeEventListener('focusin', track);
    }
    document.title = `${heading?.textContent || '도안 정보'} · 패브링`;
    if (owned.current && heading && (document.activeElement === document.body || document.activeElement === heading)) heading.focus({ preventScroll: true });
    owned.current = false;
    return undefined;
  }, [resource.loading, resource.data, resource.error]);
}

function PatternImage({ pattern }) {
  const [failed, setFailed] = useState(null);
  return pattern.image_url && pattern.image_url !== failed
    ? <img className="buyer-pattern-image" src={pattern.image_url} alt={`${pattern.pattern_name} 도안 참고 이미지`} onError={() => setFailed(pattern.image_url)} />
    : <div className="buyer-pattern-image buyer-pattern-image--empty" role="img" aria-label={`${pattern.pattern_name} · ${failed ? '이미지 로드 실패' : '이미지 없음'}`}><span>{failed ? '이미지를 불러오지 못했어요' : '등록된 이미지 없음'}</span></div>;
}

export function PatternReadFeedback({ resource, label = '도안 정보', resetPath = '/buyer/patterns' }) {
  if (resource.loading) return <section className="panel buyer-resource-feedback" role="status" aria-live="polite"><p>{label}를 불러오는 중이에요…</p></section>;
  if (!resource.error) return null;
  const missing = resource.error.status === 404;
  const invalid = resource.error.status === 400;
  return <section className="panel buyer-resource-feedback"><Notice tone="error"><strong>{missing ? `${label}를 찾을 수 없어요` : invalid ? '주소 또는 조회 조건을 확인해 주세요' : `${label}를 불러오지 못했어요`}</strong><p>{missing ? '공개가 종료되었거나 존재하지 않는 정보입니다.' : resource.error.message || '연결 상태를 확인한 뒤 다시 시도해 주세요.'}</p></Notice><div className="actions">{!invalid && <Button tone="primary" onClick={resource.retry}>다시 불러오기</Button>}<Button href={resetPath}>목록으로 돌아가기</Button></div></section>;
}

const RecommendationNotices = ({ result }) => <>{result.notices.map((text, index) => <Notice key={`${text}-${index}`}>{text}</Notice>)}</>;

function RecommendationEmpty({ result }) {
  return <EmptyState title={result.available ? '현재 추천 결과가 없어요' : '현재 이 원단의 도안을 추천할 수 없어요'} description={result.message || '현재 원단 정보로 추천할 도안을 찾지 못했어요.'} />;
}

export function MakingSteps({ parts, description, steps, images }) {
  const cut = parts.map(part => `${part.part_name} ${part.width_cm}×${part.height_cm}cm ${part.quantity}장`).join(', ');
  const list = steps || [
    `아래 치수대로 자릅니다. ${cut}. 가로 숫자는 원단 폭, 세로 숫자는 길이 방향입니다.`,
    '같은 부품끼리 겉면이 마주 보게 겹치고, 시접을 두고 박습니다. 뒤집기 구멍은 한쪽에 남깁니다.',
    '입구와 손잡이·지퍼 같은 부자재를 달고, 남긴 구멍으로 뒤집어 마무리합니다.',
    '시접 폭과 부자재는 도안에 따로 없으면 제작 전에 준비합니다. 수축과 결 방향은 원단을 보고 확인합니다.',
  ];
  return <div className="buyer-making"><h3 className="buyer-panel-heading">만드는 방법</h3>{description ? <p className="buyer-making-copy">{description}</p> : null}{images?.length ? <div className="buyer-making-images">{images.map(image => <figure key={image.src}><figcaption>{image.caption}</figcaption><img src={image.src} alt={image.alt} /></figure>)}</div> : <><ol className="buyer-making-steps">{list.map(step => <li key={step}>{step}</li>)}</ol>{parts.length ? <><h4>이렇게 재단하세요</h4><CuttingSheet parts={parts} /></> : <Notice>재단 치수가 등록되지 않아 자르는 크기를 안내할 수 없어요.</Notice>}</>}</div>;
}

function PatternMaking({ api, patternId }) {
  const resource = usePatternResource(api, { kind: 'detail', id: patternId });
  if (!resource.data) return <PatternReadFeedback resource={resource} label="만드는 방법" resetPath="/buyer/patterns" />;
  return <MakingSteps parts={resource.data.parts} description={resource.data.description} />;
}

export function CuttingSheet({ parts }) {
  const max = Math.max(1, ...parts.map(part => Math.max(part.width_cm, part.height_cm)));
  return <div className="buyer-cutting-sheet">{parts.map((part, index) => <figure className="buyer-cutting-figure" key={`${part.part_name}-${index}`}><figcaption><strong>{part.part_name}</strong><span>{part.quantity}장</span></figcaption><div className="buyer-cutting-stage"><span className="buyer-cutting-height">{part.height_cm}</span><div className="buyer-cutting-size"><span className="buyer-cutting-width">{part.width_cm}</span><div className="buyer-cutting-piece" style={{ width: `${Math.max(88, Math.round((part.width_cm / max) * 220))}px`, height: `${Math.max(64, Math.round((part.height_cm / max) * 220))}px` }} /></div></div><p>{part.width_cm} × {part.height_cm}cm</p></figure>)}<p className="buyer-small">단위는 cm입니다. 등록된 부품 치수를 비율에 맞춰 그린 재단 그림이며, 실물 크기 출력은 아니에요.</p></div>;
}

function RecommendationActions({ ctx, fabric, item, showDetail = true }) {
  return <div className="actions">{showDetail && <Button href={patternDetailPath(ctx, item.pattern_id, fabric.id)} tone="primary">도안 보기</Button>}{item.judgement === 'SUITABLE' && availability(ctx, fabric).canRequest ? <Button href={patternPickupPath(ctx, fabric.id, item.pattern_id)} tone="primary">{fabric.sale_type === 'ROLL' ? `${item.yards}마로 픽업 요청` : '이 도안으로 픽업 요청'}</Button> : <>{item.judgement !== 'SUITABLE' && <Button href={inquiryFlowPath(ctx, fabric.id, { compose: 1 })} tone="primary">판매자에게 소재 문의</Button>}<Button href={detailPath(ctx, fabric)}>원단 정보 다시 확인</Button></>}</div>;
}

function RecommendationCard({ ctx, fabric, item, compact = false }) {
  const suitable = item.judgement === 'SUITABLE';
  const reasons = item.reasons.map((reason, index) => <li key={`${reason.criterion}-${index}`}>{reason.text}</li>);
  return <article className="panel buyer-pattern-card"><div className="buyer-pattern-card-heading"><h3>{item.pattern_name}</h3><Badge tone={suitable ? 'green' : 'amber'}>{suitable ? '조건 적합' : '소재 확인 필요'}</Badge></div><div className="buyer-recommend-body"><PatternImage pattern={item} /><div className="buyer-recommend-copy"><strong>{recommendationPurchase(item, fabric)}</strong><p className="buyer-muted">{suitable ? '등록된 원단 정보가 도안의 조건을 충족해요. 제작 전 실물 확인을 권장해요.' : '원단 소재가 확인되지 않았어요. 소재를 확인한 뒤 제작 여부를 결정해 주세요.'}</p>{fabric.sale_type === 'ROLL' && <p className="buyer-small">재단에 필요한 길이 {item.required_length_cm}cm → 1마 단위 구매 {item.purchase_length_cm}cm</p>}</div></div>{compact ? <details><summary>판정 근거 보기</summary><ul className="buyer-pattern-reasons">{reasons}</ul></details> : <><h4>판정 근거</h4><ul className="buyer-pattern-reasons">{reasons}</ul></>}{!suitable && <Notice tone="warning">소재 확인이 필요한 추천은 제작 적합성이 확정된 결과가 아닙니다. 판매자에게 소재를 문의한 뒤 제작 여부를 결정해 주세요.</Notice>}<PatternMaking api={ctx.api} patternId={item.pattern_id} /><RecommendationActions ctx={ctx} fabric={fabric} item={item} /></article>;
}

export function LiveRecommendationsPreview(props) {
  return <RecommendationsPreviewContent key={props.fabric.id} {...props} />;
}

function RecommendationsPreviewContent({ ctx, fabric }) {
  const [asked, setAsked] = useState(false);
  const resource = usePatternResource(ctx.api, asked ? { kind: 'recommendations', id: fabric.id } : null);
  return <section className="buyer-page" aria-labelledby="buyer-recommendation-title"><div className="buyer-home-section-heading"><h2 id="buyer-recommendation-title">이 원단으로 만들 도안</h2>{asked && resource.data?.items?.length ? <Button href={recommendationPath(ctx, fabric.id)}>추천 전체 보기</Button> : null}</div><p className="buyer-muted">이 원단의 폭, 길이, 소재를 등록된 도안과 비교해서 맞는 도안을 골라 보여 드려요.</p>{!asked ? <div className="actions"><Button onClick={() => setAsked(true)}>등록 도안과 이 원단 치수 비교</Button></div> : !resource.data ? <PatternReadFeedback resource={resource} label="추천 정보" resetPath={detailPath(ctx, fabric)} /> : <>{resource.data.items.length ? <div className="buyer-recommend-grid">{resource.data.items.map(item => <RecommendationCard key={item.pattern_id} ctx={ctx} fabric={fabric} item={item} compact />)}</div> : <RecommendationEmpty result={resource.data} />}<RecommendationNotices result={resource.data} /></>}</section>;
}

function LiveRecommendations({ ctx }) {
  const id = ctx.path.split('/')[3];
  const resource = usePatternResource(ctx.api, { kind: 'context', id });
  useReadHeading(resource);
  const fabric = resource.data?.fabric, result = resource.data?.recommendations;
  return <Page><PageHeading title="이 원단의 추천 도안" description={fabric ? `${fabric.title} · ${dimensions(fabric)} · ${fabric.material} / ${fabric.thickness}` : '원단 정보와 등록 도안의 제작 조건을 비교해요.'} />{!result ? <PatternReadFeedback resource={resource} label="추천 정보" resetPath="/buyer/fabrics" /> : <>{result.items.length ? <><p className="buyer-result-count">추천 {result.items.length}개 · 적합 최대 5개, 소재 확인 필요 최대 3개</p><div className="buyer-recommend-grid">{result.items.map(item => <RecommendationCard key={item.pattern_id} ctx={ctx} fabric={fabric} item={item} />)}</div></> : <RecommendationEmpty result={result} />}<RecommendationNotices result={result} /><Notice>부품 회전이나 여러 줄 배치는 계산하지 않아요. 추천 목록에 없는 도안도 제작이 불가능하다는 뜻은 아닙니다.</Notice><div className="actions"><Button href={detailPath(ctx, fabric)}>원단 상세로 돌아가기</Button><Button href={keepList(ctx, `/buyer/patterns?fabric_id=${encodeURIComponent(fabric.id)}`)}>전체 도안 둘러보기</Button></div></>}</Page>;
}

function PatternCatalogue({ ctx }) {
  const query = Object.fromEntries(['keyword', 'category', 'page', 'size'].filter(name => ctx.query.has(name)).map(name => [name, ctx.query.get(name)]));
  const resource = usePatternResource(ctx.api, { kind: 'list', query });
  const [filters, setFilters] = useState({ keyword: query.keyword || '', category: query.category || '' });
  const page = resource.data;
  const apply = event => {
    event.preventDefault();
    const next = new URLSearchParams(ctx.query);
    for (const name of ['keyword', 'category']) {
      if (filters[name].trim()) next.set(name, filters[name].trim());
      else next.delete(name);
    }
    next.set('page', '0');
    ctx.navigate(`/buyer/patterns?${next}`);
  };
  const reset = keepList(ctx, addQuery('/buyer/patterns', 'fabric_id', ctx.query.get('fabric_id')));
  return <Page><PageHeading title="도안 둘러보기" description="제작할 도안의 부품 치수를 확인하세요. 원단에 맞는지는 해당 원단의 추천 결과에서 확인할 수 있어요." /><form className="panel buyer-page" onSubmit={apply}><div className="buyer-filter-grid"><Field label="도안 이름·별칭 검색" name="keyword" maxLength={100} value={filters.keyword} onChange={event => setFilters({ ...filters, keyword: event.target.value })} /><Field label="분류" name="category" maxLength={50} value={filters.category} placeholder="분류 이름 입력" onChange={event => setFilters({ ...filters, category: event.target.value })} /></div><div className="actions"><Button type="submit" tone="primary">도안 검색</Button><Button href={reset}>검색 초기화</Button></div></form>{!page ? <PatternReadFeedback resource={resource} resetPath={reset} /> : <><p className="buyer-result-count" aria-live="polite">도안 {page.totalElements}개</p>{page.content.length ? <div className="buyer-recommend-grid">{page.content.map(pattern => <article className="panel buyer-pattern-card" key={pattern.id}><h2>{pattern.pattern_name}</h2><div className="buyer-recommend-body"><PatternImage pattern={pattern} /><Info rows={[[ '분류', pattern.category || '미분류'], ['소재', labels(pattern.allowed_materials, 'material')], ['두께', labels(pattern.allowed_thickness, 'thickness')]]} /></div><div className="actions"><Button href={patternDetailPath(ctx, pattern.id, ctx.query.get('fabric_id'))} tone="primary">재단 치수 확인</Button></div></article>)}</div> : <EmptyState title={page.page > 0 && page.totalElements ? '이 페이지에는 도안이 없어요' : '조건에 맞는 도안이 없어요'} description="검색 조건을 바꾸거나 첫 페이지에서 다시 확인해 주세요."><Button href={page.page > 0 ? patternListPagePath(ctx, 0) : reset}>다시 찾아보기</Button></EmptyState>}{page.totalPages > 1 && page.content.length > 0 && <nav className="buyer-pagination" aria-label="도안 목록 페이지"><Button href={patternListPagePath(ctx, page.page - 1)} disabled={page.page <= 0}>이전 페이지</Button><p>{page.page + 1} / {page.totalPages} 페이지</p><Button href={patternListPagePath(ctx, page.page + 1)} disabled={page.page + 1 >= page.totalPages}>다음 페이지</Button></nav>}</>}{ctx.query.get('fabric_id') && <div className="actions"><Button href={recommendationPath(ctx, ctx.query.get('fabric_id'))}>원단의 추천 결과로</Button></div>}</Page>;
}

function PatternFabricContext({ ctx, pattern }) {
  const resource = usePatternResource(ctx.api, { kind: 'context', id: ctx.query.get('fabric_id') });
  if (!resource.data) return <PatternReadFeedback resource={resource} label="원단과 추천 정보" resetPath="/buyer/fabrics" />;
  const { fabric, recommendations } = resource.data;
  const item = selectedRecommendation(recommendations, pattern.id);
  return <section className="panel buyer-page"><h2 className="buyer-panel-heading">선택한 원단의 제작 조건</h2><p>{fabric.title} · {dimensions(fabric)}</p>{item ? <><Badge tone={item.judgement === 'SUITABLE' ? 'green' : 'amber'}>{item.judgement === 'SUITABLE' ? '조건 적합' : '소재 확인 필요'}</Badge><Info rows={[[ '구매 기준', recommendationPurchase(item, fabric)], ...(fabric.sale_type === 'ROLL' ? [['재단에 필요한 길이', `${item.required_length_cm}cm`]] : [])]} /><ul className="buyer-pattern-reasons">{item.reasons.map((reason, index) => <li key={`${reason.criterion}-${index}`}>{reason.text}</li>)}</ul>{item.judgement !== 'SUITABLE' && <Notice tone="warning">소재를 확인하기 전에는 이 도안에 적합하다고 판단할 수 없어요. 판매자에게 소재를 문의한 뒤 제작 여부를 결정해 주세요.</Notice>}<RecommendationActions ctx={ctx} fabric={fabric} item={item} showDetail={false} /></> : <Notice tone="warning">{recommendations.message || '이 도안은 현재 추천 목록에 포함되지 않았어요. 추천 목록에는 개수 제한이 있어 제작 불가능을 뜻하지는 않습니다.'} 도안 치수만 보고 이 원단에 적합하다고 판단하지 마세요.</Notice>}<RecommendationNotices result={recommendations} /><div className="actions"><Button href={recommendationPath(ctx, fabric.id)}>원단의 추천 결과로</Button><Button href={detailPath(ctx, fabric)}>원단 상세로</Button></div></section>;
}

function PatternDetail({ ctx }) {
  const resource = usePatternResource(ctx.api, { kind: 'detail', id: ctx.path.split('/')[3] });
  useReadHeading(resource);
  const pattern = resource.data;
  const back = patternListReturn(ctx.query.get('patterns_return')) || keepList(ctx, addQuery('/buyer/patterns', 'fabric_id', ctx.query.get('fabric_id')));
  return <Page><PageHeading title={pattern ? `${pattern.pattern_name} 재단 치수 확인` : '도안 정보 확인'} description={pattern?.description || '등록된 부품 치수를 확인하세요.'} />{!pattern ? <PatternReadFeedback resource={resource} resetPath={back} /> : <><section className="panel buyer-page"><div className="buyer-recommend-body"><PatternImage pattern={pattern} /><Info rows={[[ '분류', pattern.category || '미분류'], ['허용 소재', labels(pattern.allowed_materials, 'material')], ['허용 두께', labels(pattern.allowed_thickness, 'thickness')], ...(pattern.reviewed_by ? [['검토', pattern.reviewed_by]] : [])]} /></div><MakingSteps parts={pattern.parts} description={pattern.description} />{pattern.parts.length ? <><div className="table-wrapper"><table className="data-table buyer-pattern-table"><thead><tr><th scope="col">부품</th><th scope="col">가로 × 세로</th><th scope="col">장수</th></tr></thead><tbody>{pattern.parts.map((part, index) => <tr key={`${part.part_name}-${index}`}><th scope="row">{part.part_name}</th><td>{part.width_cm} × {part.height_cm}cm</td><td>{part.quantity}장</td></tr>)}</tbody></table></div></> : <Notice>등록된 재단 부품이 없어 도안을 그릴 수 없어요.</Notice>}</section><section className="panel"><h2 className="buyer-panel-heading">재단 전 확인</h2><Info rows={[[ '치수 방향', '가로는 원단 폭 방향, 세로는 원단 길이 방향으로 비교해요.'], ['추천 계산', '롤은 부품을 길이 방향으로 한 장씩, 자투리는 폭 방향으로 한 줄에 놓아요. 회전·여러 줄 배치는 계산하지 않아요.'], ['시접 · 부자재', '시접 포함 여부와 필요한 부자재는 등록 정보에서 별도로 제공되지 않아요. 제작 전 확인해 주세요.'], ['참고 이미지', '참고용 이미지이며 실제 크기 출력·다운로드 파일은 제공하지 않아요.']]} /></section>{ctx.query.get('fabric_id') ? <PatternFabricContext ctx={ctx} pattern={pattern} /> : <Notice>원단을 선택하면 해당 원단의 추천 결과에서 제작 조건과 구매 길이를 확인할 수 있어요.</Notice>}<div className="actions"><FavoriteButton api={ctx.api} targetType="PATTERN" targetId={pattern.id} noun="도안" /><Button href={back}>도안 목록으로</Button><Button href="/buyer/fabrics">원단 둘러보기</Button><Button href={addQuery('/buyer/supplies', 'from', currentRoute(ctx))}>부자재 둘러보기 (예시)</Button></div></>}</Page>;
}

export function LivePatternPickup({ ctx, fabric, children }) {
  const patternId = ctx.query.get('pattern_id');
  const resource = usePatternResource(ctx.api, { kind: 'pickup', id: fabric.id, patternId });
  useReadHeading(resource);
  if (!resource.data) return <Page><PageHeading title="도안의 구매 조건 확인" /><PatternReadFeedback resource={resource} label="도안과 추천 정보" resetPath={recommendationPath(ctx, fabric.id)} /><Button href={pickupPath(ctx, fabric)}>도안 연결 없이 일반 픽업 요청</Button></Page>;
  const item = selectedRecommendation(resource.data.recommendations, patternId);
  if (!item || item.judgement !== 'SUITABLE') return <Page><PageHeading title="제작 조건을 다시 확인해 주세요" /><Notice tone="warning">{item ? '소재 확인이 필요한 도안입니다. 소재를 확인하기 전에는 도안에 맞는 구매 수량을 확정할 수 없어요.' : '선택한 도안이 현재 추천 결과에 포함되지 않았어요. 원단 정보나 재고가 바뀌었을 수 있습니다.'}</Notice><div className="actions"><Button href={recommendationPath(ctx, fabric.id)} tone="primary">추천 결과 다시 확인</Button><Button href={pickupPath(ctx, fabric)}>도안 연결 없이 일반 픽업 요청</Button></div></Page>;
  return children(item);
}

export default function BuyerLivePatterns({ ctx }) {
  if (ctx.path.startsWith('/buyer/recommendations/')) return <LiveRecommendations ctx={ctx} />;
  if (ctx.path === '/buyer/patterns') return <PatternCatalogue ctx={ctx} />;
  return <PatternDetail ctx={ctx} />;
}
