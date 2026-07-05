import { ROUNDS, THIRD_PLACE, REQUIRED_PICK_KEYS, TOTAL_REQUIRED_PICKS, key } from "./rounds";
import { getScorePrediction } from "./scoring";
import { fmtKickoff } from "./format";

function getPickProgress(winners) {
  const filled = REQUIRED_PICK_KEYS.filter((k) => winners[k]).length;
  return { filled, total: TOTAL_REQUIRED_PICKS, complete: filled === TOTAL_REQUIRED_PICKS };
}

function hasBracketPicks(winners) {
  return REQUIRED_PICK_KEYS.some((k) => winners[k]);
}

function parseBracketSlotKey(slotKey) {
  if (slotKey === "third-0") return { roundIdx: "third", matchIdx: 0 };
  for (let ri = 0; ri < ROUNDS.length; ri++) {
    const r = ROUNDS[ri];
    for (let m = 0; m < r.matches; m++) {
      if (key(r.key, m) === slotKey) return { roundIdx: ri, matchIdx: m };
    }
  }
  return null;
}

function getMatchTeams(roundIdx, matchIdx, winners, teams) {
  if (!teams?.length) return [null, null];
  if (roundIdx === 0) return [teams[matchIdx * 2], teams[matchIdx * 2 + 1]];
  const prev = ROUNDS[roundIdx - 1].key;
  const byId = (id) => teams.find((t) => t.id === id) || null;
  return [byId(winners[key(prev, matchIdx * 2)]), byId(winners[key(prev, matchIdx * 2 + 1)])];
}

/** Predicted third-place fixture = the two semi-final teams the user eliminated. */
function getThirdPlaceTeams(winners, teams) {
  return [0, 1].map((i) => {
    const picked = winners[key("sf", i)];
    if (!picked) return null;
    const [a, b] = getMatchTeams(3, i, winners, teams);
    if (!a || !b) return null;
    return picked === a.id ? b : a;
  });
}

function getTeamsForBracketSlot(slotKey, winners, teams) {
  const parsed = parseBracketSlotKey(slotKey);
  if (!parsed) return [null, null];
  if (parsed.roundIdx === "third") return getThirdPlaceTeams(winners, teams);
  return getMatchTeams(parsed.roundIdx, parsed.matchIdx, winners, teams);
}

function slotNeedsPick(slotKey, winners, teams, actual) {
  if (winners[slotKey] || actual[slotKey]) return false;
  const [a, b] = getTeamsForBracketSlot(slotKey, winners, teams);
  return !!(a && b);
}

function getScoreSlotKeyForMatch(match, numToSlot) {
  if (match.isKnockout) {
    return numToSlot.get(match.num) ?? null;
  }
  return `rail-${match.num}`;
}

const SCORE_GUIDE_HOURS_AHEAD = 24;

function findRailScoreGuideMatch(matches, winners, numToSlot) {
  const now = Date.now();
  const cutoff = now + SCORE_GUIDE_HOURS_AHEAD * 60 * 60 * 1000;
  for (const m of matches) {
    if (m.status !== "upcoming" || !m.kickoff) continue;
    // Only suggest predicting games starting within the next 24 hours
    if (m.kickoff.getTime() > cutoff) continue;
    const slotKey = getScoreSlotKeyForMatch(m, numToSlot);
    if (!slotKey || getScorePrediction(winners, slotKey)) continue;
    return m;
  }
  return null;
}

/** Next bracket slot the user should pick — prefers the soonest real fixture. */
function findGuidancePickKey(winners, teams, actual, slotMatches, nextMatch, numToSlot) {
  if (nextMatch?.num) {
    const slotKey = numToSlot.get(nextMatch.num);
    if (slotKey && slotNeedsPick(slotKey, winners, teams, actual)) {
      return slotKey;
    }
  }

  for (const slotKey of REQUIRED_PICK_KEYS) {
    if (slotNeedsPick(slotKey, winners, teams, actual)) return slotKey;
  }

  return null;
}

function getSlotRoundShort(slotKey) {
  if (slotKey === "third-0") return THIRD_PLACE.short;
  const parsed = parseBracketSlotKey(slotKey);
  if (!parsed || parsed.roundIdx === "third") return THIRD_PLACE.short;
  return ROUNDS[parsed.roundIdx].short;
}

