import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useI18n } from '../../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, Modal, PageHeader, Tabs, useAct, useLoad } from '../../components.jsx';

const ROLES = ['', 'resident', 'staff', 'partner', 'admin'];

// Accounts: make staff, partner and admin accounts, assign staff to hubs, suspend, reset passwords,
// and delete resident accounts that asked for it. An admin can never act on their own account.
export default function Accounts() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [making, setMaking] = useState(false);
  const [temp, setTemp] = useState(null);       // { name, password } shown once
  const [confirm, setConfirm] = useState(null); // { title, message, label, danger, fn, ok }
  const [hubsFor, setHubsFor] = useState(null);
  const list = useLoad(() => api(`/admin/users?role=${role}&q=${encodeURIComponent(query)}`), [role, query]);
  const hubs = useLoad(() => api('/admin/hubs'), []);
  const { run, busy } = useAct();
  const hubName = (id) => hubs.data?.find((h) => h.id === id)?.name || `#${id}`;

  return (
    <>
      <PageHeader title={t('Accounts')} subtitle={t('Residents sign up in the app. Staff, partner and admin accounts are made here.')}>
        <button className="btn primary" onClick={() => setMaking(true)}>{t('New account')}</button>
      </PageHeader>
      <Tabs value={role} onChange={setRole} tabs={ROLES.map((r) => ({ value: r, label: t(r ? `role_${r}` : 'All') }))} />
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
        <label htmlFor="q" className="sr-only">{t('Search')}</label>
        <input id="q" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Name, email or phone')} />
        <button className="btn">{t('Search')}</button>
      </form>
      <section className="card">
        {list.loading ? <Loading /> : list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : !list.data.length ? <Empty>{t('Nothing here yet.')}</Empty> : (
          <div className="table-wrap"><table>
            <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Role')}</th><th scope="col">{t('Contact')}</th><th scope="col">{t('Status')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
            <tbody>{list.data.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id}>
                  <td>{u.name}{u.org_name ? <div className="muted">{u.org_name}</div> : null}
                    {u.role === 'staff' && <div className="muted">{u.hub_ids.length ? u.hub_ids.map(hubName).join(', ') : t('No hub yet')}</div>}</td>
                  <td>{t(`role_${u.role}`)}</td>
                  <td>{u.email}{u.phone ? <div className="muted">{u.phone}</div> : null}</td>
                  <td>
                    {u.suspended ? <Badge value="suspended" label={t('Suspended')} /> : <Badge value="active" label={t('Active')} />}
                    {u.deletion_requested_at && <Badge value="warn" label={t('Asked to be deleted')} />}
                  </td>
                  <td className="cell-actions">
                    {self ? <span className="muted">{t('You')}</span> : (
                      <>
                        {u.role === 'staff' && <button className="btn small" onClick={() => setHubsFor(u)}>{t('Hubs')}</button>}
                        <button className="btn small" onClick={() => setConfirm({
                          title: `${t('Reset the password of')} ${u.name}?`, message: t('Do this only after checking who the person is. They are logged out everywhere and must choose a new password.'),
                          label: t('Reset password'),
                          fn: async () => { const r = await api(`/admin/users/${u.id}/reset-password`, { method: 'POST' }); setTemp({ name: u.name, password: r.temporary_password }); },
                        })}>{t('Reset password')}</button>
                        {u.suspended
                          ? <button className="btn small" disabled={busy} onClick={() => run(() => api(`/admin/users/${u.id}/reinstate`, { method: 'POST' }), t('Reinstated.'), list.reload)}>{t('Reinstate')}</button>
                          : <button className="btn small" onClick={() => setConfirm({
                            title: `${t('Suspend')} ${u.name}?`, message: t('They are logged out at once and cannot log in until reinstated.'), label: t('Suspend'), danger: true,
                            fn: () => api(`/admin/users/${u.id}/suspend`, { method: 'POST' }), ok: t('Suspended.'),
                          })}>{t('Suspend')}</button>}
                        {u.role === 'resident' && u.deletion_requested_at && (
                          <button className="btn small danger" onClick={() => setConfirm({
                            title: `${t('Delete the account of')} ${u.name}?`, message: t('Their name and contact details are removed for good. Item weights and points stay without a name.'), label: t('Delete account'), danger: true,
                            fn: () => api(`/admin/users/${u.id}/delete`, { method: 'POST' }), ok: t('Account deleted.'),
                          })}>{t('Delete account')}</button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>

      {making && <NewAccount hubs={hubs.data || []} onClose={() => setMaking(false)} onMade={async (r, name) => { setMaking(false); setTemp({ name, password: r.temporary_password }); await list.reload(); }} />}
      {hubsFor && <StaffHubs user={hubsFor} hubs={hubs.data || []} onClose={() => setHubsFor(null)} onSaved={async () => { setHubsFor(null); await list.reload(); }} />}
      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} confirmLabel={confirm.label} danger={confirm.danger}
          onConfirm={() => run(confirm.fn, confirm.ok, list.reload)} onClose={() => setConfirm(null)} />
      )}
      {temp && (
        <Modal title={`${t('Temporary password for')} ${temp.name}`} onClose={() => setTemp(null)}>
          <p className="temp-password" aria-live="polite">{temp.password}</p>
          <p className="muted">{t('Give it to the person now. It is shown only once. They must change it when they log in.')}</p>
          <div className="modal-actions"><button className="btn primary" onClick={() => setTemp(null)}>{t('Done')}</button></div>
        </Modal>
      )}
    </>
  );
}

function NewAccount({ hubs, onClose, onMade }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const [f, setF] = useState({ role: 'staff', name: '', email: '', phone: '', org_name: '', kind: 'shelter', hub_ids: [] });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault();
    await run(async () => {
      const r = await api('/admin/users', { method: 'POST', body: { ...f, phone: f.phone || undefined } });
      if (f.role === 'staff' && f.hub_ids.length) await api(`/admin/users/${r.id}/hubs`, { method: 'PUT', body: { hub_ids: f.hub_ids } });
      return r;
    }, t('Account made.'), (r) => onMade(r, f.name));
  }
  return (
    <Modal title={t('New account')} onClose={onClose}>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="role">{t('Role')}</label>
          <select id="role" value={f.role} onChange={set('role')}>
            {['staff', 'partner', 'admin'].map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor="n">{t('Full name')}</label><input id="n" value={f.name} onChange={set('name')} required minLength={2} /></div>
        <div className="field"><label htmlFor="e">{t('Email')}</label><input id="e" type="email" value={f.email} onChange={set('email')} required /></div>
        <div className="field"><label htmlFor="p">{t('Phone')} ({t('optional')})</label><input id="p" type="tel" value={f.phone} onChange={set('phone')} /></div>
        {f.role === 'partner' && (
          <>
            <div className="field"><label htmlFor="o">{t('Organization')}</label><input id="o" value={f.org_name} onChange={set('org_name')} required minLength={2} /></div>
            <div className="field">
              <label htmlFor="k">{t('Kind of organization')}</label>
              <select id="k" value={f.kind} onChange={set('kind')}>{['shelter', 'school', 'ngo', 'other'].map((k) => <option key={k} value={k}>{t(`org_${k}`)}</option>)}</select>
            </div>
          </>
        )}
        {f.role === 'staff' && (
          <fieldset className="field">
            <legend>{t('Works at')}</legend>
            {hubs.filter((h) => h.status === 'active').map((h) => (
              <label key={h.id} className="choice">
                <input type="checkbox" checked={f.hub_ids.includes(h.id)}
                  onChange={() => setF((x) => ({ ...x, hub_ids: x.hub_ids.includes(h.id) ? x.hub_ids.filter((i) => i !== h.id) : [...x.hub_ids, h.id] }))} /> {h.name}
              </label>
            ))}
          </fieldset>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy}>{t('Make account')}</button>
        </div>
      </form>
    </Modal>
  );
}

function StaffHubs({ user, hubs, onClose, onSaved }) {
  const { t } = useI18n();
  const { run, busy } = useAct();
  const [ids, setIds] = useState(user.hub_ids);
  return (
    <Modal title={`${t('Hubs of')} ${user.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); run(() => api(`/admin/users/${user.id}/hubs`, { method: 'PUT', body: { hub_ids: ids } }), t('Saved.'), onSaved); }}>
        <fieldset className="field">
          <legend>{t('Works at')}</legend>
          {hubs.map((h) => (
            <label key={h.id} className="choice">
              <input type="checkbox" checked={ids.includes(h.id)} onChange={() => setIds((x) => (x.includes(h.id) ? x.filter((i) => i !== h.id) : [...x, h.id]))} /> {h.name}
              {h.status !== 'active' && <span className="muted"> ({t(h.status)})</span>}
            </label>
          ))}
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="btn primary" disabled={busy}>{t('Save')}</button>
        </div>
      </form>
    </Modal>
  );
}
