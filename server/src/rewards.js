// Food rewards for reliable lenders (Hiraman 2.0, batch 33; design spec section 4). Rice grains and fresh
// vegetables from local producers, paid for by the LGU (decided 2026-10-24). Each quarter, residents who reach
// a Tiwala tier get vouchers: Bronze 1, Silver 2, Gold 3 (editable). Gold, and anyone with a signal, waits for a
// staff check. A voucher has a 6-digit code, is exchanged for one catalog unit at the barangay hall, and expires
// after 30 days. No money moves in the app; every stock change is recorded for the barangay's accounts.
import crypto from 'node:crypto';
import { q, one, withTx, todayPH } from './db.js';
import { RULES } from './rules.js';
import { bad, notFound } from './errors.js';
import { addDays, audit, notify } from './services.js';
import { TIERS, TIWALA } from './tiwala.js';

const first = (n) => String(n || '').split(' ')[0];
const PER_TIER = { bronze: 'vouchersBronze', silver: 'vouchersSilver', gold: 'vouchersGold' };

async function newCode(conn) {
  for (;;) {
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    const [[taken]] = await conn.query('SELECT id FROM vouchers WHERE code = ?', [code]);
    if (!taken) return code;
  }
}

// Vouchers for everyone with a tier in this period's scores. Safe to run again: nobody gets twice.
export async function issueVouchers(period, today = todayPH()) {
  const rows = await q(
    `SELECT t.user_id, t.tier, t.needs_staff_check FROM trust_scores t JOIN users u ON u.id = t.user_id
      WHERE t.period = ? AND t.tier IN ('bronze','silver','gold') AND u.deleted_at IS NULL AND u.suspended = 0
        AND NOT EXISTS (SELECT 1 FROM vouchers v WHERE v.user_id = t.user_id AND v.period = t.period)`, [period]);
  let issued = 0;
  for (const r of rows) {
    const n = RULES[PER_TIER[r.tier]];
    if (!n) continue;
    const held = r.tier === 'gold' || !!r.needs_staff_check;
    await withTx(async (conn) => {
      for (let i = 0; i < n; i++) {
        await conn.query('INSERT INTO vouchers (code, user_id, period, tier, status, expires_on) VALUES (?,?,?,?,?,?)',
          [await newCode(conn), r.user_id, period, r.tier, held ? 'held' : 'issued', addDays(today, RULES.voucherDays)]);
      }
      await notify(conn, r.user_id, 'voucher_issued', `You reached ${r.tier}! ${n} reward voucher${n === 1 ? '' : 's'}`,
        held ? 'Barangay staff check rewards for this tier first, within 2 working days.' : 'Choose your reward in the app and collect it at the barangay hall.', null,
        { tier: r.tier, n, held });
    });
    issued += n;
  }
  return { period, residents: rows.length, vouchers: issued };
}

// Staff release a held voucher (Gold, or a signal) after checking; or cancel it with a reason (collusion).
export function releaseVoucher(id, actor) {
  return withTx(async (conn) => {
    const [[v]] = await conn.query('SELECT * FROM vouchers WHERE id = ? FOR UPDATE', [id]);
    if (!v) throw notFound('Voucher not found.');
    if (v.status !== 'held') throw bad('This voucher is not waiting for a check.', 'bad_state');
    await conn.query("UPDATE vouchers SET status = 'issued', released_by = ?, hold_reason = NULL WHERE id = ?", [actor.id, v.id]);
    await notify(conn, v.user_id, 'voucher_released', 'Your reward is ready', 'Choose your reward in the app and collect it at the barangay hall.', null, { tier: v.tier });
    await audit(actor.id, 'voucher_released', `voucher #${v.id} (${v.period}, ${v.tier})`, conn);
    return { id: v.id, status: 'issued' };
  });
}

