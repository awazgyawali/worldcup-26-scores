import { goalMinuteVal } from "../../lib/format";

// ----------------------------------------------------------------------------
// TEAM JOURNEY MODAL — master-detail: fixture list + inline match detail.
// ----------------------------------------------------------------------------
export function journeyResult(entry) {
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

export const JOURNEY_RESULT_LABEL = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  live: "Live",
  upcoming: "Upcoming",
  tbd: "TBD",
};

export const goalMatchPhase = (g) => {
  const base = parseInt(String(g.minute).split("+")[0], 10);
  if (!Number.isNaN(base) && base > 90) return "aet";
  return "ft";
};

export function buildJourneyTimeline(entry, team) {
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
