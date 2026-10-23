import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, Empty, ErrorBox, LoadMore, Loading, Modal, PageHeader, usePaged, useToast } from '../components.jsx';

// Staff can edit any listing, hide it from neighbors (the owner sees the reason), show it again, or remove it.
// Listings the automatic checks held back ("flagged") wait here until staff decide.
export default function Listings() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('review') ? '' : 'available');
  const [review, setReview] = useState(params.get('review') || '');
  const [tier, setTier] = useState('');
  const [source, setSource] = useState('');
  const [text, setText] = useState('');
  const qs = new URLSearchParams({ ...(status && { status }), ...(review && { review }), ...(tier && { tier }), ...(source === 'shelf' && { shelf: '1' }), ...(text && { q: text }) });
  const list = usePaged(() => `/admin/items?${qs}`, [status, review, tier, source, text]);
  const { data, loading, error, reload } = list;
  const [dialog, setDialog] = useState(null);   // { kind: 'remove' | 'hide' | 'edit', item }
  const [reason, setReason] = useState('');
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const rows = (data || []).filter((i) => source !== 'resident' || !i.is_shelf);
  const close = () => { setDialog(null); setReason(''); };

  async function act(path, body, done) {
    setBusy(true);
    try { await api(path, { method: body === undefined ? 'POST' : body.method || 'POST', body: body?.data ?? body }); toast(done); close(); reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  const openEdit = (i) => { setForm({ title: i.title, description: i.description || '', tier: i.tier, condition: i.condition }); setDialog({ kind: 'edit', item: i }); };

  return (
    <>
      <PageHeader title={t('Listings moderation')} subtitle={t('Edit, hide or remove any listing. The owner is told why.')} />
      <div className="toolbar">
        <input type="search" placeholder={t('Search item or owner')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Search')} />
        <select value={review} onChange={(e) => setReview(e.target.value)} aria-label={t('Review')}>
          <option value="">{t('Review')}: {t('All')}</option>
          <option value="flagged">{t('Flagged for review')}</option>
          <option value="hidden">{t('Hidden by staff')}</option>
          <option value="ok">{t('Visible')}</option>
        </select>
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
            <thead><tr><th>{t('Item')}</th><th>{t('Category')}</th><th>{t('Tier')}</th><th>{t('Owner / source')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={i.review_status === 'flagged' ? 'hot' : ''}>
                  <td>
                    <b>{i.title}</b><small>{i.description?.slice(0, 70)}</small>
                    {i.review_flags?.length > 0 && <small className="flag-reasons">⚠ {i.review_flags.map((f) => t(`flag_${f}`)).join(' · ')}</small>}
                    {i.review_note && <small className="muted">{t('Note to owner')}: {i.review_note}</small>}
                  </td>
                  <td>{lang === 'fil' ? i.category.name_fil : i.category.name_en}</td>
                  <td><Badge value={i.tier} /></td>
                  <td>{i.is_shelf ? <Badge value="shelf" label={t('Shelf')} /> : <>{i.owner_full_name}<small>{i.owner?.purok}</small></>}</td>
                  <td>
                    <Badge value={i.status} />{i.is_out && <> <Badge value="handed_over" label={t('On loan')} /></>}
                    {i.review_status === 'flagged' && <> <Badge value="overdue" label={t('Flagged for review')} /></>}
                    {i.review_status === 'hidden' && <> <Badge value="paused" label={t('Hidden by staff')} /></>}
                  </td>
                  <td><div className="cell-actions">
                    {i.status === 'removed'
                      ? (i.removed_by === 'staff' ? <button className="btn small" onClick={() => act(`/admin/items/${i.id}/restore`, undefined, t('Restored.'))}>{t('Restore')}</button> : <small className="muted">{t('Removed by the owner')}</small>)
                      : <>
                        <button className="btn small" onClick={() => openEdit(i)}>{t('Edit')}</button>
                        {i.review_status === 'ok'
                          ? <button className="btn small" onClick={() => setDialog({ kind: 'hide', item: i })}>{t('Hide')}</button>
                          : <button className="btn small primary" disabled={busy} onClick={() => act(`/admin/items/${i.id}/show`, undefined, t('Visible to neighbors again.'))}>{i.review_status === 'flagged' ? t('Looks fine, show it') : t('Show')}</button>}
                        <button className="btn small danger" onClick={() => setDialog({ kind: 'remove', item: i })}>{t('Remove')}</button>
                      </>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          <LoadMore list={list} />
        </div>
      ))}

      {(dialog?.kind === 'remove' || dialog?.kind === 'hide') && (
        <Modal title={`${dialog.kind === 'hide' ? t('Hide listing') : t('Remove listing')}: ${dialog.item.title}`} onClose={close}>
          <p className="muted" style={{ marginTop: 0 }}>
            {dialog.kind === 'hide'
              ? t('Neighbors stop seeing it and its waiting requests are refunded. The owner sees your reason and you can show it again later.')
              : t('The listing is removed for good. Its waiting requests are refunded.')}
          </p>
          <div className="field">
            <label htmlFor="why">{dialog.kind === 'hide' ? t('Reason the owner will see') : t('Why is this being removed?')}</label>
            <textarea id="why" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={close}>{t('Cancel')}</button>
            <button className="btn danger" disabled={busy || !reason.trim()}
              onClick={() => act(`/admin/items/${dialog.item.id}/${dialog.kind}`, { reason }, dialog.kind === 'hide' ? t('Hidden from neighbors.') : t('Removed.'))}>
              {dialog.kind === 'hide' ? t('Hide') : t('Remove')}
            </button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'edit' && (
        <Modal title={`${t('Edit listing')}: ${dialog.item.title}`} onClose={close}>
          <div className="field"><label htmlFor="et">{t('Item name')}</label><input id="et" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field"><label htmlFor="ed">{t('Description')}</label><textarea id="ed" value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="row">
            <div className="field grow"><label htmlFor="eti">{t('Tier')}</label>
              <select id="eti" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>{['low', 'medium', 'high'].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></div>
            <div className="field grow"><label htmlFor="ec">{t('Condition')}</label>
              <select id="ec" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>{['new', 'good', 'fair', 'worn'].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></div>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={close}>{t('Cancel')}</button>
            <button className="btn primary" disabled={busy} onClick={() => act(`/admin/items/${dialog.item.id}`, { method: 'PATCH', data: form }, t('Saved.'))}>{t('Save')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
