import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, useLoad, useToast } from '../components.jsx';

export default function Listings() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState('available');
  const [tier, setTier] = useState('');
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const qs = new URLSearchParams({ ...(status && { status }), ...(tier && { tier }), ...(source === 'shelf' && { shelf: '1' }), ...(text && { q: text }) });
  const { data, loading, error, reload } = useLoad(() => api(`/admin/items?${qs}`), [status, tier, source, text]);
  const [removing, setRemoving] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = (data || []).filter((i) => source !== 'resident' || !i.is_shelf);

  async function remove() {
    setBusy(true);
    try { await api(`/admin/items/${removing.id}/remove`, { method: 'POST', body: { reason } }); toast(t('Done.')); setRemoving(null); setReason(''); reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function restore(i) {
    try { await api(`/admin/items/${i.id}/restore`, { method: 'POST' }); toast(t('Done.')); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <PageHeader title={t('Listings moderation')} subtitle={t('Remove listings that break the community rules. The owner is told why.')} />
      <div className="toolbar">
        <input type="search" placeholder={t('Search item or owner')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Search')} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('Status')}>
          <option value="">{t('All')}</option>
          {['available', 'paused', 'removed'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label={t('Tier')}>
          <option value="">{t('Tier')}: {t('All')}</option>
          {['low', 'medium', 'high'].map((s) => <option key={s} value={s}>{t(s)}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label={t('Owner / source')}>
          <option value="">{t('All')}</option>
          <option value="shelf">{t('Shelf')}</option>
          <option value="resident">{t('Resident item')}</option>
        </select>
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (rows.length === 0 ? <div className="card"><Empty>{t('Nothing here yet.')}</Empty></div> : (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('Item')}</th><th>{t('Category')}</th><th>{t('Tier')}</th><th>{t('Owner / source')}</th><th>{t('Status')}</th><th /></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.title}</b><small>{i.description?.slice(0, 70)}</small></td>
                  <td>{lang === 'fil' ? i.category.name_fil : i.category.name_en}</td>
                  <td><Badge value={i.tier} /></td>
                  <td>{i.is_shelf ? <Badge value="shelf" label={t('Shelf')} /> : <>{i.owner_full_name}<small>{i.owner?.purok}</small></>}</td>
                  <td><Badge value={i.status} />{i.is_out && <> <Badge value="handed_over" label={t('On loan')} /></>}</td>
                  <td>{i.status === 'removed'
                    ? (i.removed_by === 'staff' ? <button className="btn small" onClick={() => restore(i)}>{t('Restore')}</button> : <small className="muted">{t('Removed by the owner')}</small>)
                    : <button className="btn small danger" onClick={() => setRemoving(i)}>{t('Remove')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {removing && (
        <Modal title={`${t('Remove listing')}: ${removing.title}`} onClose={() => setRemoving(null)}>
          <div className="field">
            <label htmlFor="why">{t('Why is this being removed?')}</label>
            <textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => setRemoving(null)}>{t('Cancel')}</button>
            <button className="btn danger" disabled={busy} onClick={remove}>{t('Remove')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
