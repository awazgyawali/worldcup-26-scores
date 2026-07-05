import { useEffect, useState } from "react";
import { fmtCountdown } from "../../lib/format";

export function Countdown({ to }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="md-countdown">
      ⏱ {fmtCountdown(to.getTime() - Date.now())}
    </span>
  );
}
