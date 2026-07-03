import { motion } from "framer-motion";
import { TeamRow } from "./TeamRow";
import { PointsEarnedBadge } from "../common/PointsEarnedBadge";
import { mapPredictedScores } from "../../lib/scoring";
import { fmtMatchTime, liveMinute, phaseLabel } from "../../lib/format";

// ----------------------------------------------------------------------------
// MATCH CARD (bracket)
// ----------------------------------------------------------------------------
export function MatchCard({ slotKey, roundIdx, matchIdx, teams: [a, b], winnerId, onPick, actualId, match, highlight = null, onFlagClick, onOpenMatch, align = "left", readOnly = false, revealGrades = false, scorePrediction, predictionInfo, viewerName, isViewingOther }) {
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
        highlight === "guide" ? "match-ticket--guide" : highlight === "live" ? "match-ticket--live" : highlight === "next" ? "match-ticket--next" : "",
        pickGrade === "correct" ? "match-ticket--graded-correct" : pickGrade === "wrong" ? "match-ticket--graded-wrong" : "",
      ].join(" ")}
      data-bracket-slot={slotKey}
    >
      {highlight === "guide" && !readOnly && (
        <div className="match-guide-popover" role="status">
          <span className="match-guide-popover__arrow" aria-hidden />
          Tap a team to pick your winner
        </div>
      )}
      {/* Points earned — winner pick only; score prediction points show on the rail card */}
      {predictionInfo?.matchPlayed && predictionInfo.pointsEarned > 0 && (
        <PointsEarnedBadge points={predictionInfo.pointsEarned} />
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
