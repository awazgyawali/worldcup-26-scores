import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/* ============================================================================
 *  FIFA WORLD CUP 2026 — KNOCKOUT BRACKET PREDICTOR
 *  R32 matchups load from openfootball/worldcup.json in official bracket order.
 * ==========================================================================*/

// ----------------------------------------------------------------------------
// TEAM METADATA — iso2 codes for flagcdn; display names for JSON aliases.
// ----------------------------------------------------------------------------
const TEAM_ISO2 = {
  Algeria: "dz",
  Argentina: "ar",
  Australia: "au",
  Austria: "at",
  Belgium: "be",
  "Bosnia & Herzegovina": "ba",
  Brazil: "br",
  Canada: "ca",
  "Cape Verde": "cv",
  Colombia: "co",
  Croatia: "hr",
  "Curaçao": "cw",
  "Czech Republic": "cz",
  "DR Congo": "cd",
  Ecuador: "ec",
  Egypt: "eg",
  England: "gb-eng",
  France: "fr",
  Germany: "de",
  Ghana: "gh",
  Haiti: "ht",
  Iran: "ir",
  Iraq: "iq",
  "Ivory Coast": "ci",
  Japan: "jp",
  Jordan: "jo",
  Mexico: "mx",
  Morocco: "ma",
  Netherlands: "nl",
  "New Zealand": "nz",
  Norway: "no",
  Panama: "pa",
  Paraguay: "py",
  Portugal: "pt",
  Qatar: "qa",
  "Saudi Arabia": "sa",
  Scotland: "gb-sct",
  Senegal: "sn",
  "South Africa": "za",
  "South Korea": "kr",
  Spain: "es",
  Sweden: "se",
  Switzerland: "ch",
  Tunisia: "tn",
  Turkey: "tr",
  USA: "us",
  Uruguay: "uy",
  Uzbekistan: "uz",
  "United States": "us",
};

const TEAM_DISPLAY = {
  USA: "United States",
};

// JSON match numbers → bracket slots 0–15 (left half 0–7, right half 8–15).
// Derived from R16 feeder paths (W74, W77, …) in the official knockout tree.
const R32_SLOT_TO_JSON_NUM = [
  74, 77, 73, 75, 83, 84, 81, 82, // left half
  76, 78, 79, 80, 86, 88, 85, 87, // right half
];

const makeTeam = (jsonName, index) => {
  const name = TEAM_DISPLAY[jsonName] || jsonName;
  const iso2 = isoForName(jsonName === name ? name : jsonName) || isoForName(name);
  return { id: `${iso2}-${index}`, name, iso2 };
};

const buildR32TeamsFromMatches = (byNum) => {
  const teams = [];
  for (let slot = 0; slot < R32_SLOT_TO_JSON_NUM.length; slot++) {
    const m = byNum.get(R32_SLOT_TO_JSON_NUM[slot]);
    if (!m) return null;
    teams.push(makeTeam(m.team1, slot * 2));
    teams.push(makeTeam(m.team2, slot * 2 + 1));
  }
  return teams.length === 32 ? teams : null;
};

// Rounds from the outside in. `matches` is the TOTAL across both halves.
const ROUNDS = [
  { key: "r32", label: "Round of 32", matches: 16, points: 1 },
  { key: "r16", label: "Round of 16", matches: 8, points: 2 },
  { key: "qf", label: "Quarterfinal", matches: 4, points: 4 },
  { key: "sf", label: "Semifinal", matches: 2, points: 7 },
  { key: "final", label: "Final", matches: 1, points: 12 },
];
const FINAL_ROUND = ROUNDS.length - 1;
const key = (r, m) => `${r}-${m}`;
/** Rows per bracket half — all rounds + connectors share this vertical grid. */
const BRACKET_ROWS = 8;
/** Every match card uses the same width:height ratio across R32 → Final. */
const MATCH_CARD_ASPECT = 1.6;
/** Card height as a fraction of one bracket row (R32 slot). */
const MATCH_CARD_ROW_FRAC = 0.9;

// ----------------------------------------------------------------------------
// LIVE DATA — openfootball/worldcup.json (knockout scores + kickoffs)
// ----------------------------------------------------------------------------
const WORLDCUP_JSON_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/refs/heads/master/2026/worldcup.json";
/** Re-fetch the full worldcup.json every 60 seconds (scores, times, R32 teams). */
const POLL_EVERY_MS = 60_000;

const KNOCKOUT_ROUNDS = new Set([
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Final",
]);

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

const normTeam = (name) => {
  if (!name || /^[WL]\d+$/.test(name)) return "";
  const n = name.trim().toLowerCase();
  return TEAM_ALIASES[n] || n;
};

const teamsMatch = (a, b) => !!normTeam(a) && normTeam(a) === normTeam(b);

const pairKey = (a, b) => [normTeam(a), normTeam(b)].sort().join("|");

const teamById = (id, teams) => teams?.find((t) => t.id === id) || null;

const teamByName = (name, teams) => {
  if (!name || !teams?.length) return null;
  const n = normTeam(name);
  return teams.find((t) => normTeam(t.name) === n) || null;
};

const parseKickoff = (date, timeStr) => {
  if (!date || !timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s+UTC([+-]?\d+)/);
  if (!m) return null;
  const [, hh, mm, off] = m;
  const offsetHours = parseInt(off, 10);
  const utcH = parseInt(hh, 10) - offsetHours;
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, utcH, parseInt(mm, 10)));
};

const resolveTeamRef = (ref, byNum) => {
  if (!ref) return null;
  if (!/^[WL]\d+$/.test(ref)) return ref;
  const isWinner = ref[0] === "W";
  const num = parseInt(ref.slice(1), 10);
  const match = byNum.get(num);
  if (!match) return ref;
  const t1 = resolveTeamRef(match.team1, byNum);
  const t2 = resolveTeamRef(match.team2, byNum);
  if (!match.score?.ft) return ref;
  const [s1, s2] = match.score.ft;
  if (s1 === s2) return ref;
  const winner = s1 > s2 ? t1 : t2;
  const loser = s1 > s2 ? t2 : t1;
  return isWinner ? winner : loser;
};

const getMatchStatus = (kickoff, hasScore) => {
  if (hasScore) return "ft";
  if (!kickoff) return "scheduled";
  const now = Date.now();
  const start = kickoff.getTime();
  if (now < start) return "scheduled";
  if (now < start + 105 * 60_000) return "live";
  return "scheduled";
};

const hasFinalScore = (live) => live?.score1 != null && live?.score2 != null;

