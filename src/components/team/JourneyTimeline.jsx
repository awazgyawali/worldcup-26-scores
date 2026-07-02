import { Countdown } from "../common/Countdown";
import { buildJourneyTimeline, journeyResult, JOURNEY_RESULT_LABEL } from "./journeyHelpers";
import { flagSrc, fmtKickoff, liveMinute } from "../../lib/format";

export function JourneyGoalCell({ goal, align }) {
  if (!goal) return null;
  return (
    <span className={["journey-timeline__goal", `journey-timeline__goal--${align}`].join(" ")}>
      <span className="journey-timeline__scorer">{goal.name}</span>
      {goal.penalty && <span className="journey-goal__tag">PEN</span>}
      {goal.owngoal && <span className="journey-goal__tag journey-goal__tag--og">OG</span>}
    </span>
  );
}

export function JourneyTwoSidedRow({ goal }) {
  const isUs = goal.side === "us";
  return (
    <li className="journey-timeline__row">
      <span className="journey-timeline__side journey-timeline__side--left">
        {isUs ? <JourneyGoalCell goal={goal} align="right" /> : null}
      </span>
      <span className="journey-timeline__minute">{goal.minute}′</span>
      <span className="journey-timeline__side journey-timeline__side--right">
        {!isUs ? <JourneyGoalCell goal={goal} align="left" /> : null}
      </span>
    </li>
  );
}

export function JourneyTimelineSection({ shortLabel, goals, emptyLabel, pensScore, team, opponent }) {
  const hasGoals = goals.length > 0;
  const hasPens = pensScore != null;
  if (!hasGoals && !hasPens && !emptyLabel) return null;

  return (
    <div className="journey-timeline__section">
      <div className="journey-timeline__header">
        <span className="journey-timeline__header-line" aria-hidden />
        <span className="journey-timeline__header-label">{shortLabel}</span>
        <span className="journey-timeline__header-line" aria-hidden />
      </div>

      <div className="journey-timeline__track">
        <div className="journey-timeline__spine" aria-hidden />

        {hasGoals ? (
          <ul className="journey-timeline__list">
            {goals.map((g, i) => (
              <JourneyTwoSidedRow key={`${g.name}-${g.minute}-${g.code}-${i}`} goal={g} />
            ))}
          </ul>
        ) : emptyLabel ? (
          <p className="journey-timeline__empty">{emptyLabel}</p>
        ) : null}

        {hasPens && (
          <div className="journey-timeline__pens-row">
            <span className="journey-timeline__side journey-timeline__side--left">
              <span className="journey-timeline__pens-side journey-timeline__pens-side--us">
                {pensScore.us}
              </span>
            </span>
            <span className="journey-timeline__minute journey-timeline__minute--pens">PENS</span>
            <span className="journey-timeline__side journey-timeline__side--right">
              <span className="journey-timeline__pens-side journey-timeline__pens-side--them">
                {pensScore.them}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function JourneyGoalTimeline({ entry, team }) {
  const { ft, aet, pensScore } = buildJourneyTimeline(entry, team);
  const showAet = aet.length > 0 || entry.phase === "aet" || entry.phase === "pens";
  const hasAny = ft.length > 0 || aet.length > 0 || pensScore != null;

  if (!hasAny) {
    return <p className="journey-timeline__none">No goals recorded.</p>;
  }

  return (
    <div className="journey-timeline">
      <JourneyTimelineSection
        shortLabel="FT"
        goals={ft}
        emptyLabel={ft.length === 0 ? "No goals in regulation" : null}
        team={team}
        opponent={entry.them}
      />
      {showAet && (
        <JourneyTimelineSection
          shortLabel="AET"
          goals={aet}
          emptyLabel={aet.length === 0 ? "No goals in extra time" : null}
          team={team}
          opponent={entry.them}
        />
      )}
      {pensScore != null && (
        <JourneyTimelineSection
          shortLabel="PENS"
          goals={[]}
          pensScore={pensScore}
          team={team}
          opponent={entry.them}
        />
      )}
    </div>
  );
}

export function JourneyMatchDetail({ entry, team, onOpenMatch }) {
  const result = journeyResult(entry);
  const scored = entry.gf != null;
  const played = entry.status === "played";
  const live = entry.status === "live";
  const upcoming = entry.status === "upcoming";

  return (
    <div className="journey-detail">
      <div className="journey-detail__meta">
        <span className="journey-detail__round">{entry.group || entry.roundLabel}</span>
        {entry.num && <span className="journey-detail__match-num">Match {entry.num}</span>}
        {entry.kickoff && <span className="journey-detail__when">{fmtKickoff(entry.kickoff)}</span>}
      </div>

      <div className="journey-detail__scoreboard">
        <div className="journey-detail__team journey-detail__team--us">
          <img src={flagSrc(team.iso2)} alt="" className="journey-detail__flag" />
          <span className="journey-detail__team-name">{team.name}</span>
          <span className="journey-detail__team-code">{team.code}</span>
        </div>

        <div className="journey-detail__center">
          {scored ? (
            <span className="journey-detail__score">
              {entry.gf}
              <span className="journey-detail__score-sep">–</span>
              {entry.ga}
            </span>
          ) : (
            <span className="journey-detail__vs">vs</span>
          )}

          {live && (
            <span className="journey-detail__badge journey-detail__badge--live">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--live)]" />
              {liveMinute(entry.kickoff)}
            </span>
          )}
          {played && (
            <span className="journey-detail__badge">
              {entry.phase === "aet" ? "After extra time" : entry.phase === "pens" ? "Penalties" : "Full time"}
            </span>
          )}
          {entry.pens && (
            <span className="journey-detail__badge journey-detail__badge--pens">
              Pens {entry.pens[0]}–{entry.pens[1]}
            </span>
          )}
          {entry.ht && (
            <span className="journey-detail__badge journey-detail__badge--muted">
              HT {entry.ht[0]}–{entry.ht[1]}
            </span>
          )}
          {upcoming && entry.kickoff && <Countdown to={entry.kickoff} />}
        </div>

        <div className="journey-detail__team journey-detail__team--them">
          <img src={flagSrc(entry.them.iso2)} alt="" className="journey-detail__flag" />
          <span className="journey-detail__team-name">{entry.them.name}</span>
          <span className="journey-detail__team-code">{entry.them.code}</span>
        </div>
      </div>

      <div className="journey-detail__result">
        <span className={["journey-result-pill", `journey-result-pill--${result}`].join(" ")}>
          {JOURNEY_RESULT_LABEL[result]}
        </span>
      </div>

      {(played || live) && (
        <div className="journey-detail__timeline-wrap">
          <p className="journey-detail__timeline-title">Goal timeline</p>
          <JourneyGoalTimeline entry={entry} team={team} />
        </div>
      )}

      <div className="journey-detail__footer">
        {entry.ground && <span>🏟 {entry.ground}</span>}
        {onOpenMatch && entry.num && (
          <button type="button" onClick={() => onOpenMatch(entry)} className="journey-detail__link">
            Open full match view →
          </button>
        )}
      </div>
    </div>
  );
}
