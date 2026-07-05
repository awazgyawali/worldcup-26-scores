import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Modal } from "../common/Modal";
import { Countdown } from "../common/Countdown";
import { isRef } from "../../lib/teams";
import {
  friendScorePredictionsForMatch,
  friendsMissingScorePredictionForMatch,
  getScorePrediction,
  gradeScorePrediction,
  mapPredictedScores,
  SCORE_ONE_SIDE_POINTS,
  SCORE_EXACT_POINTS,
} from "../../lib/scoring";
import { fmtKickoff, goalMinuteVal, flagSrc, flagSrcSet, liveMinute } from "../../lib/format";
import { goalMatchPhase } from "../team/journeyHelpers";

// ----------------------------------------------------------------------------
// MATCH DETAIL MODAL — timeline left, league score calls ranked by points right.
// ----------------------------------------------------------------------------
function GoalTimelineRow({ goal }) {
  const isSide0 = goal.side === 0;
  return (
    <div className="mm-goal-row">
      <span className="mm-goal-row__side mm-goal-row__side--left">
        {isSide0 && (
          <>
            {goal.name}
            {goal.penalty && <span className="mm-goal-tag">PEN</span>}
            {goal.owngoal && <span className="mm-goal-tag mm-goal-tag--og">OG</span>}
          </>
        )}
      </span>
      <span className="mm-goal-row__minute">{goal.minute}′</span>
      <span className="mm-goal-row__side">
        {!isSide0 && (
          <>
            {goal.name}
            {goal.penalty && <span className="mm-goal-tag">PEN</span>}
            {goal.owngoal && <span className="mm-goal-tag mm-goal-tag--og">OG</span>}
          </>
        )}
      </span>
    </div>
  );
}

export function GoalTimeline({ match }) {
  const rows = [
    ...match.goals1.map((g) => ({ ...g, side: 0 })),
    ...match.goals2.map((g) => ({ ...g, side: 1 })),
  ].sort((x, y) => goalMinuteVal(x) - goalMinuteVal(y));

  const ft = [];
  const aet = [];
  for (const g of rows) {
    (goalMatchPhase(g) === "aet" ? aet : ft).push(g);
  }
  const showAet = aet.length > 0 || match.phase === "aet" || match.phase === "pens";
  const pens = match.pens ?? null;
  const hasAny = ft.length > 0 || aet.length > 0 || pens != null;

  if (!hasAny) return null;

  return (
    <div className="mm-timeline">
      <p className="mm-timeline__phase">Regular time</p>
      {ft.length > 0
        ? ft.map((g, i) => <GoalTimelineRow key={`ft-${g.name}-${g.minute}-${i}`} goal={g} />)
        : <p className="mm-timeline__empty">No goals in regulation</p>}
      {showAet && (
        <>
          <p className="mm-timeline__phase">Extra time</p>
          {aet.length > 0
            ? aet.map((g, i) => <GoalTimelineRow key={`aet-${g.name}-${g.minute}-${i}`} goal={g} />)
            : <p className="mm-timeline__empty">No goals in extra time</p>}
        </>
      )}
      {pens && (
        <div className="mm-goal-row">
          <span className="mm-goal-row__side mm-goal-row__side--left">{pens[0]}</span>
          <span className="mm-goal-row__minute mm-goal-row__minute--pens">PENS</span>
          <span className="mm-goal-row__side">{pens[1]}</span>
        </div>
      )}
    </div>
  );
}

function TeamSide({ team, refName, won, right = false, onFlagClick }) {
  if (!team) {
    return (
      <div className={["mm-team", right && "mm-team--right"].filter(Boolean).join(" ")}>
        <div className="mm-team__body">
          <div className="mm-team__name mm-team__name--tbd">
            {isRef(refName) ? (refName[0] === "W" ? `Winner M${refName.slice(1)}` : `Loser M${refName.slice(1)}`) : "TBD"}
          </div>
        </div>
        <div className="mm-team__flag mm-team__flag--empty">?</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onFlagClick?.(team)}
      className={["mm-team", right && "mm-team--right"].filter(Boolean).join(" ")}
      title={`${team.name} — tournament journey`}
    >
      <div className="mm-team__body">
        <div className={["mm-team__name", won && "mm-team__name--won"].filter(Boolean).join(" ")}>{team.name}</div>
        <div className="mm-team__code">{team.code}</div>
      </div>
      <img src={flagSrc(team.iso2)} srcSet={flagSrcSet(team.iso2)} alt="" className="mm-team__flag" />
    </button>
  );
}

