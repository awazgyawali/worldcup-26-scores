import { Modal } from "../common/Modal";

export function SignOutConfirmModal({ open, onClose, onConfirm, signingOut }) {
  const handleConfirm = async () => {
    const ok = await onConfirm();
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={signingOut ? () => {} : onClose} maxW="max-w-sm">
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl tracking-wider text-[var(--text-primary)]">Sign out?</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            You&apos;ll need to sign back in with Google or your email and password to see your bracket again.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={signingOut}
            className="btn-ghost flex-1 rounded-xl px-4 py-3 text-sm font-bold tracking-tight disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={signingOut}
            className="flex-1 rounded-xl bg-[var(--wrong)] px-4 py-3 text-sm font-bold tracking-tight text-white transition-opacity disabled:opacity-50"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
