// Certificates (docs/CERTIFICATES.md): a resident claims one when they qualify (CERTIFICATE_LEVELS in
// rules.js); participation and recognition are issued at once, champion waits for an admin. Admins can
// decline a request or revoke an issued certificate (for example after an upheld flag). Anyone with the code
// can check a certificate at /certificates/<code>, which shows only the name, level, hub, kg and dates.
import crypto from 'node:crypto';
import { q, one, withTx } from './db.js';
import { bad, notFound } from './errors.js';
import { audit, notify } from './services.js';
import { CERTIFICATE_LEVELS, certificateProgress } from './rules.js';
import { myImpact } from './dropoffs.js';

const LEVEL_NAMES = { participation: 'Certificate of Participation', recognition: 'Certificate of Recognition', champion: 'Circular Champion' };
const HEAD_TITLES = { school: 'School Principal', barangay: 'Punong Barangay', other: 'Hub Head' };

// The programme lead who signs with the hub head (CERTIFICATE_LEAD_NAME and _TITLE in .env).
export const programmeLead = () => ({
  name: process.env.CERTIFICATE_LEAD_NAME || null,
  title: process.env.CERTIFICATE_LEAD_TITLE || 'CircuLink Programme Lead',
});

// CL-XXXX-XXXX, without letters and digits that are easy to confuse (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() {
  const pick = () => Array.from(crypto.randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `CL-${pick()}-${pick()}`;
}

// Confirmed points, received drop-offs, active months, kg kept and the hub where most was kept.
export async function residentStats(userId) {
  const impact = await myImpact(userId);
  const d = await one(
    `SELECT COUNT(*) AS dropoffs, COUNT(DISTINCT DATE_FORMAT(received_at, '%Y-%m')) AS months
       FROM declarations WHERE resident_id = ? AND received_at IS NOT NULL`, [userId]);
  const hub = await one(
    `SELECT d.hub_id FROM items i JOIN declarations d ON d.id = i.declaration_id
      WHERE d.resident_id = ? AND i.outcome IS NOT NULL AND i.outcome <> 'reject'
      GROUP BY d.hub_id ORDER BY SUM(i.weight_kg) DESC LIMIT 1`, [userId]);
  return {
    points: impact.points_confirmed,
    dropoffs: Number(d.dropoffs),
    months: Number(d.months),
    kg: impact.kg_kept,
    hubId: hub ? hub.hub_id : null,
  };
}

const view = (c) => ({
  id: c.id, code: c.code, level: c.level, level_name: LEVEL_NAMES[c.level], status: c.status,
  kg_kept: Number(c.kg_kept), points: c.points, dropoffs: c.dropoffs, months_active: c.months_active,
  hub_name: c.hub_name || null, requested_at: c.requested_at, issued_at: c.issued_at, reason: c.reason,
});

const SELECT = `SELECT c.*, h.name AS hub_name FROM certificates c LEFT JOIN hubs h ON h.id = c.hub_id`;

// GET /me/certificates: my certificates and what each level still needs.
export async function myCertificates(userId) {
  const stats = await residentStats(userId);
  const certs = (await q(`${SELECT} WHERE c.user_id = ? ORDER BY c.id`, [userId])).map(view);
  return {
    stats: { points: stats.points, dropoffs: stats.dropoffs, months: stats.months, kg: stats.kg },
    levels: certificateProgress(stats).map((l) => ({ ...l, name: LEVEL_NAMES[l.key], certificate: certs.find((c) => c.level === l.key) || null })),
  };
}

