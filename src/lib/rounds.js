// ----------------------------------------------------------------------------
// BRACKET SHAPE — JSON match numbers per slot, left→right.
// ----------------------------------------------------------------------------
export const ROUNDS = [
  { key: "r32", label: "Round of 32", short: "R32", matches: 16, points: 5, nums: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87] },
  { key: "r16", label: "Round of 16", short: "R16", matches: 8, points: 10, nums: [89, 90, 93, 94, 91, 92, 95, 96] },
  { key: "qf", label: "Quarter-finals", short: "QF", matches: 4, points: 20, nums: [97, 98, 99, 100] },
  { key: "sf", label: "Semi-finals", short: "SF", matches: 2, points: 35, nums: [101, 102] },
  { key: "final", label: "Final", short: "F", matches: 1, points: 60, nums: [104] },
];
export const FINAL_ROUND = ROUNDS.length - 1;
export const THIRD_PLACE = { key: "third", label: "Third place", short: "3RD", points: 40, num: 103 };

// Exact-score prediction points, by knockout round. Falls back to
// SCORE_EXACT_POINTS (scoring.js) for group-stage ("rail-") matches.
export const SCORE_EXACT_POINTS_BY_ROUND = {
  r32: 10,
  r16: 20,
  qf: 30,
  sf: 40,
  final: 50,
  third: 30,
};
export const key = (r, m) => `${r}-${m}`;
/** Every knockout slot the user must fill before locking. */
export const REQUIRED_PICK_KEYS = [
  ...ROUNDS.flatMap((r) => Array.from({ length: r.matches }, (_, m) => key(r.key, m))),
  "third-0",
];
export const TOTAL_REQUIRED_PICKS = REQUIRED_PICK_KEYS.length;
export const GUIDE_MAX_INTERACTIONS = 2;
export const BRACKET_ROWS = 8;

export const ROUND_LABEL = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  "Quarter-final": "Quarter-final",
  "Semi-final": "Semi-final",
  "Match for third place": "Third place",
  Final: "Final",
};

export const KNOCKOUT_ROUNDS = new Set([
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Match for third place",
  "Final",
]);
