import { useEffect, useRef, useState } from 'react';
import { SellerScreen, UploadState } from './seller/SellerViews.jsx';
import { SellerRuntime } from './seller/SellerRuntime.js';
import { draftFor, formDraft, unfinishedDraft, validateSellerDraft, canRegister } from './seller/sellerModel.js';
import { inquiryDraftKey, submitInquiryDraft } from './seller/sellerUx.js';
import SellerReservations from './seller/SellerReservations.jsx';
import SellerLiveOverview from './seller/SellerLiveOverview.jsx';

const PHOTO_ORDER = ['FULL', 'ZOOM', 'DEFECT'];
const fabricRoute = fabric => `/seller/fabrics/detail?id=${encodeURIComponent(fabric.id)}`;
const formValues = form => Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value).trim()]));

export default function SellerPage({ ctx }) {
  if (ctx.mode === 'live' && ['/seller/reservations', '/seller/reservations/confirm'].includes(ctx.path)) return <SellerReservations ctx={ctx} />;
  if (ctx.mode === 'live' && ['/seller', '/seller/dashboard', '/seller/calendar'].includes(ctx.path)) return <SellerLiveOverview ctx={ctx} />;
  return <SellerWorkbench ctx={ctx} />;
}

function SellerWorkbench({ ctx }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const fabricForm = useRef(null), aiForm = useRef(null), dialogRef = useRef(null);
  const mounted = useRef(false), busyRef = useRef(false), latest = useRef(ctx);
  const creationWait = useRef(null), uploadStarted = useRef('');
  const [dialog, setDialog] = useState(null);
  useEffect(() => { latest.current = ctx; }, [ctx]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (creationWait.current) {
        clearTimeout(creationWait.current.timer);
        creationWait.current.resolve(false);
        creationWait.current = null;
      }
    };
  }, []);

  const snapshotContext = () => ({ ...latest.current, state: latest.current.api.getState() });
  const draftKey = form => form.dataset.editId ? `seller:edit:${form.dataset.editId}` : `seller:register:${form.dataset.saleType}`;
  function remember(previous) {
    const form = fabricForm.current;
    if (form) ctx.drafts.set(draftKey(form), unfinishedDraft(form, previous || draftFor(snapshotContext())));
  }
  async function run(task) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try { await task(); }
    catch (cause) { if (mounted.current) setError(cause.message || '처리하지 못했어요. 다시 확인해 주세요.'); }
    finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function fabricSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const draft = formDraft(form, draftFor(snapshotContext())), editId = form.dataset.editId;
    const message = validateSellerDraft(draft, !editId);
    if (message) {
      if (editId) { setError(message); return; }
      run(async () => { await ctx.api.saveDraft(draft); ctx.navigate(`/seller/register/error?type=${draft.sale_type}`); });
      return;
    }
    run(async () => {
      if (editId) {
        const fabric = await ctx.api.updateFabric(editId, draft);
        ctx.drafts.delete(draftKey(form));
        ctx.notify(fabric.status === 'PENDING' ? '보완한 내용을 저장하고 승인 신청을 보냈어요.' : '수정 내용을 저장했어요.');
        ctx.navigate(fabricRoute(fabric));
      } else {
        await ctx.api.saveDraft(draft);
        ctx.navigate('/seller/register/review');
      }
    });
  }

  function photoChange(event) {
    remember();
    const input = event.target;
    if (!input.dataset.photoSlot || !input.files?.length) return;
    const file = input.files[0];
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      input.value = ''; setError('jpg·png·webp 사진만 선택해 주세요.'); return;
    }
    if (file.size > 5 * 1024 * 1024 || file.size === 0) {
      input.value = ''; setError('0바이트보다 크고 5MB 이하인 사진을 선택해 주세요.'); return;
    }
    const draft = formDraft(fabricForm.current, draftFor(snapshotContext()));
    draft.photo_slots = { ...draft.photo_slots, [input.dataset.photoSlot]: file.name };
    draft.photo_names = PHOTO_ORDER.map(slot => draft.photo_slots[slot]).filter(Boolean);
    run(async () => { await ctx.api.saveDraft(draft); remember(draft); await ctx.refresh(); });
  }

  function storeSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = formValues(form);
    if (!values.store_name || !values.address || !values.phone_number) { setError('매장명, 주소, 연락처를 입력해 주세요.'); return; }
    run(async () => { await ctx.api.saveStore(values); ctx.navigate('/seller/profile/saved'); });
  }

  function profileSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = formValues(form);
    if (!data.nickname || !data.store_name || !data.address || !data.store_phone) { setError('닉네임과 매장 정보를 입력해 주세요.'); return; }
    run(async () => {
      await ctx.api.updateSellerProfile({ nickname: data.nickname, phone_number: data.phone_number });
      await ctx.api.saveStore({ store_name: data.store_name, address: data.address, phone_number: data.store_phone, pickup_guide: data.pickup_guide });
      ctx.navigate('/seller/profile/saved');
    });
  }

  function aiSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const message = String(new FormData(form).get('ai_request') || '').trim(), sale_type = form.dataset.saleType;
    const submitter = event.nativeEvent.submitter;
    const direct = submitter?.hasAttribute('data-ai-direct'), failedExample = submitter?.hasAttribute('data-ai-error');
    run(async () => {
      await ctx.api.saveDraft({ ...draftFor(snapshotContext()), ai_request: message, description: message });
      if (direct) { ctx.navigate(`/seller/register/manual?type=${sale_type}`); return; }
      try {
        await ctx.api.prepareAiDraft({ sale_type, message });
        ctx.drafts.delete(`seller:register:${sale_type}`);
        ctx.navigate(`/seller/register/ai?type=${sale_type}&step=${failedExample ? 'error' : 'processing'}`);
      } catch { ctx.navigate(`/seller/register/ai?type=${sale_type}&step=error`); }
    });
  }

  function inquirySubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const content = String(new FormData(form).get('answer') || '').trim();
    if (!content || content.length > 1000) { setError('답변을 1~1,000자로 입력해 주세요.'); return; }
    run(async () => {
      await submitInquiryDraft(ctx.api, ctx.drafts, form.dataset.inquiryId, content);
      ctx.navigate(`/seller/inquiries/answered?id=${encodeURIComponent(form.dataset.inquiryId)}`);
    });
  }

  function reservationSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const reason = String(new FormData(form).get('reason') || '').trim();
    run(async () => {
      await ctx.api.updateReservation(form.dataset.reservationId, form.dataset.status, reason);
      ctx.navigate(`/seller/reservations?status=${form.dataset.status}&id=${encodeURIComponent(form.dataset.reservationId)}`);
    });
  }

  function action(name, props) {
    if (name === 'reservation') {
      const status = props['data-status'], reason = String(props['data-reason'] || '').trim();
      if (status === 'REJECTED' && (!reason || reason.length > 255)) { setError('거절 사유를 1~255자로 입력해 주세요.'); return; }
      const messages = {
        ACCEPTED: ['예약을 수락할까요?', '수락하면 구매자의 요청 수량이 확보돼요.'],
        REJECTED: ['예약을 거절할까요?', `거절 사유: ${reason}`],
        PICKED_UP: ['원단을 전달했나요?', '수령 완료로 처리하면 재고가 차감되며 예약을 취소할 수 없어요.'],
        CANCELED: ['예약을 취소할까요?', '확보된 수량이 다시 판매 가능한 재고로 돌아가요.'],
      }[status];
      if (messages) setDialog({ id: props['data-id'], status, reason, title: messages[0], description: messages[1] });
      return;
    }
    if (name === 'refresh-approval') { ctx.refresh(); ctx.notify('현재 승인 상태를 확인했어요.'); return; }
    if (name === 'new-draft') return run(async () => {
      ctx.drafts.delete('seller:register:ROLL'); ctx.drafts.delete('seller:register:SCRAP');
      await ctx.api.saveDraft(draftFor({ ...ctx, query: new URLSearchParams('type=ROLL'), state: { ...ctx.api.getState(), draft: null } }));
      ctx.navigate('/seller/register');
    });
    if (name === 'review-photos') return run(async () => {
      const draft = formDraft(fabricForm.current, draftFor(snapshotContext()));
      ctx.drafts.set(`seller:photo-return:${draft.sale_type}`, window.scrollY);
      await ctx.api.saveDraft(draft); ctx.navigate(`/seller/register/photos?type=${draft.sale_type}`);
    });
    if (name === 'photos-to-review') return run(async () => {
      const draft = draftFor(snapshotContext()), message = validateSellerDraft(draft);
      if (message) { ctx.navigate(`/seller/register/error?type=${draft.sale_type}`); return; }
      await ctx.api.saveDraft(draft); ctx.navigate('/seller/register/review');
    });
    if (name === 'photos-back') {
      const type = draftFor(snapshotContext()).sale_type;
      const scrollY = ctx.drafts.get(`seller:photo-return:${type}`);
      ctx.navigate(`/seller/register/manual?type=${type}${Number.isFinite(scrollY) ? '' : '&focus=photos'}`, Number.isFinite(scrollY) ? { scrollY, focusTarget: 'seller-photo-review' } : {});
      return;
    }
    if (name === 'remove-photo') return run(async () => {
      const draft = formDraft(fabricForm.current, draftFor(snapshotContext()));
      draft.photo_slots = { ...draft.photo_slots }; delete draft.photo_slots[props['data-slot']];
      draft.photo_names = PHOTO_ORDER.map(slot => draft.photo_slots[slot]).filter(Boolean);
      await ctx.api.saveDraft(draft); remember(draft); await ctx.refresh();
    });
    if (name === 'ai-continue') {
      const form = aiForm.current, message = String(new FormData(form).get('ai_request') || '').trim();
      if (!message) { setError('원단 설명을 입력해 주세요.'); return; }
      return run(async () => {
        await ctx.api.prepareAiDraft({ sale_type: form.dataset.saleType, message });
        ctx.drafts.delete(`seller:register:${form.dataset.saleType}`); ctx.navigate(props['data-path']);
      });
    }
    if (name === 'delete-fabric') return run(async () => { await ctx.api.deleteFabric(props['data-id']); ctx.navigate('/seller/fabrics/deleted'); });
    if (name === 'retry-photos') return run(async () => { await ctx.api.retryPhotos(); await ctx.refresh(); });
    if (name === 'submit-fabric') return run(async () => {
      const state = ctx.api.getState();
      if (!canRegister(state)) { ctx.navigate('/seller/approval'); return; }
      const validation = validateSellerDraft(state.draft || {});
      if (validation) throw new Error(validation);
      setCreating(true);
      const proceed = await new Promise(resolve => {
        creationWait.current = { resolve, timer: setTimeout(() => { creationWait.current = null; resolve(true); }, 300) };
      });
      if (!proceed || !mounted.current) return;
      try { await ctx.api.createFabric(); }
      catch (cause) {
        if (!ctx.api.getState().upload) {
          setCreating(false); await ctx.refresh(); throw cause;
        }
      }
      if (mounted.current) ctx.navigate('/seller/upload');
    });
  }

  // The first StrictMode effect is cleaned up before its timer can send anything.
  // The ref also prevents an unrelated state refresh from resending an in-flight upload.
  const uploadStage = ctx.state.upload?.stage, uploadId = ctx.state.upload?.fabric_id;
  const uploadVisible = ctx.path === '/seller/upload' || ctx.path.startsWith('/seller/register');
  useEffect(() => {
    if (uploadStage !== 'UPLOADING') { uploadStarted.current = ''; return; }
    if (!uploadVisible || ctx.query.get('sample') === '1') return;
    const key = `${uploadId}:UPLOADING`;
    const timer = setTimeout(async () => {
      if (!mounted.current || uploadStarted.current === key) return;
      uploadStarted.current = key;
      try { await ctx.api.uploadPhotos(); if (mounted.current) await latest.current.refresh(); }
      catch (cause) { if (mounted.current) setError(cause.message); }
    }, 450);
    return () => clearTimeout(timer);
  }, [ctx, uploadStage, uploadId, uploadVisible]);

  useEffect(() => {
    if (ctx.path !== '/seller/register/ai' || ctx.query.get('step') !== 'processing' || ctx.query.get('sample') === '1' || !canRegister(ctx.state)) return;
    const timer = setTimeout(() => {
      if (mounted.current) ctx.navigate(`/seller/register/ai?type=${ctx.query.get('type') === 'SCRAP' ? 'SCRAP' : 'ROLL'}&step=result`);
    }, 650);
    return () => clearTimeout(timer);
  }, [ctx]);

  useEffect(() => {
    const element = dialogRef.current;
    if (dialog && element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); };
  }, [dialog]);

  const focusPhotos = ctx.path === '/seller/register/manual' && ctx.query.get('focus') === 'photos';
  useEffect(() => {
    if (!focusPhotos) return;
    const frame = requestAnimationFrame(() => {
      const section = fabricForm.current?.querySelector('[data-seller-photos]');
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusPhotos]);

  const runtime = {
    error, busy, fabricForm, aiForm, dialogRef, dialog,
    fabricSubmit, storeSubmit, profileSubmit, aiSubmit, inquirySubmit, reservationSubmit, photoChange,
    rememberInquiry: event => {
      const form = event.currentTarget;
      ctx.drafts.set(inquiryDraftKey(form.dataset.inquiryId), String(new FormData(form).get('answer') || ''));
    },
    rememberInput: () => remember(), action,
    discardEdit: () => { if (fabricForm.current?.dataset.editId) ctx.drafts.delete(draftKey(fabricForm.current)); },
    logout: () => ctx.logout('SELLER'),
    closeDialog: () => { dialogRef.current?.close(); setDialog(null); },
    dialogSubmit: event => {
      event.preventDefault();
      if (!dialog) return;
      run(async () => {
        await ctx.api.updateReservation(dialog.id, dialog.status, dialog.reason);
        setDialog(null); ctx.notify('예약 상태를 변경했어요.');
        ctx.navigate(`/seller/reservations?status=${dialog.status}&id=${encodeURIComponent(dialog.id)}`);
      });
    },
  };
  const navigateView = (path, options = {}) => {
    const [destination, search = ''] = path.split('?');
    if (options.preserveScroll && ['/seller/dashboard', '/seller/calendar'].includes(destination)) {
      const focusTarget = new URLSearchParams(search).has('date') ? 'seller-calendar-date' : 'seller-calendar-first';
      return ctx.navigate(path, { ...options, focusTarget });
    }
    return ctx.navigate(path, options);
  };
  return <SellerRuntime.Provider value={runtime}>{creating ? <UploadState ctx={{ ...ctx, state: { ...ctx.state, upload: { stage: 'CREATING' } } }} /> : <SellerScreen ctx={{ ...ctx, runtime, navigate: navigateView }} />}</SellerRuntime.Provider>;
}
