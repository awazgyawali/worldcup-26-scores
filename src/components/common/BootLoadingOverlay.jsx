import { memo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
// ?raw inlines the full SVG into the bundle, so the animation is completely
// loaded before this overlay can render — no fetch, no partial paint.
import footballerAnimation from "../../assets/footballer-animation.svg?raw";
import playerKickAnimation from "../../assets/player-kick.svg?raw";

// ----------------------------------------------------------------------------
// FULL-SCREEN BOOT LOADER — random footballer / player-kick SMIL animations
// ----------------------------------------------------------------------------

const BOOT_ANIMATIONS = [
  {
    id: "footballer",
    svg: footballerAnimation,
    label: "Footballer kicking a ball",
    sounds: true,
    loopMs: 3203,
    kickMs: 320,
    crowdMs: null,
    aspectRatio: "1",
  },
  {
    id: "player-kick",
    svg: playerKickAnimation,
    label: "Footballer kicking a ball",
    sounds: true,
    loopMs: 2033,
    kickMs: Math.round(2033 * 0.6),
    crowdMs: null,
    aspectRatio: "1056 / 628",
  },
];

// Pick once per page load so the boot overlay never swaps mid-cycle
const bootAnimation = BOOT_ANIMATIONS[Math.floor(Math.random() * BOOT_ANIMATIONS.length)];

// App loading and the animation run in parallel; the overlay dismisses as
// soon as loading finishes, but never before the boot animation has
// played one full loop. Returns whether the overlay should be shown.
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
    const remaining = Math.max(0, bootAnimation.loopMs - elapsed);
    const timer = setTimeout(() => {
      startRef.current = null;
      setHolding(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [loading]);

  return loading || holding;
}

function useMatchSounds({ sounds, kickMs, crowdMs, loopMs }) {
  const unlockRef = useRef(() => {});

  useEffect(() => {
    if (!sounds) return;
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

    const playKick = () => {
      const run = () => {
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

      if (ctx.state === "running") {
        run();
        return;
      }
      void ctx.resume().then(() => {
        if (ctx.state === "running") run();
      });
    };

    const playCrowd = () => {
      const run = () => {
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

      if (ctx.state === "running") {
        run();
        return;
      }
      void ctx.resume().then(() => {
        if (ctx.state === "running") run();
      });
    };

    const mountedAt = performance.now();
    let timers = [];
    let interval = null;
    let started = false;

    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers = [];
    };

    const msUntil = (offsetMs) => {
      const elapsed = (performance.now() - mountedAt) % loopMs;
      const remaining = offsetMs - elapsed;
      return remaining > 0 ? remaining : remaining + loopMs;
    };

    const start = () => {
      if (started) return;
      started = true;

      const scheduleLoop = () => {
        clearTimers();
        timers.push(setTimeout(playKick, msUntil(kickMs)));
        if (crowdMs != null) timers.push(setTimeout(playCrowd, msUntil(crowdMs)));
      };

      scheduleLoop();
      interval = setInterval(scheduleLoop, loopMs);
    };

    const tryStart = () => {
      void ctx.resume().then(() => {
        if (ctx.state === "running") start();
      });
    };

    const unlock = () => tryStart();

    unlockRef.current = tryStart;

    document.addEventListener("pointerdown", unlock, { capture: true });
    document.addEventListener("keydown", unlock, { capture: true });
    document.addEventListener("touchstart", unlock, { capture: true });
    tryStart();

    return () => {
      unlockRef.current = () => {};
      if (interval) clearInterval(interval);
      clearTimers();
      document.removeEventListener("pointerdown", unlock, { capture: true });
      document.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("touchstart", unlock, { capture: true });
      if (started) ctx.close().catch(() => {});
    };
  }, [sounds, kickMs, crowdMs, loopMs]);

  return () => unlockRef.current();
}

// Memoized with no props so label changes on the overlay can never re-render
// (and thereby restart) the SMIL animation subtree
const BootAnimation = memo(function BootAnimation({ animation }) {
  const animationRef = useRef(null);

  useEffect(() => {
    // SMIL animations run on the document timeline — rewind to 0 on mount
    animationRef.current?.querySelector("svg")?.setCurrentTime?.(0);
  }, []);

  return (
    <div
      ref={animationRef}
      className="boot-loading__animation"
      style={{ aspectRatio: animation.aspectRatio }}
      role="img"
      aria-label={animation.label}
      dangerouslySetInnerHTML={{ __html: animation.svg }}
    />
  );
});

export function BootLoadingOverlay({ label = "Loading" }) {
  const unlockAudio = useMatchSounds(bootAnimation);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="boot-loading"
      aria-live="polite"
      aria-busy="true"
      onPointerDown={unlockAudio}
    >
      <div className="boot-loading__inner">
        <BootAnimation animation={bootAnimation} />
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
