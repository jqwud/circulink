import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Empty, ErrorBox, Loading, Modal, PageHeader, PrivatePhoto, useLoad, useToast, useDateFormat } from '../components.jsx';

export default function Verification() {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useDateFormat();
  const { data, loading, error, reload } = useLoad(() => api('/admin/users?status=pending'), []);
  const [view, setView] = useState(null);       // resident whose ID is open
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function approve(u) {
    setBusy(true);
    try {
      const r = await api(`/admin/users/${u.id}/approve`, { method: 'POST' });
      toast(r.starter_credits ? t('Resident approved. {n} starter credits given.').replace('{n}', r.starter_credits) : t('Resident approved.'));
      setView(null); reload();
    }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function reject() {
    setBusy(true);
    try { await api(`/admin/users/${rejecting.id}/reject`, { method: 'POST', body: { reason } }); toast(t('Resident was asked to fix their ID.')); setRejecting(null); setReason(''); setView(null); reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={t('Verification queue')} subtitle={t("Review each resident's ID, then approve or ask them to fix it.")} />
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (data.length === 0 ? <div className="card"><Empty pose="cheer">{t('No IDs are waiting. Nice work!')}</Empty></div> : (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('Name')}</th><th>{t('Purok')}</th><th>{t('Phone')}</th><th>{t('Registered')}</th><th>{t('Actions')}</th></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b><small>{u.email}</small></td>
                  <td>{u.purok || '–'}</td>
                  <td>{u.phone || '–'}</td>
                  <td>{fmt(u.created_at)}</td>
                  <td><div className="cell-actions">
                    <button className="btn small" onClick={() => setView(u)}>{t('View ID')}</button>
                    <button className="btn small primary" disabled={busy} onClick={() => approve(u)}>{t('Approve')}</button>
                    <button className="btn small" onClick={() => setRejecting(u)}>{t('Reject')}</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {view && (
        <Modal title={`${t('ID photo')}: ${view.name}`} onClose={() => setView(null)} wide>
          <p className="muted">{t('Check that the name matches the account, the photo is clear, and the address is in this barangay.')}</p>
          {view.has_id_photo ? <PrivatePhoto path={`/admin/users/${view.id}/id-photo`} alt={`${t('ID photo')}: ${view.name}`} /> : <p className="muted">–</p>}
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>{t('Name')}</dt><dd>{view.name}</dd>
            <dt>{t('Purok')}</dt><dd>{view.purok || '–'}</dd>
            <dt>{t('Phone')}</dt><dd>{view.phone || '–'}</dd>
          </dl>
          <div className="modal-actions">
            <button className="btn" onClick={() => { setRejecting(view); }}>{t('Reject')}</button>
            <button className="btn primary" disabled={busy} onClick={() => approve(view)}>{t('Approve')}</button>
          </div>
        </Modal>
      )}

      {rejecting && (
        <Modal title={t('Reject with reason')} onClose={() => setRejecting(null)}>
          <div className="field">
            <label htmlFor="why">{t('Why is it being rejected?')}</label>
            <textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('Tell the resident what to fix, for example: "ID photo is blurry, please retake."')} />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setRejecting(null)}>{t('Cancel')}</button>
            <button className="btn danger" disabled={busy || !reason.trim()} onClick={reject}>{t('Reject')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
