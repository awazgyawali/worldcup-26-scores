import { motion } from "framer-motion";
import { flagSrc, flagSrcSet } from "../../lib/format";

// ----------------------------------------------------------------------------
// TEAM ROW — [flag] CODE [verdict] [score]
// ----------------------------------------------------------------------------
export function TeamRow({ team, isPicked, isDimmed, verdict, onPick, onFlagClick, locked, readOnly, started, score, predictedScore, isMatchWinner, align = "left", compareDot = null, compareLabel = null }) {
  const empty = !team;
  const disabled = empty || locked || readOnly || started;
  const right = align === "right";
  const displayScore = score != null ? score : predictedScore;
  const isPredicted = score == null && predictedScore != null;

  let strip = "team-strip";
  if (right) strip += " team-strip--right";
  let text = "text-[var(--text-secondary)]";
  if (verdict === "correct") {
    strip += " team-strip--correct";
    text = "text-[var(--pitch-glow)] font-bold";
  } else if (verdict === "wrong") {
    strip += " team-strip--wrong";
    text = "text-[var(--wrong)] line-through decoration-[var(--wrong)]/60";
  } else if (verdict === "missed") {
    strip += " team-strip--missed";
    text = "text-[var(--pitch-glow)]/85 font-semibold";
  } else if (isPicked) {
    strip += " team-strip--winner";
    text = "text-[var(--text-primary)] font-bold";
  } else if (isDimmed) {
    text = "text-[var(--text-muted)]";
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onPick(team)}
      onKeyDown={(e) => !disabled && e.key === "Enter" && onPick(team)}
      title={
        empty
          ? undefined
          : readOnly
            ? "Picks are read-only"
            : started
              ? "Match already started — no changes allowed"
              : locked
                ? "Both teams must be decided first"
                : `Advance ${team.name}`
      }
      className={[
        "group/row relative flex h-[22px] w-full items-center gap-1.5 rounded-md px-1.5 transition-all duration-200",
        right ? "flex-row-reverse text-right" : "text-left",
        strip,
        empty ? "cursor-default" : locked || readOnly || started ? "cursor-default" : "cursor-pointer",
      ].join(" ")}
    >
      {empty ? (
        <span className="grid h-3.5 w-5.5 shrink-0 place-items-center rounded-[3px] bg-white/[0.06] text-[9px] font-bold text-[var(--text-muted)] ring-1 ring-white/10">
          ·
        </span>
      ) : (
        <img
          src={flagSrc(team.iso2)}
          srcSet={flagSrcSet(team.iso2)}
          alt=""
          width={22}
          height={14}
          loading="lazy"
          onClick={(e) => {
            e.stopPropagation();
            onFlagClick?.(team);
          }}
          title={`${team.name} — tournament journey`}
          className="h-3.5 w-5.5 shrink-0 cursor-pointer rounded-[3px] object-cover shadow-sm ring-1 ring-black/40 transition hover:scale-110 hover:ring-[var(--gold)]/60"
        />
      )}

      <span className={["min-w-0 flex-1 truncate text-[11.5px] font-bold tracking-wide", text].join(" ")}>
        {empty ? <span className="font-medium text-[var(--text-muted)]">TBD</span> : team.code}
      </span>

      <span className={["flex w-3 shrink-0 items-center text-[10.5px]", right ? "justify-start" : "justify-end"].join(" ")}>
        {verdict === "correct" ? (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[var(--pitch-glow)]">✓</motion.span>
        ) : verdict === "wrong" ? (
          <span className="text-[var(--wrong)]">✕</span>
        ) : verdict === "missed" ? (
          <span className="text-[8px] font-black uppercase text-[var(--pitch-glow)]/80">W</span>
        ) : isPicked ? (
          <motion.span initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-[var(--pitch-glow)]">✓</motion.span>
        ) : null}
      </span>

      {compareDot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: compareDot === "agree" ? "var(--agree)" : "var(--pitch-glow)" }}
          title={compareDot === "agree" ? "Rival picked the same team" : "Rival picked differently"}
        />
      )}
      {compareLabel && (
        <span
          className="shrink-0 rounded px-1 text-[8px] font-black uppercase tracking-wide text-[var(--pitch-glow)]"
          style={{ background: "color-mix(in oklch, var(--pitch) 18%, transparent)" }}
          title="Rival's pick"
        >
          {compareLabel}
        </span>
      )}

      {displayScore != null && (
        <span
          className={[
            "grid h-4 w-4.5 shrink-0 place-items-center rounded-[4px] text-[10.5px] font-extrabold tabular-nums",
            isPredicted
              ? "text-[var(--gold-bright)]"
              : isMatchWinner
                ? "bg-[color-mix(in_oklch,var(--pitch)_35%,transparent)] text-[var(--text-primary)]"
                : "bg-white/[0.07] text-[var(--text-muted)]",
          ].join(" ")}
        >
          {displayScore}
        </span>
      )}
    </div>
  );
}
