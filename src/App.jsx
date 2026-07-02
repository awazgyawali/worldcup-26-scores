import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePredictions } from "./hooks/usePredictions";

/* ============================================================================
 *  FIFA WORLD CUP 2026 — KNOCKOUT BRACKET PREDICTOR
 *  Data: openfootball/worldcup.json. Every bracket slot maps to a JSON match
 *  number (73–104), so live scores, goal scorers, venues, extra time and
 *  penalty shootouts all attach exactly where they belong.
 *
 *  Layout: a linear, chronological games rail up top + a horizontally
 *  scrollable left→right bracket with round-jump navigation.
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
/** Rows per bracket half — the tree converges from both sides into the final. */
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
const STORAGE_KEY = "wc26-bracket-winners-v4";
const ACCENT = "#4ade80";
const ACCENT_DIM = "rgba(100, 118, 140, 0.35)";

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

function loadStoredWinners() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
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

/** slot key → actual winning team id (only for decided matches). */
const buildActual = (slotMatches) => {
  const actual = {};
  for (const [k, m] of Object.entries(slotMatches)) {
    if (m.winner) actual[k] = m.winner.id;
  }
  return actual;
};

/** Grade a winners map against decided results. */
function gradeWinners(winners, actual) {
  const byRound = {};
  let correct = 0,
    total = 0,
    points = 0;
  for (const r of [...ROUNDS, THIRD_PLACE]) {
    byRound[r.key] = { correct: 0, total: 0 };
    const count = r.matches ?? 1;
    for (let m = 0; m < count; m++) {
      const k = key(r.key, m);
      if (!actual[k] || !winners[k]) continue;
      byRound[r.key].total++;
      total++;
      if (actual[k] === winners[k]) {
        byRound[r.key].correct++;
        correct++;
        points += r.points;
      }
    }
  }
  return { correct, total, points, byRound };
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
function Connector({ count, side = "left", active }) {
  const paths = [];
  for (let i = 0; i < count; i++) {
    const y1 = i + 0.5;
    const y2 = i % 2 === 0 ? i + 1 : i;
    const d = side === "left" ? `M0,${y1} H50 V${y2} H100` : `M100,${y1} H50 V${y2} H0`;
    paths.push(
      <path
        key={i}
        d={d}
        fill="none"
        strokeWidth={active?.[i] ? 2 : 1.25}
        stroke={active?.[i] ? ACCENT : ACCENT_DIM}
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

/** Straight feeder line from each semi-final into the central final. */
function SFFinalConnector({ active }) {
  return (
    <div className="shrink-0 self-stretch" style={{ width: 32 }}>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-full w-full">
        <path
          d="M0,50 H100"
          fill="none"
          strokeWidth={active ? 2 : 1.25}
          stroke={active ? ACCENT : ACCENT_DIM}
          vectorEffect="non-scaling-stroke"
          style={{ transition: "stroke 0.4s ease, stroke-width 0.4s ease" }}
        />
      </svg>
    </div>
  );
}

// ----------------------------------------------------------------------------
// TEAM ROW — [flag] CODE [verdict] [score]
// ----------------------------------------------------------------------------
function TeamRow({ team, isPicked, isDimmed, verdict, onPick, onFlagClick, locked, readOnly, score, isMatchWinner, align = "left" }) {
  const empty = !team;
  const disabled = empty || locked || readOnly;
  const right = align === "right";

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
        empty ? undefined : readOnly ? "Shared bracket — view only" : locked ? "Both teams must be decided first" : `Advance ${team.name}`
      }
      className={[
        "group/row relative flex h-[22px] w-full items-center gap-1.5 rounded-sm px-1.5 transition-all duration-200",
        right ? "flex-row-reverse text-right" : "text-left",
        strip,
        empty ? "cursor-default" : locked || readOnly ? "cursor-not-allowed opacity-55" : "cursor-pointer",
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

      {score != null && (
        <span
          className={[
            "grid h-4 w-4.5 shrink-0 place-items-center rounded-[4px] text-[10.5px] font-extrabold tabular-nums",
            isMatchWinner
              ? "bg-[color-mix(in_oklch,var(--pitch)_35%,transparent)] text-[var(--text-primary)]"
              : "bg-white/[0.07] text-[var(--text-muted)]",
          ].join(" ")}
        >
          {score}
        </span>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// MATCH CARD (bracket)
// ----------------------------------------------------------------------------
function MatchCard({ slotKey, roundIdx, matchIdx, teams: [a, b], winnerId, onPick, actualId, match, highlight = null, onFlagClick, onOpenMatch, align = "left", readOnly = false }) {
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
  const graded = !!actualId;
  const verdictFor = (team) => {
    if (!graded || !team) return undefined;
    if (winnerId === team.id) return team.id === actualId ? "correct" : "wrong";
    if (team.id === actualId && winnerId) return "missed";
    return undefined;
  };
  const actualWinnerIsA = pairIsReal && match.winner && a && match.winner.id === a.id;
  const actualWinnerIsB = pairIsReal && match.winner && b && match.winner.id === b.id;

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
        highlight === "live" ? "match-ticket--live" : highlight === "next" ? "match-ticket--next" : "",
      ].join(" ")}
    >
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
        isMatchWinner={actualWinnerIsA}
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
        isMatchWinner={actualWinnerIsB}
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
function TrophyMark({ champion }) {
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      className="relative flex flex-col items-center"
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
    </motion.div>
  );
}

function ChampionBox({ champion, isActual }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={champion?.id || "empty"}
        initial={{ opacity: 0, scale: 0.88, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -6 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {champion ? (
          <div className="flex flex-col items-center gap-1 rounded-xl bg-gradient-to-b from-amber-300/25 to-amber-500/5 px-4 py-2.5 ring-1 ring-amber-300/50 shadow-[0_0_40px_-8px_rgba(245,205,110,0.5)]">
            <img
              src={flagSrc(champion.iso2)}
              srcSet={flagSrcSet(champion.iso2)}
              alt=""
              className="h-7 w-11 rounded-[4px] object-cover shadow ring-1 ring-black/40"
            />
            <div className="text-center leading-tight">
              <div className="text-[8px] font-black uppercase tracking-[0.24em] text-amber-300/80">
                {isActual ? "World Champion" : "Your Champion"}
              </div>
              <div className="font-display text-lg tracking-wide text-white">{champion.name}</div>
            </div>
          </div>
        ) : (
          <div className="text-center text-[9px] font-bold uppercase tracking-[0.2em] leading-relaxed text-[var(--text-muted)]">
            pick your
            <br />
            champion
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

function ThirdPlaceCard({ winners, teams, onPick, actual, slotMatches, onFlagClick, onOpenMatch, liveKey, nextKey, readOnly = false }) {
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
      />
    </div>
  );
}

/** Last bracket column: trophy → final → champion → third place. */
function PodiumColumn({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, readOnly = false }) {
  const rk = key("final", 0);
  return (
    <div className="flex h-full w-[calc(var(--match-card-w)+1.5rem)] shrink-0 flex-col items-center justify-center gap-2.5 self-stretch px-3">
      <TrophyMark champion={champion || actualChampion} />
      <div className="rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-3 py-0.5 text-[8.5px] font-black uppercase tracking-[0.22em] text-[#1a1305] shadow-[0_0_18px_-4px_rgba(245,205,110,0.5)]">
        Final
      </div>
      <div className="w-[var(--match-card-w)]">
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
        />
      </div>
      <ChampionBox champion={actualChampion || champion} isActual={!!actualChampion} />
      <div className="mt-2 w-[var(--match-card-w)]">
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

function MatchModal({ match, onClose, onFlagClick }) {
  if (!match) return null;
  const played = match.status === "played";
  const live = match.status === "live";
  const upcoming = match.status === "upcoming";

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

      <div className="nice-scroll flex-1 overflow-y-auto">
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
// TEAM JOURNEY MODAL — full tournament run, group stage included.
// ----------------------------------------------------------------------------
function TeamModal({ team, journey, onClose, onOpenMatch }) {
  if (!team) return null;
  const playedGames = journey.filter((m) => m.gf != null);
  const wins = playedGames.filter((m) => (m.winner ? m.winner.id === team.id : false)).length;
  const draws = playedGames.filter((m) => m.gf === m.ga && !m.pens).length;
  const losses = playedGames.length - wins - draws;
  const gf = playedGames.reduce((s, m) => s + m.gf, 0);
  const ga = playedGames.reduce((s, m) => s + m.ga, 0);

  return (
    <Modal open={!!team} onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5">
        <img
          src={flagSrc(team.iso2)}
          srcSet={flagSrcSet(team.iso2)}
          alt=""
          className="h-10 w-14 rounded-md object-cover shadow-md ring-1 ring-black/40"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display truncate text-2xl tracking-wide text-[var(--text-primary)]">
            {team.name} <span className="text-[var(--text-muted)]">· {team.code}</span>
          </h2>
          {playedGames.length > 0 && (
            <p className="text-[11px] font-semibold text-[var(--text-muted)]">
              <span className="text-[var(--pitch-glow)]">{wins}W</span> · {draws}D ·{" "}
              <span className="text-[var(--wrong)]">{losses}L</span> · {gf} scored / {ga} conceded
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="nice-scroll flex-1 overflow-y-auto px-3 py-3">
        {journey.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">No matches found.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {journey.map((m, i) => {
              const scored = m.gf != null;
              const wonPens = m.pens && m.winner?.id === team.id;
              const lostPens = m.pens && m.winner && m.winner.id !== team.id;
              const won = scored && (m.gf > m.ga || wonPens);
              const lost = scored && (m.gf < m.ga || lostPens);
              const ourScorers = (m.ourGoals || [])
                .map((g) => `${g.name} ${g.minute}′${g.penalty ? " (P)" : ""}${g.owngoal ? " (OG)" : ""}`)
                .join(" · ");
              return (
                <motion.li
                  key={`${m.date}-${m.them?.code}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.25 }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenMatch?.(m)}
                    className={[
                      "w-full rounded-lg border px-3 py-2.5 text-left transition hover:brightness-110",
                      won
                        ? "border-[color-mix(in_oklch,var(--pitch-glow)_30%,transparent)] bg-[color-mix(in_oklch,var(--pitch)_12%,transparent)]"
                        : lost
                        ? "border-[color-mix(in_oklch,var(--wrong)_22%,transparent)] bg-[color-mix(in_oklch,var(--wrong)_6%,transparent)]"
                        : "border-[var(--border)] bg-[var(--bg-elevated)]",
                    ].join(" ")}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        {m.group || m.roundLabel}
                      </span>
                      {m.kickoff && (
                        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]/70">{fmtKickoff(m.kickoff)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5">
                      <img src={flagSrc(m.them.iso2)} alt="" className="h-4.5 w-6.5 shrink-0 rounded-[3px] object-cover ring-1 ring-black/30" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-secondary)]">
                        vs {m.them.name}
                      </span>
                      {scored ? (
                        <span className="flex shrink-0 items-center gap-1.5">
                          {m.pens && (
                            <span className="text-[9.5px] font-bold text-[var(--gold-bright)]">
                              {wonPens ? "won" : "lost"} pens
                            </span>
                          )}
                          <span
                            className={[
                              "rounded-md px-2 py-0.5 text-sm font-extrabold tabular-nums",
                              won ? "bg-emerald-500/20 text-emerald-200" : lost ? "bg-rose-500/15 text-rose-200" : "bg-white/5 text-[var(--text-secondary)]",
                            ].join(" ")}
                          >
                            {m.gf}–{m.ga}
                          </span>
                        </span>
                      ) : m.status === "live" ? (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase text-[var(--live)]">
                          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" /> live
                        </span>
                      ) : m.kickoff ? (
                        <span className="text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">{fmtMatchTime(m.kickoff)}</span>
                      ) : (
                        <span className="text-[11px] text-[var(--text-muted)]/60">TBD</span>
                      )}
                    </div>
                    {ourScorers && (
                      <p className="mt-1 truncate text-[10.5px] text-[var(--text-muted)]">⚽ {ourScorers}</p>
                    )}
                    {m.ground && <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]/60">🏟 {m.ground}</p>}
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// GAMES RAIL — every knockout fixture, linear & chronological, up top.
// ----------------------------------------------------------------------------
function RailTeamRow({ team, refName, score, isWinner }) {
  return (
    <div className="grid h-[20px] grid-cols-[22px_1fr_auto] items-center gap-1.5">
      {team ? (
        <img src={flagSrc(team.iso2, 40)} alt="" className="h-3.5 w-[22px] rounded-[3px] object-cover ring-1 ring-black/30" />
      ) : (
        <span className="grid h-3.5 w-[22px] place-items-center rounded-[3px] bg-white/[0.06] text-[8px] font-bold text-[var(--text-muted)] ring-1 ring-white/10">·</span>
      )}
      <span
        className={[
          "truncate text-[11.5px] font-bold tracking-wide",
          isWinner ? "text-[var(--pitch-glow)]" : team ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]",
        ].join(" ")}
      >
        {team ? team.code : isRef(refName) ? `${refName[0] === "W" ? "W" : "L"}·M${refName.slice(1)}` : "TBD"}
      </span>
      <span
        className={[
          "w-4 text-right text-[12px] font-extrabold tabular-nums",
          isWinner ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]",
        ].join(" ")}
      >
        {score != null ? score : ""}
      </span>
    </div>
  );
}

function RailCard({ match, isLive, isNext, onClick, index }) {
  const footer = () => {
    if (isLive)
      return (
        <span className="flex items-center gap-1 text-[8.5px] font-black uppercase tracking-[0.14em] text-[var(--live)]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="live-ping absolute h-full w-full rounded-full bg-[var(--live)]" />
            <span className="live-dot h-full w-full rounded-full bg-[var(--live)]" />
          </span>
          Live {liveMinute(match.kickoff)}
        </span>
      );
    if (match.status === "played")
      return (
        <span className="text-[8.5px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {phaseLabel(match)}
        </span>
      );
    if (isNext && match.kickoff)
      return (
        <span className="text-[8.5px] font-black uppercase tracking-[0.1em] text-[var(--next)]">
          in {fmtCountdown(match.kickoff.getTime() - Date.now())}
        </span>
      );
    return (
      <span className="text-[8.5px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {match.kickoff ? fmtTimeOnly(match.kickoff) : "TBD"}
      </span>
    );
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.5), duration: 0.3 }}
      whileTap={{ scale: 0.96 }}
      className={[
        "rail-card flex w-[9.5rem] shrink-0 snap-start flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left",
        isLive ? "rail-card--live" : isNext ? "rail-card--next" : "",
      ].join(" ")}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span
          className={[
            "text-[8px] font-black uppercase tracking-[0.16em]",
            isLive ? "text-[var(--live)]" : isNext ? "text-[var(--next)]" : "text-[var(--gold-bright)]/70",
          ].join(" ")}
        >
          {ROUND_SHORT[match.round] || match.roundLabel}
        </span>
        {footer()}
      </div>
      <RailTeamRow team={match.team1} refName={match.ref1} score={match.score?.[0]} isWinner={match.winnerIdx === 0} />
      <RailTeamRow team={match.team2} refName={match.ref2} score={match.score?.[1]} isWinner={match.winnerIdx === 1} />
      {match.pens && (
        <span className="mt-0.5 text-[8.5px] font-bold text-[var(--gold-bright)]">
          pens {match.pens[0]}–{match.pens[1]}
        </span>
      )}
    </motion.button>
  );
}

function GamesRail({ matches, liveNums, nextNum, onOpenMatch }) {
  const scrollRef = useRef(null);
  const anchorRef = useRef(null);
  const anchored = useRef(false);

  useEffect(() => {
    if (anchored.current || !anchorRef.current || !scrollRef.current) return;
    const el = anchorRef.current;
    scrollRef.current.scrollLeft = el.offsetLeft - scrollRef.current.clientWidth / 2 + el.clientWidth / 2;
    anchored.current = true;
  }, [matches]);

  const anchorNum = liveNums[0] ?? nextNum;
  let lastDate = null;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--bg-mid)]/55">
      <div
        ref={scrollRef}
        className="ticker-scroll edge-fade-x mx-auto flex max-w-[1900px] snap-x items-stretch gap-2 overflow-x-auto px-5 py-2.5"
      >
        {matches.map((m, i) => {
          const dayChip =
            m.date !== lastDate && m.kickoff ? (
              <div key={`day-${m.date}`} className="flex shrink-0 flex-col items-center justify-center px-1">
                <span className="[writing-mode:vertical-rl] rotate-180 text-[8px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]/70">
                  {fmtDay(m.kickoff)}
                </span>
              </div>
            ) : null;
          lastDate = m.date;
          return (
            <React.Fragment key={m.num}>
              {dayChip}
              <div ref={m.num === anchorNum ? anchorRef : undefined} className="flex">
                <RailCard
                  match={m}
                  index={i}
                  isLive={liveNums.includes(m.num)}
                  isNext={m.num === nextNum}
                  onClick={() => onOpenMatch(m)}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
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

function HeaderToolbar({
  viewingFriend,
  locked,
  onExitFriendView,
  onOpenFriends,
  onOpenLock,
  onReset,
}) {
  return (
    <div className="header-toolbar">
      {viewingFriend ? (
        <button
          type="button"
          onClick={onExitFriendView}
          className="header-action header-action--primary"
          title="Return to your bracket"
        >
          <IconUser />
          <span className="hidden sm:inline">My picks</span>
        </button>
      ) : (
        <>
          {locked ? (
            <span className="header-locked" title="Your picks are locked">
              <IconLock />
              <span className="hidden sm:inline">Locked</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={onOpenLock}
              className="header-action header-action--lock w-8 px-0 sm:w-auto sm:px-3"
              title="Lock your picks permanently"
            >
              <IconLock />
              <span className="hidden sm:inline">Lock</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenFriends}
            className="header-action header-action--friends w-8 px-0 sm:w-auto sm:px-3"
            title="View friends' predictions"
          >
            <IconUsers />
            <span className="hidden sm:inline">Friends</span>
          </button>
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
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// SCORE HUD — prediction points, always visible in the header.
// ----------------------------------------------------------------------------
function ScoreHUD({ stats }) {
  const points = useCountUp(stats.points);
  const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-full bg-[var(--gold)]/12 px-3 py-1 ring-1 ring-[var(--gold)]/30">
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--gold-bright)]/80">pts</span>
        <span className="font-display text-lg leading-none tracking-wider text-[var(--gold-bright)]">{points}</span>
      </div>
      {pct != null && (
        <div
          className="hidden items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1 ring-1 ring-[var(--border)] sm:flex"
          title={`${stats.correct} of ${stats.total} graded picks correct`}
        >
          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">acc</span>
          <span className={["font-display text-lg leading-none tracking-wider", pct >= 60 ? "text-[var(--pitch-glow)]" : "text-[var(--text-secondary)]"].join(" ")}>
            {pct}%
          </span>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// ROUND NAV — jump pills for the scrollable bracket.
// ----------------------------------------------------------------------------
function RoundNav({ activeRound, onJump, stats, liveRoundKey }) {
  return (
    <div className="mx-auto flex max-w-[1900px] flex-wrap items-center gap-1.5 px-4 py-2">
      {ROUNDS.map((r) => {
        const s = stats.byRound[r.key];
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onJump(r.key)}
            className={[
              "round-pill flex items-center gap-1.5 rounded-full px-3 py-1 text-[10.5px] font-bold text-[var(--text-secondary)]",
              activeRound === r.key ? "round-pill--active" : "",
            ].join(" ")}
          >
            {liveRoundKey === r.key && <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" />}
            {r.label}
            <span className="text-[9px] font-black text-[var(--text-muted)]">{r.points}pt</span>
            {s?.total > 0 && (
              <span className={["text-[9px] font-black", s.correct === s.total ? "text-[var(--pitch-glow)]" : "text-[var(--text-muted)]"].join(" ")}>
                {s.correct}/{s.total}✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// LOADING SKELETON
// ----------------------------------------------------------------------------
function LoadingScreen() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center gap-8 px-6 pt-6">
      <div className="ticker-scroll edge-fade-x flex w-full max-w-4xl gap-2 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-16 w-[9.5rem] shrink-0 rounded-xl" style={{ animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div className="flex flex-col items-center gap-3 pt-10">
        <div className="relative flex flex-col items-center">
          <span className="ball-bounce text-4xl">⚽</span>
          <span className="ball-shadow mt-1 h-1.5 w-8 rounded-full bg-black/60 blur-[2px]" />
        </div>
        <motion.p
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]"
        >
          Loading tournament
        </motion.p>
      </div>
      <div className="hidden w-full max-w-4xl items-center justify-center gap-4 lg:flex">
        {[8, 4, 2, 1].map((n, ci) => (
          <div key={ci} className="flex flex-1 flex-col justify-center gap-2" style={{ maxWidth: 130 }}>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="skeleton h-10 rounded-lg" style={{ animationDelay: `${(ci * 0.1 + i * 0.05).toFixed(2)}s` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SCROLLABLE BRACKET — left→right, all rounds, horizontal scroll.
// ----------------------------------------------------------------------------
function BracketColumn({ roundIdx, indices, align, winners, teams, onPick, actual, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, colRef, readOnly = false }) {
  const round = ROUNDS[roundIdx];
  const rowsPerMatch = BRACKET_ROWS / indices.length;
  return (
    <div ref={colRef} className="flex h-full w-[var(--match-card-w)] shrink-0 flex-col self-stretch">
      <div
        className="grid h-full min-h-0 flex-1"
        style={{ gridTemplateRows: `repeat(${BRACKET_ROWS}, var(--bracket-row))` }}
      >
        {indices.map((m, idx) => {
          const rk = key(round.key, m);
          const rowStart = idx * rowsPerMatch + 1;
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
                match={slotMatches[rk]}
                align={align}
                highlight={rk === liveKey ? "live" : rk === nextKey ? "next" : null}
                onFlagClick={onFlagClick}
                onOpenMatch={onOpenMatch}
                readOnly={readOnly}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScrollBracket({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, stats, liveRoundKey, readOnly = false }) {
  const scrollRef = useRef(null);
  const colRefs = useRef({}); // roundKey → [leftCol, rightCol?]
  const [activeRound, setActiveRound] = useState("r32");
  const centered = useRef(false);

  const setColRef = (roundKey, side) => (el) => {
    if (!colRefs.current[roundKey]) colRefs.current[roundKey] = {};
    colRefs.current[roundKey][side] = el;
  };

  const centerOn = useCallback((el, smooth = true) => {
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTo({
      left: el.offsetLeft - (container.clientWidth - el.clientWidth) / 2,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const jumpTo = useCallback(
    (roundKey) => {
      const cols = colRefs.current[roundKey] || {};
      const container = scrollRef.current;
      if (!container) return;
      setActiveRound(roundKey);
      // Jump to whichever side of the tree is closer to the current view.
      const mid = container.scrollLeft + container.clientWidth / 2;
      const target =
        cols.right && cols.left
          ? Math.abs(cols.left.offsetLeft - mid) <= Math.abs(cols.right.offsetLeft - mid)
            ? cols.left
            : cols.right
          : cols.left || cols.right;
      centerOn(target);
    },
    [centerOn]
  );

  // Track which round is nearest the viewport center while scrolling.
  const onScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const mid = container.scrollLeft + container.clientWidth / 2;
    let best = "r32";
    let bestDist = Infinity;
    for (const [roundKey, cols] of Object.entries(colRefs.current)) {
      for (const el of Object.values(cols)) {
        if (!el) continue;
        const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - mid);
        if (d < bestDist) {
          bestDist = d;
          best = roundKey;
        }
      }
    }
    setActiveRound(best);
  }, []);

  // Open centered on the final so both halves of the tree are visible.
  useEffect(() => {
    if (centered.current) return;
    const el = colRefs.current.final?.left;
    if (el) {
      centerOn(el, false);
      centered.current = true;
    }
  });

  // Connector activity per side: left = first half of the round, right = second.
  const activeFor = (roundIdx, side) => {
    const half = ROUNDS[roundIdx].matches / 2;
    const base = side === "left" ? 0 : half;
    return Array.from({ length: half }, (_, i) => !!winners[key(ROUNDS[roundIdx].key, base + i)]);
  };
  const sideIdx = (roundIdx, side) => {
    const half = ROUNDS[roundIdx].matches / 2;
    const base = side === "left" ? 0 : half;
    return Array.from({ length: half }, (_, i) => base + i);
  };

  const shared = { winners, teams, onPick, actual, slotMatches, liveKey, nextKey, onFlagClick, onOpenMatch, readOnly };

  return (
    <>
      <RoundNav activeRound={activeRound} onJump={jumpTo} stats={stats} liveRoundKey={liveRoundKey} />
      <div ref={scrollRef} onScroll={onScroll} className="nice-scroll overflow-x-auto pb-4">
        <div className="mx-auto flex w-max items-stretch gap-0 px-4" style={{ height: `calc(${BRACKET_ROWS} * var(--bracket-row))` }}>
          {/* LEFT half of the tree */}
          <BracketColumn roundIdx={0} indices={sideIdx(0, "left")} align="left" colRef={setColRef("r32", "left")} {...shared} />
          <Connector count={8} side="left" active={activeFor(0, "left")} />
          <BracketColumn roundIdx={1} indices={sideIdx(1, "left")} align="left" colRef={setColRef("r16", "left")} {...shared} />
          <Connector count={4} side="left" active={activeFor(1, "left")} />
          <BracketColumn roundIdx={2} indices={sideIdx(2, "left")} align="left" colRef={setColRef("qf", "left")} {...shared} />
          <Connector count={2} side="left" active={activeFor(2, "left")} />
          <BracketColumn roundIdx={3} indices={sideIdx(3, "left")} align="left" colRef={setColRef("sf", "left")} {...shared} />
          <SFFinalConnector active={!!winners[key("sf", 0)]} />

          {/* CENTER — trophy, final, champion, third place */}
          <div ref={setColRef("final", "left")} className="flex h-full items-stretch">
            <PodiumColumn {...shared} champion={champion} actualChampion={actualChampion} />
          </div>

          {/* RIGHT half of the tree (mirrored) */}
          <SFFinalConnector active={!!winners[key("sf", 1)]} />
          <BracketColumn roundIdx={3} indices={sideIdx(3, "right")} align="right" colRef={setColRef("sf", "right")} {...shared} />
          <Connector count={2} side="right" active={activeFor(2, "right")} />
          <BracketColumn roundIdx={2} indices={sideIdx(2, "right")} align="right" colRef={setColRef("qf", "right")} {...shared} />
          <Connector count={4} side="right" active={activeFor(1, "right")} />
          <BracketColumn roundIdx={1} indices={sideIdx(1, "right")} align="right" colRef={setColRef("r16", "right")} {...shared} />
          <Connector count={8} side="right" active={activeFor(0, "right")} />
          <BracketColumn roundIdx={0} indices={sideIdx(0, "right")} align="right" colRef={setColRef("r32", "right")} {...shared} />
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl tracking-wider text-[var(--text-primary)]">Welcome to WC26</h2>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">Enter your name to save picks and see friends&apos; predictions.</p>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          autoFocus
          className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--pitch-glow)]/50"
        />
        {error && <p className="text-xs font-semibold text-[var(--live)]">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="rounded-xl bg-[var(--pitch)] px-4 py-3 text-sm font-bold tracking-tight text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Start picking"}
        </button>
      </form>
    </Modal>
  );
}

function FriendsModal({ open, onClose, friends, currentUid, onSelect }) {
  return (
    <Modal open={open} onClose={onClose} maxW="max-w-md">
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="font-display text-xl tracking-wider">Friends Predictions</h2>
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
                const hasGraded = friend.total > 0;
                return (
                  <li key={friend.uid}>
                    <button
                      type="button"
                      onClick={() => onSelect(friend)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-[var(--bg-elevated)]"
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
                          {friend.locked && (
                            <span className="shrink-0 text-[10px]" title="Locked">
                              🔒
                            </span>
                          )}
                          {isMe && (
                            <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-[var(--pitch-glow)]">You</span>
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
            Once locked, you cannot change your bracket. Only an admin can unlock it from the database. This prevents editing after results are known.
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
  const [winners, setWinners] = useState(loadStoredWinners);
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
    authReady,
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
  const displayWinners = useMemo(() => {
    const w = viewingFriend?.winners ?? winners;
    return teams.length === 32 ? normalize(w, teams) : w;
  }, [viewingFriend, winners, teams]);
  const slotMatches = useMemo(() => buildSlotMatches(byNum), [byNum]);
  const actual = useMemo(() => buildActual(slotMatches), [slotMatches]);

  const knockouts = useMemo(
    () =>
      matches
        .filter((m) => m.isKnockout)
        .sort((x, y) => (x.kickoff?.getTime() ?? 0) - (y.kickoff?.getTime() ?? 0)),
    [matches]
  );

  const liveNums = useMemo(() => knockouts.filter((m) => m.status === "live").map((m) => m.num), [knockouts]);
  const nextMatch = useMemo(() => {
    const now = Date.now();
    return knockouts.find((m) => m.status === "upcoming" && m.kickoff && m.kickoff.getTime() > now) || null;
  }, [knockouts]);

  const numToSlot = useMemo(() => {
    const map = new Map();
    for (const [k, m] of Object.entries(slotMatches)) map.set(m.num, k);
    return map;
  }, [slotMatches]);
  const liveKey = liveNums.length ? numToSlot.get(liveNums[0]) : null;
  const nextKey = nextMatch ? numToSlot.get(nextMatch.num) : null;
  const liveRoundKey = liveKey ? liveKey.split("-")[0] : null;

  // Re-validate stored picks once bracket seeds load.
  useEffect(() => {
    if (teams.length === 32 && !locked) setWinners((w) => normalize(w, teams));
  }, [teams.length, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (readOnly) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(winners));
    } catch {
      /* ignore quota errors */
    }
  }, [winners, readOnly]);

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
      if (readOnly) return;
      const rk = roundIdx === "third" ? "third-0" : key(ROUNDS[roundIdx].key, matchIdx);
      setWinners((prev) => {
        const next = { ...prev };
        if (next[rk] === team.id) delete next[rk];
        else next[rk] = team.id;
        return normalize(next, teams);
      });
    },
    [teams, readOnly]
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
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
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

  // Grade picks against real results as they land.
  const stats = useMemo(() => gradeWinners(displayWinners, actual), [displayWinners, actual]);

  const rankedFriends = useMemo(
    () =>
      friends
        .map((friend) => ({
          ...friend,
          ...gradeWinners(friend.winners, actual),
        }))
        .sort(
          (a, b) =>
            b.correct - a.correct ||
            b.points - a.points ||
            b.total - a.total ||
            a.name.localeCompare(b.name)
        ),
    [friends, actual]
  );

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
    readOnly,
  };
  const showBracket = teams.length === 32;

  return (
    <div className="app-shell text-[var(--text-primary)]">
      <Confetti fire={confetti} />
      {authReady && needsName && <NameModal onSubmit={submitName} />}
      <FriendsModal
        open={showFriends}
        onClose={() => setShowFriends(false)}
        friends={rankedFriends}
        currentUid={uid}
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
      <MatchModal match={matchModal} onClose={() => setMatchModal(null)} onFlagClick={(t) => { setMatchModal(null); setTeamModal(t); }} />

      {/* HEADER */}
      <header className="broadcast-bar sticky top-0 z-40">
        <div className="mx-auto flex max-w-[1900px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
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

          <div className="header-controls">
            <ScoreHUD stats={stats} />
            <HeaderToolbar
              viewingFriend={viewingFriend}
              locked={locked}
              onExitFriendView={exitFriendView}
              onOpenFriends={() => setShowFriends(true)}
              onOpenLock={() => setShowLockConfirm(true)}
              onReset={resetBracket}
            />
          </div>
        </div>
      </header>

      {viewingFriend && (
        <div className="border-b border-[var(--pitch-glow)]/20 bg-[color-mix(in_oklch,var(--pitch)_18%,transparent)] px-4 py-2 text-center text-[11px] font-semibold text-[var(--pitch-glow)]">
          Viewing as: {viewingFriend.name}
          {stats.total > 0 && (
            <span className="text-[var(--gold-bright)]">
              {" "}
              · {stats.points} pts · {stats.correct}/{stats.total} correct
            </span>
          )}
          {" "}— picks are read-only
        </div>
      )}

      {!viewingFriend && locked && (
        <div className="border-b border-[var(--gold)]/25 bg-[color-mix(in_oklch,var(--gold)_12%,transparent)] px-4 py-2 text-center text-[11px] font-semibold text-[var(--gold-bright)]">
          Your picks are locked — contact an admin to unlock
        </div>
      )}

      {/* GAMES RAIL — linear, chronological */}
      {knockouts.length > 0 && (
        <GamesRail matches={knockouts} liveNums={liveNums} nextNum={nextMatch?.num ?? null} onOpenMatch={setMatchModal} />
      )}

      {error && (
        <div className="mx-auto max-w-7xl px-4 pt-2 text-center text-[11px] font-semibold text-amber-400/80">
          Could not refresh live scores — showing last known data.
        </div>
      )}

      {/* BRACKET */}
      <main>
        {!showBracket &&
          (loading ? (
            <LoadingScreen />
          ) : (
            <div className="py-24 text-center text-sm text-[var(--text-muted)]">
              Bracket seeds not available yet — the Round of 32 line-up appears once the group stage is complete.
            </div>
          ))}

        {showBracket && (
          <ScrollBracket
            {...bracketProps}
            champion={champion}
            actualChampion={actualChampion}
            stats={stats}
            liveRoundKey={liveRoundKey}
          />
        )}
      </main>

      <footer className="px-4 pb-6 pt-1 text-center text-[10.5px] font-medium text-[var(--text-muted)]/70">
        {viewingFriend ? (
          <>Viewing {viewingFriend.name}&apos;s bracket — tap flags or match details to explore. Use &ldquo;My picks&rdquo; to return to yours.</>
        ) : locked ? (
          <>Your bracket is locked — picks cannot be changed until an admin unlocks your entry in the database.</>
        ) : (
          <>
            Tap a team code to advance them · tap a flag for their tournament journey · tap the middle of a card for full match details.
            Picks auto-save to the cloud{name ? ` as ${name}` : ""} & auto-grade against live results (refreshes every minute).
          </>
        )}
      </footer>
    </div>
  );
}
