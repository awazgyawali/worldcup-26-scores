import { useMemo } from "react";
import { friendPredictionList, PATH_LABELS, PATH_SKIP } from "../../lib/scoring";
import { flagSrc } from "../../lib/format";
import { getPickProgress } from "../../lib/bracket";

function ScoreCall({ predicted, actual, scoreResult, scorePts, played }) {
  if (!predicted) return <span className="standings-detail__muted">No call</span>;
  if (!played || !actual) {
    return <span className="score-pred score-pred--predicted">{predicted}</span>;
  }
  const [pA, pB] = predicted.split("–").map((s) => parseInt(s, 10));
  const [aA, aB] = actual.split("–").map((s) => parseInt(s, 10));
  if (Number.isNaN(pA) || Number.isNaN(pB) || Number.isNaN(aA) || Number.isNaN(aB)) {
    return <span className="score-pred score-pred--predicted">{predicted}</span>;
  }
  return (
    <span className="score-pred score-pred--graded">
      <span className={pA === aA ? "score-pred--hit" : "score-pred--miss"}>{pA}</span>
      <span className="score-pred__dash">–</span>
      <span className={pB === aB ? "score-pred--hit" : "score-pred--miss"}>{pB}</span>
      {scorePts > 0 && <span className="standings-events-table__mini-pts">+{scorePts}</span>}
    </span>
  );
}

