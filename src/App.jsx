import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePredictions } from "./hooks/usePredictions";

/* ============================================================================
 *  FIFA WORLD CUP 2026 — KNOCKOUT BRACKET PREDICTOR
 *  Data: openfootball/worldcup.json. Every bracket slot maps to a JSON match
 *  number (73–104), so live scores, goal scorers, venues, extra time and
 *  penalty shootouts all attach exactly where they belong.
 *
 *  Layout: bracket + compact predictions ticker at the bottom.
 * ==========================================================================*/

// ----------------------------------------------------------------------------
// TEAM METADATA — FIFA trigram codes + iso2 for flagcdn.
// ----------------------------------------------------------------------------
const TEAM_META = {
  Algeria: ["dz", "ALG"],
  Argentina: ["ar", "ARG"],
  Australia: ["au", "AUS"],
  Austria: ["at", "AUT"],
  Belgium: ["be", "BEL"],
  "Bosnia & Herzegovina": ["ba", "BIH"],
  Brazil: ["br", "BRA"],
  Canada: ["ca", "CAN"],
  "Cape Verde": ["cv", "CPV"],
  Colombia: ["co", "COL"],
  Croatia: ["hr", "CRO"],
  "Curaçao": ["cw", "CUW"],
  "Czech Republic": ["cz", "CZE"],
  "DR Congo": ["cd", "COD"],
  Ecuador: ["ec", "ECU"],
  Egypt: ["eg", "EGY"],
  England: ["gb-eng", "ENG"],
  France: ["fr", "FRA"],
  Germany: ["de", "GER"],
  Ghana: ["gh", "GHA"],
  Haiti: ["ht", "HAI"],
  Iran: ["ir", "IRN"],
  Iraq: ["iq", "IRQ"],
  Italy: ["it", "ITA"],
  "Ivory Coast": ["ci", "CIV"],
  Japan: ["jp", "JPN"],
  Jordan: ["jo", "JOR"],
  Mexico: ["mx", "MEX"],
  Morocco: ["ma", "MAR"],
  Netherlands: ["nl", "NED"],
  "New Zealand": ["nz", "NZL"],
  Norway: ["no", "NOR"],
  Panama: ["pa", "PAN"],
  Paraguay: ["py", "PAR"],
  Portugal: ["pt", "POR"],
  Qatar: ["qa", "QAT"],
  "Saudi Arabia": ["sa", "KSA"],
  Scotland: ["gb-sct", "SCO"],
  Senegal: ["sn", "SEN"],
  "South Africa": ["za", "RSA"],
  "South Korea": ["kr", "KOR"],
  Spain: ["es", "ESP"],
  Sweden: ["se", "SWE"],
  Switzerland: ["ch", "SUI"],
  Tunisia: ["tn", "TUN"],
  Turkey: ["tr", "TUR"],
  USA: ["us", "USA"],
  "United States": ["us", "USA"],
  Uruguay: ["uy", "URU"],
  Uzbekistan: ["uz", "UZB"],
};

const TEAM_ALIASES = {
  usa: "united states",
  "u.s.a.": "united states",
  "united states of america": "united states",
  "korea republic": "south korea",
  "republic of korea": "south korea",
  "korea, republic of": "south korea",
  "côte d'ivoire": "ivory coast",
  "cote d'ivoire": "ivory coast",
  "bosnia and herzegovina": "bosnia & herzegovina",
};

const isRef = (name) => !!name && /^[WL]\d+$/.test(name);

const normTeam = (name) => {
  if (!name || isRef(name)) return "";
  const n = name.trim().toLowerCase();
  return TEAM_ALIASES[n] || n;
};

const META_BY_NORM = new Map(
  Object.entries(TEAM_META).map(([name, [iso2, code]]) => [
    normTeam(name),
    { name: name === "USA" ? "United States" : name, iso2, code },
  ])
);

/** Team object: { code (id), name, iso2 } — or a graceful fallback. */
const teamFor = (jsonName) => {
  if (!jsonName || isRef(jsonName)) return null;
  const meta = META_BY_NORM.get(normTeam(jsonName));
  if (meta) return { id: meta.code, code: meta.code, name: meta.name, iso2: meta.iso2 };
  const code = jsonName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "TBD";
  return { id: code, code, name: jsonName, iso2: "un" };
};

// ----------------------------------------------------------------------------
// BRACKET SHAPE — JSON match numbers per slot, left→right.
// ----------------------------------------------------------------------------
const ROUNDS = [
  { key: "r32", label: "Round of 32", short: "R32", matches: 16, points: 1, nums: [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87] },
  { key: "r16", label: "Round of 16", short: "R16", matches: 8, points: 2, nums: [89, 90, 93, 94, 91, 92, 95, 96] },
  { key: "qf", label: "Quarter-finals", short: "QF", matches: 4, points: 4, nums: [97, 98, 99, 100] },
  { key: "sf", label: "Semi-finals", short: "SF", matches: 2, points: 7, nums: [101, 102] },
  { key: "final", label: "Final", short: "F", matches: 1, points: 12, nums: [104] },
];
const FINAL_ROUND = ROUNDS.length - 1;
const THIRD_PLACE = { key: "third", label: "Third place", short: "3RD", points: 3, num: 103 };
const key = (r, m) => `${r}-${m}`;
/** Every knockout slot the user must fill before locking. */
const REQUIRED_PICK_KEYS = [
  ...ROUNDS.flatMap((r) => Array.from({ length: r.matches }, (_, m) => key(r.key, m))),
  "third-0",
];
const TOTAL_REQUIRED_PICKS = REQUIRED_PICK_KEYS.length;

function getPickProgress(winners) {
  const filled = REQUIRED_PICK_KEYS.filter((k) => winners[k]).length;
  return { filled, total: TOTAL_REQUIRED_PICKS, complete: filled === TOTAL_REQUIRED_PICKS };
}
const BRACKET_ROWS = 8;

const ROUND_LABEL = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  "Quarter-final": "Quarter-final",
  "Semi-final": "Semi-final",
  "Match for third place": "Third place",
  Final: "Final",
};
const ROUND_SHORT = {
  "Round of 32": "R32",
  "Round of 16": "R16",
  "Quarter-final": "QF",
  "Semi-final": "SF",
  "Match for third place": "3RD",
  Final: "FINAL",
};

// ----------------------------------------------------------------------------
// LIVE DATA — openfootball/worldcup.json
// ----------------------------------------------------------------------------
const WORLDCUP_JSON_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/refs/heads/master/2026/worldcup.json";
const POLL_EVERY_MS = 60_000;

const parseKickoff = (date, timeStr) => {
  if (!date || !timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s+UTC([+-]?\d+)/);
  if (!m) return null;
  const [, hh, mm, off] = m;
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, parseInt(hh, 10) - parseInt(off, 10), parseInt(mm, 10)));
};

/**
 * Full result of a match, honouring extra time and penalty shootouts:
 * { score: [a,b]|null, ht, pens, phase: "ft"|"aet"|"pens"|null, winnerIdx: 0|1|null }
 * A knockout draw with no shootout yet means the match is still being decided.
 */
const readScore = (m) => {
  const s = m.score || {};
  const score = s.et ?? s.ft ?? null;
  if (!score) return { score: null, ht: s.ht ?? null, pens: null, phase: null, winnerIdx: null };
  let phase = s.et ? "aet" : "ft";
  let winnerIdx = null;
  if (score[0] !== score[1]) winnerIdx = score[0] > score[1] ? 0 : 1;
  else if (s.p) {
    phase = "pens";
    winnerIdx = s.p[0] > s.p[1] ? 0 : 1;
  }
  return { score, ht: s.ht ?? null, pens: s.p ?? null, phase, winnerIdx };
};

/** Resolve W##/L## refs through the byNum map using full (et/pens) results. */
const resolveTeamRef = (ref, byNum) => {
  if (!ref || !isRef(ref)) return ref || null;
  const match = byNum.get(parseInt(ref.slice(1), 10));
  if (!match) return null;
  const t1 = resolveTeamRef(match.team1, byNum);
  const t2 = resolveTeamRef(match.team2, byNum);
  const { winnerIdx } = readScore(match);
  if (winnerIdx == null) return null;
  const winner = winnerIdx === 0 ? t1 : t2;
  const loser = winnerIdx === 0 ? t2 : t1;
  return ref[0] === "W" ? winner : loser;
};

const LIVE_WINDOW_MS = 135 * 60_000; // 90' + HT + ET + shootout margin

const matchStatus = (kickoff, winnerIdx, hasScore, isKnockout) => {
  if (hasScore && (winnerIdx != null || !isKnockout)) return "played";
  const now = Date.now();
  if (kickoff && now >= kickoff.getTime()) {
    if (hasScore || now < kickoff.getTime() + LIVE_WINDOW_MS) return "live";
  }
  return "upcoming";
};

const KNOCKOUT_ROUNDS = new Set([
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Match for third place",
  "Final",
]);

/** Enrich one raw JSON match into everything the UI needs. */
const enrichMatch = (m, byNum) => {
  const isKnockout = KNOCKOUT_ROUNDS.has(m.round);
  const name1 = isRef(m.team1) ? resolveTeamRef(m.team1, byNum) : m.team1;
  const name2 = isRef(m.team2) ? resolveTeamRef(m.team2, byNum) : m.team2;
  const kickoff = parseKickoff(m.date, m.time);
  const { score, ht, pens, phase, winnerIdx } = readScore(m);
  const status = matchStatus(kickoff, winnerIdx, !!score, isKnockout);
  // Store FT (90-min) score separately for score prediction grading
  const ftScore = m.score?.ft ?? null;
  return {
    num: m.num ?? null,
    round: m.round,
    roundLabel: ROUND_LABEL[m.round] || m.round,
    group: m.group || null,
    date: m.date,
    kickoff,
    ground: m.ground || null,
    isKnockout,
    ref1: m.team1,
    ref2: m.team2,
    team1: teamFor(name1),
    team2: teamFor(name2),
    goals1: m.goals1 || [],
    goals2: m.goals2 || [],
    score,
    ftScore, // FT (90-min) score for score prediction grading
    ht,
    pens,
    phase,
    winnerIdx,
    winner: winnerIdx == null ? null : teamFor(winnerIdx === 0 ? name1 : name2),
    status,
  };
};

const processWorldCupJson = (data) => {
  const all = data?.matches || [];
  const byNum = new Map();
  all.forEach((m) => {
    if (m.num) byNum.set(m.num, m);
  });

  const matches = all.map((m) => enrichMatch(m, byNum));
  const enrichedByNum = new Map(matches.filter((m) => m.num).map((m) => [m.num, m]));

  // Confirmed R32 field (bracket seeds). Null until the group stage settles.
  let r32Teams = [];
  for (const num of ROUNDS[0].nums) {
    const m = enrichedByNum.get(num);
    if (!m?.team1 || !m?.team2) {
      r32Teams = null;
      break;
    }
    r32Teams.push(m.team1, m.team2);
  }

  // Per-team tournament journey (group stage + knockouts), kickoff order.
  const journeys = new Map();
  const push = (team, entry) => {
    if (!team) return;
    if (!journeys.has(team.code)) journeys.set(team.code, []);
    journeys.get(team.code).push(entry);
  };
  for (const m of matches) {
    if (!m.team1 || !m.team2) continue;
    push(m.team1, { ...m, us: m.team1, them: m.team2, gf: m.score?.[0] ?? null, ga: m.score?.[1] ?? null, ourGoals: m.goals1, theirGoals: m.goals2 });
    push(m.team2, { ...m, us: m.team2, them: m.team1, gf: m.score?.[1] ?? null, ga: m.score?.[0] ?? null, ourGoals: m.goals2, theirGoals: m.goals1 });
  }
  for (const list of journeys.values()) {
    list.sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));
  }

  return { matches, byNum: enrichedByNum, r32Teams, journeys };
};

function useWorldCup() {
  const [state, setState] = useState({ matches: [], byNum: new Map(), r32Teams: null, journeys: new Map() });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(WORLDCUP_JSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState(processWorldCupJson(data));
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load scores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const refreshId = setInterval(fetchLive, POLL_EVERY_MS);
    const tickId = setInterval(() => setTick((t) => t + 1), 1000);
    const onVisible = () => document.visibilityState === "visible" && fetchLive();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(refreshId);
      clearInterval(tickId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchLive]);

  return { ...state, loading, lastUpdated, error };
}

// ----------------------------------------------------------------------------
// FORMATTING
// ----------------------------------------------------------------------------
const fmtKickoff = (d) =>
  d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const fmtTimeOnly = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const fmtMatchTime = (d) =>
  d.toDateString() === new Date().toDateString() ? fmtTimeOnly(d) : fmtKickoff(d);

/** Approximate live match minute from kickoff (accounts for HT break). */
const liveMinute = (kickoff) => {
  if (!kickoff) return "LIVE";
  const mins = Math.floor((Date.now() - kickoff.getTime()) / 60_000);
  if (mins < 0) return "0'";
  if (mins <= 45) return `${mins}'`;
  if (mins <= 60) return "HT";
  if (mins <= 106) return `${Math.min(90, mins - 16)}'`;
  return "ET";
};

