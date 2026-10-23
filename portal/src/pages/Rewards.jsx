import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, Modal, PageHeader, useLoad, useToast } from '../components.jsx';

// Food rewards: rice and fresh vegetables from local producers, paid for by the LGU. Staff hand out vouchers by
// code at the hall, check Gold (and flagged) vouchers, and record the stock the LGU buys. Every change is audited.
export default function Rewards() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const admin = user.role === 'lgu_admin';
  const { data, loading, error, reload } = useLoad(() => api('/admin/rewards'), []);
  const [month, setMonth] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7));
  const report = useLoad(() => api(`/admin/rewards/report?month=${month}`), [month]);
  const [stockFor, setStockFor] = useState(null);
  const [newReward, setNewReward] = useState(false);
  const [newSupplier, setNewSupplier] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [issuing, setIssuing] = useState(false);
  const name = (c) => (lang === 'fil' ? c.name_fil : c.name_en);

  async function release(v) {
    try { await api(`/admin/vouchers/${v.id}/release`, { method: 'POST' }); toast(t('Released. The resident was told.')); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function issueNow() {
    try { const r = await api('/admin/rewards/issue', { method: 'POST' }); toast(t('{n} vouchers issued.').replace('{n}', r.vouchers)); setIssuing(false); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <PageHeader title={t('Rewards')} subtitle={t('Rice and fresh vegetables from local producers, paid for by the LGU, for reliable lenders. Bronze 1, Silver 2, Gold 3 vouchers each quarter.')}>
        {admin && <button className="btn" onClick={() => setIssuing(true)}>{t('Issue vouchers now')}</button>}
      </PageHeader>
      <HandOut catalog={data?.catalog || []} onDone={() => { reload(); report.reload(); }} />
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="card">
            <h2>{t('Waiting for a staff check')}</h2>
            <p className="muted">{t('Gold vouchers, and anyone with a signal on the Tiwala page, wait here. Check with the people involved, then release.')}</p>
            {data.held.length === 0 ? <Empty>{t('Nothing waiting.')}</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{t('Resident')}</th><th>{t('Tier')}</th><th>{t('Signals')}</th><th><span className="sr-only">{t('Actions')}</span></th></tr></thead>
                <tbody>{data.held.map((v) => {
                  const signals = typeof v.signals === 'string' ? JSON.parse(v.signals) : (v.signals || []);
                  return (
                    <tr key={v.id}>
                      <td><b>{v.name}</b><small>{v.purok} · {v.period}</small></td>
                      <td>{t(`tier_${v.tier}`)}</td>
                      <td>{signals.length ? signals.map((s) => <Badge key={s} value="bad" label={t(`signal_${s}`)} />) : <span className="muted">{t('None')}</span>}</td>
                      <td>
                        <button className="btn small primary" onClick={() => release(v)}>{t('Release')}</button>
                        {admin && <> <button className="btn small danger" onClick={() => setCancelling(v)}>{t('Cancel')}</button></>}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </div>

          <div className="card">
            <h2>{t('Rewards and stock')}</h2>
            {admin && <button className="btn small" onClick={() => setNewReward(true)}>+ {t('Add a reward')}</button>}
            {data.catalog.length === 0 ? <Empty>{t('No rewards yet. Add rice or vegetables first.')}</Empty> : (
              <div className="table-wrap"><table>
                <thead><tr><th>{t('Reward')}</th><th>{t('Producer')}</th><th>{t('In stock')}</th><th>{t('Value per unit (₱)')}</th><th><span className="sr-only">{t('Actions')}</span></th></tr></thead>
                <tbody>{data.catalog.map((c) => (
                  <tr key={c.id}>
                    <td><b>{name(c)}</b>{!c.active && <> <Badge value="muted" label={t('Retired')} /></>}</td>
                    <td>{c.supplier || '–'}</td>
                    <td>{c.stock === 0 ? <Badge value="warn" label="0" /> : c.stock}</td>
                    <td>{c.value_estimate}</td>
                    <td><button className="btn small" onClick={() => setStockFor(c)}>{t('Record stock')}</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>

          <div className="card">
            <h2>{t('Local producers')}</h2>
            {admin && <button className="btn small" onClick={() => setNewSupplier(true)}>+ {t('Add a producer')}</button>}
            {data.suppliers.length === 0 ? <Empty>{t('No producers yet.')}</Empty> : (
              <ul className="plain">{data.suppliers.map((s) => <li key={s.id}><b>{s.name}</b> <span className="muted">· {t(`kind_${s.kind}`)}{s.contact_name ? ` · ${s.contact_name}` : ''}{s.phone ? ` · ${s.phone}` : ''}</span></li>)}</ul>
            )}
          </div>
        </>
      )}

      <div className="card">
        <h2>{t('Monthly report')}</h2>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor="month">{t('Month')}</label>
          <input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {report.data && (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th>{t('Reward')}</th><th>{t('Producer')}</th><th>{t('Bought')}</th><th>{t('Handed out')}</th><th>{t('Returned')}</th><th>{t('Value given (₱)')}</th></tr></thead>
              <tbody>{report.data.lines.map((l) => (
                <tr key={l.id}><td>{l.name_en}</td><td>{l.supplier || '–'}</td><td>{l.bought}</td><td>{l.reserved}</td><td>{l.returned}</td><td>{l.value_given}</td></tr>
              ))}</tbody>
            </table></div>
            <h3>{t('Phone to confirm (about 5% of collections, picked at random)')}</h3>
            {report.data.call_back.length === 0 ? <p className="muted">{t('No collections this month.')}</p> : (
              <ul className="plain">{report.data.call_back.map((c) => <li key={c.voucher_id}>{c.name} · {c.phone || '–'} · {c.reward}</li>)}</ul>
            )}
          </>
        )}
      </div>

      {stockFor && <StockModal reward={stockFor} onClose={() => setStockFor(null)} onDone={() => { setStockFor(null); reload(); report.reload(); }} />}
      {newReward && <RewardModal suppliers={data?.suppliers || []} onClose={() => setNewReward(false)} onDone={() => { setNewReward(false); reload(); }} />}
      {newSupplier && <SupplierModal onClose={() => setNewSupplier(false)} onDone={() => { setNewSupplier(false); reload(); }} />}
      {cancelling && <CancelModal voucher={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); reload(); }} />}
      {issuing && (
        <ConfirmModal
          title={t('Issue vouchers now?')}
          message={t('Everyone who has a tier in today’s Tiwala scores gets vouchers (Gold waits for a check). Normally this happens by itself on the first day of each quarter. Nobody gets twice.')}
          confirmLabel={t('Issue vouchers')}
          onConfirm={issueNow}
          onClose={() => setIssuing(false)}
        />
      )}
    </>
  );
}

// At the hall: type the code a resident (or a family member) shows, check first name and purok, hand it out.
function HandOut({ catalog, onDone }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [found, setFound] = useState(null);
  const [choice, setChoice] = useState('');
  async function look(e) {
    e.preventDefault();
    try { setFound(await api(`/admin/vouchers/code/${encodeURIComponent(code.replace(/\s/g, ''))}`)); setChoice(''); }
    catch (err) { setFound(null); toast(err.message, 'bad'); }
  }
  async function give() {
    try {
      const r = await api(`/admin/vouchers/code/${found.code}/give`, { method: 'POST', body: choice ? { catalog_id: Number(choice) } : {} });
      toast(t('Handed out: {item}.').replace('{item}', r.reward)); setFound(null); setCode(''); onDone();
    } catch (err) { toast(err.message, 'bad'); }
  }
  const inStock = catalog.filter((c) => c.active && c.stock > 0);
  return (
    <div className="card">
      <h2>{t('Hand out a reward')}</h2>
      <form onSubmit={look} className="row">
        <label className="sr-only" htmlFor="code">{t('Voucher code')}</label>
        <input id="code" className="grow" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('6-digit code')} maxLength={7} />
        <button className="btn primary">{t('Look up')}</button>
      </form>
      {found && (
        <div style={{ marginTop: 12 }}>
          <dl className="kv">
            <dt>{t('Resident')}</dt><dd>{found.resident.first_name} · {found.resident.purok}</dd>
            <dt>{t('Tier')}</dt><dd>{t(`tier_${found.tier}`)}</dd>
            <dt>{t('Status')}</dt><dd><Badge value={found.status === 'chosen' || found.status === 'issued' ? 'ok' : 'muted'} label={t(`voucher_${found.status}`)} /></dd>
            <dt>{t('Reward')}</dt><dd>{found.reward ? (lang === 'fil' ? found.reward.name_fil : found.reward.name_en) : t('Not chosen yet')}</dd>
          </dl>
          {found.status === 'issued' && (
            <div className="field">
              <label htmlFor="choice">{t('Choose with the resident')}</label>
              <select id="choice" value={choice} onChange={(e) => setChoice(e.target.value)}>
                <option value="">–</option>
                {inStock.map((c) => <option key={c.id} value={c.id}>{lang === 'fil' ? c.name_fil : c.name_en} ({c.stock})</option>)}
              </select>
            </div>
          )}
          {['issued', 'chosen'].includes(found.status) && (
            <button className="btn primary" disabled={found.status === 'issued' && !choice} onClick={give}>{t('Hand it out')}</button>
          )}
        </div>
      )}
    </div>
  );
}

function StockModal({ reward, onClose, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('purchase');
  const [note, setNote] = useState('');
  async function save() {
    try { await api(`/admin/rewards/catalog/${reward.id}/stock`, { method: 'POST', body: { qty: Number(qty), reason, note } }); toast(t('Stock saved.')); onDone(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <Modal title={`${t('Record stock')}: ${reward.name_en}`} onClose={onClose}>
      <div className="field"><label htmlFor="rs">{t('What happened')}</label>
        <select id="rs" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="purchase">{t('The LGU bought more')}</option>
          <option value="correction">{t('Correct the count')}</option>
        </select></div>
      <div className="field"><label htmlFor="rq">{t('Units')} {reason === 'correction' ? t('(use minus for fewer)') : ''}</label><input id="rq" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
      <div className="field"><label htmlFor="rn">{t('Note, for example the receipt number')}</label><input id="rn" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn primary" disabled={!qty} onClick={save}>{t('Save')}</button></div>
    </Modal>
  );
}

function RewardModal({ suppliers, onClose, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ name_en: '', name_fil: '', supplier_id: '', value_estimate: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    try {
      await api('/admin/rewards/catalog', { method: 'POST', body: { ...f, supplier_id: f.supplier_id ? Number(f.supplier_id) : null, value_estimate: Number(f.value_estimate || 0) } });
      toast(t('Reward added.')); onDone();
    } catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <Modal title={t('Add a reward')} onClose={onClose}>
      <div className="field"><label htmlFor="ne">{t('Name in English (for example 2 kg rice)')}</label><input id="ne" value={f.name_en} onChange={(e) => set('name_en', e.target.value)} /></div>
      <div className="field"><label htmlFor="nf">{t('Name in Filipino (for example 2 kilong bigas)')}</label><input id="nf" value={f.name_fil} onChange={(e) => set('name_fil', e.target.value)} /></div>
      <div className="field"><label htmlFor="sp">{t('Producer')}</label>
        <select id="sp" value={f.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
          <option value="">–</option>{suppliers.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
      <div className="field"><label htmlFor="vv">{t('Value per unit (₱)')}</label><input id="vv" type="number" min="0" value={f.value_estimate} onChange={(e) => set('value_estimate', e.target.value)} /></div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn primary" onClick={save}>{t('Save')}</button></div>
    </Modal>
  );
}

function SupplierModal({ onClose, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ name: '', kind: 'farmer', contact_name: '', phone: '' });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function save() {
    try { await api('/admin/suppliers', { method: 'POST', body: f }); toast(t('Producer added.')); onDone(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <Modal title={t('Add a producer')} onClose={onClose}>
      <div className="field"><label htmlFor="sn">{t('Name')}</label><input id="sn" value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
      <div className="field"><label htmlFor="sk">{t('Kind')}</label>
        <select id="sk" value={f.kind} onChange={(e) => set('kind', e.target.value)}>
          {['farmer', 'fisherfolk', 'garden', 'program', 'other'].map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
        </select></div>
      <div className="field"><label htmlFor="sc">{t('Contact person')}</label><input id="sc" value={f.contact_name} onChange={(e) => set('contact_name', e.target.value)} /></div>
      <div className="field"><label htmlFor="sph">{t('Phone')}</label><input id="sph" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn primary" onClick={save}>{t('Save')}</button></div>
    </Modal>
  );
}

function CancelModal({ voucher, onClose, onDone }) {
  const { t } = useI18n();
  const toast = useToast();
  const [reason, setReason] = useState('');
  async function save() {
    try { await api(`/admin/vouchers/${voucher.id}/cancel`, { method: 'POST', body: { reason } }); toast(t('Voucher cancelled.')); onDone(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <Modal title={`${t('Cancel the voucher of')} ${voucher.name}?`} onClose={onClose}>
      <div className="field"><label htmlFor="cr">{t('Reason (the resident sees it)')}</label><textarea id="cr" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="modal-actions"><button className="btn" onClick={onClose}>{t('Back')}</button><button className="btn danger" disabled={reason.trim().length < 3} onClick={save}>{t('Cancel voucher')}</button></div>
    </Modal>
  );
}
