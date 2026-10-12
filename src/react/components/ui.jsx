import { useState } from 'react';

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

export function PageHeading({ title, description = '' }) {
  return <header className="page-heading"><h1 tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</header>;
}

export function EmptyState({ title, description = '', children }) {
  return <section className="empty-state"><h2>{title}</h2><p>{description}</p>{children && <div className="actions">{children}</div>}</section>;
}

export function FabricImage({ fabric, className = '', exampleLabel = true }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const source = fabric.image_url && /^(https?:|blob:|\/)/.test(fabric.image_url) ? fabric.image_url : null;
  const texture = /블루.*스트라이프|스트라이프.*블루/.test(`${fabric.title} ${fabric.color || ''}`) ? 'stripe'
    : ['linen', 'gingham', 'canvas', 'denim', 'stripe'].includes(fabric.texture) ? fabric.texture : 'canvas';
  if (source && (fabric.source !== 'api' || source !== failedUrl)) {
    return <img className={`fabric-art ${className}`} src={source} alt={fabric.title} onError={fabric.source === 'api' ? () => setFailedUrl(source) : undefined} />;
  }
  if (fabric.source === 'api') return <div className={`fabric-art fabric-art--empty ${className}`} role="img" aria-label={`${fabric.title} · ${source ? '사진을 불러오지 못했어요' : '등록된 사진이 없어요'}`}><p aria-hidden="true">{source ? '사진을 불러오지 못했어요' : '등록된 사진이 없어요'}</p></div>;
  return <div className={`fabric-art fabric-art--${texture} ${className}`} role="img" aria-label={`${fabric.title} 질감 예시`}><span aria-hidden="true" />{exampleLabel && <em className="fabric-example-label" aria-hidden="true">질감 예시</em>}</div>;
}

export function Field({ label, name, type = 'text', required = false, readOnly = false, hint = '', id = `field-${name}`, ...props }) {
  return <div className="field">
    <label htmlFor={id}>{label}{required && <> <span aria-hidden="true">*</span></>}</label>
    <input id={id} name={name} type={type} required={required} readOnly={readOnly} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
    {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
  </div>;
}

export function SelectField({ label, name, options, id = `field-${name}`, ...props }) {
  return <div className="field"><label htmlFor={id}>{label}</label><select id={id} name={name} {...props}>
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></div>;
}
