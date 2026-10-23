// Hiraman 2.0, batch 27: residents message each other only with quick replies; anything else goes to a
// concern that only staff read; the few typed texts left pass a kind-words check.
// Seeded: Ana owns the luggage (medium, so a request waits for her); Fidel borrows it.
import './helpers/env.js';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { pool, q, one } from '../src/db.js';
import { resetTestDatabase, seedTestDatabase } from './helpers/db.js';
import { startServer, day } from './helpers/api.js';
import { renderPhrase, phraseById, phrasesFor, PHRASES, checkSlot } from '../src/phrases.js';
import { findUnkind } from '../src/rules.js';
import { deleteOldMessages } from '../src/jobs.js';

let s; let ana; let ben; let dina; let fidel; let staff; let admin;
let req; // Fidel's request for Ana's luggage
const userId = async (who) => (await one('SELECT id FROM users WHERE email = ?', [`${who}@hiraman.test`])).id;
const itemId = async (title) => (await one('SELECT id FROM items WHERE title = ?', [title])).id;
const thread = async (token, id = req) => (await s.api('GET', `/requests/${id}/messages`, token)).json;
const say = (token, phrase_id, slot, id = req) => s.api('POST', `/requests/${id}/messages`, token, { phrase_id, slot });

before(async () => {
  await resetTestDatabase();
  seedTestDatabase();
  s = startServer();
  [ana, ben, dina, fidel, staff, admin] = await Promise.all(['ana', 'ben', 'dina', 'fidel', 'staff', 'admin'].map((w) => s.login(w)));
  const r = await s.api('POST', '/requests', fidel, { item_id: await itemId('Travel luggage (large)'), start_date: day(4), end_date: day(6) });
  assert.equal(r.json.status, 'pending');
  req = r.json.id;
});
after(async () => { await s.close(); await pool.end(); });

describe('the phrase catalog', () => {
  test('has the 42 phrases (35 for loans, 7 for donations), unique ids, both languages, and replies that exist', () => {
    assert.equal(PHRASES.length, 42);
    assert.equal(new Set(PHRASES.map((p) => p.id)).size, PHRASES.length);
    for (const p of PHRASES) {
      assert.ok(p.en && p.fil, p.id);
      assert.equal(p.en.includes('{slot}'), !!p.slot, `${p.id}: slot marker matches slot type`);
      for (const r of p.replies || []) assert.ok(phraseById(r), `${p.id} reply ${r}`);
    }
  });
  test('renders slots in each language', () => {
    const points = new Map([[3, 'Covered Court']]);
    assert.equal(renderPhrase(phraseById('P01'), '2026-10-24', 'en'), 'Is this item still available on Sat 24 Oct?');
    assert.equal(renderPhrase(phraseById('P01'), '2026-10-24', 'fil'), 'Available pa po ba ito sa Sabado 24 Okt?');
    assert.equal(renderPhrase(phraseById('A01'), '2026-10-24 16:30', 'en'), 'Can we meet on Sat 24 Oct, 4:30 PM?');
    assert.equal(renderPhrase(phraseById('A04'), '3', 'fil', points), 'Puwede po bang sa Covered Court na lang tayo magkita?');
    assert.equal(renderPhrase(phraseById('A04'), '3', 'en', points), 'Can we meet at Covered Court instead?');
    assert.equal(renderPhrase(phraseById('A07'), '2', 'en'), "I'm running 20 minutes late. Sorry!");
    assert.equal(renderPhrase(phraseById('P06'), 'fair', 'fil'), 'Nasa katamtaman na kondisyon po ito, tulad ng nasa larawan.');
  });
  test('slots only take picked values', () => {
    const ctx = { today: '2026-10-23', pointIds: new Set([1, 2]) };
    assert.equal(checkSlot(phraseById('P01'), '2026-10-30', ctx), '2026-10-30');
    for (const [id, v] of [['P01', 'tomorrow'], ['P01', '2027-06-01'], ['A01', '2026-10-24 16:15'], ['A01', '2026-10-24 23:00'],
      ['A04', '9'], ['P06', 'broken'], ['P02', '6'], ['P02', '1; DROP']]) {
      assert.throws(() => checkSlot(phraseById(id), v, ctx), { code: 'bad_slot' }, `${id} ${v}`);
    }
  });
  test('each side sees only its own phrases for the request\'s situation', () => {
    assert.deepEqual(phrasesFor('pending', 'B').map((p) => p.id), ['P01', 'P02', 'P03']);
    assert.deepEqual(phrasesFor('pending', 'O').map((p) => p.id), ['P04', 'P05', 'P06']);
    assert.ok(phrasesFor('handed_over', 'B').some((p) => p.id === 'D01'));
    assert.deepEqual(phrasesFor('cancelled', 'B'), []);
  });
});

