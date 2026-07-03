import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { usePredictions } from "./hooks/usePredictions";
import { useWorldCup } from "./hooks/useWorldCup";

import { isRef } from "./lib/teams";
import { ROUNDS, key, GUIDE_MAX_INTERACTIONS } from "./lib/rounds";
import {
  getPickProgress,
  hasBracketPicks,
  buildStarterWinners,
  findRailScoreGuideMatch,
  findGuidancePickKey,
  isMatchScorable,
  buildScorableActual,
  normalize,
  buildSlotMatches,
  buildActual,
} from "./lib/bracket";
import {
  SCORE_SUFFIX,
  getScorePrediction,
  setScorePrediction,
  normalizeScores,
  gradeScorePrediction,
  gradeWinners,
  SCORE_ONE_SIDE_POINTS,
  SCORE_EXACT_POINTS,
} from "./lib/scoring";
import { fmtCountdown, fmtTimeOnly } from "./lib/format";

import { WCLogo } from "./components/common/icons";
import { Confetti } from "./components/common/Confetti";
import { BootLoadingOverlay } from "./components/common/BootLoadingOverlay";
import { ScrollBracket } from "./components/bracket/ScrollBracket";
import { PredictionsRail, RailGuideLabel } from "./components/rail/PredictionsRail";
import { TeamModal } from "./components/team/TeamModal";
import { MatchModal } from "./components/match/MatchModal";
import { ViewingAsPicker, HeaderToolbar } from "./components/header/HeaderToolbar";
import { NameModal } from "./components/modals/NameModal";
import { FriendsModal } from "./components/modals/FriendsModal";
import { LockConfirmModal } from "./components/modals/LockConfirmModal";

/* ============================================================================
 *  FIFA WORLD CUP 2026 — KNOCKOUT BRACKET PREDICTOR
 *  Data: openfootball/worldcup.json. Every bracket slot maps to a JSON match
 *  number (73–104), so live scores, goal scorers, venues, extra time and
 *  penalty shootouts all attach exactly where they belong.
 *
 *  Layout: bracket + compact predictions ticker at the bottom.
 *
 *  See src/ARCHITECTURE.md for the full file-by-file component map.
 * ==========================================================================*/

