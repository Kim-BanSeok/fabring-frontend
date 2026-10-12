import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Notice, PageHeading } from '../components/ui.jsx';
import useReservationMutation from '../hooks/useReservationMutation.js';
import { SELLER_APPROVAL_LABELS } from './seller/sellerStoreModel.js';
import { profileDraftKey, profileOperationKey, profileDraft, profileMatches, sameProfileAccount, profileReadFailure, startProfileRead, saveProfile } from './profile-model.js';

const Info = ({ rows }) => <dl className="buyer-info">{rows.map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>;
const profileRows = user => [['로그인 이메일', user.email], ['연락처', user.phone_number || '등록된 전화번호 없음'], ['닉네임', user.nickname]];
const approvalTone = value => value === 'APPROVED' ? 'green' : value === 'REJECTED' ? 'red' : 'amber';

export function ProfileAccountForm({ ctx, user }) {
  const draftKey = profileDraftKey(user), operationKey = profileOperationKey(user), seller = user.role === 'SELLER';
  const [values, setValues] = useState(() => ctx.drafts.get(draftKey) || profileDraft(user));
  const [operation, setOperation] = useState(() => ctx.drafts.get(operationKey) || null);
  const [reviewed, setReviewed] = useState(null);
  const failureRef = useRef(null), mutation = useReservationMutation(ctx);
  const uncertain = operation?.status === 'UNKNOWN', saved = operation?.status === 'CONFIRMED' && ctx.query.get('state') === 'SAVED';
  const persist = value => { if (value) ctx.drafts.set(operationKey, value); else ctx.drafts.delete(operationKey); setOperation(value); };
  const change = event => { const next = { ...values, [event.target.name]: event.target.value }; setValues(next); ctx.drafts.set(draftKey, next); if (operation?.status === 'CONFIRMED') persist(null); };
  const complete = () => { ctx.drafts.delete(draftKey); ctx.notify('회원 정보가 수정되었습니다.'); ctx.navigate(`/${seller ? 'seller' : 'buyer'}/profile?state=SAVED`); };
  const submit = event => {
    event.preventDefault(); if (uncertain || !event.currentTarget.reportValidity()) return;
    mutation.run(async ({ signal, isCurrent }) => {
      setReviewed(null);
      const result = await saveProfile(ctx.api, { user, draft: values, signal, isCurrent, onOperation: persist });
      if (result && isCurrent()) complete();
    });
  };
  const read = () => mutation.run(async ({ signal, isCurrent }) => {
    let result;
    try { result = await ctx.api.getMyProfile({ signal }); }
    catch (error) { throw profileReadFailure(error); }
    if (!isCurrent() || !sameProfileAccount(user, result)) return;
    if (profileMatches(result, operation.input)) { persist({ ...operation, status: 'CONFIRMED' }); complete(); }
    else setReviewed(result);
  });
  useEffect(() => { if (mutation.error) failureRef.current?.focus({ preventScroll: true }); }, [mutation.error]);
  return <form id={seller ? 'seller-personal-profile-form' : 'buyer-profile-form'} className={`panel ${seller ? 'seller-panel' : 'buyer-profile-form'}`} onSubmit={submit}>
    <h2 className={seller ? undefined : 'buyer-panel-heading'}>{seller ? '계정 정보' : '기본 정보'}</h2>
    {saved && <Notice tone="success">개인 닉네임과 연락처를 저장했어요.</Notice>}
    {mutation.error && <Notice tone="error"><div ref={failureRef} tabIndex={-1}>{mutation.error}</div></Notice>}
    {uncertain && !mutation.busy && <div className="stack" aria-label="회원 정보 저장 결과 확인"><Notice tone="warning">저장 결과를 아직 확인하지 못했어요. 입력 내용은 보관했으며, 현재 회원 정보를 확인한 뒤 계속할 수 있어요.</Notice>
      {reviewed && <><Info rows={profileRows(reviewed)} /><p className="muted">조회한 내용이 입력 내용과 달라요. 이전 요청이 늦게 반영될 수 있으므로 내용을 확인한 뒤 다시 저장해 주세요.</p></>}
      <div className="actions"><Button onClick={read} disabled={mutation.busy}>현재 회원 정보 다시 조회</Button>{reviewed && <Button onClick={() => { persist(null); mutation.setError(''); }} disabled={mutation.busy}>서버 정보를 확인했어요 · 수정 계속</Button>}</div>
    </div>}
    <fieldset className="seller-live-fieldset stack" disabled={mutation.busy || uncertain}>
      <Field label="로그인 이메일" name="personal_email" value={user.email} readOnly hint="로그인 이메일은 변경할 수 없습니다." />
      <Field label="닉네임" name="nickname" value={values.nickname} onChange={change} required minLength={1} maxLength={50} autoComplete="nickname" />
      <Field label={seller ? '개인 연락처 (선택)' : '전화번호 (선택)'} name="phone_number" id="field-personal-phone" value={values.phone_number} onChange={change} type="tel" maxLength={20} autoComplete="tel" hint="비우고 저장하면 등록된 연락처가 삭제됩니다." />
      {seller && <><Badge tone={approvalTone(user.seller_approval_status)}>{SELLER_APPROVAL_LABELS[user.seller_approval_status] || '상태 확인 필요'}</Badge><Button href="/seller/approval">판매자 승인 상태 확인</Button></>}
      <div className="actions"><Button type="submit" tone="primary">{mutation.busy ? '저장 중…' : seller ? '개인 정보 저장' : '저장하기'}</Button>{!seller && <Button href="/buyer/profile">취소</Button>}</div>
    </fieldset>
    {seller && <p className="muted">개인 정보와 매장 정보는 각각 저장해 주세요.</p>}
    <p className="muted">작성 중인 내용은 이 탭에서만 보관해요. 새로고침하면 저장하지 않은 입력은 사라집니다.</p>
  </form>;
}

function useProfileResource(ctx) {
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const api = ctx.api, revision = ctx.auth.revision;
  useEffect(() => startProfileRead(api, data => setResult({ api, revision, attempt, data }), error => setResult({ api, revision, attempt, error })), [api, revision, attempt]);
  const current = result?.api === api && result.revision === revision && result.attempt === attempt;
  return { loading: !current, data: current ? result.data : null, error: current ? result.error : null, retry };
}

export default function LiveProfilePage({ ctx }) {
  const resource = useProfileResource(ctx), root = useRef(null);
  const user = resource.data, editing = ctx.query.get('edit') === '1';
  const operation = user && ctx.drafts.get(profileOperationKey(user));
  const saved = !editing && ctx.query.get('state') === 'SAVED' && operation?.status === 'CONFIRMED';
  useEffect(() => {
    if (resource.loading) return;
    const heading = root.current?.querySelector('h1');
    if (heading) { document.title = `${heading.textContent} · 섬유 루프`; if (document.activeElement === document.body) heading.focus({ preventScroll: true }); }
  }, [resource.loading]);
  if (!user) return <div className="buyer-page" ref={root}><PageHeading title={editing ? '회원 정보 수정' : '마이페이지'} />{resource.loading ? <Notice role="status">회원 정보를 불러오고 있어요.</Notice> : <><Notice tone="error">{resource.error?.message || '회원 정보를 불러오지 못했어요.'}</Notice><Button onClick={resource.retry} tone="primary">회원 정보 다시 조회</Button></>}</div>;
  if (editing) return <div className="buyer-page" ref={root} data-figma-node="127:5385"><PageHeading title="회원 정보 수정" description="닉네임과 연락처를 수정할 수 있어요. 저장한 후 적용됩니다." /><ProfileAccountForm ctx={ctx} user={user} /></div>;
  if (saved) return <div className="buyer-page" ref={root} data-figma-node="127:5587"><div className="buyer-state-screen"><PageHeading title="회원 정보를 저장했어요" description="변경한 닉네임과 연락처가 반영되었습니다." /><Notice tone="success">저장 완료</Notice><section className="panel"><Info rows={profileRows(user)} /></section><div className="actions"><Button href="/buyer/profile" tone="primary">마이페이지로</Button></div></div></div>;
  return <div className="buyer-page" ref={root} data-figma-node="123:1964"><PageHeading title="마이페이지" description="내 정보와 이용 내역을 한곳에서 관리하세요." />
    {operation?.status === 'UNKNOWN' && <Notice tone="warning">이전 회원 정보 수정 결과를 확인해야 해요. 정보 수정에서 현재 저장 상태를 확인해 주세요.</Notice>}
    <section className="panel"><h2 className="buyer-panel-heading">회원 정보</h2><div className="buyer-profile-title"><h3>로그인 정보</h3><Button href="/buyer/profile?edit=1">정보 수정</Button></div><Info rows={profileRows(user)} /></section>
    <div className="buyer-two-columns"><section className="panel"><h3>구매 내역</h3><p className="buyer-muted">요청한 원단과 픽업 예약을 확인하세요.</p><Button href="/buyer/reservations">구매 내역 바로 가기 →</Button></section><section className="panel"><h3>문의 내역</h3><p className="buyer-muted">남긴 질문과 판매자의 답변을 확인하세요.</p><Button href="/buyer/inquiries">문의 내역 바로 가기 →</Button></section></div><div className="actions"><Button onClick={() => ctx.logout('BUYER')}>로그아웃</Button></div>
  </div>;
}
