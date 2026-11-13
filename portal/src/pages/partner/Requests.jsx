import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, PageHeader, kg, useAct, useDateFormat, useLoad } from '../../components.jsx';
import { ReleaseItems } from '../staff/Releases.jsx';

// My organization's requests: take one back before hand-over, confirm when the items arrive.
export default function Requests() {
  const { t } = useI18n();
  const list = useLoad(() => api('/releases'), []);
  const { run, busy } = useAct();
  const date = useDateFormat();
  const [takingBack, setTakingBack] = useState(null);
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  const received = list.data.filter((r) => ['released', 'picked_up'].includes(r.status));
  return (
    <>
      <PageHeader title={t('My requests')} subtitle={`${received.length} ${t('received')} · ${kg(received.reduce((a, r) => a + r.total_kg, 0))} ${t('kept in use')}`} />
      {!list.data.length ? <section className="card"><Empty>{t('No requests yet. Choose items on Available items.')}</Empty></section> : list.data.map((r) => (
        <section className="card" key={r.id}>
          <div className="row between">
            <h2 className="m-0">#{r.id} · {r.hub.name}</h2>
            <Badge value={r.status === 'requested' ? 'pending' : r.status === 'cancelled' ? 'cancelled' : 'approved'} label={t(r.status)} />
          </div>
          <p className="muted">{r.items.length} {t('items')} · {kg(r.total_kg)} · {date(r.created_at, true)}</p>
          {r.note && <p className="note">{r.note}</p>}
          <ReleaseItems r={r} />
          <div className="row mt-12">
            {r.status === 'requested' && (
              <button className="btn" disabled={busy} onClick={() => setTakingBack(r)}>{t('Take back')}</button>
            )}
            {r.status === 'released' && (
              <button className="btn primary" disabled={busy} onClick={() => run(() => api(`/releases/${r.id}/picked-up`, { method: 'POST' }), t('Thank you. Marked as received.'), list.reload)}>{t('We received them')}</button>
            )}
          </div>
        </section>
      ))}
      {takingBack && (
        <ConfirmModal title={t('Take back this request?')} danger
          message={t('The items go back to the hub and other organizations can ask for them.')}
          confirmLabel={t('Take back')} onClose={() => setTakingBack(null)}
          onConfirm={() => run(() => api(`/releases/${takingBack.id}`, { method: 'DELETE' }), t('Request taken back.'), list.reload)} />
      )}
    </>
  );
}