describe('sending quick replies', () => {
  test('the thread offers each side its phrases, and staff free text', async () => {
    const forFidel = await thread(fidel);
    assert.deepEqual(forFidel.phrases.map((p) => p.id), ['P01', 'P02', 'P03']);
    assert.equal(forFidel.can_write_text, false);
    assert.deepEqual((await thread(ana)).phrases.map((p) => p.id), ['P04', 'P05', 'P06']);
    const forStaff = await thread(staff);
    assert.equal(forStaff.can_write_text, true);
    assert.deepEqual(forStaff.phrases, []);
  });

  test('residents cannot type free text', async () => {
    const r = await s.api('POST', `/requests/${req}/messages`, fidel, { body: 'call me at 0917...' });
    assert.equal(r.status, 400); assert.equal(r.json.code, 'phrases_only');
  });

  test('a phrase must exist, fit the situation and belong to the sender\'s side', async () => {
    assert.equal((await say(fidel, 'Z99')).json.code, 'unknown_phrase');
    assert.equal((await say(fidel, 'A05')).json.code, 'phrase_not_now', 'pickup phrases wait for approval');
    assert.equal((await say(fidel, 'P04')).json.code, 'phrase_not_now', 'owner phrases are not for the borrower');
    assert.equal((await say(fidel, 'P01', 'next week')).json.code, 'bad_slot');
  });

  test('a phrase is stored as id + value and shown in both languages', async () => {
    const r = await say(fidel, 'P01', day(4));
    assert.equal(r.status, 201);
    const row = await one('SELECT phrase_id, slot_value, body FROM request_messages WHERE id = ?', [r.json.id]);
    assert.deepEqual({ ...row }, { phrase_id: 'P01', slot_value: day(4), body: null });
    const m = (await thread(ana)).messages.at(-1);
    assert.equal(m.phrase_id, 'P01'); assert.equal(m.from, 'Fidel'); assert.equal(m.mine, false);
    assert.match(m.en, /^Is this item still available on \w{3} \d{1,2} \w{3}\?$/);
    assert.match(m.fil, /^Available pa po ba ito sa \w+ \d{1,2} \w{3}\?$/);
  });

  test('the owner\'s notification quotes the phrase', async () => {
    const n = await one("SELECT body FROM notifications WHERE user_id = ? AND type = 'message' AND ref_id = ? ORDER BY id DESC LIMIT 1", [await userId('ana'), req]);
    assert.match(n.body, /^Is this item still available on/);
  });

  test('reply buttons follow a phrase that asks something', async () => {
    assert.equal((await s.api('POST', `/requests/${req}/approve`, ana)).status, 200);
    assert.equal((await say(fidel, 'A01', `${day(4)} 16:00`)).status, 201);
    const forAna = (await thread(ana)).messages.at(-1);
    assert.deepEqual(forAna.replies, ['A02', 'A03']);
    assert.deepEqual((await thread(fidel)).messages.at(-1).replies, [], 'no reply buttons on your own message');
    assert.equal((await say(ana, 'A02')).status, 201);
  });

  test('the same phrase waits 10 minutes, and 10 messages a day is the most', async () => {
    assert.equal((await say(ana, 'A05')).status, 201);
    const again = await say(ana, 'A05');
    assert.equal(again.status, 429); assert.equal(again.json.code, 'same_phrase_wait');
    const anaId = await userId('ana');
    for (let i = 0; i < 8; i++) await q("INSERT INTO request_messages (request_id, sender_id, phrase_id) VALUES (?,?,'A06')", [req, anaId]);
    const more = await say(ana, 'A04', '1');
    assert.equal(more.status, 429); assert.equal(more.json.code, 'too_many_messages');
    await q("DELETE FROM request_messages WHERE request_id = ? AND sender_id = ? AND phrase_id = 'A06'", [req, anaId]);
  });

  test('staff still write free text, which residents read as staff', async () => {
    assert.equal((await s.api('POST', `/requests/${req}/messages`, staff, { body: 'The hall is open until 5 pm today.' })).status, 201);
    const m = (await thread(fidel)).messages.at(-1);
    assert.equal(m.staff, true); assert.equal(m.from, 'Barangay staff'); assert.equal(m.en, 'The hall is open until 5 pm today.');
    assert.equal(m.fil, m.en, 'staff text is shown as written');
  });

  test('free text written before 2.0 stays readable and is marked as old', async () => {
    const id = (await q('INSERT INTO request_messages (request_id, sender_id, body) VALUES (?,?,?)', [req, await userId('fidel'), 'Hi Ana!'])).insertId;
    const m = (await thread(ana)).messages.find((x) => x.id === id);
    assert.equal(m.legacy, true); assert.equal(m.en, 'Hi Ana!');
  });

  test('My data lists the phrases a person sent, in words', async () => {
    const mine = (await s.api('GET', '/me/data', fidel)).json.messages_sent;
    assert.ok(mine.some((m) => /^Available pa po ba ito sa/.test(m.body)), 'in his language (Filipino)');
  });
});

