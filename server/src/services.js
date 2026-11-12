// Small helpers shared by every route: notifications and the audit log.
import { q } from './db.js';

// Adds a line to a person's bell list. `params` lets the app write the sentence in the person's language.
export async function notify(conn, userId, type, title, body = null, refId = null, params = null) {
  await (conn || { query: q }).query(
    'INSERT INTO notifications (user_id, type, title, body, params, ref_id) VALUES (?,?,?,?,?,?)',
    [userId, type, title, body, params ? JSON.stringify(params) : null, refId],
  );
}

// Records a change (rule R12). The audit log is append-only: this is the only statement that touches it,
// and test/audit.test.js fails if any other code updates or deletes audit rows.
export async function audit(actorId, action, { entity = null, entityId = null, details = null } = {}, conn = null) {
  await (conn || { query: q }).query(
    'INSERT INTO audit_log (actor_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
    [actorId, action, entity, entityId, details ? JSON.stringify(details) : null],
  );
}
