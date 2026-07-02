import { connectorStroke, connectorWidth } from "../../lib/scoring";

// ----------------------------------------------------------------------------
// CONNECTORS — pairs of matches merge into the next round.
// ----------------------------------------------------------------------------
export function Connector({ count, side = "left", verdicts, readOnly = false }) {
  const paths = [];
  for (let i = 0; i < count; i++) {
    const y1 = i + 0.5;
    const y2 = i % 2 === 0 ? i + 1 : i;
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
    <div className="shrink-0 self-stretch" style={{ width: 28 }}>
      <svg width="100%" height="100%" viewBox={`0 0 100 ${count}`} preserveAspectRatio="none" className="block h-full w-full">
        {paths}
      </svg>
    </div>
  );
}

/** Semi-final → final (center) + third-place (below) in one symmetric connector. */
export function SFPodiumConnector({ side = "left", finalVerdict, thirdVerdict, readOnly = false }) {
  const finalY = 50;
  const thirdY = 76;
  const branchX = 42;
  const finalPath = side === "left" ? `M0,${finalY} H100` : `M100,${finalY} H0`;
  const thirdPath =
    side === "left"
      ? `M${branchX},${finalY} V${thirdY} H100`
      : `M${100 - branchX},${finalY} V${thirdY} H0`;
  const strokeProps = (verdict) => ({
    fill: "none",
    strokeWidth: connectorWidth(verdict),
    stroke: connectorStroke(verdict, readOnly),
    vectorEffect: "non-scaling-stroke",
    style: { transition: "stroke 0.4s ease, stroke-width 0.4s ease" },
  });

  return (
    <div className="bracket-sf-connector shrink-0 self-stretch">
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="block h-full w-full">
        <path d={finalPath} {...strokeProps(finalVerdict)} />
        <path d={thirdPath} {...strokeProps(thirdVerdict)} />
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