describe('report a concern', () => {
  test('a concern on a request is about the other person, and only staff see it', async () => {
    const r = await s.api('POST', '/reports', fidel, { target_type: 'request', target_id: req, reason: 'harassment', details: 'Keeps asking for money' });
    assert.equal(r.status, 201);
    const row = await one('SELECT about_user_id FROM reports WHERE id = ?', [r.json.id]);
    assert.equal(row.about_user_id, await userId('ana'));
    assert.equal((await s.api('GET', '/admin/reports', ana)).status, 403);
  });

  test('safety and harassment concerns are urgent and listed first', async () => {
    await s.api('POST', '/reports', dina, { target_type: 'item', target_id: await itemId('Cooler box'), reason: 'Item is not as described' });
    const list = (await s.api('GET', '/admin/reports', staff)).json;
    assert.equal(list[0].reason, 'harassment'); assert.equal(list[0].urgent, true);
    assert.equal(list.find((x) => x.reason === 'Item is not as described').urgent, false);
  });

  test('a second harassment concern about the same person within 30 days pauses their messages', async () => {
    const other = await s.api('POST', '/requests', ben, { item_id: await itemId('Travel luggage (large)'), start_date: day(10), end_date: day(11) });
    assert.equal((await s.api('POST', '/reports', ben, { target_type: 'request', target_id: other.json.id, reason: 'harassment' })).status, 201);
    assert.equal((await one('SELECT messaging_paused FROM users WHERE id = ?', [await userId('ana')])).messaging_paused, 1);
    const blocked = await say(ana, 'A03');
    assert.equal(blocked.status, 403); assert.equal(blocked.json.code, 'messaging_paused');
    assert.equal((await s.api('POST', `/admin/users/${await userId('ana')}/messaging`, staff, { paused: false })).status, 200);
    assert.equal((await say(ana, 'A03')).status, 201);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'messaging_allowed'"));
  });

  test('at most 3 reports a day per person', async () => {
    const item = await itemId('Cooler box');
    for (let i = 0; i < 2; i++) await s.api('POST', '/reports', dina, { target_type: 'item', target_id: item, reason: 'Something else' });
    const fourth = await s.api('POST', '/reports', dina, { target_type: 'item', target_id: item, reason: 'Something else' });
    assert.equal(fourth.status, 429); assert.equal(fourth.json.code, 'too_many_reports');
  });
});

