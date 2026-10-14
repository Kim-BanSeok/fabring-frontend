import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, EmptyState, Notice, PageHeading } from '../components/ui.jsx';
import useReservationMutation from '../hooks/useReservationMutation.js';
import './inquiry.css';
import { formatDate, formatDateTime } from '../lib/format.js';
import { INQUIRY_RECEIPT_KEY, inquiryAnswerKey, inquiryCreateKey, inquiryFailure, inquiryFlowPath, inquiryPageQuery, inquiryPath, inquiryReturnPath, reconcileInquiryAnswer, rememberInquiryTarget, sellerInquiryPath, sendInquiry, sendInquiryAnswer, startInquiryRead } from './inquiry-model.js';

const Link = ({ path, children, ...props }) => <Button href={path} {...props}>{children}</Button>;
const BuyerPage = ({ children }) => <div className="buyer-page" data-figma-node="123:2068">{children}</div>;
const SellerPage = ({ children }) => <section className="seller-page stack live-inquiry-page" data-figma-node="123:4559">{children}</section>;
let inquiryReadId = 0;

function useInquiryResource(api, request) {
  const key = request ? JSON.stringify(request) : '';
  const [attempt, setAttempt] = useState(0), [result, setResult] = useState(null);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!key) return undefined;
    const identity = { api, key, attempt, readId: ++inquiryReadId };
    return startInquiryRead(api, JSON.parse(key),
      data => setResult({ ...identity, data, error: null }),
      error => setResult({ ...identity, data: null, error }));
  }, [api, key, attempt]);
  const current = result?.api === api && result.key === key && result.attempt === attempt;
  return { loading: Boolean(key) && !current, data: current ? result.data : null, error: current ? result.error : null, retry, attempt, readId: current ? result.readId : null };
}

function InquiryError({ failure, answering = false }) {
  const ref = useRef(null), message = inquiryFailure(failure, answering);
  useEffect(() => { if (message) ref.current?.focus({ preventScroll: true }); }, [message]);
  return message ? <Notice tone="error"><div ref={ref} tabIndex={-1}>{message}</div></Notice> : null;
}

function ReadFeedback({ resource }) {
  if (resource.loading) return <section className="panel" role="status" aria-live="polite"><p>문의를 불러오는 중이에요…</p></section>;
  if (!resource.error) return null;
  return <section className="panel stack"><InquiryError failure={resource.error} /><div className="actions"><Button onClick={resource.retry}>다시 불러오기</Button></div></section>;
}

function Pagination({ page, path }) {
  if (!page || page.totalPages <= 1 && page.page === 0) return null;
  return <nav className="buyer-pagination" aria-label="문의 목록 페이지"><Link path={path(Math.max(0, page.page - 1))} disabled={page.page <= 0}>이전 페이지</Link><p aria-live="polite">{page.page >= page.totalPages ? '선택한 페이지에 문의가 없어요' : `${page.page + 1} / ${page.totalPages} 페이지`}</p><Link path={path(page.page + 1)} disabled={page.page + 1 >= page.totalPages}>다음 페이지</Link>{page.page >= page.totalPages && <Link path={path(0)}>첫 페이지로</Link>}</nav>;
}

function InquiryContent({ item }) {
  return <>
    <div className="actions"><Badge tone={item.status === 'ANSWERED' ? 'green' : 'amber'}>{item.status === 'ANSWERED' ? '답변 완료' : '답변 대기'}</Badge>{item.is_private && <Badge tone="gray">비공개</Badge>}</div>
    <section className="stack"><h3>문의 내용</h3><p className="buyer-small buyer-muted">{item.buyer_nickname || '탈퇴한 사용자'} · {formatDateTime(item.created_at)}</p><p className="buyer-message">{item.content}</p></section>
    {item.answer != null ? <section className="stack"><h3>판매자 답변</h3><p className="buyer-small buyer-muted">{formatDateTime(item.answered_at)}</p><p className="buyer-message">{item.answer}</p></section> : <Notice>{item.status === 'ANSWERED' && item.is_private ? '비공개 답변은 작성자·판매자·운영팀만 확인할 수 있어요.' : '판매자의 답변을 기다리고 있어요.'}</Notice>}
  </>;
}

