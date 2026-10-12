import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Notice, PageHeading } from '../../components/ui.jsx';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import {
  SELLER_APPROVAL_LABELS, SELLER_STORE_DRAFT_KEY, SELLER_STORE_OPERATION_KEY,
  sellerStoreDraft, readSellerStoreForm, sellerStoreFailure, startSellerStoreRead, saveSellerStore,
} from './sellerStoreModel.js';

const Link = ({ path, children, ...props }) => <Button href={path} {...props}>{children}</Button>;
const approvalTone = value => value === 'APPROVED' ? 'green' : value === 'REJECTED' ? 'red' : 'amber';
function StoreDetails({ store }) {
  return <dl className="seller-details">{[['매장명', store.store_name], ['픽업 주소 / 상세 위치', store.address], ['매장 연락처', store.phone_number], ['휴무일', store.closed_days || '입력하지 않음'], ['픽업 안내', store.pickup_guide || '입력하지 않음']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="seller-store-text">{value}</dd></div>)}</dl>;
}
function Approval({ seller, retry }) {
  const approved = seller.seller_approval_status === 'APPROVED', rejected = seller.seller_approval_status === 'REJECTED';
  return <section className="seller-page stack seller-state" data-figma-node={approved ? '209:8203' : rejected ? '209:8167' : '209:8131'}>
    <PageHeading title={approved ? '판매자 승인이 완료되었어요' : rejected ? '판매자 승인이 거절되었어요' : '판매자 승인을 기다리고 있어요'} description="서버에서 확인한 현재 판매자 승인 상태예요." />
    <Badge tone={approvalTone(seller.seller_approval_status)}>{SELLER_APPROVAL_LABELS[seller.seller_approval_status] || '상태 확인 필요'}</Badge>
    <Notice tone={approved ? 'info' : 'warning'}>{approved ? seller.hasStore ? '매장 정보가 등록되어 있어 직접 입력으로 원단을 등록할 수 있어요.' : '원단 등록을 시작하려면 매장 정보를 먼저 등록해 주세요.' : rejected ? '매장 정보는 수정할 수 있어요. 매장 저장만으로 승인 상태가 바뀌거나 재검토가 자동 요청되지는 않습니다.' : '승인을 기다리는 동안 매장 정보를 등록·수정할 수 있어요. 운영팀 승인 후 원단을 등록할 수 있습니다.'}</Notice>
    <div className="actions"><Link path={approved && seller.hasStore ? '/seller/register' : '/seller/store'} tone="primary">{approved && seller.hasStore ? '원단 직접 등록' : seller.hasStore ? '매장 정보 확인' : '매장 정보 등록'}</Link><Button onClick={retry}>승인 상태 다시 확인</Button><Link path="/seller/profile">마이페이지</Link></div>
  </section>;
}
function StoreSaved({ ctx, seller, store }) {
  const operation = ctx.drafts.get(SELLER_STORE_OPERATION_KEY), confirmed = operation?.status === 'CONFIRMED';
  return <section className="seller-page stack" data-figma-node="127:5927"><PageHeading title={confirmed ? '매장 정보를 저장했어요' : '현재 매장 정보'} description={confirmed ? '매장 / 픽업 정보' : '서버에서 조회한 정보예요.'} />
    {confirmed && <Notice>매장 정보 저장이 완료됐어요. 개인 닉네임·전화번호와 판매자 승인 상태는 변경하지 않았습니다.</Notice>}
    {store ? <section className="panel seller-panel"><h2>저장된 매장 / 픽업 정보</h2><StoreDetails store={store} /></section> : <Notice tone="warning">현재 등록된 매장 정보가 없어요. 매장 등록 화면에서 확인해 주세요.</Notice>}
    <Badge tone={approvalTone(seller.seller_approval_status)}>{SELLER_APPROVAL_LABELS[seller.seller_approval_status] || '상태 확인 필요'}</Badge>
    <div className="actions"><Link path="/seller/profile" tone="primary">마이페이지 확인</Link><Link path="/seller/dashboard">메인으로</Link>{store && seller.seller_approval_status === 'APPROVED' ? <Link path="/seller/register">새 원단 등록</Link> : <Link path={store ? '/seller/approval' : '/seller/store'}>{store ? '판매자 승인 상태 확인' : '매장 정보 등록'}</Link>}</div>
  </section>;
}
function StoreFields({ initial }) {
  return <>
    <Field label="매장명" name="store_name" defaultValue={initial.store_name} required maxLength={100} />
    <Field label="픽업 주소 / 상세 위치" name="address" defaultValue={initial.address} required maxLength={255} hint="방문할 주소와 동·호수 등 상세 위치를 함께 입력해 주세요. 총 255자까지 저장돼요." />
    <Field label="매장 연락처" name="phone_number" defaultValue={initial.phone_number} type="tel" required maxLength={20} />
    <Field label="휴무일" name="closed_days" defaultValue={initial.closed_days} maxLength={100} />
    <label className="field"><span>픽업 가능 요일 / 시간 및 안내</span><textarea name="pickup_guide" rows={3} maxLength={5000} defaultValue={initial.pickup_guide} /></label>
  </>;
}
function StoreForm({ ctx, seller, store, retry }) {
  const profile = ctx.path === '/seller/profile', form = useRef(null), errorRef = useRef(null);
  const [draft] = useState(() => ctx.drafts.get(SELLER_STORE_DRAFT_KEY) || sellerStoreDraft(store));
  const [operation, setOperation] = useState(() => ctx.drafts.get(SELLER_STORE_OPERATION_KEY) || null);
  const [serverChecked, setServerChecked] = useState(true);
  const mutation = useReservationMutation(ctx), message = sellerStoreFailure(mutation.failure);
  const uncertain = operation?.status === 'UNKNOWN';
  const persistOperation = value => { if (value) ctx.drafts.set(SELLER_STORE_OPERATION_KEY, value); else ctx.drafts.delete(SELLER_STORE_OPERATION_KEY); setOperation(value); };
  const remember = () => { const value = readSellerStoreForm(form.current); ctx.drafts.set(SELLER_STORE_DRAFT_KEY, value); return value; };
  const submit = event => {
    event.preventDefault(); if (uncertain || !event.currentTarget.reportValidity()) return;
    const value = remember();
    mutation.run(async ({ signal, isCurrent }) => {
      setServerChecked(false);
      const confirmed = await saveSellerStore(ctx.api, { existing: Boolean(store), draft: value, signal, isCurrent, onOperation: persistOperation });
      if (!confirmed || !isCurrent()) return;
      ctx.drafts.delete(SELLER_STORE_DRAFT_KEY);
      ctx.navigate('/seller/profile/saved');
    });
  };
  useEffect(() => { if (message) errorRef.current?.focus({ preventScroll: true }); }, [message]);
  const clearUncertain = () => { if (!serverChecked || mutation.busy) return; persistOperation(null); mutation.setError(''); };
  return <section className="seller-page stack" data-figma-node={profile ? '123:4699' : '127:5855'}>
    <PageHeading title={profile ? '마이페이지' : store ? '매장 / 픽업 정보' : '매장 정보를 입력해 주세요'} description={profile ? '계정 정보를 확인하고 매장 정보를 관리하세요.' : '구매자에게 표시할 픽업 장소와 연락처를 확인해 주세요.'} />
    {message && <Notice tone="error"><div ref={errorRef} tabIndex={-1}>{message}</div></Notice>}
    {uncertain && !mutation.busy && <section className="panel seller-panel" aria-label="매장 저장 결과 확인"><h2>서버 매장 정보 확인</h2><Notice tone="warning">{operation.message || '이전 저장 결과를 확인해야 해요. 입력 내용은 유지했습니다. 최신 서버 정보를 조회하고 확인한 뒤 계속해 주세요.'}</Notice>
      {serverChecked ? store ? <StoreDetails store={store} /> : <p>방금 조회한 서버에는 등록된 매장이 없어요. 이미 전송한 요청이 늦게 처리될 수 있으므로 자동으로 다시 등록하지 않습니다.</p> : <p>저장 요청 이후의 상태를 아직 조회하지 않았어요.</p>}
      <div className="actions"><Button onClick={retry}>서버 매장 다시 조회</Button><Button onClick={clearUncertain} disabled={!serverChecked || mutation.busy}>{store ? '서버 정보를 확인했어요 · 수정 계속' : '등록 여부를 확인했어요 · 작성 계속'}</Button></div>
    </section>}
    <form ref={form} id={profile ? 'seller-profile-form' : 'seller-store-form'} className="stack" onSubmit={submit} onInput={remember} onChange={remember}>
      <fieldset className="seller-live-fieldset stack" disabled={mutation.busy || uncertain}>
        <div className={profile ? 'seller-columns' : 'stack'}>
          {profile && <section className="panel seller-panel"><h2>계정 정보</h2><Field label="닉네임" name="personal_nickname" value={seller.nickname || ''} readOnly /><Field label="로그인 이메일 · 변경 불가" name="personal_email" value={seller.email || ''} readOnly /><Field label="개인 연락처" name="personal_phone" value={seller.phone_number || ''} type="tel" readOnly /><Notice>개인 닉네임·전화번호 수정은 아직 연결하지 않았어요. 아래 저장 버튼은 매장 정보만 저장합니다.</Notice><Badge tone={approvalTone(seller.seller_approval_status)}>{SELLER_APPROVAL_LABELS[seller.seller_approval_status] || '상태 확인 필요'}</Badge><Link path="/seller/approval">판매자 승인 상태 확인</Link></section>}
          <section className="panel seller-panel"><h2>{store ? '매장 / 픽업 정보' : '매장 정보 등록'}</h2><StoreFields initial={draft} /><Notice>매장 정보를 저장해도 판매자 승인 상태는 바뀌지 않아요. 휴무일과 픽업 안내를 비우면 기존 내용이 삭제됩니다.</Notice></section>
        </div>
        <div className="panel seller-profile-save"><p>매장 / 픽업 정보만 {store ? '수정' : '등록'}해요.</p><Button type="submit" tone="primary">{mutation.busy ? '저장 중' : store ? '매장 변경사항 저장' : '매장 정보 등록'}</Button></div>
      </fieldset>
    </form>
    <div className="actions"><Button onClick={retry} disabled={mutation.busy}>계정·매장 새로 조회</Button><Link path={profile ? '/seller/dashboard' : '/seller/profile'}>{profile ? '메인으로' : '마이페이지로 돌아가기'}</Link>{profile && <Button onClick={() => ctx.logout()} disabled={mutation.busy}>로그아웃</Button>}</div>
    <p className="muted">작성 중인 내용은 이 탭에서만 임시로 보관해요. 새로고침하면 저장하지 않은 입력은 사라집니다.</p>
  </section>;
}
function useStoreResource(api, profileOnly) {
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => startSellerStoreRead(api, profileOnly,
    data => setResult({ api, profileOnly, attempt, data, error: null }),
    error => setResult({ api, profileOnly, attempt, data: null, error })), [api, profileOnly, attempt]);
  const current = result?.api === api && result?.profileOnly === profileOnly && result?.attempt === attempt;
  return { loading: !current, data: current ? result.data : null, error: current ? result.error : null, retry };
}
export default function SellerLiveStore({ ctx }) {
  const resource = useStoreResource(ctx.api, ctx.path === '/seller/approval'), root = useRef(null);
  const operation = ctx.drafts.get(SELLER_STORE_OPERATION_KEY), confirmed = operation?.status === 'CONFIRMED';
  const baseTitle = ctx.path === '/seller/profile' ? '마이페이지' : ctx.path === '/seller/approval' ? '판매자 승인 상태' : '매장 / 픽업 정보';
  useEffect(() => {
    if (!resource.data) return;
    const heading = root.current?.querySelector('h1');
    if (heading) { document.title = `${heading.textContent} · 섬유 루프`; if (document.activeElement === document.body) heading.focus({ preventScroll: true }); }
  }, [resource.data]);
  let content;
  if (resource.loading || resource.error) content = <section className="seller-page stack"><PageHeading title={confirmed && ctx.path === '/seller/profile/saved' ? '매장 정보 저장은 완료됐어요' : baseTitle} />
    {confirmed && ctx.path === '/seller/profile/saved' && <Notice>저장 응답을 확인했어요. 같은 내용을 다시 보내지 않고 현재 계정·매장 정보를 확인하고 있습니다.</Notice>}
    {resource.loading ? <Notice role="status">계정과 매장 정보를 확인하고 있어요.</Notice> : <><Notice tone="error">{resource.error.message || '계정·매장 정보를 불러오지 못했어요.'}{confirmed && ctx.path === '/seller/profile/saved' ? ' 저장은 완료됐으며 조회만 다시 시도하면 됩니다.' : ' 등록 여부가 확인되지 않아 입력 폼을 열지 않았어요.'}</Notice><div className="actions"><Button onClick={resource.retry} tone="primary">현재 정보 다시 조회</Button><Link path="/seller/dashboard">메인으로</Link></div></>}
  </section>;
  else if (ctx.path === '/seller/approval') content = <Approval seller={resource.data.seller} retry={resource.retry} />;
  else if (ctx.path === '/seller/profile/saved') content = <StoreSaved ctx={ctx} {...resource.data} />;
  else content = <StoreForm ctx={ctx} {...resource.data} retry={resource.retry} />;
  return <div ref={root}>{content}</div>;
}