function CompactPredictionRow({ event }) {
  const t1 = event.match.team1;
  const t2 = event.match.team2;
  const earned = event.played && event.totalPts > 0;

  return (
    <div
      className={[
        "standings-m-pred",
        event.isFuture && "standings-m-pred--future",
        earned && "standings-m-pred--earned",
      ].filter(Boolean).join(" ")}
    >
      <div className="standings-m-pred__flags">
        {t1 ? (
          <img src={flagSrc(t1.iso2, 40)} alt="" className="standings-m-pred__flag" />
        ) : (
          <span className="standings-m-pred__flag-ph" />
        )}
        <span className="standings-m-pred__codes">
          {t1?.code ?? "—"}<span className="standings-m-pred__vs">v</span>{t2?.code ?? "—"}
        </span>
        {t2 && <img src={flagSrc(t2.iso2, 40)} alt="" className="standings-m-pred__flag" />}
      </div>
      <div className="standings-m-pred__meta">
        <span className="standings-m-pred__round">{event.roundLabel}</span>
        {event.bracketTeam && (
          <span className="standings-m-pred__bracket">
            <img src={flagSrc(event.bracketTeam.iso2, 40)} alt="" className="standings-m-pred__flag-sm" />
            {event.played ? (
              <span className={event.bracketCorrect ? "standings-detail__ok" : "standings-detail__bad"}>
                {event.bracketCorrect ? "✓" : "✕"}
              </span>
            ) : (
              <span className="standings-m-pred__pick-dot" aria-hidden="true" />
            )}
          </span>
        )}
        {event.comebackTeam && (
          <span className="standings-m-pred__comeback">
            ↩
            <img src={flagSrc(event.comebackTeam.iso2, 40)} alt="" className="standings-m-pred__flag-sm" />
            {event.comebackTeam.code}
            {event.comebackRisked && <span className="mdi mdi-fire standings-fire" title="Risked it" aria-label="Risked it" />}
            {event.played && (
              <span className={event.comebackCorrect ? "standings-detail__ok" : "standings-detail__bad"}>
                {event.comebackCorrect ? "✓" : "✕"}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="standings-m-pred__score">
        <ScoreCall
          predicted={event.scoreDisplay}
          actual={event.actualScore}
          scoreResult={event.scoreResult}
          scorePts={event.scorePts}
          played={event.played}
        />
      </div>
      <div className="standings-m-pred__pts">
        {event.isFuture ? (
          <span className="standings-m-pred__upcoming">up</span>
        ) : event.totalPts > 0 ? (
          `+${event.totalPts}`
        ) : event.scoreDisplay || event.bracketTeam ? (
          "0"
        ) : (
          "—"
        )}
      </div>
    </div>
  );
}

function EventRow({ event, table = false }) {
  const t1 = event.match.team1?.code ?? "TBD";
  const t2 = event.match.team2?.code ?? "TBD";
  const earned = event.totalPts > 0;

  if (table) {
    return (
      <div className={[
        "standings-events-table__row",
        earned && "standings-events-table__row--earned",
        event.isFuture && "standings-events-table__row--future",
      ].filter(Boolean).join(" ")}>
        <span className="standings-events-table__round">{event.roundLabel}</span>
        <span className="standings-events-table__match">
          {event.matchNum && <span className="standings-events-table__num">M{event.matchNum}</span>}
          {event.match.team1 && (
            <img src={flagSrc(event.match.team1.iso2, 40)} alt="" className="standings-event__flag-sm" />
          )}
          {t1} v {t2}
          {event.match.team2 && (
            <img src={flagSrc(event.match.team2.iso2, 40)} alt="" className="standings-event__flag-sm" />
          )}
        </span>
        <span className="standings-events-table__bracket">
          {event.bracketTeam ? (
            <span className="standings-events-table__bracket-pick">
              <img src={flagSrc(event.bracketTeam.iso2, 40)} alt="" className="standings-event__flag-sm" />
              {event.bracketTeam.code}
              {event.isFuture ? (
                <span className="standings-m-pred__pick-dot" aria-hidden="true" />
              ) : (
                <span className={event.bracketCorrect ? "standings-detail__ok" : "standings-detail__bad"}>
                  {event.bracketCorrect ? "✓" : "✕"}
                </span>
              )}
              {event.bracketPts > 0 && <span className="standings-events-table__mini-pts">+{event.bracketPts}</span>}
            </span>
          ) : !event.comebackTeam ? (
            <span className="standings-detail__muted">—</span>
          ) : null}
          {event.comebackTeam && (
            <span
              className={[
                "standings-events-table__comeback",
                !event.isFuture && event.comebackCorrect && "standings-events-table__comeback--hit",
                !event.isFuture && !event.comebackCorrect && "standings-events-table__comeback--miss",
              ].filter(Boolean).join(" ")}
            >
              <span className="standings-events-table__comeback-arrow" aria-hidden="true">↩</span>
              <img src={flagSrc(event.comebackTeam.iso2, 40)} alt="" className="standings-event__flag-sm" />
              {event.comebackTeam.code}
              {event.comebackRisked && <span className="mdi mdi-fire standings-fire" title="Risked it" aria-label="Risked it" />}
              {event.isFuture ? (
                <span className="standings-m-pred__pick-dot" aria-hidden="true" />
              ) : (
                <span className={event.comebackCorrect ? "standings-detail__ok" : "standings-detail__bad"}>
                  {event.comebackCorrect ? "✓" : "✕"}
                </span>
              )}
              {event.comebackPts !== 0 && (
                <span className="standings-events-table__mini-pts">
                  {event.comebackPts > 0 ? `+${event.comebackPts}` : event.comebackPts}
                </span>
              )}
            </span>
          )}
        </span>
        <span className="standings-events-table__call">
          <ScoreCall
            predicted={event.scoreDisplay}
            actual={event.actualScore}
            scoreResult={event.scoreResult}
            scorePts={event.scorePts}
            played={!!event.actualScore}
          />
        </span>
        <span className="standings-events-table__path-col">
          {event.pathPick && event.pathPick !== PATH_SKIP ? (
            <span
              className={[
                "standings-events-table__path",
                !event.isFuture && event.pathCorrect && "standings-events-table__path--hit",
                !event.isFuture && event.pathCorrect === false && "standings-events-table__path--miss",
              ].filter(Boolean).join(" ")}
            >
              ⚑ {PATH_LABELS[event.pathPick]}
              {!event.isFuture && event.pathPts !== 0 && (
                <span className="standings-events-table__mini-pts">
                  {event.pathPts > 0 ? `+${event.pathPts}` : event.pathPts}
                </span>
              )}
            </span>
          ) : (
            <span className="standings-detail__muted">—</span>
          )}
        </span>
        <span className="standings-events-table__ft">
          {event.actualScore ? `FT ${event.actualScore}` : event.isFuture ? "upcoming" : "—"}
        </span>
        <span
          className={[
            "standings-events-table__pts",
            event.totalPts > 0 && "standings-events-table__pts--hit",
            event.totalPts < 0 && "standings-events-table__pts--neg",
          ].filter(Boolean).join(" ")}
        >
          {event.isFuture
            ? "·"
            : event.totalPts !== 0
              ? (event.totalPts > 0 ? `+${event.totalPts}` : event.totalPts)
              : event.scoreDisplay || event.bracketTeam || event.pathPick
                ? "0"
                : "—"}
        </span>
      </div>
    );
  }

  return (
    <div className={[
      "standings-event",
      earned && "standings-event--earned",
      event.isFuture && "standings-event--future",
    ].filter(Boolean).join(" ")}>
      <div className="standings-event__head">
        <span className="standings-event__round">{event.roundLabel}</span>
        {event.matchNum && <span className="standings-event__num">M{event.matchNum}</span>}
        <span className="standings-event__fixture">
          {event.match.team1 && (
            <img src={flagSrc(event.match.team1.iso2, 40)} alt="" className="standings-event__flag" />
          )}
          {t1} v {t2}
          {event.match.team2 && (
            <img src={flagSrc(event.match.team2.iso2, 40)} alt="" className="standings-event__flag" />
          )}
        </span>
        {event.isFuture ? (
          <span className="standings-event__upcoming">upcoming</span>
        ) : event.totalPts > 0 ? (
          <span className="standings-event__total">+{event.totalPts}</span>
        ) : null}
      </div>
      <div className="standings-event__lines">
        {event.bracketTeam && (
          <div className="standings-event__line">
            <span className="standings-event__label">Bracket</span>
            <span className="standings-event__value">
              <img src={flagSrc(event.bracketTeam.iso2, 40)} alt="" className="standings-event__flag-sm" />
              {event.bracketTeam.code}
              {event.isFuture ? (
                <span className="standings-m-pred__pick-dot" aria-hidden="true" />
              ) : (
                <span className={event.bracketCorrect ? "standings-detail__ok" : "standings-detail__bad"}>
                  {event.bracketCorrect ? "✓" : "✕"}
                </span>
              )}
            </span>
            <span className={event.bracketPts > 0 ? "standings-event__pts standings-event__pts--hit" : "standings-event__pts"}>
              {event.isFuture ? "·" : event.bracketPts > 0 ? `+${event.bracketPts}` : "0"}
            </span>
          </div>
        )}
        <div className="standings-event__line">
          <span className="standings-event__label">Score call</span>
          <span className="standings-event__value">
            <ScoreCall
              predicted={event.scoreDisplay}
              actual={event.actualScore}
              scoreResult={event.scoreResult}
              played={!!event.actualScore}
            />
            {event.actualScore && (
              <span className="standings-detail__actual">FT {event.actualScore}</span>
            )}
          </span>
          <span className={event.scorePts > 0 ? "standings-event__pts standings-event__pts--hit" : "standings-event__pts"}>
            {event.isFuture ? "·" : event.scorePts > 0 ? `+${event.scorePts}` : event.scoreDisplay ? "0" : "—"}
          </span>
        </div>
        {event.comebackTeam && (
          <div className="standings-event__line">
            <span className="standings-event__label">Comeback</span>
            <span className="standings-event__value">
              <img src={flagSrc(event.comebackTeam.iso2, 40)} alt="" className="standings-event__flag-sm" />
              {event.comebackTeam.code}
              {event.comebackRisked && <span className="mdi mdi-fire standings-fire" title="Risked it" aria-label="Risked it" />}
              {event.isFuture ? (
                <span className="standings-m-pred__pick-dot" aria-hidden="true" />
              ) : (
                <span className={event.comebackCorrect ? "standings-detail__ok" : "standings-detail__bad"}>
                  {event.comebackCorrect ? "✓" : "✕"}
                </span>
              )}
            </span>
            <span className={event.comebackPts > 0 ? "standings-event__pts standings-event__pts--hit" : "standings-event__pts"}>
              {event.isFuture ? "·" : event.comebackPts > 0 ? `+${event.comebackPts}` : event.comebackPts < 0 ? event.comebackPts : "0"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function StandingsFriendDetail({
  friend,
  actual,
  slotMatches,
  byNum,
  onClose,
  mobile = false,
  inline = false,
  compactMobile = false,
}) {
  const allEvents = useMemo(
    () => friendPredictionList(friend, { actual, slotMatches, byNum, lockTimeMs: friend.lockedAt }),
    [friend, actual, slotMatches, byNum]
  );
  // friendPredictionList is sorted future-first (ascending) then played (descending).
  // Show the 5 most-recent past games followed by the 5 nearest upcoming games, chronologically.
  const events = useMemo(() => {
    const recentPast = allEvents.filter((e) => e.played).slice(0, 5);
    const nextFuture = allEvents.filter((e) => e.isFuture).slice(0, 5);
    return [...recentPast].reverse().concat(nextFuture);
  }, [allEvents]);
  const progress = getPickProgress(friend.winners);
  const scorePts = (friend.scorePoints ?? 0) + (friend.railScorePoints ?? 0);
  const comebackPts = friend.matchdayPoints ?? 0;
  const pathPts = friend.pathPoints ?? 0;
  const bracketPts = (friend.points ?? 0) - scorePts - comebackPts - pathPts;
  const exact = (friend.scoreExact ?? 0) + (friend.railScoreExact ?? 0);
  const oneSide = (friend.scoreOneSide ?? 0) + (friend.railScoreOneSide ?? 0);

  return (
    <div
      className={[
        "standings-detail",
        mobile && "standings-detail--sheet",
        inline && "standings-detail--inline",
        compactMobile && "standings-detail--compact-mobile",
      ].filter(Boolean).join(" ")}
    >
      {!inline && !compactMobile && (
        <div className="standings-detail__head">
          <div>
            <div className="standings-detail__name">{friend.name}</div>
            <div className="standings-detail__meta">
              {friend.locked ? `${friend.points} pts total` : `${progress.filled}/${progress.total} picks in`}
            </div>
          </div>
          {mobile && onClose && (
            <button type="button" onClick={onClose} className="standings-detail__close" aria-label="Close">
              ✕
            </button>
          )}
        </div>
      )}

      {friend.locked ? (
        (() => {
          const table = (
            <div className="standings-events-table">
              <div className="standings-events-table__head" aria-hidden="true">
                <span>Round</span>
                <span>Match</span>
                <span>Bracket pick</span>
                <span>Score call</span>
                <span>Path call</span>
                <span>Result</span>
                <span className="standings-events-table__pts-head">Pts</span>
              </div>
              {events.length === 0 ? (
                <p className="standings-detail__empty">No predictions yet.</p>
              ) : (
                events.map((event) => <EventRow key={event.id} event={event} table />)
              )}
            </div>
          );

          if (compactMobile) {
            return (
              <>
                <div className="standings-detail__breakdown">
                  <span className="standings-detail__chip">{bracketPts} brkt pts</span>
                  <span className="standings-detail__chip">{scorePts} score pts</span>
                  {(exact > 0 || oneSide > 0) && (
                    <span className="standings-detail__chip">{exact}e/{oneSide}s</span>
                  )}
                  <span
                    className={[
                      "standings-detail__chip",
                      comebackPts < 0 && "standings-detail__chip--neg",
                    ].filter(Boolean).join(" ")}
                  >
                    {comebackPts !== 0 ? (comebackPts > 0 ? `+${comebackPts}` : comebackPts) : "0"} comeback pts
                  </span>
                  <span
                    className={[
                      "standings-detail__chip",
                      pathPts > 0 && "standings-detail__chip--pos",
                      pathPts < 0 && "standings-detail__chip--neg",
                    ].filter(Boolean).join(" ")}
                  >
                    {pathPts !== 0 ? (pathPts > 0 ? `+${pathPts}` : pathPts) : "0"} path pts
                  </span>
                </div>
                <div className="standings-m-preds">
                  {events.length === 0 ? (
                    <p className="standings-detail__empty">No predictions yet.</p>
                  ) : (
                    events.map((event) => <CompactPredictionRow key={event.id} event={event} />)
                  )}
                </div>
              </>
            );
          }

          if (inline) {
            return (
              <>
                <div className="standings-detail__section-head">Last 5 &amp; upcoming 5</div>
                {table}
              </>
            );
          }

          return (
            <>
              <div className="standings-detail__section-head">Last 5 &amp; upcoming 5</div>
              <div className="standings-detail__events nice-scroll">
                {events.length === 0 ? (
                  <p className="standings-detail__empty">No predictions yet.</p>
                ) : (
                  events.map((event) => <EventRow key={event.id} event={event} />)
                )}
              </div>
            </>
          );
        })()
      ) : (
        <>
          <p className="standings-detail__open-note">
            Still filling their bracket — {progress.total - progress.filled} picks left before they can lock in.
          </p>
        </>
      )}
    </div>
  );
}
