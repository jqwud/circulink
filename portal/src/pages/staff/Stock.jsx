import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, Modal, PageHeader, Tabs, kg, useAct, useLoad } from '../../components.jsx';

const STATES = ['in_stock', 'in_repair', 'in_recycle_batch'];
// Where an item can go from each state. Points can only go down (the server checks this too).
const MOVES = {
  in_repair: ['in_stock', 'in_recycle_batch', 'rejected'],
  in_stock: ['in_repair', 'in_recycle_batch', 'rejected'],
  in_recycle_batch: ['in_stock', 'rejected'],
};

// Everything at my hubs that is not final yet, the repair queue, and recycle batches.
export default function Stock() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState('in_stock');
  const [picked, setPicked] = useState([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const items = useLoad(() => api('/staff/stock'), []);
  const batches = useLoad(() => api('/staff/recycle-batches'), []);
  const { run, busy } = useAct();
  const reloadAll = async () => { setPicked([]); await Promise.all([items.reload(), batches.reload()]); };

  if (items.loading) return <Loading />;
  if (items.error) return <ErrorBox error={items.error} onRetry={items.reload} />;
  const shown = items.data.filter((i) => i.state === tab);
  const count = (s) => items.data.filter((i) => i.state === s).length;
  const free = (i) => !i.requested_in && !i.in_batch;
  const pickable = tab === 'in_recycle_batch' ? shown.filter(free) : [];
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const name = (c) => (lang === 'fil' ? c.name_fil : c.name_en);

  return (
    <>
      <PageHeader title={t('Stock and recycling')} subtitle={t('Items sorted at your hubs that have not reached their new home yet.')} />
      <Tabs value={tab} onChange={(v) => { setTab(v); setPicked([]); }} tabs={STATES.map((s) => ({ value: s, label: t(s), count: count(s) }))} />
      <section className="card">
        {!shown.length ? <Empty>{t('Nothing here right now.')}</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr>
              {tab === 'in_recycle_batch' && <th scope="col" className="check-cell"><span className="sr-only">{t('Choose')}</span></th>}
              <th scope="col">{t('Item')}</th><th scope="col">{t('Hub')}</th><th scope="col">{t('Weight')}</th><th scope="col">{t('Status')}</th><th scope="col">{t('Move to')}</th>
            </tr></thead>
            <tbody>{shown.map((i) => (
              <tr key={i.id}>
                {tab === 'in_recycle_batch' && (
                  <td className="check-cell">
                    {free(i) && <input type="checkbox" aria-label={`${t('Choose')} ${name(i.category)} ${i.id}`} checked={picked.includes(i.id)} onChange={() => toggle(i.id)} />}
                  </td>
                )}
                <td>{name(i.category)}{i.description ? `: ${i.description}` : ''} {i.category.hazardous && <Badge value="urgent" label={t('Hazardous')} />}</td>
                <td>{i.hub.name}</td>
                <td>{kg(i.weight_kg)}</td>
                <td>{i.requested_in ? <Badge value="pending" label={t('Requested by a partner')} /> : i.in_batch ? <Badge value="info" label={`${t('In batch')} #${i.in_batch}`} /> : <Badge value={i.outcome} label={t(i.outcome)} />}</td>
                <td>
                  {free(i) && (
                    <select aria-label={`${t('Move to')}: ${name(i.category)} ${i.id}`} value="" disabled={busy}
                      onChange={(e) => e.target.value && run(() => api(`/staff/items/${i.id}/move`, { method: 'POST', body: { to: e.target.value } }),
                        (r) => `${t('Moved')}. ${r.points} ${t('points')}`, reloadAll)}>
                      <option value="">{t('Choose')}</option>
                      {MOVES[i.state].map((m) => <option key={m} value={m}>{t(m)}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {pickable.length > 0 && (
          <div className="summary-bar">
            <span>{picked.length} {t('chosen')} · {kg(shown.filter((i) => picked.includes(i.id)).reduce((a, i) => a + i.weight_kg, 0))}</span>
            <button className="btn primary" disabled={!picked.length} onClick={() => setBatchOpen(true)}>{t('Make a recycle batch')}</button>
          </div>
        )}
      </section>

      <Batches data={batches} onSent={reloadAll} />
      {batchOpen && <NewBatch items={shown.filter((i) => picked.includes(i.id))} onClose={() => setBatchOpen(false)} onMade={async () => { setBatchOpen(false); await reloadAll(); }} />}
    </>
  );
}

function NewBatch({ items, onClose, onMade }) {
  const { t } = useI18n();
  const recyclers = useLoad(() => api('/staff/recyclers'), []);
  const [recycler, setRecycler] = useState('');
  const { run, busy } = useAct();
  const hubs = [...new Set(items.map((i) => i.hub.id))];
  const hazardous = items.some((i) => i.category.hazardous);
  return (
    <Modal title={t('Make a recycle batch')} onClose={onClose}>
      {hubs.length > 1 ? <p className="form-error">{t('A batch holds items from one hub. Choose items from one hub only.')}</p> : (
        <form onSubmit={(e) => {
          e.preventDefault();
          run(() => api('/staff/recycle-batches', { method: 'POST', body: { hub_id: hubs[0], recycler_id: Number(recycler), item_ids: items.map((i) => i.id) } }), t('Batch made.'), onMade);
        }}>
          <p>{items.length} {t('items')} · {kg(items.reduce((a, i) => a + i.weight_kg, 0))}</p>
          {hazardous && <p className="note">{t('This batch has e-waste or batteries: only an accredited recycler can take it.')}</p>}
          <div className="field">
            <label htmlFor="recycler">{t('Recycler')}</label>
            <select id="recycler" value={recycler} onChange={(e) => setRecycler(e.target.value)} required>
              <option value="">{t('Choose')}</option>
              {(recyclers.data || []).map((r) => (
                <option key={r.id} value={r.id} disabled={hazardous && !r.accredited}>{r.name}{r.accredited ? ` (${t('accredited')})` : ''}</option>
              ))}
            </select>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
            <button className="btn primary" disabled={busy || !recycler}>{t('Make batch')}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function Batches({ data, onSent }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const [sending, setSending] = useState(null);
  if (data.loading) return null;
  return (
    <section className="card">
      <h2>{t('Recycle batches')}</h2>
      {data.error ? <ErrorBox error={data.error} onRetry={data.reload} /> : !data.data.length ? <Empty>{t('No batches yet.')}</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">#</th><th scope="col">{t('Recycler')}</th><th scope="col">{t('Hub')}</th><th scope="col">{t('Items')}</th><th scope="col">{t('Weight')}</th><th scope="col">{t('Status')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
          <tbody>{data.data.map((b) => (
            <tr key={b.id}>
              <td>{b.id}</td><td>{b.recycler_name}{b.accredited ? ` (${t('accredited')})` : ''}</td><td>{b.hub_name}</td><td>{b.items}</td><td>{kg(b.total_kg)}</td>
              <td><Badge value={b.status === 'sent' ? 'approved' : 'open'} label={t(b.status === 'sent' ? 'Sent' : 'Open')} /></td>
              <td>{b.status === 'open' && (
                <button className="btn small primary" disabled={busy} onClick={() => setSending(b)}>
                  {t('Mark as sent')}
                </button>
              )}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {sending && (
        <ConfirmModal title={t('Mark this batch as sent?')}
          message={t('Do this only after the recycler has picked it up. The residents get their points and this cannot be undone.')}
          confirmLabel={t('Mark as sent')} onClose={() => setSending(null)}
          onConfirm={() => run(() => api(`/staff/recycle-batches/${sending.id}/send`, { method: 'POST' }), t('Batch sent. Points confirmed.'), async () => { await data.reload(); await onSent(); })} />
      )}
    </section>
  );
}
