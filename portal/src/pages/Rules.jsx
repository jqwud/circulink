import { Fragment } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, ErrorBox, Loading, PageHeader, useLoad } from '../components.jsx';

export default function Rules() {
  const { t } = useI18n();
  const { data: d, loading, error, reload } = useLoad(() => api('/admin/rules'), []);
  if (loading && !d) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const r = d.rules;
  return (
    <>
      <PageHeader title={t('Rules and settings')} subtitle={t('These rules are built into the system. To change them, ask the Hiraman team.')} />
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
      <div className="card">
        <h2>{t('Pickup points')}</h2>
        <dl className="kv">{d.pickup_points.map((p) => <Fragment key={p.id}><dt>{p.name}</dt><dd>{p.hours} <span className="muted">· {p.note}</span></dd></Fragment>)}</dl>
      </div>
    </>
  );
}
