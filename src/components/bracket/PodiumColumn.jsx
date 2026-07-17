import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MatchCard } from "./MatchCard";
import { bracketHighlightFor } from "./Connectors";
import { flagSrc, flagSrcSet } from "../../lib/format";
import { getThirdPlaceTeams, getMatchTeams, getEliminationInfo } from "../../lib/bracket";
import { key, FINAL_ROUND, THIRD_PLACE } from "../../lib/rounds";
import lottie from "lottie-web/build/player/lottie_light";
import trophyAnimationData from "../../assets/trophy-animation.json";
import sadAnimationData from "../../assets/sad-animation.json";

// ----------------------------------------------------------------------------
// TROPHY / CHAMPION / PODIUM
// ----------------------------------------------------------------------------
// Play the trophy draw-in once per page load; later mounts show the last frame.
let trophyHasPlayed = false;

export function TrophyMark({ champion, mourning = false }) {
  const hostRef = useRef(null);

  useEffect(() => {
    // Mourning swaps the trophy for the looping sad face; the keyed wrapper
    // below remounts this host so the morph always starts from frame 0.
    const anim = lottie.loadAnimation({
      container: hostRef.current,
      renderer: "svg",
      loop: mourning,
      autoplay: mourning,
      animationData: mourning ? sadAnimationData : trophyAnimationData,
    });
    if (!mourning) {
      if (trophyHasPlayed) {
        anim.goToAndStop(anim.totalFrames - 1, true);
      } else {
        anim.addEventListener("complete", () => {
          trophyHasPlayed = true;
        });
        anim.play();
      }
    }
    return () => anim.destroy();
  }, [mourning]);

  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
      className="relative flex flex-col items-center"
    >
      <motion.div
        className="pointer-events-none absolute inset-3 rounded-full blur-2xl"
        animate={{ opacity: champion && !mourning ? [0.35, 0.65, 0.35] : [0.12, 0.28, 0.12], scale: [0.92, 1.08, 0.92] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: mourning
            ? "radial-gradient(circle, rgba(255,176,48,0.3) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(245,205,110,0.5) 0%, transparent 70%)",
        }}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mourning ? "sad" : "trophy"}
          initial={{ scale: 0.4, opacity: 0, rotate: mourning ? -14 : 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0, y: 0 }}
          exit={{ scale: 0.5, opacity: 0, rotate: mourning ? 0 : 10, y: -6, filter: "blur(4px)" }}
          transition={{ type: "spring", stiffness: 210, damping: 18 }}
        >
          <div
            ref={hostRef}
            className={mourning ? "trophy-anim trophy-anim--sad" : "trophy-anim"}
            aria-hidden="true"
            style={{
              filter: mourning
                ? "drop-shadow(0 0 14px rgba(255,176,48,0.3))"
                : champion
                  ? "drop-shadow(0 0 22px rgba(245,205,110,0.55))"
                  : "grayscale(0.35) opacity(0.85)",
            }}
          />
        </motion.div>
      </AnimatePresence>
      {!champion && !mourning && (
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] leading-relaxed text-[var(--text-muted)]">
          pick your champion
        </span>
      )}
    </motion.div>
  );
}