export function cancelVoucher(id, reason, actor) {
  const why = String(reason || '').trim();
  if (why.length < 3) throw bad('Write the reason.', 'reason_required');
  return withTx(async (conn) => {
    const [[v]] = await conn.query('SELECT * FROM vouchers WHERE id = ? FOR UPDATE', [id]);
    if (!v) throw notFound('Voucher not found.');
    if (!['held', 'issued', 'chosen'].includes(v.status)) throw bad('This voucher is already used or closed.', 'bad_state');
    if (v.status === 'chosen') await moveStock(conn, v.catalog_id, 1, 'cancel', `voucher #${v.id}`, actor.id);
    await conn.query("UPDATE vouchers SET status = 'cancelled', hold_reason = ? WHERE id = ?", [why.slice(0, 255), v.id]);
    await notify(conn, v.user_id, 'voucher_cancelled', 'A reward voucher was cancelled', why, null, { reason: why });
    await audit(actor.id, 'voucher_cancelled', `voucher #${v.id}: ${why}`, conn);
    return { id: v.id, status: 'cancelled' };
  });
}

// ---------- stock ----------
async function moveStock(conn, catalogId, change, reason, note, by) {
  const [[c]] = await conn.query('SELECT stock FROM reward_catalog WHERE id = ? FOR UPDATE', [catalogId]);
  if (!c) throw notFound('Reward not found.');
  if (c.stock + change < 0) throw bad('Not enough in stock.', 'out_of_stock');
  await conn.query('UPDATE reward_catalog SET stock = stock + ? WHERE id = ?', [change, catalogId]);
  await conn.query('INSERT INTO stock_moves (catalog_id, change_qty, reason, note, by_user) VALUES (?,?,?,?,?)', [catalogId, change, reason, note, by]);
}

// The LGU bought more (positive) or a count was corrected (positive or negative). Audited.
export function addStock(catalogId, qty, reason, note, actor) {
  const n = Number(qty);
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 10000) throw bad('Write a whole number of units.', 'bad_qty');
  if (!['purchase', 'correction'].includes(reason)) throw bad('Choose purchase or correction.', 'bad_reason');
  if (reason === 'purchase' && n < 0) throw bad('A purchase adds stock.', 'bad_qty');
  return withTx(async (conn) => {
    await moveStock(conn, catalogId, n, reason, note ? String(note).slice(0, 255) : null, actor.id);
    await audit(actor.id, `stock_${reason}`, `reward #${catalogId} ${n > 0 ? '+' : ''}${n}${note ? `: ${note}` : ''}`, conn);
    const [[c]] = await conn.query('SELECT id, stock FROM reward_catalog WHERE id = ?', [catalogId]);
    return c;
  });
}

// ---------- residents ----------
// Choose (or change) what a voucher is exchanged for. Reserves one unit of stock.
export function chooseReward(voucherId, user, catalogId) {
  return withTx(async (conn) => {
    const [[v]] = await conn.query('SELECT * FROM vouchers WHERE id = ? FOR UPDATE', [voucherId]);
    if (!v || v.user_id !== user.id) throw notFound('Voucher not found.');
    if (!['issued', 'chosen'].includes(v.status)) throw bad(v.status === 'held' ? 'Barangay staff are still checking this reward.' : 'This voucher is already used or closed.', 'bad_state');
    const [[c]] = await conn.query('SELECT * FROM reward_catalog WHERE id = ? AND active = 1', [Number(catalogId)]);
    if (!c) throw bad('Choose a reward from the list.', 'bad_reward');
    if (v.catalog_id === c.id) return { id: v.id, status: 'chosen', catalog_id: c.id };
    await moveStock(conn, c.id, -1, 'voucher', `voucher #${v.id}`, user.id);
    if (v.status === 'chosen' && v.catalog_id) await moveStock(conn, v.catalog_id, 1, 'cancel', `voucher #${v.id} changed`, user.id);
    await conn.query("UPDATE vouchers SET status = 'chosen', catalog_id = ?, chosen_at = NOW() WHERE id = ?", [c.id, v.id]);
    return { id: v.id, status: 'chosen', catalog_id: c.id };
  });
}

