// The Hiraman rules in one place, so the plan, the API and the portal agree.
export const RULES = {
  starterCredits: 3,          // given when a barangay admin approves a resident
  lenderReward: 1,            // only after a confirmed on-time, undamaged return
  latePenalty: 1,             // taken from the borrower for a late return (never below 0)
  maxLoanDays: 14,
  pairRewardCapPerMonth: 2,   // max rewarded loans for the same lender and borrower per 30 days
  costLowMedium: 1,
  costHigh: 2,
  shelfCost: 0,               // Barangay Shelf items are free, so a resident at 0 credits can still borrow
  pendingExpiryDays: 7,       // a request nobody answers expires this many days after it was made
  idPhotoRetentionDays: 7,    // ID photos are deleted this many days after staff approve or reject
  unusedUploadGraceHours: 24, // a photo nobody attached to anything is deleted after this long
  checkinAlertAfterMissedDays: 2, // missed daily check-ins in a row before the owner and staff are alerted
  contactDaysAfterClose: 7,   // phone numbers and the message thread stay open this long after a loan closes
  messageMaxLength: 500,       // staff free text (residents send quick replies)
  messagesPerRequestPerDay: 10, // quick replies one person can send on one request in a day
  reportsPerDay: 3,             // reports and concerns one person can file in a day
  harassmentConcernsToPause: 2, // harassment concerns about one person in 30 days that pause their messages
  oldTextKeptDays: 365,         // residents' free text from before quick replies, kept this long after the loan ends
  shelfLateToPause: 2,          // late returns of Barangay items in 90 days that pause Barangay borrowing ...
  shelfPauseDays: 30,           // ... for this many days (staff can lift it)
  extendMaxDays: 7,             // a loan can be extended once, by up to this many days
  // Donations ("free to take")
  claimHoldHours: 48,           // a claim holds the item this long (or until 2 days after the agreed pickup day)
  claimsOpenMax: 2,             // claims one person can hold at once
  claimsPerMonth: 4,            // claims one person can make in 30 days
  noShowsToPause: 2,            // missed pickups in 60 days that pause claiming ...
  claimPauseDays: 14,           // ... for this many days
  donationOpenDays: 14,         // after this many days unclaimed, the donor is asked what to do ...
  donationAnswerDays: 7,        // ... and with no answer this many days later, it is taken down
  barangayChoiceDays: 3,        // residents can say "I'd like this" for this many days; then staff choose
  regiftWaitDays: 30,           // after receiving a donation, no donating in the same category for this long
  donationProblemsToPause: 2,   // problem donations in 90 days that pause donating ...
  donatePauseDays: 30,          // ... for this many days
  donorCancelsWithoutStaff: 1,  // a donor can cancel this many claims in 30 days; more need staff
  // Food rewards (rice and vegetables from local producers, paid by the LGU): vouchers per quarter by Tiwala tier
  vouchersBronze: 1,
  vouchersSilver: 2,
  vouchersGold: 3,
  voucherDays: 30,              // a voucher must be collected within this many days
};

// How staff settle a dispute (an item returned damaged or lost), and what each outcome does to credits.
// Nobody goes below 0. "fine" means it was fine after all, so the normal return rules apply
// (the lender reward if it came back on time, the late penalty if it did not).
export const DISPUTE_OUTCOMES = {
  fine: { owner: 0, borrower: 0, normalRules: true },
  accident: { owner: 1, borrower: 0 },
  borrower_fault: { owner: 1, borrower: -2 },
  lost: { owner: 2, borrower: -2, removeItem: true },
};

// Words that are not allowed in listings (weapons, medicines, hazardous items).
export const PROHIBITED = [
  'gun', 'firearm', 'pistol', 'rifle', 'ammo', 'bullet', 'explosive', 'firecracker', 'fireworks',
  'medicine', 'gamot', 'antibiotic', 'prescription', 'pesticide', 'poison', 'chemical',
  'gasoline', 'acid', 'drugs', 'alcohol', 'cigarette', 'vape',
];

// Concern topics residents pick when no quick reply fits, and the report reasons staff should see first.
export const CONCERN_TOPICS = ['safety', 'item_problem', 'money_asked', 'harassment', 'other'];
export const URGENT_REASONS = ['safety', 'harassment', 'Unsafe or prohibited item', 'Rude or unsafe behavior'];

// Unkind words (English and Filipino) refused in the few places residents still type: listings, Wanted posts,
// rating comments and concern notes. Staff add more in the portal (word_filter table).
export const UNKIND_WORDS = [
  'fuck', 'fck', 'motherfucker', 'shit', 'bitch', 'asshole', 'bastard', 'dickhead',
  'putangina', 'putang ina', 'tangina', 'tang ina', 'puta', 'gago', 'gaga', 'tarantado', 'tarantada', 'ulol',
  'bobo', 'punyeta', 'pakyu', 'kupal', 'pokpok', 'hayop ka', 'inutil', 'engot',
];