const resolveLiveStatus = (live) => {
  if (!live) return null;
  return getMatchStatus(live.kickoff, hasFinalScore(live));
};

const formatKickoff = (d) =>
  d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const formatMatchTime = (d) => {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return formatKickoff(d);
};

const isoForName = (name) => {
  if (!name) return "un";
  const display = TEAM_DISPLAY[name] || name;
  if (TEAM_ISO2[name]) return TEAM_ISO2[name];
  if (TEAM_ISO2[display]) return TEAM_ISO2[display];
  const n = normTeam(name);
  for (const [key, iso] of Object.entries(TEAM_ISO2)) {
    if (normTeam(key) === n) return iso;
  }
  return "un";
};

const buildTeamHistories = (allMatches, byNum) => {
  const histories = new Map();
  const add = (teamName, entry) => {
    const k = normTeam(teamName);
    if (!k) return;
    if (!histories.has(k)) histories.set(k, []);
    histories.get(k).push(entry);
  };

  for (const m of allMatches) {
    const t1 = /^[WL]\d+$/.test(m.team1) ? resolveTeamRef(m.team1, byNum) : m.team1;
    const t2 = /^[WL]\d+$/.test(m.team2) ? resolveTeamRef(m.team2, byNum) : m.team2;
    if (!t1 || !t2 || /^[WL]\d+$/.test(t1) || /^[WL]\d+$/.test(t2)) continue;

    const kickoff = parseKickoff(m.date, m.time);
    const hasScore = Array.isArray(m.score?.ft);
    const [s1, s2] = hasScore ? m.score.ft : [null, null];
    const status = getMatchStatus(kickoff, hasScore);
    const base = {
      round: m.round,
      group: m.group || null,
      date: m.date,
      kickoff,
      ground: m.ground || null,
      status,
    };

    add(t1, {
      ...base,
      opponent: TEAM_DISPLAY[t2] || t2,
      opponentIso2: isoForName(t2),
      goalsFor: s1,
      goalsAgainst: s2,
    });
    add(t2, {
      ...base,
      opponent: TEAM_DISPLAY[t1] || t1,
      opponentIso2: isoForName(t1),
      goalsFor: s2,
      goalsAgainst: s1,
    });
  }

  for (const list of histories.values()) {
    list.sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));
  }
  return histories;
};

const processWorldCupJson = (data) => {
  const allMatches = data?.matches || [];
  const byNum = new Map();
  allMatches.forEach((m) => {
    if (m.num) byNum.set(m.num, m);
  });

  const knockout = allMatches.filter((m) => KNOCKOUT_ROUNDS.has(m.round));

  const enriched = knockout.map((m) => {
    const t1 = resolveTeamRef(m.team1, byNum);
    const t2 = resolveTeamRef(m.team2, byNum);
    const kickoff = parseKickoff(m.date, m.time);
    const hasScore = Array.isArray(m.score?.ft);
    let score1 = null;
    let score2 = null;
    let winner = null;
    if (hasScore) {
      [score1, score2] = m.score.ft;
      if (score1 !== score2) winner = score1 > score2 ? t1 : t2;
    }
    return {
      ...m,
      t1,
      t2,
      kickoff,
      score1,
      score2,
      winner,
      status: getMatchStatus(kickoff, hasScore),
    };
  });

  const byPair = new Map();
  enriched.forEach((m) => {
    if (m.t1 && m.t2 && !/^[WL]\d+$/.test(m.t1) && !/^[WL]\d+$/.test(m.t2)) {
      byPair.set(pairKey(m.t1, m.t2), m);
    }
  });

  return {
    byPair,
    byNum,
    enriched,
    r32Teams: buildR32TeamsFromMatches(byNum),
    teamHistories: buildTeamHistories(allMatches, byNum),
  };
};

/** Find the live match and the next upcoming knockout fixture (by JSON kickoff). */
const computeMatchHighlights = (enriched, liveByKey) => {
  const now = Date.now();
  let liveNum = null;
  let nextNum = null;
  let nextKickoff = Infinity;

  for (const m of enriched ?? []) {
    if (/^[WL]\d+$/.test(m.t1) || /^[WL]\d+$/.test(m.t2)) continue;
    const status = resolveLiveStatus(m);
    if (status === "live") liveNum = m.num;
    if (status === "scheduled" && m.kickoff) {
      const t = m.kickoff.getTime();
      if (t > now && t < nextKickoff) {
        nextKickoff = t;
        nextNum = m.num;
      }
    }
  }

  let liveKey = null;
  let nextKey = null;
  for (const [k, live] of Object.entries(liveByKey ?? {})) {
    if (live.num === liveNum) liveKey = k;
    if (live.num === nextNum) nextKey = k;
    if (!liveKey && resolveLiveStatus(live) === "live") liveKey = k;
  }

  if (!nextKey) {
    let fallbackKickoff = Infinity;
    for (const [k, live] of Object.entries(liveByKey ?? {})) {
      if (resolveLiveStatus(live) !== "scheduled" || !live.kickoff) continue;
      const t = live.kickoff.getTime();
      if (t > now && t < fallbackKickoff) {
        fallbackKickoff = t;
        nextKey = k;
      }
    }
  }

  return { liveKey, nextKey };
};

const getLiveForTeams = (byPair, teamA, teamB) => {
  if (!teamA || !teamB || !byPair?.size) return null;
  return byPair.get(pairKey(teamA.name, teamB.name)) || null;
};

