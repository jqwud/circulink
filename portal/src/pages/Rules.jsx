import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Badge, ConfirmModal, ErrorBox, Loading, Modal, PageHeader, useLoad, useToast } from '../components.jsx';

const RULE_LABELS = {
  starterCredits: 'Starter credits', costLowMedium: 'Cost of an ordinary item (low or medium)', costHigh: 'Cost of a valuable item (high)',
  shelfCost: 'Shelf item cost', lenderReward: 'Lender reward', latePenalty: 'Late return penalty', pairRewardCapPerMonth: 'Monthly reward cap per pair',
  maxLoanDays: 'Maximum loan days', pendingExpiryDays: 'Days before an unanswered request expires', checkinAlertAfterMissedDays: 'Missed check-ins before the owner is alerted',
};

// Admins change the rule numbers within safe limits. A confirm step shows exactly what changes; every change is audited.
function EditRules({ onClose, onSaved }) {
  const { t } = useI18n();
  const toast = useToast();
  const list = useLoad(() => api('/admin/settings'), []);
  const [values, setValues] = useState({});
  const [confirming, setConfirming] = useState(false);
  const rows = list.data || [];
  const changed = rows.filter((r) => values[r.key] !== undefined && Number(values[r.key]) !== r.value);
  async function save() {
    const body = Object.fromEntries(changed.map((r) => [r.key, Number(values[r.key])]));
    try { await api('/admin/settings', { method: 'PUT', body }); toast(t('Rules updated. The app uses them right away.')); onSaved(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  return (
    <Modal title={t('Change rule numbers')} onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0 }}>{t('Changes apply right away to new requests and returns. Every change is written to the audit log.')}</p>
      {list.loading && !list.data && <Loading />}
      <div className="grid two">
        {rows.map((r) => (
          <div className="field" key={r.key}>
            <label htmlFor={`rule-${r.key}`}>{t(RULE_LABELS[r.key] || r.key)}</label>
            <input id={`rule-${r.key}`} type="number" min={r.min} max={r.max} step={1}
              value={values[r.key] ?? r.value} onChange={(e) => setValues({ ...values, [r.key]: e.target.value })} />
            <small className="muted">{t('Allowed')}: {r.min}–{r.max} · {t('Default')}: {r.default}</small>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary" disabled={!changed.length} onClick={() => setConfirming(true)}>{t('Review changes')}</button>
      </div>
      {confirming && (
        <ConfirmModal
          title={t('Change these rules?')}
          message={changed.map((r) => `${t(RULE_LABELS[r.key] || r.key)}: ${r.value} → ${Number(values[r.key])}`).join(' · ')}
          confirmLabel={t('Save')}
          onConfirm={save}
          onClose={() => setConfirming(false)}
        />
      )}
    </Modal>
  );
}

// The puroks residents choose from at sign-up. Removing one keeps it on the accounts that already have it.
function Puroks() {
  const { t } = useI18n();
  const toast = useToast();
  const list = useLoad(() => api('/admin/puroks'), []);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState(null);
  async function add(e) {
    e.preventDefault();
    try { await api('/admin/puroks', { method: 'POST', body: { name } }); setName(''); toast(t('Purok added.')); list.reload(); }
    catch (err) { toast(err.message, 'bad'); }
  }
  async function remove(p) {
    try { await api(`/admin/puroks/${encodeURIComponent(p)}`, { method: 'DELETE' }); toast(t('Purok removed.')); list.reload(); }
    catch (err) { toast(err.message, 'bad'); }
  }
  return (
    <div className="card">
      <h2>{t('Puroks')}</h2>
      <p className="muted">{t('Residents choose one of these when they sign up.')}</p>
      <div className="tag-list">
        {(list.data || []).map((p) => (
          <span className="tag" key={p}>{p} <button type="button" className="icon-btn" aria-label={`${t('Remove')} ${p}`} onClick={() => setRemoving(p)}>×</button></span>
        ))}
      </div>
      <form onSubmit={add} className="row" style={{ marginTop: 12 }}>
        <input className="grow" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('New purok name')} aria-label={t('New purok name')} maxLength={60} />
        <button className="btn primary">{t('Add')}</button>
      </form>
      {removing && (
        <ConfirmModal
          title={t('Remove {name}?').replace('{name}', removing)}
          message={t('New residents will not see it. People who already chose it keep it.')}
          confirmLabel={t('Remove')}
          danger
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

export default function Rules() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data: d, loading, error, reload } = useLoad(() => api('/admin/rules'), []);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const r = d.rules;
  return (
    <>
      <PageHeader title={t('Rules and settings')} subtitle={t('Admins can change the rule numbers. Every change is written to the audit log.')}>
        {user.role === 'lgu_admin' && <button className="btn primary" onClick={() => setEditing(true)}>{t('Change numbers')}</button>}
      </PageHeader>
      {editing && <EditRules onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
      <div className="grid two">
        <div className="card">
          <h2>{t('Credit rules')}</h2>
          <dl className="kv">
            <dt>{t('Starter credits')}</dt><dd>{r.starterCredits}</dd>
            <dt>{t('Lender reward')}</dt><dd>+{r.lenderReward}</dd>
            <dt>{t('Late return penalty')}</dt><dd>−{r.latePenalty}</dd>
            <dt>{t('Maximum loan days')}</dt><dd>{r.maxLoanDays}</dd>
            <dt>{t('Monthly reward cap per pair')}</dt><dd>{r.pairRewardCapPerMonth}</dd>
            <dt>{t('Shelf item cost')}</dt><dd>{r.shelfCost}</dd>
            <dt>{t('low')} / {t('medium')}</dt><dd>{r.costLowMedium}</dd>
            <dt>{t('high')}</dt><dd>{r.costHigh}</dd>
            <dt>{t('Days before an unanswered request expires')}</dt><dd>{r.pendingExpiryDays}</dd>
            <dt>{t('Missed check-ins before the owner is alerted')}</dt><dd>{r.checkinAlertAfterMissedDays}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>{t('Prohibited words in listings')}</h2>
          <div className="tag-list">{d.prohibited_words.map((w) => <span className="tag" key={w}>{w}</span>)}</div>
        </div>
      </div>
      <div className="card flush table-wrap">
        <table>
          <thead><tr><th>{t('Tier')}</th><th>{t('Example')}</th><th>{t('Approval')}</th><th>{t('Handover')}</th></tr></thead>
          <tbody>{d.tiers.map((x) => <tr key={x.tier}><td><Badge value={x.tier} /></td><td>{x.example}</td><td>{x.approval}</td><td>{x.handover}</td></tr>)}</tbody>
        </table>
      </div>
      <Puroks />
      <div className="card">
        <h2>{t('Pickup points')}</h2>
        <dl className="kv">{d.pickup_points.map((p) => <Fragment key={p.id}><dt>{p.name}</dt><dd>{p.hours} <span className="muted">· {p.note}</span></dd></Fragment>)}</dl>
      </div>
    </>
  );
}
