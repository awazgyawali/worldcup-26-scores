import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Modal } from "../common/Modal";
import { Countdown } from "../common/Countdown";
import { isRef } from "../../lib/teams";
import {
  friendScorePredictionsForMatch,
  friendsMissingScorePredictionForMatch,
  friendBracketPicksForMatch,
  friendComebackPicksForMatch,
  friendsMissingComebackForMatch,
  friendPathPicksForMatch,
  friendsMissingPathCallForMatch,
  getScorePrediction,
  getMatchdayPick,
  getMatchdayRisk,
  comebackStakes,
  isComebackRiskEligible,
  isComebackEligible,
  getPathCallPick,
  isPathCallEligible,
  gradeScorePrediction,
  mapPredictedScores,
  SCORE_ONE_SIDE_POINTS,
  getScoreExactPoints,
  MATCHDAY_PICK_POINTS,
  PATH_CALL_CORRECT_POINTS,
  PATH_CALL_WRONG_POINTS,
  PATH_CHOICES,
  PATH_SKIP,
  PATH_LABELS,
} from "../../lib/scoring";
import { computeMatchImpact, scenarioForImpact } from "../../lib/matchImpact";
import { ImpactStrip } from "./ImpactStrip";
import { fmtKickoff, goalMinuteVal, flagSrc, flagSrcSet, liveMinute } from "../../lib/format";
import { goalMatchPhase } from "../team/journeyHelpers";
import { ROUNDS, THIRD_PLACE } from "../../lib/rounds";

/** Icon per path-call option — regulation/ET/pens/opt-out each get a distinct glyph. */
const PATH_ICONS = {
  reg: "mdi-clock-outline",
  aet: "mdi-clock-plus-outline",
  pens: "mdi-soccer",
  [PATH_SKIP]: "mdi-shield-off-outline",
};

/** Points a correct winner pick earns for a knockout slot (by round). */
function roundPointsForSlot(slotKey) {
  if (!slotKey || slotKey.startsWith("rail-")) return null;
  if (slotKey.startsWith("third")) return THIRD_PLACE.points;
  const roundKey = slotKey.split("-")[0];
  return ROUNDS.find((r) => r.key === roundKey)?.points ?? null;
}

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


/** Comeback picks league — who re-picked which team for a dead-bracket knockout
 *  game (everyone whose bracket team is out), grouped by team with the +10 shown
 *  on the winning side once played. With `canEdit`, the same rows double as the
 *  editor: tap a team row to move your pick onto it (tap again to clear). */
