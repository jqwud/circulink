import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Badge, ConfirmModal, Empty, ErrorBox, Loading, Modal, PageHeader, useLoad, useToast } from '../components.jsx';

const TIER_TONE = { gold: 'warn', silver: 'info', bronze: 'ok', starter: 'muted' };
const PARTS = [
  ['start', 'Starting point'], ['loans', 'Loans lent (on time, good)'], ['borrowers', 'Different borrowers'], ['returns', 'Good returns as borrower'],
  ['donations', 'Confirmed gifts'], ['ratings', 'Ratings received'], ['clean', 'Clean record'], ['penalties', 'Penalties'],
];

// The Tiwala (trust) score in shadow mode: calculated nightly, seen only by staff, and no reward is promised
// yet. It lets the barangay check the rules on real use before deciding the reward budget (spec section 8).
export default function Tiwala() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => api('/admin/tiwala'), []);
  const [open, setOpen] = useState(null);
  const [freezing, setFreezing] = useState(null);
  const admin = user.role === 'lgu_admin';

  async function recalc() {
    try { const r = await api('/admin/tiwala/run', { method: 'POST' }); toast(t('Recalculated {n} scores.').replace('{n}', r.residents)); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }
  async function freeze(r, frozen) {
    try { await api(`/admin/users/${r.user.id}/tiwala-freeze`, { method: 'POST', body: { frozen } }); toast(frozen ? t('Score held at 0 for 180 days.') : t('Hold lifted.')); setOpen(null); reload(); }
    catch (e) { toast(e.message, 'bad'); }
  }

  return (
    <>
      <PageHeader title={t('Tiwala score (preview)')} subtitle={t('How reliable each lender is over the last 90 days. Separate from credits; it can never be spent.')}>
        {admin && <button className="btn" onClick={recalc}>{t('Recalculate now')}</button>}
      </PageHeader>
      <div className="alert-info" role="note">
        <b>{t('Shadow mode')}</b> {t('Only staff see these scores. Residents are not told, and no reward is promised until the barangay decides the reward budget and suppliers (open questions Q1 to Q3).')}
      </div>
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid stats">
            {['gold', 'silver', 'bronze', 'starter'].map((k) => (
              <div className="stat" key={k}><b>{data.tiers[k] || 0}</b><span>{t(`tier_${k}`)}</span></div>
            ))}
          </div>
          {data.residents.length === 0 ? <div className="card"><Empty>{t('No scores yet. They are calculated every night.')}</Empty></div> : (
            <div className="card flush table-wrap">
              <table>
                <thead><tr><th>{t('Resident')}</th><th>{t('Score')}</th><th>{t('Tier')}</th><th>{t('Loans that count')}</th><th>{t('Signals')}</th><th><span className="sr-only">{t('Actions')}</span></th></tr></thead>
                <tbody>
                  {data.residents.map((r) => (
                    <tr key={r.user.id} className={r.needs_staff_check ? 'hot' : undefined}>
                      <td><b>{r.user.name}</b><small>{r.user.purok}</small></td>
                      <td><b>{r.score}</b></td>
                      <td><Badge value={TIER_TONE[r.tier]} label={t(`tier_${r.tier}`)} /></td>
                      <td>{r.counted_loans}</td>
                      <td>
                        {r.signals.map((s) => <Badge key={s} value="bad" label={t(`signal_${s}`)} />)}
                        {r.needs_staff_check && <> <Badge value="warn" label={t('Needs a staff check')} /></>}
                      </td>
                      <td><button className="btn small" onClick={() => setOpen(r)}>{t('How it was made')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {open && (
        <Modal title={`${open.user.name}: ${open.score}`} onClose={() => setOpen(null)}>
          <dl className="kv">
            {PARTS.map(([k, label]) => <div key={k} style={{ display: 'contents' }}><dt>{t(label)}</dt><dd>{open.parts[k] > 0 && k !== 'start' ? `+${open.parts[k]}` : open.parts[k]}</dd></div>)}
          </dl>
          <p className="muted">{t('Calculated on {d} from the last 90 days.').replace('{d}', open.computed_on)}</p>
          {admin && (
            <div className="modal-actions">
              {open.frozen_until
                ? <button className="btn" onClick={() => freeze(open, false)}>{t('Lift the hold')}</button>
                : <button className="btn danger" onClick={() => setFreezing(open)}>{t('Confirm collusion')}</button>}
            </div>
          )}
        </Modal>
      )}
      {freezing && (
        <ConfirmModal
          title={t('Confirm collusion for {name}?').replace('{name}', freezing.user.name)}
          message={t('Only after checking with the people involved. The score is held at 0 for 180 days and this is written to the audit log.')}
          confirmLabel={t('Confirm collusion')}
          danger
          onConfirm={() => { freeze(freezing, true); setFreezing(null); }}
          onClose={() => setFreezing(null)}
        />
      )}
    </>
  );
}
