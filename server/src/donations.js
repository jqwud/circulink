// Donate / free to take (Hiraman 2.0, batch 29; design spec section 3).
// A donation is an item with listing_type 'donate'. Claims move: waiting (asked, barangay chooses) ->
// reserved -> given, or released / cancelled / no_show / problem. Donations never move credits.
import { q, one, withTx, todayPH } from './db.js';
import { RULES } from './rules.js';
import { bad, forbidden, notFound, HttpError } from './errors.js';
import { addDays, audit, notify } from './services.js';

const first = (n) => String(n || '').split(' ')[0];
const isStaff = (u) => ['lgu_staff', 'lgu_admin'].includes(u.role);
const plusHours = (h) => new Date(Date.now() + h * 3600e3);

export async function loadClaim(conn, id, lock = true) {
  if (!Number.isInteger(id) || id < 1) throw notFound('Claim not found.');
  const [rows] = await conn.query(
    `SELECT c.*, i.title AS item_title, i.owner_id AS donor_id, i.is_shelf, i.claim_mode, i.donation_status, i.category_id,
            i.pickup_point_id, i.photo_url
       FROM donation_claims c JOIN items i ON i.id = c.item_id WHERE c.id = ? ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw notFound('Claim not found.');
  return rows[0];
}

const isDonor = (c, user) => (c.donor_id ? c.donor_id === user.id : isStaff(user)) || isStaff(user);

// The claimer, the donor and staff may see a claim; nobody else.
export function assertCanSee(c, user) {
  if (isStaff(user) || user.id === c.claimer_id || user.id === c.donor_id) return;
  throw forbidden('This is not your claim.', 'cannot_manage');
}

// ---------- claiming ----------
export function claimDonation(itemId, user) {
  return withTx(async (conn) => {
    if (!Number.isInteger(itemId) || itemId < 1) throw notFound('Item not found.');
    if (user.role !== 'resident') throw forbidden('Only residents can claim donations.', 'residents_only');
    if (user.verification_status !== 'approved') throw forbidden('Your account must be verified by the barangay first.', 'not_verified');
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item || item.listing_type !== 'donate' || item.status !== 'available' || item.review_status !== 'ok') throw bad('This item is not available.', 'item_unavailable');
    if (item.owner_id === user.id) throw bad('You cannot claim your own item.', 'own_item');
    const [[me]] = await conn.query('SELECT claim_paused_until FROM users WHERE id = ?', [user.id]);
    if (me.claim_paused_until && me.claim_paused_until >= todayPH()) {
      throw forbidden(`After missed pickups, you can claim donations again from ${addDays(me.claim_paused_until, 1)}.`, 'claim_paused');
    }
    const [[mine]] = await conn.query(
      `SELECT SUM(status IN ('waiting','reserved')) AS open, SUM(created_at >= NOW() - INTERVAL 30 DAY) AS month,
              SUM(item_id = ? AND status IN ('waiting','reserved')) AS same
         FROM donation_claims WHERE claimer_id = ?`, [item.id, user.id]);
    if (Number(mine.same)) throw bad('You already asked for this item.', 'already_asked');
    if (Number(mine.open) >= RULES.claimsOpenMax) throw bad(`You can hold ${RULES.claimsOpenMax} claims at a time. Pick one up or let one go first.`, 'too_many_claims');
    if (Number(mine.month) >= RULES.claimsPerMonth) throw bad(`You can claim ${RULES.claimsPerMonth} donations in 30 days, so others get a chance too.`, 'claim_limit_month');

    if (item.claim_mode === 'barangay') {
      if (item.donation_status !== 'open' || addDays(String(item.created_at).slice(0, 10), RULES.barangayChoiceDays) < todayPH()) {
        throw bad('The barangay is already choosing who receives this item.', 'interest_closed');
      }
      const [ins] = await conn.query("INSERT INTO donation_claims (item_id, claimer_id, status) VALUES (?, ?, 'waiting')", [item.id, user.id]);
      return { id: ins.insertId, status: 'waiting' };
    }
    if (item.donation_status !== 'open') throw new HttpError(409, 'Someone just claimed it. Try posting what you need on the Wanted board.', 'already_claimed');
    const until = plusHours(RULES.claimHoldHours);
    const [ins] = await conn.query("INSERT INTO donation_claims (item_id, claimer_id, status, reserved_until) VALUES (?, ?, 'reserved', ?)", [item.id, user.id, until]);
    await conn.query("UPDATE items SET donation_status = 'reserved' WHERE id = ?", [item.id]);
    if (item.owner_id) {
      await notify(conn, item.owner_id, 'claim_new', `${first(user.name)} claimed ${item.title}`, 'Agree on a pickup time in the claim\'s messages.', ins.insertId,
        { name: first(user.name), item: item.title });
    }
    return { id: ins.insertId, status: 'reserved', reserved_until: until };
  });
}

// ---------- the handover: both sides confirm ----------
async function finishIfBoth(conn, c) {
  const [[now]] = await conn.query('SELECT donor_confirmed_at, claimer_confirmed_at FROM donation_claims WHERE id = ?', [c.id]);
  if (!now.donor_confirmed_at || !now.claimer_confirmed_at) return 'reserved';
  await conn.query("UPDATE donation_claims SET status = 'given', closed_at = NOW() WHERE id = ?", [c.id]);
  await conn.query("UPDATE items SET donation_status = 'given', given_at = NOW() WHERE id = ?", [c.item_id]);
  for (const uid of [c.donor_id, c.claimer_id].filter(Boolean)) {
    await notify(conn, uid, 'donation_given', `Given: ${c.item_title}`, 'Thank you for sharing with your neighbors.', c.id, { item: c.item_title });
  }
  return 'given';
}

export function confirmGiven(claimId, actor) {
  return withTx(async (conn) => {
    const c = await loadClaim(conn, claimId);
    if (!isDonor(c, actor)) throw forbidden('Only the donor (or barangay staff) can confirm this.', 'cannot_manage');
    if (c.status !== 'reserved') throw bad('This claim is not waiting for a handover.', 'bad_state');
    await conn.query('UPDATE donation_claims SET donor_confirmed_at = COALESCE(donor_confirmed_at, NOW()) WHERE id = ?', [c.id]);
    if (isStaff(actor)) await audit(actor.id, 'donation_given_confirmed', `claim #${c.id}`, conn);
    return { id: c.id, status: await finishIfBoth(conn, c) };
  });
}

