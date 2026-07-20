import { useEffect, useState } from "react";
import { teamFor, isRef } from "../lib/teams";
import { KNOCKOUT_ROUNDS, ROUND_LABEL, ROUNDS } from "../lib/rounds";
import worldCupData from "../assets/score.json";

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

export function useWorldCup(enabled = true) {
  const [state, setState] = useState({ matches: [], byNum: new Map(), r32Teams: null, journeys: new Map() });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setLoading(true);
      return;
    }

    try {
      setState(processWorldCupJson(worldCupData));
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load scores");
    } finally {
      setLoading(false);
    }

    const tickId = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(tickId);
  }, [enabled]);

  return { ...state, loading, lastUpdated, error };
}
