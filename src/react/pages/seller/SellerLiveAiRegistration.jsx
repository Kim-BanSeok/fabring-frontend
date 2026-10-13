import RegistrationSteps from '../../components/RegistrationSteps.jsx';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Notice, PageHeading } from '../../components/ui.jsx';
import useReservationMutation from '../../hooks/useReservationMutation.js';
import { FabricDetails, FabricLink, LiveFabricForm, LiveFabricInfo, LocalPhotoGallery } from './SellerLiveFabricParts.jsx';
import { LIVE_UPLOAD_KEY, liveFabricDraftKey, validateLiveFabricDraft, uploadLiveFabricPhotos } from './sellerLiveFabricModel.js';
import { AI_ACTIVE_KEY, AI_FIELD_LABELS, aiDraftKey, aiPath, aiOptionLabel, aiMessageDisplay, aiFabricDraft, changeAiSaleType, aiSessionSnapshot, aiFailureMessage } from './sellerAiModel.js';
import SellerVoiceAnswer from './SellerVoiceAnswer.jsx';
import { primeMicrophone, unlockVoice } from './sellerVoice.js';
import useSellerAiSession from './useSellerAiSession.js';
import SellerAiBrief from './SellerAiBrief.jsx';
import './sellerAi.css';

export function AiProviderNotice() {
  const provider = import.meta.env.VITE_AI_PROVIDER;
  return <Notice>{provider === 'fake' ? '현재 연결된 개발 서버는 외부 AI 대신 규칙 기반 테스트 도우미를 사용해요. 답변 정리와 실제 원단 등록 흐름을 확인할 수 있어요.' : provider === 'openai' ? '입력과 사진을 AI가 상세설명으로 정리해요. 등록 전에 내용이 맞는지 직접 확인해 주세요.' : '입력한 내용과 사진은 서버의 등록 도우미가 정리해요. 이 환경의 외부 AI 연결 여부는 확인되지 않았어요.'} 폭, 길이, 소재 표현은 입력한 값을 유지해요.</Notice>;
}

function DraftSummary({ session }) {
  const raw = session?.ai_draft || {};
  const rows = Object.entries(AI_FIELD_LABELS).filter(([key]) => key !== (raw.sale_type === 'ROLL' ? 'length_cm' : 'remaining_length_cm') && (key !== 'defect_note' || raw.has_defect)).map(([key, label]) => {
    const value = raw[key];
    return [label, value == null ? '아직 확인하지 않음' : key.endsWith('_cm') ? `${value}cm` : key === 'price' ? `${value.toLocaleString('ko-KR')}원 / ${raw.sale_type === 'ROLL' ? '90cm(1마)' : raw.sale_type === 'SCRAP' ? '1장' : '판매 형태 확인 필요'}` : aiOptionLabel(key, String(value))];
  });
  return <section className="panel seller-panel"><h2>지금까지 정리된 항목</h2><FabricDetails rows={rows} />{raw.description && <section className="seller-listing-copy"><h3>원단 소개</h3><p>{raw.description}</p></section>}{session?.unconfirmed_fields.length > 0 && <Notice tone="warning">직접 확인할 항목: {session.unconfirmed_fields.map(key => AI_FIELD_LABELS[key] || key).join(', ')}</Notice>}</section>;
}

