import { useEffect, useMemo, useState } from "react";
import { MatchCard } from "./MatchCard";
import { TrophyMark, ThirdPlaceCard, ChampionBanner } from "./PodiumColumn";
import { bracketHighlightFor } from "./Connectors";
import { getMatchTeams } from "../../lib/bracket";
import { getScorePrediction, getMatchPredictionInfo } from "../../lib/scoring";
import { ROUNDS, THIRD_PLACE, key } from "../../lib/rounds";

const MOBILE_TABS = [
  ...ROUNDS.map((r, i) => ({ id: r.key, label: r.short, roundIdx: i, kind: "round" })),
  { id: "third", label: "3RD", roundIdx: "third", kind: "third" },
];

function MobileMatchItem({
  slotKey,
  roundIdx,
  matchIdx,
  winners,
  teams,
  onPick,
  actual,
  slotMatches,
  liveKey,
  nextKey,
  guidanceKey,
  onFlagClick,
  onOpenMatch,
  readOnly,
  revealGrades,
  teamById,
  byNum,
  lockTimeMs,
  compareFriend,
  compareMap,
}) {
  const rk = slotKey;
  const match = slotMatches[rk];
  const round = typeof roundIdx === "number" ? ROUNDS[roundIdx] : null;
  const [a, b] = getMatchTeams(roundIdx, matchIdx, winners, teams);

  const scorePrediction = getScorePrediction(winners, rk);
  const predictionInfo = getMatchPredictionInfo(
    winners,
    match ?? { status: "upcoming" },
    rk,
    true,
    round?.points ?? THIRD_PLACE.points,
    teamById,
    byNum,
    lockTimeMs
  );

  return (
    <MatchCard
      slotKey={rk}
      roundIdx={roundIdx}
      matchIdx={matchIdx}
      teams={[a, b]}
      winnerId={winners[rk]}
      onPick={onPick}
      actualId={actual[rk]}
      match={match}
      highlight={bracketHighlightFor(rk, { guidanceKey, liveKey, nextKey })}
      onFlagClick={onFlagClick}
      onOpenMatch={onOpenMatch}
      readOnly={readOnly}
      revealGrades={revealGrades}
      scorePrediction={scorePrediction}
      predictionInfo={predictionInfo}
      compareVerdict={compareMap?.[rk] ?? null}
      comparePickId={compareFriend?.winners?.[rk] ?? null}
      compareName={compareFriend?.name ?? null}
      mobileList
    />
  );
}

export function MobileBracketList({
  winners,
  teams,
  onPick,
  actual,
  champion,
  actualChampion,
  slotMatches,
  liveKey,
  nextKey,
  guidanceKey,
  onFlagClick,
  onOpenMatch,
  readOnly = false,
  revealGrades = false,
  teamById,
  byNum,
  lockTimeMs = null,
  compareFriend = null,
  compareMap = null,
  stats,
  showPoints = true,
}) {
  const [activeTab, setActiveTab] = useState("r16");

  useEffect(() => {
    if (!guidanceKey) return;
    const prefix = guidanceKey.split("-")[0];
    if (prefix === "third") setActiveTab("third");
    else if (MOBILE_TABS.some((t) => t.id === prefix)) setActiveTab(prefix);
  }, [guidanceKey]);

  useEffect(() => {
    if (!guidanceKey) return;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-bracket-slot="${guidanceKey}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [guidanceKey, activeTab]);

  const tabMeta = useMemo(() => MOBILE_TABS.find((t) => t.id === activeTab) ?? MOBILE_TABS[1], [activeTab]);

  const matches = useMemo(() => {
    if (tabMeta.kind === "third") {
      return [{ slotKey: "third-0", roundIdx: "third", matchIdx: 0 }];
    }
    const round = ROUNDS[tabMeta.roundIdx];
    return Array.from({ length: round.matches }, (_, m) => ({
      slotKey: key(round.key, m),
      roundIdx: tabMeta.roundIdx,
      matchIdx: m,
    }));
  }, [tabMeta]);

  const roundLabel =
    tabMeta.kind === "third"
      ? THIRD_PLACE.label
      : ROUNDS[tabMeta.roundIdx]?.label ?? "";
  const roundPts =
    tabMeta.kind === "third" ? THIRD_PLACE.points : ROUNDS[tabMeta.roundIdx]?.points ?? 0;

  const shared = {
    winners,
    teams,
    onPick,
    actual,
    slotMatches,
    liveKey,
    nextKey,
    guidanceKey,
    onFlagClick,
    onOpenMatch,
    readOnly,
    revealGrades,
    teamById,
    byNum,
    lockTimeMs,
    compareFriend,
    compareMap,
  };

  const isFinalTab = activeTab === "final";

  return (
    <div className="mobile-bracket">
      <div className="mobile-bracket__subhead">
        <p className="mobile-bracket__guide">Select your winner</p>
        <div className="mobile-bracket__tabs" role="tablist">
          {MOBILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={["mobile-bracket__tab", activeTab === tab.id && "mobile-bracket__tab--active"].filter(Boolean).join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-bracket__body nice-scroll">
        {isFinalTab && (
          <div className="mobile-bracket__podium">
            <ChampionBanner champion={actualChampion || champion} isActual={!!actualChampion} />
            {showPoints && stats && (
              <div className="mobile-bracket__points">
                Points: <span>{stats.totalPoints ?? stats.points ?? "—"}</span>
              </div>
            )}
            <div className="mobile-bracket__champion-card">
              <TrophyMark champion={actualChampion || champion} />
            </div>
          </div>
        )}

        <div className="mobile-bracket__round-head">
          <h3 className="mobile-bracket__round-title">{roundLabel}</h3>
          <span className="mobile-bracket__round-meta">
            {roundPts} pts · {matches.length} match{matches.length === 1 ? "" : "es"}
          </span>
        </div>

        <div className="mobile-bracket__list">
          {tabMeta.kind === "third" ? (
            <ThirdPlaceCard
              winners={winners}
              teams={teams}
              onPick={onPick}
              actual={actual}
              slotMatches={slotMatches}
              onFlagClick={onFlagClick}
              onOpenMatch={onOpenMatch}
              liveKey={liveKey}
              nextKey={nextKey}
              guidanceKey={guidanceKey}
              readOnly={readOnly}
              revealGrades={revealGrades}
              compareVerdict={compareMap?.["third-0"] ?? null}
              comparePickId={compareFriend?.winners?.["third-0"] ?? null}
              compareName={compareFriend?.name ?? null}
              compact
            />
          ) : (
            matches.map((m) => (
              <MobileMatchItem key={m.slotKey} {...m} {...shared} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
