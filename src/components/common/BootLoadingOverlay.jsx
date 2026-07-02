import { motion } from "framer-motion";

// ----------------------------------------------------------------------------
// FULL-SCREEN BOOT LOADER
// ----------------------------------------------------------------------------
export function BootLoadingOverlay({ label = "Loading" }) {
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
        <div className="relative flex flex-col items-center">
          <span className="boot-loading__ball ball-bounce">⚽</span>
          <span className="boot-loading__shadow ball-shadow" />
        </div>
        <motion.p
          animate={{ opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.6, repeat: Infinity }}
          className="boot-loading__label"
        >
          {label}
        </motion.p>
      </div>
    </motion.div>
  );
}
