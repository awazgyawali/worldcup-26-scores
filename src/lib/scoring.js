import { ROUNDS, THIRD_PLACE, key } from "./rounds";
import { isMatchScorable, getMatchTeams, getThirdPlaceTeams } from "./bracket";

// ----------------------------------------------------------------------------
// PREDICTION LOGIC
// ----------------------------------------------------------------------------
// Note: All predictions are saved to Firebase only (anonymous login mandatory)
// Local storage persistence has been removed
export const SCORE_SUFFIX = "-score";
export const CONNECTOR_STROKE = "rgba(100, 118, 140, 0.18)";
export const CONNECTOR_STROKE_ACTIVE = "rgba(100, 118, 140, 0.32)";
export const CONNECTOR_STROKE_LIT = "rgba(74, 222, 128, 0.82)";
export const CONNECTOR_STROKE_WRONG = "rgba(248, 113, 113, 0.82)";
export const CONNECTOR_STROKE_PRESET = "rgba(56, 189, 248, 0.82)";

export const connectorVerdictForSlot = (winners, slotMatches, slotKey, lockTimeMs) => {
  const match = slotMatches[slotKey];
  const scorePrediction = getScorePrediction(winners, slotKey);
  return getScoreVerdict(match, scorePrediction, lockTimeMs);
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
  if (verdict === "pending") return 1.5;
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
      return { uid: f.uid, name: f.name, display: `${a}–${b}`, points };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
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
 *  - One side correct: 2 points
 *  - Both sides correct (exact score): 5 points
 */
export const SCORE_ONE_SIDE_POINTS = 2;
export const SCORE_EXACT_POINTS = 5;

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

/** Determine how to color the score prediction line for a played match.
 *  - "correct" if any part of the predicted score was right (green)
 *  - "wrong" if the prediction exists but was completely wrong (red)
 *  - "preset" if the match was played before the lock time (blue)
 *  - null for unplayed or unscored matches
 */
export function getScoreVerdict(match, predictedScore, lockTimeMs) {
  if (match?.status !== "played") return null;
  const scorable = isMatchScorable(match, lockTimeMs);
  if (!scorable) return "preset";
  if (!predictedScore || !match.ftScore) return null;
  const { scorePoints } = gradeScorePrediction(predictedScore, match.ftScore);
  return scorePoints > 0 ? "correct" : "wrong";
}

/** Grade picks — points only for finished matches where the user made a pick.
 *  Score predictions on real fixtures are graded separately (2 / 5 pts).
 */
export function gradeWinners(winners, actual, slotMatches, lockTimeMs = null) {
  const byRound = {};
  let correct = 0,
    total = 0,
    points = 0,
    played = 0,
    scoreOneSide = 0,
    scoreExact = 0,
    scorePoints = 0;
  for (const r of [...ROUNDS, THIRD_PLACE]) {
    byRound[r.key] = { correct: 0, total: 0, played: 0, scoreOneSide: 0, scoreExact: 0, scorePoints: 0 };
    const count = r.matches ?? 1;
    for (let m = 0; m < count; m++) {
      const k = key(r.key, m);
      const match = slotMatches?.[k];
      if (!actual[k]) continue;
      if (!isMatchScorable(match, lockTimeMs)) continue;
      byRound[r.key].played++;
      played++;
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
  return { correct, total, points, played, byRound, scoreOneSide, scoreExact, scorePoints, totalPoints: points + scorePoints };
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
