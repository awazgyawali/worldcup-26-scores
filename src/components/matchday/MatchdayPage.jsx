import { useEffect, useMemo, useRef } from "react";
import {
  getScorePrediction,
  gradeScorePrediction,
  getMatchdayPick,
  getMatchdayRisk,
  comebackStakes,
  isComebackEligible,
  getPathCallPick,
  isPathCallEligible,
  PATH_CALL_CORRECT_POINTS,
  PATH_SKIP,
  PATH_LABELS,
  SCORE_SUFFIX,
} from "../../lib/scoring";
import { flagSrc, fmtTimeOnly, fmtCountdown, liveMinute } from "../../lib/format";
import { MatchDetailBody, MatchTabs } from "../match/MatchModal";

function matchSlotKey(match, numToSlot) {
  return match.isKnockout ? numToSlot?.get(match.num) : `rail-${match.num}`;
}

/** Live first, then next upcoming kickoff, then any unplayed, else last fixture. */
export function findNextMatchNum(matches) {
  const live = matches.find((m) => m.status === "live");
  if (live?.num != null) return live.num;
  const now = Date.now();
  const upcoming = matches.find(
    (m) => m.status === "upcoming" && m.kickoff && m.kickoff.getTime() > now
  );
  if (upcoming?.num != null) return upcoming.num;
  const pending = matches.find((m) => m.status !== "played");
  if (pending?.num != null) return pending.num;
  return matches[matches.length - 1]?.num ?? null;
}

function fmtScheduleDay(d) {
  return d
    .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
}

function callChip({ prediction, played, scorePoints, scoreResult, isNext }) {
  if (played && prediction) {
    if (scorePoints > 0) {
      const exact = scoreResult === "exact";
      return {
        text: exact ? `✓ Your call ${prediction[0]}–${prediction[1]} · +${scorePoints}` : `✓ Your call ${prediction[0]}–${prediction[1]} · +${scorePoints}`,
        kind: "hit",
      };
    }
    return { text: `✕ Your call ${prediction[0]}–${prediction[1]} · missed +0`, kind: "miss" };
  }
  if (prediction) return { text: `Your call ${prediction[0]}–${prediction[1]}`, kind: "yours" };
  if (isNext) return { text: "Tap to call it", kind: "next" };
  if (played) return { text: "No call made", kind: "muted" };
  return { text: "Tap to call it", kind: "next" };
}

function navLabel(m) {
  return m.score
    ? `${m.team1?.code ?? "TBD"} ${m.score[0]}–${m.score[1]} ${m.team2?.code ?? "TBD"}`
    : `${m.team1?.code ?? "TBD"} v ${m.team2?.code ?? "TBD"}`;
}

function MatchdayDesktopDetail({
  match,
  winners,
  scoreWinners,
  numToSlot,
  friends,
  selfUid,
  onFlagClick,
  onSaveScorePrediction,
  onSaveMatchdayPick,
  onSaveMatchdayRisk,
  onSavePathCallPick,
  lockTimeMs,
  teamById,
  allowComeback,
}) {
  if (!match) return null;

  return (
    <div className="matchday-desktop-detail">
      <div className="mm-header matchday-desktop-detail__head">
        <span className="mm-round-pill">{match.group || match.roundLabel}</span>
        {match.num && <span className="mm-match-num">Match {match.num}</span>}
      </div>
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
        lockTimeMs={lockTimeMs}
        teamById={teamById}
        allowComeback={allowComeback}
      />
    </div>
  );
}

