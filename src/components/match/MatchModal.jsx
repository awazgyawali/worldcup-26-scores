import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Modal } from "../common/Modal";
import { Countdown } from "../common/Countdown";
import { isRef } from "../../lib/teams";
import { friendScorePredictionsForMatch, formatScorePredictionDisplay, gradeScorePrediction } from "../../lib/scoring";
import { fmtKickoff, goalMinuteVal, flagSrc, flagSrcSet, liveMinute } from "../../lib/format";

// ----------------------------------------------------------------------------
// MATCH DETAIL MODAL — everything the JSON knows about one fixture.
// ----------------------------------------------------------------------------
export function GoalTimeline({ match }) {
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

export function MatchTeamHeader({ team, refName, won, onFlagClick }) {
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

function ScorePointsBadge({ points }) {
  if (!points || points <= 0) return null;
  return (
    <span className="rounded-full bg-[var(--gold)]/15 px-1.5 py-0.5 text-[9px] font-bold text-[var(--gold-bright)]">
      +{points}
    </span>
  );
}

export function MatchPredictionsList({ others }) {
  if (!others.length) return null;
  return (
    <div className="match-predictions-list">
      <p className="match-predictions-list__title">Everyone else</p>
      <ul className="match-predictions-list__items">
        {others.map((entry) => (
          <li key={entry.uid} className="match-predictions-list__row">
            <span className="match-predictions-list__name">{entry.name}</span>
            <span className="flex items-center gap-1.5">
              <ScorePointsBadge points={entry.points} />
              <span className="match-predictions-list__score">{entry.display}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MatchModal({
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
  const yourPoints =
    played && scorePrediction && match.ftScore
      ? gradeScorePrediction(scorePrediction, match.ftScore).scorePoints
      : 0;
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
          <div className="mx-4 mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/50 p-3">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {resultLabel}
              </span>
              <span className="font-display text-xl tracking-widest text-[var(--text-primary)]">
                {actualScoreDisplay ?? "—"}
              </span>
            </div>
            <div className="match-predictions-list mt-1">
              <p className="match-predictions-list__title">Your prediction</p>
              <ul className="match-predictions-list__items">
                <li className="match-predictions-list__row">
                  <span className="match-predictions-list__name font-bold text-[var(--text-primary)]">You</span>
                  <span className="flex items-center gap-1.5">
                    <ScorePointsBadge points={yourPoints} />
                    <span
                      className={[
                        "match-predictions-list__score",
                        !yourScoreDisplay ? "text-[var(--text-muted)]" : "",
                      ].join(" ")}
                    >
                      {yourScoreDisplay ?? "—"}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
            <MatchPredictionsList others={otherPredictions} />
          </div>
        )}

        {/* Your score prediction — always editable before kickoff */}
        {upcoming && canEditScore && teamsConfirmed && (
          <div className="mx-4 mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/50 p-3">
            <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--gold-bright)]">
              Your prediction
            </p>
            <div className="mb-2 flex items-center justify-center gap-2">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-[var(--text-muted)]">{match.team1?.code ?? "TBD"}</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  className="h-10 w-12 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-center font-display text-lg text-[var(--text-primary)] focus:border-[var(--gold)] focus:outline-none"
                  placeholder="0"
                />
              </div>
              <span className="mt-3.5 text-base font-bold text-[var(--text-muted)]">–</span>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] text-[var(--text-muted)]">{match.team2?.code ?? "TBD"}</span>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  className="h-10 w-12 rounded-lg border border-[var(--border)] bg-[var(--bg-deep)] text-center font-display text-lg text-[var(--text-primary)] focus:border-[var(--gold)] focus:outline-none"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleClearClick}
                className="flex-1 rounded-lg bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:bg-[var(--border-strong)]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSaveScore}
                className="flex-[2] rounded-lg bg-[var(--gold)]/20 px-3 py-1.5 text-xs font-bold text-[var(--gold-bright)] ring-1 ring-[var(--gold)]/40 transition hover:bg-[var(--gold)]/30"
              >
                Save Prediction
              </button>
            </div>
            <p className="mt-1.5 text-center text-[9px] leading-relaxed text-[var(--text-muted)]">
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
