import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Badge, ErrorBox, Loading, PageHeader, Stat, kg, useLoad } from '../components.jsx';

// What needs doing now, by role, then the hubs and what they accept.
async function counts(role) {
  if (role === 'partner') {
    const [stock, mine] = await Promise.all([api('/stock').catch(() => null), api('/releases')]);
    return { stock: stock?.length ?? null, waiting: mine.filter((r) => r.status === 'released').length, approved: stock !== null };
  }
  const [queue, releases, items] = await Promise.all([api('/staff/queue'), api('/staff/releases'), api('/staff/stock')]);
  const out = { queue: queue.length, releases: releases.length, stock: items.filter((i) => i.state === 'in_stock').length };
  if (role === 'admin') {
    const [flags, report] = await Promise.all([api('/admin/flags'), api('/admin/reports')]);
    out.flags = flags.length;
    out.report = report.totals;
  }
  return out;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const meta = useLoad(() => api('/meta'), []);
  const c = useLoad(() => counts(user.role), [user.role]);
  if (meta.loading) return <Loading />;
  if (meta.error) return <ErrorBox error={meta.error} onRetry={meta.reload} />;
  const n = c.data || {};

  return (
    <>
      <PageHeader title={`${t('Good day')}, ${user.name.split(' ')[0]}`} subtitle={t('Keeping things in use, one drop-off at a time.')} />
      {user.role === 'partner' ? (
        <>
          {c.data && !n.approved && <p className="note">{t('Your organization is waiting for approval. You can ask for items once an admin approves it.')}</p>}
          <div className="stats">
            <Stat label={t('Items available')} value={n.stock ?? '–'} to="/browse" />
            <Stat label={t('Handed over, waiting for your confirmation')} value={n.waiting ?? '–'} to="/requests" tone={n.waiting ? 'warn' : ''} />
          </div>
        </>
      ) : (
        <div className="stats">
          <Stat label={t('Drop-offs to sort')} value={n.queue ?? '–'} to="/check-in" tone={n.queue ? 'warn' : ''} />
          <Stat label={t('Partner requests')} value={n.releases ?? '–'} to="/releases" tone={n.releases ? 'warn' : ''} />
          <Stat label={t('Items in stock')} value={n.stock ?? '–'} to="/stock" />
          {user.role === 'admin' && <Stat label={t('Open flags')} value={n.flags ?? '–'} to="/flags" tone={n.flags ? 'bad' : ''} />}
        </div>
      )}
      {n.report && (
        <section className="card">
          <h2>{t('This month')}</h2>
          <div className="grid stats">
            <Stat label={t('Kept in use')} value={kg(n.report.kg_kept)} tone="good" to="/reports" />
            <Stat label={t('Diversion rate')} value={`${n.report.diversion_rate}%`} to="/reports" />
            <Stat label={t('CO2e avoided (estimate)')} value={kg(n.report.co2e_avoided_kg)} to="/reports" />
          </div>
        </section>
      )}

      <section className="card">
        <h2>{t('Drop-off hubs')}</h2>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Type')}</th><th scope="col">{t('Address')}</th></tr></thead>
          <tbody>{meta.data.hubs.map((h) => (
            <tr key={h.id}><td>{h.name}</td><td><Badge value={h.type} label={t(h.type)} /></td><td>{h.address}</td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className="card">
        <h2>{t('Categories')}</h2>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Points / kg')}</th><th scope="col">{t('kg CO2e / kg (estimate)')}</th><th scope="col">{t('Handling')}</th></tr></thead>
          <tbody>{meta.data.categories.map((x) => (
            <tr key={x.id}>
              <td>{lang === 'fil' ? x.name_fil : x.name_en}</td><td>{x.rate_per_kg}</td><td>{x.co2_per_kg}</td>
              <td>{x.hazardous ? <Badge value="urgent" label={t('Hazardous')} /> : x.food ? <Badge value="info" label={t('Food')} /> : null}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  );
}
