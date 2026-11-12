import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

export default function Login({ LangToggle }) {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); }
    catch (err) { setError(err.code === 'residents_blocked' ? t('This portal is for hub staff, partner organizations and admins. Residents use the CircuLink app.') : err.message); }
    finally { setBusy(false); }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><LangToggle /></div>
        <h1><img className="login-logo" src="/logo.svg" alt="CircuLink" /></h1>
        <p className="muted">{t('Keeping things in use, one drop-off at a time.')}</p>
        <h2 style={{ fontSize: 18, marginBottom: 0 }}>{t('Portal login')}</h2>
        <form onSubmit={submit}>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="email">{t('Email')}</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">{t('Password')}</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>{busy ? t('Signing in...') : t('Log in')}</button>
        </form>
        <p className="hint">{t('Demo accounts (password circulink123): admin@, staff@ or partner@circulink.test')}</p>
      </div>
    </main>
  );
}
