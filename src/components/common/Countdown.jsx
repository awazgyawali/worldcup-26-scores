import { useEffect, useState } from "react";
import { fmtCountdown } from "../../lib/format";

export function Countdown({ to }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="mt-1 rounded-full bg-[var(--next)]/12 px-2.5 py-0.5 text-[11px] font-extrabold tabular-nums text-[var(--next)] ring-1 ring-[var(--next)]/30">
      ⏱ {fmtCountdown(to.getTime() - Date.now())}
    </span>
  );
}
