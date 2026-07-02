import { AnimatePresence, motion } from "framer-motion";
import { MatchCard } from "./MatchCard";
import { bracketHighlightFor } from "./Connectors";
import { PointsPill } from "./PointsPill";
import { flagSrc, flagSrcSet } from "../../lib/format";
import { getThirdPlaceTeams, getMatchTeams } from "../../lib/bracket";
import { key, FINAL_ROUND } from "../../lib/rounds";

// ----------------------------------------------------------------------------
// TROPHY / CHAMPION / PODIUM
// ----------------------------------------------------------------------------
export function TrophyMark({ champion, isActual }) {
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      className="relative flex flex-col items-center gap-1.5"
    >
      <motion.div
        className="pointer-events-none absolute -inset-5 rounded-full blur-2xl"
        animate={{ opacity: champion ? [0.35, 0.65, 0.35] : [0.12, 0.28, 0.12], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: "radial-gradient(circle, rgba(245,205,110,0.5) 0%, transparent 70%)" }}
      />
      <motion.div
        className="relative text-5xl"
        animate={{ scale: champion ? [1, 1.06, 1] : [1, 1.02, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          filter: champion
            ? "drop-shadow(0 0 26px rgba(245,205,110,0.7))"
            : "grayscale(0.4) drop-shadow(0 0 14px rgba(245,205,110,0.25))",
        }}
      >
        🏆
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.div
          key={champion?.id || "empty"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="flex flex-col items-center gap-0.5 text-center"
        >
          {champion ? (
            <>
              <img
                src={flagSrc(champion.iso2)}
                srcSet={flagSrcSet(champion.iso2)}
                alt=""
                className="h-6 w-9 rounded-[3px] object-cover shadow ring-1 ring-black/40"
              />
              <span className="text-[7px] font-black uppercase tracking-[0.22em] text-amber-300/80">
                {isActual ? "World Champion" : "Your Champion"}
              </span>
              <span className="font-display text-base leading-tight tracking-wide text-white">{champion.name}</span>
            </>
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] leading-relaxed text-[var(--text-muted)]">
              pick your champion
            </span>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

export function ThirdPlaceCard({ winners, teams, onPick, actual, slotMatches, onFlagClick, onOpenMatch, liveKey, nextKey, guidanceKey, readOnly = false, revealGrades = false }) {
  const rk = "third-0";
  const match = slotMatches[rk];
  // Real fixture teams beat the predicted ones once semis are actually played.
  const predicted = getThirdPlaceTeams(winners, teams);
  const a = match?.team1 || predicted[0];
  const b = match?.team2 || predicted[1];

  return (
    <div className="flex w-full flex-col items-center gap-1">
      <span className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">
        🥉 Third place
      </span>
      <MatchCard
        slotKey={rk}
        roundIdx="third"
        matchIdx={0}
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
      />
    </div>
  );
}

/** Center column: winner block above, final at vertical center, third place below. */
export function PodiumColumn({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, guidanceKey, onFlagClick, onOpenMatch, readOnly = false, revealGrades = false, stats, showPoints = true }) {
  const rk = key("final", 0);
  return (
    <div className="podium-column">
      <div className="podium-column__above">
        <div className="points-podium">
          <PointsPill stats={stats} showPoints={showPoints} />
        </div>
        <TrophyMark champion={actualChampion || champion} isActual={!!actualChampion} />
        <div className="rounded-full bg-gradient-to-r from-amber-300 to-amber-500 px-3 py-0.5 text-[8.5px] font-black uppercase tracking-[0.22em] text-[#1a1305] shadow-[0_0_18px_-4px_rgba(245,205,110,0.5)]">
          Final
        </div>
      </div>

      <div className="podium-column__final w-full max-w-[var(--match-card-w)] lg:max-w-none">
        <MatchCard
          slotKey={rk}
          roundIdx={FINAL_ROUND}
          matchIdx={0}
          teams={getMatchTeams(FINAL_ROUND, 0, winners, teams)}
          winnerId={winners[rk]}
          onPick={onPick}
          actualId={actual[rk]}
          match={slotMatches[rk]}
          highlight={bracketHighlightFor(rk, { guidanceKey, liveKey, nextKey })}
          onFlagClick={onFlagClick}
          onOpenMatch={onOpenMatch}
          readOnly={readOnly}
          revealGrades={revealGrades}
        />
      </div>

      <div className="podium-column__below w-full max-w-[var(--match-card-w)] lg:max-w-none">
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
        />
      </div>
    </div>
  );
}