const fmtCountdown = (ms) => {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const phaseLabel = (m) =>
  m.phase === "pens" ? `PENS ${m.pens[0]}–${m.pens[1]}` : m.phase === "aet" ? "AET" : "FT";

const goalMinuteVal = (g) => {
  const [base, added] = String(g.minute).split("+");
  return parseInt(base, 10) * 10 + (added ? Math.min(9, parseInt(added, 10)) : 0);
};

const flagSrc = (iso2, w = 80) => `https://flagcdn.com/w${w}/${iso2}.png`;
const flagSrcSet = (iso2) =>
  `https://flagcdn.com/w80/${iso2}.png 1x, https://flagcdn.com/w160/${iso2}.png 2x`;

// ----------------------------------------------------------------------------
// PREDICTION LOGIC
// ----------------------------------------------------------------------------
// Note: All predictions are saved to Firebase only (anonymous login mandatory)
// Local storage persistence has been removed
const SCORE_SUFFIX = "-score";
const CONNECTOR_STROKE = "rgba(100, 118, 140, 0.18)";
const CONNECTOR_STROKE_ACTIVE = "rgba(100, 118, 140, 0.32)";
const CONNECTOR_STROKE_LIT = "rgba(74, 222, 128, 0.82)";
const CONNECTOR_STROKE_WRONG = "rgba(248, 113, 113, 0.82)";

const connectorVerdictForSlot = (winners, actual, slotKey) => {
  const pickId = winners[slotKey];
  const actualId = actual[slotKey];
  if (!pickId) return null;
  if (actualId) return pickId === actualId ? "correct" : "wrong";
  return "pending";
};

const connectorStroke = (verdict, readOnly = false) => {
  if (!verdict) return CONNECTOR_STROKE;
  if (verdict === "correct") return CONNECTOR_STROKE_LIT;
  if (verdict === "wrong") return CONNECTOR_STROKE_WRONG;
  return readOnly ? CONNECTOR_STROKE_ACTIVE : CONNECTOR_STROKE_LIT;
};

const connectorWidth = (verdict) => {
  if (!verdict) return 1;
  if (verdict === "pending") return 1.5;
  return 2;
};

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

/** Get score prediction for a slot key. Returns [team1Score, team2Score] or null. */
function getScorePrediction(winners, slotKey) {
  if (!slotKey) return null;
  const scoreKey = slotKey + SCORE_SUFFIX;
  const score = winners[scoreKey];
  if (!score || !Array.isArray(score) || score.length !== 2) return null;
  return score;
}

/** Map stored score prediction onto displayed team order [sideA, sideB]. */
function mapPredictedScores(predictedScore, sideA, sideB, match) {
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
function friendScorePredictionsForMatch(friends, scoreKey, match, excludeUid) {
  if (!scoreKey || !match?.team1 || !match?.team2) return [];
  return friends
    .filter((f) => f.uid !== excludeUid && f.name)
    .map((f) => {
      const raw = getScorePrediction(f.winners, scoreKey);
      if (!raw) return null;
      const [a, b] = mapPredictedScores(raw, match.team1, match.team2, match);
      if (a == null || b == null) return null;
      return { uid: f.uid, name: f.name, display: `${a}–${b}` };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatScorePredictionDisplay(scorePrediction, match) {
  if (!scorePrediction || !match?.team1 || !match?.team2) return null;
  const [a, b] = mapPredictedScores(scorePrediction, match.team1, match.team2, match);
  if (a == null || b == null) return null;
  return `${a}–${b}`;
}

/** Set score prediction for a slot key. */
function setScorePrediction(winners, slotKey, score) {
  const scoreKey = slotKey + SCORE_SUFFIX;
  if (!score || !Array.isArray(score) || score.length !== 2 || score[0] == null || score[1] == null) {
    const next = { ...winners };
    delete next[scoreKey];
    return next;
  }
  return { ...winners, [scoreKey]: score };
}

/** Clear score predictions when teams change (cascade like winners). */
function normalizeScores(winners, teams) {
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

/** Score prediction points:
 *  - One side correct: 2 points
 *  - Both sides correct (exact score): 5 points
 */
const SCORE_ONE_SIDE_POINTS = 2;
const SCORE_EXACT_POINTS = 5;

function gradeScorePrediction(predictedScore, ftScore) {
  if (!predictedScore || !ftScore) return { scoreResult: null, scorePoints: 0 };
  const side1Correct = predictedScore[0] === ftScore[0];
  const side2Correct = predictedScore[1] === ftScore[1];
  const bothCorrect = side1Correct && side2Correct;
  const oneSideCorrect = (side1Correct || side2Correct) && !bothCorrect;
  if (bothCorrect) return { scoreResult: "exact", scorePoints: SCORE_EXACT_POINTS };
  if (oneSideCorrect) return { scoreResult: "oneside", scorePoints: SCORE_ONE_SIDE_POINTS };
  return { scoreResult: null, scorePoints: 0 };
}

/** Grade picks — points only for finished matches where the user made a pick.
 *  Score predictions on real fixtures are graded separately (2 / 5 pts).
 */
function gradeWinners(winners, actual, slotMatches) {
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
function getMatchPredictionInfo(winners, match, slotKey, isKnockout, roundPoints, teamById, byNum) {
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
  
  // Calculate points if match is played
  let pointsEarned = 0;
  let scorePointsEarned = 0;
  let winnerCorrect = false;
  let scoreResult = null; // 'exact', 'oneside', or null
  
  if (match.status === "played" && match.winner && predictedWinnerId) {
    if (predictedWinnerId === match.winner.id) {
      winnerCorrect = true;
      pointsEarned = isKnockout ? roundPoints : 1;
    }
  }

  if (match.status === "played" && predictedScore && match.ftScore) {
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

/** Small circular badge for points earned — only after match is played */
function PointsEarnedBadge({ points, isRail = false }) {
  if (!points || points <= 0) return null;

  return (
    <span
      className={[
        "points-earned-badge",
        isRail ? "points-earned-badge--rail" : "points-earned-badge--bracket",
        points >= 10 ? "points-earned-badge--wide" : "",
      ].join(" ")}
    >
      {points}
    </span>
  );
}

// ----------------------------------------------------------------------------
// SMALL HOOKS
// ----------------------------------------------------------------------------
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ----------------------------------------------------------------------------
// LOGO
// ----------------------------------------------------------------------------
function WCLogo({ className = "" }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="World Cup 26">
      <defs>
        <linearGradient id="wcRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d4a84b" />
          <stop offset="100%" stopColor="#a67c2e" />
        </linearGradient>
        <linearGradient id="wcInner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2939" />
          <stop offset="100%" stopColor="#0d1622" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="none" stroke="url(#wcRing)" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="18" fill="url(#wcInner)" stroke="rgba(242,238,230,0.08)" strokeWidth="1" />
      <g fill="#d4a84b">
        <path d="M18 14h12v5.5a6 6 0 0 1-12 0V14Z" />
        <path d="M16.5 15.2h-2.8a2.8 2.8 0 0 0 3.2 3.2l-.4-1.6a1.1 1.1 0 0 1-1.3-1.3h1.3v-.3Zm15 0h2.8a2.8 2.8 0 0 1-3.2 3.2l.4-1.6a1.1 1.1 0 0 0 1.3-1.3h-1.5v-.3Z" />
        <rect x="22.5" y="24.5" width="3" height="3.5" rx="0.5" />
        <rect x="19" y="27.5" width="10" height="2.2" rx="1.1" />
      </g>
      <text x="24" y="38.5" textAnchor="middle" fontSize="10" fill="#f2eee6" fontFamily="Bebas Neue, sans-serif" letterSpacing="1.5">
        26
      </text>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// CONNECTORS — pairs of matches merge into the next round.
// ----------------------------------------------------------------------------
function Connector({ count, side = "left", verdicts, readOnly = false }) {
  const paths = [];
  for (let i = 0; i < count; i++) {
    const y1 = i + 0.5;
    const y2 = i % 2 === 0 ? i + 1 : i;
    const d = side === "left" ? `M0,${y1} H50 V${y2} H100` : `M100,${y1} H50 V${y2} H0`;
    const verdict = verdicts?.[i] ?? null;
    paths.push(
      <path
        key={i}
        d={d}
        fill="none"
        strokeWidth={connectorWidth(verdict)}
        stroke={connectorStroke(verdict, readOnly)}
        vectorEffect="non-scaling-stroke"
        style={{ transition: "stroke 0.4s ease, stroke-width 0.4s ease" }}
      />
    );
  }
  return (
    <div className="shrink-0 self-stretch" style={{ width: 28 }}>
      <svg width="100%" height="100%" viewBox={`0 0 100 ${count}`} preserveAspectRatio="none" className="block h-full w-full">
        {paths}
      </svg>
    </div>
  );
}

/** Semi-final → final (center) + third-place (below) in one symmetric connector. */
function SFPodiumConnector({ side = "left", finalVerdict, thirdVerdict, readOnly = false }) {
  const finalY = 50;
  const thirdY = 76;
  const branchX = 42;
  const finalPath = side === "left" ? `M0,${finalY} H100` : `M100,${finalY} H0`;
  const thirdPath =
    side === "left"
      ? `M${branchX},${finalY} V${thirdY} H100`
      : `M${100 - branchX},${finalY} V${thirdY} H0`;
  const strokeProps = (verdict) => ({
    fill: "none",
    strokeWidth: connectorWidth(verdict),
    stroke: connectorStroke(verdict, readOnly),
    vectorEffect: "non-scaling-stroke",
    style: { transition: "stroke 0.4s ease, stroke-width 0.4s ease" },
  });

  return (
    <div className="bracket-sf-connector shrink-0 self-stretch">
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-full w-full">
        <path d={finalPath} {...strokeProps(finalVerdict)} />
        <path d={thirdPath} {...strokeProps(thirdVerdict)} />
      </svg>
    </div>
  );
}

// ----------------------------------------------------------------------------
// TEAM ROW — [flag] CODE [verdict] [score]
// ----------------------------------------------------------------------------
function TeamRow({ team, isPicked, isDimmed, verdict, onPick, onFlagClick, locked, readOnly, score, predictedScore, isMatchWinner, align = "left" }) {
  const empty = !team;
  const disabled = empty || locked || readOnly;
  const right = align === "right";
  const displayScore = score != null ? score : predictedScore;
  const isPredicted = score == null && predictedScore != null;

  let strip = "team-strip";
  if (right) strip += " team-strip--right";
  let text = "text-[var(--text-secondary)]";
  if (verdict === "correct") {
    strip += " team-strip--correct";
    text = "text-[var(--pitch-glow)] font-bold";
  } else if (verdict === "wrong") {
    strip += " team-strip--wrong";
    text = "text-[var(--wrong)] line-through decoration-[var(--wrong)]/60";
  } else if (verdict === "missed") {
    strip += " team-strip--missed";
    text = "text-[var(--pitch-glow)]/85 font-semibold";
  } else if (isPicked) {
    strip += " team-strip--winner";
    text = "text-[var(--text-primary)] font-bold";
  } else if (isDimmed) {
    text = "text-[var(--text-muted)]";
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onPick(team)}
      onKeyDown={(e) => !disabled && e.key === "Enter" && onPick(team)}
      title={
        empty
          ? undefined
          : readOnly
            ? "Picks are read-only"
            : locked
              ? "Both teams must be decided first"
              : `Advance ${team.name}`
      }
      className={[
        "group/row relative flex h-[22px] w-full items-center gap-1.5 rounded-sm px-1.5 transition-all duration-200",
        right ? "flex-row-reverse text-right" : "text-left",
        strip,
        empty ? "cursor-default" : locked || readOnly ? "cursor-default" : "cursor-pointer",
      ].join(" ")}
    >
      {empty ? (
        <span className="grid h-3.5 w-5.5 shrink-0 place-items-center rounded-[3px] bg-white/[0.06] text-[9px] font-bold text-[var(--text-muted)] ring-1 ring-white/10">
          ·
        </span>
      ) : (
        <img
          src={flagSrc(team.iso2)}
          srcSet={flagSrcSet(team.iso2)}
          alt=""
          width={22}
          height={14}
          loading="lazy"
          onClick={(e) => {
            e.stopPropagation();
            onFlagClick?.(team);
          }}
          title={`${team.name} — tournament journey`}
          className="h-3.5 w-5.5 shrink-0 cursor-pointer rounded-[3px] object-cover shadow-sm ring-1 ring-black/40 transition hover:scale-110 hover:ring-[var(--gold)]/60"
        />
      )}

      <span className={["min-w-0 flex-1 truncate text-[11.5px] font-bold tracking-wide", text].join(" ")}>
        {empty ? <span className="font-medium text-[var(--text-muted)]">TBD</span> : team.code}
      </span>

      <span className={["flex w-3 shrink-0 items-center text-[10.5px]", right ? "justify-start" : "justify-end"].join(" ")}>
        {verdict === "correct" ? (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[var(--pitch-glow)]">✓</motion.span>
        ) : verdict === "wrong" ? (
          <span className="text-[var(--wrong)]">✕</span>
        ) : verdict === "missed" ? (
          <span className="text-[8px] font-black uppercase text-[var(--pitch-glow)]/80">W</span>
        ) : isPicked ? (
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[var(--pitch-glow)]">✓</motion.span>
        ) : null}
      </span>

      {displayScore != null && (
        <span
          className={[
            "grid h-4 w-4.5 shrink-0 place-items-center rounded-[4px] text-[10.5px] font-extrabold tabular-nums",
            isPredicted
              ? "text-[var(--gold-bright)]"
              : isMatchWinner
                ? "bg-[color-mix(in_oklch,var(--pitch)_35%,transparent)] text-[var(--text-primary)]"
                : "bg-white/[0.07] text-[var(--text-muted)]",
          ].join(" ")}
        >
          {displayScore}
        </span>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// MATCH CARD (bracket)
// ----------------------------------------------------------------------------
function MatchCard({ slotKey, roundIdx, matchIdx, teams: [a, b], winnerId, onPick, actualId, match, highlight = null, onFlagClick, onOpenMatch, align = "left", readOnly = false, revealGrades = false, scorePrediction, predictionInfo, viewerName, isViewingOther }) {
  const ready = !!a && !!b;
  const decided = !!winnerId;

  // Attach real scores only when the on-screen pair IS the real fixture.
  const pairIsReal =
    match?.team1 && match?.team2 && a && b &&
    ((match.team1.id === a.id && match.team2.id === b.id) || (match.team1.id === b.id && match.team2.id === a.id));

  let scoreA = null;
  let scoreB = null;
  if (pairIsReal && match.score) {
    const flip = match.team1.id !== a.id;
    scoreA = flip ? match.score[1] : match.score[0];
    scoreB = flip ? match.score[0] : match.score[1];
  }

  const status = match?.status;
  const resultReady = !!actualId;
  const showVerdict = revealGrades && resultReady;
  const verdictFor = (team) => {
    if (!showVerdict || !team) return undefined;
    if (winnerId === team.id) return team.id === actualId ? "correct" : "wrong";
    if (team.id === actualId && winnerId) return "missed";
    return undefined;
  };
  const pickGrade =
    showVerdict && winnerId ? (winnerId === actualId ? "correct" : "wrong") : null;
  const actualWinnerIsA = pairIsReal && match.winner && a && match.winner.id === a.id;
  const actualWinnerIsB = pairIsReal && match.winner && b && match.winner.id === b.id;

  const showPredicted = status === "upcoming" && a && b;
  const effectivePrediction = scorePrediction ?? predictionInfo?.predictedScore ?? null;
  let predictedA = null;
  let predictedB = null;
  if (showPredicted && effectivePrediction) {
    [predictedA, predictedB] = mapPredictedScores(effectivePrediction, a, b, match);
  }

  const middle = () => {
    if (pairIsReal && status === "live")
      return (
        <span className="flex items-center gap-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-[var(--live)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="live-ping absolute h-full w-full rounded-full bg-[var(--live)]" />
            <span className="live-dot h-full w-full rounded-full bg-[var(--live)]" />
          </span>
          {liveMinute(match.kickoff)}
        </span>
      );
    if (pairIsReal && status === "played")
      return <span className="text-[8.5px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">{phaseLabel(match)}</span>;
    if (match?.kickoff)
      return <span className="text-[9px] font-semibold tabular-nums text-[var(--text-muted)]">{fmtMatchTime(match.kickoff)}</span>;
    return <span className="text-[9px] text-[var(--text-muted)]/60">—</span>;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className={[
        "match-ticket relative flex w-full shrink-0 flex-col justify-center rounded-lg p-[5px]",
        readOnly ? "match-ticket--readonly" : "",
        highlight === "live" ? "match-ticket--live" : highlight === "next" ? "match-ticket--next" : "",
        pickGrade === "correct" ? "match-ticket--graded-correct" : pickGrade === "wrong" ? "match-ticket--graded-wrong" : "",
      ].join(" ")}
    >
      {/* Points earned — only after match is played */}
      {isViewingOther && predictionInfo?.matchPlayed && predictionInfo.totalPoints > 0 && (
        <PointsEarnedBadge points={predictionInfo.totalPoints} />
      )}

      <TeamRow
        team={a}
        isPicked={decided && winnerId === a?.id}
        isDimmed={decided && winnerId !== a?.id}
        verdict={verdictFor(a)}
        onPick={(t) => onPick(roundIdx, matchIdx, t)}
        onFlagClick={onFlagClick}
        locked={!ready}
        readOnly={readOnly}
        score={scoreA}
        predictedScore={predictedA}
        isMatchWinner={revealGrades && actualWinnerIsA}
        align={align}
      />

      <button
        type="button"
        onClick={() => onOpenMatch?.(slotKey)}
        title="Match details"
        className="mx-1 flex h-[14px] items-center justify-center gap-1 rounded transition hover:bg-white/[0.06]"
      >
        {highlight === "next" && (
          <span className="rounded-full bg-[var(--next)] px-1.5 text-[7px] font-black uppercase tracking-[0.1em] text-[#04121d]">
            next
          </span>
        )}
        {middle()}
      </button>

      <TeamRow
        team={b}
        isPicked={decided && winnerId === b?.id}
        isDimmed={decided && winnerId !== b?.id}
        verdict={verdictFor(b)}
        onPick={(t) => onPick(roundIdx, matchIdx, t)}
        onFlagClick={onFlagClick}
        locked={!ready}
        readOnly={readOnly}
        score={scoreB}
        predictedScore={predictedB}
        isMatchWinner={revealGrades && actualWinnerIsB}
        align={align}
      />
    </motion.div>
  );
}

// ----------------------------------------------------------------------------
// CONFETTI
// ----------------------------------------------------------------------------
function Confetti({ fire }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.7,
        dur: 2.2 + Math.random() * 2,
        rot: Math.random() * 720,
        size: 5 + Math.random() * 8,
        color: ["#4ade80", "#f5cd6e", "#38bdf8", "#f472b6", "#f2eee6", "#d4a84b"][i % 6],
      })),
    []
  );
  return (
    <AnimatePresence>
      {fire && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {pieces.map((p) => (
            <motion.span
              key={p.id}
              initial={{ y: -40, x: `${p.x}vw`, rotate: 0, opacity: 1 }}
              animate={{ y: "110vh", rotate: p.rot + 540, opacity: [1, 1, 0.9, 0] }}
              transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }}
              style={{ position: "absolute", width: p.size, height: p.size * 0.6, background: p.color, borderRadius: 2 }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

// ----------------------------------------------------------------------------
// TROPHY / CHAMPION / PODIUM
// ----------------------------------------------------------------------------
function TrophyMark({ champion, isActual }) {
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      className="relative flex flex-col items-center gap-1.5"
    >
      <motion.div
        className="pointer-events-none absolute -inset-5 rounded-full blur-2xl"
        animate={{ opacity: champion ? [0.35, 0.65, 0.35] : [0.12, 0.28, 0.12], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(circle, rgba(245,205,110,0.5) 0%, transparent 70%)" }}
      />
      <motion.div
        className="relative text-5xl"
        animate={{ scale: champion ? [1, 1.06, 1] : [1, 1.02, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          filter: champion
            ? "drop-shadow(0 0 26px rgba(245,205,110,0.7))"
            : "grayscale(0.4) drop-shadow(0 0 14px rgba(245,205,110,0.25))",
        }}
      >
        🏆
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.div
          key={champion?.id || "empty"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex flex-col items-center gap-0.5 text-center"
        >
          {champion ? (
            <>
              <img
                src={flagSrc(champion.iso2)}
                srcSet={flagSrcSet(champion.iso2)}
                alt=""
                className="h-6 w-9 rounded-[3px] object-cover shadow ring-1 ring-black/40"
              />
              <span className="text-[7px] font-black uppercase tracking-[0.22em] text-amber-300/80">
                {isActual ? "World Champion" : "Your Champion"}
              </span>
              <span className="font-display text-base leading-tight tracking-wide text-white">{champion.name}</span>
            </>
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] leading-relaxed text-[var(--text-muted)]">
              pick your champion
            </span>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function ThirdPlaceCard({ winners, teams, onPick, actual, slotMatches, onFlagClick, onOpenMatch, liveKey, nextKey, readOnly = false, revealGrades = false }) {
  const rk = "third-0";
  const match = slotMatches[rk];
  // Real fixture teams beat the predicted ones once semis are actually played.
  const predicted = getThirdPlaceTeams(winners, teams);
  const a = match?.team1 || predicted[0];
  const b = match?.team2 || predicted[1];

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <span className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
        🥉 Third place
      </span>
      <MatchCard
        slotKey={rk}
        roundIdx="third"
        matchIdx={0}
        teams={[a, b]}
        winnerId={winners[rk]}
        onPick={onPick}
        actualId={actual[rk]}
        match={match}
        highlight={rk === liveKey ? "live" : rk === nextKey ? "next" : null}
        onFlagClick={onFlagClick}
        onOpenMatch={onOpenMatch}
        readOnly={readOnly}
        revealGrades={revealGrades}
      />
    </div>
  );
}

/** Center column: winner block above, final at vertical center, third place below. */
function PodiumColumn({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, readOnly = false, revealGrades = false, stats }) {
  const rk = key("final", 0);
  return (
    <div className="podium-column">
      <div className="podium-column__above">
        <div className="points-podium">
          <PointsPill stats={stats} />
        </div>
        <TrophyMark champion={actualChampion || champion} isActual={!!actualChampion} />
        <div className="rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-3 py-0.5 text-[8.5px] font-black uppercase tracking-[0.22em] text-[#1a1305] shadow-[0_0_18px_-4px_rgba(245,205,110,0.5)]">
          Final
        </div>
      </div>

      <div className="podium-column__final w-full max-w-[var(--match-card-w)] lg:max-w-none">
        <MatchCard
          slotKey={rk}
          roundIdx={FINAL_ROUND}
          matchIdx={0}
          teams={getMatchTeams(FINAL_ROUND, 0, winners, teams)}
          winnerId={winners[rk]}
          onPick={onPick}
          actualId={actual[rk]}
          match={slotMatches[rk]}
          highlight={rk === liveKey ? "live" : rk === nextKey ? "next" : null}
          onFlagClick={onFlagClick}
          onOpenMatch={onOpenMatch}
          readOnly={readOnly}
          revealGrades={revealGrades}
        />
      </div>

      <div className="podium-column__below w-full max-w-[var(--match-card-w)] lg:max-w-none">
        <ThirdPlaceCard
          winners={winners}
          teams={teams}
          onPick={onPick}
          actual={actual}
          slotMatches={slotMatches}
          onFlagClick={onFlagClick}
          onOpenMatch={onOpenMatch}
          liveKey={liveKey}
          nextKey={nextKey}
          readOnly={readOnly}
          revealGrades={revealGrades}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MODAL SHELL
// ----------------------------------------------------------------------------
function Modal({ open, onClose, children, maxW = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--bg-deep)]/85 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`flex max-h-[min(88vh,720px)] w-full ${maxW} flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ----------------------------------------------------------------------------
// MATCH DETAIL MODAL — everything the JSON knows about one fixture.
// ----------------------------------------------------------------------------
function GoalTimeline({ match }) {
  const rows = [
    ...match.goals1.map((g) => ({ ...g, side: 0 })),
    ...match.goals2.map((g) => ({ ...g, side: 1 })),
  ].sort((x, y) => goalMinuteVal(x) - goalMinuteVal(y));

  if (!rows.length) return null;

  return (
    <div className="relative px-4 py-3">
      <div className="absolute bottom-3 left-1/2 top-3 w-px -translate-x-1/2 bg-[var(--border-strong)]" />
      <ul className="flex flex-col gap-1.5">
        {rows.map((g, i) => (
          <motion.li
            key={`${g.name}-${g.minute}-${i}`}
            initial={{ opacity: 0, x: g.side === 0 ? -14 : 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.3 }}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
          >
            <span className={["truncate text-[12px] font-semibold text-[var(--text-secondary)]", g.side === 0 ? "text-right" : "opacity-0"].join(" ")}>
              {g.side === 0 && (
                <>
                  {g.name}
                  {g.penalty && <span className="ml-1 text-[9px] font-black text-[var(--gold-bright)]">(P)</span>}
                  {g.owngoal && <span className="ml-1 text-[9px] font-black text-[var(--wrong)]">(OG)</span>}
                </>
              )}
            </span>
            <span className="goal-minute z-10 grid min-w-9 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold text-[var(--text-primary)]">
              {g.minute}′
            </span>
            <span className={["truncate text-[12px] font-semibold text-[var(--text-secondary)]", g.side === 1 ? "text-left" : "opacity-0"].join(" ")}>
              {g.side === 1 && (
                <>
                  {g.name}
                  {g.penalty && <span className="ml-1 text-[9px] font-black text-[var(--gold-bright)]">(P)</span>}
                  {g.owngoal && <span className="ml-1 text-[9px] font-black text-[var(--wrong)]">(OG)</span>}
                </>
              )}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function MatchTeamHeader({ team, refName, won, onFlagClick }) {
  if (!team)
    return (
      <div className="flex flex-1 flex-col items-center gap-1.5">
        <div className="grid h-10 w-14 place-items-center rounded-md bg-[var(--bg-elevated)] text-sm font-black text-[var(--text-muted)] ring-1 ring-[var(--border)]">
          ?
        </div>
        <span className="text-[11px] font-semibold text-[var(--text-muted)]">
          {isRef(refName) ? (refName[0] === "W" ? `Winner M${refName.slice(1)}` : `Loser M${refName.slice(1)}`) : "TBD"}
        </span>
      </div>
    );
  return (
    <button
      type="button"
      onClick={() => onFlagClick?.(team)}
      className="group flex flex-1 flex-col items-center gap-1.5"
      title={`${team.name} — tournament journey`}
    >
      <img
        src={flagSrc(team.iso2)}
        srcSet={flagSrcSet(team.iso2)}
        alt=""
        className="h-10 w-14 rounded-md object-cover shadow-lg ring-1 ring-black/40 transition group-hover:scale-105 group-hover:ring-[var(--gold)]/50"
      />
      <span className={["text-center text-[13px] font-bold leading-tight", won ? "text-[var(--pitch-glow)]" : "text-[var(--text-primary)]"].join(" ")}>
        {team.name}
        {won && " 🏅"}
      </span>
    </button>
  );
}

function MatchPredictionsList({ others }) {
  if (!others.length) return null;
  return (
    <div className="match-predictions-list">
      <p className="match-predictions-list__title">Everyone else</p>
      <ul className="match-predictions-list__items">
        {others.map((entry) => (
          <li key={entry.uid} className="match-predictions-list__row">
            <span className="match-predictions-list__name">{entry.name}</span>
            <span className="match-predictions-list__score">{entry.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchModal({
  match,
  onClose,
  onFlagClick,
  scorePrediction,
  onSaveScorePrediction,
  slotKey,
  friends = [],
  selfUid,
}) {
  const otherPredictions = useMemo(
    () => (match ? friendScorePredictionsForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );

  const [scoreA, setScoreA] = useState(scorePrediction?.[0] ?? "");
  const [scoreB, setScoreB] = useState(scorePrediction?.[1] ?? "");
  const [toast, setToast] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setScoreA(scorePrediction?.[0] ?? "");
    setScoreB(scorePrediction?.[1] ?? "");
  }, [scorePrediction]);

  if (!match) return null;

  const played = match.status === "played";
  const live = match.status === "live";
  const upcoming = match.status === "upcoming";
  const canEditScore = upcoming && !!onSaveScorePrediction;

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleSaveScore = async () => {
    const sA = parseInt(scoreA, 10);
    const sB = parseInt(scoreB, 10);
    if (!isNaN(sA) && !isNaN(sB) && sA >= 0 && sB >= 0) {
      const ok = await onSaveScorePrediction?.([sA, sB]);
      if (ok) showToast(`Score prediction saved: ${sA}–${sB}`);
      else showToast("Could not save prediction.", "error");
    }
  };

  const handleClearClick = () => {
    if (hasScorePrediction) {
      setShowClearConfirm(true);
    } else {
      // No prediction to clear, just reset inputs
      setScoreA("");
      setScoreB("");
    }
  };

  const handleClearConfirm = async () => {
    setScoreA("");
    setScoreB("");
    const ok = await onSaveScorePrediction?.(null);
    if (ok) showToast("Score prediction cleared");
    else showToast("Could not clear prediction.", "error");
    setShowClearConfirm(false);
  };

  const hasScorePrediction = scorePrediction != null;
  const yourScoreDisplay = formatScorePredictionDisplay(scorePrediction, match);
  const actualFtScore = match.ftScore ?? match.score;
  const actualScoreDisplay = actualFtScore ? `${actualFtScore[0]}–${actualFtScore[1]}` : null;
  const teamsConfirmed = match.team1 && match.team2 && !isRef(match.ref1) && !isRef(match.ref2);
  const resultLabel =
    match.phase === "aet" || match.phase === "pens" ? "Final score (90 min)" : "Final score";

  return (
    <Modal open={!!match} onClose={onClose}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--gold-bright)] ring-1 ring-[var(--gold)]/30">
            {match.group || match.roundLabel}
          </span>
          {match.num && <span className="text-[10px] font-bold text-[var(--text-muted)]">Match {match.num}</span>}
        </div>
        <button type="button" onClick={onClose} className="btn-ghost grid h-7 w-7 place-items-center rounded-lg text-xs" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="nice-scroll relative flex-1 overflow-y-auto">
        <div className="flex items-start justify-center gap-3 px-4 pb-2 pt-5">
          <MatchTeamHeader team={match.team1} refName={match.ref1} won={played && match.winnerIdx === 0} onFlagClick={onFlagClick} />
          <div className="flex w-28 shrink-0 flex-col items-center pt-1">
            {match.score ? (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-4xl tracking-widest text-[var(--text-primary)]"
              >
                {match.score[0]}–{match.score[1]}
              </motion.div>
            ) : yourScoreDisplay && !played ? (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-4xl tracking-widest text-[var(--gold-bright)]"
              >
                {yourScoreDisplay}
              </motion.div>
            ) : (
              <div className="font-display text-3xl tracking-widest text-[var(--text-muted)]">vs</div>
            )}
            {live && (
              <span className="mt-0.5 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[var(--live)]">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
                {liveMinute(match.kickoff)}
              </span>
            )}
            {played && (
              <span className="mt-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {match.phase === "aet" ? "After extra time" : match.phase === "pens" ? "Penalties" : "Full time"}
              </span>
            )}
            {match.pens && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-1 rounded-full bg-[var(--gold)]/15 px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--gold-bright)] ring-1 ring-[var(--gold)]/30"
              >
                {match.pens[0]}–{match.pens[1]} pens
              </motion.span>
            )}
            {match.ht && (
              <span className="mt-1 text-[10px] font-semibold text-[var(--text-muted)]">
                HT {match.ht[0]}–{match.ht[1]}
              </span>
            )}
            {upcoming && match.kickoff && <Countdown to={match.kickoff} />}
          </div>
          <MatchTeamHeader team={match.team2} refName={match.ref2} won={played && match.winnerIdx === 1} onFlagClick={onFlagClick} />
        </div>

        <GoalTimeline match={match} />

        <div className="mx-4 mb-4 mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-xl bg-[var(--bg-mid)] px-3 py-2.5 text-[11px] font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)]">
          {match.kickoff && <span>🗓 {fmtKickoff(match.kickoff)}</span>}
          {match.ground && <span>🏟 {match.ground}</span>}
        </div>

        {(played || live) && teamsConfirmed && (
          <div className="mx-4 mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/50 p-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Your prediction
                </span>
                <span
                  className={[
                    "font-display text-2xl tracking-widest",
                    yourScoreDisplay ? "text-[var(--gold-bright)]" : "text-[var(--text-muted)]",
                  ].join(" ")}
                >
                  {yourScoreDisplay ?? "—"}
                </span>
              </div>
              <MatchPredictionsList others={otherPredictions} />
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  {resultLabel}
                </span>
                <span className="font-display text-2xl tracking-widest text-[var(--text-primary)]">
                  {actualScoreDisplay ?? "—"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Your score prediction — always editable before kickoff */}
        {upcoming && canEditScore && teamsConfirmed && (
          <div className="mx-4 mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/50 p-4">
            <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--gold-bright)]">
              Your prediction
            </p>
            <div className="mb-3 flex items-center justify-center gap-3">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-[var(--text-muted)]">{match.team1?.code ?? "TBD"}</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  className="h-12 w-14 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-center font-display text-xl text-[var(--text-primary)] focus:border-[var(--gold)] focus:outline-none"
                  placeholder="0"
                />
              </div>
              <span className="mt-4 text-lg font-bold text-[var(--text-muted)]">–</span>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-[var(--text-muted)]">{match.team2?.code ?? "TBD"}</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  className="h-12 w-14 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-center font-display text-xl text-[var(--text-primary)] focus:border-[var(--gold)] focus:outline-none"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClearClick}
                className="flex-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--border-strong)]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSaveScore}
                className="flex-[2] rounded-lg bg-[var(--gold)]/20 px-3 py-2 text-xs font-bold text-[var(--gold-bright)] ring-1 ring-[var(--gold)]/40 transition hover:bg-[var(--gold)]/30"
              >
                Save Prediction
              </button>
            </div>
            <p className="mt-2 text-center text-[9px] leading-relaxed text-[var(--text-muted)]">
              Predict the full-time score for this match · one side correct{" "}
              <span className="font-bold text-[var(--gold-bright)]">+2 pts</span>
              {" · "}
              exact score <span className="font-bold text-[var(--gold-bright)]">+5 pts</span>
            </p>
            <MatchPredictionsList others={otherPredictions} />
          </div>
        )}

        {/* Clear Confirmation Dialog */}
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--bg-deep)]/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-xs rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 shadow-2xl"
            >
              <p className="mb-1 text-center text-sm font-semibold text-[var(--text-primary)]">
                Clear Prediction?
              </p>
              <p className="mb-4 text-center text-xs text-[var(--text-muted)]">
                This will remove your score prediction for this match.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--border-strong)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearConfirm}
                  className="flex-1 rounded-lg bg-[var(--wrong)]/15 px-3 py-2 text-xs font-bold text-[var(--wrong)] ring-1 ring-[var(--wrong)]/40 transition hover:bg-[var(--wrong)]/25"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Toast Notification */}
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2"
          >
            <div className={[
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg",
              toast.type === "success" ? "bg-[var(--pitch)] text-white" : "bg-[var(--wrong)] text-white"
            ].join(" ")}>
              {toast.type === "success" ? "✓" : "✕"}
              {toast.message}
            </div>
          </motion.div>
        )}
      </div>
    </Modal>
  );
}

function Countdown({ to }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="mt-1 rounded-full bg-[var(--next)]/12 px-2.5 py-0.5 text-[11px] font-extrabold tabular-nums text-[var(--next)] ring-1 ring-[var(--next)]/30">
      ⏱ {fmtCountdown(to.getTime() - Date.now())}
    </span>
  );
}

// ----------------------------------------------------------------------------
// TEAM JOURNEY MODAL — master-detail: fixture list + inline match detail.
// ----------------------------------------------------------------------------
function journeyResult(entry) {
  const scored = entry.gf != null;
  if (!scored) {
    if (entry.status === "live") return "live";
    if (entry.status === "upcoming") return "upcoming";
    return "tbd";
  }
  const wonPens = entry.pens && entry.winner?.id === entry.us.id;
  const lostPens = entry.pens && entry.winner && entry.winner.id !== entry.us.id;
  if (entry.gf > entry.ga || wonPens) return "win";
  if (entry.gf < entry.ga || lostPens) return "loss";
  return "draw";
}

const JOURNEY_RESULT_LABEL = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  live: "Live",
  upcoming: "Upcoming",
  tbd: "TBD",
};

const goalMatchPhase = (g) => {
  const base = parseInt(String(g.minute).split("+")[0], 10);
  if (!Number.isNaN(base) && base > 90) return "aet";
  return "ft";
};

function buildJourneyTimeline(entry, team) {
  const rows = [
    ...(entry.ourGoals || []).map((g) => ({ ...g, side: "us", code: team.code })),
    ...(entry.theirGoals || []).map((g) => ({ ...g, side: "them", code: entry.them.code })),
  ].sort((a, b) => goalMinuteVal(a) - goalMinuteVal(b));

  const ft = [];
  const aet = [];
  for (const g of rows) {
    (goalMatchPhase(g) === "aet" ? aet : ft).push(g);
  }

  const usIsTeam1 = entry.us?.id === entry.team1?.id;
  const pensScore = entry.pens
    ? {
        us: usIsTeam1 ? entry.pens[0] : entry.pens[1],
        them: usIsTeam1 ? entry.pens[1] : entry.pens[0],
      }
    : null;

  return { ft, aet, pensScore };
}

function JourneyGoalCell({ goal, align }) {
  if (!goal) return null;
  return (
    <span className={["journey-timeline__goal", `journey-timeline__goal--${align}`].join(" ")}>
      <span className="journey-timeline__scorer">{goal.name}</span>
      {goal.penalty && <span className="journey-goal__tag">PEN</span>}
      {goal.owngoal && <span className="journey-goal__tag journey-goal__tag--og">OG</span>}
    </span>
  );
}

function JourneyTwoSidedRow({ goal }) {
  const isUs = goal.side === "us";
  return (
    <li className="journey-timeline__row">
      <span className="journey-timeline__side journey-timeline__side--left">
        {isUs ? <JourneyGoalCell goal={goal} align="right" /> : null}
      </span>
      <span className="journey-timeline__minute">{goal.minute}′</span>
      <span className="journey-timeline__side journey-timeline__side--right">
        {!isUs ? <JourneyGoalCell goal={goal} align="left" /> : null}
      </span>
    </li>
  );
}

function JourneyTimelineSection({ shortLabel, goals, emptyLabel, pensScore, team, opponent }) {
  const hasGoals = goals.length > 0;
  const hasPens = pensScore != null;
  if (!hasGoals && !hasPens && !emptyLabel) return null;

  return (
    <div className="journey-timeline__section">
      <div className="journey-timeline__header">
        <span className="journey-timeline__header-line" aria-hidden />
        <span className="journey-timeline__header-label">{shortLabel}</span>
        <span className="journey-timeline__header-line" aria-hidden />
      </div>

      <div className="journey-timeline__track">
        <div className="journey-timeline__spine" aria-hidden />

        {hasGoals ? (
          <ul className="journey-timeline__list">
            {goals.map((g, i) => (
              <JourneyTwoSidedRow key={`${g.name}-${g.minute}-${g.code}-${i}`} goal={g} />
            ))}
          </ul>
        ) : emptyLabel ? (
          <p className="journey-timeline__empty">{emptyLabel}</p>
        ) : null}

        {hasPens && (
          <div className="journey-timeline__pens-row">
            <span className="journey-timeline__side journey-timeline__side--left">
              <span className="journey-timeline__pens-side journey-timeline__pens-side--us">
                {pensScore.us}
              </span>
            </span>
            <span className="journey-timeline__minute journey-timeline__minute--pens">PENS</span>
            <span className="journey-timeline__side journey-timeline__side--right">
              <span className="journey-timeline__pens-side journey-timeline__pens-side--them">
                {pensScore.them}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function JourneyGoalTimeline({ entry, team }) {
  const { ft, aet, pensScore } = buildJourneyTimeline(entry, team);
  const showAet = aet.length > 0 || entry.phase === "aet" || entry.phase === "pens";
  const hasAny = ft.length > 0 || aet.length > 0 || pensScore != null;

  if (!hasAny) {
    return <p className="journey-timeline__none">No goals recorded.</p>;
  }

  return (
    <div className="journey-timeline">
      <JourneyTimelineSection
        shortLabel="FT"
        goals={ft}
        emptyLabel={ft.length === 0 ? "No goals in regulation" : null}
        team={team}
        opponent={entry.them}
      />
      {showAet && (
        <JourneyTimelineSection
          shortLabel="AET"
          goals={aet}
          emptyLabel={aet.length === 0 ? "No goals in extra time" : null}
          team={team}
          opponent={entry.them}
        />
      )}
      {pensScore != null && (
        <JourneyTimelineSection
          shortLabel="PENS"
          goals={[]}
          pensScore={pensScore}
          team={team}
          opponent={entry.them}
        />
      )}
    </div>
  );
}

function JourneyMatchDetail({ entry, team, onOpenMatch }) {
  const result = journeyResult(entry);
  const scored = entry.gf != null;
  const played = entry.status === "played";
  const live = entry.status === "live";
  const upcoming = entry.status === "upcoming";

  return (
    <div className="journey-detail">
      <div className="journey-detail__meta">
        <span className="journey-detail__round">{entry.group || entry.roundLabel}</span>
        {entry.num && <span className="journey-detail__match-num">Match {entry.num}</span>}
        {entry.kickoff && <span className="journey-detail__when">{fmtKickoff(entry.kickoff)}</span>}
      </div>

      <div className="journey-detail__scoreboard">
        <div className="journey-detail__team journey-detail__team--us">
          <img src={flagSrc(team.iso2)} alt="" className="journey-detail__flag" />
          <span className="journey-detail__team-name">{team.name}</span>
          <span className="journey-detail__team-code">{team.code}</span>
        </div>

        <div className="journey-detail__center">
          {scored ? (
            <span className="journey-detail__score">
              {entry.gf}
              <span className="journey-detail__score-sep">–</span>
              {entry.ga}
            </span>
          ) : (
            <span className="journey-detail__vs">vs</span>
          )}

          {live && (
            <span className="journey-detail__badge journey-detail__badge--live">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
              {liveMinute(entry.kickoff)}
            </span>
          )}
          {played && (
            <span className="journey-detail__badge">
              {entry.phase === "aet" ? "After extra time" : entry.phase === "pens" ? "Penalties" : "Full time"}
            </span>
          )}
          {entry.pens && (
            <span className="journey-detail__badge journey-detail__badge--pens">
              Pens {entry.pens[0]}–{entry.pens[1]}
            </span>
          )}
          {entry.ht && (
            <span className="journey-detail__badge journey-detail__badge--muted">
              HT {entry.ht[0]}–{entry.ht[1]}
            </span>
          )}
          {upcoming && entry.kickoff && <Countdown to={entry.kickoff} />}
        </div>

        <div className="journey-detail__team journey-detail__team--them">
          <img src={flagSrc(entry.them.iso2)} alt="" className="journey-detail__flag" />
          <span className="journey-detail__team-name">{entry.them.name}</span>
          <span className="journey-detail__team-code">{entry.them.code}</span>
        </div>
      </div>

      <div className="journey-detail__result">
        <span className={["journey-result-pill", `journey-result-pill--${result}`].join(" ")}>
          {JOURNEY_RESULT_LABEL[result]}
        </span>
      </div>

      {(played || live) && (
        <div className="journey-detail__timeline-wrap">
          <p className="journey-detail__timeline-title">Goal timeline</p>
          <JourneyGoalTimeline entry={entry} team={team} />
        </div>
      )}

      <div className="journey-detail__footer">
        {entry.ground && <span>🏟 {entry.ground}</span>}
        {onOpenMatch && entry.num && (
          <button type="button" onClick={() => onOpenMatch(entry)} className="journey-detail__link">
            Open full match view →
          </button>
        )}
      </div>
    </div>
  );
}

function JourneyListItem({ entry, selected, onSelect }) {
  const result = journeyResult(entry);
  const scored = entry.gf != null;
  const live = entry.status === "live";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-selected={selected}
        className={["journey-item", selected ? "journey-item--selected" : "", `journey-item--${result}`].join(" ")}
      >
        <div className="journey-item__top">
          <span className="journey-item__round">{entry.group || entry.roundLabel}</span>
          <span className={["journey-result-pill journey-result-pill--sm", `journey-result-pill--${result}`].join(" ")}>
            {JOURNEY_RESULT_LABEL[result]}
          </span>
        </div>
        <div className="journey-item__main">
          <img src={flagSrc(entry.them.iso2)} alt="" className="journey-item__flag" />
          <div className="journey-item__body">
            <span className="journey-item__opponent">vs {entry.them.name}</span>
            {entry.kickoff && (
              <span className="journey-item__date">{fmtKickoff(entry.kickoff)}</span>
            )}
          </div>
          {scored ? (
            <span className="journey-item__score">{entry.gf}–{entry.ga}</span>
          ) : live ? (
            <span className="journey-item__score journey-item__score--live">LIVE</span>
          ) : entry.kickoff ? (
            <span className="journey-item__score journey-item__score--time">{fmtTimeOnly(entry.kickoff)}</span>
          ) : (
            <span className="journey-item__score journey-item__score--muted">—</span>
          )}
        </div>
      </button>
    </li>
  );
}

function TeamModal({ team, journey, onClose, onOpenMatch }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!team || journey.length === 0) {
      setSelectedIdx(0);
      return;
    }
    let idx = journey.findLastIndex((m) => m.gf != null);
    if (idx < 0) idx = journey.findIndex((m) => m.status === "live");
    if (idx < 0) idx = journey.findIndex((m) => m.status === "upcoming");
    setSelectedIdx(idx >= 0 ? idx : 0);
  }, [team?.code, journey.length]);

  if (!team) return null;

  const playedGames = journey.filter((m) => m.gf != null);
  const wins = playedGames.filter((m) => journeyResult(m) === "win").length;
  const draws = playedGames.filter((m) => journeyResult(m) === "draw").length;
  const losses = playedGames.filter((m) => journeyResult(m) === "loss").length;
  const gf = playedGames.reduce((s, m) => s + m.gf, 0);
  const ga = playedGames.reduce((s, m) => s + m.ga, 0);
  const selected = journey[selectedIdx] ?? null;

  return (
    <Modal open={!!team} onClose={onClose} maxW="max-w-4xl">
      <div className="journey-header">
        <img src={flagSrc(team.iso2)} srcSet={flagSrcSet(team.iso2)} alt="" className="journey-header__flag" />
        <div className="journey-header__body">
          <h2 className="journey-header__title">{team.name}</h2>
          <p className="journey-header__code">{team.code} · Tournament run</p>
          {playedGames.length > 0 && (
            <p className="journey-header__record">
              <span className="journey-header__w">{wins}W</span>
              <span>{draws}D</span>
              <span className="journey-header__l">{losses}L</span>
              <span className="journey-header__sep">·</span>
              <span>{gf} scored · {ga} conceded</span>
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="btn-ghost journey-header__close" aria-label="Close">
          ✕
        </button>
      </div>

      {journey.length === 0 ? (
        <p className="journey-empty">No matches found for this team.</p>
      ) : (
        <div className="journey-shell">
          <aside className="journey-master">
            <p className="journey-master__label">Fixtures · {journey.length}</p>
            <ul className="journey-master__list nice-scroll">
              {journey.map((m, i) => (
                <JourneyListItem
                  key={`${m.num ?? m.date}-${m.them?.code}-${i}`}
                  entry={m}
                  selected={i === selectedIdx}
                  onSelect={() => setSelectedIdx(i)}
                />
              ))}
            </ul>
          </aside>

          <section className="journey-detail-pane nice-scroll" aria-label="Match detail">
            {selected ? (
              <JourneyMatchDetail entry={selected} team={team} onOpenMatch={onOpenMatch} />
            ) : (
              <p className="journey-empty">Select a fixture to view details.</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// PREDICTIONS RAIL — compact games cards at the bottom.
// ----------------------------------------------------------------------------
function RailTeamRow({ team, refName, score, predictedScore, isWinner, isPick, pickVerdict, onClick, canPick }) {
  // Show predicted score if no actual score and prediction exists
  const displayScore = score != null ? score : predictedScore;
  const isPredicted = score == null && predictedScore != null;

  return (
    <div
      onClick={onClick}
      className={[
        "rail-row",
        isPick ? "rail-row--pick" : "",
        pickVerdict === "correct" ? "rail-row--correct" : "",
        pickVerdict === "wrong" ? "rail-row--wrong" : "",
        canPick && team ? "rail-row--pickable" : "",
      ].join(" ")}
    >
      {team ? (
        <img src={flagSrc(team.iso2, 40)} alt="" className="rail-row__flag" />
      ) : (
        <span className="rail-row__flag rail-row__flag--empty">·</span>
      )}
      <span
        className={[
          "rail-row__code",
          isWinner ? "rail-row__code--winner" : team ? "" : "rail-row__code--tbd",
        ].join(" ")}
      >
        {team ? team.code : isRef(refName) ? `${refName[0] === "W" ? "W" : "L"}·M${refName.slice(1)}` : "TBD"}
      </span>
      <span className={[
        "rail-row__score",
        isWinner ? "rail-row__score--winner" : "",
        isPredicted ? "rail-row__score--predicted" : ""
      ].join(" ")}>
        {displayScore != null ? displayScore : ""}
      </span>
    </div>
  );
}

function RailCard({ match, isLive, isNext, pickTeam, actualTeam, revealGrades, onClick, index, isKnockout, onPickWinner, canPick, scorePrediction, predictionInfo, viewerName, isViewingOther }) {
  const played = match.status === "played";
  const upcoming = match.status === "upcoming";
  const showWinnerPick = !isKnockout;
  const pickId = showWinnerPick ? (pickTeam?.id ?? null) : null;
  const actualId = showWinnerPick ? (actualTeam?.id ?? null) : null;
  const pickOn1 = !!pickId && match.team1?.id === pickId;
  const pickOn2 = !!pickId && match.team2?.id === pickId;

  let pickVerdict;
  if (revealGrades && played && pickId && actualId) {
    pickVerdict = pickId === actualId ? "correct" : "wrong";
  }

  // For non-knockout games (base/group stage), allow picking a winner
  // Knockout games (R32 onwards) predictions come from bracket only
  const handlePick = (team) => {
    if (isKnockout || !onPickWinner || !upcoming) return;
    onPickWinner(team.id);
  };

  const effectiveScore = scorePrediction ?? predictionInfo?.predictedScore ?? null;

  const footer = () => {
    if (isLive)
      return (
        <span className="rail-card__status rail-card__status--live">
          <span className="relative flex h-1.5 w-1.5">
            <span className="live-ping absolute h-full w-full rounded-full bg-[var(--live)]" />
            <span className="live-dot h-full w-full rounded-full bg-[var(--live)]" />
          </span>
          Live {liveMinute(match.kickoff)}
        </span>
      );
    if (played)
      return <span className="rail-card__status">{phaseLabel(match)}</span>;
    if (isNext && match.kickoff)
      return (
        <span className="rail-card__status rail-card__status--next">
          in {fmtCountdown(match.kickoff.getTime() - Date.now())}
        </span>
      );
    return (
      <span className="rail-card__status">
        {match.kickoff ? fmtTimeOnly(match.kickoff) : "TBD"}
      </span>
    );
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.35), duration: 0.25 }}
      whileTap={{ scale: 0.97 }}
      title={showWinnerPick && pickTeam ? `Your pick: ${pickTeam.name}` : undefined}
      className={[
        "rail-card rail-card--compact snap-start relative",
        upcoming && !isLive ? "rail-card--upcoming" : "",
        isLive ? "rail-card--live" : isNext ? "rail-card--next" : "",
        pickVerdict === "correct" ? "rail-card--correct" : "",
        pickVerdict === "wrong" ? "rail-card--wrong" : "",
      ].join(" ")}
    >
      {/* Points earned — score prediction only on rail (bracket points show on bracket cards) */}
      {isViewingOther && predictionInfo?.matchPlayed && predictionInfo.scorePointsEarned > 0 && (
        <PointsEarnedBadge points={predictionInfo.scorePointsEarned} isRail />
      )}

      <div className="rail-card__head">
        <span
          className={[
            "rail-card__round",
            isLive ? "rail-card__round--live" : isNext ? "rail-card__round--next" : "",
          ].join(" ")}
        >
          {ROUND_SHORT[match.round] || match.roundLabel}
        </span>
        {footer()}
      </div>

      <RailTeamRow
        team={match.team1}
        refName={match.ref1}
        score={match.score?.[0]}
        predictedScore={upcoming && effectiveScore ? effectiveScore[0] : null}
        isWinner={match.winnerIdx === 0}
        isPick={pickOn1}
        pickVerdict={pickOn1 ? pickVerdict : undefined}
        onClick={!isKnockout && match.team1 ? () => handlePick(match.team1) : undefined}
        canPick={!isKnockout && canPick && upcoming}
      />
      <RailTeamRow
        team={match.team2}
        refName={match.ref2}
        score={match.score?.[1]}
        predictedScore={upcoming && effectiveScore ? effectiveScore[1] : null}
        isWinner={match.winnerIdx === 1}
        isPick={pickOn2}
        pickVerdict={pickOn2 ? pickVerdict : undefined}
        onClick={!isKnockout && match.team2 ? () => handlePick(match.team2) : undefined}
        canPick={!isKnockout && canPick && upcoming}
      />
    </motion.button>
  );
}

function PredictionsRail({ matches, liveNums, nextNum, numToSlot, winners, actual, teams, revealGrades, onOpenMatch, canEdit, onPickRailWinner, byNum, isViewingOther, viewerName, roundPoints }) {
  const scrollRef = useRef(null);
  const anchorRef = useRef(null);
  const anchored = useRef(false);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const RAIL_SCROLL_CARDS = 3;

  const updateRailScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateRailScrollState();
    el.addEventListener("scroll", updateRailScrollState, { passive: true });
    const ro = new ResizeObserver(updateRailScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateRailScrollState);
      ro.disconnect();
    };
  }, [matches, updateRailScrollState]);

  useEffect(() => {
    if (anchored.current || !anchorRef.current || !scrollRef.current) return;
    const el = anchorRef.current;
    scrollRef.current.scrollLeft = el.offsetLeft - scrollRef.current.clientWidth / 2 + el.clientWidth / 2;
    anchored.current = true;
    updateRailScrollState();
  }, [matches, updateRailScrollState]);

  const scrollRail = useCallback((direction) => {
    const container = scrollRef.current;
    if (!container) return;
    const firstCard = container.querySelector("[data-rail-card]");
    if (!firstCard) return;
    const gap = parseFloat(getComputedStyle(container).columnGap || getComputedStyle(container).gap) || 0;
    const step = (firstCard.getBoundingClientRect().width + gap) * RAIL_SCROLL_CARDS;
    container.scrollBy({ left: direction * step, behavior: "smooth" });
  }, []);

  const anchorNum = liveNums[0] ?? nextNum;
  let lastDate = null;

  return (
    <div className="prediction-rail">
      <button
        type="button"
        className="prediction-rail__nav"
        aria-label="Previous matches"
        disabled={!canScrollLeft}
        onClick={() => scrollRail(-1)}
      >
        ‹
      </button>
      <div ref={scrollRef} className="prediction-rail__scroll ticker-scroll edge-fade-x snap-x">
        {matches.map((m, i) => {
          const dayChip =
            m.date !== lastDate && m.kickoff ? (
              <div key={`day-${m.date}`} className="rail-day-chip">
                <span>{fmtDay(m.kickoff)}</span>
              </div>
            ) : null;
          lastDate = m.date;

          const isKnockout = m.isKnockout;
          const slotKey = numToSlot.get(m.num);
          // For non-knockout games, use rail- prefix
          const railKey = `rail-${m.num}`;
          const pickId = isKnockout
            ? (slotKey ? winners[slotKey] : null)
            : winners[railKey];
          const actualId = isKnockout
            ? (slotKey ? actual[slotKey] : null)
            : (m.status === "played" && m.winner ? m.winner.id : null);
          const scorePrediction = isKnockout
            ? (slotKey ? getScorePrediction(winners, slotKey) : null)
            : getScorePrediction(winners, railKey);

          // Calculate prediction info for viewing others
          const predictionInfo = isViewingOther ? getMatchPredictionInfo(
            winners,
            m,
            slotKey,
            isKnockout,
            isKnockout ? (roundPoints?.[slotKey] || 1) : 1,
            teamById,
            byNum
          ) : null;

          return (
            <React.Fragment key={m.num}>
              {dayChip}
              <div ref={m.num === anchorNum ? anchorRef : undefined} className="shrink-0" data-rail-card>
                <RailCard
                  match={m}
                  index={i}
                  pickTeam={pickId ? teamById.get(pickId) ?? null : null}
                  actualTeam={actualId ? teamById.get(actualId) ?? null : null}
                  isLive={liveNums.includes(m.num)}
                  isNext={m.num === nextNum}
                  revealGrades={revealGrades}
                  onClick={() => onOpenMatch(m)}
                  isKnockout={isKnockout}
                  onPickWinner={!isKnockout ? (teamId) => onPickRailWinner?.(m.num, teamId, isKnockout) : undefined}
                  canPick={canEdit && !isKnockout}
                  scorePrediction={scorePrediction}
                  predictionInfo={predictionInfo}
                  viewerName={viewerName}
                  isViewingOther={isViewingOther}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <button
        type="button"
        className="prediction-rail__nav"
        aria-label="Next matches"
        disabled={!canScrollRight}
        onClick={() => scrollRail(1)}
      >
        ›
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// HEADER ICONS + TOOLBAR
// ----------------------------------------------------------------------------
function IconUsers({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconLock({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconReset({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function IconUser({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChevronDown({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ViewingAsPicker({ name, isLocked, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="viewing-as-picker disabled:cursor-not-allowed disabled:opacity-50"
      title="Tap to switch whose bracket you are viewing"
    >
      <span className="viewing-as-picker__label">Viewing as</span>
      <span className="viewing-as-picker__row">
        <span className="viewing-as-picker__name">{name}</span>
        <span className={["viewing-as-picker__status", isLocked ? "viewing-as-picker__status--locked" : "viewing-as-picker__status--open"].join(" ")}>
          {isLocked ? (
            <>
              <IconLock />
              Locked
            </>
          ) : (
            <>Open</>
          )}
        </span>
        <IconChevronDown className="viewing-as-picker__chevron" />
      </span>
    </button>
  );
}

function HeaderToolbar({ isViewingSelf, locked, canLock, lockTooltip, onOpenLock, onReset }) {
  if (!isViewingSelf) return null;

  return (
    <div className="header-toolbar">
      {locked ? (
        <span className="header-locked" title="Your picks are locked">
          <IconLock />
          <span className="hidden sm:inline">Locked</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={onOpenLock}
          disabled={!canLock}
          className="header-action header-action--lock w-8 px-0 sm:w-auto sm:px-3 disabled:cursor-not-allowed disabled:opacity-45"
          title={lockTooltip}
        >
          <IconLock />
          <span className="hidden sm:inline">Lock</span>
        </button>
      )}
      {!locked && (
        <button
          type="button"
          onClick={onReset}
          className="header-action header-action--reset w-8 px-0 sm:w-auto sm:px-3"
          title="Clear all predictions"
        >
          <IconReset />
          <span className="hidden sm:inline">Reset</span>
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// POINTS PILL — centered above the final column + compact popover.
// ----------------------------------------------------------------------------
function PointsPill({ stats }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  // Use totalPoints (includes score prediction points) instead of just points
  const totalPoints = useCountUp(stats.totalPoints ?? stats.points);
  const rounds = [...ROUNDS, THIRD_PLACE];
  const hasScorePoints = (stats.scorePoints ?? 0) > 0;
  const scoreOneSide = stats.scoreOneSide ?? 0;
  const scoreExact = stats.scoreExact ?? 0;
  const scorePoints = stats.scorePoints ?? 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="points-pill"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Tap for points breakdown"
      >
        <span className="points-pill__label">Points:</span>
        <span className="points-pill__value">{totalPoints}</span>
        {hasScorePoints && (
          <span className="ml-1 rounded-full bg-[var(--gold)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--gold-bright)]">
            +{scorePoints}
          </span>
        )}
        {(stats.railScoreOneSide > 0 || stats.railScoreExact > 0) && (
          <span className="ml-1 rounded-full bg-[var(--pitch-glow)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--pitch-glow)]">
            R+{stats.railScorePoints ?? 0}
          </span>
        )}
        <IconChevronDown className={["points-pill__chevron", open ? "rotate-180" : ""].join(" ")} />
      </button>

      {open && (
        <div className="points-popover points-popover--compact" role="dialog" aria-label="Points breakdown">
          <p className="points-popover__hint">Finished matches only · later rounds worth more</p>
          <ul className="points-popover__list">
            {rounds.map((r) => {
              const s = stats.byRound[r.key] ?? { correct: 0, total: 0, played: 0, scoreOneSide: 0, scoreExact: 0, scorePoints: 0 };
              const earned = s.correct * r.points;
              const roundScorePoints = s.scorePoints ?? 0;
              const totalRoundPoints = earned + roundScorePoints;
              return (
                <li key={r.key} className="points-popover__row">
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-bold text-[var(--text-primary)]">{r.short}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">{r.points}pt · {s.played}/{r.matches ?? 1} done</div>
                  </div>
                  <div className="text-right">
                    <div className={["text-[10px] font-black tabular-nums", s.total > 0 && s.correct === s.total ? "text-[var(--pitch-glow)]" : "text-[var(--text-muted)]"].join(" ")}>
                      {s.total > 0 ? `${s.correct}/${s.total}` : "—"}
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-display text-sm leading-none tracking-wider text-[var(--gold-bright)]">{earned}</span>
                      {(s.scoreOneSide > 0 || s.scoreExact > 0) && (
                        <div className="flex gap-1">
                          {s.scoreOneSide > 0 && (
                            <span className="rounded-full bg-[var(--gold)]/10 px-1 py-0.5 text-[7px] font-bold text-[var(--gold-bright)]/70">
                              1S:{s.scoreOneSide}
                            </span>
                          )}
                          {s.scoreExact > 0 && (
                            <span className="rounded-full bg-[var(--gold)]/20 px-1 py-0.5 text-[7px] font-bold text-[var(--gold-bright)]">
                              Ex:{s.scoreExact}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="points-popover__total">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)]">Base</span>
                <span className="font-display text-base leading-none tracking-wider text-[var(--text-muted)]">{stats.points}</span>
              </div>
              {hasScorePoints && (
                <>
                  {scoreOneSide > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--gold-bright)]/70">1 Side ({scoreOneSide})</span>
                      <span className="font-display text-sm leading-none tracking-wider text-[var(--gold-bright)]/70">+{scoreOneSide * 2}</span>
                    </div>
                  )}
                  {scoreExact > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--gold-bright)]">Exact ({scoreExact})</span>
                      <span className="font-display text-sm leading-none tracking-wider text-[var(--gold-bright)]">+{scoreExact * 5}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)]">Total</span>
              <span className="font-display text-lg leading-none tracking-wider text-[var(--gold-bright)]">{stats.totalPoints ?? stats.points}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// FULL-SCREEN BOOT LOADER
// ----------------------------------------------------------------------------
function BootLoadingOverlay({ label = "Loading" }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="boot-loading"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="boot-loading__inner">
        <div className="relative flex flex-col items-center">
          <span className="boot-loading__ball ball-bounce">⚽</span>
          <span className="boot-loading__shadow ball-shadow" />
        </div>
        <motion.p
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="boot-loading__label"
        >
          {label}
        </motion.p>
      </div>
    </motion.div>
  );
}

// ----------------------------------------------------------------------------
// SCROLLABLE BRACKET — left→right, all rounds, horizontal scroll.
// ----------------------------------------------------------------------------
function BracketColumn({ roundIdx, indices, align, winners, teams, onPick, actual, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, colRef, readOnly = false, revealGrades = false, isViewingOther, viewerName, teamById, byNum }) {
  const round = ROUNDS[roundIdx];
  const rowsPerMatch = BRACKET_ROWS / indices.length;
  return (
    <div ref={colRef} className="bracket-col flex h-full flex-col self-stretch">
      <div
        className="grid h-full min-h-0 flex-1"
        style={{ gridTemplateRows: `repeat(${BRACKET_ROWS}, minmax(0, 1fr))` }}
      >
        {indices.map((m, idx) => {
          const rk = key(round.key, m);
          const rowStart = idx * rowsPerMatch + 1;
          const match = slotMatches[rk];
          const scorePrediction = getScorePrediction(winners, rk);

          // Calculate prediction info for viewing others
          const predictionInfo = isViewingOther ? getMatchPredictionInfo(
            winners,
            match ?? { status: "upcoming" },
            rk,
            true, // isKnockout
            round.points,
            teamById,
            byNum
          ) : null;

          return (
            <div key={m} className="flex min-h-0 items-center" style={{ gridRow: `${rowStart} / ${rowStart + rowsPerMatch}` }}>
              <MatchCard
                slotKey={rk}
                roundIdx={roundIdx}
                matchIdx={m}
                teams={getMatchTeams(roundIdx, m, winners, teams)}
                winnerId={winners[rk]}
                onPick={onPick}
                actualId={actual[rk]}
                match={match}
                align={align}
                highlight={rk === liveKey ? "live" : rk === nextKey ? "next" : null}
                onFlagClick={onFlagClick}
                onOpenMatch={onOpenMatch}
                readOnly={readOnly}
                revealGrades={revealGrades}
                scorePrediction={scorePrediction}
                predictionInfo={predictionInfo}
                viewerName={viewerName}
                isViewingOther={isViewingOther}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScrollBracket({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, readOnly = false, revealGrades = false, stats, isViewingOther, viewerName, teamById, byNum }) {
  // Connector verdict per side: left = first half of the round, right = second.
  const verdictsFor = (roundIdx, side) => {
    const half = ROUNDS[roundIdx].matches / 2;
    const base = side === "left" ? 0 : half;
    return Array.from({ length: half }, (_, i) =>
      connectorVerdictForSlot(winners, actual, key(ROUNDS[roundIdx].key, base + i))
    );
  };
  const sideIdx = (roundIdx, side) => {
    const half = ROUNDS[roundIdx].matches / 2;
    const base = side === "left" ? 0 : half;
    return Array.from({ length: half }, (_, i) => base + i);
  };

  const shared = { winners, teams, onPick, actual, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, readOnly, revealGrades, stats, isViewingOther, viewerName, teamById, byNum };

  return (
    <>
      <div className="bracket-viewport">
        <div className="bracket-tree flex items-stretch gap-0">
          {/* LEFT half of the tree */}
          <BracketColumn roundIdx={0} indices={sideIdx(0, "left")} align="left" {...shared} />
          <Connector count={8} side="left" verdicts={verdictsFor(0, "left")} readOnly={readOnly} />
          <BracketColumn roundIdx={1} indices={sideIdx(1, "left")} align="left" {...shared} />
          <Connector count={4} side="left" verdicts={verdictsFor(1, "left")} readOnly={readOnly} />
          <BracketColumn roundIdx={2} indices={sideIdx(2, "left")} align="left" {...shared} />
          <Connector count={2} side="left" verdicts={verdictsFor(2, "left")} readOnly={readOnly} />
          <BracketColumn roundIdx={3} indices={sideIdx(3, "left")} align="left" {...shared} />
          <SFPodiumConnector
            side="left"
            finalVerdict={connectorVerdictForSlot(winners, actual, key("sf", 0))}
            thirdVerdict={connectorVerdictForSlot(winners, actual, key("sf", 0))}
            readOnly={readOnly}
          />

          {/* CENTER — trophy, final, third place */}
          <div className="bracket-col flex h-full min-w-0 items-stretch">
            <PodiumColumn {...shared} champion={champion} actualChampion={actualChampion} />
          </div>

          {/* RIGHT half of the tree (mirrored) */}
          <SFPodiumConnector
            side="right"
            finalVerdict={connectorVerdictForSlot(winners, actual, key("sf", 1))}
            thirdVerdict={connectorVerdictForSlot(winners, actual, key("sf", 1))}
            readOnly={readOnly}
          />
          <BracketColumn roundIdx={3} indices={sideIdx(3, "right")} align="right" {...shared} />
          <Connector count={2} side="right" verdicts={verdictsFor(2, "right")} readOnly={readOnly} />
          <BracketColumn roundIdx={2} indices={sideIdx(2, "right")} align="right" {...shared} />
          <Connector count={4} side="right" verdicts={verdictsFor(1, "right")} readOnly={readOnly} />
          <BracketColumn roundIdx={1} indices={sideIdx(1, "right")} align="right" {...shared} />
          <Connector count={8} side="right" verdicts={verdictsFor(0, "right")} readOnly={readOnly} />
          <BracketColumn roundIdx={0} indices={sideIdx(0, "right")} align="right" {...shared} />
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// NAME + FRIENDS MODALS
// ----------------------------------------------------------------------------
function NameModal({ onSubmit }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showRules, setShowRules] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const ok = await onSubmit(trimmed);
      if (!ok) setError("Something went wrong — try again");
    } catch {
      setError("Could not connect — check your network and try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={() => {}} maxW="max-w-md">
      <div className="flex max-h-[80vh] flex-col">
        {/* Header */}
        <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <div>
              <h2 className="font-display text-xl tracking-wider text-[var(--text-primary)]">WC26 Predictor</h2>
              <p className="text-xs text-[var(--text-muted)]">World Cup 2026 Bracket Challenge</p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!showRules ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/30 p-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Welcome! Fill your bracket, predict scores, and compete with friends. Tap "How it works" to learn the rules!
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Your Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={40}
                  autoFocus
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--pitch-glow)]/50"
                />
              </div>

              {error && <p className="text-xs font-semibold text-[var(--live)]">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="rounded-xl bg-[var(--pitch)] px-4 py-3 text-sm font-bold tracking-tight text-white transition-opacity disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Start Playing 🚀"}
              </button>

              <button
                type="button"
                onClick={() => setShowRules(true)}
                className="text-xs font-semibold text-[var(--gold-bright)] hover:underline"
              >
                📖 How it works & Points
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ← Back
              </button>

              <div className="space-y-3">
                <h3 className="font-display text-lg text-[var(--gold-bright)]">How to Play</h3>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-bold text-[var(--pitch-glow)]">1. FILL YOUR BRACKET</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Click teams to advance them. Complete all 32 picks (R32 → Final + 3rd place).
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-bold text-[var(--pitch-glow)]">2. LOCK WHEN READY</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    You can lock anytime. After locking, bracket picks are final!
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-bold text-[var(--pitch-glow)]">3. PREDICT SCORES</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Click matches in the bottom bar to predict 90-min scores. Works even AFTER locking!
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-lg text-[var(--gold-bright)]">Point System</h3>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">R32 correct</span>
                    <span className="float-right font-bold">1 pt</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">R16 correct</span>
                    <span className="float-right font-bold">2 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">QF correct</span>
                    <span className="float-right font-bold">4 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">SF correct</span>
                    <span className="float-right font-bold">7 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">3rd place</span>
                    <span className="float-right font-bold">3 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">Final</span>
                    <span className="float-right font-bold">12 pts</span>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 p-3">
                  <p className="text-xs font-bold text-[var(--gold-bright)]">SCORE PREDICTIONS (real matches)</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    On actual fixtures in the bottom bar — separate from bracket picks:<br />
                    One side correct = <span className="font-bold text-[var(--gold-bright)]">2 pts</span><br />
                    Exact score (both sides) = <span className="font-bold text-[var(--gold-bright)]">5 pts</span>
                  </p>
                </div>

                <div className="rounded bg-[var(--bg-elevated)] p-2 text-xs">
                  <span className="text-[var(--text-muted)]">Group stage (rail)</span>
                  <span className="float-right font-bold text-[var(--pitch-glow)]">1 pt per correct</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-mid)]/30 p-3">
                <p className="text-xs font-semibold text-[var(--text-primary)]">⚠️ Key Rules:</p>
                <ul className="mt-1 space-y-1 text-xs text-[var(--text-secondary)]">
                  <li>• Score predictions work until kickoff (lock doesn&apos;t matter)</li>
                  <li>• Score points are based on the real result, not bracket picks</li>
                  <li>• Group games in bottom bar = 1 point per correct winner pick</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="rounded-xl bg-[var(--pitch)] px-4 py-2 text-sm font-bold text-white"
              >
                Got it! Start Playing 🚀
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function FriendsModal({ open, onClose, friends, currentUid, activeUid, onSelect }) {
  return (
    <Modal open={open} onClose={onClose} maxW="max-w-md">
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="font-display text-xl tracking-wider">Switch viewer</h2>
            <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-muted)]">Ranked by correct picks</p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost grid h-8 w-8 place-items-center rounded-lg text-sm" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto p-3">
          {friends.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-[var(--text-muted)]">No predictions yet — be the first!</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {friends.map((friend, idx) => {
                const isMe = friend.uid === currentUid;
                const isActive = friend.uid === activeUid;
                const hasGraded = friend.total > 0;
                return (
                  <li key={friend.uid}>
                    <button
                      type="button"
                      onClick={() => onSelect(friend)}
                      className={[
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]",
                        isActive ? "bg-[var(--pitch)]/12 ring-1 ring-[var(--pitch-glow)]/25" : "",
                      ].join(" ")}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black tabular-nums ${
                          idx === 0
                            ? "bg-[var(--gold)]/20 text-[var(--gold-bright)]"
                            : idx === 1
                              ? "bg-white/8 text-[var(--text-secondary)]"
                              : idx === 2
                                ? "bg-white/5 text-[var(--text-muted)]"
                                : "text-[var(--text-muted)]"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
                          <span className="truncate">{friend.name}</span>
                          {friend.locked ? (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--gold-bright)]" title="Locked">
                              <IconLock className="h-2.5 w-2.5" />
                              Locked
                            </span>
                          ) : (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[var(--pitch-glow)]">Open</span>
                          )}
                          {isMe && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--pitch-glow)]">You</span>
                          )}
                          {isActive && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Viewing</span>
                          )}
                        </span>
                        <span className="text-[10px] font-medium text-[var(--text-muted)]">
                          {hasGraded ? `${friend.correct}/${friend.total} correct` : "No graded picks yet"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-display text-lg leading-none tracking-wider text-[var(--gold-bright)]">{friend.points}</span>
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">pts</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LockConfirmModal({ open, onClose, onConfirm, locking }) {
  const handleConfirm = async () => {
    const ok = await onConfirm();
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={locking ? () => {} : onClose} maxW="max-w-md">
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl tracking-wider text-[var(--text-primary)]">Lock your picks?</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Once locked, your bracket picks are final in the app. You can still add or change score predictions until each match kicks off.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={locking}
            className="btn-ghost flex-1 rounded-xl px-4 py-3 text-sm font-bold tracking-tight disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={locking}
            className="flex-1 rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold tracking-tight text-[var(--bg-deep)] transition-opacity disabled:opacity-50"
          >
            {locking ? "Locking…" : "Lock picks"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// MAIN APP
// ----------------------------------------------------------------------------
export default function App() {
  const [winners, setWinners] = useState(() => ({}));
  const [showFriends, setShowFriends] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [teamModal, setTeamModal] = useState(null);
  const [matchModal, setMatchModal] = useState(null);
  const prevChampRef = useRef(null);
  const { matches, byNum, r32Teams, journeys, loading, lastUpdated, error } = useWorldCup();

  const onRemoteWinners = useCallback((remote, { force } = {}) => {
    setWinners((local) => {
      if (force) return remote;
      if (Object.keys(local).length > 0) return local;
      return remote;
    });
  }, []);

  const {
    uid,
    name,
    needsName,
    profileLoaded,
    authReady,
    authError,
    syncError,
    syncing,
    clearSyncError,
    submitName,
    locked,
    locking,
    lockPredictions,
    friends,
    viewingFriend,
    viewFriend,
    exitFriendView,
    readOnly,
  } = usePredictions(winners, { onRemoteWinners });

  const teams = r32Teams ?? [];
  const selfPrediction = useMemo(() => friends.find((f) => f.uid === uid) ?? null, [friends, uid]);
  const canEdit = !locked && !viewingFriend;

  const displayWinners = useMemo(() => {
    let w = winners;
    if (viewingFriend) w = viewingFriend.winners;
    else if (locked && selfPrediction) w = selfPrediction.winners;
    return teams.length === 32 ? normalize(w, teams) : w;
  }, [viewingFriend, winners, teams, locked, selfPrediction]);
  const slotMatches = useMemo(() => buildSlotMatches(byNum), [byNum]);
  const actual = useMemo(() => buildActual(slotMatches), [slotMatches]);

  // Knockout matches for bracket
  const knockouts = useMemo(
    () =>
      matches
        .filter((m) => m.isKnockout)
        .sort((x, y) => (x.kickoff?.getTime() ?? 0) - (y.kickoff?.getTime() ?? 0)),
    [matches]
  );

  // Non-knockout matches (group stage) with confirmed opponents for rail predictions
  // These are "base" games where teams are confirmed, not derived from bracket progression
  const predictableMatches = useMemo(
    () =>
      matches
        .filter((m) => !m.isKnockout && m.team1 && m.team2 && !isRef(m.ref1) && !isRef(m.ref2))
        .sort((x, y) => (x.kickoff?.getTime() ?? 0) - (y.kickoff?.getTime() ?? 0)),
    [matches]
  );

  // Combine knockouts and predictable matches for the rail
  // Knockout games (R32 onwards) show bracket predictions - rail is view-only
  // Non-knockout games allow direct rail predictions
  const railMatches = useMemo(
    () =>
      [...knockouts, ...predictableMatches].sort(
        (x, y) => (x.kickoff?.getTime() ?? 0) - (y.kickoff?.getTime() ?? 0)
      ),
    [knockouts, predictableMatches]
  );

  const liveNums = useMemo(() => railMatches.filter((m) => m.status === "live").map((m) => m.num), [railMatches]);
  const nextMatch = useMemo(() => {
    const now = Date.now();
    return railMatches.find((m) => m.status === "upcoming" && m.kickoff && m.kickoff.getTime() > now) || null;
  }, [railMatches]);

  const numToSlot = useMemo(() => {
    const map = new Map();
    for (const [k, m] of Object.entries(slotMatches)) map.set(m.num, k);
    return map;
  }, [slotMatches]);
  const liveKey = liveNums.length ? numToSlot.get(liveNums[0]) : null;
  const nextKey = nextMatch ? numToSlot.get(nextMatch.num) : null;

  // Re-validate picks once bracket seeds load — skip state update if nothing changed.
  useEffect(() => {
    if (teams.length === 32 && !locked) {
      setWinners((w) => {
        const next = normalizeScores(normalize(w, teams), teams);
        return JSON.stringify(next) === JSON.stringify(w) ? w : next;
      });
    }
  }, [teams.length, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Predictions are saved to Firebase only - localStorage disabled

  const isViewingSelf = !viewingFriend;
  const activeViewerName = viewingFriend?.name ?? name ?? "You";
  const activeViewerLocked = viewingFriend ? viewingFriend.locked : locked;
  const activeUid = viewingFriend?.uid ?? uid;

  const pickProgress = useMemo(() => getPickProgress(winners), [winners]);
  const lockTooltip = pickProgress.complete
    ? "Lock your picks permanently"
    : `Complete all ${pickProgress.total} matchups before locking (${pickProgress.filled}/${pickProgress.total} picked)`;

  const champion = teams.find((t) => t.id === displayWinners[key("final", 0)]) || null;
  const actualChampion = slotMatches[key("final", 0)]?.winner || null;

  useEffect(() => {
    const id = champion?.id || null;
    if (readOnly) {
      prevChampRef.current = id;
      return;
    }
    if (id && id !== prevChampRef.current) {
      setConfetti(true);
      const t = setTimeout(() => setConfetti(false), 4200);
      prevChampRef.current = id;
      return () => clearTimeout(t);
    }
    if (!id) prevChampRef.current = null;
  }, [champion, readOnly]);

  const onPick = useCallback(
    (roundIdx, matchIdx, team) => {
      if (!canEdit || locked) return;
      const rk = roundIdx === "third" ? "third-0" : key(ROUNDS[roundIdx].key, matchIdx);
      setWinners((prev) => {
        const next = { ...prev };
        if (next[rk] === team.id) {
          delete next[rk];
          // Also clear score prediction when winner is cleared
          delete next[rk + SCORE_SUFFIX];
        } else {
          next[rk] = team.id;
        }
        const normalized = normalize(next, teams);
        return normalizeScores(normalized, teams);
      });
    },
    [teams, canEdit, locked]
  );

  const handleSelectFriend = useCallback(
    (friend) => {
      if (friend.uid === uid) {
        exitFriendView();
      } else {
        viewFriend(friend);
      }
      setShowFriends(false);
    },
    [viewFriend, exitFriendView, uid]
  );

  const resetBracket = useCallback(() => {
    if (locked) return;
    setWinners({});
    prevChampRef.current = null;
    // Predictions are saved to Firebase only - no localStorage to clear
  }, [locked]);

  const handleLock = useCallback(async () => {
    return lockPredictions();
  }, [lockPredictions]);

  useEffect(() => {
    if (locked) setShowLockConfirm(false);
  }, [locked]);

  const onFlagClick = useCallback((team) => setTeamModal(team), []);
  const openMatchBySlot = useCallback(
    (slotKey) => {
      const m = slotMatches[slotKey];
      if (m) setMatchModal(m);
    },
    [slotMatches]
  );
  const openMatchFromTeam = useCallback((m) => {
    setTeamModal(null);
    setMatchModal(m);
  }, []);

  const saveScorePrediction = useCallback((slotKey, score) => {
    setWinners((prev) => normalizeScores(setScorePrediction(prev, slotKey, score), teams));
    return true;
  }, [teams]);

  // Grade picks against real results as they land. Include slotMatches for score prediction grading.
  const stats = useMemo(() => gradeWinners(displayWinners, actual, slotMatches), [displayWinners, actual, slotMatches]);

  // Grade rail game predictions (non-knockout games with rail- prefix)
  const railStats = useMemo(() => {
    const railKeys = Object.keys(displayWinners).filter(k => k.startsWith("rail-"));
    let correct = 0, total = 0, scoreOneSide = 0, scoreExact = 0, scorePoints = 0;

    for (const key of railKeys) {
      const matchNum = parseInt(key.replace("rail-", ""), 10);
      const match = byNum.get(matchNum);
      if (!match || match.status !== "played" || !match.winner) continue;

      total++;
      const predictedWinner = displayWinners[key];
      if (predictedWinner === match.winner.id) correct++;

      const predictedScore = displayWinners[key + SCORE_SUFFIX];
      if (predictedScore && match.ftScore) {
        const { scorePoints: sp } = gradeScorePrediction(predictedScore, match.ftScore);
        if (sp === SCORE_EXACT_POINTS) {
          scoreExact++;
          scorePoints += sp;
        } else if (sp === SCORE_ONE_SIDE_POINTS) {
          scoreOneSide++;
          scorePoints += sp;
        }
      }
    }

    return { correct, total, scoreOneSide, scoreExact, scorePoints, points: correct * 1 + scorePoints };
  }, [displayWinners, byNum]);

  // Combined stats including both bracket and rail predictions
  const combinedStats = useMemo(() => ({
    ...stats,
    railCorrect: railStats.correct,
    railTotal: railStats.total,
    railScoreOneSide: railStats.scoreOneSide,
    railScoreExact: railStats.scoreExact,
    railScorePoints: railStats.scorePoints,
    totalPoints: (stats.totalPoints ?? stats.points) + railStats.points,
  }), [stats, railStats]);

  const rankedFriends = useMemo(
    () =>
      friends
        .map((friend) => {
          const graded = gradeWinners(friend.winners, actual, slotMatches);
          // Calculate friend's rail stats with tiered scoring
          const friendRailKeys = Object.keys(friend.winners).filter(k => k.startsWith("rail-"));
          let railCorrect = 0, railTotal = 0, railScoreOneSide = 0, railScoreExact = 0, railScorePoints = 0;
          for (const key of friendRailKeys) {
            const matchNum = parseInt(key.replace("rail-", ""), 10);
            const match = byNum.get(matchNum);
            if (!match || match.status !== "played" || !match.winner) continue;
            railTotal++;
            if (friend.winners[key] === match.winner.id) railCorrect++;

            const predictedScore = friend.winners[key + SCORE_SUFFIX];
            if (predictedScore && match.ftScore) {
              const { scorePoints: sp } = gradeScorePrediction(predictedScore, match.ftScore);
              if (sp === SCORE_EXACT_POINTS) {
                railScoreExact++;
                railScorePoints += sp;
              } else if (sp === SCORE_ONE_SIDE_POINTS) {
                railScoreOneSide++;
                railScorePoints += sp;
              }
            }
          }
          const railPoints = railCorrect * 1 + railScorePoints;

          return {
            ...friend,
            ...graded,
            railCorrect,
            railTotal,
            railScoreOneSide,
            railScoreExact,
            // Use totalPoints which includes both bracket and rail score prediction points
            points: (graded.totalPoints ?? graded.points) + railPoints,
          };
        })
        .sort(
          (a, b) =>
            b.correct - a.correct ||
            b.points - a.points ||
            b.total - a.total ||
            a.name.localeCompare(b.name)
        ),
    [friends, actual, slotMatches, byNum]
  );

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const bracketProps = {
    winners: displayWinners,
    teams,
    onPick,
    actual,
    slotMatches,
    liveKey,
    nextKey,
    onFlagClick,
    onOpenMatch: openMatchBySlot,
    readOnly: !canEdit,
    revealGrades: true, // Always show grading for played matches
    isViewingOther: !!viewingFriend,
    viewerName: viewingFriend?.name,
    teamById,
    byNum,
  };
  const showBracket = teams.length === 32;
  const docsLoading = !!uid && !profileLoaded;
  const appLoading = !authReady || docsLoading || loading;
  const bootLabel = !authReady
    ? "Signing in"
    : docsLoading
      ? "Loading predictions"
      : "Loading tournament";

  // Use combined stats for display (includes both bracket and rail predictions)
  const displayStats = combinedStats;

  return (
    <div className="app-shell text-[var(--text-primary)]">
      <AnimatePresence>
        {appLoading && <BootLoadingOverlay key="boot" label={bootLabel} />}
      </AnimatePresence>
      <Confetti fire={confetti} />
      {syncing && !authError && !syncError && (
        <div className="sync-tooltip sync-tooltip--saving" role="status" aria-live="polite">
          Saving…
        </div>
      )}
      {(authError || syncError) && (
        <div className="sync-tooltip sync-tooltip--error" role="alert">
          <p>{authError || syncError}</p>
          <button type="button" className="sync-tooltip__dismiss" onClick={clearSyncError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {authReady && profileLoaded && needsName && <NameModal onSubmit={submitName} />}
      <FriendsModal
        open={showFriends}
        onClose={() => setShowFriends(false)}
        friends={rankedFriends}
        currentUid={uid}
        activeUid={activeUid}
        onSelect={handleSelectFriend}
      />
      <LockConfirmModal
        open={showLockConfirm}
        onClose={() => setShowLockConfirm(false)}
        onConfirm={handleLock}
        locking={locking}
      />
      <TeamModal
        team={teamModal}
        journey={teamModal ? journeys.get(teamModal.code) ?? [] : []}
        onClose={() => setTeamModal(null)}
        onOpenMatch={openMatchFromTeam}
      />
      <MatchModal
        match={matchModal}
        onClose={() => setMatchModal(null)}
        onFlagClick={(t) => { setMatchModal(null); setTeamModal(t); }}
        scorePrediction={matchModal ? (() => {
          const isKnockout = matchModal.isKnockout;
          const key = isKnockout
            ? numToSlot.get(matchModal.num)
            : `rail-${matchModal.num}`;
          return key ? getScorePrediction(winners, key) : null;
        })() : null}
        onSaveScorePrediction={async (score) => {
          if (!matchModal) return false;
          const isKnockout = matchModal.isKnockout;
          const key = isKnockout
            ? numToSlot.get(matchModal.num)
            : `rail-${matchModal.num}`;
          if (!key) return false;
          return saveScorePrediction(key, score);
        }}
        slotKey={matchModal ? (matchModal.isKnockout ? numToSlot.get(matchModal.num) : `rail-${matchModal.num}`) : null}
        friends={friends}
        selfUid={uid}
      />

      {/* HEADER */}
      <header className="broadcast-bar shrink-0 z-40">
        <div className="relative mx-auto max-w-[1900px] px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <WCLogo className="h-9 w-9 shrink-0 drop-shadow-lg" />
              <div className="min-w-0 leading-tight">
                <h1 className="font-display truncate text-xl tracking-wider sm:text-2xl">
                  World Cup <span className="text-[var(--pitch-glow)]">26</span>
                  <span className="ml-2 hidden text-[var(--text-muted)] sm:inline">· Bracket Challenge</span>
                </h1>
                <p className="truncate text-[10px] font-semibold text-[var(--text-muted)]">
                  {liveNums.length > 0 ? (
                    <span className="text-[var(--live)]">● {liveNums.length} match{liveNums.length > 1 ? "es" : ""} live</span>
                  ) : nextMatch?.kickoff ? (
                    <>
                      next: {nextMatch.team1?.code ?? "TBD"} v {nextMatch.team2?.code ?? "TBD"} in{" "}
                      <span className="tabular-nums text-[var(--next)]">{fmtCountdown(nextMatch.kickoff.getTime() - Date.now())}</span>
                    </>
                  ) : lastUpdated ? (
                    `updated ${fmtTimeOnly(lastUpdated)}`
                  ) : (
                    "connecting…"
                  )}
                </p>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-28 sm:px-40">
              <div className="pointer-events-auto">
                <ViewingAsPicker
                  name={activeViewerName}
                  isLocked={activeViewerLocked}
                  onClick={() => setShowFriends(true)}
                  disabled={!profileLoaded || needsName || !authReady}
                />
              </div>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              <HeaderToolbar
                isViewingSelf={isViewingSelf}
                locked={locked}
                canLock={pickProgress.complete}
                lockTooltip={lockTooltip}
                onOpenLock={() => setShowLockConfirm(true)}
                onReset={resetBracket}
              />
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-7xl shrink-0 px-4 pt-2 text-center text-[11px] font-semibold text-amber-400/80">
          Could not refresh live scores — showing last known data.
        </div>
      )}

      {/* BRACKET */}
      <main className="app-main">
        {!showBracket && !loading && (
            <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-[var(--text-muted)]">
              Bracket seeds not available yet — the Round of 32 line-up appears once the group stage is complete.
            </div>
          )}

        {showBracket && !appLoading && (
          <ScrollBracket
            {...bracketProps}
            champion={champion}
            actualChampion={actualChampion}
            stats={displayStats}
          />
        )}
      </main>

      {railMatches.length > 0 && !appLoading && (
        <PredictionsRail
          matches={railMatches}
          liveNums={liveNums}
          nextNum={nextMatch?.num ?? null}
          numToSlot={numToSlot}
          winners={displayWinners}
          actual={actual}
          teams={teams}
          revealGrades={true} // Always show grading for played matches
          onOpenMatch={setMatchModal}
          // Rail predictions (non-knockout) can be edited even when bracket is locked
          canEdit={isViewingSelf}
          onPickRailWinner={isViewingSelf ? (matchNum, teamId, isKnockout) => {
            // Only allow rail predictions on non-knockout games (base games like group stage)
            // Knockout games (R32 onwards) predictions come from bracket only
            if (isKnockout) return;
            // Store rail predictions separately with rail- prefix
            const key = `rail-${matchNum}`;
            setWinners((prev) => ({
              ...prev,
              [key]: teamId === prev[key] ? undefined : teamId, // Toggle off if same
            }));
          } : undefined}
          byNum={byNum}
          isViewingOther={!!viewingFriend}
          viewerName={viewingFriend?.name}
          roundPoints={ROUNDS.reduce((acc, r) => {
            for (let m = 0; m < r.matches; m++) {
              acc[key(r.key, m)] = r.points;
            }
            return acc;
          }, {})}
        />
      )}

      {railMatches.length === 0 && (
        <footer className="shrink-0 px-4 pb-5 pt-1 text-center text-[10.5px] font-medium text-[var(--text-muted)]/70">
          {!isViewingSelf ? (
            <>Tap &ldquo;Viewing as&rdquo; above to switch brackets · flags and match details still work in read-only mode.</>
          ) : locked ? (
            <>Your bracket is locked — picks cannot be changed until an admin unlocks your entry in the database.</>
          ) : (
            <>
              Tap a team code to advance them · tap a flag for their tournament journey · tap the middle of a card for full match details.
              Picks auto-save to the cloud{name ? ` as ${name}` : ""} & auto-grade against live results (refreshes every minute).
            </>
          )}
        </footer>
      )}
    </div>
  );
}
