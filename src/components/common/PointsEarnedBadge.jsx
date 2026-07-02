/** Small circular badge for points earned — only after match is played */
export function PointsEarnedBadge({ points, isRail = false }) {
  if (!points || points <= 0) return null;

  return (
    <span
      className={[
        "points-earned-badge",
        isRail ? "points-earned-badge--rail" : "points-earned-badge--bracket",
        points >= 10 ? "points-earned-badge--wide" : "",
      ].join(" ")}
    >
      {points}
    </span>
  );
}