function ComebackLeague({ match, played, youPickId, youRisked = false, comebackPicks, title, pointsHint, canEdit = false, onPickTeam, note = null, riskUI = null, ghosts = [] }) {
  const youPill = youPickId ? [{ uid: "__you__", name: "You", me: true, risked: youRisked }] : [];
  const rows = [
    { team: match.team1, picks: [...(youPickId === match.team1?.id ? youPill : []), ...comebackPicks.team1] },
    { team: match.team2, picks: [...(youPickId === match.team2?.id ? youPill : []), ...comebackPicks.team2] },
  ].filter((row) => row.team && (canEdit || row.picks.length > 0));

  const header = title && (
    <div className="mm-league-head">
      <p className="mm-bracket-league__title">{title}</p>
      {pointsHint != null && <span className="mm-league-pts">+{pointsHint} if correct</span>}
    </div>
  );

  if (rows.length === 0) {
    if (!title) return <p className="mm-calls__empty">No comeback picks for this one.</p>;
    return (
      <div className="mm-bracket-league mm-comeback__league">
        {header}
        <p className="mm-calls__empty">No one’s made a comeback pick here yet.</p>
      </div>
    );
  }

  return (
    <div className="mm-bracket-league mm-comeback__league">
      {header}
      {note}
      {rows.map(({ team, picks }) => {
        const won = played && match.winner?.id === team.id;
        const lost = played && match.winner && match.winner.id !== team.id;
        const mine = youPickId === team.id;
        const rowClass = [
          "mm-bracket-league__row",
          won && "mm-bracket-league__row--right",
          lost && "mm-bracket-league__row--wrong",
          canEdit && "mm-bracket-league__row--tap",
          canEdit && mine && "mm-bracket-league__row--picked",
        ].filter(Boolean).join(" ");
        const label = (
          <span className="mm-bracket-league__team">
            <img src={flagSrc(team.iso2, 40)} alt="" />
            {canEdit ? team.name : team.code}
            {won && <span className="mdi mdi-check" aria-hidden="true" />}
            {lost && <span className="mdi mdi-close" aria-hidden="true" />}
            {won && <span className="mm-comeback__pts">+{MATCHDAY_PICK_POINTS}</span>}
          </span>
        );
        const pills = (
          <span className="mm-bracket-league__names">
            {picks.map((p) => (
              <span
                key={p.uid}
                className={["mm-bracket-league__pill", p.me && "mm-bracket-league__pill--you"].filter(Boolean).join(" ")}
              >
                {p.name}
                {p.risked && <span className="mdi mdi-fire mm-comeback__pill-risk" title="Risked it" aria-label="Risked it" />}
              </span>
            ))}
          </span>
        );
        const inner = canEdit ? (
          <>
            <span className="mm-bracket-league__rowhead">
              {label}
              <span className="mm-bracket-league__select" aria-hidden="true">
                {!mine && <span className="mm-bracket-league__pts-hint">+{pointsHint ?? MATCHDAY_PICK_POINTS}</span>}
                <span className={mine ? "mm-radio mm-radio--on" : "mm-radio"}>
                  {mine && <span className="mdi mdi-check" />}
                </span>
              </span>
            </span>
            {picks.length > 0 && (
              <>
                <span className="mm-bracket-league__divider" aria-hidden="true" />
                {pills}
              </>
            )}
          </>
        ) : (
          <>
            {label}
            {pills}
          </>
        );
        return canEdit ? (
          <button
            key={team.id}
            type="button"
            className={rowClass}
            onClick={() => onPickTeam?.(team.id)}
            aria-pressed={mine}
          >
            {inner}
          </button>
        ) : (
          <div key={team.id} className={rowClass}>
            {inner}
          </div>
        );
      })}
      {riskUI}
      {ghosts.length > 0 && (
        <div className="mm-ghost-row">
          <span className="mm-bracket-league__hint">yet to pick</span>
          {ghosts.map((p) => (
            <span key={p.uid} className="mm-bracket-league__pill mm-bracket-league__pill--ghost">
              {p.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Path call league — who called regulation/ET/pens for this knockout game,
 *  grouped by option, with the winning option marked once played. With
 *  `canEdit`, every option row is shown and tappable — your pick moves between
 *  rows (tap it again to clear). */
function PathLeague({ match, played, youPick, pathPicks, title, canEdit = false, onPick, ghosts = [] }) {
  const outcome = played
    ? match.phase === "pens" ? "pens" : match.phase === "aet" ? "aet" : match.phase === "ft" ? "reg" : null
    : null;
  // No explicit call yet while editing ⇒ you sit on "Won't risk it" by default.
  const shownPick = youPick ?? (canEdit ? PATH_SKIP : null);
  const youPill = shownPick ? [{ uid: "__you__", name: "You", me: true }] : [];
  const rows = PATH_CHOICES.map((opt) => ({
    opt,
    picks: [...(shownPick === opt ? youPill : []), ...(pathPicks[opt] || [])],
    // Friends with no call ride the default too — shown as dotted ghosts.
    ghosts: opt === PATH_SKIP ? ghosts : [],
  })).filter((row) => canEdit || row.picks.length > 0 || row.ghosts.length > 0);

  const header = title && (
    <div className="mm-league-head">
      <p className="mm-bracket-league__title">{title}</p>
      <span className="mm-league-pts">+{PATH_CALL_CORRECT_POINTS} if right · {PATH_CALL_WRONG_POINTS} if wrong</span>
    </div>
  );

  if (rows.length === 0) {
    if (!title) return <p className="mm-calls__empty">No path calls for this one.</p>;
    return (
      <div className="mm-bracket-league mm-path__league">
        {header}
        <p className="mm-calls__empty">No one’s made a path call here yet.</p>
      </div>
    );
  }

  return (
    <div className="mm-bracket-league mm-path__league">
      {header}
      {canEdit && <p className="mm-path__note">How does this one get decided? Tap a row to call it.</p>}
      {rows.map(({ opt, picks, ghosts: rowGhosts }) => {
        const graded = opt !== PATH_SKIP;
        const right = graded && played && outcome === opt;
        const wrong = graded && played && outcome != null && outcome !== opt;
        const mine = shownPick === opt;
        const isSkip = opt === PATH_SKIP;
        const rowClass = [
          "mm-bracket-league__row",
          right && "mm-bracket-league__row--right",
          wrong && "mm-bracket-league__row--wrong",
          canEdit && "mm-bracket-league__row--tap",
          canEdit && mine && "mm-bracket-league__row--picked",
        ].filter(Boolean).join(" ");
        const label = (
          <span className="mm-bracket-league__team">
            <span className={["mdi", PATH_ICONS[opt]].join(" ")} aria-hidden="true" />
            {PATH_LABELS[opt]}
            {right && <span className="mdi mdi-check" aria-hidden="true" />}
            {wrong && <span className="mdi mdi-close" aria-hidden="true" />}
            {right && <span className="mm-comeback__pts">+{PATH_CALL_CORRECT_POINTS}</span>}
          </span>
        );
        const pills = (
          <span className="mm-bracket-league__names">
            {picks.map((p) => (
              <span
                key={p.uid}
                className={["mm-bracket-league__pill", p.me && "mm-bracket-league__pill--you"].filter(Boolean).join(" ")}
              >
                {p.name}
              </span>
            ))}
            {rowGhosts.map((p) => (
              <span key={p.uid} className="mm-bracket-league__pill mm-bracket-league__pill--ghost">
                {p.name}
              </span>
            ))}
          </span>
        );
        const hasPills = picks.length > 0 || rowGhosts.length > 0;
        const inner = canEdit ? (
          <>
            <span className="mm-bracket-league__rowhead">
              {label}
              <span className="mm-bracket-league__select" aria-hidden="true">
                {!mine && isSkip && <span className="mm-bracket-league__pts-hint">no points</span>}
                <span className={mine ? "mm-radio mm-radio--on" : "mm-radio"}>
                  {mine && <span className="mdi mdi-check" />}
                </span>
              </span>
            </span>
            {hasPills && (
              <>
                <span className="mm-bracket-league__divider" aria-hidden="true" />
                {pills}
              </>
            )}
          </>
        ) : (
          <>
            {label}
            {pills}
          </>
        );
        return canEdit ? (
          <button key={opt} type="button" className={rowClass} onClick={() => onPick?.(opt)} aria-pressed={mine}>
            {inner}
          </button>
        ) : (
          <div key={opt} className={rowClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// MATCH DETAIL BODY — reusable scoreline + timeline + score calls. Used inside
// the modal (other tabs) and inline in the Matchday master-detail pane.
// onSaveScorePrediction(slotKey, score|null, match) → boolean.
// ----------------------------------------------------------------------------
export function MatchDetailBody({ match, winners, scoreWinners, numToSlot, friends = [], selfUid, onFlagClick, onSaveScorePrediction, onSaveMatchdayPick, onSaveMatchdayRisk, onSavePathCallPick, onOpenSimulator = null, lockTimeMs = null, allowComeback = false, teamById = null }) {
  const slotKey = match ? (match.isKnockout ? numToSlot?.get(match.num) : `rail-${match.num}`) : null;
  const scoreSource = scoreWinners ?? winners;
  const scorePrediction = slotKey ? getScorePrediction(scoreSource, slotKey) : null;

  const otherPredictions = useMemo(
    () => (match ? friendScorePredictionsForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );
  const missingPredictions = useMemo(
    () => (match ? friendsMissingScorePredictionForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );
  const bracketPicks = useMemo(
    () => (match ? friendBracketPicksForMatch(friends, slotKey, match, selfUid) : { team1: [], team2: [] }),
    [friends, slotKey, match, selfUid]
  );
  const comebackPicks = useMemo(
    () => (match ? friendComebackPicksForMatch(friends, slotKey, match, selfUid) : { team1: [], team2: [] }),
    [friends, slotKey, match, selfUid]
  );
  const missingComeback = useMemo(
    () => (match ? friendsMissingComebackForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );
  const pathPicks = useMemo(
    () => (match ? friendPathPicksForMatch(friends, slotKey, match, selfUid) : { reg: [], aet: [], pens: [] }),
    [friends, slotKey, match, selfUid]
  );
  const missingPathCall = useMemo(
    () => (match ? friendsMissingPathCallForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );

  const [scoreA, setScoreA] = useState(scorePrediction?.[0] ?? "");
  const [scoreB, setScoreB] = useState(scorePrediction?.[1] ?? "");
  const [isEditingScore, setIsEditingScore] = useState(!scorePrediction);
  const [toast, setToast] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setScoreA(scorePrediction?.[0] ?? "");
    setScoreB(scorePrediction?.[1] ?? "");
    setIsEditingScore(!scorePrediction);
  }, [scorePrediction?.[0], scorePrediction?.[1], match?.num]);

  // While the score inputs are open, the draft overrides the saved prediction
  // so the impact strip reacts as you type — before anything is saved.
  const draftEditing = isEditingScore || !scorePrediction;
  const impact = useMemo(
    () =>
      allowComeback
        ? computeMatchImpact({
            match,
            slotKey,
            friends,
            selfUid,
            myWinners: scoreSource,
            draftScore: draftEditing ? [scoreA, scoreB] : null,
            teamById,
          })
        : null,
    [allowComeback, match, slotKey, friends, selfUid, scoreSource, draftEditing, scoreA, scoreB, teamById]
  );
  const impactScenario = impact ? scenarioForImpact(slotKey, impact.outcome) : null;

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

  const handleSaveScore = () => {
    const sA = parseInt(scoreA, 10);
    const sB = parseInt(scoreB, 10);
    if (!isNaN(sA) && !isNaN(sB) && sA >= 0 && sB >= 0) {
      setIsEditingScore(false);
      void Promise.resolve(onSaveScorePrediction?.(slotKey, [sA, sB], match)).then((ok) => {
        if (ok === false) {
          setIsEditingScore(true);
          showToast("Could not save prediction.", "error");
        }
      });
    }
  };

  const hasScorePrediction = scorePrediction != null;
  const showScoreInputs = canEditScore && (!hasScorePrediction || isEditingScore);

  const handleClearClick = () => {
    if (hasScorePrediction) {
      setShowClearConfirm(true);
    } else {
      setScoreA("");
      setScoreB("");
    }
  };

  const handleClearConfirm = () => {
    setScoreA("");
    setScoreB("");
    setIsEditingScore(true);
    setShowClearConfirm(false);
    void Promise.resolve(onSaveScorePrediction?.(slotKey, null, match)).then((ok) => {
      if (ok === false) showToast("Could not clear prediction.", "error");
    });
  };

  const [yourA, yourB] = mapPredictedScores(scorePrediction, match.team1, match.team2, match);
  const yourPoints =
    played && scorePrediction && match.ftScore
      ? gradeScorePrediction(scorePrediction, match.ftScore, slotKey).scorePoints
      : 0;
  const exactPoints = getScoreExactPoints(slotKey);
  const actualFtScore = match.ftScore ?? match.score;
  const teamsConfirmed = !!match.team1 && !!match.team2;

  // Your bracket winner pick for this fixture (knockout slots only).
  const bracketPickId = match.isKnockout && slotKey && !slotKey.startsWith("rail-") ? winners?.[slotKey] : null;
  const bracketPickTeam =
    bracketPickId === match.team1?.id ? match.team1 : bracketPickId === match.team2?.id ? match.team2 : null;
  const bracketPickCorrect = played && match.winner && bracketPickId ? match.winner.id === bracketPickId : null;

  // Comeback pick — offered when the bracket winner is out of this knockout game.
  const comebackEligible = allowComeback && isComebackEligible(bracketPickId, match, lockTimeMs);
  const comebackPickId = comebackEligible ? getMatchdayPick(scoreSource, slotKey) : null;
  const deadBracketTeam = comebackEligible ? (teamById?.get(bracketPickId) ?? null) : null;
  const canEditComeback = comebackEligible && upcoming && !!onSaveMatchdayPick && !!slotKey;
  // Social list on the left: show whenever anyone (friends or you) has re-picked
  // a winner here because their bracket team is out.
  const showComebackLeague =
    allowComeback &&
    !!match?.isKnockout &&
    (canEditComeback || comebackPicks.team1.length > 0 || comebackPicks.team2.length > 0 || !!comebackPickId);

  const handleComebackPick = async (teamId) => {
    const next = comebackPickId === teamId ? null : teamId; // tap the current pick again to clear
    const ok = await onSaveMatchdayPick?.(slotKey, next, match);
    if (ok) showToast(next ? "Comeback pick saved" : "Comeback pick cleared");
    else showToast("Could not save comeback pick.", "error");
  };

  // "Risk it" — optional stake bump on the comeback pick, third place + final only.
  const comebackRiskEligible = comebackEligible && isComebackRiskEligible(slotKey);
  const comebackRisked = comebackRiskEligible && getMatchdayRisk(scoreSource, slotKey);
  const comebackPayout = comebackStakes(slotKey, comebackRisked);
  const canEditComebackRisk = comebackRiskEligible && canEditComeback && !!onSaveMatchdayRisk;

  const handleComebackRisk = async () => {
    const next = !comebackRisked;
    const ok = await onSaveMatchdayRisk?.(slotKey, next, match);
    const stakes = comebackStakes(slotKey, true);
    if (ok) showToast(next ? `Risk on — ${stakes.wrong} wrong, +${stakes.correct} right` : "Risk off — back to the safe +10");
    else showToast("Could not save risk toggle.", "error");
  };

  // Path call — bet on regulation / extra time / penalties for this knockout game.
  const pathEligible = allowComeback && isPathCallEligible(match);
  const pathPick = pathEligible ? getPathCallPick(scoreSource, slotKey) : null;
  const canEditPath = pathEligible && upcoming && !!onSavePathCallPick && !!slotKey;
  const handlePathPick = async (path) => {
    const next = pathPick === path ? null : path; // tap the current pick again to clear
    const ok = await onSavePathCallPick?.(slotKey, next, match);
    if (ok) showToast(next ? "Path call saved" : "Path call cleared");
    else showToast("Could not save path call.", "error");
  };

  // Social list on the left: show whenever anyone (friends or you) has made a path call.
  const showPathLeague =
    allowComeback &&
    !!match?.isKnockout &&
    (canEditPath || pathPicks.reg.length > 0 || pathPicks.aet.length > 0 || pathPicks.pens.length > 0 || !!pathPick);

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

        {/* Who picked whom to advance — pills straight under each side's flag */}
        {match.isKnockout && (bracketPicks.team1.length > 0 || bracketPicks.team2.length > 0 || bracketPickTeam) && (
          <div className="mm-scoreline-picks">
            {[
              { team: match.team1, picks: bracketPicks.team1, side: "left" },
              { team: match.team2, picks: bracketPicks.team2, side: "right" },
            ].map(({ team, picks, side }) => {
              const youToo = !!team && bracketPickId === team.id;
              const won = played && !!team && match.winner?.id === team.id;
              const lost = played && !!team && match.winner && match.winner.id !== team.id;
              return (
                <div
                  key={side}
                  className={[
                    "mm-scoreline-picks__side",
                    side === "right" && "mm-scoreline-picks__side--right",
                    won && "mm-scoreline-picks__side--won",
                    lost && "mm-scoreline-picks__side--lost",
                  ].filter(Boolean).join(" ")}
                >
                  {youToo && (
                    <span className="mm-bracket-league__pill mm-bracket-league__pill--you">
                      You
                      {bracketPickCorrect === true && <span className="mdi mdi-check" />}
                      {bracketPickCorrect === false && <span className="mdi mdi-close" />}
                    </span>
                  )}
                  {picks.map((p) => (
                    <span key={p.uid} className="mm-bracket-league__pill">{p.name}</span>
                  ))}
                </div>
              );
            })}
            {roundPointsForSlot(slotKey) != null && (
              <span className="mm-scoreline-picks__pts">+{roundPointsForSlot(slotKey)} advance</span>
            )}
          </div>
        )}

        {/* If-your-call-lands projection — this game only, live as you type */}
        {impact && (
          <div className="mm-impact">
            <ImpactStrip
              impact={impact}
              match={match}
              onOpenSimulator={impactScenario && onOpenSimulator ? () => onOpenSimulator(impactScenario) : null}
            />
          </div>
        )}

        <div className="mm-grid">
          {/* LEFT — member details first (who picked what), match detail below */}
          <div className="mm-picks-col">
            {/* Comeback picks — its own card; the league doubles as your editor:
                tap a team row to move your pick onto it. */}
            {showComebackLeague && (
              <div className="mm-card">
                <ComebackLeague
                  title={canEditComeback ? "Comeback pick" : "League comeback picks"}
                  pointsHint={comebackPayout?.correct ?? MATCHDAY_PICK_POINTS}
                  match={match}
                  played={played}
                  youPickId={comebackPickId}
                  youRisked={comebackRisked}
                  comebackPicks={comebackPicks}
                  canEdit={canEditComeback}
                  onPickTeam={handleComebackPick}
                  ghosts={upcoming ? missingComeback : []}
                  note={
                    canEditComeback ? (
                      <p className="mm-comeback__note">
                        {deadBracketTeam ? (
                          <span className="mm-comeback__dead">
                            <img src={flagSrc(deadBracketTeam.iso2, 40)} alt="" />
                            {deadBracketTeam.code}
                          </span>
                        ) : (
                          <span className="mm-comeback__dead">Your bracket pick</span>
                        )}{" "}
                        is out of this game — back a new winner to keep scoring it.
                      </p>
                    ) : null
                  }
                  riskUI={
                    comebackRiskEligible && (canEditComebackRisk || comebackRisked) ? (
                      <div className={["mm-comeback__risk", comebackRisked && "mm-comeback__risk--on"].filter(Boolean).join(" ")}>
                        <div className="mm-comeback__risk-text">
                          <span className="mm-comeback__risk-title">
                            <span className="mdi mdi-fire" aria-hidden="true" /> Risk it
                          </span>
                          <span className="mm-comeback__risk-hint">
                            {comebackStakes(slotKey, true).wrong} if wrong · +{comebackStakes(slotKey, true).correct} if right
                          </span>
                        </div>
                        {canEditComebackRisk ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={comebackRisked}
                            onClick={handleComebackRisk}
                            className={["mm-comeback__risk-toggle", comebackRisked && "mm-comeback__risk-toggle--on"].filter(Boolean).join(" ")}
                          >
                            <span className="mm-comeback__risk-knob" />
                          </button>
                        ) : (
                          <span className="mm-comeback__risk-locked">risked</span>
                        )}
                      </div>
                    ) : null
                  }
                />
              </div>
            )}

            {/* Path calls — its own card; same element shows everyone's calls
                and takes yours. Players yet to call ride "Won't risk it" as
                dotted ghosts. */}
            {showPathLeague && (
              <div className="mm-card">
                <PathLeague
                  title={canEditPath ? "Path call" : "League path calls"}
                  match={match}
                  played={played}
                  youPick={pathPick}
                  pathPicks={pathPicks}
                  canEdit={canEditPath}
                  onPick={handlePathPick}
                  ghosts={upcoming ? missingPathCall : []}
                />
              </div>
            )}
          </div>

          {/* RIGHT — score calls only; comeback + path editing now lives in the
              league lists on the left, so nothing is duplicated here. */}
          {teamsConfirmed && (
            <div className="mm-calls-col">
              <div className="mm-card">
              <div className="mm-card__head">
                <p className="mm-card__title">{played ? "Score calls — graded" : "Score calls"}</p>
                <span className="mm-card__hint">one side +{SCORE_ONE_SIDE_POINTS} · exact +{exactPoints}</span>
              </div>
              {match.isKnockout && (
                <p className="mm-score-note">Regular time only — extra time and penalties don't count.</p>
              )}

              <div className="mm-calls">
                {/* You — editable tile for upcoming; same row layout as others once played */}
                <div
                  className={
                    showScoreInputs
                      ? "mm-call-row mm-call-row--you"
                      : [
                          "mm-call-row",
                          canEditScore && hasScorePrediction && "mm-call-row--you",
                          played && yourPoints === exactPoints && "mm-call-row--exact",
                        ].filter(Boolean).join(" ")
                  }
                >
                  <span
                    className={
                      showScoreInputs || (canEditScore && hasScorePrediction)
                        ? "mm-call-row__avatar mm-call-row__avatar--you"
                        : "mm-call-row__avatar"
                    }
                  >
                    {showScoreInputs || (canEditScore && hasScorePrediction) ? "You" : "Yo"}
                  </span>
                  <span className="mm-call-row__name">
                    You
                    {played && yourPoints === exactPoints && <span className="mm-nailed">NAILED IT</span>}
                  </span>
                  {showScoreInputs ? (
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
                  ) : canEditScore && hasScorePrediction ? (
                    <>
                      <span className="mm-call-row__score">
                        <ScoreNumbers a={yourA} b={yourB} ftScore={actualFtScore} graded={played} />
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingScore(true)}
                        className="mm-call-row__edit-btn"
                      >
                        Edit
                      </button>
                    </>
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
                    className={["mm-call-row", played && entry.points === exactPoints && "mm-call-row--exact"].filter(Boolean).join(" ")}
                  >
                    <span className="mm-call-row__avatar">{initials(entry.name)}</span>
                    <span className="mm-call-row__name">
                      {entry.name}
                      {played && entry.points === exactPoints && <span className="mm-nailed">NAILED IT</span>}
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
                <div className="mm-ghost-row">
                  <span className="mm-bracket-league__hint">{played ? "sat out" : "yet to call"}</span>
                  {missingPredictions.map((f) => (
                    <span key={f.uid} className="mm-bracket-league__pill mm-bracket-league__pill--ghost">
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
              </div>
            </div>
          )}

          {/* Match detail — venue, time, goals — lowest priority, last on mobile */}
          <div className="mm-card mm-card--info">
            <div className="mm-matchinfo">
              <p className="mm-card__title">Match detail</p>
              <div className="mm-meta">
                {match.kickoff && <span><span className="mdi mdi-clock-outline" /> {fmtKickoff(match.kickoff)}</span>}
                {match.ground && <span><span className="mdi mdi-map-marker-outline" /> {match.ground}</span>}
              </div>
              <GoalTimeline match={match} />
            </div>
          </div>
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
  scoreWinners,
  numToSlot,
  onClose,
  onFlagClick,
  onSaveScorePrediction,
  onSaveMatchdayPick,
  onSaveMatchdayRisk,
  onSavePathCallPick,
  onOpenSimulator = null,
  lockTimeMs = null,
  teamById = null,
  allowComeback = false,
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
    <Modal open={!!match} onClose={onClose} maxW="max-w-5xl" maxH="max-h-[min(92vh,880px)]" sheet>
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

      <div className="mm-scroll nice-scroll relative flex-1 overflow-y-auto">
        <MatchDetailBody
          match={match}
          winners={winners}
          scoreWinners={scoreWinners}
          numToSlot={numToSlot}
          friends={friends}
          selfUid={selfUid}
          onFlagClick={onFlagClick}
          onSaveScorePrediction={onSaveScorePrediction}
          onSaveMatchdayPick={onSaveMatchdayPick}
          onSaveMatchdayRisk={onSaveMatchdayRisk}
          onSavePathCallPick={onSavePathCallPick}
          onOpenSimulator={onOpenSimulator}
          lockTimeMs={lockTimeMs}
          teamById={teamById}
          allowComeback={allowComeback}
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
