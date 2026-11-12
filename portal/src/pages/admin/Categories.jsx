import { useState } from 'react';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, ErrorBox, Loading, Modal, PageHeader, useAct, useLoad } from '../../components.jsx';

// Categories: what hubs accept, the points per kg (0 to 50) and the CO2 estimate. Old values stay in the
// audit log, so any change can be traced and undone.
export default function Categories() {
  const { t } = useI18n();
  const list = useLoad(() => api('/admin/categories'), []);
  const [editing, setEditing] = useState(null);
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  return (
    <>
      <PageHeader title={t('Categories')} subtitle={t('Points per kg decide what each item earns. CO2 figures are estimates and are shown as such.')}>
        <button className="btn primary" onClick={() => setEditing({})}>{t('New category')}</button>
      </PageHeader>
      <section className="card">
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Points / kg')}</th><th scope="col">{t('kg CO2e / kg')}</th><th scope="col">{t('Handling')}</th><th scope="col">{t('Status')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
          <tbody>{list.data.map((c) => (
            <tr key={c.id}>
              <td>{c.name_en}<div className="muted">{c.name_fil}</div></td>
              <td>{c.rate_per_kg}</td><td>{c.co2_per_kg}</td>
              <td>{c.hazardous && <Badge value="urgent" label={t('Hazardous')} />} {c.food && <Badge value="info" label={t('Food')} />}</td>
              <td><Badge value={c.active ? 'active' : 'cancelled'} label={t(c.active ? 'active' : 'inactive')} /></td>
              <td><button className="btn small" onClick={() => setEditing(c)}>{t('Edit')}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      {editing && <CategoryForm c={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await list.reload(); }} />}
    </>
  );
}

function CategoryForm({ c, onClose, onSaved }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const isNew = !c.id;
  const [f, setF] = useState({
    slug: '', name_en: c.name_en || '', name_fil: c.name_fil || '', rate_per_kg: c.rate_per_kg ?? '', co2_per_kg: c.co2_per_kg ?? '',
    hazardous: !!c.hazardous, food: !!c.food, active: c.active ?? true,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <Modal title={isNew ? t('New category') : `${t('Edit')} ${c.name_en}`} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        const body = { ...f, rate_per_kg: Number(f.rate_per_kg), co2_per_kg: Number(f.co2_per_kg) };
        if (!isNew) delete body.slug;
        run(() => api(isNew ? '/admin/categories' : `/admin/categories/${c.id}`, { method: isNew ? 'POST' : 'PATCH', body }), t('Saved.'), onSaved);
      }}>
        {isNew && <div className="field"><label htmlFor="cs">{t('Short code')}</label><input id="cs" value={f.slug} onChange={set('slug')} required pattern="[a-z][a-z0-9_]{1,39}" placeholder="shoes" /></div>}
        <div className="field"><label htmlFor="ce">{t('Name in English')}</label><input id="ce" value={f.name_en} onChange={set('name_en')} required minLength={2} /></div>
        <div className="field"><label htmlFor="cf">{t('Name in Filipino')}</label><input id="cf" value={f.name_fil} onChange={set('name_fil')} required minLength={2} /></div>
        <div className="field"><label htmlFor="cr">{t('Points per kg (0 to 50)')}</label><input id="cr" type="number" min="0" max="50" step="0.5" value={f.rate_per_kg} onChange={set('rate_per_kg')} required /></div>
        <div className="field"><label htmlFor="cc">{t('kg CO2e avoided per kg (estimate)')}</label><input id="cc" type="number" min="0" max="100" step="0.1" value={f.co2_per_kg} onChange={set('co2_per_kg')} required /></div>
        <label className="choice"><input type="checkbox" checked={f.hazardous} onChange={set('hazardous')} /> {t('Hazardous (accredited recyclers only)')}</label>
        <label className="choice"><input type="checkbox" checked={f.food} onChange={set('food')} /> {t('Sealed food (expiry date checked)')}</label>
        <label className="choice"><input type="checkbox" checked={f.active} onChange={set('active')} /> {t('Accepted at hubs')}</label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}
