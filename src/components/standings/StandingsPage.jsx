import { useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "../common/ProviderIcon";
import { recentPickResults } from "../../lib/scoring";
import { getPickProgress } from "../../lib/bracket";
import { StandingsFriendDetail } from "./StandingsFriendDetail";

function useIsMobile(breakpoint = 767) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}

function friendPointBreakdown(friend) {
  const scorePts = (friend.scorePoints ?? 0) + (friend.railScorePoints ?? 0);
  const bracketPts = (friend.points ?? 0) - scorePts;
  const exact = (friend.scoreExact ?? 0) + (friend.railScoreExact ?? 0);
  const oneSide = (friend.scoreOneSide ?? 0) + (friend.railScoreOneSide ?? 0);
  return { scorePts, bracketPts, exact, oneSide };
}

function FormDots({ friend, actual, slotMatches }) {
  const recent = useMemo(
    () => recentPickResults(friend.winners, actual, slotMatches, friend.lockedAt, 5),
    [friend.winners, friend.lockedAt, actual, slotMatches]
  );
  const dots = Array.from({ length: 5 }, (_, i) => recent[recent.length - 5 + i] ?? null);
  return (
    <div className="standings-form">
      {dots.map((d, i) => (
        <span
          key={i}
          className="standings-form__dot"
          style={{ background: !d ? "rgba(255,255,255,.18)" : d.correct ? "var(--agree)" : "var(--wrong)" }}
        />
      ))}
    </div>
  );
}

function StandingsRow({
  friend,
  rank,
  isMe,
  isActive,
  expanded,
  actual,
  slotMatches,
  leaderPoints,
  onToggle,
  isMobile,
}) {
  const progress = getPickProgress(friend.winners);
  const gap = friend.points - leaderPoints;
  const { scorePts, bracketPts, exact, oneSide } = friendPointBreakdown(friend);
  return (
    <button
      type="button"
      onClick={() => onToggle(friend)}
      className={[
        "standings-row",
        isActive && "standings-row--active",
        expanded && "standings-row--expanded",
        isMobile && "standings-row--mobile",
      ].filter(Boolean).join(" ")}
      aria-expanded={expanded}
    >
      <span className="standings-row__rank">{rank}</span>
      <span className="standings-row__player">
        <span className="standings-row__avatar">{friend.name.slice(0, 2).toUpperCase()}</span>
        <span className="standings-row__body">
          <span className="standings-row__name-line">
            <span className="standings-row__name">{friend.name}</span>
            {isMe && <span className="standings-row__tag">YOU</span>}
            {friend.paid && (
              <span className="paid-badge" title="Paid into the pot">
                <span className="mdi mdi-cash" aria-hidden="true" />paid
              </span>
            )}
          </span>
          {isMobile ? (
            <span className="standings-row__mobile-stats">
              <span>{friend.correct}/{friend.total} brkt</span>
              <span className="standings-row__mobile-sep">·</span>
              <span>{bracketPts}+{scorePts} pts</span>
              {(exact > 0 || oneSide > 0) && (
                <>
                  <span className="standings-row__mobile-sep">·</span>
                  <span>{exact}e/{oneSide}s</span>
                </>
              )}
            </span>
          ) : (
            <span className="standings-row__sub">
              <ProviderIcon provider={friend.authProvider} className="standings-row__provider" />
              {friend.authProvider === "google" ? "Google" : friend.authProvider === "email" ? "Email" : "No linked login"}
            </span>
          )}
        </span>
      </span>
      <FormDots friend={friend} actual={actual} slotMatches={slotMatches} />
      <span className="standings-row__bracket">{friend.correct}/{friend.total}</span>
      <span className="standings-row__brkt-pts">{bracketPts}</span>
      <span className="standings-row__score-pts">
        {scorePts}
        {(exact > 0 || oneSide > 0) && (
          <span className="standings-row__score-sub">
            {exact > 0 && `${exact} exact`}
            {exact > 0 && oneSide > 0 && " · "}
            {oneSide > 0 && `${oneSide} side`}
          </span>
        )}
      </span>
      <span className="standings-row__picks">{progress.filled}/{progress.total}</span>
      <span className="standings-row__gap">{gap === 0 ? "—" : gap}</span>
      <span className="standings-row__pts">{friend.points}</span>
      <span className="standings-row__chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
    </button>
  );
}

