// CircuLink rule numbers in one place, so the spec (docs/CIRCULAR_HUB_SPEC.md), the API, the app and the
// portal agree. The rule functions (R1 to R13) are added in build step 2, each with its own test.
export const RULES = {
  // Declarations and drop-off codes (R9)
  codeLength: 6,
  codeValidDays: 7,
  maxOpenDeclarations: 3,

  // Weights (kg) and flags for review (R7)
  maxItemWeightKg: 500,
  flagDropOffOverKg: 50,
  flagResidentOverKgPer30Days: 100,
  flagHubDayOverAverageTimes: 3,

  // Food (R11): days the expiry date must still be ahead when the food is received or released
  foodMinDaysToExpiry: 3,

  // Housekeeping
  unusedUploadGraceHours: 24,  // a photo nobody attached to anything is deleted after this long
  notificationsKeptDays: 180,  // read notifications are deleted after this long
};

// What can happen to an item at the hub, and how much of the category rate it earns (R5).
export const OUTCOMES = ['reuse', 'repair', 'recycle', 'reject'];
export const OUTCOME_MULTIPLIER = { reuse: 1.0, repair: 0.8, recycle: 0.5, reject: 0 };

// Badge tiers by confirmed points. Points cannot be transferred and have no cash value.
export const BADGES = [
  { key: 'seed', min: 0 },
  { key: 'sprout', min: 100 },
  { key: 'tree', min: 500 },
  { key: 'forest', min: 2000 },
];

export const ROLES = ['resident', 'staff', 'partner', 'admin'];
export const HUB_TYPES = ['school', 'barangay', 'other'];
