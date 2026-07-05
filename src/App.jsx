import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { usePredictions } from "./hooks/usePredictions";
import { useWorldCup } from "./hooks/useWorldCup";

import { isRef } from "./lib/teams";
import { ROUNDS, key, GUIDE_MAX_INTERACTIONS, REQUIRED_PICK_KEYS } from "./lib/rounds";
import {
  getPickProgress,
  hasBracketPicks,
  buildStarterWinners,
  findGuidancePickKey,
  findEarliestMissingPickKey,
  describeMissingPick,
  isMatchScorable,
  buildScorableActual,
  normalize,
  buildSlotMatches,
  buildActual,
} from "./lib/bracket";
import {
  SCORE_SUFFIX,
  setScorePrediction,
  normalizeScores,
  gradeScorePrediction,
  gradeWinners,
  SCORE_ONE_SIDE_POINTS,
  SCORE_EXACT_POINTS,
} from "./lib/scoring";
import { fmtCountdown, fmtTimeOnly } from "./lib/format";

import { BrandBadge } from "./components/common/icons";
import { BootLoadingOverlay, useBootCycleHold } from "./components/common/BootLoadingOverlay";
import { ScrollBracket } from "./components/bracket/ScrollBracket";
import { TeamModal } from "./components/team/TeamModal";
import { MatchModal } from "./components/match/MatchModal";
import { ViewingAsPicker, HeaderToolbar, AccountMenu, TabNav, ComparePill } from "./components/header/HeaderToolbar";
import { MatchdayPage } from "./components/matchday/MatchdayPage";
import { StandingsPage } from "./components/standings/StandingsPage";
import { LoginPage } from "./components/modals/LoginPage";
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
  const [tab, setTab] = useState("bracket");
  const [winners, setWinners] = useState(() => ({}));
  const [showFriends, setShowFriends] = useState(false);
  const [friendsPickerMode, setFriendsPickerMode] = useState("view");
  const [compareUid, setCompareUid] = useState(null);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [focusPickKey, setFocusPickKey] = useState(null);
  const [lockToast, setLockToast] = useState(null);
  const [teamModal, setTeamModal] = useState(null);
  const [matchModal, setMatchModal] = useState(null);
  const [bracketGuideCount, setBracketGuideCount] = useState(0);
  const skipStarterSeedRef = useRef(false);

  // Purge legacy localStorage keys from pre-Firebase versions of the app so
  // stale offline picks can never be read or resurface — Firestore is the
  // single source of truth.
  useEffect(() => {
    try {
      localStorage.removeItem("wc26-bracket-winners-v4");
      localStorage.removeItem("wc26-bracket-winners-v3");
      localStorage.removeItem("wc26-user-name");
    } catch {
      // localStorage unavailable (e.g. private browsing) — nothing to clean up.
    }
  }, []);

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
    email,
    authProvider,
    needsName,
    profileLoaded,
    authReady,
    authError,
    syncError,
    syncing,
    clearSyncError,
    submitName,
    connectGoogle,
    signUpWithEmail,
    signInWithEmail,
    resetPassword,
    signOutUser,
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

  // Default to Bracket while editing; jump to Matchday once you lock your own bracket.
  useEffect(() => {
    if (isViewingSelf && locked) setTab("matchday");
  }, [isViewingSelf, locked]);

  const handleTabChange = useCallback(
    (next) => {
      if (next !== "bracket") {
        exitFriendView();
        setShowFriends(false);
      }
      setTab(next);
    },
    [exitFriendView]
  );

  const showBracketGuide = isViewingSelf && !locked && bracketGuideCount < GUIDE_MAX_INTERACTIONS;

  const pickProgress = useMemo(() => getPickProgress(winners), [winners]);
  const guidanceKey = useMemo(() => {
    if (!showBracketGuide || teams.length !== 32) return null;
    return findGuidancePickKey(displayWinners, teams, actual, slotMatches, nextMatch, numToSlot);
  }, [showBracketGuide, teams.length, displayWinners, actual, slotMatches, nextMatch, numToSlot]);
  const lockTooltip = pickProgress.complete
    ? "Lock your picks permanently"
    : `Complete all ${pickProgress.total} matchups before locking (${pickProgress.filled}/${pickProgress.total} picked) — tap to see what's missing`;

  useEffect(() => {
    if (!lockToast) return;
    const timer = window.setTimeout(() => setLockToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [lockToast]);

  const champion = teams.find((t) => t.id === displayWinners[key("final", 0)]) || null;
  const actualChampion = slotMatches[key("final", 0)]?.winner || null;


  const onPick = useCallback(
    (roundIdx, matchIdx, team) => {
      if (!canEdit || locked) return;
      const rk = roundIdx === "third" ? "third-0" : key(ROUNDS[roundIdx].key, matchIdx);
      const match = slotMatches[rk];
      if (match?.kickoff && Date.now() >= match.kickoff.getTime()) return;
      let isNewPick = false;
      let pickedSlot = null;
      setWinners((prev) => {
        isNewPick = !prev[rk];
        const next = { ...prev };
        if (next[rk] === team.id) {
          delete next[rk];
          delete next[rk + SCORE_SUFFIX];
          isNewPick = false;
        } else {
          next[rk] = team.id;
          pickedSlot = rk;
        }
        const normalized = normalize(next, teams);
        return normalizeScores(normalized, teams);
      });
      if (isNewPick) {
        setBracketGuideCount((c) => Math.min(c + 1, GUIDE_MAX_INTERACTIONS));
      }
      if (pickedSlot) {
        setFocusPickKey((prev) => (prev === pickedSlot ? null : prev));
      }
    },
    [teams, canEdit, locked, slotMatches]
  );

  const handleSelectFriend = useCallback(
    (friend) => {
      if (friendsPickerMode === "compare") {
        setCompareUid((prev) => (prev === friend.uid ? null : friend.uid));
        setShowFriends(false);
        return;
      }
      if (friend.uid === uid) {
        exitFriendView();
      } else {
        viewFriend(friend);
      }
      setShowFriends(false);
    },
    [viewFriend, exitFriendView, uid, friendsPickerMode]
  );

  const openViewerPicker = useCallback(() => {
    if (tab !== "bracket") return;
    setFriendsPickerMode("view");
    setShowFriends(true);
  }, [tab]);

  const openComparePicker = useCallback(() => {
    setFriendsPickerMode("compare");
    setShowFriends(true);
  }, []);

  const resetBracket = useCallback(() => {
    if (locked) return;
    skipStarterSeedRef.current = true;
    setBracketGuideCount(0);
    setWinners({});
    // Predictions are saved to Firebase only - no localStorage to clear
  }, [locked]);

  const handleOpenLock = useCallback(() => {
    if (locked) return;
    if (!pickProgress.complete) {
      const slotKey = findEarliestMissingPickKey(winners, teams, actual, slotMatches);
      if (slotKey) {
        const info = describeMissingPick(slotKey, winners, teams, slotMatches);
        const remaining = pickProgress.total - pickProgress.filled;
        setFocusPickKey(slotKey);
        setTab("bracket");
        setLockToast({
          message: `Pick ${info.teamsLabel} (${info.roundLabel}${info.timeLabel ? ` · ${info.timeLabel}` : ""}) — ${remaining} left`,
        });
      } else {
        setLockToast({
          message: `Complete all ${pickProgress.total} matchups before locking (${pickProgress.filled}/${pickProgress.total} picked)`,
        });
      }
      return;
    }
    setShowLockConfirm(true);
  }, [locked, pickProgress, winners, teams, actual, slotMatches]);

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

  const saveScorePrediction = useCallback((slotKey, score, match) => {
    if (match?.kickoff && Date.now() >= match.kickoff.getTime()) {
      return false;
    }
    setWinners((prev) => normalizeScores(setScorePrediction(prev, slotKey, score), teams));
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

  const myRank = useMemo(() => {
    const idx = rankedFriends.filter((f) => f.locked).findIndex((f) => f.uid === uid);
    return idx >= 0 ? idx + 1 : null;
  }, [rankedFriends, uid]);

  const compareFriend = useMemo(
    () => rankedFriends.find((f) => f.uid === compareUid && f.locked) ?? null,
    [rankedFriends, compareUid]
  );

  const compareMap = useMemo(() => {
    if (!compareFriend) return {};
    const map = {};
    for (const k of REQUIRED_PICK_KEYS) {
      const mine = displayWinners[k];
      const theirs = compareFriend.winners[k];
      map[k] = !mine || !theirs ? null : mine === theirs ? "agree" : "differ";
    }
    return map;
  }, [compareFriend, displayWinners]);

  const compareAgreement = useMemo(() => {
    const decided = Object.values(compareMap).filter(Boolean);
    const agree = decided.filter((v) => v === "agree").length;
    return { agree, total: decided.length };
  }, [compareMap]);

  // Selected rival stops existing (unlocked/left) — clear the stale selection.
  useEffect(() => {
    if (compareUid && !compareFriend) setCompareUid(null);
  }, [compareUid, compareFriend]);

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
    compareFriend: isViewingSelf ? compareFriend : null,
    compareMap: isViewingSelf ? compareMap : null,
  };
  const showBracket = teams.length === 32;
  const requiresLogin = !uid || needsName;
  const profileGate = !!uid && !profileLoaded;
  const authGate = !authReady || !friendsReady || profileGate;
  // Login only needs Firebase auth — don't block on Firestore friends or tournament data.
  const showLogin = authReady && requiresLogin;
  const shellLoading = showLogin ? false : authGate || loading;
  const showBoot = useBootCycleHold(shellLoading);
  const bootLabel = !authReady
    ? "Signing in"
    : !friendsReady || profileGate
      ? "Loading predictions"
      : "Loading tournament";

  // Use combined stats for display (includes both bracket and rail predictions)
  const displayStats = combinedStats;

  return (
    <div className="app-shell text-[var(--text-primary)]">
      <AnimatePresence>
        {showBoot && <BootLoadingOverlay key="boot" label={bootLabel} />}
      </AnimatePresence>
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
      {lockToast && (
        <div className="app-toast app-toast--warn" role="alert" aria-live="assertive">
          {lockToast.message}
        </div>
      )}
      {showLogin && (
        <LoginPage
          onSubmit={submitName}
          onConnectGoogle={connectGoogle}
          onSignInEmail={signInWithEmail}
          onSignUpEmail={signUpWithEmail}
          onResetPassword={resetPassword}
          linkingGoogle={linkingGoogle}
        />
      )}
      <FriendsModal
        open={showFriends}
        onClose={() => setShowFriends(false)}
        friends={rankedFriends}
        currentUid={uid}
        activeUid={friendsPickerMode === "compare" ? compareUid : activeUid}
        onSelect={handleSelectFriend}
        mode={friendsPickerMode}
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
        friends={rankedFriends}
        numToSlot={numToSlot}
        selfUid={uid}
      />
      <MatchModal
        match={matchModal}
        matches={railMatches}
        onSelectMatch={setMatchModal}
        winners={displayWinners}
        scoreWinners={winners}
        numToSlot={numToSlot}
        onClose={() => setMatchModal(null)}
        onFlagClick={(t) => { setMatchModal(null); setTeamModal(t); }}
        onSaveScorePrediction={(slotKey, score, m) => saveScorePrediction(slotKey, score, byNum.get(m.num) ?? m)}
        friends={friends}
        selfUid={uid}
      />

      {!showLogin && !shellLoading && (
        <>
      {/* HEADER */}
      <header className="broadcast-bar shrink-0 z-40">
        <div className="broadcast-bar__inner relative mx-auto flex max-w-[1900px] items-center gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="broadcast-bar__desktop-only hidden sm:block">
              <BrandBadge className="h-8 w-8 text-[13px]" />
            </div>
            <h1 className="font-display truncate text-lg font-extrabold tracking-tight">
              2XBET
              <span className="broadcast-bar__brand-sub ml-2 hidden text-[var(--text-muted)] lg:inline font-semibold">by Aawaz</span>
            </h1>
          </div>

          <TabNav active={tab} onChange={handleTabChange} className="broadcast-bar__desktop-only" />

          <div className="flex flex-1 items-center justify-end gap-2">
            {tab === "bracket" && (
              <ViewingAsPicker
                name={activeViewerName}
                isSelf={isViewingSelf}
                onClick={openViewerPicker}
                disabled={!profileLoaded || requiresLogin || !authReady}
              />
            )}
            <div className="broadcast-bar__desktop-only flex items-center gap-2">
              {isViewingSelf && locked && (
                <div className="header-points-chip" title="Your points and rank">
                  <span className="header-points-chip__value">{displayStats.totalPoints ?? displayStats.points}</span>
                  <span className="header-points-chip__label">PTS</span>
                  {myRank && (
                    <>
                      <span className="header-points-chip__divider" />
                      <span className="header-points-chip__rank">#{myRank}</span>
                    </>
                  )}
                </div>
              )}
              {tab === "bracket" && isViewingSelf && (
                <ComparePill
                  compareFriend={compareFriend}
                  agreement={compareAgreement}
                  onOpen={openComparePicker}
                  onClear={() => setCompareUid(null)}
                />
              )}
            </div>
            <HeaderToolbar
              isViewingSelf={isViewingSelf}
              locked={activeViewerLocked}
              canLock={pickProgress.complete}
              lockTooltip={lockTooltip}
              onOpenLock={handleOpenLock}
              onReset={resetBracket}
            />
            {isViewingSelf && (
              <AccountMenu email={email} authProvider={authProvider} onSignOut={signOutUser} />
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto max-w-7xl shrink-0 px-4 pt-2 text-center text-[11px] font-semibold text-amber-400/80">
          Could not refresh live scores — showing last known data.
        </div>
      )}

      {tab === "matchday" && (
        <MatchdayPage
          railMatches={railMatches}
          winners={displayWinners}
          scoreWinners={winners}
          numToSlot={numToSlot}
          rankedFriends={rankedFriends}
          uid={uid}
          onSaveScorePrediction={(slotKey, score, m) => saveScorePrediction(slotKey, score, byNum.get(m.num) ?? m)}
          onOpenMatch={setMatchModal}
          onFlagClick={setTeamModal}
          locked={locked}
          pickProgress={pickProgress}
          isViewingSelf={isViewingSelf}
          onGoToBracket={() => setTab("bracket")}
          onOpenLock={handleOpenLock}
        />
      )}

      {tab === "standings" && (
        <StandingsPage
          friends={rankedFriends}
          currentUid={uid}
          activeUid={activeUid}
          actual={actual}
          slotMatches={slotMatches}
          byNum={byNum}
        />
      )}

      {/* BRACKET */}
      {tab === "bracket" && (
        <main className="app-main">
          {!showBracket && !loading && (
            <div className="flex flex-1 items-center justify-center px-4 py-12 text-center text-sm text-[var(--text-muted)]">
              Bracket seeds not available yet — the Round of 32 line-up appears once the group stage is complete.
            </div>
          )}

          {showBracket && (
            <ScrollBracket
              {...bracketProps}
              champion={champion}
              actualChampion={actualChampion}
              stats={displayStats}
              showPoints={activeViewerLocked}
              guidanceKey={guidanceKey}
              focusPickKey={focusPickKey}
              showGuideBanner={showBracketGuide}
              pickProgress={pickProgress}
            />
          )}
        </main>
      )}

      {/* MOBILE BOTTOM NAVIGATION */}
      <TabNav variant="bottom" active={tab} onChange={handleTabChange} />
        </>
      )}
    </div>
  );
}