// The first unkind word in the texts, also when disguised ("g a g o", "sh1t", "fuuuck"), or null.
export function findUnkind(texts, extra = []) {
  const raw = texts.filter(Boolean).join(' ');
  if (!raw) return null;
  const hay = `${raw.toLowerCase()} ${normalizeDisguise(raw)}`;
  const words = [...UNKIND_WORDS, ...extra.map((w) => String(w).toLowerCase().trim()).filter(Boolean)];
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return words.find((w) => new RegExp(`\\b${w.split(/\s+/).map(escape).join('[\\s.\\-_*]*')}(s|es|ing|er)?\\b`, 'i').test(hay)) || null;
}

export function findProhibited(...texts) {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return PROHIBITED.find((w) => new RegExp(`\\b${w}(s|es)?\\b`, 'i').test(hay)) || null;
}

// ---------- automatic flags ----------
// Listings that look unusual or possibly harmful are held back (hidden from neighbors) until staff check them.
// Plainly banned words are refused outright by findProhibited; these checks catch what slips past it.
export const SCREENING = {
  // Valuable or hazardous things that belong in the high tier (handled at the barangay hall).
  valueWords: ['laptop', 'computer', 'projector', 'camera', 'drone', 'tablet', 'ipad', 'iphone', 'cellphone', 'smartphone',
    'television', 'tv', 'generator', 'motorcycle', 'scooter', 'aircon', 'refrigerator', 'chainsaw', 'welding', 'amplifier',
    'karaoke', 'sound system', 'jewelry', 'gold'],
  newAccountHours: 24,     // an account younger than this ...
  newAccountListings: 3,   // ... sharing this many items is held back from this item on
  reportsToFlag: 2,        // different neighbors reporting the same item
};

const LEET = { '@': 'a', 4: 'a', 0: 'o', 1: 'i', '!': 'i', 3: 'e', 5: 's', $: 's', 7: 't' };

// Undoes common ways of hiding a word: letters spaced or dotted apart ("g u n", "g.u.n"),
// numbers and symbols for letters ("g@mot", "p1stol") and stretched letters ("guuun").
export function normalizeDisguise(text) {
  return String(text || '').toLowerCase()
    .replace(/\b(?:[a-z0-9@$!](?:[\s.\-_*]+|$)){3,}/g, (m) => ` ${m.replace(/[\s.\-_*]+/g, '')} `)
    .replace(/[@4013!5$7]/g, (c) => LEET[c])
    .replace(/(.)\1{2,}/g, '$1');
}

// What the listing itself looks like. (Account age and reports are checked where they happen.)
export function screenListing({ title, description, tier }) {
  const flags = [];
  const raw = `${title || ''} ${description || ''}`;
  if (!findProhibited(title, description) && findProhibited(normalizeDisguise(raw))) flags.push('disguised_word');
  if (tier !== 'high' && SCREENING.valueWords.some((w) => new RegExp(`\\b${w}s?\\b`, 'i').test(raw))) flags.push('value_tier');
  return flags;
}

// The longest loan for an item: staff may set a shorter limit on a Barangay item; never longer than maxLoanDays.
export function itemMaxDays(item) {
  return item.is_shelf && item.max_loan_days ? Math.min(item.max_loan_days, RULES.maxLoanDays) : RULES.maxLoanDays;
}

// Things that cannot be given away even when they are allowed to be lent: food and baby products expire or
// carry safety risks (medicines are already banned everywhere).
export const NOT_DONATABLE = ['baby formula', 'infant formula', 'formula milk', 'gatas ng sanggol', 'helmet', 'car seat',
  'canned goods', 'de lata', 'leftover food', 'tirang pagkain', 'ulam', 'vitamin'];

export function findNotDonatable(...texts) {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return NOT_DONATABLE.find((w) => new RegExp(`\\b${w}(s|es)?\\b`, 'i').test(hay)) || null;
}

export function creditCost(item) {
  if (item.listing_type === 'donate') return 0;
  if (item.is_shelf) return RULES.shelfCost;
  return item.tier === 'high' ? RULES.costHigh : RULES.costLowMedium;
}

// High-value items and Barangay Shelf items are handled at the barangay hall by LGU staff.
export const handledByStaff = (item) => !!item.is_shelf || item.tier === 'high';

// Medium and high items need a condition photo at handover and at a good return.
export const photoRequired = (item) => item.tier !== 'low';

// Low tier: approved at once. Medium and high: someone must approve.
export const autoApproves = (item) => item.tier === 'low';

// Estimated weight of a new product that was not bought (kg), per category. Labeled as an estimate everywhere.
export const AVG_WEIGHT_KG = { party: 2.5, tools: 3.0, school: 0.4, travel: 3.0 };
