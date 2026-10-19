import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Empty, ErrorBox, Loading, PageHeader, useDateFormat, useLoad, useToast } from '../components.jsx';

export default function Announcements() {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useDateFormat();
  const list = useLoad(() => api('/admin/announcements'), []);
  const puroks = useLoad(() => api('/admin/puroks'), []);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [busy, setBusy] = useState(false);

  async function send(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/admin/announcements', { method: 'POST', body: { title, message, audience } });
      toast(`${t('Sent to')} ${r.sent_to} ${t('residents')}`);
      setTitle(''); setMessage(''); list.reload();
    } catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={t('Announcements to residents')} subtitle={t('Residents get the message as a notification in the app.')} />
      <div className="grid two">
        <form className="card" onSubmit={send}>
          <h2>{t('New announcement')}</h2>
          <div className="field"><label htmlFor="at">{t('Title')}</label><input id="at" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required /></div>
          <div className="field"><label htmlFor="am">{t('Message')}</label><textarea id="am" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} required /></div>
          <div className="field"><label htmlFor="aa">{t('Send to')}</label>
            <select id="aa" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="all">{t('Everyone')}</option>
              {(puroks.data || []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
          <button className="btn primary" disabled={busy}>{t('Send')}</button>
        </form>
        <div className="card">
          <h2>{t('Sent announcements')}</h2>
          {list.loading && !list.data && <Loading />}
          {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
          {list.data && (list.data.length === 0 ? <Empty>{t('Nothing here yet.')}</Empty> : list.data.map((a) => (
            <div key={a.id} style={{ borderTop: '1px solid var(--c-line)', padding: '10px 0' }}>
              <b>{a.title}</b> <span className="muted">· {a.audience === 'all' ? t('Everyone') : a.audience} · {fmt(a.created_at)}</span>
              <p style={{ margin: '4px 0 0' }}>{a.message}</p>
            </div>
          )))}
        </div>
      </div>
    </>
  );
}
