import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Empty, ErrorBox, Loading, PageHeader, useDateFormat, useLoad } from '../../components.jsx';

const ENTITIES = ['', 'user', 'declaration', 'item', 'release', 'recycle_batch', 'flag', 'partner', 'hub', 'recycler', 'category'];

// Every change, newest first. Read-only: nobody can edit or delete it (R12).
export default function Audit() {
  const { t } = useI18n();
  const date = useDateFormat();
  const [entity, setEntity] = useState('');
  const [pages, setPages] = useState([]);
  const first = useLoad(async () => { setPages([]); return api(`/admin/audit?limit=100&entity=${entity}`); }, [entity]);
  const rows = [...(first.data || []), ...pages];
  async function more() {
    const next = await api(`/admin/audit?limit=100&entity=${entity}&before=${rows[rows.length - 1].id}`);
    setPages((p) => [...p, ...next]);
  }
  return (
    <>
      <PageHeader title={t('Audit log')} subtitle={t('Every change, who made it and when. Nobody can edit or delete it.')}>
        <label htmlFor="ent" className="sr-only">{t('Show')}</label>
        <select id="ent" value={entity} onChange={(e) => setEntity(e.target.value)}>
          {ENTITIES.map((x) => <option key={x} value={x}>{x ? t(`entity_${x}`) : t('Everything')}</option>)}
        </select>
      </PageHeader>
      <section className="card">
        {first.loading ? <Loading /> : first.error ? <ErrorBox error={first.error} onRetry={first.reload} /> : !rows.length ? <Empty>{t('Nothing here yet.')}</Empty> : (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th scope="col">{t('When')}</th><th scope="col">{t('Who')}</th><th scope="col">{t('What')}</th><th scope="col">{t('Details')}</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td>{date(r.created_at, true)}</td>
                  <td>{r.actor_name || '-'}{r.actor_role ? <div className="muted">{t(`role_${r.actor_role}`)}</div> : null}</td>
                  <td>{r.action.replace(/_/g, ' ')}{r.entity ? <div className="muted">{r.entity} #{r.entity_id}</div> : null}</td>
                  <td><code className="code-cell">{r.details ? JSON.stringify(r.details) : ''}</code></td>
                </tr>
              ))}</tbody>
            </table></div>
            {rows.length % 100 === 0 && <div className="load-more"><button className="btn" onClick={more}>{t('Load more')}</button></div>}
          </>
        )}
      </section>
    </>
  );
}
