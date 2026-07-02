import { Modal } from "../common/Modal";

export function LockConfirmModal({ open, onClose, onConfirm, locking }) {
  const handleConfirm = async () => {
    const ok = await onConfirm();
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={locking ? () => {} : onClose} maxW="max-w-md">
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="font-display text-2xl tracking-wider text-[var(--text-primary)]">Lock your picks?</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
            Once locked, your bracket picks are final in the app. You can still add or change score predictions until each match kicks off.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={locking}
            className="btn-ghost flex-1 rounded-xl px-4 py-3 text-sm font-bold tracking-tight disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={locking}
            className="flex-1 rounded-xl bg-[var(--gold)] px-4 py-3 text-sm font-bold tracking-tight text-[var(--bg-deep)] transition-opacity disabled:opacity-50"
          >
            {locking ? "Locking…" : "Lock picks"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
