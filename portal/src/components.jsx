import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { blobUrl } from './api.js';
import { useI18n } from './i18n.jsx';

// ---------- data loading ----------
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (alive.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (alive.current) setState({ data: null, loading: false, error });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

// ---------- toasts ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- small pieces ----------
export function Pawsa({ pose = 'happy', size = 96 }) {
  return <img src={`/pawsa/pawsa-${pose}.svg`} width={size} height={size} alt="" />;
}

export function Empty({ pose = 'sleepy', children }) {
  return (
    <div className="empty">
      <Pawsa pose={pose} size={110} />
      <p>{children}</p>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="card error-box" role="alert">
      <Pawsa pose="oops" size={80} />
      <p>{error?.message || 'Something went wrong.'}</p>
      {onRetry && <button className="btn" onClick={onRetry}>{t('Try again')}</button>}
    </div>
  );
}

export function Loading() {
  const { t } = useI18n();
  return <p className="muted pad">{t('Loading...')}</p>;
}

const TONE = {
  pending: 'warn', approved: 'ok', rejected: 'bad', unverified: 'muted', cancelled: 'muted', handed_over: 'info', closed: 'ok',
  disputed: 'bad', available: 'ok', paused: 'muted', removed: 'bad', open: 'warn', in_mediation: 'info', resolved: 'ok',
  low: 'ok', medium: 'warn', high: 'bad', suspended: 'bad', overdue: 'bad', shelf: 'info',
};
export function Badge({ value, label }) {
  const { t } = useI18n();
  return <span className={`badge ${TONE[value] || 'muted'}`}>{label || t(String(value))}</span>;
}

export function Modal({ title, onClose, children, wide }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Close')}>×</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function Stat({ label, value, tone, to, hint }) {
  const body = (
    <>
      <span className="stat-value">{value ?? '–'}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </>
  );
  return to ? <Link className={`stat ${tone || ''}`} to={to}>{body}</Link> : <div className={`stat ${tone || ''}`}>{body}</div>;
}

// Private photos (like an ID) are fetched with the login token and shown as a local blob.
export function PrivatePhoto({ path, alt }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let made;
    blobUrl(path).then((u) => { made = u; setUrl(u); }).catch(() => setErr(true));
    return () => { if (made) URL.revokeObjectURL(made); };
  }, [path]);
  if (err) return <p className="muted">No photo.</p>;
  if (!url) return <p className="muted">…</p>;
  return <img className="id-photo" src={url} alt={alt} />;
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.value} role="tab" aria-selected={value === tab.value} className={value === tab.value ? 'active' : ''} onClick={() => onChange(tab.value)}>
          {tab.label}{tab.count ? <span className="count">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function useDateFormat() {
  const { lang } = useI18n();
  const locale = lang === 'fil' ? 'fil-PH' : 'en-PH';
  return (s) => {
    if (!s) return '';
    const d = new Date(String(s).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  };
}

export const daysLate = (end) => Math.max(0, Math.round((Date.now() - Date.parse(`${end}T23:59:59+08:00`)) / 86400000));
