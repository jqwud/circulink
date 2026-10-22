import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { ErrorBox, Loading, Pawsa, Stat, useLoad } from '../components.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: s, loading, error, reload } = useLoad(() => api('/admin/stats'), []);
  if (loading && !s) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const attention = [
    { n: s.pending_verifications, label: 'IDs waiting for review', to: '/verification' },
    { n: s.staff_requests_waiting, label: 'Staff approvals waiting', to: '/transactions' },
    { n: s.overdue, label: 'Overdue items', to: '/transactions', bad: true },
    { n: s.missed_checkins, label: 'Loans with no check-in for 2+ days', to: '/transactions', bad: true },
    { n: s.open_reports, label: 'Open reports', to: '/reports', bad: true },
    { n: s.deletion_requests, label: 'Account deletion requests', to: '/residents?deletion=1' },
  ].filter((a) => a.n > 0);

  return (
    <>
      <div className="card hello">
        <Pawsa pose={attention.length ? 'happy' : 'sleepy'} size={96} />
        <div>
          <h1>{t('Good day')}, {user.name.split(' ')[0]}!</h1>
          <p className="muted">{t('Here is what Hiraman looks like today.')}</p>
        </div>
      </div>

      <div className="card">
        <h2>{t('Needs your attention')}</h2>
        {attention.length === 0 ? (
          <p className="muted">{t('Everything is in order. Pawsa is taking a nap.')}</p>
        ) : (
          <ul className="attention">
            {attention.map((a) => (
              <li key={a.label}><Link to={a.to} className={a.bad ? 'bad' : ''}><span>{t(a.label)}</span><span>{a.n}</span></Link></li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid stats">
        <Stat label={t('Verified residents')} value={s.verified_users} to="/residents" />
        <Stat label={t('Active listings')} value={s.active_listings} to="/listings" />
        <Stat label={t('Shelf items')} value={s.shelf_items} to="/shelf" />
        <Stat label={t('Items out on loan')} value={s.active_loans} to="/transactions" />
        <Stat label={t('Loans this week')} value={s.loans_this_week} />
        <Stat label={t('Completed loans')} value={s.completed_loans} to="/impact" tone="good" />
        <Stat label={t('Return rate')} value={s.return_rate === null ? '–' : `${s.return_rate}%`} to="/impact" tone="good" />
        <Stat label={t('Purchases avoided')} value={s.purchases_avoided} to="/impact" tone="good" hint={t('Measured')} />
      </div>
    </>
  );
}