function MatchdayMobileView({
  match,
  matches,
  winners,
  scoreWinners,
  numToSlot,
  friends,
  selfUid,
  onFlagClick,
  onSaveScorePrediction,
  onSaveMatchdayPick,
  onSaveMatchdayRisk,
  onSavePathCallPick,
  lockTimeMs,
  teamById,
  allowComeback,
  onSelectMatch,
}) {
  if (!match) return null;

  const idx = matches.findIndex((m) => m.num === match.num);
  const prevMatch = idx > 0 ? matches[idx - 1] : null;
  const nextMatch = idx >= 0 && idx < matches.length - 1 ? matches[idx + 1] : null;

  return (
    <div className="matchday-mobile-view">
      <div className="mm-header matchday-mobile-view__head">
        <span className="mm-round-pill">{match.group || match.roundLabel}</span>
        {match.num && <span className="mm-match-num">Match {match.num}</span>}
      </div>

      <MatchTabs
        matches={matches}
        activeMatch={match}
        winners={winners}
        numToSlot={numToSlot}
        onSelect={onSelectMatch}
      />

      <div className="matchday-mobile-view__scroll nice-scroll">
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
          lockTimeMs={lockTimeMs}
          teamById={teamById}
          allowComeback={allowComeback}
        />

        {(prevMatch || nextMatch) && (
          <div className="mm-footer">
            {prevMatch ? (
              <button type="button" onClick={() => onSelectMatch(prevMatch)} className="mm-footer__nav">
                <span className="mdi mdi-arrow-left" />
                {navLabel(prevMatch)}
              </button>
            ) : (
              <span />
            )}
            {nextMatch ? (
              <button type="button" onClick={() => onSelectMatch(nextMatch)} className="mm-footer__nav">
                {navLabel(nextMatch)}
                <span className="mdi mdi-arrow-right" />
              </button>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchdayStepper({ step }) {
  const steps = [
    { n: 1, label: "Fill bracket" },
    { n: 2, label: "Lock it in" },
    { n: 3, label: "Predict games" },
  ];
  return (
    <div className="matchday-stepper">
      {steps.map((s, i) => (
        <div key={s.n} className="matchday-stepper__wrap">
          <div
            className={[
              "matchday-stepper__pill",
              step > s.n && "matchday-stepper__pill--done",
              step === s.n && "matchday-stepper__pill--active",
            ].filter(Boolean).join(" ")}
          >
            {step > s.n ? (
              <>✓ {s.label}</>
            ) : (
              <>
                <span className="matchday-stepper__num">{s.n}</span>
                {s.label}
              </>
            )}
          </div>
          {i < steps.length - 1 && <span className="matchday-stepper__line" />}
        </div>
      ))}
    </div>
  );
}

function LockBanner({ title, sub, buttonLabel, onAction }) {
  return (
    <div className="matchday-lock-banner">
      <div className="matchday-lock-banner__title">{title}</div>
      <div className="matchday-lock-banner__sub">{sub}</div>
      <button type="button" onClick={onAction} className="matchday-lock-banner__btn">
        {buttonLabel}
      </button>
    </div>
  );
}

function ScheduleRailCard({ m, slotKey, isNext, selected, prediction, comebackEligible, comebackTeam, comebackPayout, pathEligible, pathPick, onSelect }) {
  const played = m.status === "played";
  const live = m.status === "live";
  const { scoreResult, scorePoints } = played && prediction && m.ftScore
    ? gradeScorePrediction(prediction, m.ftScore, slotKey)
    : { scoreResult: null, scorePoints: 0 };
  const chip = callChip({ prediction, played, scorePoints, scoreResult, isNext: isNext && !live && !played });
  const comebackWon = played && comebackTeam && m.winner?.id === comebackTeam.id;
  const pathOutcome = played ? (m.phase === "pens" ? "pens" : m.phase === "aet" ? "aet" : m.phase === "ft" ? "reg" : null) : null;
  const pathIsGraded = pathPick && pathPick !== PATH_SKIP;
  const pathWon = played && pathIsGraded && pathOutcome ? pathPick === pathOutcome : null;

  return (
    <div data-num={m.num} className="md-rail-tile">
      <button
        type="button"
        onClick={() => onSelect?.(m)}
        className={[
          "md-rail-card",
          selected && "md-rail-card--selected",
          isNext && !played && !live && "md-rail-card--next",
        ].filter(Boolean).join(" ")}
      >
        <div className="md-rail-card__top">
          <span className="md-rail-card__meta">
            {(m.group || m.roundLabel || "").toUpperCase()} · {m.kickoff ? fmtTimeOnly(m.kickoff) : "TBD"}
          </span>
          <span className="md-rail-card__badge">
            {live ? (
              <span className="md-rail-card__live"><span className="live-dot" />{liveMinute(m.kickoff)}</span>
            ) : played ? (
              "FT"
            ) : isNext ? (
              <span className="md-rail-card__next-pill">
                NEXT{m.kickoff ? ` · ${fmtCountdown(m.kickoff.getTime() - Date.now())}` : ""}
              </span>
            ) : null}
          </span>
        </div>
        <div className="md-rail-card__fixture">
          <div className="md-rail-card__team">
            <span className="md-rail-card__team-name">{m.team1?.name ?? "TBD"}</span>
            {m.team1 && <img src={flagSrc(m.team1.iso2, 40)} alt="" className="md-rail-card__flag" />}
          </div>
          <span className="md-rail-card__mid">
            {m.score ? `${m.score[0]}–${m.score[1]}` : "VS"}
          </span>
          <div className="md-rail-card__team md-rail-card__team--away">
            {m.team2 && <img src={flagSrc(m.team2.iso2, 40)} alt="" className="md-rail-card__flag" />}
            <span className="md-rail-card__team-name">{m.team2?.name ?? "TBD"}</span>
          </div>
        </div>
        <div className="md-rail-card__calls">
          <span className={["md-rail-card__chip", `md-rail-card__chip--${chip.kind}`].join(" ")}>{chip.text}</span>
          {comebackEligible && (
            <span
              className={[
                "md-rail-card__comeback",
                comebackTeam && "md-rail-card__comeback--set",
                played && comebackTeam && (comebackWon ? "md-rail-card__comeback--hit" : "md-rail-card__comeback--miss"),
              ].filter(Boolean).join(" ")}
            >
              {comebackTeam
                ? played
                  ? `↩ ${comebackTeam.code} · ${comebackWon ? `+${comebackPayout?.correct ?? 10}` : comebackPayout?.wrong ? comebackPayout.wrong : "+0"}`
                  : `↩ ${comebackTeam.code}`
                : `↩ Comeback +${comebackPayout?.correct ?? 10}`}
            </span>
          )}
          {pathEligible && pathPick && (
            <span
              className={[
                "md-rail-card__path",
                pathPick === PATH_SKIP && "md-rail-card__path--skip",
                played && pathIsGraded && (pathWon ? "md-rail-card__path--hit" : "md-rail-card__path--miss"),
              ].filter(Boolean).join(" ")}
            >
              {played && pathIsGraded
                ? `⚑ ${PATH_LABELS[pathPick]} · ${pathWon ? `+${PATH_CALL_CORRECT_POINTS}` : "−10"}`
                : `⚑ ${PATH_LABELS[pathPick]}`}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function MatchSchedule({
  matches,
  winners,
  scoreWinners,
  numToSlot,
  selectedNum,
  nextMatchNum,
  lockTimeMs,
  showComeback,
  onSelect,
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || selectedNum == null) return;
    const el = container.querySelector(`[data-num="${selectedNum}"]`);
    if (!el) return;
    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, 120);
    return () => clearTimeout(timer);
  }, [selectedNum, matches.length]);

  const byDay = useMemo(() => {
    const groups = [];
    let currentLabel = null;
    for (const m of matches) {
      const label = m.kickoff ? fmtScheduleDay(m.kickoff) : "DATE TBD";
      if (label !== currentLabel) {
        groups.push({ label, matches: [] });
        currentLabel = label;
      }
      groups[groups.length - 1].matches.push(m);
    }
    return groups;
  }, [matches]);

  return (
    <div ref={scrollRef} className="md-schedule nice-scroll">
      {byDay.map((group) => (
        <div key={group.label} className="md-schedule__group">
          <div className="md-schedule__date">{group.label}</div>
          {group.matches.map((m) => {
            const slotKey = matchSlotKey(m, numToSlot);
            const prediction = slotKey ? getScorePrediction(scoreWinners ?? winners, slotKey) : null;
            const isNext = m.num === nextMatchNum;
            const bracketPickId =
              m.isKnockout && slotKey && !slotKey.startsWith("rail-") ? winners?.[slotKey] : null;
            const comebackEligible = showComeback && isComebackEligible(bracketPickId, m, lockTimeMs);
            const comebackPickId = comebackEligible ? getMatchdayPick(scoreWinners ?? winners, slotKey) : null;
            const comebackTeam =
              comebackPickId === m.team1?.id ? m.team1 : comebackPickId === m.team2?.id ? m.team2 : null;
            const comebackPayout = comebackEligible
              ? comebackStakes(slotKey, getMatchdayRisk(scoreWinners ?? winners, slotKey))
              : null;
            const pathEligible = showComeback && isPathCallEligible(m);
            const pathPick = pathEligible ? getPathCallPick(scoreWinners ?? winners, slotKey) : null;
            return (
              <ScheduleRailCard
                key={m.num}
                m={m}
                slotKey={slotKey}
                isNext={isNext}
                selected={m.num === selectedNum}
                prediction={prediction}
                comebackEligible={comebackEligible}
                comebackTeam={comebackTeam}
                comebackPayout={comebackPayout}
                pathEligible={pathEligible}
                pathPick={pathPick}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function MatchdayPage({
  railMatches,
  winners,
  scoreWinners = winners,
  numToSlot,
  rankedFriends,
  uid,
  selectedNum = null,
  onSelectMatch,
  onSaveScorePrediction,
  onSaveMatchdayPick,
  onSaveMatchdayRisk,
  onSavePathCallPick,
  lockTimeMs = null,
  teamById = null,
  onFlagClick,
  locked = false,
  pickProgress = { filled: 0, total: 32, complete: false },
  isViewingSelf = true,
  onGoToBracket,
  onOpenLock,
}) {
  const onboardStep = !isViewingSelf ? 3 : !pickProgress.complete ? 1 : !locked ? 2 : 3;

  const hasScorePredictions = useMemo(
    () => Object.keys(winners).some((k) => k.endsWith(SCORE_SUFFIX) && getScorePrediction(winners, k.slice(0, -SCORE_SUFFIX.length))),
    [winners]
  );
  const showStepper = isViewingSelf && !(locked && hasScorePredictions);

  const nextMatchNum = useMemo(() => findNextMatchNum(railMatches), [railMatches]);

  const resolvedSelectedNum = useMemo(() => {
    if (selectedNum != null && railMatches.some((m) => m.num === selectedNum)) return selectedNum;
    return null;
  }, [selectedNum, railMatches]);

  // Default to the next fixture when opening Matchday without a match in the URL.
  useEffect(() => {
    if (resolvedSelectedNum != null || nextMatchNum == null) return;
    onSelectMatch?.(nextMatchNum, { replace: true });
  }, [resolvedSelectedNum, nextMatchNum, onSelectMatch]);

  const selectedMatch = useMemo(
    () => railMatches.find((m) => m.num === resolvedSelectedNum) ?? null,
    [railMatches, resolvedSelectedNum]
  );

  useEffect(() => {
    const onKey = (e) => {
      const isPrev = e.key === "ArrowUp" || e.key === "ArrowLeft";
      const isNext = e.key === "ArrowDown" || e.key === "ArrowRight";
      if (!isPrev && !isNext) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const idx = railMatches.findIndex((m) => m.num === resolvedSelectedNum);
      if (idx === -1) return;
      const nextIdx = isPrev ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= railMatches.length) return;
      e.preventDefault();
      onSelectMatch?.(railMatches[nextIdx].num);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [railMatches, resolvedSelectedNum, onSelectMatch]);

  const handleSelectMatch = (m) => {
    onSelectMatch?.(m.num);
  };

  return (
    <main className="app-main matchday-page">
      {showStepper && (
        <div className="matchday-stepper-wrap matchday-stepper-wrap--desktop">
          <MatchdayStepper step={onboardStep} />
        </div>
      )}

      {isViewingSelf && onboardStep === 1 && (
        <div className="matchday-mobile-banner">
          <LockBanner
            title="Fill your bracket first"
            sub={`${pickProgress.filled}/${pickProgress.total} picks in — complete all rounds to lock and start predicting scores.`}
            buttonLabel="Go to bracket"
            onAction={onGoToBracket}
          />
        </div>
      )}

      {isViewingSelf && onboardStep === 2 && (
        <div className="matchday-mobile-banner">
          <LockBanner
            title="Bracket complete — lock it in"
            sub="Locking is permanent for bracket picks, and puts you on the leaderboard."
            buttonLabel="Lock bracket"
            onAction={onOpenLock}
          />
        </div>
      )}

      <div className="matchday-md">
        <aside className="matchday-md__rail">
          <div className="matchday-md__rail-head">
            <span>Schedule</span>
            <span>{railMatches.length} fixtures</span>
          </div>

          {isViewingSelf && !locked && onboardStep >= 2 && (
            <div className="matchday-md__lock-note">Lock your bracket to make score calls.</div>
          )}

          {isViewingSelf && onboardStep === 1 && (
            <div className="matchday-md__lock-note matchday-md__lock-note--desktop">
              Complete your bracket before making score calls.
            </div>
          )}

          <MatchSchedule
            matches={railMatches}
            winners={winners}
            scoreWinners={scoreWinners}
            numToSlot={numToSlot}
            selectedNum={resolvedSelectedNum}
            nextMatchNum={nextMatchNum}
            lockTimeMs={lockTimeMs}
            showComeback={isViewingSelf && locked}
            onSelect={handleSelectMatch}
          />
        </aside>

        <section className="matchday-md__detail">
          {selectedMatch ? (
            <>
              <div className="matchday-md__detail-desktop">
                <MatchdayDesktopDetail
                  match={selectedMatch}
                  winners={winners}
                  scoreWinners={scoreWinners}
                  numToSlot={numToSlot}
                  friends={rankedFriends}
                  selfUid={uid}
                  onFlagClick={onFlagClick}
                  onSaveScorePrediction={onSaveScorePrediction}
                  onSaveMatchdayPick={onSaveMatchdayPick}
                  onSaveMatchdayRisk={onSaveMatchdayRisk}
                  onSavePathCallPick={onSavePathCallPick}
                  lockTimeMs={lockTimeMs}
                  teamById={teamById}
                  allowComeback={isViewingSelf}
                />
              </div>
              <div className="matchday-md__detail-mobile">
                <MatchdayMobileView
                  match={selectedMatch}
                  matches={railMatches}
                  winners={winners}
                  scoreWinners={scoreWinners}
                  numToSlot={numToSlot}
                  friends={rankedFriends}
                  selfUid={uid}
                  onFlagClick={onFlagClick}
                  onSaveScorePrediction={onSaveScorePrediction}
                  onSaveMatchdayPick={onSaveMatchdayPick}
                  onSaveMatchdayRisk={onSaveMatchdayRisk}
                  onSavePathCallPick={onSavePathCallPick}
                  lockTimeMs={lockTimeMs}
                  teamById={teamById}
                  allowComeback={isViewingSelf}
                  onSelectMatch={handleSelectMatch}
                />
              </div>
            </>
          ) : (
            <div className="matchday-md__empty">Pick a match from the schedule to see score calls and make your own.</div>
          )}
        </section>
      </div>
    </main>
  );
}
