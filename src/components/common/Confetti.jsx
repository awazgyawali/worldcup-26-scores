import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";

// ----------------------------------------------------------------------------
// CONFETTI
// ----------------------------------------------------------------------------
export function Confetti({ fire }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.7,
        dur: 2.2 + Math.random() * 2,
        rot: Math.random() * 720,
        size: 5 + Math.random() * 8,
        color: ["#4ade80", "#f5cd6e", "#38bdf8", "#f472b6", "#f2eee6", "#d4a84b"][i % 6],
      })),
    []
  );
  return (
    <AnimatePresence>
      {fire && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {pieces.map((p) => (
            <motion.span
              key={p.id}
              initial={{ y: -40, x: `${p.x}vw`, rotate: 0, opacity: 1 }}
              animate={{ y: "110vh", rotate: p.rot + 540, opacity: [1, 1, 0.9, 0] }}
              transition={{ duration: p.dur, delay: p.delay, ease: "easeIn" }}
              style={{ position: "absolute", width: p.size, height: p.size * 0.6, background: p.color, borderRadius: 2 }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