export function confirmReceived(claimId, actor) {
  return withTx(async (conn) => {
    const c = await loadClaim(conn, claimId);
    const staffForThem = isStaff(actor) && c.staff_delivery;
    if (actor.id !== c.claimer_id && !staffForThem) throw forbidden('Only the person receiving it can confirm this.', 'cannot_manage');
    if (c.status !== 'reserved') throw bad('This claim is not waiting for a handover.', 'bad_state');
    await conn.query('UPDATE donation_claims SET claimer_confirmed_at = COALESCE(claimer_confirmed_at, NOW()) WHERE id = ?', [c.id]);
    if (staffForThem) await audit(actor.id, 'donation_delivered', `claim #${c.id}`, conn);
    return { id: c.id, status: await finishIfBoth(conn, c) };
  });
}

// The claimer lets it go (or staff do): the item is offered again.
export function releaseClaim(claimId, actor) {
  return withTx(async (conn) => {
    const c = await loadClaim(conn, claimId);
    if (actor.id !== c.claimer_id && !isStaff(actor)) throw forbidden('Only the person who claimed it can let it go.', 'cannot_manage');
    if (!['waiting', 'reserved'].includes(c.status)) throw bad('This claim is already closed.', 'bad_state');
    await conn.query("UPDATE donation_claims SET status = 'released', closed_at = NOW() WHERE id = ?", [c.id]);
    if (c.status === 'reserved') {
      await conn.query("UPDATE items SET donation_status = 'open' WHERE id = ? AND donation_status = 'reserved'", [c.item_id]);
      if (c.donor_id) await notify(conn, c.donor_id, 'claim_released', `${c.item_title} is free again`, 'The person who claimed it cannot pick it up. It is offered to others again.', c.id, { item: c.item_title });
    }
    return { id: c.id, status: 'released' };
  });
}

