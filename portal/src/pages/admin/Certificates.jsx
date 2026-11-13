import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, Tabs, kg, useAct, useDateFormat, useLoad } from '../../components.jsx';

const BADGE = { pending: 'pending', issued: 'approved', declined: 'cancelled', revoked: 'cancelled' };

// Certificates that recognise residents. Participation and recognition are issued by the system when a resident
// qualifies; Circular Champion requests wait here. An issued certificate can be revoked, for example after an
// upheld flag; anyone checking its code then sees that it is no longer valid.
export default function Certificates() {
  const { t } = useI18n();
  const date = useDateFormat();
  const [status, setStatus] = useState('pending');
  const [asking, setAsking] = useState(null); // { cert, action: 'decline' | 'revoke' }
  const list = useLoad(() => api(`/admin/certificates?status=${status}`), [status]);
  const { run, busy } = useAct();
  return (
    <>
      <PageHeader title={t('Certificates')} subtitle={t('Signed by the hub head and the CircuLink programme lead. Check the resident\'s history before approving a champion.')} />
      <Tabs value={status} onChange={setStatus} tabs={['pending', 'issued', 'declined', 'revoked'].map((s) => ({ value: s, label: t(`cert_${s}`) }))} />
      <section className="card">
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data.length ? <Empty>{t('Nothing here.')}</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">{t('Resident')}</th><th scope="col">{t('Certificate')}</th><th scope="col">{t('Hub')}</th><th scope="col">{t('History')}</th><th scope="col">{t('Date')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
            <tbody>{list.data.map((c) => (
              <tr key={c.id}>
                <td>{c.resident_name}</td>
                <td><Badge value={BADGE[c.status]} label={t(c.level_name)} /><div className="muted">{c.code}</div></td>
                <td>{c.hub_name || '–'}</td>
                <td>{kg(c.kg_kept)} · {c.points} {t('points')}<div className="muted">{c.dropoffs} {t('drop-offs')} · {c.months_active} {t('months')}</div></td>
                <td>{date(c.issued_at || c.requested_at)}{c.reason && <div className="muted">{c.reason}</div>}</td>
                <td className="cell-actions">
                  {c.status === 'pending' && (
                    <>
                      <button className="btn small primary" disabled={busy} onClick={() => run(() => api(`/admin/certificates/${c.id}/approve`, { method: 'POST' }), t('Certificate issued. The resident is told.'), list.reload)}>{t('Approve')}</button>
                      <button className="btn small" disabled={busy} onClick={() => setAsking({ cert: c, action: 'decline' })}>{t('Decline')}</button>
                    </>
                  )}
                  {c.status === 'issued' && (
                    <>
                      <a className="btn small" href={`/certificates/${c.code}`} target="_blank" rel="noreferrer">{t('View')}</a>
                      <button className="btn small danger" disabled={busy} onClick={() => setAsking({ cert: c, action: 'revoke' })}>{t('Revoke')}</button>
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {asking && <ReasonModal asking={asking} busy={busy} onClose={() => setAsking(null)}
        onSend={(reason) => run(() => api(`/admin/certificates/${asking.cert.id}/${asking.action}`, { method: 'POST', body: { reason } }),
          asking.action === 'revoke' ? t('Certificate revoked. The resident is told.') : t('Request declined. The resident is told.'),
          async () => { setAsking(null); await list.reload(); })} />}
    </>
  );
}

function ReasonModal({ asking, busy, onClose, onSend }) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const revoke = asking.action === 'revoke';
  return (
    <Modal title={revoke ? t('Revoke this certificate?') : t('Decline this request?')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSend(reason); }}>
        <p className="mt-0">{revoke
          ? t('Anyone who checks this certificate will see that it is no longer valid. This cannot be undone.')
          : t('The resident can ask again later.')}</p>
        <div className="field">
          <label htmlFor="cert-why">{t('Reason (the resident sees this)')}</label>
          <textarea id="cert-why" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className={`btn ${revoke ? 'danger' : 'primary'}`} disabled={busy}>{revoke ? t('Revoke') : t('Decline')}</button>
        </div>
      </form>
    </Modal>
  );
}
