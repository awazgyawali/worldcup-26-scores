import { useEffect, useRef, useState } from "react";
import { MatchCard } from "./MatchCard";
import { Connector, SFPodiumConnector, bracketHighlightFor, BracketGuideLabel } from "./Connectors";
import { PodiumColumn } from "./PodiumColumn";
import { getScorePrediction, connectorVerdictForSlot, getMatchPredictionInfo } from "../../lib/scoring";
import { getMatchTeams } from "../../lib/bracket";
import { ROUNDS, BRACKET_ROWS, FINAL_ROUND, key } from "../../lib/rounds";

// ----------------------------------------------------------------------------
// SCROLLABLE BRACKET — left→right tree with connector lines. Round labels live
// in an aligned header row; columns use an 8-row grid so connectors line up.
// ----------------------------------------------------------------------------
function RoundLabel({ round }) {
  return (
    <div className="bracket-round-label">
      {round.short} · {round.points} PT{round.points === 1 ? "" : "S"}
    </div>
  );
}

function BracketHeaderRow() {
  return (
    <div className="bracket-labels">
      <RoundLabel round={ROUNDS[0]} />
      <div className="bracket-connector-spacer" />
      <RoundLabel round={ROUNDS[1]} />
      <div className="bracket-connector-spacer" />
      <RoundLabel round={ROUNDS[2]} />
      <div className="bracket-connector-spacer" />
      <RoundLabel round={ROUNDS[3]} />
      <div className="bracket-connector-spacer bracket-connector-spacer--sf" />
      <div className="bracket-col-slot bracket-col-slot--center"><RoundLabel round={ROUNDS[FINAL_ROUND]} /></div>
      <div className="bracket-connector-spacer bracket-connector-spacer--sf" />
      <RoundLabel round={ROUNDS[3]} />
      <div className="bracket-connector-spacer" />
      <RoundLabel round={ROUNDS[2]} />
      <div className="bracket-connector-spacer" />
      <RoundLabel round={ROUNDS[1]} />
      <div className="bracket-connector-spacer" />
      <RoundLabel round={ROUNDS[0]} />
    </div>
  );
}

function useCompactBracket() {
  const [compact, setCompact] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e) => setCompact(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}

