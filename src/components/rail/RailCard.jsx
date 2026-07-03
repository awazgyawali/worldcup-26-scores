import { motion } from "framer-motion";
import { PointsEarnedBadge } from "../common/PointsEarnedBadge";
import { isRef } from "../../lib/teams";
import { ROUND_SHORT } from "../../lib/rounds";
import { flagSrc, fmtTimeOnly, fmtCountdown, liveMinute, phaseLabel } from "../../lib/format";

// ----------------------------------------------------------------------------
// PREDICTIONS RAIL — compact games cards at the bottom.
// ----------------------------------------------------------------------------
export function RailTeamRow({ team, refName, score, predictedScore, isWinner, isPick, pickVerdict, onClick, canPick }) {
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

export function RailCard({ match, isLive, isNext, isGuide, pickTeam, actualTeam, revealGrades, onClick, index, isKnockout, onPickWinner, canPick, scorePrediction, predictionInfo, viewerName, isViewingOther }) {
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

  const effectiveScore = scorePrediction ?? predictionInfo?.predictedScore ?? null;

  // For non-knockout games (base/group stage), allow picking a winner
  // Knockout games (R32 onwards) predictions come from bracket only
  const handlePick = (team) => {
    if (isKnockout || !onPickWinner || !upcoming) return;
    onPickWinner(team.id);
  };

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
        isGuide ? "rail-card--guide" : isLive ? "rail-card--live" : isNext ? "rail-card--next" : "",
        pickVerdict === "correct" ? "rail-card--correct" : "",
        pickVerdict === "wrong" ? "rail-card--wrong" : "",
      ].join(" ")}
    >
      {isGuide && (
        <div className="rail-guide-popover" role="status">
          Tap to predict the score
        </div>
      )}
      {/* Points earned — score prediction only on rail (bracket points show on bracket cards) */}
      {predictionInfo?.matchPlayed && predictionInfo.scorePointsEarned > 0 && (
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
