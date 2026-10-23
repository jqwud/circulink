// The quick replies residents send each other instead of free text (Hiraman 2.0 spec, sections 6 and 9).
// A message stores only the phrase id and one slot value, so each reader sees it in their own language and
// nobody can type anything unkind. Ids never change meaning; retire a phrase with `retired: true`.
//
// who: 'B' = the borrower, 'O' = the owner, 'Both' = either. Barangay items have no resident owner, so
// staff answer those with free text.
// slot: what the {slot} in the text is filled with, always chosen with a picker, never typed.

export const SITUATIONS = ['before', 'pickup', 'during', 'return', 'problem', 'thanks'];

// Which situations a request's status opens. The thread itself is open as long as threadOpen() says.
export const SITUATIONS_BY_STATUS = {
  pending: ['before'],
  approved: ['pickup'],
  handed_over: ['during', 'return', 'problem'],
  disputed: ['problem'],
  closed: ['thanks', 'return', 'problem'],
};

export const PHRASES = [
  // before borrowing (request pending)
  { id: 'P01', s: 'before', who: 'B', slot: 'date', en: 'Is this item still available on {slot}?', fil: 'Available pa po ba ito sa {slot}?' },
  { id: 'P02', s: 'before', who: 'B', slot: 'number', en: 'I need it for {slot} day(s) only.', fil: '{slot} araw ko lang po ito kailangan.' },
  { id: 'P03', s: 'before', who: 'B', en: 'Can I borrow it a day earlier?', fil: 'Puwede ko po bang hiramin isang araw na mas maaga?' },
  { id: 'P04', s: 'before', who: 'O', en: 'Yes, it is available. I will approve soon.', fil: 'Opo, available ito. Aaprubahan ko po agad.' },
  { id: 'P05', s: 'before', who: 'O', en: 'Sorry, I need it on those dates. Please pick other dates.', fil: 'Pasensya na po, kailangan ko ito sa mga petsang iyon. Pumili po kayo ng ibang petsa.' },
  { id: 'P06', s: 'before', who: 'O', slot: 'condition', en: 'It is in {slot} condition, as in the photo.', fil: 'Nasa {slot} na kondisyon po ito, tulad ng nasa larawan.' },
  // before pickup (approved)
  { id: 'A01', s: 'pickup', who: 'Both', slot: 'datetime', en: 'Can we meet on {slot}?', fil: 'Puwede po ba tayong magkita sa {slot}?', replies: ['A02', 'A03'] },
  { id: 'A02', s: 'pickup', who: 'Both', en: 'Yes, see you then.', fil: 'Sige po, kita tayo.' },
  { id: 'A03', s: 'pickup', who: 'Both', en: 'That time does not work. Can we pick another time?', fil: 'Hindi po ako puwede sa oras na iyon. Iba na lang pong oras?' },
  { id: 'A04', s: 'pickup', who: 'Both', slot: 'point', en: 'Can we meet at {slot} instead?', fil: 'Puwede po bang sa {slot} na lang tayo magkita?', replies: ['A02', 'A03'] },
  { id: 'A05', s: 'pickup', who: 'Both', en: "I'm on my way.", fil: 'Papunta na po ako.' },
  { id: 'A06', s: 'pickup', who: 'Both', en: "I'm here at the pickup point.", fil: 'Nandito na po ako sa tagpuan.' },
  { id: 'A07', s: 'pickup', who: 'Both', slot: 'minutes', en: "I'm running {slot} minutes late. Sorry!", fil: 'Mahuhuli po ako nang {slot} minuto. Pasensya na po!' },
  { id: 'A08', s: 'pickup', who: 'B', en: 'Do I need to bring anything?', fil: 'May kailangan po ba akong dalhin?', replies: ['A09'] },
  { id: 'A09', s: 'pickup', who: 'O', en: 'Please bring a bag or box for it.', fil: 'Magdala po kayo ng bag o kahon para dito.' },
  // during the loan
  { id: 'L01', s: 'during', who: 'B', en: 'Everything is fine with the item.', fil: 'Maayos po ang gamit.' },
  { id: 'L02', s: 'during', who: 'B', slot: 'number', en: 'Can I keep it {slot} more day(s)?', fil: 'Puwede ko po bang hiramin nang {slot} araw pa?', replies: ['L03', 'L04'] },
  { id: 'L03', s: 'during', who: 'O', en: "Yes, you can keep it longer. I'll extend it in the app.", fil: 'Opo, puwede pa. Pahahabain ko po sa app.' },
  { id: 'L04', s: 'during', who: 'O', en: 'Sorry, I need it back on time.', fil: 'Pasensya na po, kailangan ko po itong maibalik sa takdang araw.' },
  { id: 'L05', s: 'during', who: 'B', en: 'How do I use this properly?', fil: 'Paano po ito gamitin nang tama?', replies: ['L06'] },
  { id: 'L06', s: 'during', who: 'O', en: 'Please check the instructions in the item description.', fil: 'Pakitingnan po ang paliwanag sa detalye ng gamit.' },
  { id: 'L07', s: 'during', who: 'O', en: 'Just checking: is the item all right?', fil: 'Kumusta po ang gamit? Maayos pa po ba?', replies: ['L01'] },
  // return
  { id: 'R01', s: 'return', who: 'B', slot: 'datetime', en: "I'm ready to return it. Can we meet on {slot}?", fil: 'Handa ko na pong ibalik. Puwede po ba sa {slot}?', replies: ['A02', 'A03'] },
  { id: 'R02', s: 'return', who: 'B', en: 'I cleaned it before returning.', fil: 'Nilinis ko po ito bago ibalik.' },
  { id: 'R03', s: 'return', who: 'O', en: 'Got it back, thank you!', fil: 'Natanggap ko na po, salamat!' },
  { id: 'R04', s: 'return', who: 'O', slot: 'point', en: 'Please return it to {slot}.', fil: 'Pakisauli po sa {slot}.' },
  { id: 'R05', s: 'return', who: 'B', slot: 'date', en: "I can't return it on time. I will return it on {slot}.", fil: 'Hindi ko po ito maibabalik sa takdang araw. Isasauli ko po sa {slot}.' },
  // problem or damage
  { id: 'D01', s: 'problem', who: 'B', en: "Something broke while I was using it. I'm sorry.", fil: 'May nasira po habang ginagamit ko. Paumanhin po.' },
  { id: 'D02', s: 'problem', who: 'B', en: 'A part is missing.', fil: 'May kulang po na piyesa.' },
  { id: 'D03', s: 'problem', who: 'O', en: "It came back with damage. I'll ask the barangay to help.", fil: 'May sira po nang ibalik. Hihingi po ako ng tulong sa barangay.' },
  { id: 'D04', s: 'problem', who: 'Both', en: "Let's ask barangay staff to help us settle this.", fil: 'Humingi po tayo ng tulong sa staff ng barangay para maayos ito.' },
  { id: 'D05', s: 'problem', who: 'B', en: 'It was already like this when I got it.', fil: 'Ganito na po ito nang matanggap ko.' },
  { id: 'D06', s: 'problem', who: 'Both', en: "I've sent photos to the barangay.", fil: 'Nagpadala na po ako ng larawan sa barangay.' },
  // thanks and goodbye (after closing, while the thread is open)
  { id: 'T01', s: 'thanks', who: 'Both', en: 'Thank you, neighbor!', fil: 'Salamat, kapitbahay!' },
  { id: 'T02', s: 'thanks', who: 'O', en: 'You can borrow again anytime.', fil: 'Puwede po kayong humiram ulit kahit kailan.' },
];

