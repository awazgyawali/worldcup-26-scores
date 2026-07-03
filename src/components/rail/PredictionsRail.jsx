import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RailCard } from "./RailCard";
import { getScorePrediction, getMatchPredictionInfo } from "../../lib/scoring";
import { isMatchScorable } from "../../lib/bracket";
import { fmtDay } from "../../lib/format";

export function RailGuideLabel() {
  return <p className="rail-guide-label">Predict score on upcoming games</p>;
}

export function PredictionsRail({ matches, liveNums, nextNum, numToSlot, winners, actual, teams, revealGrades, onOpenMatch, canEdit, onPickRailWinner, byNum, isViewingOther, viewerName, roundPoints, lockTimeMs = null, showScoreGuide = false, scoreGuideNum = null, scoreGuideMatch = null }) {
  const scrollRef = useRef(null);
  const anchorRef = useRef(null);
  const anchored = useRef(false);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const RAIL_SCROLL_CARDS = 3;

  const updateRailScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateRailScrollState();
    el.addEventListener("scroll", updateRailScrollState, { passive: true });
    const ro = new ResizeObserver(updateRailScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateRailScrollState);
      ro.disconnect();
    };
  }, [matches, updateRailScrollState]);

  useEffect(() => {
    if (anchored.current || !anchorRef.current || !scrollRef.current) return;
    const el = anchorRef.current;
    scrollRef.current.scrollLeft = el.offsetLeft - scrollRef.current.clientWidth / 2 + el.clientWidth / 2;
    anchored.current = true;
    updateRailScrollState();
  }, [matches, updateRailScrollState]);

  const scrollRail = useCallback((direction) => {
    const container = scrollRef.current;
    if (!container) return;
    const firstCard = container.querySelector("[data-rail-card]");
    if (!firstCard) return;
    const gap = parseFloat(getComputedStyle(container).columnGap || getComputedStyle(container).gap) || 0;
    const step = (firstCard.getBoundingClientRect().width + gap) * RAIL_SCROLL_CARDS;
    container.scrollBy({ left: direction * step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!scoreGuideNum || !scrollRef.current) return;
    const timer = window.setTimeout(() => {
      const el = scrollRef.current?.querySelector(`[data-rail-num="${scoreGuideNum}"]`);
      if (!el || !scrollRef.current) return;
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [scoreGuideNum]);

  const anchorNum = liveNums[0] ?? nextNum;
  let lastDate = null;

  return (
    <div className="prediction-rail-shell">
      <div className="prediction-rail">
      <button
        type="button"
        className="prediction-rail__nav"
        aria-label="Previous matches"
        disabled={!canScrollLeft}
        onClick={() => scrollRail(-1)}
      >
        ‹
      </button>
      <div ref={scrollRef} className="prediction-rail__scroll ticker-scroll edge-fade-x snap-x">
        {matches.map((m, i) => {
          const dayChip =
            m.date !== lastDate && m.kickoff ? (
              <div key={`day-${m.date}`} className="rail-day-chip">
                <span>{fmtDay(m.kickoff)}</span>
              </div>
            ) : null;
          lastDate = m.date;

          const isKnockout = m.isKnockout;
          const slotKey = numToSlot.get(m.num);
          // For non-knockout games, use rail- prefix
          const railKey = `rail-${m.num}`;
          const pickId = isKnockout
            ? (slotKey ? winners[slotKey] : null)
            : winners[railKey];
          const actualId = isKnockout
            ? (slotKey && isMatchScorable(m, lockTimeMs) ? actual[slotKey] : null)
            : (m.status === "played" && m.winner && isMatchScorable(m, lockTimeMs) ? m.winner.id : null);
          const scorePrediction = isKnockout
            ? (slotKey ? getScorePrediction(winners, slotKey) : null)
            : getScorePrediction(winners, railKey);

          const predictionInfo = getMatchPredictionInfo(
            winners,
            m,
            slotKey,
            isKnockout,
            isKnockout ? (roundPoints?.[slotKey] || 1) : 1,
            teamById,
            byNum,
            lockTimeMs
          );

          return (
            <React.Fragment key={m.num}>
              {dayChip}
              <div ref={m.num === anchorNum ? anchorRef : undefined} className="shrink-0" data-rail-card data-rail-num={m.num}>
                <RailCard
                  match={m}
                  index={i}
                  pickTeam={pickId ? teamById.get(pickId) ?? null : null}
                  actualTeam={actualId ? teamById.get(actualId) ?? null : null}
                  isLive={liveNums.includes(m.num)}
                  isNext={m.num === nextNum}
                  isGuide={showScoreGuide && m.num === scoreGuideNum}
                  revealGrades={revealGrades}
                  onClick={() => onOpenMatch(m)}
                  isKnockout={isKnockout}
                  onPickWinner={!isKnockout ? (teamId) => onPickRailWinner?.(m.num, teamId, isKnockout) : undefined}
                  canPick={canEdit && !isKnockout}
                  scorePrediction={scorePrediction}
                  predictionInfo={predictionInfo}
                  viewerName={viewerName}
                  isViewingOther={isViewingOther}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <button
        type="button"
        className="prediction-rail__nav"
        aria-label="Next matches"
        disabled={!canScrollRight}
        onClick={() => scrollRail(1)}
      >
        ›
      </button>
      </div>
    </div>
  );
}
