// ----------------------------------------------------------------------------
// WHAT-IF SIMULATOR — project the standings from hypothetical knockout outcomes.
// ----------------------------------------------------------------------------
// The Standings "Scenario Lab" lets a player pick outcomes for games that
// haven't been decided yet — who advances (bracket winner), how the game is
// decided (path call: regulation / extra time / penalties) and the final score
// — then re-grades everyone against that hypothetical world so you can watch
// the leaderboard reshuffle. Real, already-played results are never overridden;
// scenarios only fill in the undecided slots. Deciding an earlier game unlocks
// the teams for the games it feeds, so a full run of the bracket is possible.
import { ROUNDS, THIRD_PLACE, key } from "./rounds";
import { getTeamsForBracketSlot, isMatchScorable } from "./bracket";
import {
  gradeWinners,
  gradeScorePrediction,
  getScorePrediction,
  getPathCallPick,
  getMatchdayPick,
  actualPath,
  SCORE_SUFFIX,
  PATH_OPTIONS,
  PATH_SKIP,
  PATH_CALL_CORRECT_POINTS,
  PATH_CALL_WRONG_POINTS,
  MATCHDAY_PICK_POINTS,
} from "./scoring";

const ALL_ROUNDS = [...ROUNDS, THIRD_PLACE];

/** Combined winner map: real results + the user's hypothetical winner picks. */
function scenarioWinnerMap(actual, scenario) {
  const w = { ...actual };
  for (const [slotKey, choice] of Object.entries(scenario)) {
    if (choice?.winner && !actual[slotKey]) w[slotKey] = choice.winner;
  }
  return w;
}

/** Convert a path-call option ("reg"|"aet"|"pens") to a match phase. */
function phaseForPath(path) {
  if (path === "aet") return "aet";
  if (path === "pens") return "pens";
  return "ft"; // "reg" and default
}

/**
 * Every knockout slot in bracket order, resolved against the current scenario.
 * Each entry describes whether it's already decided in reality, ready to pick
 * (both teams known), or still awaiting an upstream result.
 */
export function buildScenarioSlots(actual, slotMatches, teams, scenario) {
  const simWinners = scenarioWinnerMap(actual, scenario);
  const slots = [];
  for (const r of ALL_ROUNDS) {
    const count = r.matches ?? 1;
    for (let m = 0; m < count; m++) {
      const slotKey = key(r.key, m);
      const real = slotMatches[slotKey] || null;
      const [teamA, teamB] = getTeamsForBracketSlot(slotKey, simWinners, teams);
      const decidedReal = !!actual[slotKey];
      const choice = scenario[slotKey] || null;
      slots.push({
        slotKey,
        roundKey: r.key,
        roundLabel: r.label,
        short: r.short,
        points: r.points,
        num: real?.num ?? null,
        kickoff: real?.kickoff ?? null,
        teamA,
        teamB,
        ready: !!(teamA && teamB),
        decidedReal,
        realWinnerId: actual[slotKey] ?? null,
        realMatch: real,
        choice,
      });
    }
  }
  return slots;
}

/**
 * Build a hypothetical `actual` map + `slotMatches` map that layer the user's
 * scenario on top of the real results. Only undecided slots with both teams
 * resolved are injected; real results are left untouched.
 */
export function applyScenario(actual, slotMatches, teams, scenario) {
  const simWinners = scenarioWinnerMap(actual, scenario);
  const simActual = { ...actual };
  const simSlotMatches = { ...slotMatches };

  for (const [slotKey, choice] of Object.entries(scenario)) {
    if (!choice?.winner || actual[slotKey]) continue;
    const [teamA, teamB] = getTeamsForBracketSlot(slotKey, simWinners, teams);
    if (!teamA || !teamB) continue;
    const winner = choice.winner === teamA.id ? teamA : choice.winner === teamB.id ? teamB : null;
    if (!winner) continue;

    const real = slotMatches[slotKey] || {};
    const phase = phaseForPath(choice.path);
    const score = normalizeScorePair(choice.score);
    simActual[slotKey] = winner.id;
    simSlotMatches[slotKey] = {
      ...real,
      num: real.num ?? null,
      kickoff: real.kickoff ?? null,
      isKnockout: true,
      team1: teamA,
      team2: teamB,
      status: "played",
      winner,
      winnerIdx: winner.id === teamA.id ? 0 : 1,
      phase,
      pens: phase === "pens" ? [4, 3] : null,
      score: score ?? real.score ?? null,
      ftScore: score ?? real.ftScore ?? null,
      simulated: true,
    };
  }
  return { simActual, simSlotMatches };
}