// POST /me/certificates { level }: claim a level the resident qualifies for.
export async function claimCertificate(user, level) {
  const spec = CERTIFICATE_LEVELS.find((l) => l.key === level);
  if (!spec) throw bad('Choose a certificate level.', 'bad_level');
  const stats = await residentStats(user.id);
  if (!certificateProgress(stats).find((l) => l.key === level).eligible) {
    throw bad('You do not qualify for this certificate yet.', 'not_eligible');
  }
  return withTx(async (conn) => {
    const [[old]] = await conn.query('SELECT * FROM certificates WHERE user_id = ? AND level = ? FOR UPDATE', [user.id, level]);
    if (old && old.status === 'revoked') throw bad('This certificate was revoked by an admin.', 'revoked');
    if (old && old.status !== 'declined') throw bad('You already have this certificate.', 'already_claimed');
    const status = spec.review ? 'pending' : 'issued';
    const values = [stats.hubId, stats.kg, stats.points, stats.dropoffs, stats.months, status];
    let id;
    if (old) {
      await conn.query(
        `UPDATE certificates SET hub_id = ?, kg_kept = ?, points = ?, dropoffs = ?, months_active = ?, status = ?,
           requested_at = NOW(), issued_at = ${status === 'issued' ? 'NOW()' : 'NULL'}, decided_by = NULL, decided_at = NULL, reason = NULL
         WHERE id = ?`, [...values, old.id]);
      id = old.id;
    } else {
      const [r] = await conn.query(
        `INSERT INTO certificates (code, user_id, level, hub_id, kg_kept, points, dropoffs, months_active, status, issued_at)
         VALUES (?,?,?,?,?,?,?,?,?, ${status === 'issued' ? 'NOW()' : 'NULL'})`, [newCode(), user.id, level, ...values]);
      id = r.insertId;
    }
    await audit(user.id, status === 'issued' ? 'certificate_issued' : 'certificate_requested', { entity: 'certificate', entityId: id, details: { level } }, conn);
    if (status === 'issued') {
      await notify(conn, user.id, 'certificate_issued', `Your ${LEVEL_NAMES[level]} is ready`, 'Open Me, then My certificates, to view or share it.', id);
    }
    const [[row]] = await conn.query(`${SELECT} WHERE c.id = ?`, [id]);
    return view(row);
  });
}

// ---------- admins ----------

export async function listCertificates(status) {
  const where = ['pending', 'issued', 'declined', 'revoked'].includes(status) ? 'WHERE c.status = ?' : '';
  const rows = await q(
    `SELECT c.*, h.name AS hub_name, u.name AS resident_name FROM certificates c
       JOIN users u ON u.id = c.user_id LEFT JOIN hubs h ON h.id = c.hub_id ${where}
      ORDER BY FIELD(c.status, 'pending', 'issued', 'declined', 'revoked'), c.id DESC LIMIT 200`, where ? [status] : []);
  return rows.map((r) => ({ ...view(r), resident_name: r.resident_name }));
}

// approve (pending -> issued), decline (pending -> declined, with a reason), revoke (issued -> revoked).
export async function decideCertificate(actor, id, action, reason) {
  const moves = { approve: ['pending', 'issued'], decline: ['pending', 'declined'], revoke: ['issued', 'revoked'] };
  const move = moves[action];
  if (!move) throw bad('Unknown action.', 'bad_action');
  const why = String(reason || '').trim();
  if (action !== 'approve' && why.length < 3) throw bad('Write the reason the resident will see.', 'bad_reason');
  return withTx(async (conn) => {
    const [[c]] = await conn.query('SELECT * FROM certificates WHERE id = ? FOR UPDATE', [id]);
    if (!c) throw notFound();
    if (c.status !== move[0]) throw bad(`Only a ${move[0]} certificate can be changed this way.`, 'bad_state');
    await conn.query(
      `UPDATE certificates SET status = ?, decided_by = ?, decided_at = NOW(), reason = ?${action === 'approve' ? ', issued_at = NOW()' : ''} WHERE id = ?`,
      [move[1], actor.id, why ? why.slice(0, 255) : null, id]);
    await audit(actor.id, `certificate_${action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'revoked'}`,
      { entity: 'certificate', entityId: Number(id), details: { level: c.level, reason: why || null } }, conn);
    const name = LEVEL_NAMES[c.level];
    if (action === 'approve') await notify(conn, c.user_id, 'certificate_issued', `Your ${name} is ready`, 'Open Me, then My certificates, to view or share it.', c.id);
    if (action === 'decline') await notify(conn, c.user_id, 'certificate_declined', `Your ${name} request was not approved`, why, c.id);
    if (action === 'revoke') await notify(conn, c.user_id, 'certificate_revoked', `Your ${name} was revoked`, why, c.id);
  });
}

// ---------- public check ----------