/** Hero banner at the top of the bracket screen — the champion's flag + name, big. */
export function ChampionBanner({ champion, isActual, lost = false }) {
  return (
    <AnimatePresence mode="wait">
      {champion && (
        <motion.div
          key={champion.id + (lost ? "-lost" : "")}
          initial={{ opacity: 0, y: -14, scale: 0.97 }}
          animate={lost
            ? { opacity: 1, y: 0, scale: 1, x: [0, -7, 7, -4, 4, 0] }
            : { opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={["champion-banner", lost && "champion-banner--lost"].filter(Boolean).join(" ")}
        >
          <span className="champion-banner__wing" aria-hidden="true" />
          <motion.span
            className="champion-banner__flag-wrap"
            initial={{ rotate: -6, scale: 0.8 }}
            animate={{ rotate: lost ? -4 : 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.15 }}
          >
            <img
              src={flagSrc(champion.iso2)}
              srcSet={flagSrcSet(champion.iso2)}
              alt=""
              className="champion-banner__flag"
            />
          </motion.span>
          <div className="champion-banner__text">
            <span className="champion-banner__kicker">
              {lost ? "✦ Eliminated ✦" : <>✦ {isActual ? "World Champion" : "Your Champion"} ✦</>}
            </span>
            <span className="champion-banner__name">{champion.name}</span>
          </div>
          <span className="champion-banner__wing champion-banner__wing--right" aria-hidden="true" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ThirdPlaceCard({ winners, teams, onPick, actual, slotMatches, onFlagClick, onOpenMatch, liveKey, nextKey, guidanceKey, focusPickKey, readOnly = false, revealGrades = false, compareVerdict = null, comparePickId = null, compareName = null, compact = false }) {
  const rk = "third-0";
  const match = slotMatches[rk];
  // Always show the user's predicted fixture (the semi-final teams they
  // eliminated), like every other bracket slot; the real fixture only fills a
  // side the user's picks can't resolve.
  const predicted = getThirdPlaceTeams(winners, teams);
  const a = predicted[0] || match?.team1;
  const b = predicted[1] || match?.team2;

  return (
    <div className="podium-third-card w-full">
      <span className="podium-third-card__label">{THIRD_PLACE.label} · {THIRD_PLACE.points} pts</span>
      <MatchCard
        slotKey={rk}
        roundIdx="third"
        matchIdx={0}
        teams={[a, b]}
        winnerId={winners[rk]}
        onPick={onPick}
        actualId={actual[rk]}
        match={match}
        slotMatches={slotMatches}
        highlight={bracketHighlightFor(rk, { guidanceKey, focusPickKey, liveKey, nextKey })}
        onFlagClick={onFlagClick}
        onOpenMatch={onOpenMatch}
        readOnly={readOnly}
        revealGrades={revealGrades}
        compareVerdict={compareVerdict}
        comparePickId={comparePickId}
        compareName={compareName}
        compact={compact}
        showRound={compact}
      />
    </div>
  );
}

/** Center column: winner block above, final at vertical center, third place below. */
export function PodiumColumn({ winners, teams, onPick, actual, champion, actualChampion, slotMatches, liveKey, nextKey, guidanceKey, focusPickKey, onFlagClick, onOpenMatch, readOnly = false, revealGrades = false, compareFriend = null, compareMap = null, compact = false }) {
  const rk = key("final", 0);
  const heroChampion = actualChampion || champion;
  // The user's champion pick already lost a real knockout game — they can't
  // win the tournament anymore, so the podium goes into mourning.
  const championLost =
    !actualChampion && !!champion && !!getEliminationInfo(slotMatches)?.losers.has(champion.id);
  return (
    <div className="podium-column">
      <div className={["podium-column__above", heroChampion && "podium-column__above--champion"].filter(Boolean).join(" ")}>
        <div className="podium-column__trophy">
          <TrophyMark champion={heroChampion} mourning={championLost} />
        </div>
        <ChampionBanner champion={heroChampion} isActual={!!actualChampion} lost={championLost} />
      </div>

      <div className="podium-final-card w-full">
        <MatchCard
          slotKey={rk}
          roundIdx={FINAL_ROUND}
          matchIdx={0}
          teams={getMatchTeams(FINAL_ROUND, 0, winners, teams)}
          winnerId={winners[rk]}
          onPick={onPick}
          actualId={actual[rk]}
          match={slotMatches[rk]}
          slotMatches={slotMatches}
          highlight={bracketHighlightFor(rk, { guidanceKey, focusPickKey, liveKey, nextKey })}
          onFlagClick={onFlagClick}
          onOpenMatch={onOpenMatch}
          readOnly={readOnly}
          revealGrades={revealGrades}
          compareVerdict={compareMap?.[rk] ?? null}
          comparePickId={compareFriend?.winners?.[rk] ?? null}
          compareName={compareFriend?.name ?? null}
          compact={compact}
          showRound={compact}
        />

        {compareFriend && (() => {
          const rivalChampionId = compareFriend.winners[key("final", 0)];
          const rivalChampion = rivalChampionId ? teams.find((t) => t.id === rivalChampionId) : null;
          if (!rivalChampion) return null;
          const differs = !champion || champion.id !== rivalChampion.id;
          return (
            <p className="podium-final-card__rival">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: differs ? "var(--pitch-glow)" : "var(--agree)" }}
              />
              {compareFriend.name}&apos;s champion is <span className="font-bold text-[var(--text-primary)]">{rivalChampion.code}</span>
            </p>
          );
        })()}
      </div>

      <div className="podium-column__below w-full">
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
          focusPickKey={focusPickKey}
          readOnly={readOnly}
          revealGrades={revealGrades}
          compareVerdict={compareMap?.["third-0"] ?? null}
          comparePickId={compareFriend?.winners?.["third-0"] ?? null}
          compareName={compareFriend?.name ?? null}
          compact={compact}
        />
      </div>
    </div>
  );
}