function InquiryReturn({ ctx }) {
  const path = inquiryReturnPath(ctx.query.get('from'));
  return path ? <Link path={path}>문의 전 화면으로 돌아가기</Link> : null;
}

function BuyerInquiryIndex({ ctx }) {
  const query = inquiryPageQuery(ctx.query, true), status = query.status || 'ALL';
  const resource = useInquiryResource(ctx.api, { kind: 'buyer', query });
  const page = resource.data, items = page?.items || [];
  const pathFor = (nextStatus, pageIndex = 0) => {
    const params = new URLSearchParams();
    if (nextStatus && nextStatus !== 'ALL') params.set('status', nextStatus);
    if (pageIndex) params.set('page', String(pageIndex));
    const search = params.toString();
    return `/buyer/inquiries${search ? `?${search}` : ''}`;
  };
  return <BuyerPage><PageHeading title="문의 내역" description="내가 남긴 질문과 판매자의 답변을 확인하세요." />
    <nav className="tabs" aria-label="문의 답변 상태">{[['WAITING', '답변 대기'], ['ANSWERED', '답변 완료'], ['ALL', '전체']].map(([value, label]) => <Link key={value} path={pathFor(value)} className={status === value ? 'is-active' : ''} aria-current={status === value ? 'page' : undefined}>{label}</Link>)}</nav>
    <div><Button onClick={resource.retry} disabled={resource.loading}>새로 조회</Button></div>
    <ReadFeedback resource={resource} />
    {page && <section className="panel stack"><h2 className="buyer-panel-heading">내 문의 · {page.totalElements}건</h2>
      {items.length ? items.map(item => <article className="record-card stack" key={item.id}><div className="actions"><Badge tone={item.status === 'ANSWERED' ? 'green' : 'amber'}>{item.status === 'ANSWERED' ? '답변 완료' : '답변 대기'}</Badge></div><h3>{item.fabric_title}</h3><p className="buyer-small buyer-muted">{formatDateTime(item.created_at)}</p><p className="buyer-message">{item.content}</p>{item.answer && <p className="buyer-message">{item.answer}</p>}<Link path={inquiryPath(item.fabric_id)}>이 원단 문의 보기</Link></article>) : <EmptyState title={page.page > 0 ? '이 페이지에 문의가 없어요' : '남긴 문의가 없어요'} description="원단 상세에서 판매자에게 질문할 수 있어요." />}
      <Pagination page={page} path={index => pathFor(status, index)} />
    </section>}
    <div className="actions"><Link path="/buyer/fabrics" tone="primary">원단 둘러보기</Link></div>
  </BuyerPage>;
}