// The donor changes their mind: once in 30 days on their own, more often only through staff.
export function cancelClaim(claimId, actor) {
  return withTx(async (conn) => {
    const c = await loadClaim(conn, claimId);
    if (!isDonor(c, actor)) throw forbidden('Only the donor can cancel.', 'cannot_manage');
    if (!['waiting', 'reserved'].includes(c.status)) throw bad('This claim is already closed.', 'bad_state');
    if (!isStaff(actor)) {
      const [[n]] = await conn.query(
        `SELECT COUNT(*) AS n FROM donation_claims c JOIN items i ON i.id = c.item_id
          WHERE i.owner_id = ? AND c.status = 'cancelled' AND c.closed_at >= NOW() - INTERVAL 30 DAY`, [actor.id]);
      if (n.n >= RULES.donorCancelsWithoutStaff) throw forbidden('You already cancelled a claim this month. Please ask barangay staff.', 'cancel_needs_staff');
    }
    await conn.query("UPDATE donation_claims SET status = 'cancelled', closed_at = NOW() WHERE id = ?", [c.id]);
    await conn.query("UPDATE items SET donation_status = 'open' WHERE id = ? AND donation_status = 'reserved'", [c.item_id]);
    await notify(conn, c.claimer_id, 'claim_cancelled', `The donor cannot give ${c.item_title}`, 'Sorry. Look for other free items, or post on the Wanted board.', c.id, { item: c.item_title });
    if (isStaff(actor)) await audit(actor.id, 'claim_cancelled', `claim #${c.id}`, conn);
    return { id: c.id, status: 'cancelled' };
  });
}

// The donor says the claimer did not come. Two in 60 days pause claiming for 14 days.
export function noShow(claimId, actor) {
  return withTx(async (conn) => {
    const c = await loadClaim(conn, claimId);
    if (!isDonor(c, actor)) throw forbidden('Only the donor can report this.', 'cannot_manage');
    if (c.status !== 'reserved') throw bad('This claim is not waiting for a pickup.', 'bad_state');
    if (!c.pickup_date || c.pickup_date >= todayPH()) throw bad('You can report a missed pickup after the agreed pickup day.', 'pickup_not_passed');
    await conn.query("UPDATE donation_claims SET status = 'no_show', closed_at = NOW() WHERE id = ?", [c.id]);
    await conn.query("UPDATE items SET donation_status = 'open' WHERE id = ? AND donation_status = 'reserved'", [c.item_id]);
    await notify(conn, c.claimer_id, 'claim_no_show', `Missed pickup: ${c.item_title}`, 'The donor says you did not come, so it is offered to others.', c.id, { item: c.item_title });
    const [[n]] = await conn.query("SELECT COUNT(*) AS n FROM donation_claims WHERE claimer_id = ? AND status = 'no_show' AND closed_at >= NOW() - INTERVAL 60 DAY", [c.claimer_id]);
    if (n.n >= RULES.noShowsToPause) {
      const until = addDays(todayPH(), RULES.claimPauseDays);
      await conn.query('UPDATE users SET claim_paused_until = ? WHERE id = ?', [until, c.claimer_id]);
      await notify(conn, c.claimer_id, 'claim_paused', 'Claiming paused', `After ${n.n} missed pickups, you can claim donations again after ${until}.`, c.id, { n: n.n, until });
    }
    return { id: c.id, status: 'no_show' };
  });
}

// The receiver finds the item is not as described (before confirming). Staff look at it; the item is
// held back. Two problem donations in 90 days pause the donor's donating for 30 days.
export function problemClaim(claimId, actor) {
  return withTx(async (conn) => {
    const c = await loadClaim(conn, claimId);
    if (actor.id !== c.claimer_id) throw forbidden('Only the person receiving it can report a problem.', 'cannot_manage');
    if (c.status !== 'reserved' || c.claimer_confirmed_at) throw bad('Report a problem before confirming you got it.', 'bad_state');
    await conn.query("UPDATE donation_claims SET status = 'problem', closed_at = NOW() WHERE id = ?", [c.id]);
    await conn.query("UPDATE items SET donation_status = 'withdrawn' WHERE id = ?", [c.item_id]);
    await conn.query("INSERT INTO reports (reporter_id, target_type, target_id, about_user_id, reason, details) VALUES (?, 'item', ?, ?, 'donation_problem', ?)",
      [actor.id, c.item_id, c.donor_id, `Donation not as described (claim #${c.id}).`]);
    if (c.donor_id) {
      const [[n]] = await conn.query(
        `SELECT COUNT(*) AS n FROM donation_claims c JOIN items i ON i.id = c.item_id
          WHERE i.owner_id = ? AND c.status = 'problem' AND c.closed_at >= NOW() - INTERVAL 90 DAY`, [c.donor_id]);
      if (n.n >= RULES.donationProblemsToPause) {
        const until = addDays(todayPH(), RULES.donatePauseDays);
        await conn.query('UPDATE users SET donate_paused_until = ? WHERE id = ?', [until, c.donor_id]);
        await notify(conn, c.donor_id, 'donate_paused', 'Donating paused', `After ${n.n} donations with problems, you can give items again after ${until}.`, c.id, { n: n.n, until });
      }
    }
    return { id: c.id, status: 'problem' };
  });
}

