import { ROUNDS, THIRD_PLACE, key } from "./rounds";
import { isMatchScorable, getMatchTeams, getThirdPlaceTeams } from "./bracket";

// ----------------------------------------------------------------------------
// PREDICTION LOGIC
// ----------------------------------------------------------------------------
// Note: All predictions are saved to Firebase (Google or email sign-in required)
// Local storage persistence has been removed
export const SCORE_SUFFIX = "-score";

// Connector line colors — the line leaving a match shows whether that winner pick
// was right (green), wrong (red), or moot because the match was decided before the
// player's lock date (grey). Faint base line otherwise.
export const CONNECTOR_STROKE = "rgba(255, 255, 255, 0.12)";
export const CONNECTOR_STROKE_ACTIVE = "rgba(255, 255, 255, 0.2)";
export const CONNECTOR_STROKE_LIT = "#43a047";
export const CONNECTOR_STROKE_WRONG = "#e53935";
export const CONNECTOR_STROKE_PRESET = "rgba(160, 170, 185, 0.75)";

/** Verdict for the bracket connector line — reflects the winner pick (who advances):
 *  "correct" if the picked team actually won, "wrong" if not, "preset" if the match
 *  was already decided before the pick could count, else null.
 */
export const connectorVerdictForSlot = (winners, actual, slotMatches, slotKey, lockTimeMs) => {
  const match = slotMatches[slotKey];
  if (match?.status !== "played") return null;
  if (!isMatchScorable(match, lockTimeMs)) return "preset";
  const actualWinnerId = actual[slotKey];
  const predictedWinnerId = winners[slotKey];
  if (!actualWinnerId || !predictedWinnerId) return null;
  return predictedWinnerId === actualWinnerId ? "correct" : "wrong";
};

export const connectorStroke = (verdict, readOnly = false) => {
  if (!verdict) return CONNECTOR_STROKE;
  if (verdict === "correct") return CONNECTOR_STROKE_LIT;
  if (verdict === "wrong") return CONNECTOR_STROKE_WRONG;
  if (verdict === "preset") return CONNECTOR_STROKE_PRESET;
  return readOnly ? CONNECTOR_STROKE_ACTIVE : CONNECTOR_STROKE_LIT;
};

export const connectorWidth = (verdict) => {
  if (!verdict) return 1;
  if (verdict === "preset") return 1.5;
  return 2;
};

/** Get score prediction for a slot key. Returns [team1Score, team2Score] or null. */
export function getScorePrediction(winners, slotKey) {
  if (!slotKey) return null;
  const scoreKey = slotKey + SCORE_SUFFIX;
  const score = winners[scoreKey];
  if (!score || !Array.isArray(score) || score.length !== 2) return null;
  return score;
}

/** Map stored score prediction onto displayed team order [sideA, sideB]. */
export function mapPredictedScores(predictedScore, sideA, sideB, match) {
  if (!predictedScore || !sideA || !sideB) return [null, null];
  if (match?.team1 && match?.team2) {
    if (sideA.id === match.team1.id && sideB.id === match.team2.id) {
      return [predictedScore[0], predictedScore[1]];
    }
    if (sideA.id === match.team2.id && sideB.id === match.team1.id) {
      return [predictedScore[1], predictedScore[0]];
    }
  }
  return [predictedScore[0], predictedScore[1]];
}