/** Earliest unpicked slot by kickoff — prefers matchups the user can fill right now. */
function findEarliestMissingPickKey(winners, teams, actual, slotMatches) {
  const missing = REQUIRED_PICK_KEYS.filter((k) => !winners[k] && !actual[k]);
  const pickable = missing.filter((k) => slotNeedsPick(k, winners, teams, actual));

  const byKickoff = (keys) =>
    [...keys].sort((a, b) => {
      const ta = slotMatches[a]?.kickoff?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const tb = slotMatches[b]?.kickoff?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (ta !== tb) return ta - tb;
      return REQUIRED_PICK_KEYS.indexOf(a) - REQUIRED_PICK_KEYS.indexOf(b);
    });

  if (pickable.length) return byKickoff(pickable)[0];
  if (missing.length) return byKickoff(missing)[0];
  return null;
}

function describeMissingPick(slotKey, winners, teams, slotMatches) {
  const [a, b] = getTeamsForBracketSlot(slotKey, winners, teams);
  const match = slotMatches[slotKey];
  const teamsLabel = a && b ? `${a.name} vs ${b.name}` : match ? `Match ${match.num}` : "This matchup";
  const timeLabel = match?.kickoff ? fmtKickoff(match.kickoff) : null;
  return {
    slotKey,
    roundLabel: getSlotRoundShort(slotKey),
    teamsLabel,
    timeLabel,
  };
}

function isMatchScorable(match, lockTimeMs) {
  // No lock date means the bracket isn't committed yet; none of the played
  // matches can count toward scoring (they're treated as pre-decided/preset).
  if (!lockTimeMs || !match?.kickoff) return false;
  return match.kickoff.getTime() >= lockTimeMs;
}

function buildScorableActual(actual, slotMatches, lockTimeMs) {
  const filtered = {};
  if (!lockTimeMs) return filtered;
  for (const [k, id] of Object.entries(actual)) {
    if (isMatchScorable(slotMatches[k], lockTimeMs)) filtered[k] = id;
  }
  return filtered;
}

/** Cascade-clear picks that are no longer reachable. */
function normalize(winners, teams) {
  if (!teams?.length) return winners;
  const w = { ...winners };
  for (let r = 1; r < ROUNDS.length; r++) {
    for (let m = 0; m < ROUNDS[r].matches; m++) {
      const [a, b] = getMatchTeams(r, m, w, teams);
      const cur = w[key(ROUNDS[r].key, m)];
      if (cur && cur !== a?.id && cur !== b?.id) delete w[key(ROUNDS[r].key, m)];
    }
  }
  const [ta, tb] = getThirdPlaceTeams(w, teams);
  const third = w["third-0"];
  if (third && third !== ta?.id && third !== tb?.id) delete w["third-0"];
  return w;
}

/** slot key → enriched JSON match. */
const buildSlotMatches = (byNum) => {
  const map = {};
  for (const r of ROUNDS) {
    r.nums.forEach((num, i) => {
      const m = byNum.get(num);
      if (m) map[key(r.key, i)] = m;
    });
  }
  const third = byNum.get(THIRD_PLACE.num);
  if (third) map["third-0"] = third;
  return map;
};

/** slot key → actual winning team id (only for finished matches). */
const buildActual = (slotMatches) => {
  const actual = {};
  for (const [k, m] of Object.entries(slotMatches)) {
    if (m.status === "played" && m.winner) actual[k] = m.winner.id;
  }
  return actual;
};

/** Pre-fill only finished matches that already have a winner. */
function buildStarterWinners(teams, slotMatches) {
  return normalize(buildActual(slotMatches), teams);
}

export {
  getPickProgress,
  hasBracketPicks,
  buildStarterWinners,
  parseBracketSlotKey,
  getTeamsForBracketSlot,
  slotNeedsPick,
  getScoreSlotKeyForMatch,
  SCORE_GUIDE_HOURS_AHEAD,
  findRailScoreGuideMatch,
  findGuidancePickKey,
  findEarliestMissingPickKey,
  describeMissingPick,
  isMatchScorable,
  buildScorableActual,
  getMatchTeams,
  getThirdPlaceTeams,
  normalize,
  buildSlotMatches,
  buildActual,
};