describe('kind words', () => {
  test('finds unkind words, also disguised, without false alarms', () => {
    for (const t of ['gago ka', 'G A G O', 'sh1t', 'fuuuck this', 'putang ina mo', 'TANGINA']) assert.ok(findUnkind([t]), t);
    for (const t of ['computer table', 'leche flan maker', 'hayop na pang-alaga', 'shiitake mushrooms', 'Bobotan street', 'Pasig']) assert.equal(findUnkind([t]), null, t);
  });

  test('listings, Wanted posts, rating comments and concern notes refuse them', async () => {
    const item = await s.api('POST', '/items', dina, { title: 'Gago ladder', category_id: 2, pickup_point_id: 1, tier: 'low' });
    assert.equal(item.status, 400); assert.equal(item.json.code, 'unkind_words');
    const wanted = await s.api('POST', '/wanted', dina, { title: 'Need a drill', details: 'pakyu' });
    assert.equal(wanted.json.code, 'unkind_words');
    const concern = await s.api('POST', '/reports', fidel, { target_type: 'request', target_id: req, reason: 'other', details: 'b o b o' });
    assert.equal(concern.json.code, 'unkind_words');
    const n = await one("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'unkind_words_refused'");
    assert.ok(n.n >= 3);
    assert.ok((await s.api('GET', '/admin/stats', staff)).json.unkind_refusals_7d >= 3);
  });

  test('admins add and remove words; staff cannot', async () => {
    assert.equal((await s.api('POST', '/admin/words', staff, { word: 'pangit' })).status, 403);
    assert.equal((await s.api('POST', '/admin/words', admin, { word: 'Pangit' })).status, 201);
    assert.deepEqual((await s.api('GET', '/admin/words', staff)).json.added, ['pangit']);
    assert.equal((await s.api('POST', '/wanted', dina, { title: 'Pangit na upuan' })).json.code, 'unkind_words');
    assert.equal((await s.api('DELETE', '/admin/words/pangit', admin)).status, 200);
    assert.equal((await s.api('POST', '/wanted', dina, { title: 'Pangit na upuan' })).status, 201);
    assert.ok(await one("SELECT id FROM audit_log WHERE action = 'word_added' AND target = 'pangit'"));
  });
});

describe('old free text is deleted a year after the loan ends', () => {
  test('the job removes residents\' free text only', async () => {
    const [dinaId, staffId] = [await userId('dina'), await userId('staff')];
    const old = (await q(
      `INSERT INTO requests (item_id, borrower_id, start_date, end_date, status, returned_at)
       VALUES (?, ?, CURDATE() - INTERVAL 368 DAY, CURDATE() - INTERVAL 367 DAY, 'closed', NOW() - INTERVAL 366 DAY)`, [await itemId('Cooler box'), dinaId])).insertId;
    await q("INSERT INTO request_messages (request_id, sender_id, body) VALUES (?,?,'old words'),(?,?,'staff note')", [old, dinaId, old, staffId]);
    await q("INSERT INTO request_messages (request_id, sender_id, phrase_id) VALUES (?,?,'T01')", [old, dinaId]);
    await q("INSERT INTO request_messages (request_id, sender_id, body) VALUES (?,?,'still recent')", [req, dinaId]);
    const out = await deleteOldMessages();
    assert.equal(out.deleted, 1);
    const left = await q('SELECT body, phrase_id FROM request_messages WHERE request_id = ? ORDER BY id', [old]);
    assert.deepEqual(left.map((m) => m.body || m.phrase_id), ['staff note', 'T01']);
  });
});