function BuyerUnknownInquiry({ ctx, fabric, record, resource }) {
  const [checked, setChecked] = useState(false);
  if (record?.operation?.status !== 'UNKNOWN') return null;
  return <section className="panel stack"><h2 className="buyer-panel-heading">이전 문의의 등록 결과를 확인해 주세요</h2><Notice tone="warning">연결이 끊겨도 문의는 등록되었을 수 있어요. 아래 목록에서 내용과 작성 시각을 확인해 주세요. 방금 보낸 요청은 목록에 늦게 나타날 수 있으니 먼저 새로 조회해 주세요.</Notice>
    <p className="buyer-message">{record.operation.input.content}</p><Button onClick={resource.retry} disabled={resource.loading}>문의 목록 새로 조회</Button>
    {resource.data && <><label className="check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /> 같은 문의가 이미 등록됐는지 확인했어요. 다시 보내면 중복 문의가 생길 수 있음을 이해해요.</label><div><Button disabled={!checked} onClick={() => { ctx.drafts.set(inquiryCreateKey(fabric.id), { ...record, operation: null }); ctx.navigate(inquiryFlowPath(ctx, fabric.id, { compose: 1 })); }}>확인했어요 · 작성 계속</Button></div></>}
  </section>;
}

function BuyerFabricInquiries({ ctx, fabric }) {
  const query = inquiryPageQuery(ctx.query), resource = useInquiryResource(ctx.api, { kind: 'fabric', id: fabric.id, query });
  const page = resource.data, items = page?.items || [];
  const record = ctx.drafts.get(inquiryCreateKey(fabric.id));
  const received = ctx.query.get('state') === 'DONE' && record?.operation?.status === 'CONFIRMED' && record.operation.id === ctx.query.get('id');
  return <BuyerPage><PageHeading title={received ? '문의를 등록했어요' : '원단 문의·답변'} description={fabric.title} />
    {received && <Notice tone="success">등록이 완료됐어요. 판매자의 답변은 이 원단의 문의 목록에서 확인할 수 있습니다.</Notice>}
    <Notice>이 원단에 등록된 문의 목록입니다. 비공개 문의의 내용과 답변은 작성자·판매자·운영팀만 확인할 수 있어요.</Notice>
    <div className="actions"><Link path={inquiryFlowPath(ctx, fabric.id, { compose: 1 })} tone="primary">새 문의 작성</Link><Button onClick={resource.retry} disabled={resource.loading}>새로 조회</Button><Link path={`/buyer/fabrics/${encodeURIComponent(fabric.id)}`}>원단 상세로</Link><InquiryReturn ctx={ctx} /></div>
    <BuyerUnknownInquiry key={`${fabric.id}:${resource.attempt}`} ctx={ctx} fabric={fabric} record={record} resource={resource} />
    <ReadFeedback resource={resource} />
    {page && <><p className="buyer-result-count" aria-live="polite">전체 문의 {page.totalElements}건</p>{items.length ? items.map(item => <article key={item.id} className="panel buyer-inquiry-item stack" aria-label={`문의 ${item.id}`}><InquiryContent item={item} /></article>) : <EmptyState title={page.page > 0 ? '이 페이지에 문의가 없어요' : '등록된 문의가 없어요'} description={page.page > 0 ? '첫 페이지에서 다시 확인해 주세요.' : '원단에 궁금한 점이 있다면 판매자에게 질문해 주세요.'} />}
      <Pagination page={page} path={index => inquiryFlowPath(ctx, fabric.id, { page: index })} />
    </>}
  </BuyerPage>;
}

function BuyerInquiryForm({ ctx, fabric }) {
  const key = inquiryCreateKey(fabric.id);
  const [record, setRecord] = useState(() => ctx.drafts.get(key) || { input: { content: '', is_private: false }, operation: null });
  const mutation = useReservationMutation(ctx), uncertain = record.operation?.status === 'UNKNOWN';
  const input = record.input;
  const remember = value => { ctx.drafts.set(key, value); setRecord(value); };
  const rememberOperation = operation => remember({ input, operation });
  const submit = event => {
    event.preventDefault();
    if (uncertain || !event.currentTarget.reportValidity()) return;
    if (!input.content.trim()) { mutation.setError('문의 내용을 입력해 주세요.'); return; }
    void mutation.run(async ({ signal, isCurrent }) => {
      rememberInquiryTarget(ctx.drafts, fabric);
      const result = await sendInquiry(ctx.api, fabric, { content: input.content.trim(), is_private: input.is_private }, { signal, isCurrent, remember: rememberOperation });
      if (!result || !isCurrent()) return;
      ctx.drafts.set(key, { input: { content: '', is_private: false }, operation: { status: 'CONFIRMED', id: result.id } });
      ctx.navigate(inquiryFlowPath(ctx, fabric.id, { state: 'DONE', id: result.id }), { replace: true });
    });
  };
  return <BuyerPage><PageHeading title="판매자 문의" description={`${fabric.title}에 대해 궁금한 점을 남겨 주세요.`} />
    <section className="panel"><h2 className="buyer-panel-heading">문의 대상</h2><dl className="buyer-info"><dt>원단</dt><dd>{fabric.title}</dd><dt>판매처</dt><dd>{fabric.store_name}</dd></dl></section>
    <InquiryError failure={mutation.failure} />
    {uncertain && !mutation.busy && <Notice tone="warning"><strong>등록 결과를 먼저 확인해 주세요.</strong><p>입력한 내용은 보관했어요. 같은 문의를 중복해서 보내지 않도록 원단의 문의 목록을 확인해 주세요.</p><Link path={inquiryFlowPath(ctx, fabric.id)} tone="primary">문의 목록에서 확인</Link></Notice>}
    <form className="panel buyer-inquiry-form stack" onSubmit={submit}><h2 className="buyer-panel-heading">문의 작성</h2>
      <fieldset className="seller-live-fieldset stack" disabled={mutation.busy || uncertain}>
        <div className="field"><label htmlFor="live-inquiry-content">문의 내용 (1~1,000자)</label><textarea id="live-inquiry-content" rows={5} required minLength={1} maxLength={1000} value={input.content} onChange={event => remember({ ...record, input: { ...input, content: event.target.value } })} aria-describedby="live-inquiry-visibility" /></div>
        <label className="check"><input type="checkbox" checked={input.is_private} onChange={event => remember({ ...record, input: { ...input, is_private: event.target.checked } })} /> 비공개 문의로 작성</label>
        <Notice id="live-inquiry-visibility" tone={input.is_private ? 'info' : 'warning'}>{input.is_private ? '내용과 답변은 작성자·해당 판매자·운영팀만 볼 수 있어요. 닉네임·작성 시각·답변 상태는 다른 사용자에게도 표시됩니다.' : '다른 사용자도 읽을 수 있는 공개 문의입니다. 개인 연락처나 주소는 적지 마세요.'}</Notice>
        <Notice>등록한 문의는 현재 수정·삭제할 수 없어요. 보내기 전에 내용과 공개 여부를 확인해 주세요.</Notice>
        <div className="actions"><Link path={inquiryFlowPath(ctx, fabric.id)}>문의 목록으로</Link><InquiryReturn ctx={ctx} /><Button type="submit" tone="primary">{mutation.busy ? '문의 보내는 중…' : '문의 등록'}</Button></div>
      </fieldset>
    </form><p className="buyer-small buyer-muted">작성 중인 내용은 이 탭에서만 임시로 보관해요. 새로고침·로그아웃하면 저장하지 않은 입력은 사라집니다.</p>
  </BuyerPage>;
}

function BuyerInquiryForFabric({ ctx, id }) {
  const resource = useInquiryResource(ctx.api, { kind: 'detail', id });
  useEffect(() => {
    if (resource.loading) return;
    const heading = document.querySelector('#main-content h1');
    if (!heading) return;
    document.title = `${heading.textContent} · 패브링`;
    // The loading heading was removed. Restore focus only if the reader has
    // not moved to a field or another control while the request was pending.
    if (document.activeElement === document.body) heading.focus({ preventScroll: true });
  }, [resource.loading]);
  if (!resource.data) return <BuyerPage><PageHeading title="원단 문의" /><ReadFeedback resource={resource} /><Link path="/buyer/fabrics">원단 목록으로</Link><InquiryReturn ctx={ctx} /></BuyerPage>;
  return ctx.query.get('compose') === '1' ? <BuyerInquiryForm key={resource.data.id} ctx={ctx} fabric={resource.data} /> : <BuyerFabricInquiries key={resource.data.id} ctx={ctx} fabric={resource.data} />;
}

export function BuyerLiveInquiries({ ctx }) {
  const id = ctx.query.get('fabric_id');
  return id ? <BuyerInquiryForFabric key={id} ctx={ctx} id={id} /> : <BuyerInquiryIndex ctx={ctx} />;
}

function SellerAnswerForm({ ctx, item, retry, readId }) {
  const key = inquiryAnswerKey(item.id);
  const [record, setRecord] = useState(() => ctx.drafts.get(key) || { answer: item.answer || '', operation: null });
  const mutation = useReservationMutation(ctx);
  const operation = reconcileInquiryAnswer(record.operation, item), uncertain = operation?.status === 'UNKNOWN';
  const checkedAfterWrite = uncertain && readId !== operation.readId;
  const [checked, setChecked] = useState(false);
  const remember = value => { ctx.drafts.set(key, value); setRecord(value); };
  const submit = event => {
    event.preventDefault();
    if (uncertain || !event.currentTarget.reportValidity()) return;
    const answer = record.answer.trim();
    if (!answer) { mutation.setError('답변 내용을 입력해 주세요.'); return; }
    void mutation.run(async ({ signal, isCurrent }) => {
      const result = await sendInquiryAnswer(ctx.api, item, answer, { signal, isCurrent, remember: next => remember({ ...record, operation: next ? { ...next, readId } : null }) });
      if (!result || !isCurrent()) return;
      ctx.drafts.delete(key);
      ctx.drafts.set(INQUIRY_RECEIPT_KEY, { id: result.id, item, answer });
      ctx.navigate(`/seller/inquiries/answered?id=${encodeURIComponent(result.id)}`);
    });
  };
  return <div className="stack"><InquiryError failure={mutation.failure} answering />
    {operation?.status === 'OBSERVED' && <Notice tone="success">현재 서버에 같은 답변이 저장되어 있음을 확인했어요.</Notice>}
    {uncertain && !mutation.busy && <section className="stack"><Notice tone="warning">이전 답변의 저장 결과를 확인하지 못했어요. 현재 문의를 다시 조회하고 위에 표시된 답변과 작성 중인 답변을 비교해 주세요. 이전 요청이 뒤늦게 처리될 수도 있어요.</Notice><Button onClick={retry}>현재 문의 다시 조회</Button>{checkedAfterWrite && <><label className="check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /> 현재 저장된 답변을 확인했으며, 다시 저장하면 답변이 덮어써질 수 있음을 이해해요.</label><Button disabled={!checked} onClick={() => { remember({ ...record, operation: null }); mutation.setError(''); }}>확인했어요 · 답변 작성 계속</Button></>}</section>}
    <form className="stack" onSubmit={submit}><fieldset className="seller-live-fieldset stack" disabled={mutation.busy || uncertain}><label className="field"><span>{item.status === 'ANSWERED' ? '답변 수정' : '답변 작성'} (1~1,000자)</span><textarea rows={4} required maxLength={1000} value={record.answer} onChange={event => remember({ answer: event.target.value, operation })} placeholder="구매자에게 답변을 남겨 주세요." /></label>
      {item.status === 'ANSWERED' && <p className="muted">저장하면 기존 답변과 답변 시각이 변경됩니다.</p>}
      <Button type="submit" tone="primary">{mutation.busy ? '답변 저장 중…' : item.status === 'ANSWERED' ? '답변 수정 저장' : '답변 등록'}</Button></fieldset></form>
    <p className="muted">작성 중인 답변은 이 탭에서만 보관해요. 새로고침·로그아웃하면 저장하지 않은 입력은 사라집니다.</p>
  </div>;
}

function SellerAnswerReceipt({ ctx }) {
  const receipt = ctx.drafts.get(INQUIRY_RECEIPT_KEY), confirmed = receipt?.id === ctx.query.get('id');
  if (!confirmed) return <SellerPage><PageHeading title="문의 답변 확인" /><Notice>최신 답변은 받은 문의 목록에서 조회해 주세요.</Notice><Link path={sellerInquiryPath({ status: 'ANSWERED' })} tone="primary">답변 완료 문의 보기</Link></SellerPage>;
  return <SellerPage><PageHeading title="답변을 등록했어요" description="구매자가 해당 원단의 문의 목록에서 답변을 확인할 수 있어요." /><Notice tone="success">서버에서 답변 저장을 확인했어요.</Notice><section className="panel seller-panel stack"><h2>{receipt.item.fabric_title}</h2><h3>문의 내용</h3><p className="buyer-message">{receipt.item.content}</p><h3>등록한 답변</h3><p className="buyer-message">{receipt.answer}</p></section><div className="actions"><Link path={sellerInquiryPath({ status: 'ANSWERED' })}>답변 완료 문의 보기</Link><Link path="/seller/inquiries" tone="primary">다른 문의 확인</Link></div></SellerPage>;
}

function SellerInquiryList({ ctx }) {
  const query = inquiryPageQuery(ctx.query, true), status = query.status || 'ALL';
  const resource = useInquiryResource(ctx.api, { kind: 'seller', query });
  const page = resource.data, items = page?.items || [], selectedId = ctx.query.get('id');
  const selected = selectedId ? items.find(item => item.id === selectedId) : items[0];
  return <SellerPage><PageHeading title="문의 내역" description="구매자의 문의와 답변 내용을 확인하세요." />
    <nav className="tabs" aria-label="문의 답변 상태">{[['WAITING', '답변 대기'], ['ANSWERED', '답변 완료'], ['ALL', '전체']].map(([value, label]) => <Link key={value} path={sellerInquiryPath({ status: value })} className={status === value ? 'is-active' : ''} aria-current={status === value ? 'page' : undefined}>{label}</Link>)}</nav>
    <div><Button onClick={resource.retry} disabled={resource.loading}>새로 조회</Button></div><ReadFeedback resource={resource} />
    {page && <div className="seller-inquiries"><section className="panel seller-panel"><h2>문의 목록 · {page.totalElements}건</h2>{items.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th scope="col">일자</th><th scope="col">원단</th><th scope="col">상태</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{formatDate(item.created_at)}</td><td><a href={`#${sellerInquiryPath({ status, page: page.page, id: item.id })}`} aria-current={selected?.id === item.id ? 'true' : undefined}>{item.fabric_title}</a>{item.is_private && <span className="muted"> · 비공개</span>}</td><td><Badge tone={item.status === 'ANSWERED' ? 'green' : 'amber'}>{item.status === 'ANSWERED' ? '답변 완료' : '답변 대기'}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title={page.page > 0 ? '이 페이지에 문의가 없어요' : '문의가 없어요'} description={page.page > 0 ? '첫 페이지에서 다시 확인해 주세요.' : '새 문의가 들어오면 이곳에서 확인할 수 있어요.'} />}
      <Pagination page={page} path={index => sellerInquiryPath({ status, page: index })} />
    </section><section className="panel seller-panel stack"><h2>선택한 문의</h2>{selected ? <><h3>{selected.fabric_title}</h3><InquiryContent item={selected} /><SellerAnswerForm key={`${selected.id}:${resource.readId}`} ctx={ctx} item={selected} retry={resource.retry} readId={resource.readId} /></> : <p className="muted">{selectedId ? '선택한 문의가 현재 페이지에 없어요. 목록에서 문의를 선택하거나 다른 상태·페이지를 확인해 주세요.' : '확인할 문의를 선택해 주세요.'}</p>}</section></div>}
  </SellerPage>;
}

export function SellerLiveInquiries({ ctx }) {
  return ctx.path === '/seller/inquiries/answered' ? <SellerAnswerReceipt ctx={ctx} /> : <SellerInquiryList ctx={ctx} />;
}
