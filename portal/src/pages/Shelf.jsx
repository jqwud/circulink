import { useState } from 'react';
import { api, upload } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, useLoad, useToast } from '../components.jsx';

const EMPTY = { title: '', description: '', category_id: '', condition: 'good', tier: 'low', pickup_point_id: 1, photo_url: '', repair_reuse: false };

export default function Shelf() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api('/admin/items?shelf=1'), []);
  const meta = useLoad(() => api('/meta'), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const items = (data || []).filter((i) => i.status !== 'removed');

  async function onPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    try { set('photo_url', await upload(file)); } catch (err) { toast(err.message, 'bad'); }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/admin/shelf', { method: 'POST', body: { ...form, category_id: Number(form.category_id), pickup_point_id: Number(form.pickup_point_id) } });
      toast(t('Shelf item added.')); setForm(null); reload();
    } catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  }
  async function setStatus(i, status) {
    try { await api(`/admin/items/${i.id}`, { method: 'PATCH', body: { status } }); toast(t('Saved.')); reload(); }
    catch (err) { toast(err.message, 'bad'); }
  }

  return (
    <>
      <PageHeader title={t('Barangay Shelf')} subtitle={t('Community-owned items kept at the barangay hall. Borrowing them is free, and staff hand them over and take them back.')}>
        <button className="btn primary" onClick={() => setForm({ ...EMPTY })}>+ {t('Add shelf item')}</button>
      </PageHeader>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (items.length === 0 ? <div className="card"><Empty>{t('Nothing here yet.')}</Empty></div> : (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('Item')}</th><th>{t('Category')}</th><th>{t('Tier')}</th><th>{t('Status')}</th><th /></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td><b>{i.title}</b><small>{i.description}</small></td>
                  <td>{lang === 'fil' ? i.category.name_fil : i.category.name_en}</td>
                  <td><Badge value={i.tier} /></td>
                  <td><Badge value={i.status} />{i.is_out && <> <Badge value="handed_over" label={t('On loan')} /></>}</td>
                  <td>{i.status === 'available'
                    ? <button className="btn small" onClick={() => setStatus(i, 'paused')}>{t('Pause')}</button>
                    : <button className="btn small" onClick={() => setStatus(i, 'available')}>{t('Make available')}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {form && (
        <Modal title={t('Add shelf item')} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <div className="field"><label htmlFor="t">{t('Item name')}</label><input id="t" value={form.title} onChange={(e) => set('title', e.target.value)} required /></div>
            <div className="field"><label htmlFor="d">{t('Description')}</label><textarea id="d" value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
            <div className="row">
              <div className="grow field"><label htmlFor="c">{t('Category')}</label>
                <select id="c" value={form.category_id} onChange={(e) => set('category_id', e.target.value)} required>
                  <option value="" />
                  {meta.data?.categories.map((c) => <option key={c.id} value={c.id}>{lang === 'fil' ? c.name_fil : c.name_en}</option>)}
                </select></div>
              <div className="grow field"><label htmlFor="co">{t('Condition')}</label>
                <select id="co" value={form.condition} onChange={(e) => set('condition', e.target.value)}>
                  {['new', 'good', 'fair', 'worn'].map((c) => <option key={c} value={c}>{t(c)}</option>)}
                </select></div>
            </div>
            <div className="row">
              <div className="grow field"><label htmlFor="ti">{t('Tier')}</label>
                <select id="ti" value={form.tier} onChange={(e) => set('tier', e.target.value)}>
                  <option value="low">{t('Low: auto-approved')}</option>
                  <option value="medium">{t('Medium: staff approve')}</option>
                  <option value="high">{t('High: hall handover only')}</option>
                </select></div>
              <div className="grow field"><label htmlFor="p">{t('Pickup point')}</label>
                <select id="p" value={form.pickup_point_id} onChange={(e) => set('pickup_point_id', e.target.value)}>
                  {meta.data?.pickup_points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            </div>
            <div className="field"><label htmlFor="ph">{t('Photo')} ({t('Optional')})</label><input id="ph" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} />
              {form.photo_url && <small className="muted">✓ {form.photo_url.split('/').pop()}</small>}</div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setForm(null)}>{t('Cancel')}</button>
              <button className="btn primary" disabled={busy}>{t('Save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
