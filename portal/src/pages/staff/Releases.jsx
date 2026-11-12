import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, Tabs, kg, useAct, useLoad } from '../../components.jsx';

// Partner requests at my hubs: hand the items over (they become final, points confirmed) or decline.
export default function Releases() {
  const { t } = useI18n();
  const [status, setStatus] = useState('requested');
  const list = useLoad(() => api(`/staff/releases?status=${status}`), [status]);
  return (
    <>
      <PageHeader title={t('Releases to partners')} subtitle={t('Hand items over only to the organization named on the request.')} />
      <Tabs value={status} onChange={setStatus} tabs={['requested', 'released', 'picked_up', 'cancelled'].map((s) => ({ value: s, label: t(s) }))} />
      {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} />
        : !list.data.length ? <section className="card"><Empty>{t('Nothing here right now.')}</Empty></section>
          : list.data.map((r) => <ReleaseCard key={r.id} r={r} onChange={list.reload} />)}
    </>
  );
}

export function ReleaseItems({ r }) {
  const { t, lang } = useI18n();
  return (
    <ul className="tag-list">
      {r.items.map((i) => (
        <li key={i.id} className="tag">{lang === 'fil' ? i.category.name_fil : i.category.name_en}{i.description ? `: ${i.description}` : ''} · {kg(i.weight_kg)}
          {i.category.food && i.expiry_date ? ` · ${t('expires')} ${String(i.expiry_date).slice(0, 10)}` : ''}</li>
      ))}
    </ul>
  );
}

function ReleaseCard({ r, onChange }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{r.partner.org_name}</h2>
        <Badge value={r.status === 'requested' ? 'pending' : r.status === 'cancelled' ? 'cancelled' : 'approved'} label={t(r.status)} />
      </div>
      <p className="muted">#{r.id} · {r.hub.name} · {r.items.length} {t('items')} · {kg(r.total_kg)} · {String(r.created_at).slice(0, 16)}</p>
      {r.note && <p className="note">{r.note}</p>}
      <ReleaseItems r={r} />
      {r.status === 'requested' && (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy}
            onClick={() => run(() => api(`/staff/releases/${r.id}/hand-over`, { method: 'POST' }), t('Handed over. Points confirmed.'), onChange)}>{t('Hand over')}</button>
          <button className="btn" disabled={busy} onClick={() => setDeclining(true)}>{t('Decline')}</button>
        </div>
      )}
      {declining && (
        <Modal title={t('Decline this request?')} onClose={() => setDeclining(false)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            run(() => api(`/staff/releases/${r.id}/decline`, { method: 'POST', body: { reason } }), t('Declined. The items are back in stock.'), async () => { setDeclining(false); await onChange(); });
          }}>
            <div className="field">
              <label htmlFor={`why-${r.id}`}>{t('Reason (the organization sees this)')}</label>
              <textarea id={`why-${r.id}`} value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setDeclining(false)}>{t('Cancel')}</button>
              <button className="btn danger" disabled={busy}>{t('Decline')}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
