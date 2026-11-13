import { useState } from 'react';
import { api, download } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Empty, ErrorBox, Loading, PageHeader, Stat, kg, useAct, useLoad } from '../../components.jsx';

// This month in the Philippines, as YYYY-MM.
const thisMonth = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
const OUTCOMES = ['reuse', 'repair', 'recycle', 'reject'];

// The monthly impact report (SDG target 12.6): kg by outcome, by hub and by category, and the last 12 months.
// Totals only, never names. Export as CSV for a spreadsheet.
export default function Reports() {
  const { t, lang } = useI18n();
  const [month, setMonth] = useState(thisMonth());
  const [hub, setHub] = useState('');
  const hubs = useLoad(() => api('/admin/hubs'), []);
  const r = useLoad(() => api(`/admin/reports?month=${month}${hub ? `&hub_id=${hub}` : ''}`), [month, hub]);
  const { run, busy } = useAct();
  const exportCsv = () => run(() => download(`/admin/reports.csv?month=${month}${hub ? `&hub_id=${hub}` : ''}`, `circulink-report-${month}.csv`));

  return (
    <>
      <PageHeader title={t('Impact reports')} subtitle={t('Kilograms kept in use, by hub and category. Totals only, never names.')}>
        <label htmlFor="rep-month" className="sr-only">{t('Month')}</label>
        <input id="rep-month" type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <label htmlFor="rep-hub" className="sr-only">{t('Hub')}</label>
        <select id="rep-hub" value={hub} onChange={(e) => setHub(e.target.value)}>
          <option value="">{t('All hubs')}</option>
          {(hubs.data || []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <button className="btn" disabled={busy || !r.data} onClick={exportCsv}>{t('Export CSV')}</button>
      </PageHeader>
      {r.loading ? <Loading /> : r.error ? <ErrorBox error={r.error} onRetry={r.reload} /> : <Report data={r.data} t={t} lang={lang} />}
    </>
  );
}

function Report({ data, t, lang }) {
  const x = data.totals;
  return (
    <>
      <div className="grid stats">
        <Stat label={t('Kept in use')} value={kg(x.kg_kept)} tone="good" hint={t('Reused, repaired or recycled')} />
        <Stat label={t('Diversion rate')} value={`${x.diversion_rate}%`} hint={t('Share of weighed kg not rejected')} />
        <Stat label={t('CO2e avoided (estimate)')} value={kg(x.co2e_avoided_kg)} />
        <Stat label={t('Items sorted')} value={x.items} hint={`${x.dropoffs} ${t('drop-offs')} · ${x.residents} ${t('residents')}`} />
        <Stat label={t('Items given to partners')} value={x.items_released} hint={`${x.releases_picked_up} ${t('pickups')}`} />
      </div>

      <section className="card">
        <h2>{t('Where the weight went')}</h2>
        {!x.kg_total ? <Empty>{t('Nothing was sorted this month.')}</Empty> : (
          <>
            <div className="split-bar" role="img" aria-label={OUTCOMES.map((o) => `${t(o)} ${kg(x[`kg_${o}`])}`).join(', ')}>
              {OUTCOMES.map((o) => x[`kg_${o}`] > 0 && <span key={o} className={`seg ${o}`} style={{ flexGrow: x[`kg_${o}`] }} />)}
            </div>
            <ul className="legend">
              {OUTCOMES.map((o) => <li key={o}><span className={`dot ${o}`} />{t(o)}: <b>{kg(x[`kg_${o}`])}</b></li>)}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <h2>{t('Last 12 months')}</h2>
        <Trend rows={data.trend} t={t} />
      </section>

      <section className="card">
        <h2>{t('By hub')}</h2>
        <Table rows={data.by_hub} name={(h) => h.hub_name} t={t} />
      </section>
      <section className="card">
        <h2>{t('By category')}</h2>
        <Table rows={data.by_category} name={(c) => (lang === 'fil' ? c.name_fil : c.name_en)} t={t} />
      </section>
    </>
  );
}

// One bar per month (kg kept in use), labelled with its value, so the numbers never depend on the picture.
function Trend({ rows, t }) {
  const max = Math.max(...rows.map((m) => m.kg_kept), 1);
  if (rows.every((m) => !m.kg_kept)) return <Empty>{t('No sorted items in the last 12 months.')}</Empty>;
  return (
    <ol className="trend" aria-label={t('kg kept in use per month')}>
      {rows.map((m) => (
        <li key={m.month}>
          <span className="trend-val">{m.kg_kept ? Math.round(m.kg_kept) : ''}</span>
          <span className="trend-bar" style={{ height: `${Math.max((m.kg_kept / max) * 100, m.kg_kept ? 3 : 0)}%` }} />
          <span className="trend-label">{m.month.slice(2).replace('-', '/')}</span>
          <span className="sr-only">{`${m.month}: ${kg(m.kg_kept)}`}</span>
        </li>
      ))}
    </ol>
  );
}

function Table({ rows, name, t }) {
  if (!rows.length) return <Empty>{t('Nothing was sorted this month.')}</Empty>;
  return (
    <div className="table-wrap"><table>
      <thead><tr>
        <th scope="col">{t('Name')}</th><th scope="col">{t('Items')}</th>
        {OUTCOMES.map((o) => <th key={o} scope="col">{t(o)}</th>)}
        <th scope="col">{t('Kept in use')}</th><th scope="col">{t('Diversion rate')}</th>
      </tr></thead>
      <tbody>{rows.map((g, i) => (
        <tr key={i}>
          <td>{name(g)}</td><td>{g.items}</td>
          {OUTCOMES.map((o) => <td key={o}>{kg(g[`kg_${o}`])}</td>)}
          <td><b>{kg(g.kg_kept)}</b></td><td>{g.diversion_rate}%</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