function OpenListRow({ friend, isMe, expanded, onToggle }) {
  const progress = getPickProgress(friend.winners);
  const left = progress.total - progress.filled;
  return (
    <button
      type="button"
      onClick={() => onToggle(friend)}
      className={["standings-row", "standings-row--open", expanded && "standings-row--expanded"].filter(Boolean).join(" ")}
      aria-expanded={expanded}
    >
      <span className="standings-row__player">
        <span className="standings-row__avatar">{friend.name.slice(0, 2).toUpperCase()}</span>
        <span className="standings-row__body">
          <span className="standings-row__name-line">
            <span className="standings-row__name">{friend.name}</span>
            {isMe && <span className="standings-row__tag">YOU</span>}
            {friend.paid && (
              <span className="paid-badge" title="Paid into the pot">
                <span className="mdi mdi-cash" aria-hidden="true" />paid
              </span>
            )}
          </span>
          <span className="standings-row__sub">
            <ProviderIcon provider={friend.authProvider} className="standings-row__provider" />
            {friend.authProvider === "google" ? "Google" : friend.authProvider === "email" ? "Email" : "No linked login"}
          </span>
        </span>
      </span>
      <span className="standings-row__picks">{progress.filled}/{progress.total} picks</span>
      <span className="standings-row__left">{left} picks left</span>
      <span className="standings-row__chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
    </button>
  );
}

export function StandingsPage({
  friends,
  currentUid,
  activeUid,
  expandedUid = null,
  onToggle,
  actual,
  slotMatches,
  byNum,
}) {
  const isMobile = useIsMobile();

  const locked = friends.filter((f) => f.locked);
  const open = friends.filter((f) => !f.locked);
  const leaderPoints = locked[0]?.points ?? 0;

  const handleToggle = (friend) => {
    onToggle?.(friend);
  };

  return (
    <main className="app-main standings-page nice-scroll">
      <div className="standings-shell">
        <div className="standings-head">
          <h2 className="standings-head__title">Standings</h2>
          <p className="standings-head__meta">
            {locked.length} locked · {open.length} still editing
          </p>
        </div>
        <p className="standings-head__hint">Tap a row to see bracket picks, score calls, and how they earned points.</p>

        {locked.length > 0 ? (
          <div className="standings-table">
            <p className="standings-mobile-label">Ranked</p>
            <div className="standings-columns" aria-hidden="true">
              <span>#</span>
              <span>Player</span>
              <span>Form</span>
              <span className="standings-columns__right">Bracket</span>
              <span className="standings-columns__right">Brkt pts</span>
              <span className="standings-columns__right">Score pts</span>
              <span className="standings-columns__right">Picks</span>
              <span className="standings-columns__right">Gap</span>
              <span className="standings-columns__right">Total</span>
              <span className="standings-columns__chevron" />
            </div>
            {locked.map((friend, idx) => {
              const expanded = expandedUid === friend.uid;
              return (
                <div key={friend.uid} className="standings-entry">
                  <StandingsRow
                    friend={friend}
                    rank={idx + 1}
                    isMe={friend.uid === currentUid}
                    isActive={friend.uid === activeUid}
                    expanded={expanded}
                    actual={actual}
                    slotMatches={slotMatches}
                    leaderPoints={leaderPoints}
                    onToggle={handleToggle}
                    isMobile={isMobile}
                  />
                  {expanded && isMobile && (
                    <StandingsFriendDetail
                      friend={friend}
                      actual={actual}
                      slotMatches={slotMatches}
                      byNum={byNum}
                      compactMobile
                      inline
                    />
                  )}
                  {expanded && !isMobile && (
                    <StandingsFriendDetail
                      friend={friend}
                      actual={actual}
                      slotMatches={slotMatches}
                      byNum={byNum}
                      inline
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="standings-empty">No one has locked their bracket yet.</p>
        )}

        {open.length > 0 && (
          <div className="standings-open-section">
            <div className="standings-mobile-label">Still editing</div>
            <div className="matchday-section__head">Still editing · not ranked yet</div>
            <div className="standings-table standings-table--open">
              <div className="standings-columns" aria-hidden="true">
                <span>Player</span>
                <span className="standings-columns__right">Progress</span>
                <span className="standings-columns__right">Picks left</span>
                <span className="standings-columns__chevron" />
              </div>
              {open.map((friend) => {
                const expanded = expandedUid === friend.uid;
                return (
                  <div key={friend.uid} className="standings-entry">
                    <OpenListRow
                      friend={friend}
                      isMe={friend.uid === currentUid}
                      expanded={expanded}
                      onToggle={handleToggle}
                    />
                    {expanded && isMobile && (
                      <StandingsFriendDetail
                        friend={friend}
                        actual={actual}
                        slotMatches={slotMatches}
                        byNum={byNum}
                        compactMobile
                        inline
                      />
                    )}
                    {expanded && !isMobile && (
                      <StandingsFriendDetail
                        friend={friend}
                        actual={actual}
                        slotMatches={slotMatches}
                        byNum={byNum}
                        inline
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