const BY_ID = new Map(PHRASES.map((p) => [p.id, p]));
export const phraseById = (id) => BY_ID.get(String(id || '')) || null;

const CONDITIONS = { new: ['new', 'bago'], good: ['good', 'maayos'], fair: ['fair', 'katamtaman'], worn: ['well-used', 'luma'] };
const DAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], fil: ['Linggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'] };
const MONTHS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], fil: ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'] };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):(00|30)$/;

function dateWords(ymd, lang) {
  const [, y, m, d] = DATE_RE.exec(ymd);
  const weekday = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
  return `${DAYS[lang][weekday]} ${Number(d)} ${MONTHS[lang][Number(m) - 1]}`;
}
function timeWords(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Checks a slot value a resident picked. Returns the value to store, or throws a message for the person.
 * `ctx` = { today: 'YYYY-MM-DD', pointIds: Set<number> }.
 */
export function checkSlot(phrase, value, ctx) {
  if (!phrase.slot) return null;
  const v = String(value ?? '').trim();
  const fail = () => { throw Object.assign(new Error('Choose a value for this message.'), { code: 'bad_slot' }); };
  const dateOk = (ymd) => {
    if (!DATE_RE.test(ymd) || Number.isNaN(Date.parse(`${ymd}T00:00:00Z`))) return false;
    const days = (Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${ctx.today}T00:00:00Z`)) / 864e5;
    return days >= -1 && days <= 90;
  };
  switch (phrase.slot) {
    case 'date': if (!dateOk(v)) fail(); return v;
    case 'datetime': { const [d, t] = v.split(' '); if (!dateOk(d || '') || !TIME_RE.test(t || '') || Number(t.slice(0, 2)) < 6 || Number(t.slice(0, 2)) > 21) fail(); return v; }
    case 'point': if (!ctx.pointIds.has(Number(v))) fail(); return String(Number(v));
    case 'condition': if (!CONDITIONS[v]) fail(); return v;
    case 'number': if (!/^[1-5]$/.test(v)) fail(); return v;
    case 'minutes': if (!/^[1-5]$/.test(v)) fail(); return v;
    default: return fail();
  }
}

/** The phrase as a reader sees it, in 'en' or 'fil'. `points` maps pickup point id to name. */
export function renderPhrase(phrase, value, lang, points = new Map()) {
  const text = phrase[lang] || phrase.en;
  if (!phrase.slot) return text;
  let words = String(value ?? '');
  if (phrase.slot === 'date') words = dateWords(words, lang);
  else if (phrase.slot === 'datetime') { const [d, t] = words.split(' '); words = `${dateWords(d, lang)}, ${timeWords(t)}`; }
  else if (phrase.slot === 'point') words = points.get(Number(words)) || (lang === 'fil' ? 'ang tagpuan' : 'the pickup point');
  else if (phrase.slot === 'condition') words = CONDITIONS[words]?.[lang === 'fil' ? 1 : 0] || words;
  else if (phrase.slot === 'minutes') words = String(Number(words) * 10);
  return text.replace('{slot}', words);
}

/** The phrases a person may send on a request now: its status picks the situations, their side picks the rest. */
export function phrasesFor(status, side) {
  const situations = SITUATIONS_BY_STATUS[status] || [];
  return PHRASES.filter((p) => !p.retired && situations.includes(p.s) && (p.who === 'Both' || p.who === side));
}
