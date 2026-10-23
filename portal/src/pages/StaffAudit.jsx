import { Fragment, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Badge, ConfirmModal, LoadMore, usePaged, ErrorBox, Loading, Modal, PageHeader, ResetPasswordButton, useDateFormat, useLoad, useToast } from '../components.jsx';

export default function StaffAudit() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const fmt = useDateFormat();
  const staff = useLoad(() => api('/admin/staff'), []);
  const audit = usePaged(() => '/admin/audit', []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    try { await api('/admin/staff', { method: 'POST', body: form }); toast(t('Staff account added.')); setForm(null); staff.reload(); audit.reload(); }
    catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  }
  const [confirming, setConfirming] = useState(null);
  async function toggle(s) {
    try {
      await api(`/admin/staff/${s.id}/${s.suspended ? 'enable' : 'disable'}`, { method: 'POST' });
      toast(s.suspended ? t('Account enabled.') : t('Account disabled.')); staff.reload(); audit.reload();
    } catch (err) { toast(err.message, 'bad'); }
  }
  // Disabling locks a staff member out, so it asks first. Enabling happens at once.
  const askToggle = (s) => (s.suspended ? toggle(s) : setConfirming(s));

  return (
    <>
      <PageHeader title={t('Staff & audit log')} subtitle={t('Staff accounts are created by an admin. Every action is written to the audit log.')}>
        <button className="btn primary" onClick={() => setForm({ name: '', email: '', password: '', role: 'lgu_staff' })}>+ {t('Add staff')}</button>
      </PageHeader>

      <h2>{t('Staff accounts')}</h2>
      {staff.loading && !staff.data && <Loading />}
      {staff.error && <ErrorBox error={staff.error} onRetry={staff.reload} />}
      {staff.data && (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Status')}</th><th /></tr></thead>
            <tbody>{staff.data.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b><small>{s.email}</small></td>
                <td>{s.role === 'lgu_admin' ? t('Admin') : t('Staff')}</td>
                <td>{s.suspended ? <Badge value="suspended" /> : <Badge value="approved" label="OK" />}</td>
                <td>{s.id !== user.id && <div className="cell-actions">
                  <button className="btn small" onClick={() => askToggle(s)}>{s.suspended ? t('Enable') : t('Disable')}</button>
                  <ResetPasswordButton person={s} small />
                </div>}</td>
              </tr>
            ))}</tbody>
          </table>
          <LoadMore list={audit} />
        </div>
      )}

      <h2 style={{ marginTop: 24 }}>{t('Audit log')}</h2>
      {audit.loading && !audit.data && <Loading />}
      {audit.data && (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('When')}</th><th>{t('Who')}</th><th>{t('What')}</th></tr></thead>
            <tbody>{audit.data.map((a) => (
              <Fragment key={a.id}><tr><td>{fmt(a.created_at)}</td><td>{a.actor || '–'}</td><td><b>{a.action.replace(/_/g, ' ')}</b><small>{a.target}</small></td></tr></Fragment>
            ))}</tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title={t('Add staff')} onClose={() => setForm(null)}>
          <form onSubmit={add}>
            <div className="field"><label htmlFor="sn">{t('Full name')}</label><input id="sn" value={form.name} onChange={(e) => set('name', e.target.value)} required /></div>
            <div className="field"><label htmlFor="se">{t('Email')}</label><input id="se" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required /></div>
            <div className="field"><label htmlFor="sp">{t('Password')}</label><input id="sp" type="password" minLength={8} placeholder={t('At least 8 characters')} value={form.password} onChange={(e) => set('password', e.target.value)} required /></div>
            <div className="field"><label htmlFor="sr">{t('Role')}</label>
              <select id="sr" value={form.role} onChange={(e) => set('role', e.target.value)}>
                <option value="lgu_staff">{t('Staff')}</option><option value="lgu_admin">{t('Admin')}</option>
              </select></div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setForm(null)}>{t('Cancel')}</button>
              <button className="btn primary" disabled={busy}>{t('Save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {confirming && (
        <ConfirmModal
          title={t('Disable {name}?').replace('{name}', confirming.name)}
          message={t('They can no longer log in to the portal. You can enable the account again any time.')}
          confirmLabel={t('Disable')}
          danger
          onConfirm={() => toggle(confirming)}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
