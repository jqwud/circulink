import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, kg, useAct, useDateFormat, useLoad } from '../../components.jsx';

// Reusable items at the hubs, for approved partner organizations. Who gave them is never shown.
export default function Browse() {
  const { t, lang } = useI18n();
  const date = useDateFormat();
  const nav = useNavigate();
  const [hub, setHub] = useState('');
  const [picked, setPicked] = useState([]);
  const [asking, setAsking] = useState(false);
  const hubs = useLoad(() => api('/hubs'), []);
  const stock = useLoad(() => api(`/stock${hub ? `?hub_id=${hub}` : ''}`), [hub]);
  if (stock.loading) return <Loading />;
  if (stock.error) return <ErrorBox error={stock.error} onRetry={stock.reload} />;
  const chosen = stock.data.filter((i) => picked.includes(i.id));
  const chosenHub = chosen[0]?.hub;
  const toggle = (i) => setPicked((p) => (p.includes(i.id) ? p.filter((x) => x !== i.id) : [...p, i.id]));
  const name = (c) => (lang === 'fil' ? c.name_fil : c.name_en);

  return (
    <>
      <PageHeader title={t('Available items')} subtitle={t('Reusable items sorted at the hubs. Choose items from one hub, then ask for them.')}>
        <label htmlFor="hub" className="sr-only">{t('Hub')}</label>
        <select id="hub" value={hub} onChange={(e) => { setHub(e.target.value); setPicked([]); }}>
          <option value="">{t('All hubs')}</option>
          {(hubs.data || []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </PageHeader>
      <section className="card">
        {!stock.data.length ? <Empty>{t('No items in stock right now. Check again later.')}</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th scope="col" className="check-cell"><span className="sr-only">{t('Choose')}</span></th><th scope="col">{t('Item')}</th><th scope="col">{t('Hub')}</th><th scope="col">{t('Weight')}</th><th scope="col">{t('Notes')}</th></tr></thead>
            <tbody>{stock.data.map((i) => {
              const otherHub = chosenHub && chosenHub.id !== i.hub.id;
              return (
                <tr key={i.id}>
                  <td className="check-cell"><input type="checkbox" aria-label={`${t('Choose')} ${name(i.category)} ${i.id}`} disabled={otherHub} checked={picked.includes(i.id)} onChange={() => toggle(i)} /></td>
                  <td>{name(i.category)}{i.description ? `: ${i.description}` : ''}</td>
                  <td>{i.hub.name}</td>
                  <td>{kg(i.weight_kg)}</td>
                  <td>
                    {i.outcome === 'repair' && <Badge value="info" label={t('Repaired')} />}
                    {i.category.food && <Badge value="warn" label={`${t('expires')} ${date(i.expiry_date)}`} />}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {chosen.length > 0 && (
          <div className="summary-bar">
            <span>{chosen.length} {t('chosen')} · {kg(chosen.reduce((a, i) => a + i.weight_kg, 0))} · {chosenHub.name}</span>
            <button className="btn primary" onClick={() => setAsking(true)}>{t('Ask for these items')}</button>
          </div>
        )}
      </section>
      {asking && <AskModal items={chosen} hub={chosenHub} onClose={() => setAsking(false)} onDone={() => nav('/requests')} />}
    </>
  );
}

function AskModal({ items, hub, onClose, onDone }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const [note, setNote] = useState('');
  return (
    <Modal title={t('Ask for these items')} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        run(() => api('/releases', { method: 'POST', body: { hub_id: hub.id, item_ids: items.map((i) => i.id), note: note || undefined } }),
          t('Request sent. The hub will hand the items over.'), onDone);
      }}>
        <p>{items.length} {t('items')} · {kg(items.reduce((a, i) => a + i.weight_kg, 0))} · {hub.name}</p>
        <div className="field">
          <label htmlFor="note">{t('Note for the hub (optional)')}</label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder={t('For example: who will pick them up, and when')} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy}>{t('Send request')}</button>
        </div>
      </form>
    </Modal>
  );
}
