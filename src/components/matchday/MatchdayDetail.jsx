import { useEffect, useMemo, useState } from "react";
import {
  friendScorePredictionsForMatch,
  friendsMissingScorePredictionForMatch,
  getScorePrediction,
  gradeScorePrediction,
  mapPredictedScores,
  SCORE_ONE_SIDE_POINTS,
  SCORE_EXACT_POINTS,
} from "../../lib/scoring";
import { fmtKickoff, flagSrc, liveMinute } from "../../lib/format";
import { Countdown } from "../common/Countdown";

function initials(name) {
  return name.trim().slice(0, 2).toUpperCase();
}

function ScoreNumbers({ a, b, ftScore, graded }) {
  if (a == null || b == null) return <span className="score-pred score-pred--empty">—</span>;
  if (!graded || !ftScore) {
    return (
      <span className="score-pred score-pred--predicted">
        {a}–{b}
      </span>
    );
  }
  const aOk = a === ftScore[0];
  const bOk = b === ftScore[1];
  return (
    <span className="score-pred score-pred--graded">
      <span className={aOk ? "score-pred--hit" : "score-pred--miss"}>{a}</span>
      <span className="score-pred__dash">–</span>
      <span className={bOk ? "score-pred--hit" : "score-pred--miss"}>{b}</span>
    </span>
  );
}

