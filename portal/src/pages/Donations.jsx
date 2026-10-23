import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, useLoad, useToast } from '../components.jsx';

// Donations (free to take). Staff choose who receives barangay-chosen gifts (priority households first),
// follow the open handovers, and accept unclaimed gifts at the hall as Barangay Shelf items.
// Residents never see who is a priority household; the reason is not stored.
export default function Donations() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api('/admin/donations'), []);
  const [choosing, setChoosing] = useState(null);

  async function accept(item) {
    try { await api(`/admin/donations/${item.id}/accept-shelf`, { method: 'POST' }); toast(t('Added to the Barangay Shelf.')); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function confirm(claim, action) {
    try { await api(`/donations/claims/${claim.claim_id}/${action}`, { method: 'POST' }); toast(t('Saved.')); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <PageHeader title={t('Donations')} subtitle={t('Gifts between neighbors. Choose who receives barangay-chosen gifts, families in need first, and help with handovers.')} />
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="card">
            <h2>{t('Waiting for the barangay to choose')}</h2>
            {data.choose.length === 0 ? <Empty>{t('Nothing to choose right now.')}</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{t('Item')}</th><th>{t('Asked by')}</th><th><span className="sr-only">{t('Actions')}</span></th></tr></thead>
                <tbody>
                  {data.choose.map((x) => (
                    <tr key={x.item.id}>
                      <td><b>{x.item.title}</b><small>{x.item.owner ? `${t('From')} ${x.item.owner.name}` : t('Barangay')}{x.ready ? '' : ` · ${t('residents can still ask')}`}</small></td>
                      <td>{x.asked.length === 0 ? <span className="muted">{t('Nobody yet')}</span>
                        : x.asked.map((a) => <div key={a.user_id}>{a.full_name} <small className="muted">{a.purok}</small>{a.priority && <> <Badge value="info" label={t('Priority household')} /></>}</div>)}</td>
                      <td><button className="btn small primary" onClick={() => setChoosing(x)}>{t('Choose')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          <div className="card">
            <h2>{t('Handovers in progress')}</h2>
            {data.reserved.length === 0 ? <Empty>{t('No open handovers.')}</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{t('Item')}</th><th>{t('To')}</th><th>{t('Pickup day')}</th><th>{t('Confirmed')}</th><th><span className="sr-only">{t('Actions')}</span></th></tr></thead>
                <tbody>
                  {data.reserved.map((c) => (
                    <tr key={c.claim_id}>
                      <td><b>{c.item.title}</b>{c.staff_delivery && <small>{t('Barangay delivers')}</small>}</td>
                      <td>{c.to}<small>{c.purok}</small></td>
                      <td>{c.pickup_date || '–'}</td>
                      <td>{t('Donor')}: {c.donor_confirmed ? '✓' : '–'} · {t('Receiver')}: {c.claimer_confirmed ? '✓' : '–'}</td>
                      <td>
                        {!c.item.owner && !c.donor_confirmed && <button className="btn small" onClick={() => confirm(c, 'given')}>{t('Barangay gave it')}</button>}
                        {c.staff_delivery && !c.claimer_confirmed && <> <button className="btn small" onClick={() => confirm(c, 'received')}>{t('Delivered')}</button></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          <div className="card">
            <h2>{t('Brought to the hall, or unclaimed')}</h2>
            {data.to_shelf.length + data.unclaimed.length === 0 ? <Empty>{t('Nothing here yet.')}</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{t('Item')}</th><th>{t('Status')}</th><th><span className="sr-only">{t('Actions')}</span></th></tr></thead>
                <tbody>
                  {[...data.to_shelf, ...data.unclaimed].map((i) => (
                    <tr key={i.id}>
                      <td><b>{i.title}</b><small>{i.owner ? `${t('From')} ${i.owner.name}` : ''}</small></td>
                      <td><Badge value={i.donation_status === 'to_shelf' ? 'info' : 'warn'} label={i.donation_status === 'to_shelf' ? t('Donor is bringing it to the hall') : t('Unclaimed')} /></td>
                      <td><button className="btn small" onClick={() => accept(i)}>{t('Received at the hall: add to Shelf')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </>
      )}
      {choosing && <ChooseModal row={choosing} onClose={() => setChoosing(null)} onDone={() => { setChoosing(null); reload(); }} />}
    </>
  );
}

// Choose one resident: someone who asked (priority households are listed first), or any resident by search.
function ChooseModal({ row, onClose, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [userId, setUserId] = useState(row.asked[0]?.user_id || '');
  const [delivery, setDelivery] = useState(false);
  const [q, setQ] = useState('');
  const found = useLoad(() => (q.trim().length >= 2 ? api(`/admin/users?status=approved&q=${encodeURIComponent(q.trim())}`) : Promise.resolve([])), [q]);
  async function save() {
    try {
      await api(`/admin/donations/${row.item.id}/choose`, { method: 'POST', body: { user_id: Number(userId), staff_delivery: delivery } });
      toast(t('Chosen. Everyone involved was told.')); onDone();
    } catch (e) { toast(e.message, 'bad'); }
  }
  const options = [...row.asked.map((a) => ({ id: a.user_id, label: `${a.full_name} · ${a.purok}${a.priority ? ` · ${t('Priority household')}` : ''}` })),
    ...(found.data || []).filter((u) => !row.asked.some((a) => a.user_id === u.id)).map((u) => ({ id: u.id, label: `${u.name} · ${u.purok || '–'}` }))];
  return (
    <Modal title={`${t('Who receives')} ${row.item.title}?`} onClose={onClose}>
      <div className="field">
        <label htmlFor="who">{t('Resident')}</label>
        <select id="who" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">{t('Choose a resident')}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="find">{t('Or find another resident (for example a family in need who did not ask)')}</label>
        <input id="find" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Name')} />
      </div>
      <label className="row"><input type="checkbox" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} /> {t('The barangay delivers it (the donor brings it to the hall)')}</label>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary" disabled={!userId} onClick={save}>{t('Choose')}</button>
      </div>
    </Modal>
  );
}
