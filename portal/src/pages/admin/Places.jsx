import { useState } from 'react';
import { api, upload } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, Modal, PageHeader, Tabs, useAct, useLoad } from '../../components.jsx';

// Hubs (where items are dropped off) and recyclers (where recyclables go), in one page with two tabs.
export default function Places() {
  const { t } = useI18n();
  const [tab, setTab] = useState('hubs');
  return (
    <>
      <PageHeader title={t('Hubs and recyclers')} />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'hubs', label: t('Hubs') }, { value: 'recyclers', label: t('Recyclers') }]} />
      {tab === 'hubs' ? <Hubs /> : <Recyclers />}
    </>
  );
}

function Hubs() {
  const { t } = useI18n();
  const list = useLoad(() => api('/admin/hubs'), []);
  const [editing, setEditing] = useState(null);   // {} for new
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  return (
    <section className="card">
      <div className="row right"><button className="btn primary" onClick={() => setEditing({})}>{t('New hub')}</button></div>
      {!list.data.length ? <Empty>{t('Nothing here yet.')}</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Type')}</th><th scope="col">{t('Address')}</th><th scope="col">{t('Staff')}</th><th scope="col">{t('Status')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
          <tbody>{list.data.map((h) => (
            <tr key={h.id}>
              <td>{h.name}{h.hours ? <div className="muted">{h.hours}</div> : null}{!h.photo_url && <div className="muted">{t('No photo yet')}</div>}</td>
              <td>{t(h.type)}</td><td>{h.address}</td><td>{h.staff_count}</td>
              <td><Badge value={h.status} label={t(h.status)} /></td>
              <td><button className="btn small" onClick={() => setEditing(h)}>{t('Edit')}</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {editing && <HubForm hub={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await list.reload(); }} />}
    </section>
  );
}

function HubForm({ hub, onClose, onSaved }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const isNew = !hub.id;
  const [f, setF] = useState({ name: hub.name || '', type: hub.type || 'school', address: hub.address || '', hours: hub.hours || '', status: hub.status || 'active', photo_url: hub.photo_url || '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal title={isNew ? t('New hub') : `${t('Edit')} ${hub.name}`} onClose={onClose}>
      <form onSubmit={(e) => {
        e.preventDefault();
        run(() => api(isNew ? '/admin/hubs' : `/admin/hubs/${hub.id}`, { method: isNew ? 'POST' : 'PATCH', body: f }), t('Saved.'), onSaved);
      }}>
        <div className="field"><label htmlFor="hn">{t('Name')}</label><input id="hn" value={f.name} onChange={set('name')} required minLength={2} /></div>
        <div className="field">
          <label htmlFor="ht">{t('Type')}</label>
          <select id="ht" value={f.type} onChange={set('type')}>{['school', 'barangay', 'other'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
        </div>
        <div className="field"><label htmlFor="ha">{t('Address')}</label><input id="ha" value={f.address} onChange={set('address')} required minLength={5} /></div>
        <div className="field"><label htmlFor="hh">{t('Opening hours')} ({t('optional')})</label><input id="hh" value={f.hours} onChange={set('hours')} /></div>
        <div className="field">
          <label htmlFor="hp">{t('Photo of the place')} ({t('optional')})</label>
          {f.photo_url && <img className="hub-photo" src={f.photo_url} alt={t('Current photo of this hub')} />}
          <div className="row">
            <input id="hp" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const url = await run(() => upload(file), t('Photo added. Save to keep it.'));
              if (url) setF((x) => ({ ...x, photo_url: url }));
            }} />
            {f.photo_url && <button type="button" className="btn small" onClick={() => setF((x) => ({ ...x, photo_url: '' }))}>{t('Remove photo')}</button>}
          </div>
          <p className="hint">{t('A real photo of the school or barangay helps residents trust the hub. JPG, PNG or WEBP.')}</p>
        </div>
        {!isNew && (
          <div className="field">
            <label htmlFor="hs">{t('Status')}</label>
            <select id="hs" value={f.status} onChange={set('status')}>{['active', 'paused', 'closed'].map((x) => <option key={x} value={x}>{t(x)}</option>)}</select>
            {f.status !== 'active' && <p className="hint">{t('Open drop-off codes for this hub stop working. Residents can choose another hub.')}</p>}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}

function Recyclers() {
  const { t } = useI18n();
  const list = useLoad(() => api('/admin/recyclers'), []);
  const { run, busy } = useAct();
  const [f, setF] = useState({ name: '', materials: '', accredited: false });
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  const patch = (r, body, ok) => run(() => api(`/admin/recyclers/${r.id}`, { method: 'PATCH', body }), ok, list.reload);
  return (
    <section className="card">
      <p className="muted">{t('Only accredited recyclers may take e-waste and batteries.')}</p>
      <div className="table-wrap"><table>
        <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Takes')}</th><th scope="col">{t('Accredited')}</th><th scope="col">{t('Status')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
        <tbody>{list.data.map((r) => (
          <tr key={r.id}>
            <td>{r.name}</td><td>{r.materials}</td>
            <td>
              <label className="choice"><input type="checkbox" checked={r.accredited} disabled={busy} onChange={() => patch(r, { accredited: !r.accredited }, t('Saved.'))} />
                <span className="sr-only">{t('Accredited')}: {r.name}</span> {r.accredited ? t('Yes') : t('No')}</label>
            </td>
            <td><Badge value={r.status === 'active' ? 'active' : 'cancelled'} label={t(r.status)} /></td>
            <td><button className="btn small" disabled={busy} onClick={() => patch(r, { status: r.status === 'active' ? 'inactive' : 'active' }, t('Saved.'))}>
              {r.status === 'active' ? t('Deactivate') : t('Activate')}</button></td>
          </tr>
        ))}</tbody>
      </table></div>
      <form className="row end mt-16" onSubmit={(e) => {
        e.preventDefault();
        run(() => api('/admin/recyclers', { method: 'POST', body: f }), t('Recycler added.'), async () => { setF({ name: '', materials: '', accredited: false }); await list.reload(); });
      }}>
        <div className="field m-0"><label htmlFor="rn">{t('New recycler')}</label><input id="rn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} /></div>
        <div className="field m-0"><label htmlFor="rm">{t('Takes')}</label><input id="rm" value={f.materials} onChange={(e) => setF({ ...f, materials: e.target.value })} required minLength={2} placeholder={t('Plastic, cans, paper')} /></div>
        <label className="choice"><input type="checkbox" checked={f.accredited} onChange={(e) => setF({ ...f, accredited: e.target.checked })} /> {t('Accredited')}</label>
        <button className="btn" disabled={busy}>{t('Add')}</button>
      </form>
    </section>
  );
}
