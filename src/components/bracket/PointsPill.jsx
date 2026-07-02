import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "../common/icons";
import { useCountUp } from "../../hooks/useCountUp";
import { ROUNDS, THIRD_PLACE } from "../../lib/rounds";

// ----------------------------------------------------------------------------
// POINTS PILL — centered above the final column + compact popover.
// ----------------------------------------------------------------------------
export function PointsPill({ stats, showPoints = true }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  // Use totalPoints (includes score prediction points) instead of just points
  const totalPoints = useCountUp(stats.totalPoints ?? stats.points);
  const rounds = [...ROUNDS, THIRD_PLACE];
  const hasScorePoints = (stats.scorePoints ?? 0) > 0;
  const scoreOneSide = stats.scoreOneSide ?? 0;
  const scoreExact = stats.scoreExact ?? 0;
  const scorePoints = stats.scorePoints ?? 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => showPoints && setOpen((v) => !v)}
        className="points-pill"
        aria-expanded={open}
        aria-haspopup="dialog"
        title={showPoints ? "Tap for points breakdown" : "Lock your picks to earn points"}
        disabled={!showPoints}
      >
        <span className="points-pill__label">Points:</span>
        <span className="points-pill__value">{showPoints ? totalPoints : "—"}</span>
        {showPoints && hasScorePoints && (
          <span className="ml-1 rounded-full bg-[var(--gold)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--gold-bright)]">
            +{scorePoints}
          </span>
        )}
        {showPoints && (stats.railScoreOneSide > 0 || stats.railScoreExact > 0) && (
          <span className="ml-1 rounded-full bg-[var(--pitch-glow)]/20 px-1.5 py-0.5 text-[9px] font-bold text-[var(--pitch-glow)]">
            R+{stats.railScorePoints ?? 0}
          </span>
        )}
        {showPoints && (
          <IconChevronDown className={["points-pill__chevron", open ? "rotate-180" : ""].join(" ")} />
        )}
      </button>

      {showPoints && open && (
        <div className="points-popover points-popover--compact" role="dialog" aria-label="Points breakdown">
          <p className="points-popover__hint">Finished matches only · later rounds worth more</p>
          <ul className="points-popover__list">
            {rounds.map((r) => {
              const s = stats.byRound[r.key] ?? { correct: 0, total: 0, played: 0, scoreOneSide: 0, scoreExact: 0, scorePoints: 0 };
              const earned = s.correct * r.points;
              const roundScorePoints = s.scorePoints ?? 0;
              const totalRoundPoints = earned + roundScorePoints;
              return (
                <li key={r.key} className="points-popover__row">
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-bold text-[var(--text-primary)]">{r.short}</div>
                    <div className="text-[9px] text-[var(--text-muted)]">{r.points}pt · {s.played}/{r.matches ?? 1} done</div>
                  </div>
                  <div className="text-right">
                    <div className={["text-[10px] font-black tabular-nums", s.total > 0 && s.correct === s.total ? "text-[var(--pitch-glow)]" : "text-[var(--text-muted)]"].join(" ")}>
                      {s.total > 0 ? `${s.correct}/${s.total}` : "—"}
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-display text-sm leading-none tracking-wider text-[var(--gold-bright)]">{earned}</span>
                      {(s.scoreOneSide > 0 || s.scoreExact > 0) && (
                        <div className="flex gap-1">
                          {s.scoreOneSide > 0 && (
                            <span className="rounded-full bg-[var(--gold)]/10 px-1 py-0.5 text-[7px] font-bold text-[var(--gold-bright)]/70">
                              1S:{s.scoreOneSide}
                            </span>
                          )}
                          {s.scoreExact > 0 && (
                            <span className="rounded-full bg-[var(--gold)]/20 px-1 py-0.5 text-[7px] font-bold text-[var(--gold-bright)]">
                              Ex:{s.scoreExact}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="points-popover__total">
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)]">Base</span>
                <span className="font-display text-base leading-none tracking-wider text-[var(--text-muted)]">{stats.points}</span>
              </div>
              {hasScorePoints && (
                <>
                  {scoreOneSide > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--gold-bright)]/70">1 Side ({scoreOneSide})</span>
                      <span className="font-display text-sm leading-none tracking-wider text-[var(--gold-bright)]/70">+{scoreOneSide * 2}</span>
                    </div>
                  )}
                  {scoreExact > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--gold-bright)]">Exact ({scoreExact})</span>
                      <span className="font-display text-sm leading-none tracking-wider text-[var(--gold-bright)]">+{scoreExact * 5}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.1em] text-[var(--text-muted)]">Total</span>
              <span className="font-display text-lg leading-none tracking-wider text-[var(--gold-bright)]">{stats.totalPoints ?? stats.points}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