/** Other users' score predictions for a fixture (excludes self). */
export function friendScorePredictionsForMatch(friends, scoreKey, match, excludeUid) {
  if (!scoreKey || !match?.team1 || !match?.team2) return [];
  const graded = match.status === "played" && match.ftScore;
  return friends
    .filter((f) => f.uid !== excludeUid && f.name)
    .map((f) => {
      const raw = getScorePrediction(f.winners, scoreKey);
      if (!raw) return null;
      const [a, b] = mapPredictedScores(raw, match.team1, match.team2, match);
      if (a == null || b == null) return null;
      const points = graded ? gradeScorePrediction(raw, match.ftScore).scorePoints : 0;
      return { uid: f.uid, name: f.name, display: `${a}–${b}`, home: a, away: b, points };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/** Locked, non-abandoned friends who haven't made a score prediction for this fixture (excludes self). */
export function friendsMissingScorePredictionForMatch(friends, scoreKey, match, excludeUid) {
  if (!scoreKey || !match?.team1 || !match?.team2) return [];
  return friends
    .filter((f) => f.uid !== excludeUid && f.name && f.locked && !f.abandoned)
    .filter((f) => !getScorePrediction(f.winners, scoreKey))
    .map((f) => ({ uid: f.uid, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Friends' bracket winner picks for a knockout fixture, grouped by team.
 *  Only includes picks where the chosen team is actually playing in this match. */
export function friendBracketPicksForMatch(friends, slotKey, match, excludeUid) {
  const empty = { team1: [], team2: [] };
  if (!slotKey || slotKey.startsWith("rail-") || !match?.isKnockout || !match?.team1 || !match?.team2) {
    return empty;
  }

  const team1 = [];
  const team2 = [];
  for (const f of friends) {
    if (!f.name || f.uid === excludeUid) continue;
    const pickId = f.winners?.[slotKey];
    if (!pickId) continue;
    if (pickId === match.team1.id) team1.push({ uid: f.uid, name: f.name });
    else if (pickId === match.team2.id) team2.push({ uid: f.uid, name: f.name });
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  team1.sort(byName);
  team2.sort(byName);
  return { team1, team2 };
}

export function formatScorePredictionDisplay(scorePrediction, match) {
  if (!scorePrediction || !match?.team1 || !match?.team2) return null;
  const [a, b] = mapPredictedScores(scorePrediction, match.team1, match.team2, match);
  if (a == null || b == null) return null;
  return `${a}–${b}`;
}

/** Set score prediction for a slot key. */
export function setScorePrediction(winners, slotKey, score) {
  const scoreKey = slotKey + SCORE_SUFFIX;
  if (!score || !Array.isArray(score) || score.length !== 2 || score[0] == null || score[1] == null) {
    const next = { ...winners };
    delete next[scoreKey];
    return next;
  }
  return { ...winners, [scoreKey]: score };
}

/** Clear score predictions when teams change (cascade like winners). */
export function normalizeScores(winners, teams) {
  if (!teams?.length) return winners;
  const w = { ...winners };
  for (let r = 1; r < ROUNDS.length; r++) {
    for (let m = 0; m < ROUNDS[r].matches; m++) {
      const [a, b] = getMatchTeams(r, m, w, teams);
      const slotKey = key(ROUNDS[r].key, m);
      const curWinner = w[slotKey];
      const scoreKey = slotKey + SCORE_SUFFIX;
      // Clear score if winner changed or teams are not determined
      if (!curWinner || !a || !b) {
        delete w[scoreKey];
      }
    }
  }
  // Third place match
  const [ta, tb] = getThirdPlaceTeams(w, teams);
  const thirdWinner = w["third-0"];
  if (!thirdWinner || !ta || !tb) {
    delete w["third-0" + SCORE_SUFFIX];
  }
  return w;
}

/** Score prediction points:
 *  - One side correct: 5 points
 *  - Both sides correct (exact score): 20 points
 */
export const SCORE_ONE_SIDE_POINTS = 5;
export const SCORE_EXACT_POINTS = 20;

export function gradeScorePrediction(predictedScore, ftScore) {
  if (!predictedScore || !ftScore) return { scoreResult: null, scorePoints: 0 };
  const side1Correct = predictedScore[0] === ftScore[0];
  const side2Correct = predictedScore[1] === ftScore[1];
  const bothCorrect = side1Correct && side2Correct;
  const oneSideCorrect = (side1Correct || side2Correct) && !bothCorrect;
  if (bothCorrect) return { scoreResult: "exact", scorePoints: SCORE_EXACT_POINTS };
  if (oneSideCorrect) return { scoreResult: "oneside", scorePoints: SCORE_ONE_SIDE_POINTS };
  return { scoreResult: null, scorePoints: 0 };
}


// ----------------------------------------------------------------------------
// COMEBACK PICKS
// ----------------------------------------------------------------------------
// The bracket is locked. When a knockout game is actually played, the winner a
// player picked in their bracket for that slot may not even be one of the two
// teams on the pitch (their team got knocked out earlier). That slot can never
// score. A "comeback pick" lets the player choose a fresh winner from the two
// real teams — in the Matchday tab only, never touching the bracket — for a flat
// bonus if correct. Stored under a `md-<slotKey>` key inside the same `winners`
// map (so it syncs for free), separate from the bracket pick and score call.
export const MATCHDAY_PICK_POINTS = 10;
export const MATCHDAY_KEY_PREFIX = "md-";

export const matchdayKey = (slotKey) => MATCHDAY_KEY_PREFIX + slotKey;

/** The player's comeback-pick team id for a slot, or null. */
export function getMatchdayPick(winners, slotKey) {
  if (!slotKey) return null;
  return winners[matchdayKey(slotKey)] ?? null;
}

/** Set (or clear, when teamId is falsy) the comeback pick for a slot. */
export function setMatchdayPick(winners, slotKey, teamId) {
  const k = matchdayKey(slotKey);
  if (!teamId) {
    const next = { ...winners };
    delete next[k];
    return next;
  }
  return { ...winners, [k]: teamId };
}

/** True when the bracket winner for this knockout slot isn't one of the two
 *  teams actually playing — i.e. the slot is eligible for a comeback pick.
 *  `bracketPickId` is the locked bracket winner (winners[slotKey]). */
export function isComebackEligible(bracketPickId, match, lockTimeMs) {
  if (!bracketPickId) return false;
  if (!match?.team1 || !match?.team2) return false;
  if (!isMatchScorable(match, lockTimeMs)) return false;
  return bracketPickId !== match.team1.id && bracketPickId !== match.team2.id;
}

/** Whether the bracket pick is one of the two teams actually playing. */
function bracketPickAlive(bracketPickId, match) {
  if (!bracketPickId || !match) return false;
  return bracketPickId === match.team1?.id || bracketPickId === match.team2?.id;
}

/** Other users' comeback picks for a fixture, grouped by team (excludes self).
 *  Only counts friends whose own bracket winner is out of this game. */
export function friendComebackPicksForMatch(friends, slotKey, match, excludeUid) {
  const empty = { team1: [], team2: [] };
  if (!slotKey || slotKey.startsWith("rail-") || !match?.isKnockout || !match?.team1 || !match?.team2) {
    return empty;
  }
  const team1 = [];
  const team2 = [];
  for (const f of friends) {
    if (!f.name || f.uid === excludeUid) continue;
    if (bracketPickAlive(f.winners?.[slotKey], match)) continue; // their bracket team is playing
    const pickId = getMatchdayPick(f.winners, slotKey);
    if (!pickId) continue;
    if (pickId === match.team1.id) team1.push({ uid: f.uid, name: f.name });
    else if (pickId === match.team2.id) team2.push({ uid: f.uid, name: f.name });
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  team1.sort(byName);
  team2.sort(byName);
  return { team1, team2 };
}

/** Grade picks — points only for finished matches where the user made a pick.
 *  Score predictions on real fixtures are graded separately (5 / 20 pts).
 *  Comeback picks (dead bracket slot re-picked in Matchday) score +10 each.
 */
export function gradeWinners(winners, actual, slotMatches, lockTimeMs = null) {
  const byRound = {};
  let correct = 0,
    total = 0,
    points = 0,
    played = 0,
    scoreOneSide = 0,
    scoreExact = 0,
    scorePoints = 0,
    matchdayCorrect = 0,
    matchdayTotal = 0,
    matchdayPoints = 0;
  for (const r of [...ROUNDS, THIRD_PLACE]) {
    byRound[r.key] = { correct: 0, total: 0, played: 0, scoreOneSide: 0, scoreExact: 0, scorePoints: 0, matchdayCorrect: 0, matchdayTotal: 0, matchdayPoints: 0 };
    const count = r.matches ?? 1;
    for (let m = 0; m < count; m++) {
      const k = key(r.key, m);
      const match = slotMatches?.[k];
      if (!actual[k]) continue;
      if (!isMatchScorable(match, lockTimeMs)) continue;
      byRound[r.key].played++;
      played++;

      // Comeback pick: only when the bracket winner isn't in this game.
      if (!bracketPickAlive(winners[k], match)) {
        const comebackPick = getMatchdayPick(winners, k);
        if (comebackPick) {
          byRound[r.key].matchdayTotal++;
          matchdayTotal++;
          if (comebackPick === actual[k]) {
            byRound[r.key].matchdayCorrect++;
            byRound[r.key].matchdayPoints += MATCHDAY_PICK_POINTS;
            matchdayCorrect++;
            matchdayPoints += MATCHDAY_PICK_POINTS;
          }
        }
      }

      if (!winners[k]) continue;
      byRound[r.key].total++;
      total++;
      const teamCorrect = actual[k] === winners[k];
      if (teamCorrect) {
        byRound[r.key].correct++;
        correct++;
        points += r.points;
      }
      // Grade score prediction on the real fixture (90-min), independent of bracket winner pick
      const predictedScore = getScorePrediction(winners, k);
      if (predictedScore && match?.ftScore) {
        const { scorePoints: sp } = gradeScorePrediction(predictedScore, match.ftScore);
        if (sp === SCORE_EXACT_POINTS) {
          byRound[r.key].scoreExact++;
          scoreExact++;
          scorePoints += sp;
        } else if (sp === SCORE_ONE_SIDE_POINTS) {
          byRound[r.key].scoreOneSide++;
          scoreOneSide++;
          scorePoints += sp;
        }
      }
    }
  }
  return {
    correct, total, points, played, byRound, scoreOneSide, scoreExact, scorePoints,
    matchdayCorrect, matchdayTotal, matchdayPoints,
    totalPoints: points + scorePoints + matchdayPoints,
  };
}

/** Last `n` graded bracket picks (winner picks only) in chronological order, for
 *  standings "form" dots. Each entry is { slotKey, correct, kickoff }. */
export function recentPickResults(winners, actual, slotMatches, lockTimeMs = null, n = 5) {
  const graded = [];
  for (const r of [...ROUNDS, THIRD_PLACE]) {
    const count = r.matches ?? 1;
    for (let m = 0; m < count; m++) {
      const k = key(r.key, m);
      const match = slotMatches?.[k];
      if (!actual[k] || !winners[k]) continue;
      if (!isMatchScorable(match, lockTimeMs)) continue;
      graded.push({ slotKey: k, correct: actual[k] === winners[k], kickoff: match?.kickoff?.getTime?.() ?? 0 });
    }
  }
  graded.sort((a, b) => a.kickoff - b.kickoff);
  return graded.slice(-n);
}

function teamOnMatch(match, teamId) {
  if (!match || !teamId) return null;
  if (match.team1?.id === teamId) return match.team1;
  if (match.team2?.id === teamId) return match.team2;
  return null;
}

function ftDisplay(match) {
  if (match?.ftScore) return `${match.ftScore[0]}–${match.ftScore[1]}`;
  if (match?.score) return `${match.score[0]}–${match.score[1]}`;
  return null;
}

function buildFriendEvent(friend, match, slotKey, roundLabel, roundPoints, actual, lockTimeMs) {
  const played = match.status === "played";
  const isFuture = !played;
  if (played && !isMatchScorable(match, lockTimeMs)) return null;

  const predictedWinnerId = friend.winners[slotKey];
  const predictedScore = getScorePrediction(friend.winners, slotKey);
  if (!predictedWinnerId && !predictedScore) return null;
  if (isFuture && !match.team1 && !match.team2) return null;

  let winnerCorrect = false;
  let bracketPts = 0;
  if (played && predictedWinnerId) {
    const actualWinner = actual[slotKey] || match.winner?.id;
    winnerCorrect = !!(actualWinner && predictedWinnerId === actualWinner);
    bracketPts = winnerCorrect ? roundPoints : 0;
  }

  let scorePts = 0;
  let scoreResult = null;
  let scoreDisplay = predictedScore ? formatScorePredictionDisplay(predictedScore, match) : null;
  if (played && predictedScore && match.ftScore) {
    const graded = gradeScorePrediction(predictedScore, match.ftScore);
    scorePts = graded.scorePoints;
    scoreResult = graded.scoreResult;
  }

  // Comeback pick — only when the bracket winner isn't playing this knockout game.
  const isKnockoutSlot = !!slotKey && !slotKey.startsWith("rail-");
  const bracketDead = isKnockoutSlot && !!predictedWinnerId && !bracketPickAlive(predictedWinnerId, match);
  const comebackPickId = bracketDead ? getMatchdayPick(friend.winners, slotKey) : null;
  const comebackTeam = comebackPickId ? teamOnMatch(match, comebackPickId) : null;
  let comebackCorrect = null;
  let comebackPts = 0;
  if (played && comebackPickId) {
    const actualWinner = actual[slotKey] || match.winner?.id;
    comebackCorrect = !!(actualWinner && comebackPickId === actualWinner);
    comebackPts = comebackCorrect ? MATCHDAY_PICK_POINTS : 0;
  }

  return {
    id: slotKey,
    roundLabel,
    matchNum: match.num,
    match,
    kickoff: match.kickoff?.getTime?.() ?? 0,
    isFuture,
    played,
    bracketTeam: teamOnMatch(match, predictedWinnerId),
    bracketCorrect: played ? winnerCorrect : null,
    bracketPts,
    bracketDead,
    comebackTeam,
    comebackCorrect: played ? comebackCorrect : null,
    comebackPts,
    scoreDisplay,
    actualScore: played ? ftDisplay(match) : null,
    scorePts,
    scoreResult,
    totalPts: bracketPts + scorePts + comebackPts,
  };
}

/** All bracket + score predictions (played, live, upcoming) for compact mobile lists. */
export function friendPredictionList(friend, { actual, slotMatches, byNum, lockTimeMs = null }) {
  const events = [];

  for (const r of [...ROUNDS, THIRD_PLACE]) {
    const count = r.matches ?? 1;
    for (let m = 0; m < count; m++) {
      const slotKey = key(r.key, m);
      const match = slotMatches?.[slotKey];
      if (!match || match.status === "played" && !match.winner && !match.ftScore) continue;
      const ev = buildFriendEvent(friend, match, slotKey, r.short, r.points, actual, lockTimeMs);
      if (ev) events.push({ ...ev, kind: "knockout" });
    }
  }

  for (const k of Object.keys(friend.winners)) {
    if (!k.startsWith("rail-") || k.endsWith(SCORE_SUFFIX)) continue;
    const matchNum = parseInt(k.replace("rail-", ""), 10);
    if (Number.isNaN(matchNum)) continue;
    const match = byNum?.get(matchNum);
    if (!match) continue;
    const label = match.group || match.roundLabel || "GRP";
    const ev = buildFriendEvent(friend, match, k, label, 1, actual, lockTimeMs);
    if (ev) events.push({ ...ev, kind: "group" });
  }

  events.sort((a, b) => {
    if (a.isFuture !== b.isFuture) return a.isFuture ? -1 : 1;
    return a.isFuture ? a.kickoff - b.kickoff : b.kickoff - a.kickoff;
  });
  return events;
}

/** Graded bracket + score-call history for standings expand / bottom sheet. */
export function friendStandingsEvents(friend, { actual, slotMatches, byNum, lockTimeMs = null }) {
  return friendPredictionList(friend, { actual, slotMatches, byNum, lockTimeMs }).filter((e) => e.played);
}

/** Get detailed prediction info for a single match - used when viewing others' brackets */
export function getMatchPredictionInfo(winners, match, slotKey, isKnockout, roundPoints, teamById, byNum, lockTimeMs = null) {
  // Get winner pick
  let pickKey = slotKey;
  let scoreKey = slotKey + SCORE_SUFFIX;

  // For rail games (non-knockout), use rail- prefix
  if (!isKnockout && match.num) {
    pickKey = `rail-${match.num}`;
    scoreKey = pickKey + SCORE_SUFFIX;
  }

  const predictedWinnerId = winners[pickKey] || null;
  const predictedScore = winners[scoreKey] || null;
  const scorable = isMatchScorable(match, lockTimeMs);

  // Calculate points if match is played
  let pointsEarned = 0;
  let scorePointsEarned = 0;
  let winnerCorrect = false;
  let scoreResult = null; // 'exact', 'oneside', or null

  if (scorable && match.status === "played" && match.winner && predictedWinnerId) {
    if (predictedWinnerId === match.winner.id) {
      winnerCorrect = true;
      pointsEarned = isKnockout ? roundPoints : 1;
    }
  }

  if (scorable && match.status === "played" && predictedScore && match.ftScore) {
    const { scoreResult: sr, scorePoints: sp } = gradeScorePrediction(predictedScore, match.ftScore);
    scoreResult = sr;
    scorePointsEarned = sp;
  }

  const predictedWinner = predictedWinnerId ? teamById.get(predictedWinnerId) || null : null;

  return {
    predictedWinner,
    predictedScore,
    pointsEarned,
    scorePointsEarned,
    totalPoints: pointsEarned + scorePointsEarned,
    winnerCorrect,
    scoreResult,
    hasPrediction: !!predictedWinnerId,
    matchPlayed: match.status === 'played'
  };
}