export function MatchdayDetail({
  match,
  winners,
  numToSlot,
  friends = [],
  selfUid,
  onFlagClick,
  onSaveScorePrediction,
  mobile = false,
}) {
  const slotKey = match ? (match.isKnockout ? numToSlot?.get(match.num) : `rail-${match.num}`) : null;
  const scorePrediction = slotKey ? getScorePrediction(winners, slotKey) : null;

  const otherPredictions = useMemo(
    () => (match ? friendScorePredictionsForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );
  const missingPredictions = useMemo(
    () => (match ? friendsMissingScorePredictionForMatch(friends, slotKey, match, selfUid) : []),
    [friends, slotKey, match, selfUid]
  );

  const [scoreA, setScoreA] = useState(scorePrediction?.[0] ?? "");
  const [scoreB, setScoreB] = useState(scorePrediction?.[1] ?? "");

  useEffect(() => {
    setScoreA(scorePrediction?.[0] ?? "");
    setScoreB(scorePrediction?.[1] ?? "");
  }, [scorePrediction?.[0], scorePrediction?.[1], match?.num]);

  if (!match) return null;

  const played = match.status === "played";
  const live = match.status === "live";
  const kickoffPassed = !!match.kickoff && Date.now() >= match.kickoff.getTime();
  const upcoming = match.status === "upcoming" && !kickoffPassed;
  const canEditScore = upcoming && !!onSaveScorePrediction && !!slotKey;
  const teamsConfirmed = !!match.team1 && !!match.team2;

  const handleSaveScore = async () => {
    const sA = parseInt(scoreA, 10);
    const sB = parseInt(scoreB, 10);
    if (!isNaN(sA) && !isNaN(sB) && sA >= 0 && sB >= 0) {
      await onSaveScorePrediction?.(slotKey, [sA, sB], match);
    }
  };

  const [yourA, yourB] = mapPredictedScores(scorePrediction, match.team1, match.team2, match);
  const yourPoints =
    played && scorePrediction && match.ftScore
      ? gradeScorePrediction(scorePrediction, match.ftScore).scorePoints
      : 0;

  const bracketPickId = match.isKnockout && slotKey && !slotKey.startsWith("rail-") ? winners?.[slotKey] : null;
  const bracketPickTeam =
    bracketPickId === match.team1?.id ? match.team1 : bracketPickId === match.team2?.id ? match.team2 : null;

  const venueShort = match.ground?.includes("(")
    ? match.ground.split("(").pop()?.replace(")", "").trim() ?? match.ground
    : match.ground;

  return (
    <div className={["md-detail", mobile && "md-detail--mobile"].filter(Boolean).join(" ")}>
      <div className="md-detail__head">
        <span className="md-detail__round">{(match.group || match.roundLabel || "").toUpperCase()}</span>
        {match.num && <span className="md-detail__num">Match {match.num}</span>}
      </div>

      {mobile ? (
        <div className="md-hero md-hero--mobile">
          <div className="md-hero__col">
            {match.team1 && (
              <button type="button" onClick={() => onFlagClick?.(match.team1)} className="md-hero__flag-btn">
                <img src={flagSrc(match.team1.iso2, 80)} alt="" className="md-hero__flag-lg" />
              </button>
            )}
            <div className="md-hero__name">{match.team1?.name ?? "TBD"}</div>
            <div className="md-hero__code">{match.team1?.code ?? "TBD"}</div>
          </div>
          <div className="md-hero__mid">
            {match.score ? (
              <div className="md-hero__score">{match.score[0]}–{match.score[1]}</div>
            ) : (
              <>
                <div className="md-hero__vs">VS</div>
                {live && (
                  <span className="md-hero__live">
                    <span className="live-dot" /> {liveMinute(match.kickoff)}
                  </span>
                )}
                {upcoming && match.kickoff && <Countdown to={match.kickoff} />}
              </>
            )}
          </div>
          <div className="md-hero__col">
            {match.team2 && (
              <button type="button" onClick={() => onFlagClick?.(match.team2)} className="md-hero__flag-btn">
                <img src={flagSrc(match.team2.iso2, 80)} alt="" className="md-hero__flag-lg" />
              </button>
            )}
            <div className="md-hero__name">{match.team2?.name ?? "TBD"}</div>
            <div className="md-hero__code">{match.team2?.code ?? "TBD"}</div>
          </div>
        </div>
      ) : (
        <div className="md-hero md-hero--desktop">
          <div className="md-hero__side md-hero__side--left">
            <div className="md-hero__name-lg">{match.team1?.name ?? "TBD"}</div>
            <div className="md-hero__code">{match.team1?.code ?? "TBD"}</div>
          </div>
          {match.team1 && (
            <button type="button" onClick={() => onFlagClick?.(match.team1)} className="md-hero__flag-btn">
              <img src={flagSrc(match.team1.iso2, 80)} alt="" className="md-hero__flag-xl" />
            </button>
          )}
          <div className="md-hero__mid">
            {match.score ? (
              <div className="md-hero__score-lg">{match.score[0]}–{match.score[1]}</div>
            ) : (
              <>
                <div className="md-hero__vs-lg">VS</div>
                {live && (
                  <span className="md-hero__live">
                    <span className="live-dot" /> {liveMinute(match.kickoff)}
                  </span>
                )}
                {upcoming && match.kickoff && <Countdown to={match.kickoff} />}
              </>
            )}
          </div>
          {match.team2 && (
            <button type="button" onClick={() => onFlagClick?.(match.team2)} className="md-hero__flag-btn">
              <img src={flagSrc(match.team2.iso2, 80)} alt="" className="md-hero__flag-xl" />
            </button>
          )}
          <div className="md-hero__side">
            <div className="md-hero__name-lg">{match.team2?.name ?? "TBD"}</div>
            <div className="md-hero__code">{match.team2?.code ?? "TBD"}</div>
          </div>
        </div>
      )}

      <div className="md-detail__panels">
        <div className="md-panel md-panel--match">
          <div className="md-panel__label">Match</div>
          {mobile ? (
            <div className="md-panel__meta-box">
              {match.kickoff && <div>🕐 {fmtKickoff(match.kickoff)}</div>}
              {venueShort && <div>📍 {venueShort}</div>}
              {bracketPickTeam && (
                <div className="md-panel__pick-line">
                  Your bracket pick:{" "}
                  <span>
                    <img src={flagSrc(bracketPickTeam.iso2, 40)} alt="" />
                    {bracketPickTeam.code}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <>
              {match.kickoff && <div className="md-panel__line">🕐 {fmtKickoff(match.kickoff)}</div>}
              {match.ground && <div className="md-panel__line">📍 {match.ground}</div>}
              <div className="md-panel__divider" />
              {bracketPickTeam && (
                <div className="md-panel__pick-line">
                  Your bracket pick:{" "}
                  <span>
                    <img src={flagSrc(bracketPickTeam.iso2, 40)} alt="" />
                    {bracketPickTeam.code}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {teamsConfirmed && (
          <div className="md-panel md-panel--calls">
            <div className="md-panel__calls-head">
              <span className="md-panel__label">Score calls</span>
              <span className="md-panel__hint">
                {mobile ? "side +2 · exact +5" : `one side +${SCORE_ONE_SIDE_POINTS} · exact +${SCORE_EXACT_POINTS}`}
              </span>
            </div>

            <div className="md-calls-list">
              <div
                className={[
                  "md-call-item",
                  canEditScore && "md-call-item--you",
                  played && yourPoints === SCORE_EXACT_POINTS && "md-call-item--exact",
                ].filter(Boolean).join(" ")}
              >
                <span className={canEditScore ? "md-call-item__avatar md-call-item__avatar--you" : "md-call-item__avatar"}>
                  {canEditScore ? "You" : "Yo"}
                </span>
                <span className="md-call-item__name">You</span>
                {canEditScore ? (
                  <>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={scoreA}
                      onChange={(e) => setScoreA(e.target.value)}
                      className="md-you-row__input"
                      aria-label={`${match.team1?.code} score`}
                    />
                    <span className="md-you-row__dash">–</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={scoreB}
                      onChange={(e) => setScoreB(e.target.value)}
                      className="md-you-row__input"
                      aria-label={`${match.team2?.code} score`}
                    />
                    <button type="button" onClick={handleSaveScore} className="md-you-row__save" aria-label="Save">
                      ✓
                    </button>
                  </>
                ) : (
                  <>
                    <span className="md-call-item__score">
                      <ScoreNumbers a={yourA} b={yourB} ftScore={match.ftScore ?? match.score} graded={played} />
                    </span>
                    {played && (
                      <span className={["md-call-item__pts", yourPoints > 0 && "md-call-item__pts--hit"].filter(Boolean).join(" ")}>
                        {yourPoints > 0 ? `+${yourPoints}` : yourA != null ? "0" : "—"}
                      </span>
                    )}
                  </>
                )}
              </div>

              {otherPredictions.map((entry) => (
                <div key={entry.uid} className="md-call-item">
                  <span className="md-call-item__avatar">{initials(entry.name)}</span>
                  <span className="md-call-item__name">{entry.name}</span>
                  <span className="md-call-item__score">
                    <ScoreNumbers a={entry.home} b={entry.away} ftScore={match.ftScore ?? match.score} graded={played} />
                  </span>
                </div>
              ))}
            </div>

            {missingPredictions.length > 0 && (
              <div className="md-missing">
                <div className="md-missing__label">
                  Haven&apos;t called it yet ({missingPredictions.length})
                </div>
                <div className="md-missing__names">{missingPredictions.map((f) => f.name).join(", ")}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
