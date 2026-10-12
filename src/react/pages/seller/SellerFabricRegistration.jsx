import { useState } from 'react';
import { Badge, Button, EmptyState, Notice, PageHeading } from '../../components/ui.jsx';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import { FabricLink, LiveFabricForm, LiveFabricInfo, LocalPhotoGallery } from './SellerLiveFabricParts.jsx';
import { LIVE_UPLOAD_KEY, liveFabricDraftKey, liveFabricType, emptyLiveFabricDraft, validateLiveFabricDraft, liveFabricFailure, uploadLiveFabricPhotos } from './sellerLiveFabricModel.js';

export default function SellerFabricRegistration({ ctx }) {
  const type = liveFabricType(ctx), key = liveFabricDraftKey(type);
  const [draft, setDraft] = useState(() => ctx.drafts.get(key) || emptyLiveFabricDraft(type));
  const [job, setJobState] = useState(() => ctx.drafts.get(LIVE_UPLOAD_KEY) || null);
  const [confirmedUnknown, setConfirmedUnknown] = useState(false);
  const mutation = useReservationMutation(ctx), failure = liveFabricFailure(mutation.failure);
  const persist = value => { ctx.drafts.set(LIVE_UPLOAD_KEY, value); setJobState(value); };
  const remember = value => { ctx.drafts.set(key, value); ctx.drafts.set('seller:live:last-type', type); };
  const reset = () => { ctx.drafts.delete(LIVE_UPLOAD_KEY); ctx.drafts.delete(key); setJobState(null); ctx.navigate('/seller/register/type'); };
  const toReview = value => {
    remember(value); const message = validateLiveFabricDraft(value, true);
    if (message) { mutation.setError(message); return; }
    setDraft(value); ctx.navigate(`/seller/register/review?type=${type}`);
  };
  const create = () => mutation.run(async ({ signal, isCurrent }) => {
    const message = validateLiveFabricDraft(draft, true); if (message) throw new Error(message);
    const pending = { stage: 'UNKNOWN', draft, fabric_id: null, photos: draft.photos.map(photo => ({ ...photo, status: 'PENDING' })) };
    persist(pending);
    let result;
    try { result = await ctx.api.createFabric(draft, { signal }); }
    catch (error) {
      if (isCurrent()) { if (error.outcomeUnknown) persist({ ...pending, error: error.message }); else { ctx.drafts.delete(LIVE_UPLOAD_KEY); setJobState(null); } }
      throw error;
    }
    if (!isCurrent()) return;
    const saved = { ...pending, stage: 'PARTIAL', fabric_id: result.id, status: result.status };
    persist(saved); ctx.drafts.delete(key);
    await uploadLiveFabricPhotos(ctx.api, saved, { signal, isCurrent, onChange: persist });
    if (isCurrent()) ctx.navigate('/seller/upload');
  });
  const retryPhotos = () => mutation.run(async ({ signal, isCurrent }) => {
    await uploadLiveFabricPhotos(ctx.api, job, { signal, isCurrent, onChange: persist });
  });
  const photoBack = event => {
    event.preventDefault(); const scrollY = ctx.drafts.get(`seller:live:photo-return:${type}`);
    ctx.navigate(`/seller/register/manual?type=${type}`, Number.isFinite(scrollY) ? { scrollY, focusTarget: 'seller-photo-review' } : {});
  };
  const activeJob = job && (ctx.path === '/seller/upload' || ['UNKNOWN', 'PARTIAL'].includes(job.stage));
  if (activeJob) return <section className="seller-page stack seller-state" data-figma-node={mutation.busy ? '210:8618' : job.stage === 'UNKNOWN' ? '210:8638' : job.stage === 'DONE' ? '127:6713' : '210:8628'}>
    <PageHeading title={mutation.busy ? job.fabric_id ? '사진을 업로드하고 있어요' : '원단 정보를 저장하고 있어요' : job.stage === 'UNKNOWN' ? '등록 결과를 확인하지 못했어요' : job.stage === 'DONE' ? '원단 등록과 사진 처리를 마쳤어요' : '사진 업로드 상태를 확인해 주세요'} description={job.fabric_id ? `원단 정보는 저장됐어요. 등록 번호 #${job.fabric_id}` : '같은 원단을 바로 다시 등록하지 마세요.'} />
    {mutation.busy ? <div className="seller-progress" role="status"><span className="seller-spinner" aria-hidden="true" />선택한 사진을 한 장씩 처리하고 있어요.</div> : <Notice tone={job.stage === 'DONE' ? 'info' : 'warning'}>{job.stage === 'UNKNOWN' ? '서버에서 이미 등록되었을 수 있어요. 내 원단 목록에서 같은 이름·내용의 원단이 있는지 먼저 확인해 주세요.' : job.stage === 'DONE' ? '운영팀 승인 후 구매자에게 게시돼요. 등록된 사진은 원단 상세에서 확인할 수 있어요.' : '원단 정보는 다시 등록하지 않습니다. 확실히 실패한 사진만 재시도할 수 있어요. 결과 확인이 필요한 사진은 등록된 사진과 비교해 주세요.'}</Notice>}
    <section className="panel seller-panel"><h2>{job.draft.title}</h2><ul className="seller-upload-files">{job.photos.map(photo => <li key={photo.slot}><span>{photo.file.name}{photo.error && <small className="seller-upload-error">{photo.error}</small>}</span><Badge tone={photo.status === 'DONE' ? 'green' : photo.status === 'FAILED' ? 'red' : 'amber'}>{({ DONE: '업로드 완료', FAILED: '재시도 필요', UNKNOWN: '서버 사진 확인 필요', SKIPPED: '추가 업로드 생략', PENDING: '업로드 대기' })[photo.status]}</Badge></li>)}</ul></section>
    {failure && !mutation.busy && <Notice tone="error">{failure.message}</Notice>}
    {!mutation.busy && <div className="actions">{job.fabric_id && <FabricLink path={`/seller/fabrics/photos?id=${job.fabric_id}`} tone="primary">등록된 사진 확인 · 복구</FabricLink>}{job.photos.some(photo => photo.status === 'UNKNOWN') ? <Notice>결과가 불확실한 사진을 확인한 뒤 남은 업로드를 진행해 주세요.</Notice> : job.fabric_id && job.photos.some(photo => ['FAILED', 'PENDING'].includes(photo.status)) && <Button onClick={retryPhotos} tone="primary">실패·대기 사진만 업로드</Button>}<FabricLink path="/seller/fabrics">내 원단 목록 확인</FabricLink>{job.stage === 'DONE' && <Button onClick={reset}>다른 원단 등록</Button>}</div>}
    {!mutation.busy && job.stage === 'UNKNOWN' && <section className="panel seller-panel"><label className="seller-defect"><input type="checkbox" checked={confirmedUnknown} onChange={event => setConfirmedUnknown(event.target.checked)} /> 내 원단 목록에서 기존 등록 여부를 확인했어요.</label><p className="muted">이미 등록되었다면 해당 원단 상세에서 사진을 관리해 주세요. 새로 작성하면 별도 원단으로 등록됩니다.</p><Button onClick={reset} disabled={!confirmedUnknown}>확인 후 새 원단 작성</Button></section>}
  </section>;
  if (ctx.path === '/seller/upload') return <section className="seller-page stack"><PageHeading title="원단 등록 진행 상태" /><EmptyState title="진행 중인 등록이 없어요" description="새로고침하면 선택한 파일은 보관되지 않습니다. 원단 목록에서 저장 여부를 확인해 주세요."><FabricLink path="/seller/fabrics">내 원단 목록</FabricLink></EmptyState></section>;
  const seller = ctx.state.seller;
  if (seller.seller_approval_status !== 'APPROVED' || !seller.hasStore) return <section className="seller-page stack seller-state" data-figma-node="127:5978"><PageHeading title={seller.seller_approval_status !== 'APPROVED' ? '판매자 승인이 필요해요' : '매장 정보가 필요해요'} /><Notice tone="warning">원단 등록에는 판매자 승인과 매장 정보가 필요해요. 매장 정보 저장 연결은 준비 중입니다.</Notice><div className="actions"><FabricLink path="/seller/profile">계정 · 매장 정보 확인</FabricLink><FabricLink path="/seller/fabrics">내 원단 목록</FabricLink></div></section>;
  if (ctx.path === '/seller/register/ai' || ctx.query.get('mode') === 'ai') return <section className="seller-page stack" data-figma-node="123:3245"><PageHeading title="AI 등록은 준비 중이에요" description="현재는 직접 입력으로 원단을 등록할 수 있어요." /><Notice>AI 대화와 자동 초안 등록은 아직 실제 서비스에 연결하지 않았어요.</Notice><FabricLink path="/seller/register/type" tone="primary">직접 입력하기</FabricLink></section>;
  if (ctx.path === '/seller/register') return <section className="seller-page stack" data-figma-node="123:3245"><PageHeading title="새 원단 등록" description="원단 정보를 입력하고 사진을 첨부해 주세요." /><div className="seller-columns seller-methods"><section className="panel seller-panel"><h2>AI와 대화로 등록</h2><h3>연결을 준비하고 있어요.</h3><p className="muted">현재는 직접 입력을 이용해 주세요.</p><Notice>AI 대화와 자동 초안은 아직 실제 서비스에 연결하지 않았어요.</Notice><Button disabled>준비 중</Button></section><section className="panel seller-panel"><h2>직접 입력</h2><h3>정보를 차례로 입력해요.</h3><p className="muted">사진, 소재, 치수와 가격을 입력하고 확인해요.</p><Notice>저장 후 운영팀이 승인하면 구매자에게 게시돼요.</Notice><FabricLink path="/seller/register/type" tone="primary">직접 입력하기</FabricLink></section></div></section>;
  if (ctx.path === '/seller/register/type') return <section className="seller-page stack" data-figma-node="127:6094"><PageHeading title="판매 형태를 선택해 주세요" /><div className="seller-columns seller-methods"><section className="panel seller-panel"><h2>롤 원단</h2><p>90cm 이상 남은 원단 · 가격은 90cm(1마)당 입력해요.</p><FabricLink path="/seller/register/manual?type=ROLL" tone="primary">롤 원단 입력</FabricLink></section><section className="panel seller-panel"><h2>자투리 원단</h2><p>길이 30~90cm인 직사각형 한 장을 그대로 판매해요.</p><FabricLink path="/seller/register/manual?type=SCRAP" tone="primary">자투리 입력</FabricLink></section></div><FabricLink path="/seller/register">이전</FabricLink></section>;
  if (ctx.path === '/seller/register/photos') return <section className="seller-page stack" data-figma-node="127:6637"><PageHeading title="선택한 사진을 확인해 주세요" description={`사진 ${draft.photos.length}장 선택 · 아직 업로드 전`} /><section className="panel seller-panel"><LocalPhotoGallery photos={draft.photos} /><div className="actions"><Button onClick={() => toReview(draft)} tone="primary">등록 내용 확인</Button><FabricLink path={`/seller/register/manual?type=${type}`} onClick={photoBack}>입력하던 곳으로 돌아가기</FabricLink></div></section>{failure && <Notice tone="error">{failure.message}</Notice>}</section>;
  if (ctx.path === '/seller/register/review') return <section className="seller-page stack" data-figma-node={type === 'SCRAP' ? '127:6325' : '123:4153'}><PageHeading title="등록 내용 확인" description="원단 정보와 사진을 확인한 뒤 승인 신청을 보내 주세요." />{failure && <Notice tone="error">{failure.message}</Notice>}<div className="seller-review"><section className="panel seller-panel"><h2>선택한 사진 {draft.photos.length}장</h2><LocalPhotoGallery photos={draft.photos} /></section><section className="panel seller-panel"><h2>원단 정보</h2><Badge tone="gray">승인 신청 전</Badge><h3 className="seller-review-title">{draft.title || '원단 이름 미입력'}</h3><LiveFabricInfo fabric={draft} /><div className="actions"><Button onClick={create} disabled={mutation.busy || failure?.locked} tone="primary">확인 후 승인 신청</Button><FabricLink path={`/seller/register/manual?type=${type}`}>내용 수정</FabricLink></div></section></div></section>;
  return <section className="seller-page stack" data-figma-node={type === 'SCRAP' ? '127:6196' : '123:3466'}><PageHeading title={type === 'SCRAP' ? '자투리 원단 입력' : '원단 등록 · 직접 입력'} description="입력 내용과 파일은 이 탭에서만 임시로 보관해요. 새로고침하면 다시 선택해야 합니다." /><nav className="tabs seller-tabs" aria-label="판매 형태">{[['ROLL', '롤 원단'], ['SCRAP', '자투리 원단']].map(([value, label]) => <FabricLink key={value} className={type === value ? 'seller-tab--active' : ''} path={`/seller/register/manual?type=${value}`} aria-current={type === value ? 'page' : undefined}>{label}</FabricLink>)}</nav>{failure && <Notice tone="error">{failure.message}</Notice>}<LiveFabricForm ctx={ctx} initial={draft} onRemember={remember} onSubmit={toReview} busy={mutation.busy} /></section>;
}
