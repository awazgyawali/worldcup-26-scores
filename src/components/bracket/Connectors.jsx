import { connectorStroke, connectorWidth } from "../../lib/scoring";
import { BRACKET_ROWS } from "../../lib/rounds";

// ----------------------------------------------------------------------------
// CONNECTORS — pairs of matches merge into the next round, colored by verdict.
// SVG coords always use the full BRACKET_ROWS grid so lines meet card centers.
// ----------------------------------------------------------------------------
export function Connector({ count, side = "left", verdicts, readOnly = false }) {
  const paths = [];
  const rowsPerMatch = BRACKET_ROWS / count;
  for (let i = 0; i < count; i++) {
    const y1 = (i + 0.5) * rowsPerMatch;
    const y2 = i % 2 === 0 ? (i + 1) * rowsPerMatch : i * rowsPerMatch;
    const d = side === "left" ? `M0,${y1} H50 V${y2} H100` : `M100,${y1} H50 V${y2} H0`;
    const verdict = verdicts?.[i] ?? null;
    paths.push(
      <path
        key={i}
        d={d}
        fill="none"
        strokeWidth={connectorWidth(verdict)}
        stroke={connectorStroke(verdict, readOnly)}
        vectorEffect="non-scaling-stroke"
        style={{ transition: "stroke 0.4s ease, stroke-width 0.4s ease" }}
      />
    );
  }
  return (
    <div className="bracket-connector">
      <svg width="100%" height="100%" viewBox={`0 0 100 ${BRACKET_ROWS}`} preserveAspectRatio="none" className="block h-full w-full">
        {paths}
      </svg>
    </div>
  );
}

/** Semi-final → final connector. The final card is centered in the podium (50%),
 *  so a straight horizontal line lands on it. Third place is connected by its own
 *  short connector rendered next to the card (see ThirdPlaceConnector). */
export function SFPodiumConnector({ side = "left", finalVerdict, readOnly = false }) {
  const y = BRACKET_ROWS / 2;
  const finalPath = side === "left" ? `M0,${y} H100` : `M100,${y} H0`;
  return (
    <div className="bracket-sf-connector">
      <svg width="100%" height="100%" viewBox={`0 0 100 ${BRACKET_ROWS}`} preserveAspectRatio="none" className="block h-full w-full">
        <path
          d={finalPath}
          fill="none"
          strokeWidth={connectorWidth(finalVerdict)}
          stroke={connectorStroke(finalVerdict, readOnly)}
          vectorEffect="non-scaling-stroke"
          style={{ transition: "stroke 0.4s ease, stroke-width 0.4s ease" }}
        />
      </svg>
    </div>
  );
}

export function bracketHighlightFor(rk, { guidanceKey, liveKey, nextKey }) {
  if (guidanceKey && rk === guidanceKey) return "guide";
  if (liveKey && rk === liveKey) return "live";
  if (nextKey && rk === nextKey) return "next";
  return null;
}

export function BracketGuideLabel() {
  return <p className="bracket-guide-label">Select your winner</p>;
}
