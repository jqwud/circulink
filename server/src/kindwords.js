// The kind-words check for the text residents still type (listings, Wanted posts, rating comments, concern
// notes). A refusal is recorded in the audit log, so staff can see who keeps trying (dashboard count).
import { q } from './db.js';
import { findUnkind } from './rules.js';
import { bad } from './errors.js';
import { audit } from './services.js';

export const staffWords = async () => (await q('SELECT word FROM word_filter ORDER BY word')).map((r) => r.word);

// Throws 400 unkind_words when any of the texts holds an unkind word.
export async function requireKind(user, where, ...texts) {
  const hit = findUnkind(texts, await staffWords());
  if (!hit) return;
  await audit(user.id, 'unkind_words_refused', where);
  throw bad('Please use kind words.', 'unkind_words');
}
