import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Badge, ErrorBox, Loading, PageHeader, Stat, useLoad } from '../components.jsx';

// What each role will do here, so the team and testers can see where the portal is going.
const NEXT = {
  staff: 'Check in drop-offs by code, then weigh and sort each item.',
  partner: 'Browse reusable stock and request items for your organization.',
  admin: 'Approve hubs, staff and partners; review flags; see impact reports.',
};

export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { data, loading, error, reload } = useLoad(() => api('/meta'), []);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const hazardous = data.categories.filter((c) => c.hazardous).length;
  return (
    <>
      <PageHeader title={`${t('Good day')}, ${user.name.split(' ')[0]}`} subtitle={t('Hubs and categories are ready. The screens below arrive in the next build steps.')} />
      <div className="stats">
        <Stat label={t('Active hubs')} value={data.hubs.length} />
        <Stat label={t('Categories')} value={data.categories.length} hint={`${hazardous} ${t('Hazardous').toLowerCase()}`} />
      </div>

      <section className="card">
        <h2>{t('Coming next')}</h2>
        <p>{t(NEXT[user.role] || NEXT.staff)}</p>
      </section>

      <section className="card">
        <h2>{t('Drop-off hubs')}</h2>
        <table className="table">
          <thead><tr><th scope="col">{t('Name')}</th><th scope="col">Type</th><th scope="col">Address</th></tr></thead>
          <tbody>
            {data.hubs.map((h) => (
              <tr key={h.id}><td>{h.name}</td><td><Badge value={h.type} /></td><td>{h.address}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{t('Categories')}</h2>
        <table className="table">
          <thead><tr><th scope="col">{t('Name')}</th><th scope="col">Points / kg</th><th scope="col">kg CO₂e / kg (estimate)</th><th scope="col">{t('Status')}</th></tr></thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.id}>
                <td>{lang === 'fil' ? c.name_fil : c.name_en}</td>
                <td>{c.rate_per_kg}</td>
                <td>{c.co2_per_kg}</td>
                <td>{c.hazardous ? <Badge value="urgent" label={t('Hazardous')} /> : c.food ? <Badge value="info" label={t('Food')} /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
