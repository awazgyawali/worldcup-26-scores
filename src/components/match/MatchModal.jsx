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

function BracketPicksLeague({ match, bracketPicks, played, pointsHint }) {
  const rows = [
    { team: match.team1, picks: bracketPicks.team1 },
    { team: match.team2, picks: bracketPicks.team2 },
  ].filter((row) => row.picks.length > 0);

  if (rows.length === 0) return null;

  return (
    <div className="mm-bracket-league">
      <div className="mm-league-head">
        <p className="mm-bracket-league__title">League bracket picks</p>
        {pointsHint != null && <span className="mm-league-pts">+{pointsHint} if correct</span>}
      </div>
      {rows.map(({ team, picks }) => {
        const won = played && match.winner?.id === team.id;
        const lost = played && match.winner && match.winner.id !== team.id;
        return (
          <div
            key={team.id}
            className={[
              "mm-bracket-league__row",
              won && "mm-bracket-league__row--right",
              lost && "mm-bracket-league__row--wrong",
            ].filter(Boolean).join(" ")}
          >
            <span className="mm-bracket-league__team">
              <img src={flagSrc(team.iso2, 40)} alt="" />
              {team.code}
              {won && <span className="mdi mdi-check" aria-hidden="true" />}
              {lost && <span className="mdi mdi-close" aria-hidden="true" />}
            </span>
            <span className="mm-bracket-league__names">
              {picks.map((p) => (
                <span key={p.uid} className="mm-bracket-league__pill">
                  {p.name}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Comeback picks league — who re-picked which team for a dead-bracket knockout
 *  game (everyone whose bracket team is out), grouped by team with the +10 shown
 *  on the winning side once played. */
function ComebackLeague({ match, played, youPickId, comebackPicks, title, pointsHint }) {
  const youPill = youPickId ? [{ uid: "__you__", name: "You", me: true }] : [];
  const rows = [
    { team: match.team1, picks: [...(youPickId === match.team1?.id ? youPill : []), ...comebackPicks.team1] },
    { team: match.team2, picks: [...(youPickId === match.team2?.id ? youPill : []), ...comebackPicks.team2] },
  ].filter((row) => row.team && row.picks.length > 0);

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
      {rows.map(({ team, picks }) => {
        const won = played && match.winner?.id === team.id;
        const lost = played && match.winner && match.winner.id !== team.id;
        return (
          <div
            key={team.id}
            className={[
              "mm-bracket-league__row",
              won && "mm-bracket-league__row--right",
              lost && "mm-bracket-league__row--wrong",
            ].filter(Boolean).join(" ")}
          >
            <span className="mm-bracket-league__team">
              <img src={flagSrc(team.iso2, 40)} alt="" />
              {team.code}
              {won && <span className="mdi mdi-check" aria-hidden="true" />}
              {lost && <span className="mdi mdi-close" aria-hidden="true" />}
              {won && <span className="mm-comeback__pts">+{MATCHDAY_PICK_POINTS}</span>}
            </span>
            <span className="mm-bracket-league__names">
              {picks.map((p) => (
                <span
                  key={p.uid}
                  className={["mm-bracket-league__pill", p.me && "mm-bracket-league__pill--you"].filter(Boolean).join(" ")}
                >
                  {p.name}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Path call league — who called regulation/ET/pens for this knockout game,
 *  grouped by option, with the winning option marked once played. */
function PathLeague({ match, played, youPick, pathPicks, title }) {
  const outcome = played
    ? match.phase === "pens" ? "pens" : match.phase === "aet" ? "aet" : match.phase === "ft" ? "reg" : null
    : null;
  const youPill = youPick ? [{ uid: "__you__", name: "You", me: true }] : [];
  const rows = PATH_CHOICES.map((opt) => ({
    opt,
    picks: [...(youPick === opt ? youPill : []), ...(pathPicks[opt] || [])],
  })).filter((row) => row.picks.length > 0);

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
      {rows.map(({ opt, picks }) => {
        const graded = opt !== PATH_SKIP;
        const right = graded && played && outcome === opt;
        const wrong = graded && played && outcome != null && outcome !== opt;
        return (
          <div
            key={opt}
            className={[
              "mm-bracket-league__row",
              right && "mm-bracket-league__row--right",
              wrong && "mm-bracket-league__row--wrong",
            ].filter(Boolean).join(" ")}
          >
            <span className="mm-bracket-league__team">
              <span className={["mdi", PATH_ICONS[opt]].join(" ")} aria-hidden="true" />
              {PATH_LABELS[opt]}
              {right && <span className="mdi mdi-check" aria-hidden="true" />}
              {wrong && <span className="mdi mdi-close" aria-hidden="true" />}
              {right && <span className="mm-comeback__pts">+{PATH_CALL_CORRECT_POINTS}</span>}
            </span>
            <span className="mm-bracket-league__names">
              {picks.map((p) => (
                <span
                  key={p.uid}
                  className={["mm-bracket-league__pill", p.me && "mm-bracket-league__pill--you"].filter(Boolean).join(" ")}
                >
                  {p.name}
                </span>
              ))}
            </span>
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
export function MatchDetailBody({ match, winners, scoreWinners, numToSlot, friends = [], selfUid, onFlagClick, onSaveScorePrediction, onSaveMatchdayPick, onSavePathCallPick, lockTimeMs = null, allowComeback = false, teamById = null }) {
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
    (comebackPicks.team1.length > 0 || comebackPicks.team2.length > 0 || !!comebackPickId);

  const handleComebackPick = async (teamId) => {
    const next = comebackPickId === teamId ? null : teamId; // tap the current pick again to clear
    const ok = await onSaveMatchdayPick?.(slotKey, next, match);
    if (ok) showToast(next ? "Comeback pick saved" : "Comeback pick cleared");
    else showToast("Could not save comeback pick.", "error");
  };

  // Path call — bet on regulation / extra time / penalties for this knockout game.
  const pathEligible = allowComeback && isPathCallEligible(match);
  const pathPick = pathEligible ? getPathCallPick(scoreSource, slotKey) : null;
  const canEditPath = pathEligible && upcoming && !!onSavePathCallPick && !!slotKey;
  const pathOutcome = played ? (match.phase === "pens" ? "pens" : match.phase === "aet" ? "aet" : match.phase === "ft" ? "reg" : null) : null;
  const pathIsGraded = pathPick && pathPick !== PATH_SKIP;
  const pathCorrect = played && pathIsGraded && pathOutcome ? pathPick === pathOutcome : null;

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
    (pathPicks.reg.length > 0 || pathPicks.aet.length > 0 || pathPicks.pens.length > 0 || !!pathPick);

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
          {/* LEFT — member details first (who picked what), match detail below */}
          <div className="mm-card mm-card--picks">
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

            <BracketPicksLeague
              match={match}
              bracketPicks={bracketPicks}
              played={played}
              pointsHint={roundPointsForSlot(slotKey)}
            />

            {/* Who else re-picked a winner because their bracket team is out */}
            {showComebackLeague && (
              <ComebackLeague
                title="League comeback picks"
                pointsHint={MATCHDAY_PICK_POINTS}
                match={match}
                played={played}
                youPickId={comebackPickId}
                comebackPicks={comebackPicks}
              />
            )}

            {/* Still to pick a comeback — so you can nudge friends whose team is out */}
            {allowComeback && upcoming && missingComeback.length > 0 && (
              <div className="mm-missing mm-missing--comeback">
                <p className="mm-missing__label">Still to pick a comeback ({missingComeback.length})</p>
                <p className="mm-missing__names">{missingComeback.map((f) => f.name).join(", ")}</p>
              </div>
            )}

            {/* Who's called regulation/ET/pens for this one */}
            {showPathLeague && (
              <PathLeague
                title="League path calls"
                match={match}
                played={played}
                youPick={pathPick}
                pathPicks={pathPicks}
              />
            )}

            {/* Still to make a path call */}
            {allowComeback && upcoming && missingPathCall.length > 0 && (
              <div className="mm-missing mm-missing--path">
                <p className="mm-missing__label">Still to make a path call ({missingPathCall.length})</p>
                <p className="mm-missing__names">{missingPathCall.map((f) => f.name).join(", ")}</p>
              </div>
            )}

            {/* Match detail — venue, time, goals — lowest priority, sits at the bottom */}
            <div className="mm-matchinfo">
              <p className="mm-card__title">Match detail</p>
              <div className="mm-meta">
                {match.kickoff && <span><span className="mdi mdi-clock-outline" /> {fmtKickoff(match.kickoff)}</span>}
                {match.ground && <span><span className="mdi mdi-map-marker-outline" /> {match.ground}</span>}
              </div>
              <GoalTimeline match={match} />
            </div>
          </div>

          {/* RIGHT — your calls: your comeback winner pick (when your team is out) + score calls */}
          {teamsConfirmed && (
            <div className="mm-calls-col">
              {comebackEligible && (
                <div className={["mm-card mm-comeback-card", canEditComeback && !comebackPickId && "mm-card--needs-pick"].filter(Boolean).join(" ")}>
                  <div className="mm-card__head">
                    <p className="mm-card__title">Comeback pick</p>
                    <span className="mm-card__hint">+{MATCHDAY_PICK_POINTS} if correct</span>
                  </div>

                  <p className="mm-comeback__note">
                    {deadBracketTeam ? (
                      <span className="mm-comeback__dead">
                        <img src={flagSrc(deadBracketTeam.iso2, 40)} alt="" />
                        {deadBracketTeam.code}
                      </span>
                    ) : (
                      <span className="mm-comeback__dead">Your bracket pick</span>
                    )}{" "}
                    is out of this game —{" "}
                    {canEditComeback
                      ? "back a new winner to keep scoring it."
                      : "your replacement winner for it."}
                  </p>

                  {canEditComeback ? (
                    <div className="mm-comeback__choices">
                      {[match.team1, match.team2].map((team) => {
                        const selected = comebackPickId === team.id;
                        return (
                          <button
                            key={team.id}
                            type="button"
                            onClick={() => handleComebackPick(team.id)}
                            className={["mm-comeback__choice", selected && "mm-comeback__choice--selected"].filter(Boolean).join(" ")}
                            aria-pressed={selected}
                          >
                            <img src={flagSrc(team.iso2, 40)} alt="" />
                            <span className="mm-comeback__choice-name">{team.name}</span>
                            <span className="mm-comeback__choice-tick">
                              {selected ? <span className="mdi mdi-check" aria-hidden="true" /> : `+${MATCHDAY_PICK_POINTS}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : comebackPickId ? (
                    (() => {
                      const myTeam = comebackPickId === match.team1?.id ? match.team1 : match.team2;
                      const won = played && match.winner?.id === comebackPickId;
                      return (
                        <div
                          className={[
                            "mm-comeback__mine",
                            played && (won ? "mm-comeback__mine--hit" : "mm-comeback__mine--miss"),
                          ].filter(Boolean).join(" ")}
                        >
                          <img src={flagSrc(myTeam.iso2, 40)} alt="" />
                          <span className="mm-comeback__choice-name">{myTeam.name}</span>
                          {played ? (
                            <span className="mm-comeback__mine-pts">{won ? `+${MATCHDAY_PICK_POINTS}` : "0"}</span>
                          ) : (
                            <span className="mm-comeback__choice-tick">your pick</span>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <p className="mm-calls__empty">No comeback pick made.</p>
                  )}
                </div>
              )}

              {pathEligible && (
                <div className={["mm-card mm-path-card", canEditPath && !pathPick && "mm-card--needs-pick"].filter(Boolean).join(" ")}>
                  <div className="mm-card__head">
                    <p className="mm-card__title">Path call</p>
                    <span className="mm-card__hint">+{PATH_CALL_CORRECT_POINTS} right · {PATH_CALL_WRONG_POINTS} wrong</span>
                  </div>

                  <p className="mm-path__note">How does this one get decided?</p>

                  {canEditPath ? (
                    <div className="mm-path__choices">
                      {PATH_CHOICES.map((opt) => {
                        const selected = pathPick === opt;
                        const isSkip = opt === PATH_SKIP;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => handlePathPick(opt)}
                            className={[
                              "mm-path__choice",
                              isSkip && "mm-path__choice--skip",
                              selected && "mm-path__choice--selected",
                            ].filter(Boolean).join(" ")}
                            aria-pressed={selected}
                          >
                            <span className={["mdi", PATH_ICONS[opt], "mm-path__choice-icon"].join(" ")} aria-hidden="true" />
                            <span className="mm-path__choice-name">{PATH_LABELS[opt]}</span>
                            <span className="mm-path__choice-tick">
                              {selected ? <span className="mdi mdi-check" aria-hidden="true" /> : isSkip ? "no points" : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : pathPick ? (
                    <div
                      className={[
                        "mm-path__mine",
                        pathPick === PATH_SKIP && "mm-path__mine--skip",
                        played && pathIsGraded && (pathCorrect ? "mm-path__mine--hit" : "mm-path__mine--miss"),
                      ].filter(Boolean).join(" ")}
                    >
                      <span className={["mdi", PATH_ICONS[pathPick], "mm-path__choice-icon"].join(" ")} aria-hidden="true" />
                      <span className="mm-path__choice-name">{PATH_LABELS[pathPick]}</span>
                      {pathPick === PATH_SKIP ? (
                        <span className="mm-path__choice-tick">sat out</span>
                      ) : played ? (
                        <span className="mm-path__mine-pts">{pathCorrect ? `+${PATH_CALL_CORRECT_POINTS}` : PATH_CALL_WRONG_POINTS}</span>
                      ) : (
                        <span className="mm-path__choice-tick">your pick</span>
                      )}
                    </div>
                  ) : (
                    <p className="mm-calls__empty">No path call made.</p>
                  )}
                </div>
              )}

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
  scoreWinners,
  numToSlot,
  onClose,
  onFlagClick,
  onSaveScorePrediction,
  onSaveMatchdayPick,
  onSavePathCallPick,
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
          onSavePathCallPick={onSavePathCallPick}
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
