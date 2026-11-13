// Impact reports (spec target 12.6): kilograms sorted at the hubs, by outcome, hub, category and month.
// Totals only, never names (see the privacy notice). An item counts in the month staff weighed it
// (processed_at, Philippine time). Items whose points were cancelled by an upheld flag (R7) are left out,
// since their weight was judged wrong.
import { q, todayPH } from './db.js';
import { bad } from './errors.js';

const COUNTED = `i.outcome IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM points_ledger p WHERE p.item_id = i.id AND p.status = 'cancelled')`;

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const r1 = (n) => Math.round(Number(n || 0) * 10) / 10;

// '2026-11' → ['2026-11-01 00:00:00', '2026-12-01 00:00:00']. No month: the current one.
export function monthRange(month) {
  const m = month ? String(month) : todayPH().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw bad('Give the month as YYYY-MM.', 'bad_month');
  const [y, mo] = m.split('-').map(Number);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  return { month: m, from: `${m}-01 00:00:00`, to: `${next}-01 00:00:00` };
}

// kg per outcome, kg kept in use (everything not rejected), CO2e estimate, item count.
function totalsOf(rows) {
  const t = { items: 0, kg_total: 0, kg_reuse: 0, kg_repair: 0, kg_recycle: 0, kg_reject: 0, kg_kept: 0, co2e_avoided_kg: 0 };
  for (const r of rows) {
    const kg = Number(r.kg || 0);
    t.items += Number(r.items || 0);
    t.kg_total += kg;
    t[`kg_${r.outcome}`] += kg;
    if (r.outcome !== 'reject') {
      t.kg_kept += kg;
      t.co2e_avoided_kg += Number(r.co2 || 0);
    }
  }
  for (const k of Object.keys(t)) if (k.startsWith('kg_')) t[k] = r2(t[k]);
  t.co2e_avoided_kg = r1(t.co2e_avoided_kg);
  t.diversion_rate = t.kg_total ? Math.round((t.kg_kept / t.kg_total) * 1000) / 10 : 0;
  return t;
}

// select: extra columns, each "expression AS name"; they are also the group keys.
const GROUPED = (select, where) => {
  const keys = select.map((c) => c.split(' AS ')[0]);
  return `
  SELECT ${[...select, 'i.outcome'].join(', ')}, COUNT(*) AS items, SUM(i.weight_kg) AS kg, SUM(i.weight_kg * c.co2_per_kg) AS co2
    FROM items i JOIN declarations d ON d.id = i.declaration_id JOIN hubs h ON h.id = d.hub_id JOIN categories c ON c.id = i.category_id
   WHERE ${COUNTED} ${where}
   GROUP BY ${[...keys, 'i.outcome'].join(', ')}`;
};

// Rows grouped by a key, each turned into totals.
function groupTotals(rows, key, label) {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r[key])) groups.set(r[key], { [key]: r[key], ...label(r), rows: [] });
    groups.get(r[key]).rows.push(r);
  }
  return [...groups.values()].map(({ rows: g, ...head }) => ({ ...head, ...totalsOf(g) }))
    .sort((a, b) => b.kg_total - a.kg_total);
}

// The monthly report: the whole system (or one hub), split by hub and by category, plus the last 12 months.
export async function monthlyReport({ month, hubId } = {}) {
  const { month: m, from, to } = monthRange(month);
  const hub = hubId ? Number(hubId) : null;
  const where = `AND i.processed_at >= ? AND i.processed_at < ? ${hub ? 'AND d.hub_id = ?' : ''}`;
  const args = hub ? [from, to, hub] : [from, to];

  const byHub = await q(GROUPED(['d.hub_id AS hub_id', 'h.name AS hub_name', 'h.type AS hub_type'], where), args);
  const byCat = await q(GROUPED(['c.id AS category_id', 'c.slug AS slug', 'c.name_en AS name_en', 'c.name_fil AS name_fil'], where), args);
  const [people] = await q(
    `SELECT COUNT(DISTINCT d.id) AS dropoffs, COUNT(DISTINCT d.resident_id) AS residents
       FROM declarations d WHERE d.received_at >= ? AND d.received_at < ? ${hub ? 'AND d.hub_id = ?' : ''}`, args);
  const [released] = await q(
    `SELECT COUNT(DISTINCT r.id) AS releases, COUNT(ri.item_id) AS items FROM releases r JOIN release_items ri ON ri.release_id = r.id
      WHERE r.picked_up_at >= ? AND r.picked_up_at < ? ${hub ? 'AND r.hub_id = ?' : ''}`, args);

  // The 12 months up to this one, for the trend chart.
  const start = new Date(`${m}-01T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 11);
  const trendFrom = `${start.toISOString().slice(0, 7)}-01 00:00:00`;
  const trendRows = await q(GROUPED(["DATE_FORMAT(i.processed_at, '%Y-%m') AS month"], `AND i.processed_at >= ? AND i.processed_at < ? ${hub ? 'AND d.hub_id = ?' : ''}`),
    hub ? [trendFrom, to, hub] : [trendFrom, to]);
  const trend = [];
  for (let d = new Date(start); trend.length < 12; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const key = d.toISOString().slice(0, 7);
    const t = totalsOf(trendRows.filter((r) => r.month === key));
    trend.push({ month: key, kg_kept: t.kg_kept, kg_reject: t.kg_reject, items: t.items });
  }

  return {
    month: m,
    hub_id: hub,
    totals: {
      ...totalsOf(byHub),
      dropoffs: Number(people.dropoffs), residents: Number(people.residents),
      releases_picked_up: Number(released.releases), items_released: Number(released.items),
    },
    by_hub: groupTotals(byHub, 'hub_id', (r) => ({ hub_name: r.hub_name, hub_type: r.hub_type })),
    by_category: groupTotals(byCat, 'category_id', (r) => ({ slug: r.slug, name_en: r.name_en, name_fil: r.name_fil })),
    trend,
  };
}

// The same report as CSV, one line per hub and per category, for spreadsheets.
export function reportCsv(report) {
  const cols = ['items', 'kg_total', 'kg_reuse', 'kg_repair', 'kg_recycle', 'kg_reject', 'kg_kept', 'co2e_avoided_kg', 'diversion_rate'];
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [['month', 'group', 'name', ...cols].join(',')];
  const line = (group, name, t) => lines.push([report.month, group, name, ...cols.map((c) => t[c])].map(cell).join(','));
  line('all', report.hub_id ? `hub ${report.hub_id}` : 'all hubs', report.totals);
  for (const h of report.by_hub) line('hub', h.hub_name, h);
  for (const c of report.by_category) line('category', c.name_en, c);
  return `${lines.join('\n')}\n`;
}

// What everyone has done together, for the app (target 12.8). All time, all hubs.
export async function communityImpact() {
  const rows = await q(GROUPED([], ''));
  const t = totalsOf(rows);
  const [p] = await q("SELECT COUNT(DISTINCT resident_id) AS residents FROM declarations WHERE status = 'received'");
  return { kg_kept: t.kg_kept, co2e_avoided_kg: t.co2e_avoided_kg, items: t.items, residents: Number(p.residents) };
}