function useWorldCupLive() {
  const [byPair, setByPair] = useState(() => new Map());
  const [knockout, setKnockout] = useState([]);
  const [teamHistories, setTeamHistories] = useState(() => new Map());
  const [r32Teams, setR32Teams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [, setTick] = useState(0);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch(WORLDCUP_JSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const processed = processWorldCupJson(data);
      setByPair(processed.byPair);
      setKnockout(processed.enriched);
      setTeamHistories(processed.teamHistories);
      if (processed.r32Teams) setR32Teams(processed.r32Teams);
      setLastUpdated(new Date());
      setError(null);
      return processed;
    } catch (e) {
      setError(e.message || "Failed to load scores");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const refreshId = setInterval(fetchLive, POLL_EVERY_MS);
    const tickId = setInterval(() => setTick((t) => t + 1), 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchLive();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(refreshId);
      clearInterval(tickId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchLive]);

  return { byPair, knockout, teamHistories, r32Teams, loading, lastUpdated, error, refresh: fetchLive };
}

const buildActualFromLive = (byPair, teams) => {
  if (!teams?.length) return {};
  const actual = {};
  for (let r = 0; r < ROUNDS.length; r++) {
    for (let m = 0; m < ROUNDS[r].matches; m++) {
      const [a, b] = getMatchTeams(r, m, actual, teams);
      if (!a || !b) continue;
      const live = getLiveForTeams(byPair, a, b);
      if (!live?.winner) continue;
      const wTeam = teamsMatch(live.winner, a.name) ? a : teamsMatch(live.winner, b.name) ? b : null;
      if (wTeam) actual[key(ROUNDS[r].key, m)] = wTeam.id;
    }
  }
  return actual;
};

// Reference bracket outcome (the full projected run from the official bracket).
// Each value must be a team that actually reaches that match — the set below is
// self-consistent through to the champion. Edit any line to re-grade instantly.
const ACTUAL_RESULTS_BY_NAME = {
  // Round of 32 — LEFT
  "r32-0": "Germany", "r32-1": "France", "r32-2": "Switzerland", "r32-3": "Netherlands",
  "r32-4": "Croatia", "r32-5": "Spain", "r32-6": "United States", "r32-7": "Belgium",
  // Round of 32 — RIGHT
  "r32-8": "Brazil", "r32-9": "Senegal", "r32-10": "Mexico", "r32-11": "England",
  "r32-12": "Argentina", "r32-13": "Iran", "r32-14": "Italy", "r32-15": "Portugal",
  // Round of 16
  "r16-0": "France", "r16-1": "Netherlands", "r16-2": "Spain", "r16-3": "Belgium",
  "r16-4": "Brazil", "r16-5": "England", "r16-6": "Argentina", "r16-7": "Portugal",
  // Quarterfinals
  "qf-0": "France", "qf-1": "Spain", "qf-2": "England", "qf-3": "Argentina",
  // Semifinals
  "sf-0": "Spain", "sf-1": "Argentina",
  // Final
  "final-0": "Spain",
};

const buildActualWinners = (teams) => {
  const out = {};
  for (const [k, name] of Object.entries(ACTUAL_RESULTS_BY_NAME)) {
    const t = teamByName(name, teams);
    if (t) out[k] = t.id;
  }
  return out;
};

const STORAGE_KEY = "wc26-bracket-winners-v3";
const ACCENT = "#52b87a";
const ACCENT_DIM = "rgba(109, 127, 150, 0.35)";

// ----------------------------------------------------------------------------
// BRACKET LOGIC
// ----------------------------------------------------------------------------
// Returns the two teams contesting a given match, derived from prior winners.
function getMatchTeams(roundIdx, matchIdx, winners, teams) {
  if (!teams?.length) return [null, null];
  if (roundIdx === 0) {
    return [teams[matchIdx * 2], teams[matchIdx * 2 + 1]];
  }
  const prev = ROUNDS[roundIdx - 1].key;
  return [
    teamById(winners[key(prev, matchIdx * 2)], teams),
    teamById(winners[key(prev, matchIdx * 2 + 1)], teams),
  ];
}

// Cascade-clear any stored winner that is no longer valid for its match.
function normalize(winners, teams) {
  if (!teams?.length) return winners;
  const w = { ...winners };
  for (let r = 1; r < ROUNDS.length; r++) {
    const { key: rk, matches } = ROUNDS[r];
    for (let m = 0; m < matches; m++) {
      const [a, b] = getMatchTeams(r, m, w, teams);
      const cur = w[key(rk, m)];
      if (cur && cur !== a?.id && cur !== b?.id) delete w[key(rk, m)];
    }
  }
  return w;
}

function loadStoredWinners() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------------------
// SMALL HOOKS / HELPERS
// ----------------------------------------------------------------------------
function useCountUp(target, run, duration = 1100) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) {
      setVal(0);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return val;
}

const flagSrc = (iso2) => `https://flagcdn.com/w80/${iso2}.png`;
const flagSrcSet = (iso2) =>
  `https://flagcdn.com/w80/${iso2}.png 1x, https://flagcdn.com/w160/${iso2}.png 2x`;

// ----------------------------------------------------------------------------
// WC26 LOGO — a self-contained badge mark (trophy + "26").
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
          <stop offset="0%" stopColor="#1c2a3d" />
          <stop offset="100%" stopColor="#111a27" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="none" stroke="url(#wcRing)" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="18" fill="url(#wcInner)" stroke="rgba(240,235,227,0.08)" strokeWidth="1" />
      <g fill="#d4a84b">
        <path d="M18 14h12v5.5a6 6 0 0 1-12 0V14Z" />
        <path d="M16.5 15.2h-2.8a2.8 2.8 0 0 0 3.2 3.2l-.4-1.6a1.1 1.1 0 0 1-1.3-1.3h1.3v-.3Zm15 0h2.8a2.8 2.8 0 0 1-3.2 3.2l.4-1.6a1.1 1.1 0 0 0 1.3-1.3h-1.5v-.3Z" />
        <rect x="22.5" y="24.5" width="3" height="3.5" rx="0.5" />
        <rect x="19" y="27.5" width="10" height="2.2" rx="1.1" />
      </g>
      <text
        x="24"
        y="38.5"
        textAnchor="middle"
        fontSize="10"
        fontWeight="400"
        fill="#f0ebe3"
        fontFamily="Bebas Neue, sans-serif"
        letterSpacing="1.5"
      >
        26
      </text>
    </svg>
  );
}

