import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { flagSrc } from "../../lib/format";
import {
  buildScenarioSlots,
  applyScenario,
  rankFriendsAgainst,
  slotEarners,
} from "../../lib/simulator";

const PATH_UI = [
  { key: "reg", label: "REG", full: "Regulation" },
  { key: "aet", label: "ET", full: "Extra time" },
  { key: "pens", label: "PENS", full: "Penalties" },
];

/** Smoothly count a number toward its target — used for the projected totals. */
function AnimatedNumber({ value, className }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 520;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{display}</span>;
}

function TeamPick({ team, picked, dimmed, onClick, align = "left" }) {
  if (!team) {
    return (
      <div className={`scn-team scn-team--tbd scn-team--${align}`}>
        <span className="scn-team__flag scn-team__flag--tbd" />
        <span className="scn-team__code">TBD</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "scn-team",
        `scn-team--${align}`,
        picked && "scn-team--picked",
        dimmed && "scn-team--dimmed",
      ].filter(Boolean).join(" ")}
      title={team.name}
    >
      <img className="scn-team__flag" src={flagSrc(team.iso2)} alt="" loading="lazy" />
      <span className="scn-team__code">{team.code}</span>
      {picked && <span className="scn-team__check" aria-hidden="true">✓</span>}
    </button>
  );
}

function ScoreStepper({ value, onChange, side }) {
  const v = value ?? 0;
  return (
    <div className={`scn-score__col scn-score__col--${side}`}>
      <button type="button" className="scn-score__btn" onClick={() => onChange(Math.min(9, v + 1))} aria-label="Increase">▲</button>
      <span className="scn-score__num">{v}</span>
      <button type="button" className="scn-score__btn" onClick={() => onChange(Math.max(0, v - 1))} aria-label="Decrease">▼</button>
    </div>
  );
}

