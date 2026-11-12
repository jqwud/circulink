import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, PageHeader, Tabs, useAct, useLoad } from '../../components.jsx';

// Drop-offs with unusual weights (R7). Their points wait here: clear them if the weights were real, uphold to
// cancel the points of that drop-off.
export default function Flags() {
  const { t } = useI18n();
  const [status, setStatus] = useState('open');
  const [upholding, setUpholding] = useState(null);
  const list = useLoad(() => api(`/admin/flags?status=${status}`), [status]);
  const { run, busy } = useAct();
  const decide = (f, d, ok) => run(() => api(`/admin/flags/${f.id}/${d}`, { method: 'POST' }), ok, list.reload);
  return (
    <>
      <PageHeader title={t('Flags')} subtitle={t('Check with the hub staff before deciding. Points of a flagged drop-off stay pending until then.')} />
      <Tabs value={status} onChange={setStatus} tabs={['open', 'cleared', 'upheld'].map((s) => ({ value: s, label: t(`flag_${s}`) }))} />
      <section className="card">
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data.length ? <Empty>{t('No flags here.')}</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">{t('Why')}</th><th scope="col">{t('Resident')}</th><th scope="col">{t('Hub')}</th><th scope="col">{t('Details')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
            <tbody>{list.data.map((f) => (
              <tr key={f.id}>
                <td><Badge value="warn" label={t(f.kind)} /><div className="muted">{String(f.created_at).slice(0, 16)}</div></td>
                <td>{f.resident_name}</td><td>{f.hub_name}</td><td>{f.detail}</td>
                <td className="cell-actions">{f.status === 'open' && (
                  <>
                    <button className="btn small primary" disabled={busy} onClick={() => decide(f, 'clear', t('Cleared. The points go on.'))}>{t('Weights are real')}</button>
                    <button className="btn small danger" disabled={busy} onClick={() => setUpholding(f)}>{t('Cancel the points')}</button>
                  </>
                )}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {upholding && (
        <ConfirmModal title={t('Cancel the points of this drop-off?')} message={t('Every point from this drop-off is cancelled and the resident is told. This cannot be undone.')}
          confirmLabel={t('Cancel the points')} danger onConfirm={() => decide(upholding, 'uphold', t('Points cancelled.'))} onClose={() => setUpholding(null)} />
      )}
    </>
  );
}
