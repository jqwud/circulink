import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import { api } from './api.js';
import { Loading } from './components.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Verification from './pages/Verification.jsx';
import Residents from './pages/Residents.jsx';
import Listings from './pages/Listings.jsx';
import Shelf from './pages/Shelf.jsx';
import Transactions from './pages/Transactions.jsx';
import Reports from './pages/Reports.jsx';
import Announcements from './pages/Announcements.jsx';
import Impact from './pages/Impact.jsx';
import Rules from './pages/Rules.jsx';
import StaffAudit from './pages/StaffAudit.jsx';

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang" role="group" aria-label="Language">
      <button className={lang === 'fil' ? 'active' : ''} onClick={() => setLang('fil')}>Filipino</button>
      <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
    </div>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const loc = useLocation();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    const load = () => api('/admin/stats').then(setCounts).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [loc.pathname]);

  const links = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/verification', label: 'Verification', pill: counts.pending_verifications },
    { to: '/residents', label: 'Residents' },
    { to: '/listings', label: 'Listings' },
    { to: '/shelf', label: 'Barangay Shelf' },
    { to: '/transactions', label: 'Transactions', pill: (counts.staff_requests_waiting || 0) + (counts.overdue || 0) },
    { to: '/reports', label: 'Reports & disputes', pill: counts.open_reports },
    { to: '/announcements', label: 'Announcements' },
    { to: '/impact', label: 'Impact' },
    { to: '/rules', label: 'Rules' },
    ...(user.role === 'lgu_admin' ? [{ to: '/staff', label: 'Staff & audit log' }] : []),
  ];

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main">
        <div className="brand">
          <img src="/pawsa/pawsa-head.svg" alt="" />
          <div><b>Hiraman</b><span>{t('LGU Portal')}</span></div>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              <span>{t(l.label)}</span>
              {l.pill ? <span className="pill">{l.pill}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        <div className="me">
          <b>{user.name}</b>
          <span className="muted">{user.role === 'lgu_admin' ? t('Admin') : t('Staff')}</span>
          <div style={{ marginTop: 10 }}><button className="btn small" onClick={logout}>{t('Log out')}</button></div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <button className="btn small menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
          <LangToggle />
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/residents" element={<Residents />} />
          <Route path="/listings" element={<Listings />} />
          <Route path="/shelf" element={<Shelf />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/rules" element={<Rules />} />
          {user.role === 'lgu_admin' && <Route path="/staff" element={<StaffAudit />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return user ? <Shell /> : <Login LangToggle={LangToggle} />;
}
