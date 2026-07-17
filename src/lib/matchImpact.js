// ----------------------------------------------------------------------------
// SINGLE-GAME IMPACT — treat YOUR prediction for one fixture as the outcome
// and project the leaderboard, without touching the rest of the bracket.
// ----------------------------------------------------------------------------
// Powers the "If your call lands" strip on the Matchday detail: derive a
// hypothetical result from the player's own calls (score / bracket-or-comeback
// winner / path), grade every locked player's stake in that one game, and
// re-rank. A live draft score (still being typed) can override the saved one.
import { ROUNDS, THIRD_PLACE } from "./rounds";
import { isMatchScorable } from "./bracket";
import { slotContribution } from "./simulator";
import {
  getScorePrediction,
  gradeScorePrediction,
  getMatchdayPick,
  getPathCallPick,
  PATH_SKIP,
  SCORE_SUFFIX,
} from "./scoring";

const ZERO = { bracket: 0, path: 0, score: 0, comeback: 0, total: 0 };

export const isRailKey = (slotKey) => !!slotKey && slotKey.startsWith("rail-");

/** Bracket points on the line for a slot — knockout round points, 1 for rail. */
export function slotWinnerPoints(slotKey) {
  if (!slotKey) return 0;
  if (isRailKey(slotKey)) return 1;
  if (slotKey.startsWith("third")) return THIRD_PLACE.points;
  const roundKey = slotKey.split("-")[0];
  return ROUNDS.find((r) => r.key === roundKey)?.points ?? 0;
}

function normalizeScore(score) {
  if (!Array.isArray(score) || score.length !== 2) return null;
  const [a, b] = score.map((n) => (typeof n === "string" ? parseInt(n, 10) : n));
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return null;
  return [a, b];
}

/**
 * The outcome implied by MY calls for this one fixture.
 * - A decisive 90' score settles it in regulation, winner included.
 * - A drawn 90' score on a knockout game pushes the path to ET (or my pens
 *   call) and falls back to my bracket/comeback winner for who advances.
 * - No score at all: my winner pick + my path call.
 * Returns null when nothing is predicted yet.
 */
export function myHypotheticalOutcome({ match, slotKey, winners, draftScore }) {
  if (!match?.team1 || !match?.team2 || !slotKey) return null;
  const score = normalizeScore(draftScore) ?? normalizeScore(getScorePrediction(winners, slotKey));
  const rail = isRailKey(slotKey);

  const scoreWinnerId =
    score && score[0] !== score[1] ? (score[0] > score[1] ? match.team1.id : match.team2.id) : null;

  if (rail) {
    if (!score) return null; // group games have no separate winner pick to lean on
    return { winnerId: scoreWinnerId, path: "reg", score };
  }

  const bracketPick = winners?.[slotKey];
  const pickAlive = bracketPick === match.team1.id || bracketPick === match.team2.id;
  const myWinner = pickAlive ? bracketPick : getMatchdayPick(winners, slotKey) ?? null;
  const myPath = getPathCallPick(winners, slotKey);
  const gradedPath = myPath && myPath !== PATH_SKIP ? myPath : null;

  if (scoreWinnerId) {
    // Decisive regular-time score ⇒ over in regulation; the score names the winner.
    return { winnerId: scoreWinnerId, path: "reg", score };
  }
  if (score) {
    // Drawn after 90' ⇒ it goes the distance; my pick (if any) advances.
    return { winnerId: myWinner, path: gradedPath === "pens" ? "pens" : "aet", score };
  }
  if (!myWinner) return null;
  return { winnerId: myWinner, path: gradedPath ?? "reg", score: null };
}