// What anyone with the code may see. Pending and declined requests are not certificates, so they are not found.
export async function certificateByCode(code) {
  const c = await one(
    `SELECT c.*, u.name AS resident_name, h.name AS hub_name, h.type AS hub_type, h.head_name, h.head_title
       FROM certificates c JOIN users u ON u.id = c.user_id LEFT JOIN hubs h ON h.id = c.hub_id
      WHERE c.code = ? AND c.status IN ('issued', 'revoked')`, [String(code || '').toUpperCase().slice(0, 16)]);
  if (!c) throw notFound();
  return {
    code: c.code, level: c.level, level_name: LEVEL_NAMES[c.level], status: c.status, valid: c.status === 'issued',
    resident_name: c.resident_name, hub_name: c.hub_name, kg_kept: Number(c.kg_kept), months_active: c.months_active,
    issued_at: c.issued_at, revoked_at: c.status === 'revoked' ? c.decided_at : null,
    signatories: [
      { name: c.head_name || null, title: c.head_title || HEAD_TITLES[c.hub_type] || HEAD_TITLES.other, of: c.hub_name },
      { ...programmeLead(), of: 'CircuLink' },
    ],
  };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const longDate = (d) => (d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' }) : '');

// The certificate as a printable page (the browser's Print > Save as PDF makes the PDF). No scripts.
export function certificateHtml(c, link) {
  const kg = Number.isInteger(c.kg_kept) ? c.kg_kept : c.kg_kept.toFixed(1);
  const sign = (s) => `<div class="sign"><div class="line">${esc(s.name || '')}</div><b>${esc(s.title)}</b><span>${esc(s.of || '')}</span></div>`;
  const banner = c.valid
    ? `<p class="check ok">&#10003; Valid certificate, issued ${esc(longDate(c.issued_at))}</p>`
    : `<p class="check bad">&#10007; This certificate was revoked on ${esc(longDate(c.revoked_at))} and is no longer valid.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.level_name)} · ${esc(c.resident_name)} · CircuLink</title>
<style>
:root{--moss:#4A6B2A;--gold:#BF8B2E;--oat:#F6F2E8;--ink:#23261B;--muted:#5C5F4E}
*{box-sizing:border-box}body{margin:0;background:var(--oat);color:var(--ink);font-family:Nunito,'Segoe UI',Arial,sans-serif;padding:16px}
.check{max-width:820px;margin:0 auto 16px;padding:12px 16px;border-radius:14px;font-weight:700}
.ok{background:#E1EDD9;color:#2F6B3A}.bad{background:#FBE4DF;color:#B42318}
.cert{max-width:820px;margin:0 auto;background:#FFFDF8;border:10px solid var(--moss);outline:3px solid var(--gold);outline-offset:-22px;border-radius:6px;padding:48px 40px;text-align:center}
.brand{font-weight:800;font-size:22px;letter-spacing:-.5px}.brand span{color:var(--moss)}
.sdg{color:var(--gold);font-weight:700;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:4px}
h1{font-size:34px;margin:28px 0 8px;color:var(--moss)}.to{color:var(--muted);margin:0}
.name{font-size:30px;font-weight:800;margin:10px 0 4px;border-bottom:2px solid var(--gold);display:inline-block;padding:0 24px 6px}
.why{max-width:560px;margin:18px auto;line-height:1.55}
.signs{display:flex;gap:32px;justify-content:center;margin-top:40px;flex-wrap:wrap}
.sign{min-width:220px;display:flex;flex-direction:column;align-items:center;gap:2px}.sign span{color:var(--muted);font-size:13px}
.line{width:100%;border-bottom:1.5px solid var(--ink);min-height:28px;font-weight:700;padding-bottom:4px}
.foot{margin-top:32px;color:var(--muted);font-size:12px;word-break:break-all}
@media print{body{background:#fff;padding:0}.check{display:none}.cert{border-width:8px}}
</style></head><body>
${banner}
<main class="cert">
<div class="brand">Circu<span>Link</span></div>
<div class="sdg">SDG 12 · Responsible Consumption and Production</div>
<h1>${esc(c.level_name)}</h1>
<p class="to">is presented to</p>
<div class="name">${esc(c.resident_name)}</div>
<p class="why">for keeping <b>${esc(kg)} kg</b> of things in use and out of the landfill over ${esc(c.months_active)} month${c.months_active === 1 ? '' : 's'}${c.hub_name ? `, through <b>${esc(c.hub_name)}</b>` : ''}. Every item was weighed and checked by hub staff.</p>
<div class="signs">${c.signatories.map(sign).join('')}</div>
<div class="foot">Certificate ${esc(c.code)} · Issued ${esc(longDate(c.issued_at))} · Check it at ${esc(link)}<br>This certificate recognises community service. It has no cash value and is not academic credit.</div>
</main></body></html>`;
}
