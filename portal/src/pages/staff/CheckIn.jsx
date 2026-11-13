import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useI18n } from '../../i18n.jsx';
import { Badge, Empty, ErrorBox, Loading, PageHeader, kg, useAct, useDateFormat, useLoad, useToast } from '../../components.jsx';

const OUTCOMES = ['reuse', 'repair', 'recycle', 'reject'];

// Check-in and sorting at the counter: type the resident's code, then weigh and sort each item.
export default function CheckIn() {
  const { t } = useI18n();
  const toast = useToast();
  const date = useDateFormat();
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('id')) || null;
  const [code, setCode] = useState('');
  const { run, busy } = useAct();
  const queue = useLoad(() => api('/staff/queue'), [openId]);
  const meta = useLoad(() => api('/meta'), []);

  async function submit(e) {
    e.preventDefault();
    const d = await run(() => api('/staff/checkin', { method: 'POST', body: { code } }), t('Checked in. Weigh and sort each item.'));
    if (d) { setCode(''); setParams({ id: d.id }); }
  }

  return (
    <>
      <PageHeader title={t('Check in and sort')} subtitle={t('Type the code the resident shows you. It works once, only at its own hub.')} />
      <form className="card row end" onSubmit={submit}>
        <div className="field m-0">
          <label htmlFor="code">{t('Drop-off code')}</label>
          <input id="code" className="code-input" value={code} maxLength={9} autoComplete="off" autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" required />
        </div>
        <button className="btn primary" disabled={busy || code.replace(/[\s-]/g, '').length !== 6}>{t('Check in')}</button>
      </form>

      {openId && meta.error && <ErrorBox error={meta.error} onRetry={meta.reload} />}
      {openId && meta.data && <Declaration id={openId} meta={meta.data} onDone={() => { setParams({}); toast(t('All items sorted.')); }} />}

      <section className="card">
        <h2>{t('Waiting to be sorted')}</h2>
        {queue.loading ? <Loading /> : queue.error ? <ErrorBox error={queue.error} onRetry={queue.reload} /> : !queue.data.length
          ? <Empty>{t('Nothing waiting. Checked-in drop-offs appear here until every item is sorted.')}</Empty>
          : (
            <div className="table-wrap"><table>
              <thead><tr><th scope="col">{t('Resident')}</th><th scope="col">{t('Hub')}</th><th scope="col">{t('Items left')}</th><th scope="col">{t('Checked in')}</th><th scope="col"><span className="sr-only">{t('Actions')}</span></th></tr></thead>
              <tbody>{queue.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.resident_name}</td><td>{r.hub_name}</td><td>{r.to_sort} / {r.items}</td><td>{date(r.received_at, true)}</td>
                  <td><button className="btn small" onClick={() => setParams({ id: r.id })}>{t('Sort')}</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
      </section>
    </>
  );
}

function Declaration({ id, meta, onDone }) {
  const { t, lang } = useI18n();
  const d = useLoad(() => api(`/staff/declarations/${id}`), [id]);
  const { run, busy } = useAct();
  const [extra, setExtra] = useState('');
  if (d.loading) return <Loading />;
  if (d.error) return <ErrorBox error={d.error} onRetry={d.reload} />;
  const left = d.data.items.filter((i) => i.state === 'received').length;
  const reload = d.reload;

  return (
    <section className="card" aria-labelledby="decl-title">
      <div className="row between">
        <h2 id="decl-title" className="m-0">{t('Drop-off of')} {d.data.resident.name}</h2>
        <span className="muted">{d.data.hub.name} · {left} {t('to sort')}</span>
      </div>
      {d.data.note && <p className="note">{d.data.note}</p>}
      {d.data.items.map((i) => <SortRow key={i.id} item={i} meta={meta} onSorted={async () => {
        await reload();
        if (left === 1) onDone();
      }} />)}
      <form className="row mt-12" onSubmit={async (e) => {
        e.preventDefault();
        await run(() => api(`/staff/declarations/${id}/items`, { method: 'POST', body: { category_id: Number(extra) } }), t('Item added.'), reload);
        setExtra('');
      }}>
        <label htmlFor="extra" className="muted">{t('They brought something not listed:')}</label>
        <select id="extra" value={extra} onChange={(e) => setExtra(e.target.value)} required>
          <option value="">{t('Choose a category')}</option>
          {meta.categories.map((c) => <option key={c.id} value={c.id}>{lang === 'fil' ? c.name_fil : c.name_en}</option>)}
        </select>
        <button className="btn small" disabled={busy || !extra}>{t('Add item')}</button>
      </form>
    </section>
  );
}

function SortRow({ item, meta, onSorted }) {
  const { t, lang } = useI18n();
  const { run, busy } = useAct();
  const [f, setF] = useState({ category_id: String(item.category_id), weight_kg: '', outcome: '', expiry_date: '' });
  const cat = meta.categories.find((c) => String(c.id) === f.category_id) || item.category;
  const name = (c) => (lang === 'fil' ? c.name_fil : c.name_en);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const label = `${name(item.category)}${item.description ? `: ${item.description}` : ''}`;

  if (item.state !== 'received') {
    return (
      <div className="sort-row">
        <div><b>{label}</b></div>
        <div className="done">
          {kg(item.weight_kg)} · <Badge value={item.outcome} label={t(item.outcome)} /> · <span className="pts">{item.points} {t('points')}</span> <Badge value={item.points_status} label={t(item.points_status)} />
        </div>
      </div>
    );
  }
  const outcomes = cat?.food ? ['reuse', 'reject'] : OUTCOMES;
  const idp = `item-${item.id}`;
  return (
    <form className="sort-row" onSubmit={(e) => {
      e.preventDefault();
      run(() => api(`/staff/items/${item.id}/sort`, { method: 'POST', body: { ...f, category_id: Number(f.category_id), weight_kg: Number(f.weight_kg), expiry_date: f.expiry_date || undefined } }),
        (r) => `${t('Sorted')}: ${r.points} ${t('points')}${r.flags.length ? ` · ${t('flagged for an admin')}` : ''}`, onSorted);
    }}>
      <div className="field">
        <label htmlFor={`${idp}-cat`}>{label}</label>
        <select id={`${idp}-cat`} value={f.category_id} onChange={set('category_id')}>
          {meta.categories.map((c) => <option key={c.id} value={c.id}>{name(c)}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-kg`}>{t('Weight (kg)')}</label>
        <input id={`${idp}-kg`} type="number" inputMode="decimal" step="0.01" min="0.01" max="500" value={f.weight_kg} onChange={set('weight_kg')} required />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-out`}>{t('Outcome')}</label>
        <select id={`${idp}-out`} value={f.outcome} onChange={set('outcome')} required>
          <option value="">{t('Choose')}</option>
          {outcomes.map((o) => <option key={o} value={o}>{t(o)}</option>)}
        </select>
      </div>
      <div className="field">
        {cat?.food ? (
          <>
            <label htmlFor={`${idp}-exp`}>{t('Expiry date')}</label>
            <input id={`${idp}-exp`} type="date" value={f.expiry_date} onChange={set('expiry_date')} required={f.outcome === 'reuse'} />
          </>
        ) : cat?.hazardous ? <span className="muted">{t('Hazardous: accredited recyclers only')}</span> : null}
      </div>
      <button className="btn primary" disabled={busy}>{t('Save')}</button>
    </form>
  );
}
