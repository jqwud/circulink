import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, Tabs, useDateFormat, useLoad, useToast } from '../components.jsx';

export default function Reports() {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useDateFormat();
  const [tab, setTab] = useState('open');
  const { data, loading, error, reload } = useLoad(() => api(tab === 'all' ? '/admin/reports' : `/admin/reports?status=${tab}`), [tab]);
  const rules = useLoad(() => api('/admin/rules'), []);
  const [sel, setSel] = useState(null);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [settle, setSettle] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (r) => { setSel(r); setNotes(r.mediator_notes || ''); setOutcome(r.outcome || ''); setSettle(''); };
  // A report about a disputed loan settles the loan too, so staff choose an outcome; credits follow it.
  const settling = sel?.target?.request_status === 'disputed' && sel.status !== 'resolved';
  const outcomes = rules.data?.dispute_outcomes || {};
  const effect = (k) => {
    const o = outcomes[k];
    if (!o) return '';
    if (o.normalRules) return t('Normal return rules: the lender earns 1 if it was on time; a late borrower loses 1.');
    const n = (x) => (x > 0 ? `+${x}` : String(x));
    return `${t('Owner')} ${n(o.owner)}, ${t('Borrower')} ${n(o.borrower)}${o.removeItem ? `, ${t('the item is removed')}` : ''}. ${t('Never below 0.')}`;
  };

  async function save(status) {
    setBusy(true);
    try {
      if (status === 'resolved' && settling && !settle) { toast(t('Choose how the dispute was settled.'), 'bad'); return; }
      await api(`/admin/reports/${sel.id}`, { method: 'PATCH', body: { status, mediator_notes: notes, outcome, settle: settling ? settle : undefined } });
      toast(t('Case updated.')); setSel(null); reload();
    } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title={t('Reports and disputes')} subtitle={t('Mediate cases between neighbors. Write the outcome before closing a case.')} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'open', label: t('open') }, { value: 'in_mediation', label: t('in_mediation') },
        { value: 'resolved', label: t('resolved') }, { value: 'all', label: t('All') },
      ]} />
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (data.length === 0 ? <div className="card"><Empty pose="cheer">{t('No reports. Pawsa is happy.')}</Empty></div> : (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('Target')}</th><th>{t('Reason')}</th><th>{t('Reporter')}</th><th>{t('Created')}</th><th>{t('Status')}</th><th /></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.target?.label || `${r.target_type} #${r.target_id}`}</b><small>{r.target_type}</small></td>
                  <td>{t(r.reason)}<small>{r.details}</small></td>
                  <td>{r.reporter}</td>
                  <td>{fmt(r.created_at)}</td>
                  <td><Badge value={r.status} /></td>
                  <td><button className="btn small" onClick={() => open(r)}>{t('View')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {sel && (
        <Modal title={sel.target?.label || `${sel.target_type} #${sel.target_id}`} onClose={() => setSel(null)} wide>
          <dl className="kv">
            <dt>{t('Reason')}</dt><dd>{t(sel.reason)}</dd>
            <dt>{t('Details')}</dt><dd>{sel.details || '–'}</dd>
            <dt>{t('Reporter')}</dt><dd>{sel.reporter}</dd>
            {sel.target?.borrower && <><dt>{t('Borrower')}</dt><dd>{sel.target.borrower}{sel.target.borrower_phone ? ` · ${sel.target.borrower_phone}` : ''}</dd></>}
            {sel.target?.owner && <><dt>{t('Owner')}</dt><dd>{sel.target.owner}</dd></>}
            {sel.target?.condition && <><dt>{t('Condition')}</dt><dd>{t(sel.target.condition)}</dd></>}
          </dl>
          <div className="field" style={{ marginTop: 14 }}><label htmlFor="mn">{t('Mediator notes')}</label><textarea id="mn" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={sel.status === 'resolved'} /></div>
          <div className="field"><label htmlFor="oc">{t('Outcome')}</label><textarea id="oc" value={outcome} onChange={(e) => setOutcome(e.target.value)} disabled={sel.status === 'resolved'} /></div>
          {settling && (
            <fieldset className="field settle">
              <legend>{t('How was it settled?')}</legend>
              {['fine', 'accident', 'borrower_fault', 'lost'].map((k) => (
                <label key={k} className="choice">
                  <input type="radio" name="settle" value={k} checked={settle === k} onChange={() => setSettle(k)} />
                  <span><b>{t(`settle_${k}`)}</b><small>{effect(k)}</small></span>
                </label>
              ))}
            </fieldset>
          )}
          {sel.status !== 'resolved' && (
            <div className="modal-actions">
              {sel.status === 'open' && <button className="btn" disabled={busy} onClick={() => save('in_mediation')}>{t('Start mediation')}</button>}
              <button className="btn primary" disabled={busy} onClick={() => save('resolved')}>{t('Resolve case')}</button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