/** Renders "a–b": golden before FT, then green/red per side once graded. */
function ScoreNumbers({ a, b, ftScore, graded }) {
  if (a == null || b == null) return <span className="score-pred score-pred--empty">—</span>;
  if (!graded || !ftScore) {
    return (
      <span className="score-pred score-pred--predicted">
        {a}–{b}
      </span>
    );
  }
  const aOk = a === ftScore[0];
  const bOk = b === ftScore[1];
  return (
    <span className="score-pred score-pred--graded">
      <span className={aOk ? "score-pred--hit" : "score-pred--miss"}>{a}</span>
      <span className="score-pred__dash">–</span>
      <span className={bOk ? "score-pred--hit" : "score-pred--miss"}>{b}</span>
    </span>
  );
}

function matchTabKey(m, numToSlot) {
  return m.isKnockout ? numToSlot?.get(m.num) : `rail-${m.num}`;
}

function MatchTabPill({ m, active, winners, numToSlot, onSelect }) {
  const ref = useRef(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);

  const played = m.status === "played";
  const key = matchTabKey(m, numToSlot);
  const predictedScore = key ? getScorePrediction(winners, key) : null;
  const scoreLabel = played
    ? m.score
      ? `${m.score[0]}–${m.score[1]}`
      : null
    : predictedScore
      ? `${predictedScore[0]}–${predictedScore[1]}`
      : null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(m)}
      className={[
        "match-tab-pill snap-start",
        active ? "match-tab-pill--active" : "",
        played ? "match-tab-pill--played" : predictedScore ? "match-tab-pill--predicted" : "",
      ].join(" ")}
      aria-current={active ? "true" : undefined}
      title={`${m.team1?.name ?? "TBD"} vs ${m.team2?.name ?? "TBD"}`}
    >
      {m.team1 ? (
        <img src={flagSrc(m.team1.iso2, 40)} alt="" className="match-tab-pill__flag" />
      ) : (
        <span className="match-tab-pill__flag match-tab-pill__flag--empty">·</span>
      )}
      <span
        className={[
          "match-tab-pill__score",
          !played && predictedScore && "match-tab-pill__score--predicted",
        ].filter(Boolean).join(" ")}
      >
        {scoreLabel ?? "vs"}
      </span>
      {m.team2 ? (
        <img src={flagSrc(m.team2.iso2, 40)} alt="" className="match-tab-pill__flag" />
      ) : (
        <span className="match-tab-pill__flag match-tab-pill__flag--empty">·</span>
      )}
    </button>
  );
}

