// ----------------------------------------------------------------------------
// FORMATTING
// ----------------------------------------------------------------------------
export const fmtKickoff = (d) =>
  d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const fmtTimeOnly = (d) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

export const fmtDayShort = (d) => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

export const fmtMatchTime = (d) =>
  d.toDateString() === new Date().toDateString() ? fmtTimeOnly(d) : fmtKickoff(d);

/** Approximate live match minute from kickoff (accounts for HT break). */
export const liveMinute = (kickoff) => {
  if (!kickoff) return "LIVE";
  const mins = Math.floor((Date.now() - kickoff.getTime()) / 60_000);
  if (mins < 0) return "0'";
  if (mins <= 45) return `${mins}'`;
  if (mins <= 60) return "HT";
  if (mins <= 106) return `${Math.min(90, mins - 16)}'`;
  return "ET";
};

export const fmtCountdown = (ms) => {
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

export const phaseLabel = (m) =>
  m.phase === "pens" ? `PENS ${m.pens[0]}–${m.pens[1]}` : m.phase === "aet" ? "AET" : "FT";

export const goalMinuteVal = (g) => {
  const [base, added] = String(g.minute).split("+");
  return parseInt(base, 10) * 10 + (added ? Math.min(9, parseInt(added, 10)) : 0);
};

export const flagSrc = (iso2, w = 80) => `https://flagcdn.com/w${w}/${iso2}.png`;
export const flagSrcSet = (iso2) =>
  `https://flagcdn.com/w80/${iso2}.png 1x, https://flagcdn.com/w160/${iso2}.png 2x`;
