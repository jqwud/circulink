import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, Modal, PageHeader, useLoad, useToast, useDateFormat } from '../components.jsx';

export default function Residents() {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useDateFormat();
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');
  const { data, loading, error, reload } = useLoad(
    () => api(`/admin/users?${new URLSearchParams({ ...(status && { status }), ...(text && { q: text }) })}`), [status, text]);
  const [openId, setOpenId] = useState(null);
  const detail = useLoad(() => (openId ? api(`/admin/users/${openId}`) : Promise.resolve(null)), [openId]);

  const [confirming, setConfirming] = useState(null);

  async function toggle(u) {
    try {
      await api(`/admin/users/${u.id}/${u.suspended ? 'reinstate' : 'suspend'}`, { method: 'POST' });
      toast(u.suspended ? t('Reinstated.') : t('Suspended.')); reload(); detail.reload();
    } catch (e) { toast(e.message, 'bad'); }
  }
  // Suspending locks a resident out, so it asks first. Reinstating is safe and happens at once.
  const askToggle = (u) => (u.suspended ? toggle(u) : setConfirming(u));

  return (
    <>
      <PageHeader title={t('Residents')} />
      <div className="toolbar">
        <input type="search" placeholder={t('Search name, email or phone')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Search')} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')}>
          <option value="">{t('All')}</option>
          {['pending', 'approved', 'rejected', 'unverified'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (data.length === 0 ? <div className="card"><Empty>{t('Nothing here yet.')}</Empty></div> : (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('Name')}</th><th>{t('Purok')}</th><th>{t('Status')}</th><th>{t('Credits')}</th><th>{t('Items listed')}</th><th>{t('Loans done')}</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b><small>{u.email}{u.phone ? ` · ${u.phone}` : ''}</small></td>
                  <td>{u.purok || '–'}</td>
                  <td><Badge value={u.verification_status} />{u.suspended && <> <Badge value="suspended" /></>}</td>
                  <td>{u.credits}</td>
                  <td>{u.items}</td>
                  <td>{u.loans}</td>
                  <td><button className="btn small" onClick={() => setOpenId(u.id)}>{t('View')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {openId && (
        <Modal title={detail.data?.user?.name || t('Resident')} onClose={() => setOpenId(null)} wide>
          {detail.loading && !detail.data && <Loading />}
          {detail.data && (
            <>
              <dl className="kv">
                <dt>Email</dt><dd>{detail.data.user.email}</dd>
                <dt>{t('Phone')}</dt><dd>{detail.data.user.phone || '–'}</dd>
                <dt>{t('Purok')}</dt><dd>{detail.data.user.purok || '–'}</dd>
                <dt>{t('Status')}</dt><dd><Badge value={detail.data.user.verification_status} />{detail.data.user.suspended && <> <Badge value="suspended" /></>}</dd>
                <dt>{t('Credits')}</dt><dd>{detail.data.user.credits}</dd>
                <dt>{t('Registered')}</dt><dd>{fmt(detail.data.user.created_at)}</dd>
              </dl>
              <h3 style={{ marginTop: 18 }}>{t('Loan history')}</h3>
              {detail.data.history.length === 0 ? <p className="muted">{t('Nothing here yet.')}</p> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('Item')}</th><th /><th>{t('Dates')}</th><th>{t('Status')}</th></tr></thead>
                  <tbody>{detail.data.history.map((h) => (
                    <tr key={h.id}><td>{h.item.title}</td><td><small>{h.my_role === 'owner' ? '→ ' + h.borrower.name : '← ' + (h.owner?.name || 'Shelf')}</small></td>
                      <td>{fmt(h.start_date)} – {fmt(h.end_date)}</td><td><Badge value={h.status} /></td></tr>
                  ))}</tbody>
                </table></div>
              )}
              <h3 style={{ marginTop: 18 }}>{t('Credit history')}</h3>
              {detail.data.ledger.length === 0 ? <p className="muted">{t('Nothing here yet.')}</p> : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {detail.data.ledger.map((l, i) => <li key={i}><b>{l.amount > 0 ? '+' : ''}{l.amount}</b> {t(l.reason)} <span className="muted">· {fmt(l.created_at)}</span></li>)}
                </ul>
              )}
              <div className="modal-actions">
                <button className={`btn ${detail.data.user.suspended ? '' : 'danger'}`} onClick={() => askToggle(detail.data.user)}>
                  {detail.data.user.suspended ? t('Reinstate') : t('Suspend')}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}

      {confirming && (
        <ConfirmModal
          title={t('Suspend {name}?').replace('{name}', confirming.name)}
          message={t('They cannot use Hiraman until you reinstate them.')}
          confirmLabel={t('Suspend')}
          danger
          onConfirm={() => toggle(confirming)}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
