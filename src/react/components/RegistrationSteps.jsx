export default function RegistrationSteps({ mode = 'MANUAL', stage = 1 }) {
  const labels = mode === 'AI_BRIEF'
    ? ['사진', '필수 입력', '선택 입력', '내용 확인', 'AI 작성']
    : mode === 'AI' ? ['답변 입력', '초안 검토', '사진·최종 확인'] : ['소재·치수 입력', '사진 확인', '최종 확인'];
  return <nav className="registration-steps" aria-label="등록 단계"><ol>{labels.map((label, index) => <li key={label} aria-current={index + 1 === stage ? 'step' : undefined} className={index + 1 < stage ? 'previous' : ''}><span>{index + 1}</span><div><strong>{label}</strong><small>{index + 1 === stage ? '현재 단계' : index + 1 < stage ? '이전 단계' : '다음 단계'}</small></div></li>)}</ol></nav>;
}
