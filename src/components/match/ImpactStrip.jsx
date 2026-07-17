import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// ----------------------------------------------------------------------------
// "IF YOUR CALL LANDS" — one-line projection pill for the selected fixture,
// fed by computeMatchImpact. Tapping it opens a bottom sheet with the
// reshuffled mini-table and what every player banks from this one game.
// ----------------------------------------------------------------------------

function outcomeLabel(impact, match) {
  const { outcome } = impact;
  const parts = [];
  if (outcome.score) {
    parts.push(`${match.team1?.code ?? "?"} ${outcome.score[0]}–${outcome.score[1]} ${match.team2?.code ?? "?"}`);
  }
  if (outcome.winnerId && !outcome.score) {
    const w = outcome.winnerId === match.team1?.id ? match.team1 : match.team2;
    if (w) parts.push(`${w.code} win`);
  }
  if (outcome.path === "aet") parts.push("after extra time");
  if (outcome.path === "pens") parts.push("on penalties");
  return parts.join(" · ");
}

function DeltaChips({ row }) {
  return (
    <span className="imp-row__tags">
      {row.bracket > 0 && <span className="imp-tag imp-tag--brkt">+{row.bracket} advance</span>}
      {row.comeback !== 0 && (
        <span className={`imp-tag ${row.comeback > 0 ? "imp-tag--cb" : "imp-tag--neg"}`}>
          {row.comeback > 0 ? `+${row.comeback}` : row.comeback} comeback
        </span>
      )}
      {row.path !== 0 && (
        <span className={`imp-tag ${row.path > 0 ? "imp-tag--path" : "imp-tag--neg"}`}>
          {row.path > 0 ? `+${row.path}` : row.path} path
        </span>
      )}
      {row.score > 0 && <span className="imp-tag imp-tag--score">+{row.score} score</span>}
    </span>
  );
}

function ImpactSheet({ impact, match, onClose, onOpenSimulator }) {
  const { rows, me } = impact;
  return (
    <motion.div
      className="imp-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
    >
      <motion.div
        className="imp-sheet"
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 48, opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Projected standings if your call lands"
      >
        <div className="imp-sheet__grab" aria-hidden="true" />
        <div className="imp-sheet__head">
          <div>
            <p className="imp-sheet__title">⚡ If your call lands</p>
            <p className="imp-sheet__sub">{outcomeLabel(impact, match)} — this game only, nothing is saved.</p>
          </div>
          <button type="button" className="imp-sheet__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <ol className="imp-board nice-scroll">
          {rows.map((r) => (
            <li
              key={r.uid}
              className={[
                "imp-row",
                r.isMe && "imp-row--me",
                r.projRank === 1 && "imp-row--leader",
              ].filter(Boolean).join(" ")}
            >
              <span className="imp-row__rank">
                {r.projRank === 1 ? "👑" : r.projRank}
                {r.rankDelta !== 0 && (
                  <span className={`imp-row__move ${r.rankDelta > 0 ? "imp-row__move--up" : "imp-row__move--down"}`}>
                    {r.rankDelta > 0 ? "▲" : "▼"}{Math.abs(r.rankDelta)}
                  </span>
                )}
              </span>
              <span className="imp-row__name">
                {r.name}
                {r.isMe && <span className="imp-row__you">YOU</span>}
              </span>
              <DeltaChips row={r} />
              <span className={["imp-row__delta", r.total > 0 && "imp-row__delta--pos", r.total < 0 && "imp-row__delta--neg"].filter(Boolean).join(" ")}>
                {r.total === 0 ? "—" : r.total > 0 ? `+${r.total}` : r.total}
              </span>
              <span className="imp-row__total">{r.projected}</span>
            </li>
          ))}
        </ol>

        <div className="imp-sheet__foot">
          <span className="imp-sheet__verdict">
            {me.projRank === 1
              ? impact.gap > 0
                ? `You'd top the table, ${impact.gap} clear.`
                : "You'd be level on top."
              : `You'd sit #${me.projRank}, ${Math.abs(impact.gap)} off the top.`}
          </span>
          {onOpenSimulator && (
            <button type="button" className="imp-sheet__sim" onClick={onOpenSimulator}>
              Open full What-If ⚡
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ImpactStrip({ impact, match, onOpenSimulator }) {
  const [open, setOpen] = useState(false);
  if (!impact) return null;
  const { me, leader } = impact;

  return (
    <>
      <button type="button" className="imp-pill" onClick={() => setOpen(true)}>
        <span className="imp-pill__badge">
          <span className="imp-pill__spark" aria-hidden="true">⚡</span>
          <span className="imp-pill__label">If it lands</span>
        </span>

        <span className="imp-pill__divider" aria-hidden="true" />

        <span className="imp-pill__stat" title="Projected leader">
          <span className="imp-pill__stat-k">Leader</span>
          <span className="imp-pill__stat-v imp-pill__leader">
            👑 {leader.isMe ? "You" : leader.name}
          </span>
        </span>

        <span className="imp-pill__divider" aria-hidden="true" />

        <span className="imp-pill__stat">
          <span className="imp-pill__stat-k">Your rank</span>
          <span className="imp-pill__stat-v imp-pill__rank">
            #{me.projRank}
            {me.rankDelta !== 0 && (
              <span className={`imp-pill__move ${me.rankDelta > 0 ? "imp-pill__move--up" : "imp-pill__move--down"}`}>
                {me.rankDelta > 0 ? "▲" : "▼"}{Math.abs(me.rankDelta)}
              </span>
            )}
          </span>
        </span>

        <span className="imp-pill__divider" aria-hidden="true" />

        <span className="imp-pill__stat">
          <span className="imp-pill__stat-k">{me.projRank === 1 ? "Lead by" : "Behind by"}</span>
          <span className={me.projRank === 1 ? "imp-pill__stat-v imp-pill__gap imp-pill__gap--top" : "imp-pill__stat-v imp-pill__gap"}>
            {me.projRank === 1 ? (impact.gap > 0 ? `+${impact.gap}` : "level") : `${Math.abs(impact.gap)}`}
          </span>
        </span>

        {me.total !== 0 && (
          <>
            <span className="imp-pill__divider" aria-hidden="true" />
            <span className="imp-pill__stat">
              <span className="imp-pill__stat-k">You'd earn</span>
              <span className={me.total > 0 ? "imp-pill__stat-v imp-pill__earn" : "imp-pill__stat-v imp-pill__earn imp-pill__earn--neg"}>
                {me.total > 0 ? `+${me.total}` : me.total}
              </span>
            </span>
          </>
        )}

        <span className="imp-pill__caret" aria-hidden="true">▸</span>
      </button>

      <AnimatePresence>
        {open && (
          <ImpactSheet
            impact={impact}
            match={match}
            onClose={() => setOpen(false)}
            onOpenSimulator={onOpenSimulator ? () => { setOpen(false); onOpenSimulator(); } : null}
          />
        )}
      </AnimatePresence>
    </>
  );
}
