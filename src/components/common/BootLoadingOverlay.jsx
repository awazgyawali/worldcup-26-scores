import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
// ?raw inlines the full SVG into the bundle, so the animation is completely
// loaded before this overlay can render — no fetch, no partial paint.
import footballerAnimation from "../../assets/footballer-animation.svg?raw";

// ----------------------------------------------------------------------------
// FULL-SCREEN BOOT LOADER — footballer kick animation + match sounds
// ----------------------------------------------------------------------------

// The SMIL animations in the SVG loop every 3.203s
const LOOP_MS = 3203;
const KICK_MS = LOOP_MS * 0.1;
const GOAL_MS = LOOP_MS * 0.5;

// App loading and the animation run in parallel; the overlay dismisses as
// soon as loading finishes, but never before the footballer animation has
// played one full 3.203s loop. Returns whether the overlay should be shown.
export function useBootCycleHold(loading) {
  const [holding, setHolding] = useState(loading);
  const startRef = useRef(null);
  if (loading && startRef.current === null) startRef.current = performance.now();

  useEffect(() => {
    if (loading) {
      setHolding(true);
      return;
    }
    if (startRef.current === null) {
      setHolding(false);
      return;
    }
    const elapsed = performance.now() - startRef.current;
    const remaining = Math.max(0, LOOP_MS - elapsed);
    const timer = setTimeout(() => {
      startRef.current = null;
      setHolding(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading]);

  return loading || holding;
}

function useMatchSounds() {
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    let ctx;
    try {
      ctx = new AudioCtx();
    } catch {
      return;
    }

    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);

    const thump = () => {
      if (ctx.state !== "running") return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(170, t);
      osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.9, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + 0.16);
    };

    const crowdRoar = () => {
      if (ctx.state !== "running") return;
      const t = ctx.currentTime;
      const dur = 0.9;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.5;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.55, t + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(gain).connect(master);
      src.start(t);
      src.stop(t + dur);
    };

    // Autoplay policy keeps the context suspended until a user gesture
    const unlock = () => ctx.resume().catch(() => {});
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    unlock();

    let timers = [];
    const scheduleLoop = () => {
      timers = [setTimeout(thump, KICK_MS), setTimeout(crowdRoar, GOAL_MS)];
    };
    scheduleLoop();
    const interval = setInterval(scheduleLoop, LOOP_MS);

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      ctx.close().catch(() => {});
    };
  }, []);
}

// Memoized with no props so label changes on the overlay can never re-render
// (and thereby restart) the SMIL animation subtree
const FootballerAnimation = memo(function FootballerAnimation() {
  // SMIL animations run on the document timeline, so the loop could start
  // mid-cycle — rewind to 0 on mount so cycle-hold and sounds stay in sync
  const animationRef = useRef(null);
  useEffect(() => {
    animationRef.current?.querySelector("svg")?.setCurrentTime?.(0);
  }, []);

  return (
    <div
      ref={animationRef}
      className="boot-loading__animation"
      role="img"
      aria-label="Footballer kicking a ball"
      dangerouslySetInnerHTML={{ __html: footballerAnimation }}
    />
  );
});

export function BootLoadingOverlay({ label = "Loading" }) {
  useMatchSounds();

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="boot-loading"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="boot-loading__inner">
        <FootballerAnimation />
        <motion.p
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="boot-loading__label"
        >
          {label}
          <span className="boot-loading__dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </motion.p>
      </div>
    </motion.div>
  );
}
