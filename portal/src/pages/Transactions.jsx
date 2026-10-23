import { useState } from 'react';
import { api, upload } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Badge, Empty, LoadMore, usePaged, ErrorBox, Loading, Modal, PageHeader, Tabs, daysLate, useDateFormat, useLoad, useToast } from '../components.jsx';

// The request's message thread. Staff can read every thread and write in it.
function Thread({ req, onClose }) {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useDateFormat();
  const thread = useLoad(() => api(`/requests/${req.id}/messages`), [req.id]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await api(`/requests/${req.id}/messages`, { method: 'POST', body: { body: text } }); setText(''); thread.reload(); }
    catch (err) { toast(err.message, 'bad'); } finally { setBusy(false); }
  }
  const list = thread.data?.messages || [];
  return (
    <Modal title={`${t('Messages')}: ${req.item.title}`} onClose={onClose} wide>
      {thread.loading && !thread.data && <Loading />}
      {thread.data && (list.length === 0 ? <p className="muted">{t('No messages yet.')}</p> : (
        <ul className="thread">
          {list.map((m) => (
            <li key={m.id} className={m.staff ? 'staff' : ''}>
              <b>{m.staff ? t('Barangay staff') : m.from}</b> <span className="muted">· {fmt(m.created_at)}</span>
              <p>{m.body}</p>
            </li>
          ))}
        </ul>
      ))}
      {thread.data?.open ? (
        <form onSubmit={send} className="row" style={{ marginTop: 12 }}>
          <input className="grow" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={t('Write a message')} aria-label={t('Write a message')} />
          <button className="btn primary" disabled={busy}>{t('Send')}</button>
        </form>
      ) : thread.data && <p className="muted">{t('This conversation is closed.')}</p>}
    </Modal>
  );
}

// What staff may do on any request: owners normally handle their own, but staff can always step in.
function actionFor(r) {
  if (r.status === 'pending') return 'decide';
  if (r.status === 'approved') return 'handover';
  if (r.status === 'handed_over') return 'return';
  return null;
}

// Which rows need staff (the "Needs action" tab)?
function nextAction(r) {
  if (r.status === 'pending' && r.handled_by_staff) return 'decide';
  if (r.status === 'approved' && r.handled_by_staff) return 'handover';
  if (r.status === 'handed_over' && (r.handled_by_staff || r.overdue)) return 'return';
  return null;
}