function FixtureCard({ slot, friends, simActual, simSlotMatches, onSet, onClear, expanded, onExpand }) {
  const { teamA, teamB, choice, ready } = slot;
  const winner = choice?.winner ?? null;
  const path = choice?.path ?? "reg";
  const score = choice?.score ?? null;

  const setWinner = (team) => {
    if (winner === team.id) onClear();
    else onSet({ winner: team.id, path: choice?.path ?? "reg", score: choice?.score ?? null });
  };
  const setPath = (p) => onSet({ ...choice, path: p });
  const setScore = (idx, val) => {
    const next = score ? [...score] : [0, 0];
    next[idx] = val;
    onSet({ ...choice, score: next });
  };

  const earners = useMemo(() => {
    if (!winner) return [];
    return slotEarners(friends, slot, simSlotMatches[slot.slotKey], simActual[slot.slotKey]);
  }, [winner, friends, slot, simSlotMatches, simActual]);

  if (!ready) {
    return (
      <div className="scn-card scn-card--awaiting">
        <div className="scn-card__head">
          <span className="scn-card__badge scn-card__badge--wait">AWAITING · {slot.short}</span>
        </div>
        <div className="scn-card__teams">
          <TeamPick team={teamA} align="left" />
          <span className="scn-card__vs">vs</span>
          <TeamPick team={teamB} align="right" />
        </div>
        <p className="scn-card__hint">Decide the feeder game to unlock this pick.</p>
      </div>
    );
  }

  return (
    <div className={["scn-card", winner && "scn-card--set", expanded && "scn-card--expanded"].filter(Boolean).join(" ")}>
      <div className="scn-card__head">
        <span className="scn-card__badge scn-card__badge--live">{slot.short} · {slot.points} pts</span>
        {winner && (
          <button
            type="button"
            className={["scn-card__earners-toggle", earners.length && "scn-card__earners-toggle--live"].filter(Boolean).join(" ")}
            onClick={() => onExpand(expanded ? null : slot.slotKey)}
          >
            {earners.length ? `${earners.length} cash in` : "no takers"}
            <span className="scn-card__earners-caret">{expanded ? "▾" : "▸"}</span>
          </button>
        )}
      </div>

      <div className="scn-card__teams">
        <TeamPick team={teamA} picked={winner === teamA?.id} dimmed={winner && winner !== teamA?.id} onClick={() => setWinner(teamA)} align="left" />
        <span className="scn-card__vs">v</span>
        <TeamPick team={teamB} picked={winner === teamB?.id} dimmed={winner && winner !== teamB?.id} onClick={() => setWinner(teamB)} align="right" />
      </div>

      <AnimatePresence initial={false}>
        {winner && (
          <motion.div
            className="scn-card__controls"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="scn-path" role="group" aria-label="How it's decided">
              {PATH_UI.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  title={p.full}
                  className={["scn-path__btn", path === p.key && "scn-path__btn--on"].filter(Boolean).join(" ")}
                  onClick={() => setPath(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="scn-score">
              <ScoreStepper value={score?.[0]} side="a" onChange={(v) => setScore(0, v)} />
              <span className="scn-score__dash">–</span>
              <ScoreStepper value={score?.[1]} side="b" onChange={(v) => setScore(1, v)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {winner && expanded && (
          <motion.ul
            className="scn-earners"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {earners.length === 0 && <li className="scn-earners__empty">No one predicted this outcome.</li>}
            {earners.map((e) => (
              <li key={e.uid} className="scn-earners__row">
                <span className="scn-earners__name">{e.name}</span>
                <span className="scn-earners__tags">
                  {e.bracket > 0 && <span className="scn-tag scn-tag--brkt">+{e.bracket} advance</span>}
                  {e.comeback !== 0 && <span className={`scn-tag ${e.comeback > 0 ? "scn-tag--cb" : "scn-tag--neg"}`}>{e.comeback > 0 ? `+${e.comeback}` : e.comeback} comeback</span>}
                  {e.path !== 0 && <span className={`scn-tag ${e.path > 0 ? "scn-tag--path" : "scn-tag--neg"}`}>{e.path > 0 ? `+${e.path}` : e.path} path</span>}
                  {e.score > 0 && <span className="scn-tag scn-tag--score">+{e.score} score</span>}
                </span>
                <span className={["scn-earners__total", e.total < 0 && "scn-earners__total--neg"].filter(Boolean).join(" ")}>
                  {e.total > 0 ? `+${e.total}` : e.total}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function LeaderRow({ row, maxGain }) {
  const { rankDelta, pointsDelta } = row;
  const gainPct = maxGain > 0 ? Math.max(0, Math.min(100, (pointsDelta / maxGain) * 100)) : 0;
  return (
    <motion.li
      layout
      layoutId={row.uid}
      transition={{ type: "spring", stiffness: 520, damping: 42 }}
      className={[
        "scn-lb__row",
        row.isMe && "scn-lb__row--me",
        row.projRank === 1 && "scn-lb__row--leader",
        pointsDelta > 0 && "scn-lb__row--up",
      ].filter(Boolean).join(" ")}
    >
      <span className="scn-lb__rank">
        <span className="scn-lb__rank-num">{row.projRank}</span>
        {rankDelta !== 0 && (
          <span className={`scn-lb__rank-move ${rankDelta > 0 ? "up" : "down"}`}>
            {rankDelta > 0 ? "▲" : "▼"}{Math.abs(rankDelta)}
          </span>
        )}
      </span>
      <span className="scn-lb__name">
        <span className="scn-lb__avatar">{row.name.slice(0, 2).toUpperCase()}</span>
        <span className="scn-lb__name-txt">{row.name}</span>
        {row.isMe && <span className="scn-lb__you">YOU</span>}
      </span>
      <span className="scn-lb__bar-wrap">
        <span className="scn-lb__bar" style={{ width: `${gainPct}%` }} />
      </span>
      <span className="scn-lb__delta">
        {pointsDelta !== 0 && (
          <span className={pointsDelta > 0 ? "scn-lb__delta-pos" : "scn-lb__delta-neg"}>
            {pointsDelta > 0 ? `+${pointsDelta}` : pointsDelta}
          </span>
        )}
      </span>
      <AnimatedNumber value={row.points} className="scn-lb__pts" />
    </motion.li>
  );
}

function ScenarioBody({ friends, currentUid, actual, slotMatches, teams, byNum, onClose }) {
  const [scenario, setScenario] = useState({});
  const [expandedSlot, setExpandedSlot] = useState(null);

  const lockedFriends = useMemo(() => friends.filter((f) => f.locked && !f.abandoned), [friends]);

  const baseline = useMemo(() => {
    const map = new Map();
    lockedFriends.forEach((f, i) => map.set(f.uid, { rank: i + 1, points: f.points }));
    return map;
  }, [lockedFriends]);

  const slots = useMemo(
    () => buildScenarioSlots(actual, slotMatches, teams, scenario),
    [actual, slotMatches, teams, scenario]
  );
  // Only games that haven't been decided in reality — the future.
  const futureSlots = useMemo(() => slots.filter((s) => !s.decidedReal), [slots]);

  const { simActual, simSlotMatches } = useMemo(
    () => applyScenario(actual, slotMatches, teams, scenario),
    [actual, slotMatches, teams, scenario]
  );

  const projected = useMemo(() => {
    const ranked = rankFriendsAgainst(lockedFriends, simActual, simSlotMatches, byNum);
    return ranked.map((f, i) => {
      const base = baseline.get(f.uid);
      const projRank = i + 1;
      return {
        ...f,
        isMe: f.uid === currentUid,
        projRank,
        rankDelta: base ? base.rank - projRank : 0,
        pointsDelta: base ? f.points - base.points : 0,
      };
    });
  }, [lockedFriends, simActual, simSlotMatches, byNum, baseline, currentUid]);

  const maxGain = useMemo(() => projected.reduce((mx, r) => Math.max(mx, r.pointsDelta), 0), [projected]);

  const setCount = Object.values(scenario).filter((c) => c?.winner).length;
  const leader = projected[0];
  const biggestMover = useMemo(() => {
    let best = null;
    for (const r of projected) if (r.rankDelta > 0 && (!best || r.rankDelta > best.rankDelta)) best = r;
    return best;
  }, [projected]);

  const setSlot = (slotKey, choice) => setScenario((prev) => ({ ...prev, [slotKey]: choice }));
  const clearSlot = (slotKey) =>
    setScenario((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });

  return (
    <>
      <div className="scn-lab__head">
        <div className="scn-lab__title-wrap">
          <span className="scn-lab__spark" aria-hidden="true">⚡</span>
          <div>
            <h3 className="scn-lab__title">What-If Simulator</h3>
            <p className="scn-lab__sub">Pick outcomes for upcoming games and watch the table react — nothing is saved.</p>
          </div>
        </div>
        <div className="scn-lab__head-actions">
          {setCount > 0 && (
            <button type="button" className="scn-lab__reset" onClick={() => setScenario({})}>
              Reset {setCount} pick{setCount > 1 ? "s" : ""}
            </button>
          )}
          <button type="button" className="scn-lab__close" onClick={onClose} aria-label="Close simulator">✕</button>
        </div>
      </div>

      <div className="scn-lab__ribbon">
        <div className="scn-ribbon__stat">
          <span className="scn-ribbon__k">Outcomes set</span>
          <span className="scn-ribbon__v">{setCount}</span>
        </div>
        <div className="scn-ribbon__stat">
          <span className="scn-ribbon__k">Projected leader</span>
          <span className="scn-ribbon__v scn-ribbon__v--accent">{leader ? leader.name : "—"}</span>
        </div>
        <div className="scn-ribbon__stat">
          <span className="scn-ribbon__k">Biggest climber</span>
          <span className="scn-ribbon__v">
            {biggestMover ? (<>{biggestMover.name} <span className="scn-ribbon__move">▲{biggestMover.rankDelta}</span></>) : "—"}
          </span>
        </div>
      </div>

      <div className="scn-lab__body">
        <div className="scn-lab__picks nice-scroll">
          <div className="scn-lab__picks-head">Upcoming games · {futureSlots.length}</div>
          {futureSlots.length > 0 ? (
            <div className="scn-fixtures">
              {futureSlots.map((slot) => (
                <FixtureCard
                  key={slot.slotKey}
                  slot={slot}
                  friends={lockedFriends}
                  simActual={simActual}
                  simSlotMatches={simSlotMatches}
                  onSet={(choice) => setSlot(slot.slotKey, choice)}
                  onClear={() => clearSlot(slot.slotKey)}
                  expanded={expandedSlot === slot.slotKey}
                  onExpand={setExpandedSlot}
                />
              ))}
            </div>
          ) : (
            <p className="scn-lab__done">Every knockout game is already decided — nothing left to simulate.</p>
          )}
        </div>

        <div className="scn-lab__board nice-scroll">
          <div className="scn-lb__head">
            <span>Projected standings</span>
            {setCount > 0 && <span className="scn-lb__head-tag">live</span>}
          </div>
          {projected.length > 0 ? (
            <ol className="scn-lb">
              <AnimatePresence>
                {projected.map((row) => (
                  <LeaderRow key={row.uid} row={row} maxGain={maxGain} />
                ))}
              </AnimatePresence>
            </ol>
          ) : (
            <p className="scn-lab__done">No locked players to rank yet.</p>
          )}
        </div>
      </div>
    </>
  );
}

export function ScenarioLab({ open, onClose, ...props }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="scn-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.section
            className="scn-lab"
            initial={{ opacity: 0, scale: 0.95, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <ScenarioBody {...props} onClose={onClose} />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
