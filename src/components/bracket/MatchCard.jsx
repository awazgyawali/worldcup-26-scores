import { motion } from "framer-motion";
import { TeamRow } from "./TeamRow";
import { getEliminationInfo } from "../../lib/bracket";
import { mapPredictedScores } from "../../lib/scoring";
import { flagSrc, fmtMatchTime, liveMinute, phaseLabel } from "../../lib/format";
import { ROUNDS } from "../../lib/rounds";

function MobileListTeam({ team, isPicked, isDimmed, verdict, onPick, onFlagClick, locked, readOnly, started, score, predictedScore, actualWinner, isEliminated }) {
  const empty = !team;
  const disabled = empty || locked || readOnly || started;
  const displayScore = score != null ? score : predictedScore;
  const greyed = isEliminated && !verdict;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onPick(team)}
      className={[
        "mobile-match-card__team",
        isPicked && "mobile-match-card__team--picked",
        isDimmed && "mobile-match-card__team--dimmed",
        greyed && "opacity-60",
        verdict === "correct" && "mobile-match-card__team--correct",
        verdict === "wrong" && "mobile-match-card__team--wrong",
      ].filter(Boolean).join(" ")}
    >
      <span className="mobile-match-card__team-left">
        {empty ? (
          <span className="mobile-match-card__flag mobile-match-card__flag--empty">·</span>
        ) : (
          <img
            src={flagSrc(team.iso2)}
            alt=""
            className={greyed ? "mobile-match-card__flag team-out-flag" : "mobile-match-card__flag"}
            onClick={(e) => {
              e.stopPropagation();
              onFlagClick?.(team);
            }}
          />
        )}
        <span className="mobile-match-card__code">{empty ? "TBD" : team.code}</span>
        {isPicked && !verdict && <span className="mobile-match-card__check">✓</span>}
        {verdict === "correct" && <span className="mobile-match-card__check">✓</span>}
        {verdict === "wrong" && <span className="mobile-match-card__cross">✕</span>}
      </span>
      {displayScore != null && (
        <span className={["mobile-match-card__score", actualWinner && "mobile-match-card__score--won"].filter(Boolean).join(" ")}>
          {displayScore}
        </span>
      )}
    </button>
  );
}

// ----------------------------------------------------------------------------
// MATCH CARD (bracket)
// ----------------------------------------------------------------------------
function CompactTeam({ team, isPicked, isDimmed, verdict, onPick, onFlagClick, locked, readOnly, started, score, predictedScore, isEliminated }) {
  const empty = !team;
  const disabled = empty || locked || readOnly || started;
  const displayScore = score != null ? score : predictedScore;
  const greyed = isEliminated && !verdict;

  let tone = "text-[var(--text-secondary)]";
  if (verdict === "correct") tone = "text-[var(--pitch-glow)] font-bold";
  else if (verdict === "wrong") tone = "text-[var(--wrong)] line-through";
  else if (verdict === "missed") tone = "text-[var(--pitch-glow)]/85 font-semibold";
  else if (isPicked) tone = "text-[var(--text-primary)] font-bold";
  else if (isDimmed) tone = "text-[var(--text-muted)]";
  if (greyed) tone = "text-[var(--text-muted)] opacity-70";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onPick(team)}
      className={[
        "match-compact__team",
        isPicked && "match-compact__team--picked",
        isDimmed && "match-compact__team--dimmed",
        verdict === "correct" && "match-compact__team--correct",
        verdict === "missed" && "match-compact__team--missed",
        verdict === "wrong" && "match-compact__team--wrong",
      ].filter(Boolean).join(" ")}
      title={empty ? undefined : readOnly ? "Picks are read-only" : started ? "Match already started" : locked ? "Teams TBD" : `Advance ${team.name}`}
    >
      {empty ? (
        <>
          <span className="match-compact__shield" aria-hidden>🛡</span>
          <span className="match-compact__dash">—</span>
        </>
      ) : (
        <>
          <img
            src={flagSrc(team.iso2)}
            alt=""
            className={greyed ? "match-compact__flag team-out-flag" : "match-compact__flag"}
            onClick={(e) => {
              e.stopPropagation();
              onFlagClick?.(team);
            }}
          />
          <span className={["match-compact__code", tone].join(" ")}>{team.code}</span>
          {displayScore != null && <span className="match-compact__score">{displayScore}</span>}
        </>
      )}
    </button>
  );
}