// ---------- the hall ----------
// What staff see when a resident (or a family member) shows a code: first name, purok, and the reward.
export async function lookupCode(code) {
  const v = await one(
    `SELECT v.*, u.name, u.purok, c.name_en, c.name_fil, c.stock FROM vouchers v JOIN users u ON u.id = v.user_id
       LEFT JOIN reward_catalog c ON c.id = v.catalog_id WHERE v.code = ?`, [String(code || '').trim()]);
  if (!v) throw notFound('No voucher has that code.');
  return {
    id: v.id, code: v.code, status: v.status, tier: v.tier, period: v.period, expires_on: v.expires_on,
    resident: { first_name: first(v.name), purok: v.purok },
    reward: v.catalog_id ? { id: v.catalog_id, name_en: v.name_en, name_fil: v.name_fil } : null,
  };
}

// Staff hand it out. A resident who has not chosen yet (for example a senior) chooses at the hall.
export function handOut(code, actor, catalogId = null) {
  return withTx(async (conn) => {
    const [[v]] = await conn.query('SELECT * FROM vouchers WHERE code = ? FOR UPDATE', [String(code || '').trim()]);
    if (!v) throw notFound('No voucher has that code.');
    if (v.status === 'given') throw bad('This voucher was already used.', 'already_given');
    if (!['issued', 'chosen'].includes(v.status)) throw bad(v.status === 'held' ? 'Release this voucher after the staff check first.' : 'This voucher is expired or cancelled.', 'bad_state');
    let reward = v.catalog_id;
    if (v.status === 'issued') {
      if (!catalogId) throw bad('Choose the reward with the resident.', 'bad_reward');
      await moveStock(conn, Number(catalogId), -1, 'voucher', `voucher #${v.id} (chosen at the hall)`, actor.id);
      reward = Number(catalogId);
    }
    await conn.query("UPDATE vouchers SET status = 'given', catalog_id = ?, given_at = NOW(), given_by = ? WHERE id = ?", [reward, actor.id, v.id]);
    const [[c]] = await conn.query('SELECT name_en FROM reward_catalog WHERE id = ?', [reward]);
    await notify(conn, v.user_id, 'voucher_given', `Received: ${c.name_en}`, 'Thank you for lending to your neighbors!', null, { item: c.name_en });
    await audit(actor.id, 'voucher_given', `voucher #${v.id} ${v.code}: ${c.name_en}`, conn);
    return { id: v.id, status: 'given', reward: c.name_en };
  });
}

// ---------- daily: expiry and reminders ----------
export async function runVouchers(now = new Date()) {
  const today = todayPH(now);
  const out = { expired: 0, reminded: 0 };
  const due = await q("SELECT id FROM vouchers WHERE status IN ('held','issued','chosen') AND expires_on < ?", [today]);
  for (const { id } of due) {
    await withTx(async (conn) => {
      const [[v]] = await conn.query('SELECT * FROM vouchers WHERE id = ? FOR UPDATE', [id]);
      if (!['held', 'issued', 'chosen'].includes(v.status) || v.expires_on >= today) return;
      if (v.status === 'chosen' && v.catalog_id) await moveStock(conn, v.catalog_id, 1, 'expiry', `voucher #${v.id}`, null);
      await conn.query("UPDATE vouchers SET status = 'expired' WHERE id = ?", [v.id]);
      await notify(conn, v.user_id, 'voucher_expired', 'A reward voucher expired', 'It was not collected in time. You can earn more next quarter.', null, { tier: v.tier });
      out.expired++;
    });
  }
  for (const days of [7, 1]) {
    const soon = await q("SELECT DISTINCT user_id FROM vouchers WHERE status IN ('issued','chosen') AND expires_on = ?", [addDays(today, days)]);
    for (const { user_id: uid } of soon) {
      const asked = await one(
        "SELECT id FROM notifications WHERE user_id = ? AND type = 'voucher_expiring' AND JSON_UNQUOTE(JSON_EXTRACT(params, '$.date')) = ? LIMIT 1",
        [uid, addDays(today, days)]);
      if (asked) continue;
      await notify({ query: q }, uid, 'voucher_expiring', 'Collect your reward soon', `Your voucher expires on ${addDays(today, days)}.`, null, { date: addDays(today, days), days });
      out.reminded++;
    }
  }
  return out;
}

