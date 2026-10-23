// Rule numbers an admin may change from the portal, within safe limits. The defaults stay in rules.js; changed
// values are stored in rule_settings and copied into RULES, so every part of the server uses them at once.
// Privacy numbers (how long ID photos and phone numbers are kept) and the dispute outcomes are fixed in code:
// they appear in the privacy notice and in agreed decisions, which need a review before they change.
import { q, withTx } from './db.js';
import { RULES } from './rules.js';
import { bad } from './errors.js';
import { audit } from './services.js';

export const RULE_DEFAULTS = Object.freeze({ ...RULES });

export const EDITABLE_RULES = {
  starterCredits: { min: 0, max: 10 },
  costLowMedium: { min: 0, max: 5 },
  costHigh: { min: 0, max: 10 },
  shelfCost: { min: 0, max: 5 },
  lenderReward: { min: 0, max: 5 },
  latePenalty: { min: 0, max: 5 },
  pairRewardCapPerMonth: { min: 0, max: 10 },
  maxLoanDays: { min: 1, max: 30 },
  pendingExpiryDays: { min: 1, max: 30 },
  checkinAlertAfterMissedDays: { min: 1, max: 7 },
};

// Called when the server starts (and after every change): defaults first, then the stored changes.
export async function loadRuleSettings() {
  const rows = await q('SELECT name, value FROM rule_settings');
  Object.assign(RULES, RULE_DEFAULTS);
  for (const r of rows) if (EDITABLE_RULES[r.name]) RULES[r.name] = Number(r.value);
  return RULES;
}

export const listRuleSettings = () => Object.entries(EDITABLE_RULES).map(([key, lim]) => ({ key, value: RULES[key], default: RULE_DEFAULTS[key], ...lim }));

// `changes` maps a rule to a whole number within its limits, or to null to go back to the default.
export async function saveRuleSettings(changes, actor) {
  const entries = Object.entries(changes || {});
  if (!entries.length) throw bad('Nothing to change.', 'bad_setting');
  const next = { ...RULES };
  for (const [key, value] of entries) {
    const lim = EDITABLE_RULES[key];
    if (!lim) throw bad(`"${key}" cannot be changed here.`, 'bad_setting');
    if (value === null) { next[key] = RULE_DEFAULTS[key]; continue; }
    if (!Number.isInteger(value) || value < lim.min || value > lim.max) throw bad(`${key} must be a whole number from ${lim.min} to ${lim.max}.`, 'bad_setting');
    next[key] = value;
  }
  if (next.costHigh < next.costLowMedium) throw bad('Valuable items cannot cost less than ordinary items.', 'bad_setting');
  await withTx(async (conn) => {
    for (const [key, value] of entries) {
      if (RULES[key] === next[key] && value !== null) continue;
      if (value === null) await conn.query('DELETE FROM rule_settings WHERE name = ?', [key]);
      else await conn.query('INSERT INTO rule_settings (name, value, updated_by) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)', [key, value, actor.id]);
      if (RULES[key] !== next[key]) await audit(actor.id, 'rule_changed', `${key}: ${RULES[key]} -> ${next[key]}`, conn);
    }
  });
  await loadRuleSettings();
  return listRuleSettings();
}