/** A pretend "played" match for graders, built from a hypothetical outcome. */
export function simulateMatch(match, outcome, teamById = null) {
  const winnerTeam =
    outcome.winnerId === match.team1?.id
      ? match.team1
      : outcome.winnerId === match.team2?.id
        ? match.team2
        : teamById?.get?.(outcome.winnerId) ?? null;
  return {
    ...match,
    status: "played",
    phase: outcome.path === "pens" ? "pens" : outcome.path === "aet" ? "aet" : "ft",
    winner: winnerTeam,
    winnerIdx: winnerTeam ? (winnerTeam.id === match.team1?.id ? 0 : 1) : null,
    score: outcome.score ?? match.score ?? null,
    ftScore: outcome.score ?? null,
    pens: outcome.path === "pens" ? [4, 3] : null,
    simulated: true,
  };
}

/** Points one player takes from a hypothetical group-stage result. */
function railContribution(friend, slotKey, simMatch, winnerId) {
  if (!isMatchScorable(simMatch, friend.lockedAt)) return ZERO;
  const bracket = winnerId && friend.winners?.[slotKey] === winnerId ? 1 : 0;
  let score = 0;
  const predicted = getScorePrediction(friend.winners, slotKey);
  if (predicted && simMatch.ftScore) {
    score = gradeScorePrediction(predicted, simMatch.ftScore, slotKey).scorePoints;
  }
  return { ...ZERO, bracket, score, total: bracket + score };
}

/**
 * Project the table as if MY prediction for this one game came true.
 * `friends` must be the ranked list (locked players carry `.points`).
 * Returns null when there's nothing to project (no prediction, match not
 * upcoming, teams unknown, or the viewer isn't on the board).
 */
export function computeMatchImpact({ match, slotKey, friends, selfUid, myWinners, draftScore, teamById = null }) {
  if (!match || match.status !== "upcoming" || !match.team1 || !match.team2 || !slotKey) return null;

  const outcome = myHypotheticalOutcome({ match, slotKey, winners: myWinners, draftScore });
  if (!outcome) return null;

  const simMatch = simulateMatch(match, outcome, teamById);
  const rail = isRailKey(slotKey);
  const slot = { slotKey, points: slotWinnerPoints(slotKey) };
  const board = friends.filter((f) => f.locked && !f.abandoned && f.name);
  if (!board.some((f) => f.uid === selfUid)) return null;

  const baseRank = new Map(board.map((f, i) => [f.uid, i + 1]));

  const rows = board
    .map((f) => {
      // My row grades against my live calls (draft score included), not the
      // possibly-stale synced snapshot.
      const winners = f.uid === selfUid ? { ...f.winners, ...myWinners } : f.winners;
      const draft = f.uid === selfUid && normalizeScore(draftScore)
        ? { ...winners, [slotKey + SCORE_SUFFIX]: normalizeScore(draftScore) }
        : winners;
      const graded = { ...f, winners: draft };
      const c = rail
        ? railContribution(graded, slotKey, simMatch, outcome.winnerId)
        : slotContribution(graded, slot, simMatch, outcome.winnerId);
      return {
        uid: f.uid,
        name: f.name,
        isMe: f.uid === selfUid,
        basePoints: f.points,
        baseRank: baseRank.get(f.uid),
        ...c,
        projected: f.points + c.total,
      };
    })
    .sort((a, b) => b.projected - a.projected || a.baseRank - b.baseRank);

  rows.forEach((r, i) => {
    r.projRank = i + 1;
    r.rankDelta = r.baseRank - (i + 1);
  });

  const me = rows.find((r) => r.isMe);
  const leader = rows[0];
  const runnerUp = rows[1] ?? null;
  return {
    outcome,
    simMatch,
    rows,
    me,
    leader,
    // Positive when I'm clear on top; negative = points I'd still trail by.
    gap: me.projRank === 1 ? (runnerUp ? me.projected - runnerUp.projected : 0) : me.projected - leader.projected,
  };
}

/** Seed for the Scenario Lab deep link — knockout games only. */
export function scenarioForImpact(slotKey, outcome) {
  if (!slotKey || isRailKey(slotKey) || !outcome?.winnerId) return null;
  return { [slotKey]: { winner: outcome.winnerId, path: outcome.path ?? "reg", score: outcome.score ?? null } };
}