// ---------- what a resident sees ----------
// The score, the tier, and the one next step to the next tier (in numbers the app turns into a sentence).
export async function myTiwala(userId) {
  const row = await one("SELECT * FROM trust_scores WHERE user_id = ? AND period = 'live'", [userId]);
  if (!row) return { score: null, tier: 'starter', next: null };
  const parts = typeof row.parts === 'string' ? JSON.parse(row.parts) : row.parts;
  const order = ['starter', 'bronze', 'silver', 'gold'];
  const nextTier = TIERS.slice().reverse().find((t) => order.indexOf(t.key) > order.indexOf(row.tier));
  return {
    score: row.score,
    tier: row.tier,
    parts,
    computed_on: row.computed_on,
    window_days: TIWALA.windowDays,
    next: nextTier ? {
      tier: nextTier.key,
      points: Math.max(0, nextTier.min - row.score),
      loans: Math.max(0, nextTier.loans - row.counted_loans),
    } : null,
  };
}

export async function myVouchers(userId) {
  const rows = await q(
    `SELECT v.id, v.code, v.status, v.tier, v.period, v.expires_on, v.catalog_id, c.name_en, c.name_fil
       FROM vouchers v LEFT JOIN reward_catalog c ON c.id = v.catalog_id
      WHERE v.user_id = ? AND (v.status IN ('held','issued','chosen') OR v.issued_at >= NOW() - INTERVAL 120 DAY)
      ORDER BY FIELD(v.status,'chosen','issued','held','given','expired','cancelled'), v.id DESC`, [userId]);
  return rows.map((v) => ({
    id: v.id, code: ['issued', 'chosen'].includes(v.status) ? v.code : null, status: v.status, tier: v.tier, period: v.period, expires_on: v.expires_on,
    reward: v.catalog_id ? { id: v.catalog_id, name_en: v.name_en, name_fil: v.name_fil } : null,
  }));
}

export const rewardCatalog = () => q(
  `SELECT c.id, c.name_en, c.name_fil, c.stock, s.name AS supplier FROM reward_catalog c LEFT JOIN suppliers s ON s.id = c.supplier_id
    WHERE c.active = 1 AND c.stock > 0 ORDER BY c.name_en`);

// The month's report for the barangay's accounts, plus about 5% of the vouchers given that month, picked at
// random, for staff to phone and confirm the resident really got the goods.
export async function monthReport(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw bad('Choose a month (YYYY-MM).', 'bad_month');
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lines = await q(
    `SELECT c.id, c.name_en, c.value_estimate, c.stock, s.name AS supplier,
            COALESCE(SUM(IF(m.reason = 'purchase', m.change_qty, 0)), 0) AS bought,
            COALESCE(-SUM(IF(m.reason = 'voucher', m.change_qty, 0)), 0) AS reserved,
            COALESCE(SUM(IF(m.reason IN ('expiry','cancel'), m.change_qty, 0)), 0) AS returned,
            COALESCE(SUM(IF(m.reason = 'correction', m.change_qty, 0)), 0) AS corrected
       FROM reward_catalog c LEFT JOIN suppliers s ON s.id = c.supplier_id
       LEFT JOIN stock_moves m ON m.catalog_id = c.id AND m.created_at >= ? AND m.created_at < ?
      GROUP BY c.id ORDER BY c.name_en`, [start, end]);
  const given = await q(
    `SELECT v.id, v.code, v.given_at, u.name, u.phone, c.name_en FROM vouchers v JOIN users u ON u.id = v.user_id JOIN reward_catalog c ON c.id = v.catalog_id
      WHERE v.status = 'given' AND v.given_at >= ? AND v.given_at < ?`, [start, end]);
  const callBack = given.slice().sort(() => Math.random() - 0.5).slice(0, Math.max(given.length ? 1 : 0, Math.ceil(given.length * 0.05)));
  return {
    month,
    lines: lines.map((l) => ({ ...l, bought: Number(l.bought), reserved: Number(l.reserved), returned: Number(l.returned), corrected: Number(l.corrected), value_given: (Number(l.reserved) - Number(l.returned)) * Number(l.value_estimate) })),
    vouchers_given: given.length,
    call_back: callBack.map((g) => ({ voucher_id: g.id, code: g.code, name: g.name, phone: g.phone, reward: g.name_en, given_at: g.given_at })),
  };
}

