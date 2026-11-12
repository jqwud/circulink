import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, PageHeader, useAct, useLoad } from '../../components.jsx';

// Partner organizations: only approved ones may ask for items (R2). Waiting ones are listed first.
export default function Partners() {
  const { t } = useI18n();
  const list = useLoad(() => api('/admin/partners'), []);
  const { run } = useAct();
  const [suspending, setSuspending] = useState(null);
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  const decide = (p, d, ok) => run(() => api(`/admin/partners/${p.id}/${d}`, { method: 'POST' }), ok, list.reload);
  return (
    <>
      <PageHeader title={t('Partner organizations')} subtitle={t('Shelters, schools and NGOs that receive reusable items. Check each one before approving.')} />
      <section className="card">
        {!list.data.length ? <Empty>{t('Nothing here yet.')}</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">{t('Organization')}</th><th scope="col">{t('Contact')}</th><th scope="col">{t('Received')}</th><th scope="col">{t('Status')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
            <tbody>{list.data.map((p) => (
              <tr key={p.id}>
                <td>{p.org_name}<div className="muted">{t(`org_${p.kind}`)}</div></td>
                <td>{p.contact_name}<div className="muted">{p.email}{p.phone ? ` · ${p.phone}` : ''}</div></td>
                <td>{p.releases_received}</td>
                <td><Badge value={p.status} label={t(p.status)} /></td>
                <td className="cell-actions">
                  {p.status !== 'approved' && <button className="btn small primary" onClick={() => decide(p, 'approve', t('Approved.'))}>{t('Approve')}</button>}
                  {p.status !== 'suspended' && <button className="btn small" onClick={() => setSuspending(p)}>{t('Suspend')}</button>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {suspending && (
        <ConfirmModal title={`${t('Suspend')} ${suspending.org_name}?`} message={t('They cannot ask for items until approved again. Requests not handed over yet are cancelled and the items go back to stock.')}
          confirmLabel={t('Suspend')} danger onConfirm={() => decide(suspending, 'suspend', t('Suspended.'))} onClose={() => setSuspending(null)} />
      )}
    </>
  );
}