export default function Transactions() {
  const { t } = useI18n();
  const toast = useToast();
  const fmt = useDateFormat();
  const [tab, setTab] = useState('action');
  const [text, setText] = useState('');

  const path = tab === 'overdue' ? '/admin/requests?overdue=1' : tab === 'checkins' ? '/admin/requests?checkins=1' : tab === 'all' ? `/admin/requests${text ? `?q=${encodeURIComponent(text)}` : ''}` : '/admin/requests?staff=1';
  const list = usePaged(() => path, [path]);
  const { data, loading, error, reload } = list;
  const all = useLoad(() => api('/admin/requests?overdue=1'), [tab]);

  const [dialog, setDialog] = useState(null);   // { kind: 'handover'|'return'|'reject'|'thread', req }
  const [condition, setCondition] = useState('good');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);

  let rows = data || [];
  if (tab === 'action') rows = rows.filter((r) => nextAction(r)).concat((all.data || []).filter((o) => !rows.some((r) => r.id === o.id)));

  const close = () => { setDialog(null); setCondition('good'); setNote(''); setPhoto(''); };

  async function act(path2, body) {
    setBusy(true);
    try { await api(path2, { method: 'POST', body }); toast(t('Done.')); close(); reload(); all.reload(); }
    catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function onPhoto(e) {
    const f = e.target.files[0];
    if (!f) return;
    try { setPhoto(await upload(f)); } catch (err) { toast(err.message, 'bad'); }
  }
  async function reminders() {
    try { const r = await api('/admin/run-reminders', { method: 'POST' }); toast(`${t('Reminders sent')}: ${r.sent}`); }
    catch (e) { toast(e.message, 'bad'); }
  }

  const counts = { action: (data && tab === 'action' ? rows.length : 0), overdue: all.data?.length || 0 };

  return (
    <>
      <PageHeader title={t('Transactions')} subtitle={t('Approvals, handovers and returns for items the barangay handles, plus every loan in the system.')}>
        <button className="btn" onClick={reminders}>{t('Send reminders now')}</button>
      </PageHeader>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'action', label: t('Needs action'), count: counts.action },
        { value: 'overdue', label: t('Overdue'), count: counts.overdue },
        { value: 'checkins', label: t('Missed check-ins'), count: tab === 'checkins' ? rows.length : 0 },
        { value: 'all', label: t('Every transaction') },
      ]} />
      {tab === 'all' && (
        <div className="toolbar"><input type="search" placeholder={t('Search item or borrower')} value={text} onChange={(e) => setText(e.target.value)} aria-label={t('Search')} /></div>
      )}
      {loading && !data && <Loading />}
      {error && <ErrorBox error={error} onRetry={reload} />}
      {data && (rows.length === 0 ? <div className="card"><Empty pose="cheer">{t('Nothing needs action right now.')}</Empty></div> : (
        <div className="card flush table-wrap">
          <table>
            <thead><tr><th>{t('Item')}</th><th>{t('Borrower')}</th><th>{t('Owner')}</th><th>{t('Dates')}</th><th>{t('Status')}</th><th>{t('Actions')}</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const act1 = actionFor(r);
                return (
                  <tr key={r.id} className={r.overdue ? 'hot' : ''}>
                    <td><b>{r.item.title}</b><small>#{r.id} · {r.credit_cost} {r.credit_cost === 1 ? 'credit' : 'credits'}{r.handled_by_staff ? ` · ${t('Barangay handles')}` : ''}</small></td>
                    <td>{r.borrower_full_name}<small>{r.borrower.purok}{r.borrower_phone ? ` · ${r.borrower_phone}` : ''}</small></td>
                    <td>{r.owner?.name || t('Shelf')}</td>
                    <td>{fmt(r.start_date)} – {fmt(r.end_date)}{r.overdue && <small style={{ color: 'var(--c-danger)', fontWeight: 700 }}>{daysLate(r.end_date)} {t('day(s) late')}</small>}</td>
                    <td><Badge value={r.status} />{r.overdue && <> <Badge value="overdue" label={t('Overdue')} /></>}{r.return_condition && r.return_condition !== 'good' && <> <Badge value="disputed" label={t(r.return_condition)} /></>}
                      {r.borrower_returned_at && r.status === 'handed_over' && <> <Badge value="info" label={t('Borrower says returned')} /></>}
                      {r.checkin?.alert && <> <Badge value="overdue" label={`${t('No check-in')}: ${r.checkin.missed_days} ${t('days')}`} /></>}</td>
                    <td><div className="cell-actions">
                      {act1 === 'decide' && <>
                        <button className="btn small primary" disabled={busy} onClick={() => act(`/requests/${r.id}/approve`)}>{t('Approve')}</button>
                        <button className="btn small" onClick={() => setDialog({ kind: 'reject', req: r })}>{t('Reject')}</button>
                      </>}
                      {act1 === 'handover' && <button className="btn small primary" onClick={() => setDialog({ kind: 'handover', req: r })}>{t('Confirm handover')}</button>}
                      {act1 === 'return' && <button className="btn small primary" onClick={() => setDialog({ kind: 'return', req: r })}>{t('Confirm return')}</button>}
                      {['pending', 'approved'].includes(r.status) && <button className="btn small danger" onClick={() => setDialog({ kind: 'cancel', req: r })}>{t('Cancel request')}</button>}
                      <button className="btn small" onClick={() => setDialog({ kind: 'thread', req: r })}>{t('Messages')}{r.message_count ? ` (${r.message_count})` : ''}</button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tab === 'all' && <LoadMore list={list} />}
        </div>
      ))}

      {dialog?.kind === 'thread' && <Thread req={dialog.req} onClose={close} />}

      {dialog?.kind === 'cancel' && (
        <Modal title={`${t('Cancel request')}: ${dialog.req.item.title}`} onClose={close}>
          <p className="muted" style={{ marginTop: 0 }}>{t('The borrower gets the held credits back. Both neighbors see your reason.')}</p>
          <div className="field"><label htmlFor="cr">{t('Reason')}</label><textarea id="cr" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="modal-actions">
            <button className="btn" onClick={close}>{t('Keep it')}</button>
            <button className="btn danger" disabled={busy || !note.trim()} onClick={() => act(`/admin/requests/${dialog.req.id}/cancel`, { reason: note })}>{t('Cancel request')}</button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'reject' && (
        <Modal title={`${t('Reject')}: ${dialog.req.item.title}`} onClose={close}>
          <div className="field"><label htmlFor="r">{t('Reason')}</label><textarea id="r" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="modal-actions">
            <button className="btn" onClick={close}>{t('Cancel')}</button>
            <button className="btn danger" disabled={busy} onClick={() => act(`/requests/${dialog.req.id}/reject`, { reason: note })}>{t('Reject')}</button>
          </div>
        </Modal>
      )}

      {(dialog?.kind === 'handover' || dialog?.kind === 'return') && (
        <Modal title={`${dialog.kind === 'handover' ? t('Confirm handover') : t('Confirm return')}: ${dialog.req.item.title}`} onClose={close}>
          {dialog.kind === 'return' && (
            <>
              <div className="field">
                <label htmlFor="cond">{t('Return condition')}</label>
                <select id="cond" value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {['good', 'damaged', 'lost'].map((c) => <option key={c} value={c}>{t(c)}</option>)}
                </select>
              </div>
              <p className="muted">{t('Damaged or lost items go to a dispute for mediation.')}</p>
              <div className="field"><label htmlFor="n">{t('Notes')} ({t('Optional')})</label><textarea id="n" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </>
          )}
          <div className="field">
            <label htmlFor="ph">{t('Condition photo (required for medium and high tier)')}</label>
            <input id="ph" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onPhoto} />
            {photo && <small className="muted">✓ {photo.split('/').pop()}</small>}
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={close}>{t('Cancel')}</button>
            <button className="btn primary" disabled={busy}
              onClick={() => act(`/requests/${dialog.req.id}/${dialog.kind}`, dialog.kind === 'return' ? { condition, note, photo } : { photo })}>
              {dialog.kind === 'handover' ? t('Confirm handover') : t('Confirm return')}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