export function MatchTabs({ matches, activeMatch, winners, numToSlot, onSelect }) {
  if (!matches || matches.length === 0 || !activeMatch) return null;

  return (
    <div className="match-tabs nice-scroll edge-fade-x snap-x">
      {matches.map((m) => (
        <MatchTabPill
          key={m.num}
          m={m}
          active={m.num === activeMatch.num}
          winners={winners}
          numToSlot={numToSlot}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

// ----------------------------------------------------------------------------
// MATCH DETAIL BODY — reusable scoreline + timeline + score calls. Used inside
// the modal (other tabs) and inline in the Matchday master-detail pane.
// onSaveScorePrediction(slotKey, score|null, match) → boolean.
// ----------------------------------------------------------------------------
export function MatchDetailBody({ match, winners, numToSlot, friends = [], selfUid, onFlagClick, onSaveScorePrediction }) {
  const slotKey = match ? (match.isKnockout ? numToSlot?.get(match.num) : `rail-${match.num}`) : null;
  const scorePrediction = slotKey ? getScorePrediction(winners, slotKey) : null;

  const otherPredictions = useMemo(
    () => (match ? friendScorePredictionsForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );
  const missingPredictions = useMemo(
    () => (match ? friendsMissingScorePredictionForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );

  const [scoreA, setScoreA] = useState(scorePrediction?.[0] ?? "");
  const [scoreB, setScoreB] = useState(scorePrediction?.[1] ?? "");
  const [toast, setToast] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setScoreA(scorePrediction?.[0] ?? "");
    setScoreB(scorePrediction?.[1] ?? "");
  }, [scorePrediction?.[0], scorePrediction?.[1], match?.num]);

  if (!match) return null;

  const played = match.status === "played";
  const live = match.status === "live";
  const kickoffPassed = !!match.kickoff && Date.now() >= match.kickoff.getTime();
  const upcoming = match.status === "upcoming" && !kickoffPassed;
  const canEditScore = upcoming && !!onSaveScorePrediction && !!slotKey;

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleSaveScore = async () => {
    const sA = parseInt(scoreA, 10);
    const sB = parseInt(scoreB, 10);
    if (!isNaN(sA) && !isNaN(sB) && sA >= 0 && sB >= 0) {
      const ok = await onSaveScorePrediction?.(slotKey, [sA, sB], match);
      if (ok) showToast(`Score prediction saved: ${sA}–${sB}`);
      else showToast("Could not save prediction.", "error");
    }
  };

  const hasScorePrediction = scorePrediction != null;

  const handleClearClick = () => {
    if (hasScorePrediction) {
      setShowClearConfirm(true);
    } else {
      setScoreA("");
      setScoreB("");
    }
  };

  const handleClearConfirm = async () => {
    setScoreA("");
    setScoreB("");
    const ok = await onSaveScorePrediction?.(slotKey, null, match);
    if (ok) showToast("Score prediction cleared");
    else showToast("Could not clear prediction.", "error");
    setShowClearConfirm(false);
  };

  const [yourA, yourB] = mapPredictedScores(scorePrediction, match.team1, match.team2, match);
  const yourPoints =
    played && scorePrediction && match.ftScore
      ? gradeScorePrediction(scorePrediction, match.ftScore).scorePoints
      : 0;
  const actualFtScore = match.ftScore ?? match.score;
  const teamsConfirmed = !!match.team1 && !!match.team2;

  // Your bracket winner pick for this fixture (knockout slots only).
  const bracketPickId = match.isKnockout && slotKey && !slotKey.startsWith("rail-") ? winners?.[slotKey] : null;
  const bracketPickTeam =
    bracketPickId === match.team1?.id ? match.team1 : bracketPickId === match.team2?.id ? match.team2 : null;
  const bracketPickCorrect = played && match.winner && bracketPickId ? match.winner.id === bracketPickId : null;

  const statusLabel = played
    ? `${match.phase === "aet" ? "AFTER EXTRA TIME" : match.phase === "pens" ? "PENALTIES" : "FULL TIME"}${match.kickoff ? ` · ${match.kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}` : ""}`
    : null;

  return (
    <div className="mm-body">
        {/* scoreline */}
        <div className="mm-scoreline">
          <TeamSide team={match.team1} refName={match.ref1} won={played && match.winnerIdx === 0} right onFlagClick={onFlagClick} />
          <div className="mm-center">
            {match.score ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="mm-center__score"
              >
                {match.score[0]}–{match.score[1]}
              </motion.div>
            ) : (
              <div className="mm-center__vs">vs</div>
            )}
            {live && (
              <span className="mm-center__live">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
                {liveMinute(match.kickoff)}
              </span>
            )}
            {statusLabel && <span className="mm-center__status">{statusLabel}</span>}
            {match.pens && <span className="mm-center__pens">{match.pens[0]}–{match.pens[1]} pens</span>}
            {match.ht && <span className="mm-center__ht">HT {match.ht[0]}–{match.ht[1]}</span>}
            {upcoming && match.kickoff && <Countdown to={match.kickoff} />}
          </div>
          <TeamSide team={match.team2} refName={match.ref2} won={played && match.winnerIdx === 1} onFlagClick={onFlagClick} />
        </div>

        <div className="mm-grid">
          {/* LEFT — match info + timeline */}
          <div className="mm-card">
            <p className="mm-card__title">Match</p>
            <div className="mm-meta">
              {match.kickoff && <span><span className="mdi mdi-clock-outline" /> {fmtKickoff(match.kickoff)}</span>}
              {match.ground && <span><span className="mdi mdi-map-marker-outline" /> {match.ground}</span>}
            </div>
            <GoalTimeline match={match} />
            {bracketPickTeam && (
              <div className="mm-bracket-pick">
                <span className="mm-bracket-pick__label">Your bracket pick:</span>
                <span
                  className={[
                    "mm-bracket-pick__team",
                    bracketPickCorrect === true && "mm-bracket-pick__team--right",
                    bracketPickCorrect === false && "mm-bracket-pick__team--wrong",
                  ].filter(Boolean).join(" ")}
                >
                  <img src={flagSrc(bracketPickTeam.iso2, 40)} alt="" />
                  {bracketPickTeam.code}
                  {bracketPickCorrect === true && <span className="mdi mdi-check" />}
                  {bracketPickCorrect === false && <span className="mdi mdi-close" />}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT — score calls */}
          {teamsConfirmed && (
            <div className="mm-card">
              <div className="mm-card__head">
                <p className="mm-card__title">{played ? "Score calls — graded" : "Score calls"}</p>
                <span className="mm-card__hint">one side +{SCORE_ONE_SIDE_POINTS} · exact +{SCORE_EXACT_POINTS}</span>
              </div>

              <div className="mm-calls">
                {/* You — editable tile for upcoming; same row layout as others once played */}
                <div
                  className={
                    canEditScore
                      ? "mm-call-row mm-call-row--you"
                      : [
                          "mm-call-row",
                          played && yourPoints === SCORE_EXACT_POINTS && "mm-call-row--exact",
                        ].filter(Boolean).join(" ")
                  }
                >
                  <span
                    className={
                      canEditScore
                        ? "mm-call-row__avatar mm-call-row__avatar--you"
                        : "mm-call-row__avatar"
                    }
                  >
                    {canEditScore ? "You" : "Yo"}
                  </span>
                  <span className="mm-call-row__name">
                    You
                    {played && yourPoints === SCORE_EXACT_POINTS && <span className="mm-nailed">NAILED IT</span>}
                  </span>
                  {canEditScore ? (
                    <span className="mm-call-row__edit">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={scoreA}
                        onChange={(e) => setScoreA(e.target.value)}
                        className="mm-score-input mm-score-input--predicted"
                        placeholder="0"
                        aria-label={`${match.team1?.code ?? "Team 1"} predicted score`}
                      />
                      <span className="mm-call-row__dash">–</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={scoreB}
                        onChange={(e) => setScoreB(e.target.value)}
                        className="mm-score-input mm-score-input--predicted"
                        placeholder="0"
                        aria-label={`${match.team2?.code ?? "Team 2"} predicted score`}
                      />
                      <button type="button" onClick={handleSaveScore} aria-label="Save prediction" className="mm-mini-btn mm-mini-btn--save">
                        ✓
                      </button>
                      {hasScorePrediction && (
                        <button type="button" onClick={handleClearClick} aria-label="Clear prediction" className="mm-mini-btn">
                          ✕
                        </button>
                      )}
                    </span>
                  ) : (
                    <>
                      <span className="mm-call-row__score">
                        <ScoreNumbers a={yourA} b={yourB} ftScore={actualFtScore} graded={played} />
                      </span>
                      <span className={["mm-call-row__pts", yourPoints > 0 && "mm-call-row__pts--hit"].filter(Boolean).join(" ")}>
                        {played ? (yourPoints > 0 ? `+${yourPoints}` : yourA != null ? "0" : "—") : ""}
                      </span>
                    </>
                  )}
                </div>

                {otherPredictions.map((entry) => (
                  <div
                    key={entry.uid}
                    className={["mm-call-row", played && entry.points === SCORE_EXACT_POINTS && "mm-call-row--exact"].filter(Boolean).join(" ")}
                  >
                    <span className="mm-call-row__avatar">{initials(entry.name)}</span>
                    <span className="mm-call-row__name">
                      {entry.name}
                      {played && entry.points === SCORE_EXACT_POINTS && <span className="mm-nailed">NAILED IT</span>}
                    </span>
                    <span className="mm-call-row__score">
                      <ScoreNumbers a={entry.home} b={entry.away} ftScore={actualFtScore} graded={played} />
                    </span>
                    <span className={["mm-call-row__pts", entry.points > 0 && "mm-call-row__pts--hit"].filter(Boolean).join(" ")}>
                      {played ? (entry.points > 0 ? `+${entry.points}` : "0") : ""}
                    </span>
                  </div>
                ))}

                {otherPredictions.length === 0 && !hasScorePrediction && !canEditScore && (
                  <p className="mm-calls__empty">No score calls for this one.</p>
                )}
              </div>

              {missingPredictions.length > 0 && (
                <div className="mm-missing">
                  <p className="mm-missing__label">
                    {played ? `Sat this one out (${missingPredictions.length})` : `Haven't called it yet (${missingPredictions.length})`}
                  </p>
                  <p className="mm-missing__names">
                    {missingPredictions.map((f) => f.name).join(", ")}
                    {played && " — zero points, zero excuses."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

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
  );
}

export function MatchModal({
  match,
  matches = [],
  onSelectMatch,
  winners,
  numToSlot,
  onClose,
  onFlagClick,
  onSaveScorePrediction,
  friends = [],
  selfUid,
}) {
  useEffect(() => {
    if (!match || !onSelectMatch || matches.length === 0) return;
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const idx = matches.findIndex((m) => m.num === match.num);
      if (idx === -1) return;
      const nextIdx = e.key === "ArrowLeft" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= matches.length) return;
      e.preventDefault();
      onSelectMatch(matches[nextIdx]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match, matches, onSelectMatch]);

  if (!match) return null;

  const idx = matches.findIndex((m) => m.num === match.num);
  const prevMatch = idx > 0 ? matches[idx - 1] : null;
  const nextMatch = idx >= 0 && idx < matches.length - 1 ? matches[idx + 1] : null;
  const navLabel = (m) =>
    m.score
      ? `${m.team1?.code ?? "TBD"} ${m.score[0]}–${m.score[1]} ${m.team2?.code ?? "TBD"}`
      : `${m.team1?.code ?? "TBD"} v ${m.team2?.code ?? "TBD"}`;

  return (
    <Modal open={!!match} onClose={onClose} maxW="max-w-3xl" sheet>
      <div className="mm-header">
        <span className="mm-round-pill">{match.group || match.roundLabel}</span>
        {match.num && <span className="mm-match-num">Match {match.num}</span>}
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="mm-close" aria-label="Close">
          ✕
        </button>
      </div>

      {matches.length > 0 && onSelectMatch && (
        <MatchTabs
          matches={matches}
          activeMatch={match}
          winners={winners}
          numToSlot={numToSlot}
          onSelect={onSelectMatch}
        />
      )}

      <div className="nice-scroll relative flex-1 overflow-y-auto">
        <MatchDetailBody
          match={match}
          winners={winners}
          numToSlot={numToSlot}
          friends={friends}
          selfUid={selfUid}
          onFlagClick={onFlagClick}
          onSaveScorePrediction={onSaveScorePrediction}
        />

        {(prevMatch || nextMatch) && (
          <div className="mm-footer">
            {prevMatch ? (
              <button type="button" onClick={() => onSelectMatch?.(prevMatch)} className="mm-footer__nav">
                <span className="mdi mdi-arrow-left" />
                {navLabel(prevMatch)}
              </button>
            ) : <span />}
            <span className="mm-footer__hint">Use arrow keys to move between matches</span>
            {nextMatch ? (
              <button type="button" onClick={() => onSelectMatch?.(nextMatch)} className="mm-footer__nav">
                {navLabel(nextMatch)}
                <span className="mdi mdi-arrow-right" />
              </button>
            ) : <span />}
          </div>
        )}
      </div>
    </Modal>
  );
}
