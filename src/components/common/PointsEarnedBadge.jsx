/** Small gold oval badge for points earned — only after match is played */
export function PointsEarnedBadge({ points, isRail = false }) {
  if (!points || points <= 0) return null;

  return (
    <span
      className={[
        "points-earned-badge",
        "points-earned-badge--wide",
        isRail ? "points-earned-badge--rail" : "points-earned-badge--bracket",
      ].join(" ")}
    >
      +{points}
    </span>
  );
}