// ----------------------------------------------------------------------------
// SVG CONNECTORS — percentage geometry on an 8-row bracket grid; non-scaling stroke
// keeps line weight constant. Match centers sit at (i + 0.5) / count within each column.
// ----------------------------------------------------------------------------
function Connector({ count, side, active }) {
  // `count` source matches on this side merge into count/2 targets.
  const paths = [];
  for (let i = 0; i < count; i++) {
    const y1 = i + 0.5;
    const y2 = i % 2 === 0 ? i + 1 : i; // merged target center (units)
    const d =
      side === "left"
        ? `M0,${y1} H50 V${y2} H100`
        : `M100,${y1} H50 V${y2} H0`;
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
    <div className="shrink-0 self-stretch" style={{ width: 34 }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 100 ${count}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
      >
        {paths}
      </svg>
    </div>
  );
}

// Final match sits at the vertical center of the bracket; semifinal feeders meet it there.
const FINAL_PCT = 50;

// Connector from Semifinal (vertical center) to the Final at bracket midpoint.
function SFFinalConnector({ side, active }) {
  const d =
    side === "left"
      ? `M0,50 H55 V${FINAL_PCT} H100`
      : `M100,50 H45 V${FINAL_PCT} H0`;
  return (
    <div className="shrink-0 self-stretch" style={{ width: 40 }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="block h-full w-full"
      >
        <path
          d={d}
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
// TEAM ROW + MATCH CARD
// ----------------------------------------------------------------------------
function LiveIndicator() {
  return (
    <div className="flex items-center justify-center gap-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--live)]">
      <span className="relative flex h-1.5 w-1.5">
        <span className="live-dot absolute inline-flex h-full w-full rounded-full bg-[var(--live)]" />
      </span>
      Live
    </div>
  );
}

function TeamHistoryModal({ team, matches, onClose }) {
  useEffect(() => {
    if (!team) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [team, onClose]);

  if (!team) return null;

  const wins = matches.filter((m) => m.goalsFor != null && m.goalsFor > m.goalsAgainst).length;
  const played = matches.filter((m) => m.goalsFor != null).length;

  return (
    <AnimatePresence>
      <motion.div
        key="history-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--bg-deep)]/85 p-4 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="flex max-h-[min(85vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5">
            <img
              src={flagSrc(team.iso2)}
              srcSet={flagSrcSet(team.iso2)}
              alt=""
              className="h-10 w-14 rounded-sm object-cover shadow-md ring-1 ring-black/40"
            />
            <div className="min-w-0 flex-1">
              <h2 className="font-display truncate text-2xl tracking-wide text-[var(--text-primary)]">
                {team.name}
              </h2>
              <p className="text-[11px] font-medium text-[var(--text-muted)]">
                {played > 0 ? `${wins}W · ${played} played` : "Tournament results"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {matches.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No matches found yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {matches.map((m, i) => {
                  const scored = m.goalsFor != null && m.goalsAgainst != null;
                  const won = scored && m.goalsFor > m.goalsAgainst;
                  const lost = scored && m.goalsFor < m.goalsAgainst;
                  const label = m.group || m.round;
                  return (
                    <li
                      key={`${m.date}-${m.opponent}-${i}`}
                      className={[
                        "rounded-lg border px-3 py-2.5",
                        won
                          ? "border-[color-mix(in_oklch,var(--pitch-glow)_30%,transparent)] bg-[color-mix(in_oklch,var(--pitch)_12%,transparent)]"
                          : lost
                          ? "border-[color-mix(in_oklch,var(--live)_20%,transparent)] bg-[color-mix(in_oklch,var(--live)_6%,transparent)]"
                          : "border-[var(--border)] bg-[var(--bg-elevated)]",
                      ].join(" ")}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                          {label}
                        </span>
                        {m.kickoff && (
                          <span className="shrink-0 text-[10px] tabular-nums text-slate-600">
                            {formatKickoff(m.kickoff)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <img
                          src={flagSrc(m.opponentIso2)}
                          alt=""
                          className="h-5 w-7 shrink-0 rounded-[3px] object-cover ring-1 ring-black/30"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">
                          vs {m.opponent}
                        </span>
                        {scored ? (
                          <span
                            className={[
                              "shrink-0 rounded-md px-2 py-0.5 text-sm font-extrabold tabular-nums",
                              won
                                ? "bg-emerald-500/20 text-emerald-200"
                                : lost
                                ? "bg-rose-500/15 text-rose-200"
                                : "bg-white/5 text-slate-300",
                            ].join(" ")}
                          >
                            {m.goalsFor}–{m.goalsAgainst}
                          </span>
                        ) : m.status === "live" ? (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-rose-300">
                            Live
                          </span>
                        ) : m.kickoff ? (
                          <span className="text-[11px] font-medium tabular-nums text-slate-400">
                            {formatMatchTime(m.kickoff)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-600">TBD</span>
                        )}
                      </div>
                      {m.ground && (
                        <p className="mt-1 truncate text-[10px] text-slate-600">{m.ground}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function TeamRow({
  team,
  isWinner,
  isLoser,
  onPick,
  onFlagClick,
  verdict,
  align,
  locked,
  score,
  showScoreSlot = true,
}) {
  const empty = !team;
  const disabled = empty || locked; // can't pick until both teams are set
  const right = align === "right";

  let stripClass = "team-strip";
  let text = "text-[var(--text-secondary)]";
  if (isWinner) {
    stripClass += right ? " team-strip--winner team-strip--right" : " team-strip--winner";
    text = "text-[var(--text-primary)] font-semibold";
  }
  if (isLoser) text = "text-[var(--text-muted)]";
  if (verdict === "correct") {
    stripClass += right ? " team-strip--winner team-strip--right" : " team-strip--winner";
    text = "text-[var(--pitch-glow)] font-semibold";
  } else if (verdict === "wrong") {
    text = "text-[var(--live)] line-through decoration-[var(--live)]/50";
  } else if (verdict === "missed") {
    text = "text-[var(--pitch-glow)]/80";
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && team && onPick(team)}
      title={locked && !empty ? "Both teams must be decided first" : undefined}
      className={[
        "group/row relative flex w-full items-center rounded-sm transition-all duration-200",
        "gap-1.5 px-1.5 py-0.5",
        right ? "flex-row-reverse text-right" : "text-left",
        stripClass,
        right && isWinner ? "team-strip--right" : "",
        empty ? "cursor-default" : locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        text,
      ].join(" ")}
    >
      {empty ? (
        <span className="grid h-5 w-7 shrink-0 place-items-center rounded-sm bg-[var(--bg-elevated)] text-[10px] font-bold text-[var(--text-muted)]">
          ?
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFlagClick?.(team);
          }}
          title="View match history"
          className="h-5 w-7 shrink-0 overflow-hidden rounded-sm shadow-sm ring-1 ring-black/40 transition hover:ring-[var(--gold)]/50 hover:brightness-110"
        >
          <img
            src={flagSrc(team.iso2)}
            srcSet={flagSrcSet(team.iso2)}
            alt=""
          width={28}
          height={20}
            loading="lazy"
            className="pointer-events-none h-full w-full rounded-[3px] object-cover"
          />
        </button>
      )}

      <span
        className={[
          "min-w-0 flex-1 truncate font-semibold tracking-tight text-[12px] leading-tight",
          text,
        ].join(" ")}
      >
        {empty ? <span className="text-[var(--text-muted)]">TBD</span> : team.name}
      </span>

      {/* check / verdict marker */}
      <span className="flex w-4 shrink-0 items-center justify-center">
        {verdict === "correct" ? (
          <span className="text-[var(--pitch-glow)]">✓</span>
        ) : verdict === "wrong" ? (
          <span className="text-[var(--live)]">✕</span>
        ) : verdict === "missed" ? (
          <span className="text-[8px] font-bold uppercase tracking-wide text-[var(--pitch-glow)]/70">won</span>
        ) : isWinner ? (
          <motion.span
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-[var(--pitch-glow)]"
          >
            ✓
          </motion.span>
        ) : null}
      </span>

      {showScoreSlot && (
      <span
        className={[
          "grid h-5 w-6 shrink-0 place-items-center rounded-sm font-bold tabular-nums",
          score != null
            ? isWinner
              ? "bg-[color-mix(in_oklch,var(--pitch)_25%,transparent)] text-[var(--text-primary)]"
              : "bg-[var(--bg-deep)] text-[var(--text-secondary)]"
            : "bg-[var(--bg-deep)] text-[var(--text-muted)]",
        ].join(" ")}
      >
        {score != null ? score : "–"}
      </span>
      )}
    </button>
  );
}

function MatchCard({
  roundIdx,
  matchIdx,
  teams,
  winnerId,
  onPick,
  reveal,
  actualId,
  align = "left",
  fluid = false,
  live,
  highlight = null,
  onFlagClick,
}) {
  const [a, b] = teams;
  const decided = !!winnerId;
  const ready = !!a && !!b; // both teams known → match is pickable
  const status = resolveLiveStatus(live);

  let scoreA = null;
  let scoreB = null;
  if (live && a && b) {
    if (teamsMatch(a.name, live.t1)) {
      scoreA = live.score1;
      scoreB = live.score2;
    } else if (teamsMatch(a.name, live.t2)) {
      scoreA = live.score2;
      scoreB = live.score1;
    }
  }

  const showScores = status === "ft" || (status === "live" && hasFinalScore(live));
  const showTime = status === "scheduled" && live?.kickoff;
  const showLive = status === "live";

  const verdictFor = (team) => {
    if (!reveal || !actualId || !team) return undefined;
    const isUserPick = winnerId === team.id;
    const isActual = team.id === actualId;
    if (isUserPick) return isActual ? "correct" : "wrong";
    // Not the user's pick, but this team actually won → show what was right.
    if (isActual && winnerId && winnerId !== actualId) return "missed";
    return undefined;
  };

  return (
    <motion.div
      layout={!fluid}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={[
        "relative flex shrink-0 flex-col rounded-xl p-1.5 backdrop-blur-md ring-1",
        fluid
          ? "aspect-[8/5] w-full"
          : "h-[var(--match-card-h)] w-[var(--match-card-w)]",
        "shadow-[0_8px_28px_-12px_rgba(0,0,0,0.8)]",
        highlight === "live"
          ? "bg-rose-500/12 ring-2 ring-rose-400/55 shadow-[0_0_28px_-6px_rgba(244,63,94,0.45)]"
          : highlight === "next"
          ? "bg-sky-500/10 ring-2 ring-sky-400/50 shadow-[0_0_24px_-6px_rgba(56,189,248,0.35)]"
          : "bg-white/[0.04] ring-white/10",
        decided && highlight !== "live" ? "ring-emerald-400/25" : "",
      ].join(" ")}
    >
      {highlight === "next" && (
        <div className="mb-0.5 flex justify-center">
          <span className="rounded-full bg-sky-500 px-2 py-px text-[8px] font-extrabold uppercase tracking-[0.12em] text-[#041018] shadow-md shadow-sky-500/30">
            Up next
          </span>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-0">
        <TeamRow
          team={a}
          isWinner={decided && winnerId === a?.id}
          isLoser={decided && winnerId !== a?.id && !!a}
          verdict={verdictFor(a)}
          onPick={(t) => onPick(roundIdx, matchIdx, t)}
          onFlagClick={onFlagClick}
          align={align}
          locked={!ready}
          score={showScores ? scoreA : null}
          showScoreSlot={showScores}
        />
        {showTime && (
          <div className="flex items-center justify-center py-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
            {formatMatchTime(live.kickoff)}
          </div>
        )}
        {showLive && <LiveIndicator />}
        <TeamRow
          team={b}
          isWinner={decided && winnerId === b?.id}
          isLoser={decided && winnerId !== b?.id && !!b}
          verdict={verdictFor(b)}
          onPick={(t) => onPick(roundIdx, matchIdx, t)}
          onFlagClick={onFlagClick}
          align={align}
          locked={!ready}
          score={showScores ? scoreB : null}
          showScoreSlot={showScores}
        />
      </div>
    </motion.div>
  );
}

// One vertical column of matches on the shared 8-row bracket grid.
function RoundColumn({
  label,
  roundIdx,
  indices,
  winners,
  teams,
  onPick,
  reveal,
  actual,
  align,
  showLabel = true,
  liveByKey,
  liveKey,
  nextKey,
  onFlagClick,
}) {
  return (
    <div className="flex h-full w-[var(--match-card-w)] shrink-0 flex-col self-stretch">
      {showLabel && (
        <div
          className={[
            "mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500",
            align === "right" ? "text-right" : "text-left",
          ].join(" ")}
        >
          {label}
        </div>
      )}
      <div
        className="grid h-full min-h-0 flex-1"
        style={{ gridTemplateRows: `repeat(${BRACKET_ROWS}, minmax(0, 1fr))` }}
      >
        {indices.map((m, idx) => {
          const rk = key(ROUNDS[roundIdx].key, m);
          const highlight = rk === liveKey ? "live" : rk === nextKey ? "next" : null;
          const rowsPerMatch = BRACKET_ROWS / indices.length;
          const rowStart = idx * rowsPerMatch + 1;
          const rowEnd = rowStart + rowsPerMatch;
          return (
            <div
              key={m}
              className="flex min-h-0 items-center justify-center overflow-hidden"
              style={{ gridRow: `${rowStart} / ${rowEnd}` }}
            >
              <MatchCard
                roundIdx={roundIdx}
                matchIdx={m}
                teams={getMatchTeams(roundIdx, m, winners, teams)}
                winnerId={winners[rk]}
                onPick={onPick}
                reveal={reveal}
                actualId={actual[rk]}
                align={align}
                live={liveByKey?.[rk]}
                highlight={highlight}
                onFlagClick={onFlagClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CONFETTI (self-contained)
// ----------------------------------------------------------------------------
function Confetti({ fire }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 2.2 + Math.random() * 1.8,
        rot: Math.random() * 360,
        size: 6 + Math.random() * 8,
        color: ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#ffffff"][i % 5],
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
              style={{
                position: "absolute",
                width: p.size,
                height: p.size * 0.6,
                background: p.color,
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}

// ----------------------------------------------------------------------------
// CHAMPION / TROPHY CENTER
// ----------------------------------------------------------------------------
function ChampionSlot({ champion }) {
  return (
    <div className="flex flex-col items-center">
      <motion.div
        animate={
          champion
            ? { rotate: [0, -6, 6, -3, 0], scale: [1, 1.15, 1] }
            : { rotate: 0, scale: 1 }
        }
        transition={{ duration: 0.9 }}
        className="text-5xl drop-shadow-[0_0_24px_rgba(251,191,36,0.55)] sm:text-6xl"
        style={{ filter: champion ? "none" : "grayscale(1) opacity(0.4)" }}
      >
        🏆
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key={champion?.id || "empty"}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.35 }}
          className="mt-2 flex flex-col items-center"
        >
          {champion ? (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-b from-amber-300/20 to-amber-500/5 px-5 py-3 ring-1 ring-amber-300/40">
              <img
                src={flagSrc(champion.iso2)}
                srcSet={flagSrcSet(champion.iso2)}
                alt=""
                className="h-8 w-12 rounded-[4px] object-cover shadow ring-1 ring-black/40"
              />
              <div className="text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300/80">
                  Champion
                </div>
                <div className="text-lg font-extrabold tracking-tight text-white">
                  {champion.name}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-slate-600">
              Awaiting the
              <br /> final whistle
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Top-of-bracket champion badge ("WORLD CHAMPION ?" in the poster).
function ChampionBox({ champion }) {
  return (
    <div className="flex flex-col items-center">
      <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.26em] text-amber-300/80">
        World Champion
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={champion?.id || "empty"}
          initial={{ opacity: 0, scale: 0.9, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 6 }}
          transition={{ duration: 0.35 }}
        >
          {champion ? (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-gradient-to-b from-amber-300/25 to-amber-500/5 px-5 py-3 ring-1 ring-amber-300/50 shadow-[0_0_40px_-8px_rgba(251,191,36,0.5)]">
              <img
                src={flagSrc(champion.iso2)}
                srcSet={flagSrcSet(champion.iso2)}
                alt=""
                className="h-9 w-14 rounded-[4px] object-cover shadow ring-1 ring-black/40"
              />
              <div className="text-base font-extrabold tracking-tight text-white">
                {champion.name}
              </div>
            </div>
          ) : (
            <div className="grid h-16 w-20 place-items-center rounded-2xl bg-white/[0.04] text-3xl font-black text-slate-600 ring-1 ring-white/10">
              ?
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Big trophy mark above the Final — gentle float + glow pulse at all times.
function TrophyMark({ champion }) {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      className="relative flex flex-col items-center"
    >
      <motion.div
        className="pointer-events-none absolute -inset-6 rounded-full blur-2xl"
        animate={{
          opacity: champion ? [0.35, 0.65, 0.35] : [0.15, 0.3, 0.15],
          scale: [0.92, 1.08, 0.92],
        }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(circle, rgba(251,191,36,0.45) 0%, transparent 70%)" }}
      />
      <motion.div
        className="relative text-6xl sm:text-7xl"
        animate={champion ? { scale: [1, 1.05, 1] } : { scale: [1, 1.02, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          filter: champion
            ? "drop-shadow(0 0 28px rgba(251,191,36,0.65))"
            : "grayscale(0.35) drop-shadow(0 0 18px rgba(251,191,36,0.25))",
        }}
      >
        🏆
      </motion.div>
      <motion.div
        className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-amber-300/70"
        animate={{ opacity: [0.55, 0.9, 0.55] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      >
        26
      </motion.div>
    </motion.div>
  );
}

// Center column: trophy → Final label → match card, all dead-center in the bracket.
function CenterSpine({ winners, teams, onPick, reveal, actual, champion, liveByKey, liveKey, nextKey, onFlagClick }) {
  return (
    <div
      className="relative flex h-full shrink-0 items-center justify-center self-stretch"
      style={{ width: "calc(var(--match-card-w) + 2.5rem)" }}
    >
      <motion.div
        className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
      >
        <TrophyMark champion={champion} />

        <motion.div
          className="my-2.5 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-3.5 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.22em] text-[#1a1305] shadow-[0_0_20px_-4px_rgba(251,191,36,0.5)]"
          animate={{ boxShadow: ["0 0 16px -4px rgba(251,191,36,0.35)", "0 0 24px -2px rgba(251,191,36,0.55)", "0 0 16px -4px rgba(251,191,36,0.35)"] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          Final
        </motion.div>

        <motion.div
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
        >
          <MatchCard
            roundIdx={FINAL_ROUND}
            matchIdx={0}
            teams={getMatchTeams(FINAL_ROUND, 0, winners, teams)}
            winnerId={winners[key("final", 0)]}
            onPick={onPick}
            reveal={reveal}
            actualId={actual[key("final", 0)]}
            align="left"
            live={liveByKey?.[key("final", 0)]}
            highlight={
              key("final", 0) === liveKey ? "live" : key("final", 0) === nextKey ? "next" : null
            }
            onFlagClick={onFlagClick}
          />
        </motion.div>

        <AnimatePresence>
          {champion && (
            <motion.div
              key={champion.id}
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="mt-3"
            >
              <ChampionBox champion={champion} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SCOREBOARD
// ----------------------------------------------------------------------------
function Scoreboard({ stats, onClose }) {
  const correct = useCountUp(stats.correct, true, 900);
  const points = useCountUp(stats.points, true, 1100);
  const pct = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -10, height: 0 }}
      className="overflow-hidden border-b border-white/10 bg-white/[0.03] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-3">
        <Stat label="Correct" value={`${correct}/${stats.total}`} accent="emerald" />
        <Stat label="Accuracy" value={`${pct}%`} accent="sky" />
        <Stat label="Points" value={points} accent="amber" />
        <div className="flex flex-wrap items-center gap-2">
          {ROUNDS.map((r) => (
            <span
              key={r.key}
              className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-white/10"
            >
              {r.label.replace("Round of ", "R")}{" "}
              <b className="text-white">
                {stats.byRound[r.key].correct}/{stats.byRound[r.key].total}
              </b>
            </span>
          ))}
        </div>
        <button
          onClick={onClose}
          className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10"
        >
          Hide
        </button>
      </div>
    </motion.div>
  );
}

function Stat({ label, value, accent }) {
  const colors = {
    emerald: "text-emerald-300",
    sky: "text-sky-300",
    amber: "text-amber-300",
  };
  return (
    <div className="flex flex-col items-center leading-none">
      <span className={["text-2xl font-extrabold tabular-nums tracking-tight", colors[accent]].join(" ")}>
        {value}
      </span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// FIT-TO-WIDTH — scales the whole bracket uniformly when the viewport is narrow.
// ----------------------------------------------------------------------------
function FitToWidth({ children }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const measure = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      const widthScale = outer.clientWidth / inner.scrollWidth;
      const heightScale = outer.clientHeight / inner.scrollHeight;
      setScale(Math.min(1, widthScale, heightScale));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    if (innerRef.current) ro.observe(innerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div ref={outerRef} className="relative h-full w-full">
      <div
        ref={innerRef}
        className="absolute left-1/2 top-1/2 flex h-full items-stretch"
        style={{
          width: "max-content",
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MOBILE BRACKET — rounds stacked vertically; full mirrored view kicks in at lg.
// ----------------------------------------------------------------------------
function MobileBracket({ winners, teams, onPick, reveal, actual, champion, liveByKey, liveKey, nextKey, onFlagClick }) {
  return (
    <div className="flex flex-col gap-6 pb-2">
      {ROUNDS.map((r, roundIdx) => (
        <section key={r.key}>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-300 ring-1 ring-white/10">
              {r.label}
            </span>
            <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              {r.points} pt{r.points > 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex flex-col gap-2.5">
            {r.key === "final" && (
              <div className="mb-1 flex flex-col items-center">
                <TrophyMark champion={champion} />
              </div>
            )}
            {Array.from({ length: r.matches }, (_, m) => {
              const rk = key(r.key, m);
              const highlight = rk === liveKey ? "live" : rk === nextKey ? "next" : null;
              return (
                <MatchCard
                  key={m}
                  roundIdx={roundIdx}
                  matchIdx={m}
                  teams={getMatchTeams(roundIdx, m, winners, teams)}
                  winnerId={winners[rk]}
                  onPick={onPick}
                  reveal={reveal}
                  actualId={actual[rk]}
                  align="left"
                  fluid
                  live={liveByKey?.[rk]}
                  highlight={highlight}
                  onFlagClick={onFlagClick}
                />
              );
            })}
          </div>
        </section>
      ))}
      <div className="mt-1 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
        <ChampionSlot champion={champion} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// MAIN APP
// ----------------------------------------------------------------------------
export default function App() {
  const [winners, setWinners] = useState(loadStoredWinners);
  const [reveal, setReveal] = useState(false);
  const [actual, setActual] = useState({});
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultSource, setResultSource] = useState(null); // "live" | "local"
  const [confetti, setConfetti] = useState(false);
  const [historyTeam, setHistoryTeam] = useState(null);
  const prevChampRef = useRef(null);
  const { byPair, knockout, teamHistories, r32Teams, loading: liveLoading, lastUpdated, error: liveError, refresh: refreshLive } =
    useWorldCupLive();

  const teams = useMemo(() => r32Teams ?? [], [r32Teams]);
  const onFlagClick = useCallback((team) => setHistoryTeam(team), []);
  const historyMatches = useMemo(() => {
    if (!historyTeam) return [];
    return teamHistories.get(normTeam(historyTeam.name)) ?? [];
  }, [historyTeam, teamHistories]);

  // Re-validate stored picks once R32 teams load from JSON.
  useEffect(() => {
    if (teams.length === 32) {
      setWinners((w) => normalize(w, teams));
    }
  }, [teams]);

  const liveByKey = useMemo(() => {
    if (!teams.length) return {};
    const map = {};
    for (let r = 0; r < ROUNDS.length; r++) {
      for (let m = 0; m < ROUNDS[r].matches; m++) {
        const [a, b] = getMatchTeams(r, m, winners, teams);
        const live = getLiveForTeams(byPair, a, b);
        if (live) map[key(ROUNDS[r].key, m)] = live;
      }
    }
    return map;
  }, [byPair, winners, teams]);

  const { liveKey, nextKey } = useMemo(
    () => computeMatchHighlights(knockout, liveByKey),
    [knockout, liveByKey]
  );

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(winners));
    } catch {
      /* ignore quota errors */
    }
  }, [winners]);

  const champion = teamById(winners[key("final", 0)], teams);

  // Champion reveal → confetti flourish (only when it newly changes).
  useEffect(() => {
    const id = champion?.id || null;
    if (id && id !== prevChampRef.current) {
      setConfetti(true);
      const t = setTimeout(() => setConfetti(false), 4200);
      prevChampRef.current = id;
      return () => clearTimeout(t);
    }
    if (!id) prevChampRef.current = null;
  }, [champion]);

  // Keep reveal grading in sync as live scores update.
  useEffect(() => {
    if (!reveal || !byPair.size || !teams.length) return;
    const resolved = buildActualFromLive(byPair, teams);
    if (Object.keys(resolved).length) setActual(resolved);
  }, [reveal, byPair, teams]);

  const onPick = useCallback(
    (roundIdx, matchIdx, team) => {
      setWinners((prev) => {
        const k = key(ROUNDS[roundIdx].key, matchIdx);
        const next = { ...prev };
        if (next[k] === team.id) {
          delete next[k];
        } else {
          next[k] = team.id;
        }
        return normalize(next, teams);
      });
    },
    [teams]
  );

  const resetBracket = useCallback(() => {
    setWinners({});
    setReveal(false);
    setActual({});
    setResultSource(null);
    prevChampRef.current = null;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch latest scores, then reveal against live results (fallback to local projection).
  const revealResults = useCallback(async () => {
    if (reveal) {
      setReveal(false);
      return;
    }
    setLoadingResults(true);
    const fresh = await refreshLive();
    const pair = fresh?.byPair || byPair;
    const t = fresh?.r32Teams || teams;
    let resolved = buildActualFromLive(pair, t);
    let source = "live";
    if (!Object.keys(resolved).length) {
      resolved = buildActualWinners(t);
      source = "local";
    }
    setActual(resolved);
    setResultSource(source);
    setReveal(true);
    setLoadingResults(false);
  }, [reveal, byPair, teams, refreshLive]);

  // Scoring (only counts matches the user predicted AND that have a result).
  const stats = useMemo(() => {
    const byRound = {};
    let correct = 0,
      total = 0,
      points = 0;
    for (const r of ROUNDS) {
      byRound[r.key] = { correct: 0, total: 0 };
      for (let m = 0; m < r.matches; m++) {
        const k = key(r.key, m);
        const actualWinner = actual[k];
        const userWinner = winners[k];
        if (!actualWinner || !userWinner) continue;
        byRound[r.key].total++;
        total++;
        if (actualWinner === userWinner) {
          byRound[r.key].correct++;
          correct++;
          points += r.points;
        }
      }
    }
    return { correct, total, points, byRound };
  }, [winners, actual]);

  // Which connector lines are "active" (feeder match decided), per side.
  const activeFor = useCallback(
    (roundIdx, side) => {
      const rk = ROUNDS[roundIdx].key;
      const half = ROUNDS[roundIdx].matches / 2;
      const base = side === "left" ? 0 : half;
      return Array.from({ length: half }, (_, i) => !!winners[key(rk, base + i)]);
    },
    [winners]
  );

  // Index ranges per side for each round.
  const sideIdx = (roundIdx, side) => {
    const half = ROUNDS[roundIdx].matches / 2;
    const base = side === "left" ? 0 : half;
    return Array.from({ length: half }, (_, i) => base + i);
  };

  const sfLeftDecided = !!winners[key("sf", 0)];
  const sfRightDecided = !!winners[key("sf", 1)];

  return (
    <div className="min-h-full bg-[radial-gradient(120%_120%_at_50%_-10%,#0b1437_0%,#070a1f_45%,#04050f_100%)] text-slate-100">
      <Confetti fire={confetti} />
      <TeamHistoryModal
        team={historyTeam}
        matches={historyMatches}
        onClose={() => setHistoryTeam(null)}
      />

      {/* TOP BAR */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070a1f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <WCLogo className="h-9 w-9 shrink-0 drop-shadow-lg" />
            <div className="leading-tight">
              <h1 className="text-[15px] font-extrabold tracking-tight sm:text-base">
                World Cup <span className="text-emerald-400">2026</span>
              </h1>
              <p className="text-[11px] font-medium text-slate-500">
                Knockout Bracket Predictor
                {lastUpdated && (
                  <span className="text-slate-600">
                    {" "}
                    · updated {lastUpdated.toLocaleTimeString()}
                    {liveLoading ? " (fetching…)" : " · polls every 1 min"}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={revealResults}
              disabled={loadingResults}
              className={[
                "rounded-full px-3.5 py-1.5 text-xs font-bold tracking-tight transition sm:text-sm",
                reveal
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
                  : "bg-emerald-500 text-[#04050f] shadow-lg shadow-emerald-500/25 hover:bg-emerald-400",
                loadingResults ? "opacity-60" : "",
              ].join(" ")}
            >
              {loadingResults ? "Fetching…" : reveal ? "Hide results" : "Reveal results"}
            </button>
            <button
              onClick={resetBracket}
              className="rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-bold tracking-tight text-slate-300 ring-1 ring-white/10 transition hover:bg-white/10 sm:text-sm"
            >
              Reset
            </button>
          </div>
        </div>

        <AnimatePresence>
          {reveal && <Scoreboard stats={stats} onClose={() => setReveal(false)} />}
        </AnimatePresence>
      </header>

      {reveal && (
        <div className="mx-auto max-w-7xl px-4 pt-2 text-center text-[11px] text-slate-500">
          ✓ your pick was right · <span className="text-rose-400/80">✕</span> wrong ·{" "}
          <span className="text-emerald-300/70">won</span> marks who actually advanced.
          {resultSource === "live"
            ? " Comparing your bracket to live knockout results."
            : " Comparing your bracket to the projected 2026 outcome."}
        </div>
      )}

      {liveError && (
        <div className="mx-auto max-w-7xl px-4 pt-2 text-center text-[11px] text-amber-400/80">
          Could not refresh live scores — showing cached data if available.
        </div>
      )}

      {(liveKey || nextKey) && (
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-4 px-4 pt-2 text-[11px] text-slate-500">
          {liveKey && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
              <span className="text-rose-300/90">Live now</span>
            </span>
          )}
          {nextKey && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
              <span className="text-sky-300/90">Up next</span>
            </span>
          )}
        </div>
      )}

      {/* BRACKET */}
      <main className="px-4 py-3 lg:py-2">
        {teams.length < 32 && liveLoading && (
          <div className="mx-auto mb-4 max-w-md text-center text-sm text-slate-400">
            Loading knockout bracket…
          </div>
        )}
        {/* MOBILE / TABLET — stacked rounds (below lg) */}
        <div className="mx-auto max-w-md lg:hidden">
          <MobileBracket
            winners={winners}
            teams={teams}
            onPick={onPick}
            reveal={reveal}
            actual={actual}
            champion={champion}
            liveByKey={liveByKey}
            liveKey={liveKey}
            nextKey={nextKey}
            onFlagClick={onFlagClick}
          />
        </div>

        {/* DESKTOP — R32 full-height sides; inner rounds scale to fit width */}
        <div
          className="hidden h-[calc(100dvh-6.5rem)] min-h-[720px] lg:block"
          style={{
            "--match-card-h": `calc((100dvh - 6.5rem) / ${BRACKET_ROWS} * ${MATCH_CARD_ROW_FRAC})`,
            "--match-card-w": `calc(var(--match-card-h) * ${MATCH_CARD_ASPECT})`,
          }}
        >
          <FitToWidth>
            <div className="flex h-full items-stretch gap-2">
              <RoundColumn roundIdx={0} indices={sideIdx(0, "left")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="left" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <Connector count={8} side="left" active={activeFor(0, "left")} />
              <RoundColumn roundIdx={1} indices={sideIdx(1, "left")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="left" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <Connector count={4} side="left" active={activeFor(1, "left")} />
              <RoundColumn roundIdx={2} indices={sideIdx(2, "left")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="left" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <Connector count={2} side="left" active={activeFor(2, "left")} />
              <RoundColumn roundIdx={3} indices={sideIdx(3, "left")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="left" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <SFFinalConnector side="left" active={sfLeftDecided} />
              <CenterSpine winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} champion={champion} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <SFFinalConnector side="right" active={sfRightDecided} />
              <RoundColumn roundIdx={3} indices={sideIdx(3, "right")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="right" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <Connector count={2} side="right" active={activeFor(2, "right")} />
              <RoundColumn roundIdx={2} indices={sideIdx(2, "right")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="right" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <Connector count={4} side="right" active={activeFor(1, "right")} />
              <RoundColumn roundIdx={1} indices={sideIdx(1, "right")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="right" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
              <Connector count={8} side="right" active={activeFor(0, "right")} />
              <RoundColumn roundIdx={0} indices={sideIdx(0, "right")} winners={winners} teams={teams} onPick={onPick} reveal={reveal} actual={actual} align="right" showLabel={false} liveByKey={liveByKey} liveKey={liveKey} nextKey={nextKey} onFlagClick={onFlagClick} />
            </div>
          </FitToWidth>
        </div>
      </main>

      <footer className="px-4 pb-8 pt-2 text-center text-[11px] text-slate-600 lg:pb-3 lg:pt-1">
        Click a team to advance them. Picks auto-save · live scores refresh every minute.
      </footer>
    </div>
  );
}