// ---------- the donor's choices for an unclaimed donation ----------
export function donationAction(itemId, user, action) {
  return withTx(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item || item.listing_type !== 'donate') throw notFound('Donation not found.');
    if (item.owner_id !== user.id) throw forbidden('Only the donor can do this.', 'cannot_manage');
    if (item.donation_status !== 'open') throw bad('This donation is claimed or closed.', 'bad_state');
    if (action === 'extend') {
      const from = item.open_until && item.open_until > todayPH() ? item.open_until : todayPH();
      const until = addDays(from, RULES.donationOpenDays);
      await conn.query('UPDATE items SET open_until = ? WHERE id = ?', [until, item.id]);
      return { id: item.id, donation_status: 'open', open_until: until };
    }
    if (action === 'to_shelf') {
      await conn.query("UPDATE items SET donation_status = 'to_shelf' WHERE id = ?", [item.id]);
      return { id: item.id, donation_status: 'to_shelf' };
    }
    if (action === 'withdraw') {
      await conn.query("UPDATE items SET donation_status = 'withdrawn', status = 'removed', removed_by = 'owner' WHERE id = ?", [item.id]);
      await conn.query("UPDATE donation_claims SET status = 'released', closed_at = NOW() WHERE item_id = ? AND status = 'waiting'", [item.id]);
      return { id: item.id, donation_status: 'withdrawn' };
    }
    throw bad('Choose extend, to_shelf or withdraw.', 'bad_action');
  });
}

// ---------- staff ----------
// Staff give a barangay-chosen donation to one resident (who may not have asked), optionally delivering it.
export function staffChoose(itemId, userId, staffDelivery, actor) {
  return withTx(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item || item.listing_type !== 'donate') throw notFound('Donation not found.');
    if (item.donation_status !== 'open') throw bad('This donation is already given or reserved.', 'bad_state');
    const [[who]] = await conn.query("SELECT id, name FROM users WHERE id = ? AND role = 'resident' AND verification_status = 'approved'", [userId]);
    if (!who) throw bad('Choose a verified resident.', 'bad_user');
    if (who.id === item.owner_id) throw bad('The donor cannot receive their own item.', 'own_item');
    const [[asked]] = await conn.query("SELECT id FROM donation_claims WHERE item_id = ? AND claimer_id = ? AND status = 'waiting'", [item.id, who.id]);
    let claimId = asked?.id;
    if (claimId) {
      await conn.query("UPDATE donation_claims SET status = 'reserved', reserved_until = ?, staff_delivery = ?, chosen_by = ? WHERE id = ?",
        [plusHours(RULES.claimHoldHours), staffDelivery ? 1 : 0, actor.id, claimId]);
    } else {
      const [ins] = await conn.query("INSERT INTO donation_claims (item_id, claimer_id, status, reserved_until, staff_delivery, chosen_by) VALUES (?, ?, 'reserved', ?, ?, ?)",
        [item.id, who.id, plusHours(RULES.claimHoldHours), staffDelivery ? 1 : 0, actor.id]);
      claimId = ins.insertId;
    }
    await conn.query("UPDATE items SET donation_status = 'reserved' WHERE id = ?", [item.id]);
    const [others] = await conn.query("SELECT id, claimer_id FROM donation_claims WHERE item_id = ? AND status = 'waiting' AND id <> ?", [item.id, claimId]);
    for (const o of others) {
      await conn.query("UPDATE donation_claims SET status = 'released', closed_at = NOW() WHERE id = ?", [o.id]);
      await notify(conn, o.claimer_id, 'donation_not_chosen', `${item.title} went to another household`, 'Thank you for asking. Watch Free to take for more.', o.id, { item: item.title });
    }
    await notify(conn, who.id, 'donation_chosen', `The barangay chose you for ${item.title}`, staffDelivery ? 'Barangay staff will bring it to you.' : 'Agree on a pickup time in the claim\'s messages.', claimId,
      { item: item.title, delivery: !!staffDelivery });
    if (item.owner_id) {
      await notify(conn, item.owner_id, 'donation_chosen_donor', `The barangay chose a household for ${item.title}`, staffDelivery ? 'Please bring it to the barangay hall.' : 'They will agree on a pickup time with you.', claimId,
        { item: item.title, delivery: !!staffDelivery });
    }
    await audit(actor.id, 'donation_chosen', `item #${item.id} to user #${who.id}${staffDelivery ? ' (delivery)' : ''}`, conn);
    return { id: claimId, status: 'reserved' };
  });
}

