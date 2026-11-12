import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import { Loading, PasswordModal } from './components.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
      <button className={lang === 'fil' ? 'active' : ''} onClick={() => setLang('fil')}>Filipino</button>
    </div>
  );
}

const ROLE_LABEL = { admin: 'Admin', staff: 'Hub staff', partner: 'Partner organization' };

function Shell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  // Each role gets its own pages as they are built (docs/CIRCULAR_HUB_SPEC.md, section 7).
  const links = [{ to: '/', label: 'Dashboard', end: true }];

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main">
        <div className="brand">
          <img src="/logo-mark.svg" alt="" />
          <div><b>CircuLink</b><span>{t('Portal')}</span></div>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}><span>{t(l.label)}</span></NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div className="me">
          <b>{user.name}</b>
          <span className="muted">{t(ROLE_LABEL[user.role] || user.role)}</span>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn small" onClick={logout}>{t('Log out')}</button>
            <button className="btn small" onClick={() => setPw(true)}>{t('Change password')}</button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <button className="btn small menu-btn" onClick={() => setOpen((o) => !o)} aria-label={t('Menu')}>☰</button>
          <LangToggle />
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {(pw || user.must_change_password) && <PasswordModal forced={user.must_change_password} onClose={() => setPw(false)} />}
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <Shell /> : <Login LangToggle={LangToggle} />;
}
