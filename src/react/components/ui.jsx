import { useEffect, useRef, useState } from 'react';

// Shared presentation primitives. Native input/link props pass through unchanged.

export function Button({ children, href, type = 'button', tone = 'secondary', disabled = false, className = '', ...props }) {
  const classes = `button button--${tone}${className ? ` ${className}` : ''}`;
  return href && !disabled
    ? <a className={classes} href={href.startsWith('#') ? href : `#${href}`} {...props}>{children}</a>
    : <button className={classes} type={type} disabled={disabled} {...props}>{children}</button>;
}

export function Badge({ children, tone = 'green' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Notice({ children, tone = 'info', ...props }) {
  return <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : undefined} {...props}>{children}</div>;
}

export function SubmissionAlert({ children }) {
  const alert = useRef(null);
  useEffect(() => { alert.current?.focus(); }, [children]);
  return <Notice ref={alert} tone="error" tabIndex={-1}>{children}</Notice>;
}

export function PageHeading({ title, description = '' }) {
  return <header className="page-heading"><h1 tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</header>;
}

export function BuyerMast({ title, description = '', image }) {
  return <header className="buyer-mast"><img src={image} alt="" /><div><h1 tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div></header>;
}

export function EmptyState({ title, description = '', children }) {
  return <section className="empty-state"><h2>{title}</h2><p>{description}</p>{children && <div className="actions">{children}</div>}</section>;
}

// Example photos keep their honest aria-label; the visible tag is opt-in.
export function FabricImage({ fabric, className = '', exampleLabel = false, compact = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const source = fabric.image_url && /^(https?:|blob:|\/)/.test(fabric.image_url) ? fabric.image_url : null;
  const texture = /블루.*스트라이프|스트라이프.*블루/.test(`${fabric.title} ${fabric.color || ''}`) ? 'stripe'
    : ['linen', 'gingham', 'canvas', 'denim', 'stripe'].includes(fabric.texture) ? fabric.texture : 'canvas';
  if (source && (fabric.source !== 'api' || source !== failedUrl)) {
    return <img className={`fabric-art ${className}`} src={source} alt={fabric.title} loading="lazy" decoding="async" onError={fabric.source === 'api' ? () => setFailedUrl(source) : undefined} />;
  }
  if (fabric.source === 'api') return <div className={`fabric-art fabric-art--empty ${className}`} role="img" aria-label={`${fabric.title} · ${source ? '사진을 불러오지 못했어요' : '등록된 사진이 없어요'}`}><p aria-hidden="true">{compact ? (source ? '로드 실패' : '사진 없음') : (source ? '사진을 불러오지 못했어요' : '등록된 사진이 없어요')}</p></div>;
  const sample = /데님/.test(fabric.title) ? [0, 0] : /캔버스/.test(fabric.title) ? [2, 0] : /거즈/.test(fabric.title) ? [2, 1] : /린넨/.test(fabric.title) ? [0, 1] : null;
  if (sample) return <div className={`fabric-art fabric-art--photo ${className}`} role="img" aria-label={`${fabric.title} 생성 소재 사진 예시`} style={{ '--fabric-x': sample[0], '--fabric-y': sample[1] }}><img src="/assets/brand/fabric-swatches.webp" alt="" loading="lazy" decoding="async" />{exampleLabel && <em className="fabric-example-label" aria-hidden="true">생성 사진 예시</em>}</div>;
  return <div className={`fabric-art fabric-art--${texture} ${className}`} role="img" aria-label={`${fabric.title} 질감 예시`}><span aria-hidden="true" />{exampleLabel && <em className="fabric-example-label" aria-hidden="true">질감 예시</em>}</div>;
}

export function Icon({ name }) {
  return <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'search' ? <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></> : <path d="M4 12h15m-5-5 5 5-5 5" />}
  </svg>;
}

export function Field({ label, name, type = 'text', required = false, readOnly = false, hint = '', id = `field-${name}`, ...props }) {
  const unit = type === 'number' ? ['width_cm', 'length_cm'].includes(name) ? 'cm' : name === 'price' ? '원' : '' : '';
  return <div className="field">
    <label htmlFor={id}>{label}{required && <> <span aria-hidden="true">*</span></>}</label>
    <div className={`field-control${unit ? ' field-control--unit' : ''}`}><input id={id} name={name} type={type} required={required} readOnly={readOnly} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{unit && <span aria-hidden="true">{unit}</span>}</div>
    {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
  </div>;
}

export function SelectField({ label, name, options, id = `field-${name}`, ...props }) {
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} name={name} {...props}>
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></div>;
}
