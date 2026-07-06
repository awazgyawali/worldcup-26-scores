import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= breakpoint
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}

// ----------------------------------------------------------------------------
// MODAL SHELL — pass `sheet` to render as a bottom sheet on mobile viewports.
// ----------------------------------------------------------------------------
export function Modal({ open, onClose, children, maxW = "max-w-lg", maxH = "max-h-[min(88vh,720px)]", sheet = false }) {
  const isMobile = useIsMobile();
  const asSheet = sheet && isMobile;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={[
            "fixed inset-0 z-[60] flex h-[100dvh] bg-[var(--bg-deep)]/85 backdrop-blur-md",
            asSheet ? "items-end justify-center" : "items-center justify-center p-4",
          ].join(" ")}
          onClick={onClose}
        >
          <motion.div
            initial={asSheet ? { opacity: 0, y: "100%" } : { opacity: 0, scale: 0.93, y: 20 }}
            animate={asSheet ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={asSheet ? { opacity: 0, y: "100%" } : { opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={
              asSheet
                ? "modal-sheet flex w-full max-h-[92dvh] flex-col overflow-hidden border-t border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl"
                : `flex ${maxH} w-full ${maxW} flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl`
            }
            onClick={(e) => e.stopPropagation()}
          >
            {asSheet && (
              <div className="modal-sheet__handle" aria-hidden="true">
                <span />
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Drawer({ open, onClose, children, width = "max-w-[340px]" }) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] bg-[var(--bg-deep)]/55 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`fixed inset-y-0 right-0 flex w-full ${width} flex-col overflow-hidden border-l border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