export function MatchCard({ slotKey, roundIdx, matchIdx, teams: [a, b], winnerId, onPick, actualId, match, slotMatches = null, highlight = null, onFlagClick, onOpenMatch, align = "left", readOnly = false, revealGrades = false, scorePrediction, predictionInfo, viewerName, isViewingOther, compareVerdict = null, comparePickId = null, compareName = null, compact = false, showRound = false, mobileList = false }) {
  const ready = !!a && !!b;
  const decided = !!winnerId;

  // Attach real scores only when the on-screen pair IS the real fixture.
  const pairIsReal =
    match?.team1 && match?.team2 && a && b &&
    ((match.team1.id === a.id && match.team2.id === b.id) || (match.team1.id === b.id && match.team2.id === a.id));

  // A predicted team is "out" of this fixture when reality says it can't get
  // here: the real pair is known and doesn't include it, or it already lost a
  // knockout game. Third place is special — semi losers ARE its participants,
  // while finalists (semi winners) can't drop into it.
  const elim = getEliminationInfo(slotMatches);
  const realPairKnown = !!(match?.team1 && match?.team2);
  const teamIsOut = (team) => {
    if (!elim || !team || pairIsReal) return false;
    if (realPairKnown) return team.id !== match.team1.id && team.id !== match.team2.id;
    if (slotKey === "third-0") {
      return elim.semiWinners.has(team.id) || (elim.losers.has(team.id) && !elim.semiLosers.has(team.id));
    }
    return elim.losers.has(team.id);
  };

  let scoreA = null;
  let scoreB = null;
  if (pairIsReal && match.score) {
    const flip = match.team1.id !== a.id;
    scoreA = flip ? match.score[1] : match.score[0];
    scoreB = flip ? match.score[0] : match.score[1];
  }

  const status = match?.status;
  const started = match?.kickoff && Date.now() >= match.kickoff.getTime();
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
  const actualWinnerIsA = pairIsReal && a && actualId === a.id;
  const actualWinnerIsB = pairIsReal && b && actualId === b.id;

  const teamRowState = (team) => ({
    isPicked: decided && winnerId === team?.id,
    isDimmed: decided && winnerId !== team?.id,
    verdict: verdictFor(team),
    isEliminated: teamIsOut(team),
  });

  const compareTag = compareName ? compareName.slice(0, 2).toUpperCase() : null;
  const compareDotFor = (team) => (team && winnerId && team.id === winnerId ? compareVerdict : null);
  const compareLabelFor = (team) =>
    team && comparePickId && comparePickId === team.id && winnerId !== team.id ? compareTag : null;

  const showPredicted = status === "upcoming" && a && b;
  const effectivePrediction = scorePrediction ?? predictionInfo?.predictedScore ?? null;
  let predictedA = null;
  let predictedB = null;
  if (showPredicted && effectivePrediction) {
    [predictedA, predictedB] = mapPredictedScores(effectivePrediction, a, b, match);
  }

  const footerLeft = () => {
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

  const scorePointsEarned = predictionInfo?.scorePointsEarned ?? 0;
  const pointsEarned = predictionInfo?.pointsEarned ?? 0;
  const footerRight = () => {
    if (highlight === "next")
      return (
        <span className="rounded-full bg-[var(--next)] px-1.5 text-[7px] font-black uppercase tracking-[0.1em] text-[#04121d]">
          next
        </span>
      );
    if (!revealGrades || !predictionInfo?.matchPlayed) return null;
    if (pointsEarned <= 0 && scorePointsEarned <= 0) return null;
    return (
      <span className="text-[8.5px] font-black text-[var(--agree)]">
        {pointsEarned > 0 && `+${pointsEarned}`}
        {scorePointsEarned > 0 && (
          <> {pointsEarned > 0 ? "· " : ""}{predictionInfo.scoreResult === "exact" ? "EXACT " : ""}+{scorePointsEarned}</>
        )}
      </span>
    );
  };

  if (mobileList) {
    const teamProps = (team) => ({
      team,
      ...teamRowState(team),
      onPick: (t) => onPick(roundIdx, matchIdx, t),
      onFlagClick,
      locked: !ready,
      readOnly,
      started,
    });

    return (
      <div
        className={[
          "mobile-match-card",
          highlight === "guide" || highlight === "next" ? "mobile-match-card--next" : "",
          highlight === "live" ? "mobile-match-card--live" : "",
          pickGrade === "correct" ? "mobile-match-card--correct" : pickGrade === "wrong" ? "mobile-match-card--wrong" : "",
        ].join(" ")}
        data-bracket-slot={slotKey}
      >
        <MobileListTeam
          {...teamProps(a)}
          score={scoreA}
          predictedScore={predictedA}
          actualWinner={revealGrades && actualWinnerIsA}
        />
        <div className="mobile-match-card__divider" />
        <MobileListTeam
          {...teamProps(b)}
          score={scoreB}
          predictedScore={predictedB}
          actualWinner={revealGrades && actualWinnerIsB}
        />
        <button type="button" onClick={() => onOpenMatch?.(slotKey)} className="mobile-match-card__meta">
          {footerLeft()}
          {footerRight()}
        </button>
      </div>
    );
  }

  if (compact) {
    const teamProps = (team) => ({
      team,
      ...teamRowState(team),
      onPick: (t) => onPick(roundIdx, matchIdx, t),
      onFlagClick,
      locked: !ready,
      readOnly,
      started,
    });

    return (
      <div
        className={[
          "match-ticket match-ticket--compact",
          readOnly ? "match-ticket--readonly" : "",
          highlight === "guide" ? "match-ticket--guide" : highlight === "live" ? "match-ticket--live" : highlight === "next" ? "match-ticket--next" : "",
          pickGrade === "correct" ? "match-ticket--graded-correct" : pickGrade === "wrong" ? "match-ticket--graded-wrong" : "",
        ].join(" ")}
        data-bracket-slot={slotKey}
      >
        {showRound && (
          <span className="match-compact__round">
            {typeof roundIdx === "number" ? ROUNDS[roundIdx]?.short : roundIdx === "third" ? "3RD" : match?.roundLabel}
          </span>
        )}
        <CompactTeam
          {...teamProps(a)}
          score={scoreA}
          predictedScore={predictedA}
        />
        <CompactTeam
          {...teamProps(b)}
          score={scoreB}
          predictedScore={predictedB}
        />
        {(highlight === "live" || highlight === "next" || pairIsReal) && (
          <button
            type="button"
            onClick={() => onOpenMatch?.(slotKey)}
            className="match-compact__meta"
          >
            {footerLeft()}
            {footerRight()}
          </button>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.25 }}
      className={[
        "match-ticket relative flex w-full shrink-0 flex-col justify-center rounded-lg p-[7px]",
        readOnly ? "match-ticket--readonly" : "",
        decided && !showVerdict ? "match-ticket--decided" : "",
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

      <TeamRow
        team={a}
        {...teamRowState(a)}
        onPick={(t) => onPick(roundIdx, matchIdx, t)}
        onFlagClick={onFlagClick}
        locked={!ready}
        readOnly={readOnly}
        started={started}
        score={scoreA}
        predictedScore={predictedA}
        isMatchWinner={revealGrades && actualWinnerIsA}
        align={align}
        compareDot={compareDotFor(a)}
        compareLabel={compareLabelFor(a)}
      />

      <TeamRow
        team={b}
        {...teamRowState(b)}
        onPick={(t) => onPick(roundIdx, matchIdx, t)}
        onFlagClick={onFlagClick}
        locked={!ready}
        readOnly={readOnly}
        started={started}
        score={scoreB}
        predictedScore={predictedB}
        isMatchWinner={revealGrades && actualWinnerIsB}
        align={align}
        compareDot={compareDotFor(b)}
        compareLabel={compareLabelFor(b)}
      />

      <button
        type="button"
        onClick={() => onOpenMatch?.(slotKey)}
        title="Match details"
        className="mt-[3px] flex h-[15px] items-center justify-between gap-1 rounded px-1 transition hover:bg-white/[0.06]"
      >
        {footerLeft()}
        {footerRight()}
      </button>
    </motion.div>
  );
}