function BracketColumn({ roundIdx, indices, align, winners, teams, onPick, actual, slotMatches, liveKey, nextKey, guidanceKey, focusPickKey, onFlagClick, onOpenMatch, readOnly = false, revealGrades = false, isViewingOther, viewerName, teamById, byNum, lockTimeMs = null, compareFriend = null, compareMap = null, compact = false }) {
  const round = ROUNDS[roundIdx];
  const rowsPerMatch = BRACKET_ROWS / indices.length;
  return (
    <div className="bracket-col">
      <div className="grid h-full min-h-0 flex-1 bracket-col__grid" style={{
        gridTemplateRows: compact
          ? `repeat(${BRACKET_ROWS}, minmax(var(--bkt-row-min, 3.375rem), auto))`
          : `repeat(${BRACKET_ROWS}, minmax(0, 1fr))`,
      }}>
        {indices.map((m, idx) => {
          const rk = key(round.key, m);
          const rowStart = idx * rowsPerMatch + 1;
          const match = slotMatches[rk];
          const scorePrediction = getScorePrediction(winners, rk);

          const predictionInfo = getMatchPredictionInfo(
            winners,
            match ?? { status: "upcoming" },
            rk,
            true, // isKnockout
            round.points,
            teamById,
            byNum,
            lockTimeMs
          );

          return (
            <div
              key={m}
              className={["bracket-col__slot", compact && "bracket-col__slot--compact"].filter(Boolean).join(" ")}
              style={{ gridRow: `${rowStart} / ${rowStart + rowsPerMatch}` }}
            >
              <MatchCard
                slotKey={rk}
                roundIdx={roundIdx}
                matchIdx={m}
                teams={getMatchTeams(roundIdx, m, winners, teams)}
                winnerId={winners[rk]}
                onPick={onPick}
                actualId={actual[rk]}
                match={match}
                slotMatches={slotMatches}
                align={align}
                highlight={bracketHighlightFor(rk, { guidanceKey, focusPickKey, liveKey, nextKey })}
                onFlagClick={onFlagClick}
                onOpenMatch={onOpenMatch}
                readOnly={readOnly}
                revealGrades={revealGrades}
                scorePrediction={scorePrediction}
                predictionInfo={predictionInfo}
                viewerName={viewerName}
                isViewingOther={isViewingOther}
                compareVerdict={compareMap?.[rk] ?? null}
                comparePickId={compareFriend?.winners?.[rk] ?? null}
                compareName={compareFriend?.name ?? null}
                compact={compact}
                showRound={compact}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketSummaryBar({ winners, actual, compareFriend, compareMap }) {
  const roundStats = ROUNDS.map((r) => {
    let played = 0, correct = 0;
    for (let m = 0; m < r.matches; m++) {
      const rk = key(r.key, m);
      if (!actual[rk]) continue;
      played++;
      if (winners[rk] && winners[rk] === actual[rk]) correct++;
    }
    return { round: r, played, correct };
  });

  const agreementValues = compareMap ? Object.values(compareMap).filter(Boolean) : [];
  const agreementCount = agreementValues.filter((v) => v === "agree").length;

  return (
    <div className="bracket-summary-bar">
      <div className="bracket-summary-bar__pills">
        {roundStats.map(({ round, played, correct }) => (
          <span key={round.key} className="bracket-summary-pill">
            {round.short}{" "}
            {played === 0 ? (
              <span className="bracket-summary-pill--muted">pending</span>
            ) : (
              <span className={correct === played ? "bracket-summary-pill--agree" : ""}>
                {correct}/{played} right
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="bracket-summary-bar__legend">
        <span className="bracket-summary-bar__legend-item">
          <span className="bracket-summary-dot" style={{ background: "var(--agree)" }} />correct
        </span>
        <span className="bracket-summary-bar__legend-item">
          <span className="bracket-summary-dot" style={{ background: "var(--wrong)" }} />wrong
        </span>
        <span className="bracket-summary-bar__legend-item">
          <span className="bracket-summary-dot" style={{ background: "rgba(160,170,185,0.75)" }} />pre-lock
        </span>
        {compareFriend && (
          <span className="bracket-summary-bar__agreement">
            {compareFriend.name} agrees <strong>{agreementCount}/{agreementValues.length}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export function ScrollBracket({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, guidanceKey, focusPickKey, onFlagClick, onOpenMatch, readOnly = false, revealGrades = false, stats, isViewingOther, viewerName, teamById, byNum, lockTimeMs = null, showPoints = true, showGuideBanner = false, pickProgress, railGuideLabel = null, compareFriend = null, compareMap = null }) {
  const compact = useCompactBracket();
  const shared = { winners, teams, onPick, actual, slotMatches, liveKey, nextKey, guidanceKey, focusPickKey, onFlagClick, onOpenMatch, readOnly, revealGrades, stats, isViewingOther, viewerName, teamById, byNum, lockTimeMs, showPoints, compareFriend, compareMap, compact };

  // When the tree overflows (mobile / narrow windows), open centered on the
  // podium (final card) instead of at the far-left R32 column. Measured off
  // the podium element itself — the tree's midpoint isn't its visual center —
  // and after a frame so the layout has settled.
  const viewportRef = useRef(null);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      if (el.scrollWidth <= el.clientWidth) return;
      const pod = el.querySelector(".podium-final-card") ?? el.querySelector(".podium-column");
      if (!pod) return;
      const er = el.getBoundingClientRect();
      const pr = pod.getBoundingClientRect();
      el.scrollLeft += (pr.left + pr.width / 2) - (er.left + er.width / 2);
    });
    return () => cancelAnimationFrame(raf);
  }, [compact]);

  // Desktop only: glide to the slot that needs attention. On mobile this
  // anchor scroll would drag the view off to one side and defeat the centered
  // open — the centered podium is the better starting point there.
  const scrollKey = focusPickKey ?? guidanceKey;
  useEffect(() => {
    if (!scrollKey || compact) return;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-bracket-slot="${scrollKey}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [scrollKey, compact]);

  const verdictsFor = (roundIdx, side) => {
    const half = ROUNDS[roundIdx].matches / 2;
    const base = side === "left" ? 0 : half;
    return Array.from({ length: half }, (_, i) =>
      connectorVerdictForSlot(winners, actual, slotMatches, key(ROUNDS[roundIdx].key, base + i), lockTimeMs)
    );
  };
  const sideIdx = (roundIdx, side) => {
    const half = ROUNDS[roundIdx].matches / 2;
    const base = side === "left" ? 0 : half;
    return Array.from({ length: half }, (_, i) => base + i);
  };

  return (
    <div className="bracket-stack">
      {showGuideBanner && <BracketGuideLabel />}
      <BracketSummaryBar winners={winners} actual={actual} compareFriend={compareFriend} compareMap={compareMap} />
      <div ref={viewportRef} className={["bracket-viewport nice-scroll", compact && "bracket-viewport--compact"].filter(Boolean).join(" ")}>
        <div className="bracket-tree">
          <BracketHeaderRow />
          <div className="bracket-body">
            {/* LEFT half */}
            <BracketColumn roundIdx={0} indices={sideIdx(0, "left")} align="left" {...shared} />
            <Connector count={8} side="left" verdicts={verdictsFor(0, "left")} readOnly={readOnly} />
            <BracketColumn roundIdx={1} indices={sideIdx(1, "left")} align="left" {...shared} />
            <Connector count={4} side="left" verdicts={verdictsFor(1, "left")} readOnly={readOnly} />
            <BracketColumn roundIdx={2} indices={sideIdx(2, "left")} align="left" {...shared} />
            <Connector count={2} side="left" verdicts={verdictsFor(2, "left")} readOnly={readOnly} />
            <BracketColumn roundIdx={3} indices={sideIdx(3, "left")} align="left" {...shared} />
            <SFPodiumConnector
              side="left"
              finalVerdict={connectorVerdictForSlot(winners, actual, slotMatches, key("sf", 0), lockTimeMs)}
              readOnly={readOnly}
            />

            {/* CENTER */}
            <PodiumColumn {...shared} champion={champion} actualChampion={actualChampion} />

            {/* RIGHT half */}
            <SFPodiumConnector
              side="right"
              finalVerdict={connectorVerdictForSlot(winners, actual, slotMatches, key("sf", 1), lockTimeMs)}
              readOnly={readOnly}
            />
            <BracketColumn roundIdx={3} indices={sideIdx(3, "right")} align="right" {...shared} />
            <Connector count={2} side="right" verdicts={verdictsFor(2, "right")} readOnly={readOnly} />
            <BracketColumn roundIdx={2} indices={sideIdx(2, "right")} align="right" {...shared} />
            <Connector count={4} side="right" verdicts={verdictsFor(1, "right")} readOnly={readOnly} />
            <BracketColumn roundIdx={1} indices={sideIdx(1, "right")} align="right" {...shared} />
            <Connector count={8} side="right" verdicts={verdictsFor(0, "right")} readOnly={readOnly} />
            <BracketColumn roundIdx={0} indices={sideIdx(0, "right")} align="right" {...shared} />
          </div>
        </div>
      </div>
      <div className="bracket-footnote">
        <span className="mdi mdi-information-outline" aria-hidden="true" />
        <span>
          Tap a team to advance them · tap a flag for the team&apos;s journey · tap a card for match detail.
          Connector lines turn green when your pick was right, red when wrong, grey if the match was decided before you locked.
        </span>
      </div>
      {railGuideLabel && <div className="bracket-rail-guide-overlay">{railGuideLabel}</div>}
    </div>
  );
}
