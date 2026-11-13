import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import { Loading, PasswordModal } from './components.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CheckIn from './pages/staff/CheckIn.jsx';
import Stock from './pages/staff/Stock.jsx';
import Releases from './pages/staff/Releases.jsx';
import Browse from './pages/partner/Browse.jsx';
import Requests from './pages/partner/Requests.jsx';
import Accounts from './pages/admin/Accounts.jsx';
import Partners from './pages/admin/Partners.jsx';
import Places from './pages/admin/Places.jsx';
import Categories from './pages/admin/Categories.jsx';
import Flags from './pages/admin/Flags.jsx';
import Certificates from './pages/admin/Certificates.jsx';
import Audit from './pages/admin/Audit.jsx';
import Reports from './pages/admin/Reports.jsx';

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button aria-pressed={lang === 'en'} className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
      <button aria-pressed={lang === 'fil'} className={lang === 'fil' ? 'active' : ''} onClick={() => setLang('fil')}>Filipino</button>
    </div>
  );
}

// The pages of each role (spec section 7). Admins may also act at every hub, so they get the staff pages.
const STAFF_PAGES = [
  { to: '/check-in', label: 'Check in and sort', el: <CheckIn /> },
  { to: '/stock', label: 'Stock and recycling', el: <Stock /> },
  { to: '/releases', label: 'Releases to partners', el: <Releases /> },
];
const PAGES = {
  staff: STAFF_PAGES,
  partner: [
    { to: '/browse', label: 'Available items', el: <Browse /> },
    { to: '/requests', label: 'My requests', el: <Requests /> },
  ],
  admin: [
    ...STAFF_PAGES,
    { to: '/reports', label: 'Impact reports', el: <Reports /> },
    { to: '/flags', label: 'Flags', el: <Flags /> },
    { to: '/certificates', label: 'Certificates', el: <Certificates /> },
    { to: '/accounts', label: 'Accounts', el: <Accounts /> },
    { to: '/partners', label: 'Partner organizations', el: <Partners /> },
    { to: '/places', label: 'Hubs and recyclers', el: <Places /> },
    { to: '/categories', label: 'Categories', el: <Categories /> },
    { to: '/audit', label: 'Audit log', el: <Audit /> },
  ],
};

const ROLE_LABEL = { admin: 'Admin', staff: 'Hub staff', partner: 'Partner organization' };

function Shell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const pages = PAGES[user.role] || [];
  const links = [{ to: '/', label: 'Dashboard', end: true }, ...pages];

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
          <div className="row mt-12">
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
          {pages.map((p) => <Route key={p.to} path={p.to} element={p.el} />)}
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
