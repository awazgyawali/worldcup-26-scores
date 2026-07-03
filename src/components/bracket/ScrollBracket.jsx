import { useEffect } from "react";
import { MatchCard } from "./MatchCard";
import { Connector, SFPodiumConnector, bracketHighlightFor, BracketGuideLabel } from "./Connectors";
import { PodiumColumn } from "./PodiumColumn";
import { getScorePrediction, connectorVerdictForSlot, getMatchPredictionInfo } from "../../lib/scoring";
import { getMatchTeams } from "../../lib/bracket";
import { ROUNDS, BRACKET_ROWS, key } from "../../lib/rounds";

// ----------------------------------------------------------------------------
// SCROLLABLE BRACKET — left→right, all rounds, horizontal scroll.
// ----------------------------------------------------------------------------
function BracketColumn({ roundIdx, indices, align, winners, teams, onPick, actual, slotMatches, liveKey, nextKey, guidanceKey, onFlagClick, onOpenMatch, colRef, readOnly = false, revealGrades = false, isViewingOther, viewerName, teamById, byNum, lockTimeMs = null }) {
  const round = ROUNDS[roundIdx];
  const rowsPerMatch = BRACKET_ROWS / indices.length;
  return (
    <div ref={colRef} className="bracket-col flex h-full flex-col self-stretch">
      <div
        className="grid h-full min-h-0 flex-1"
        style={{ gridTemplateRows: `repeat(${BRACKET_ROWS}, minmax(0, 1fr))` }}
      >
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
            <div key={m} className="flex min-h-0 items-center" style={{ gridRow: `${rowStart} / ${rowStart + rowsPerMatch}` }}>
              <MatchCard
                slotKey={rk}
                roundIdx={roundIdx}
                matchIdx={m}
                teams={getMatchTeams(roundIdx, m, winners, teams)}
                winnerId={winners[rk]}
                onPick={onPick}
                actualId={actual[rk]}
                match={match}
                align={align}
                highlight={bracketHighlightFor(rk, { guidanceKey, liveKey, nextKey })}
                onFlagClick={onFlagClick}
                onOpenMatch={onOpenMatch}
                readOnly={readOnly}
                revealGrades={revealGrades}
                scorePrediction={scorePrediction}
                predictionInfo={predictionInfo}
                viewerName={viewerName}
                isViewingOther={isViewingOther}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScrollBracket({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, guidanceKey, onFlagClick, onOpenMatch, readOnly = false, revealGrades = false, stats, isViewingOther, viewerName, teamById, byNum, lockTimeMs = null, showPoints = true, showGuideBanner = false, pickProgress, railGuideLabel = null }) {
  // Connector verdict per side: left = first half of the round, right = second.
  // Now colored by score-prediction status (green = correct, red = wrong, blue = preset).
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

  const shared = { winners, teams, onPick, actual, slotMatches, liveKey, nextKey, guidanceKey, onFlagClick, onOpenMatch, readOnly, revealGrades, stats, isViewingOther, viewerName, teamById, byNum, lockTimeMs, showPoints };

  useEffect(() => {
    if (!guidanceKey) return;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-bracket-slot="${guidanceKey}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [guidanceKey]);

  return (
    <div className="bracket-stack">
      {showGuideBanner && <BracketGuideLabel />}
      <div className="bracket-viewport">
        <div className="bracket-tree flex items-stretch gap-0">
          {/* LEFT half of the tree */}
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
            thirdVerdict={connectorVerdictForSlot(winners, actual, slotMatches, key("sf", 0), lockTimeMs)}
            readOnly={readOnly}
          />

          {/* CENTER — trophy, final, third place */}
          <div className="bracket-col flex h-full min-w-0 items-stretch">
            <PodiumColumn {...shared} champion={champion} actualChampion={actualChampion} />
          </div>

          {/* RIGHT half of the tree (mirrored) */}
          <SFPodiumConnector
            side="right"
            finalVerdict={connectorVerdictForSlot(winners, actual, slotMatches, key("sf", 1), lockTimeMs)}
            thirdVerdict={connectorVerdictForSlot(winners, actual, slotMatches, key("sf", 1), lockTimeMs)}
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
      {railGuideLabel && <div className="bracket-rail-guide-overlay">{railGuideLabel}</div>}
    </div>
  );
}
