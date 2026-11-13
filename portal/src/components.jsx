import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from './i18n.jsx';
import { useAuth } from './auth.jsx';
import { api } from './api.js';

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

// ---------- long lists in pages ----------
const withPage = (path, limit, offset) => `${path}${path.includes('?') ? '&' : '?'}limit=${limit}&offset=${offset}`;

// The first page loads with the screen; loadMore() adds the next one. A page shorter than `size` is the last.
export function usePaged(pathFn, deps, size = 100) {
  const [extra, setExtra] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const first = useLoad(async () => {
    const rows = await api(withPage(pathFn(), size, 0));
    setExtra([]);
    setHasMore(rows.length === size);
    return rows;
  }, deps);
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await api(withPage(pathFn(), size, (first.data?.length || 0) + extra.length));
      setExtra((e) => [...e, ...rows]);
      setHasMore(rows.length === size);
    } finally {
      setLoadingMore(false);
    }
  };
  return { ...first, data: first.data ? [...first.data, ...extra] : null, hasMore, loadMore, loadingMore };
}

export function LoadMore({ list }) {
  const { t } = useI18n();
  if (!list.hasMore) return null;
  return (
    <div className="load-more">
      <button className="btn" disabled={list.loadingMore} onClick={list.loadMore}>{list.loadingMore ? t('Loading...') : t('Load more')}</button>
    </div>
  );
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
// The CircuLink mark (two arrows around a chain link). Decorative: screens say what they mean in words.
export function Mark({ size = 96 }) {
  return <img src="/logo-mark.svg" width={size} height={size} alt="" />;
}

export function Empty({ children }) {
  return (
    <div className="empty">
      <Mark size={88} />
      <p>{children}</p>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <div className="card error-box" role="alert">
      <Mark size={64} />
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
  pending: 'warn', approved: 'ok', rejected: 'bad', cancelled: 'muted', expired: 'muted', open: 'warn', received: 'info',
  active: 'ok', paused: 'muted', closed: 'muted', suspended: 'bad', cleared: 'ok', upheld: 'bad', confirmed: 'ok',
  reuse: 'ok', repair: 'info', recycle: 'info', reject: 'bad', in_stock: 'ok', released: 'ok', recycled: 'ok',
  school: 'info', barangay: 'info', other: 'muted', info: 'info', urgent: 'bad', warn: 'warn',
};
export function Badge({ value, label }) {
  const { t } = useI18n();
  return <span className={`badge ${TONE[value] || 'muted'}`}>{label || t(String(value))}</span>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openModals = []; // newest last, so only the top dialog answers Escape and Tab

// Keyboard users stay inside the dialog: focus moves in when it opens, Tab cycles
// inside it, and focus goes back to where it was when it closes.
export function Modal({ title, onClose, children, wide }) {
  const { t } = useI18n();
  const box = useRef(null);
  const me = useRef({});
  useEffect(() => {
    const mine = me.current;
    openModals.push(mine);
    const before = document.activeElement;
    const target = box.current.querySelector(`.modal-body :is(${FOCUSABLE})`) || box.current.querySelector(FOCUSABLE) || box.current;
    target.focus();
    return () => {
      openModals.splice(openModals.indexOf(mine), 1);
      if (before && document.contains(before)) before.focus();
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (openModals[openModals.length - 1] !== me.current || !box.current) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const els = [...box.current.querySelectorAll(FOCUSABLE)];
      if (els.length === 0) { e.preventDefault(); return; }
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Close')}>×</button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// A second step before actions that lock someone out. Cancel gets the focus, so a stray Enter never confirms.
export function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onClose }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  async function yes() {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); onClose(); }
  }
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      <p className="mt-0">{message}</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>{t('Cancel')}</button>
        <button type="button" className={`btn ${danger ? 'danger' : 'primary'}`} onClick={yes} disabled={busy}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

// Change your own password. `forced` after an admin reset: it cannot be closed, only completed (or log out).
export function PasswordModal({ forced, onClose }) {
  const { t } = useI18n();
  const toast = useToast();
  const { changePassword, logout } = useAuth();
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    if (f.next.length < 8) { toast(t('The new password needs at least 8 characters.'), 'bad'); return; }
    if (f.next !== f.again) { toast(t('The two new passwords are not the same.'), 'bad'); return; }
    setBusy(true);
    try { await changePassword(f.current, f.next); toast(t('Password changed. Other sessions were logged out.')); onClose?.(); }
    catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  }
  return (
    <Modal title={forced ? t('Choose your own password') : t('Change password')} onClose={forced ? () => {} : onClose}>
      {forced && <p className="muted mt-0">{t('An admin gave you a temporary password. Pick a new one that only you know.')}</p>}
      <form onSubmit={save}>
        <div className="field"><label htmlFor="pw1">{forced ? t('Temporary password') : t('Current password')}</label><input id="pw1" type="password" autoComplete="current-password" value={f.current} onChange={set('current')} required /></div>
        <div className="field"><label htmlFor="pw2">{t('New password')}</label><input id="pw2" type="password" autoComplete="new-password" minLength={8} placeholder={t('At least 8 characters')} value={f.next} onChange={set('next')} required /></div>
        <div className="field"><label htmlFor="pw3">{t('New password again')}</label><input id="pw3" type="password" autoComplete="new-password" value={f.again} onChange={set('again')} required /></div>
        <div className="modal-actions">
          {forced ? <button type="button" className="btn" onClick={logout}>{t('Log out')}</button> : <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>}
          <button className="btn primary" disabled={busy}>{t('Save new password')}</button>
        </div>
      </form>
    </Modal>
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
  // withTime adds the hour and minute, for things that happen several times a day.
  return (s, withTime = false) => {
    if (!s) return '';
    // The server stores Philippine time without a zone: read it as +08:00 and show it in Manila time,
    // so a computer set to another zone never shows the wrong day.
    const text = String(s);
    const iso = text.length <= 10 ? `${text}T12:00:00+08:00` : /([zZ]|[+-]\d\d:\d\d)$/.test(text) ? text : `${text.replace(' ', 'T')}+08:00`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return s;
    const opts = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' };
    return withTime && text.length > 10
      ? d.toLocaleString(locale, { ...opts, hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString(locale, opts);
  };
}


// A button action: runs `fn`, shows `ok` (or the server's error) as a toast, then calls `after` (a reload).
// `busy` is true while it runs, so the button can be disabled and a double click does nothing.
export function useAct() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, ok, after) => {
    if (busy) return false;
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(typeof ok === 'function' ? ok(r) : ok);
      await after?.(r);
      return r ?? true;
    } catch (e) {
      toast(e.message, 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, toast]);
  return { run, busy };
}

export const kg = (n) => `${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })} kg`;