function normalizeScorePair(score) {
  if (!Array.isArray(score) || score.length !== 2) return null;
  const [a, b] = score;
  if (a == null || b == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  return [a, b];
}

/** Rail (group-stage) points for a friend — unchanged by knockout scenarios,
 *  but needed for a correct projected TOTAL. Mirrors App.jsx rankedFriends. */
function railPointsFor(friend, byNum) {
  const railKeys = Object.keys(friend.winners).filter((k) => k.startsWith("rail-") && !k.endsWith(SCORE_SUFFIX));
  let correct = 0;
  let scorePoints = 0;
  for (const k of railKeys) {
    const matchNum = parseInt(k.replace("rail-", ""), 10);
    const match = byNum.get(matchNum);
    if (!match || match.status !== "played" || !match.winner) continue;
    if (!isMatchScorable(match, friend.lockedAt)) continue;
    if (friend.winners[k] === match.winner.id) correct++;
    const predictedScore = friend.winners[k + SCORE_SUFFIX];
    if (predictedScore && match.ftScore) {
      const { scorePoints: sp } = gradeScorePrediction(predictedScore, match.ftScore, k);
      scorePoints += sp;
    }
  }
  return correct * 1 + scorePoints;
}

/**
 * Re-grade + re-rank every friend against a (possibly hypothetical) world.
 * Returns friends with projected `points` and the same tie-breaks App uses.
 */
export function rankFriendsAgainst(friends, simActual, simSlotMatches, byNum) {
  return friends
    .map((friend) => {
      const graded = gradeWinners(friend.winners, simActual, simSlotMatches, friend.lockedAt);
      const railPoints = railPointsFor(friend, byNum);
      return {
        ...friend,
        ...graded,
        points: (graded.totalPoints ?? graded.points) + railPoints,
      };
    })
    .sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? -1 : 1;
      if (!a.locked && !b.locked) return a.name.localeCompare(b.name);
      return (
        b.points - a.points ||
        b.correct - a.correct ||
        b.total - a.total ||
        a.name.localeCompare(b.name)
      );
    });
}

/** Points a single friend earns from one decided slot — broken out by source. */
export function slotContribution(friend, slot, match, actualWinnerId) {
  const winners = friend.winners;
  const scorable = isMatchScorable(match, friend.lockedAt);
  const zero = { bracket: 0, path: 0, score: 0, comeback: 0, total: 0 };
  if (!scorable || !actualWinnerId) return zero;

  const pick = winners[slot.slotKey];
  const pickAlive = pick && (pick === match.team1?.id || pick === match.team2?.id);

  let bracket = 0;
  if (pick && pick === actualWinnerId) bracket = slot.points;

  let comeback = 0;
  if (!pickAlive) {
    const cb = getMatchdayPick(winners, slot.slotKey);
    if (cb && cb === actualWinnerId) comeback = MATCHDAY_PICK_POINTS;
  }

  let path = 0;
  const pathPick = getPathCallPick(winners, slot.slotKey);
  if (pathPick && pathPick !== PATH_SKIP) {
    const outcome = actualPath(match);
    if (outcome) path = pathPick === outcome ? PATH_CALL_CORRECT_POINTS : PATH_CALL_WRONG_POINTS;
  }

  let score = 0;
  const predictedScore = getScorePrediction(winners, slot.slotKey);
  if (predictedScore && match?.ftScore) {
    score = gradeScorePrediction(predictedScore, match.ftScore, slot.slotKey).scorePoints;
  }

  return { bracket, path, score, comeback, total: bracket + path + score + comeback };
}

/** Ranked list of who gains (or loses) points from a single simulated slot. */
export function slotEarners(friends, slot, match, actualWinnerId) {
  const rows = [];
  for (const f of friends) {
    if (!f.locked || f.abandoned || !f.name) continue;
    const c = slotContribution(f, slot, match, actualWinnerId);
    if (c.total !== 0) rows.push({ uid: f.uid, name: f.name, ...c });
  }
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return rows;
}

export { PATH_OPTIONS };
