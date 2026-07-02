import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { JourneyMatchDetail } from "./JourneyTimeline";
import { journeyResult, JOURNEY_RESULT_LABEL } from "./journeyHelpers";
import { flagSrc, flagSrcSet, fmtKickoff, fmtTimeOnly } from "../../lib/format";

export function JourneyListItem({ entry, selected, onSelect }) {
  const result = journeyResult(entry);
  const scored = entry.gf != null;
  const live = entry.status === "live";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-selected={selected}
        className={["journey-item", selected ? "journey-item--selected" : "", `journey-item--${result}`].join(" ")}
      >
        <div className="journey-item__top">
          <span className="journey-item__round">{entry.group || entry.roundLabel}</span>
          <span className={["journey-result-pill journey-result-pill--sm", `journey-result-pill--${result}`].join(" ")}>
            {JOURNEY_RESULT_LABEL[result]}
          </span>
        </div>
        <div className="journey-item__main">
          <img src={flagSrc(entry.them.iso2)} alt="" className="journey-item__flag" />
          <div className="journey-item__body">
            <span className="journey-item__opponent">vs {entry.them.name}</span>
            {entry.kickoff && (
              <span className="journey-item__date">{fmtKickoff(entry.kickoff)}</span>
            )}
          </div>
          {scored ? (
            <span className="journey-item__score">{entry.gf}–{entry.ga}</span>
          ) : live ? (
            <span className="journey-item__score journey-item__score--live">LIVE</span>
          ) : entry.kickoff ? (
            <span className="journey-item__score journey-item__score--time">{fmtTimeOnly(entry.kickoff)}</span>
          ) : (
            <span className="journey-item__score journey-item__score--muted">—</span>
          )}
        </div>
      </button>
    </li>
  );
}

export function TeamModal({ team, journey, onClose, onOpenMatch }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!team || journey.length === 0) {
      setSelectedIdx(0);
      return;
    }
    let idx = journey.findLastIndex((m) => m.gf != null);
    if (idx < 0) idx = journey.findIndex((m) => m.status === "live");
    if (idx < 0) idx = journey.findIndex((m) => m.status === "upcoming");
    setSelectedIdx(idx >= 0 ? idx : 0);
  }, [team?.code, journey.length]);

  if (!team) return null;

  const playedGames = journey.filter((m) => m.gf != null);
  const wins = playedGames.filter((m) => journeyResult(m) === "win").length;
  const draws = playedGames.filter((m) => journeyResult(m) === "draw").length;
  const losses = playedGames.filter((m) => journeyResult(m) === "loss").length;
  const gf = playedGames.reduce((s, m) => s + m.gf, 0);
  const ga = playedGames.reduce((s, m) => s + m.ga, 0);
  const selected = journey[selectedIdx] ?? null;

  return (
    <Modal open={!!team} onClose={onClose} maxW="max-w-4xl">
      <div className="journey-header">
        <img src={flagSrc(team.iso2)} srcSet={flagSrcSet(team.iso2)} alt="" className="journey-header__flag" />
        <div className="journey-header__body">
          <h2 className="journey-header__title">{team.name}</h2>
          <p className="journey-header__code">{team.code} · Tournament run</p>
          {playedGames.length > 0 && (
            <p className="journey-header__record">
              <span className="journey-header__w">{wins}W</span>
              <span>{draws}D</span>
              <span className="journey-header__l">{losses}L</span>
              <span className="journey-header__sep">·</span>
              <span>{gf} scored · {ga} conceded</span>
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="btn-ghost journey-header__close" aria-label="Close">
          ✕
        </button>
      </div>

      {journey.length === 0 ? (
        <p className="journey-empty">No matches found for this team.</p>
      ) : (
        <div className="journey-shell">
          <aside className="journey-master">
            <p className="journey-master__label">Fixtures · {journey.length}</p>
            <ul className="journey-master__list nice-scroll">
              {journey.map((m, i) => (
                <JourneyListItem
                  key={`${m.num ?? m.date}-${m.them?.code}-${i}`}
                  entry={m}
                  selected={i === selectedIdx}
                  onSelect={() => setSelectedIdx(i)}
                />
              ))}
            </ul>
          </aside>

          <section className="journey-detail-pane nice-scroll" aria-label="Match detail">
            {selected ? (
              <JourneyMatchDetail entry={selected} team={team} onOpenMatch={onOpenMatch} />
            ) : (
              <p className="journey-empty">Select a fixture to view details.</p>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