// ----------------------------------------------------------------------------
// MAIN APP
// ----------------------------------------------------------------------------
export default function App() {
  const [winners, setWinners] = useState(() => ({}));
  const [showFriends, setShowFriends] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [teamModal, setTeamModal] = useState(null);
  const [matchModal, setMatchModal] = useState(null);
  const [bracketGuideCount, setBracketGuideCount] = useState(0);
  const [railScoreGuideCount, setRailScoreGuideCount] = useState(0);
  const prevChampRef = useRef(null);
  const skipStarterSeedRef = useRef(false);
  const onRemoteWinners = useCallback((remote, { force } = {}) => {
    setWinners((local) => {
      if (force) return remote;
      if (Object.keys(local).length > 0) return local;
      return remote;
    });
  }, []);

  const {
    uid,
    name,
    needsName,
    profileLoaded,
    authReady,
    authError,
    syncError,
    syncing,
    clearSyncError,
    submitName,
    connectGoogle,
    isAnonymous,
    linkingGoogle,
    locked,
    lockedAt,
    locking,
    lockPredictions,
    friends,
    friendsReady,
    viewingFriend,
    viewFriend,
    exitFriendView,
    readOnly,
  } = usePredictions(winners, { onRemoteWinners });

  const { matches, byNum, r32Teams, journeys, loading, lastUpdated, error } = useWorldCup(authReady);

  const teams = r32Teams ?? [];
  const selfPrediction = useMemo(() => friends.find((f) => f.uid === uid) ?? null, [friends, uid]);
  const canEdit = !locked && !viewingFriend;

  const displayWinners = useMemo(() => {
    let w = winners;
    if (viewingFriend) w = viewingFriend.winners;
    else if (locked && selfPrediction) w = selfPrediction.winners;
    return teams.length === 32 ? normalize(w, teams) : w;
  }, [viewingFriend, winners, teams, locked, selfPrediction]);
  const slotMatches = useMemo(() => buildSlotMatches(byNum), [byNum]);
  const actual = useMemo(() => buildActual(slotMatches), [slotMatches]);

  // Knockout matches for bracket
  const knockouts = useMemo(
    () =>
      matches
        .filter((m) => m.isKnockout)
        .sort((x, y) => (x.kickoff?.getTime() ?? 0) - (y.kickoff?.getTime() ?? 0)),
    [matches]
  );

  // Non-knockout matches (group stage) with confirmed opponents for rail predictions
  // These are "base" games where teams are confirmed, not derived from bracket progression
  const predictableMatches = useMemo(
    () =>
      matches
        .filter((m) => !m.isKnockout && m.team1 && m.team2 && !isRef(m.ref1) && !isRef(m.ref2))
        .sort((x, y) => (x.kickoff?.getTime() ?? 0) - (y.kickoff?.getTime() ?? 0)),
    [matches]
  );

  // Combine knockouts and predictable matches for the rail
  // Knockout games (R32 onwards) show bracket predictions - rail is view-only
  // Non-knockout games allow direct rail predictions
  // Filter out matches without a num to avoid duplicate key warnings
  const railMatches = useMemo(
    () =>
      [...knockouts, ...predictableMatches]
        .filter((m) => m.num != null)
        .sort(
          (x, y) => (x.kickoff?.getTime() ?? 0) - (y.kickoff?.getTime() ?? 0)
        ),
    [knockouts, predictableMatches]
  );

  const liveNums = useMemo(() => railMatches.filter((m) => m.status === "live").map((m) => m.num), [railMatches]);
  const nextMatch = useMemo(() => {
    const now = Date.now();
    return railMatches.find((m) => m.status === "upcoming" && m.kickoff && m.kickoff.getTime() > now) || null;
  }, [railMatches]);

  const numToSlot = useMemo(() => {
    const map = new Map();
    for (const [k, m] of Object.entries(slotMatches)) map.set(m.num, k);
    return map;
  }, [slotMatches]);
  const liveKey = liveNums.length ? numToSlot.get(liveNums[0]) : null;
  const nextKey = nextMatch ? numToSlot.get(nextMatch.num) : null;

  // Re-validate picks once bracket seeds load — skip state update if nothing changed.
  useEffect(() => {
    if (teams.length === 32 && !locked) {
      setWinners((w) => {
        const next = normalizeScores(normalize(w, teams), teams);
        return JSON.stringify(next) === JSON.stringify(w) ? w : next;
      });
    }
  }, [teams.length, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seed a starter bracket for new users with no saved picks.
  useEffect(() => {
    if (skipStarterSeedRef.current || locked || viewingFriend || needsName || !profileLoaded) return;
    if (teams.length !== 32) return;
    if (selfPrediction && hasBracketPicks(selfPrediction.winners)) return;

    setWinners((prev) => {
      if (hasBracketPicks(prev)) return prev;
      return buildStarterWinners(teams, slotMatches);
    });
  }, [teams, slotMatches, profileLoaded, needsName, locked, viewingFriend, selfPrediction]);

  // Predictions are saved to Firebase only - localStorage disabled

  const isViewingSelf = !viewingFriend;
  const activeViewerName = viewingFriend?.name ?? name ?? "You";
  const activeViewerLocked = viewingFriend ? viewingFriend.locked : locked;
  const activeUid = viewingFriend?.uid ?? uid;

  const railScoreGuideMatch = useMemo(() => {
    if (!locked || viewingFriend) return null;
    return findRailScoreGuideMatch(railMatches, displayWinners, numToSlot);
  }, [locked, viewingFriend, railMatches, displayWinners, numToSlot]);
  const showRailScoreGuide = isViewingSelf && !!railScoreGuideMatch && railScoreGuideCount < GUIDE_MAX_INTERACTIONS;
  const showBracketGuide = isViewingSelf && !locked && bracketGuideCount < GUIDE_MAX_INTERACTIONS;

  const pickProgress = useMemo(() => getPickProgress(winners), [winners]);
  const guidanceKey = useMemo(() => {
    if (!showBracketGuide || teams.length !== 32) return null;
    return findGuidancePickKey(displayWinners, teams, actual, slotMatches, nextMatch, numToSlot);
  }, [showBracketGuide, teams.length, displayWinners, actual, slotMatches, nextMatch, numToSlot]);
  const lockTooltip = pickProgress.complete
    ? "Lock your picks permanently"
    : `Complete all ${pickProgress.total} matchups before locking (${pickProgress.filled}/${pickProgress.total} picked)`;

  const champion = teams.find((t) => t.id === displayWinners[key("final", 0)]) || null;
  const actualChampion = slotMatches[key("final", 0)]?.winner || null;

  useEffect(() => {
    const id = champion?.id || null;
    if (readOnly) {
      prevChampRef.current = id;
      return;
    }
    if (id && id !== prevChampRef.current) {
      setConfetti(true);
      const t = setTimeout(() => setConfetti(false), 4200);
      prevChampRef.current = id;
      return () => clearTimeout(t);
    }
    if (!id) prevChampRef.current = null;
  }, [champion, readOnly]);

  const onPick = useCallback(
    (roundIdx, matchIdx, team) => {
      if (!canEdit || locked) return;
      const rk = roundIdx === "third" ? "third-0" : key(ROUNDS[roundIdx].key, matchIdx);
      let isNewPick = false;
      setWinners((prev) => {
        isNewPick = !prev[rk];
        const next = { ...prev };
        if (next[rk] === team.id) {
          delete next[rk];
          delete next[rk + SCORE_SUFFIX];
          isNewPick = false;
        } else {
          next[rk] = team.id;
        }
        const normalized = normalize(next, teams);
        return normalizeScores(normalized, teams);
      });
      if (isNewPick) {
        setBracketGuideCount((c) => Math.min(c + 1, GUIDE_MAX_INTERACTIONS));
      }
    },
    [teams, canEdit, locked]
  );

  const handleSelectFriend = useCallback(
    (friend) => {
      if (friend.uid === uid) {
        exitFriendView();
      } else {
        viewFriend(friend);
      }
      setShowFriends(false);
    },
    [viewFriend, exitFriendView, uid]
  );

  const resetBracket = useCallback(() => {
    if (locked) return;
    skipStarterSeedRef.current = true;
    setBracketGuideCount(0);
    setWinners({});
    prevChampRef.current = null;
    // Predictions are saved to Firebase only - no localStorage to clear
  }, [locked]);

  const handleLock = useCallback(async () => {
    return lockPredictions();
  }, [lockPredictions]);

  useEffect(() => {
    if (locked) setShowLockConfirm(false);
  }, [locked]);

  const onFlagClick = useCallback((team) => setTeamModal(team), []);
  const openMatchBySlot = useCallback(
    (slotKey) => {
      const m = slotMatches[slotKey];
      if (m) setMatchModal(m);
    },
    [slotMatches]
  );
  const openMatchFromTeam = useCallback((m) => {
    setTeamModal(null);
    setMatchModal(m);
  }, []);

  const saveScorePrediction = useCallback((slotKey, score) => {
    let isNewScore = false;
    setWinners((prev) => {
      isNewScore = !getScorePrediction(prev, slotKey);
      return normalizeScores(setScorePrediction(prev, slotKey, score), teams);
    });
    if (isNewScore) {
      setRailScoreGuideCount((c) => Math.min(c + 1, GUIDE_MAX_INTERACTIONS));
    }
    return true;
  }, [teams]);

  const activeLockTimeMs = viewingFriend ? viewingFriend.lockedAt : lockedAt;
  const scorableActual = useMemo(
    () => buildScorableActual(actual, slotMatches, activeLockTimeMs),
    [actual, slotMatches, activeLockTimeMs]
  );

  // Grade picks against real results as they land. Include slotMatches for score prediction grading.
  const stats = useMemo(
    () => gradeWinners(displayWinners, actual, slotMatches, activeLockTimeMs),
    [displayWinners, actual, slotMatches, activeLockTimeMs]
  );

  // Grade rail game predictions (non-knockout games with rail- prefix)
  const railStats = useMemo(() => {
    const railKeys = Object.keys(displayWinners).filter(k => k.startsWith("rail-"));
    let correct = 0, total = 0, scoreOneSide = 0, scoreExact = 0, scorePoints = 0;

    for (const key of railKeys) {
      const matchNum = parseInt(key.replace("rail-", ""), 10);
      const match = byNum.get(matchNum);
      if (!match || match.status !== "played" || !match.winner) continue;
      if (!isMatchScorable(match, activeLockTimeMs)) continue;

      total++;
      const predictedWinner = displayWinners[key];
      if (predictedWinner === match.winner.id) correct++;

      const predictedScore = displayWinners[key + SCORE_SUFFIX];
      if (predictedScore && match.ftScore) {
        const { scorePoints: sp } = gradeScorePrediction(predictedScore, match.ftScore);
        if (sp === SCORE_EXACT_POINTS) {
          scoreExact++;
          scorePoints += sp;
        } else if (sp === SCORE_ONE_SIDE_POINTS) {
          scoreOneSide++;
          scorePoints += sp;
        }
      }
    }

    return { correct, total, scoreOneSide, scoreExact, scorePoints, points: correct * 1 + scorePoints };
  }, [displayWinners, byNum, activeLockTimeMs]);

  // Combined stats including both bracket and rail predictions
  const combinedStats = useMemo(() => ({
    ...stats,
    railCorrect: railStats.correct,
    railTotal: railStats.total,
    railScoreOneSide: railStats.scoreOneSide,
    railScoreExact: railStats.scoreExact,
    railScorePoints: railStats.scorePoints,
    totalPoints: (stats.totalPoints ?? stats.points) + railStats.points,
  }), [stats, railStats]);

  const rankedFriends = useMemo(
    () =>
      friends
        .map((friend) => {
          const graded = gradeWinners(friend.winners, actual, slotMatches, friend.lockedAt);
          // Calculate friend's rail stats with tiered scoring
          const friendRailKeys = Object.keys(friend.winners).filter(k => k.startsWith("rail-"));
          let railCorrect = 0, railTotal = 0, railScoreOneSide = 0, railScoreExact = 0, railScorePoints = 0;
          for (const key of friendRailKeys) {
            const matchNum = parseInt(key.replace("rail-", ""), 10);
            const match = byNum.get(matchNum);
            if (!match || match.status !== "played" || !match.winner) continue;
            if (!isMatchScorable(match, friend.lockedAt)) continue;
            railTotal++;
            if (friend.winners[key] === match.winner.id) railCorrect++;

            const predictedScore = friend.winners[key + SCORE_SUFFIX];
            if (predictedScore && match.ftScore) {
              const { scorePoints: sp } = gradeScorePrediction(predictedScore, match.ftScore);
              if (sp === SCORE_EXACT_POINTS) {
                railScoreExact++;
                railScorePoints += sp;
              } else if (sp === SCORE_ONE_SIDE_POINTS) {
                railScoreOneSide++;
                railScorePoints += sp;
              }
            }
          }
          const railPoints = railCorrect * 1 + railScorePoints;

          return {
            ...friend,
            ...graded,
            railCorrect,
            railTotal,
            railScoreOneSide,
            railScoreExact,
            // Use totalPoints which includes both bracket and rail score prediction points
            points: (graded.totalPoints ?? graded.points) + railPoints,
          };
        })
        .sort((a, b) => {
          if (a.locked !== b.locked) return a.locked ? -1 : 1;
          if (!a.locked && !b.locked) return a.name.localeCompare(b.name);
          return (
            b.points - a.points ||
            b.correct - a.correct ||
            b.total - a.total ||
            a.name.localeCompare(b.name)
          );
        }),
    [friends, actual, slotMatches, byNum]
  );

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const bracketProps = {
    winners: displayWinners,
    teams,
    onPick,
    actual: scorableActual,
    slotMatches,
    liveKey,
    nextKey,
    onFlagClick,
    onOpenMatch: openMatchBySlot,
    readOnly: !canEdit,
    revealGrades: true, // Always show grading for played matches
    isViewingOther: !!viewingFriend,
    viewerName: viewingFriend?.name,
    teamById,
    byNum,
    lockTimeMs: activeLockTimeMs,
    railGuideLabel: isViewingSelf && locked ? <RailGuideLabel /> : null,
  };
  const showBracket = teams.length === 32;
  const docsLoading = !!uid && !profileLoaded;
  const appLoading = !authReady || !friendsReady || docsLoading || loading;
  const bootLabel = !authReady
    ? "Signing in"
    : !friendsReady || docsLoading
      ? "Loading predictions"
      : "Loading tournament";

  // Use combined stats for display (includes both bracket and rail predictions)
  const displayStats = combinedStats;

  return (
    <div className="app-shell text-[var(--text-primary)]">
      <AnimatePresence>
        {appLoading && <BootLoadingOverlay key="boot" label={bootLabel} />}
      </AnimatePresence>
      <Confetti fire={confetti} />
      {syncing && !authError && !syncError && (
        <div className="sync-tooltip sync-tooltip--saving" role="status" aria-live="polite">
          Saving…
        </div>
      )}
      {(authError || syncError) && (
        <div className="sync-tooltip sync-tooltip--error" role="alert">
          <p>{authError || syncError}</p>
          <button type="button" className="sync-tooltip__dismiss" onClick={clearSyncError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {!appLoading && authReady && profileLoaded && needsName && (
        <NameModal onSubmit={submitName} onConnectGoogle={connectGoogle} linkingGoogle={linkingGoogle} />
      )}
      <FriendsModal
        open={showFriends}
        onClose={() => setShowFriends(false)}
        friends={rankedFriends}
        currentUid={uid}
        activeUid={activeUid}
        onSelect={handleSelectFriend}
      />
      <LockConfirmModal
        open={showLockConfirm}
        onClose={() => setShowLockConfirm(false)}
        onConfirm={handleLock}
        locking={locking}
      />
      <TeamModal
        team={teamModal}
        journey={teamModal ? journeys.get(teamModal.code) ?? [] : []}
        onClose={() => setTeamModal(null)}
        onOpenMatch={openMatchFromTeam}
      />
      <MatchModal
        match={matchModal}
        onClose={() => setMatchModal(null)}
        onFlagClick={(t) => { setMatchModal(null); setTeamModal(t); }}
        scorePrediction={matchModal ? (() => {
          const isKnockout = matchModal.isKnockout;
          const key = isKnockout
            ? numToSlot.get(matchModal.num)
            : `rail-${matchModal.num}`;
          return key ? getScorePrediction(winners, key) : null;
        })() : null}
        onSaveScorePrediction={async (score) => {
          if (!matchModal) return false;
          const isKnockout = matchModal.isKnockout;
          const key = isKnockout
            ? numToSlot.get(matchModal.num)
            : `rail-${matchModal.num}`;
          if (!key) return false;
          return saveScorePrediction(key, score);
        }}
        slotKey={matchModal ? (matchModal.isKnockout ? numToSlot.get(matchModal.num) : `rail-${matchModal.num}`) : null}
        friends={friends}
        selfUid={uid}
      />

      {!appLoading && (
        <>
      {/* HEADER */}
      <header className="broadcast-bar shrink-0 z-40">
        <div className="relative mx-auto max-w-[1900px] px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <WCLogo className="h-9 w-9 shrink-0 drop-shadow-lg" />
              <div className="min-w-0 leading-tight">
                <h1 className="font-display truncate text-xl tracking-wider sm:text-2xl">
                  World Cup <span className="text-[var(--pitch-glow)]">26</span>
                  <span className="ml-2 hidden text-[var(--text-muted)] sm:inline">· Bracket Challenge</span>
                </h1>
                <p className="truncate text-[10px] font-semibold text-[var(--text-muted)]">
                  {liveNums.length > 0 ? (
                    <span className="text-[var(--live)]">● {liveNums.length} match{liveNums.length > 1 ? "es" : ""} live</span>
                  ) : nextMatch?.kickoff ? (
                    <>
                      next: {nextMatch.team1?.code ?? "TBD"} v {nextMatch.team2?.code ?? "TBD"} in{" "}
                      <span className="tabular-nums text-[var(--next)]">{fmtCountdown(nextMatch.kickoff.getTime() - Date.now())}</span>
                    </>
                  ) : lastUpdated ? (
                    `updated ${fmtTimeOnly(lastUpdated)}`
                  ) : (
                    "connecting…"
                  )}
                </p>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-28 sm:px-40">
              <div className="pointer-events-auto">
                <ViewingAsPicker
                  name={activeViewerName}
                  onClick={() => setShowFriends(true)}
                  disabled={!profileLoaded || needsName || !authReady}
                />
              </div>
            </div>

            <div className="flex flex-1 items-center justify-end gap-2">
              <HeaderToolbar
                isViewingSelf={isViewingSelf}
                locked={activeViewerLocked}
                canLock={pickProgress.complete}
                lockTooltip={lockTooltip}
                onOpenLock={() => setShowLockConfirm(true)}
                onReset={resetBracket}
                isAnonymous={isAnonymous}
                linkingGoogle={linkingGoogle}
                onConnectGoogle={() => connectGoogle()}
              />
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-7xl shrink-0 px-4 pt-2 text-center text-[11px] font-semibold text-amber-400/80">
          Could not refresh live scores — showing last known data.
        </div>
      )}

      {/* BRACKET */}
      <main className="app-main">
        {!showBracket && !loading && (
            <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-[var(--text-muted)]">
              Bracket seeds not available yet — the Round of 32 line-up appears once the group stage is complete.
            </div>
          )}

        {showBracket && !appLoading && (
          <ScrollBracket
            {...bracketProps}
            champion={champion}
            actualChampion={actualChampion}
            stats={displayStats}
            showPoints={activeViewerLocked}
            guidanceKey={guidanceKey}
            showGuideBanner={showBracketGuide}
            pickProgress={pickProgress}
          />
        )}
      </main>

      {railMatches.length > 0 && !appLoading && (
        <PredictionsRail
          matches={railMatches}
          liveNums={liveNums}
          nextNum={nextMatch?.num ?? null}
          numToSlot={numToSlot}
          winners={displayWinners}
          actual={scorableActual}
          teams={teams}
          revealGrades={true} // Always show grading for played matches
          onOpenMatch={setMatchModal}
          // Rail predictions (non-knockout) can be edited even when bracket is locked
          canEdit={isViewingSelf}
          onPickRailWinner={isViewingSelf ? (matchNum, teamId, isKnockout) => {
            // Only allow rail predictions on non-knockout games (base games like group stage)
            // Knockout games (R32 onwards) predictions come from bracket only
            if (isKnockout) return;
            // Store rail predictions separately with rail- prefix
            const key = `rail-${matchNum}`;
            setWinners((prev) => ({
              ...prev,
              [key]: teamId === prev[key] ? undefined : teamId, // Toggle off if same
            }));
          } : undefined}
          byNum={byNum}
          isViewingOther={!!viewingFriend}
          viewerName={viewingFriend?.name}
          lockTimeMs={activeLockTimeMs}
          showScoreGuide={showRailScoreGuide}
          scoreGuideNum={railScoreGuideMatch?.num ?? null}
          scoreGuideMatch={railScoreGuideMatch}
          roundPoints={ROUNDS.reduce((acc, r) => {
            for (let m = 0; m < r.matches; m++) {
              acc[key(r.key, m)] = r.points;
            }
            return acc;
          }, {})}
        />
      )}

      {railMatches.length === 0 && (
        <footer className="shrink-0 px-4 pb-5 pt-1 text-center text-[10.5px] font-medium text-[var(--text-muted)]/70">
          {!isViewingSelf ? (
            <>Tap &ldquo;Viewing as&rdquo; above to switch brackets · flags and match details still work in read-only mode.</>
          ) : locked ? (
            <>Your bracket is locked — picks cannot be changed until an admin unlocks your entry in the database.</>
          ) : (
            <>
              Tap a team code to advance them · tap a flag for their tournament journey · tap the middle of a card for full match details.
              Picks auto-save to the cloud{name ? ` as ${name}` : ""} & auto-grade against live results (refreshes every minute).
            </>
          )}
        </footer>
      )}
        </>
      )}
    </div>
  );
}
