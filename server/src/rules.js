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
};

// Words that are not allowed in listings (weapons, medicines, hazardous items).
export const PROHIBITED = [
  'gun', 'firearm', 'pistol', 'rifle', 'ammo', 'bullet', 'explosive', 'firecracker', 'fireworks',
  'medicine', 'gamot', 'antibiotic', 'prescription', 'pesticide', 'poison', 'chemical',
  'gasoline', 'acid', 'drugs', 'alcohol', 'cigarette', 'vape',
];

export function findProhibited(...texts) {
  const hay = texts.filter(Boolean).join(' ').toLowerCase();
  return PROHIBITED.find((w) => new RegExp(`\\b${w}(s|es)?\\b`, 'i').test(hay)) || null;
}

export function creditCost(item) {
  if (item.is_shelf) return RULES.shelfCost;
  return item.tier === 'high' ? RULES.costHigh : RULES.costLowMedium;
}

// High-value items and Barangay Shelf items are handled at the barangay hall by LGU staff.
export const handledByStaff = (item) => !!item.is_shelf || item.tier === 'high';

// Low tier: approved at once. Medium and high: someone must approve.
export const autoApproves = (item) => item.tier === 'low';

// Estimated weight of a new product that was not bought (kg), per category. Labeled as an estimate everywhere.
export const AVG_WEIGHT_KG = { party: 2.5, tools: 3.0, school: 0.4, travel: 3.0 };