function AiSession({ ctx, id }) {
  const resource = useSellerAiSession(ctx, id), mutation = useReservationMutation(ctx);
  const { record, save } = resource, session = record.session;
  const [checkedMissing, setCheckedMissing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [hearing, setHearing] = useState('');
  const [speak, setSpeak] = useState(false);
  const questionRef = useRef(null), focusQuestion = useRef(false), chatRef = useRef(null);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    if (focusQuestion.current && questionRef.current) { focusQuestion.current = false; questionRef.current.focus(); }
  }, [session?.messages?.length, session?.next_question?.text]);
  const step = ctx.query.get('step') || 'chat';
  useEffect(() => {
    const heading = document.querySelector('#main-content h1');
    if (heading) { document.title = `${heading.textContent} · 패브링`; if (document.activeElement === document.body) heading.focus({ preventScroll: true }); }
  }, [session?.session_status, step, resource.error?.code]);
  const patch = values => save({ ...(ctx.drafts.get(aiDraftKey(id)) || {}), ...values });
  const currentRecord = () => ctx.drafts.get(aiDraftKey(id)) || {};
  const failure = mutation.failure || resource.error;
  const unknown = Boolean(record.operation && !record.operation.acknowledged);
  const blocked = mutation.busy || resource.loading || Boolean(resource.error) || unknown || record.needsRead;
  const draft = record.draft || aiFabricDraft(session);
  const draftRemember = value => patch({ draft: value });
  const directCopy = () => {
    const value = currentRecord().draft || aiFabricDraft(currentRecord().session);
    if (!['ROLL', 'SCRAP'].includes(value.sale_type)) { patch({ draft: value }); ctx.navigate(aiPath(id, 'edit')); return; }
    ctx.drafts.set(liveFabricDraftKey(value.sale_type), value); ctx.drafts.set('seller:live:last-type', value.sale_type);
    ctx.drafts.set('seller:live:ai:manual-note', { sessionId: id, answer: currentRecord().answer || '' });
    ctx.drafts.delete(AI_ACTIVE_KEY); ctx.navigate(`/seller/register/manual?type=${value.sale_type}&from=ai`);
  };
  const fetchCurrent = async signal => {
    const value = await ctx.api.getAiSession(id, { signal });
    return value;
  };
  const operationFailure = (error, isCurrent) => {
    if (!isCurrent()) return;
    if (error.outcomeUnknown || error.name === 'AbortError') return;
    patch({ operation: null, needsRead: ['AI_SESSION_CLOSED', 'NOT_FOUND', 'FORBIDDEN', 'SELLER_NOT_APPROVED', 'STORE_REQUIRED'].includes(error.code) });
  };
  const answer = input => {
    unlockVoice();
    primeMicrophone();
    return mutation.run(async ({ signal, isCurrent }) => {
    if (blocked || session?.session_status !== 'IN_PROGRESS') return;
    focusQuestion.current = true;
    patch({ operation: { kind: 'answer', snapshot: aiSessionSnapshot(session), input }, needsRead: false });
    let result;
    try { result = await ctx.api.answerAiSession(id, input, { signal }); }
    catch (error) { operationFailure(error, isCurrent); throw error; }
    if (!isCurrent()) return;
    setHearing('');
    patch({ session: { ...session, ...result }, operation: { kind: 'answer', acknowledged: true }, answer: '', needsRead: true, draft: null });
    const fresh = await fetchCurrent(signal);
    if (isCurrent()) resource.accept(fresh);
  });
  };
  const abort = () => mutation.run(async ({ signal, isCurrent }) => {
    if (resource.loading || resource.error?.code === 'FORBIDDEN') return;
    if (session?.session_status === 'ABORTED') { directCopy(); return; }
    if (session?.session_status === 'CONFIRMED') return;
    // Abort uses the backend's same session lock as confirmation. Do not copy
    // into direct registration until ABORTED is confirmed on the server.
    patch({ operation: { kind: 'abort' } });
    let result;
    try { result = await ctx.api.abortAiSession(id, { signal }); }
    catch (error) {
      if (!isCurrent()) return;
      if (error.code === 'AI_SESSION_CLOSED') {
        const fresh = await fetchCurrent(signal); if (isCurrent()) resource.accept(fresh); return;
      }
      operationFailure(error, isCurrent); throw error;
    }
    if (!isCurrent()) return;
    patch({ session: { ...session, ...result, next_question: null, is_complete: true }, operation: null, needsRead: false });
    directCopy();
  });
  const photosForConfirmed = async (fabricId, status, signal, isCurrent) => {
    const savedRecord = currentRecord(), localDraft = savedRecord.draft;
    const prior = ctx.drafts.get(LIVE_UPLOAD_KEY);
    if (prior?.fabric_id === fabricId) { ctx.navigate('/seller/upload'); return; }
    if (!localDraft?.photos?.length || savedRecord.photoJobCreated) { ctx.navigate(`/seller/fabrics/photos?id=${fabricId}`); return; }
    const job = { stage: 'PARTIAL', fabric_id: fabricId, status: status || 'PENDING', draft: localDraft, aiSessionId: id, photos: localDraft.photos.map(photo => ({ ...photo, status: 'PENDING' })) };
    ctx.drafts.set(LIVE_UPLOAD_KEY, job); patch({ photoJobCreated: true });
    await uploadLiveFabricPhotos(ctx.api, job, { signal, isCurrent, onChange: value => ctx.drafts.set(LIVE_UPLOAD_KEY, value) });
    if (isCurrent()) ctx.navigate('/seller/upload');
  };
  const resumePhotos = () => mutation.run(async ({ signal, isCurrent }) => {
    if (session?.session_status === 'CONFIRMED' && session.fabric_id) await photosForConfirmed(session.fabric_id, 'PENDING', signal, isCurrent);
  });
  const confirm = () => mutation.run(async ({ signal, isCurrent }) => {
    if (blocked || !reviewed || session?.session_status !== 'IN_PROGRESS') return;
    const message = validateLiveFabricDraft(draft, true); if (message) throw new Error(message);
    patch({ draft, confirmationAttempted: true, operation: { kind: 'confirm' } });
    let result;
    try { result = await ctx.api.confirmAiSession(id, draft, { signal }); }
    catch (error) { operationFailure(error, isCurrent); throw error; }
    if (!isCurrent()) return;
    patch({ session: { ...session, session_status: 'CONFIRMED', is_complete: true, next_question: null, fabric_id: result.id }, operation: null });
    ctx.drafts.delete(AI_ACTIVE_KEY);
    await photosForConfirmed(result.id, result.status, signal, isCurrent);
  });
  const toReview = value => {
    draftRemember(value); const message = validateLiveFabricDraft(value, true);
    if (message) { mutation.setError(message); return; }
    ctx.navigate(aiPath(id, 'review'));
  };
  const edit = () => { if (!record.draft) draftRemember(aiFabricDraft(session)); ctx.navigate(aiPath(id, 'edit')); };
  const feedback = <>{failure && <Notice tone="error">{aiFailureMessage(failure)}</Notice>}{resource.loading && <Notice role="status">현재 대화 상태를 조회하고 있어요.</Notice>}{(unknown || record.needsRead || resource.error) && !resource.loading && <Notice tone="warning"><div className="stack"><span>{unknown ? '이전 요청의 처리 결과를 확인하고 있어요. 대화가 그대로 보여도 서버에서 처리 중일 수 있어요. 상태가 확인될 때까지 같은 요청을 보내지 않아요.' : '대화 내용을 다시 조회한 뒤 계속해 주세요.'}</span><div className="actions"><Button onClick={resource.retry} disabled={mutation.busy}>대화 상태 다시 조회</Button>{unknown && session?.session_status === 'IN_PROGRESS' && <Button onClick={abort} disabled={mutation.busy}>대화를 중단하고 직접 입력으로</Button>}</div></div></Notice>}</>;

  if (!session) return <section className="seller-page stack"><PageHeading title="등록 대화 확인" />{feedback}<div className="actions"><FabricLink path={aiPath()}>새 대화 시작 화면</FabricLink><FabricLink path="/seller/fabrics">내 원단 목록</FabricLink></div></section>;
  if (session.session_status === 'CONFIRMED') return <section className="seller-page stack" data-figma-node="127:6713"><PageHeading title="원단 정보를 등록했어요" description={`등록 번호 #${session.fabric_id} · 운영팀 승인 후 구매자에게 게시돼요.`} />{feedback}<Notice>{mutation.busy ? '선택한 사진을 처리하고 있어요. 원단 정보는 이미 저장되어 다시 등록하지 않습니다.' : '등록된 원단과 사진 상태를 확인해 주세요. 원단 정보를 다시 등록하지 않습니다.'}</Notice><div className="actions"><Button tone="primary" onClick={resumePhotos} disabled={mutation.busy || resource.loading || Boolean(resource.error)}>사진 처리 계속 · 등록 사진 확인</Button><FabricLink path={`/seller/fabrics/detail?id=${session.fabric_id}`}>등록된 원단 확인</FabricLink><FabricLink path="/seller/fabrics">내 원단 목록</FabricLink><FabricLink path={aiPath()}>다른 원단 등록</FabricLink></div></section>;
  if (resource.error?.code === 'FORBIDDEN') return <section className="seller-page stack"><PageHeading title="현재 계정의 대화를 열어 주세요" />{feedback}<FabricLink path={aiPath()}>새 대화 시작 화면</FabricLink></section>;
  if (resource.error?.code === 'NOT_FOUND') return <section className="seller-page stack"><PageHeading title="서버에 대화가 남아 있지 않아요" />{feedback}<DraftSummary session={session} />{record.confirmationAttempted && <section className="panel seller-panel"><p>등록 요청을 보냈던 대화예요. 먼저 내 원단 목록에서 같은 원단이 저장되었는지 확인해 주세요. 등록되어 있다면 해당 원단의 사진 관리에서 이어가세요.</p><FabricLink path="/seller/fabrics">내 원단 목록 확인</FabricLink><label className="seller-defect"><input type="checkbox" checked={checkedMissing} onChange={event => setCheckedMissing(event.target.checked)} /> 내 원단 목록에서 등록되지 않았음을 확인했어요.</label></section>}<div className="actions"><Button onClick={directCopy} disabled={record.confirmationAttempted && !checkedMissing}>남아 있는 내용으로 직접 입력</Button><FabricLink path={aiPath()}>새 대화 시작 화면</FabricLink></div></section>;
  if (session.session_status === 'ABORTED' && step !== 'edit') return <section className="seller-page stack"><PageHeading title="대화를 중단했어요" description="원단은 이 대화로 등록하지 않았어요. 남은 내용을 직접 입력에서 보완할 수 있어요." />{feedback}<DraftSummary session={session} /><div className="actions"><Button onClick={directCopy} disabled={resource.loading || Boolean(resource.error)} tone="primary">작성한 내용으로 직접 입력</Button><FabricLink path={aiPath()}>새 대화 시작 화면</FabricLink></div></section>;
  if (step === 'photos') return <section className="seller-page stack" data-figma-node="127:6637"><PageHeading title="선택한 사진을 확인해 주세요" description={`사진 ${draft.photos.length}장 선택 · 아직 업로드 전`} />{feedback}<section className="panel seller-panel"><LocalPhotoGallery photos={draft.photos} /><div className="actions"><Button onClick={() => toReview(draft)} disabled={blocked} tone="primary">등록 내용 확인</Button><FabricLink path={aiPath(id, 'edit')}>입력하던 곳으로 돌아가기</FabricLink></div></section></section>;
  if (step === 'review') return <section className="seller-page stack" data-figma-node={draft.sale_type === 'SCRAP' ? '127:6325' : '123:4153'}><PageHeading title="AI 초안 · 등록 내용 확인" description="내용과 사진을 확인한 뒤 승인 신청을 보내 주세요. 대화 종료만으로는 등록되지 않아요." />{feedback}<RegistrationSteps mode="AI" stage={3} /><div className="seller-review"><section className="panel seller-panel"><h2>선택한 사진 {draft.photos.length}장</h2><LocalPhotoGallery photos={draft.photos} /></section><section className="panel seller-panel"><Badge tone="gray">승인 신청 전</Badge><h2>{draft.title || '원단 이름 미입력'}</h2><LiveFabricInfo fabric={draft} /><label className="seller-defect"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} disabled={blocked} /> 치수·가격·소재·하자 여부가 실제 원단과 맞는지 확인했어요.</label><div className="actions"><Button onClick={confirm} disabled={blocked || !reviewed} tone="primary">{mutation.busy ? '승인 신청 중' : '확인 후 승인 신청'}</Button><FabricLink path={aiPath(id, 'edit')}>내용 수정</FabricLink></div></section></div></section>;
  if (step === 'edit') return <section className="seller-page stack" data-figma-node={draft.sale_type === 'SCRAP' ? '127:6196' : '123:3466'}><PageHeading title="정리된 내용을 확인·수정해 주세요" description="정확하지 않거나 비어 있는 항목을 보완하고 사진을 첨부해 주세요." />{feedback}{session.unconfirmed_fields.length > 0 && <Notice tone="warning">대화에서 확인하지 못한 항목: {session.unconfirmed_fields.map(key => AI_FIELD_LABELS[key] || key).join(', ')}. 아래 내용을 직접 확인해 주세요.</Notice>}<RegistrationSteps mode="AI" stage={2} /><nav className="tabs seller-tabs" aria-label="판매 형태">{['ROLL', 'SCRAP'].map(type => <Button key={type} className={draft.sale_type === type ? 'seller-tab--active' : ''} aria-pressed={draft.sale_type === type} disabled={blocked} onClick={() => draftRemember(changeAiSaleType(draft, type))}>{aiOptionLabel('sale_type', type)}</Button>)}</nav>{['ROLL', 'SCRAP'].includes(draft.sale_type) ? <LiveFabricForm key={draft.sale_type} ctx={ctx} initial={draft} onRemember={draftRemember} onSubmit={session.session_status === 'ABORTED' ? value => { draftRemember(value); directCopy(); } : toReview} busy={blocked} photosPath={aiPath(id, 'photos')} onReviewPhotos={value => { draftRemember(value); ctx.navigate(aiPath(id, 'photos')); }} backPath={aiPath(id)} submitLabel={session.session_status === 'ABORTED' ? '직접 입력에서 계속' : '등록 내용 확인'} /> : <Notice>판매 형태를 먼저 선택해 주세요. 다른 항목과 사진은 유지돼요.</Notice>}</section>;

  const question = session.next_question;
  const listing = question?.field === 'listing';
  return <section className="seller-page stack" data-figma-node="123:3842"><PageHeading title="원단 등록 · AI가 상세 정보를 써 줘요" description="원단을 짧게 적으면 AI가 이름, 치수, 소재, 소개글을 채워요. 맞지 않는 항목은 확인 화면에서 고치면 돼요." /><RegistrationSteps mode="AI" /><AiProviderNotice />{feedback}<div className="seller-ai-layout"><div className="stack"><section className="panel seller-panel"><h2>원단 등록 도우미</h2><div ref={chatRef} className="seller-chat seller-live-ai-chat" role="log" aria-label="등록 대화" tabIndex={0}>{session.messages?.map((message, index) => <div key={`${index}-${message.created_at}`} className={message.role === 'user' ? 'seller-chat-user' : 'notice notice--info'}><small className="muted">{message.role === 'user' ? '내 설명' : '등록 도우미'}</small><p>{aiMessageDisplay(message)}</p></div>)}</div>{!session.messages?.length && <p className="muted">안내를 다시 불러오는 중이에요.</p>}</section>
      {question ? <section className="panel seller-panel" ref={questionRef} tabIndex={-1}>{listing ? <form className="stack" onSubmit={event => { event.preventDefault(); if (record.answer?.trim()) answer({ answer: record.answer.trim() }); }}><label className="field"><span>어떤 원단인가요?</span><textarea rows={5} maxLength={1000} value={record.answer || ''} onChange={event => patch({ answer: event.target.value })} disabled={blocked} placeholder="예: 네이비 면 자투리, 가로 50 세로 70, 얇고 하자가 없어요. 한 장에 7천원." /></label><Button type="submit" tone="primary" disabled={blocked || !record.answer?.trim()}>{mutation.busy ? '상세 정보를 쓰는 중' : '상세 정보 작성'}</Button></form> : <><SellerVoiceAnswer questionText={question.text} paused={blocked} onSpoken={text => answer({ answer: text })} onHearing={setHearing} />{hearing && <p className="seller-chat-user">{hearing}</p>}{question.options?.length > 0 && <div className="actions">{question.options.map(option => <Button key={option} onClick={() => answer({ selected: option })} disabled={blocked}>{aiOptionLabel(question.field, option)}</Button>)}</div>}<details className="seller-voice-type"><summary>글로 답하기</summary><form className="stack" onSubmit={event => { event.preventDefault(); if (record.answer?.trim()) answer({ answer: record.answer.trim() }); }}><label className="field"><span>질문에 대한 답변</span><textarea rows={3} maxLength={1000} value={record.answer || ''} onChange={event => patch({ answer: event.target.value })} disabled={blocked} placeholder="모르면 ‘모름’이라고 적어도 돼요." /></label><Button type="submit" tone="primary" disabled={blocked || !record.answer?.trim()}>{mutation.busy ? '답변 처리 중' : '답변 보내기'}</Button></form></details></>}{listing && <details className="seller-voice-type" onToggle={event => setSpeak(event.currentTarget.open)}><summary>말로 설명하기</summary>{speak && <><SellerVoiceAnswer questionText={question.text} paused={blocked} onSpoken={text => answer({ answer: text })} onHearing={setHearing} />{hearing && <p className="seller-chat-user">{hearing}</p>}</>}</details>}<Button onClick={() => answer({ finish: true })} disabled={blocked}>설명 없이 직접 입력</Button></section> : <section className="panel seller-panel"><h2 ref={questionRef} tabIndex={-1}>초안을 확인해 주세요</h2><p>적은 내용으로 상세 정보를 정리했어요. 비어 있거나 다른 항목을 고치고 사진을 추가해 주세요.</p><Button tone="primary" onClick={edit} disabled={blocked}>내용 수정 · 사진 추가</Button></section>}
      <div className="actions"><Button onClick={abort} disabled={mutation.busy || resource.loading || Boolean(resource.error)}>대화를 중단하고 직접 입력으로</Button><FabricLink path="/seller/register">등록 방식으로</FabricLink></div><p className="muted">대화는 서버 재시작 또는 24시간 미사용 시 사라질 수 있어요. 사진과 수정 내용은 새로고침하면 다시 입력해야 해요.</p></div><DraftSummary session={session} /></div></section>;
}

export default function SellerLiveAiRegistration({ ctx }) {
  const id = ctx.query.get('session');
  return id ? <AiSession key={id} ctx={ctx} id={id} /> : <SellerAiBrief ctx={ctx} />;
}
