import { api, download } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Loading, PageHeader, Stat, useLoad, useToast } from '../components.jsx';

function MonthColumns({ rows, locale }) {
  const max = Math.max(1, ...rows.map((r) => r.loans));
  return (
    <div className="cols" role="img" aria-label={rows.map((r) => `${r.month}: ${r.loans}`).join(', ')}>
      {rows.map((r) => (
        <div className="col" key={r.month}>
          <b>{r.loans}</b>
          <div className="bar" style={{ height: `${(r.loans / max) * 100}%` }} />
          <span className="muted">{new Date(`${r.month}-15`).toLocaleDateString(locale, { month: 'short', year: '2-digit' })}</span>
        </div>
      ))}
    </div>
  );
}

function CategoryBars({ rows, lang }) {
  const max = Math.max(1, ...rows.map((r) => r.loans));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.slug}>
          <span>{lang === 'fil' ? r.name_fil : r.name}</span>
          <div className="bar-track"><div className="bar-fill leaf" style={{ width: `${(r.loans / max) * 100}%` }} /></div>
          <b>{r.loans}</b>
        </div>
      ))}
    </div>
  );
}

export default function Impact() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data: d, loading, error, reload } = useLoad(() => api('/admin/impact'), []);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader title={t('Impact analytics')} subtitle={t('Measured numbers first, estimates clearly labeled.')}>
        <button className="btn" onClick={() => download('/admin/export/transactions.csv', 'hiraman-transactions.csv').catch((e) => toast(e.message, 'bad'))}>
          {t('Download transactions (CSV)')}
        </button>
      </PageHeader>

      <h2>{t('Measured')}</h2>
      <div className="grid stats" style={{ marginBottom: 16 }}>
        <Stat label={t('Completed loans')} value={d.completed_loans} tone="good" />
        <Stat label={t('Items reused')} value={d.items_reused} tone="good" />
        <Stat label={t('Return rate')} value={d.return_rate === null ? '–' : `${d.return_rate}%`} tone="good" />
        <Stat label={t('Active residents')} value={d.verified_residents} />
        <Stat label={t('Survey answers')} value={d.survey_answers} />
        <Stat label={t('"Yes" answers (purchases avoided)')} value={d.purchases_avoided} tone="good" />
      </div>

      <div className="grid two">
        <div className="card">
          <h2>{t('Loans per month')}</h2>
          {d.monthly.length ? <MonthColumns rows={d.monthly} locale={lang === 'fil' ? 'fil-PH' : 'en-PH'} /> : <p className="muted">{t('No data yet.')}</p>}
        </div>
        <div className="card">
          <h2>{t('Loans by category')}</h2>
          {d.by_category.length ? <CategoryBars rows={d.by_category} lang={lang} /> : <p className="muted">{t('No data yet.')}</p>}
        </div>
      </div>

      <h2>{t('Estimate')}</h2>
      <div className="card">
        <div className="grid stats">
          <Stat label={t('Estimated new products not made (kg)')} value={`${d.waste_estimate_kg.low} – ${d.waste_estimate_kg.high}`} tone="warn" hint={t('Estimate')} />
        </div>
        <div className="note" style={{ marginTop: 14 }}>
          <b>{t('How this estimate is made')}</b>
          <p style={{ margin: '6px 0 0' }}>{t(d.method)}</p>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {Object.entries(d.weights_kg).map(([k, v]) => `${k}: ${v} kg`).join(' · ')}
          </p>
        </div>
      </div>
    </>
  );
}