// An unclaimed donation the donor brought to the hall becomes a Barangay Shelf item.
export function acceptShelf(itemId, actor) {
  return withTx(async (conn) => {
    const [[item]] = await conn.query('SELECT * FROM items WHERE id = ? FOR UPDATE', [itemId]);
    if (!item || item.listing_type !== 'donate') throw notFound('Donation not found.');
    if (!['to_shelf', 'open'].includes(item.donation_status)) throw bad('This donation is claimed or closed.', 'bad_state');
    await conn.query(
      `UPDATE items SET is_shelf = 1, owner_id = NULL, listing_type = 'lend', claim_mode = NULL, donation_status = NULL, open_until = NULL,
              tier = IF(tier = 'high', 'high', tier), status = 'available' WHERE id = ?`, [item.id]);
    if (item.owner_id) {
      await notify(conn, item.owner_id, 'donation_to_shelf', `${item.title} is now on the Barangay Shelf`, 'Thank you! Neighbors can borrow it from the barangay hall.', item.id, { item: item.title });
    }
    await audit(actor.id, 'donation_to_shelf', `item #${item.id} from user #${item.owner_id}`, conn);
    return { id: item.id, is_shelf: true };
  });
}

// What a claim looks like to the person asking. The donor of a barangay-chosen donation never learns
// who received it.
export async function claimView(c, viewer) {
  const [claimer, donor, point] = await Promise.all([
    one('SELECT name, purok FROM users WHERE id = ?', [c.claimer_id]),
    c.donor_id ? one('SELECT name, purok, phone FROM users WHERE id = ?', [c.donor_id]) : null,
    c.pickup_point_id ? one('SELECT name, note, hours FROM pickup_points WHERE id = ?', [c.pickup_point_id]) : null,
  ]);
  const hideClaimer = c.claim_mode === 'barangay' && viewer.id === c.donor_id;
  const role = viewer.id === c.claimer_id ? 'claimer' : viewer.id === c.donor_id ? 'donor' : 'staff';
  return {
    id: c.id,
    status: c.status,
    my_role: role,
    item: { id: c.item_id, title: c.item_title, photo_url: c.photo_url, is_shelf: !!c.is_shelf, origin: c.is_shelf ? 'barangay' : 'kapitbahay', claim_mode: c.claim_mode },
    claimer: hideClaimer ? { name: 'A household chosen by the barangay', purok: null } : { name: first(claimer?.name), purok: claimer?.purok },
    donor: c.donor_id ? { name: first(donor?.name), purok: donor?.purok } : { name: 'Barangay', purok: null },
    pickup_point: point,
    pickup_date: c.pickup_date,
    reserved_until: c.reserved_until,
    staff_delivery: !!c.staff_delivery,
    donor_confirmed: !!c.donor_confirmed_at,
    claimer_confirmed: !!c.claimer_confirmed_at,
    created_at: c.created_at,
    closed_at: c.closed_at,
  };
}

// The thread of a claim: open while reserved, and for contactDaysAfterClose days after it was given.
export function claimThread(c) {
  const recent = c.status === 'given' && c.closed_at && addDays(String(c.closed_at).slice(0, 10), RULES.contactDaysAfterClose) >= todayPH();
  return {
    column: 'donation_claim_id', id: c.id, status: c.status, open: c.status === 'reserved' || !!recent, notifyType: 'claim_message',
    borrowerId: c.claimer_id, ownerId: c.donor_id, itemTitle: c.item_title,
    statusMap: undefined, // set by the route (SITUATIONS_BY_CLAIM_STATUS)
    // The donor's pickup time (G02) becomes the claim's pickup day; the hold runs until 2 days after it.
    onPhrase: async (phrase, slot) => {
      if (phrase.id !== 'G02' || !slot) return;
      const d = slot.split(' ')[0];
      await q('UPDATE donation_claims SET pickup_date = ?, reserved_until = GREATEST(reserved_until, ?) WHERE id = ?', [d, `${addDays(d, 2)} 23:59:59`, c.id]);
    },
  };
}
