import { useState } from "react";
import { Modal } from "../common/Modal";
import { IconGoogle } from "../common/icons";

// ----------------------------------------------------------------------------
// NAME MODAL — onboarding
// ----------------------------------------------------------------------------
export function NameModal({ onSubmit, onConnectGoogle, linkingGoogle }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showRules, setShowRules] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const ok = await onSubmit(trimmed);
      if (!ok) setError("Something went wrong — try again");
    } catch {
      setError("Could not connect — check your network and try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result = await onConnectGoogle({ submitNameAfter: true });
      if (result?.cancelled) return;
      if (result?.needsManualName) {
        setError("Google didn't provide a name — enter one below to continue anonymously");
        return;
      }
      if (!result?.success) setError("Something went wrong — try again");
    } catch {
      setError("Could not connect with Google — try again or enter your name");
    } finally {
      setSubmitting(false);
    }
  };

  const busy = submitting || linkingGoogle;

  return (
    <Modal open onClose={() => {}} maxW="max-w-md">
      <div className="flex max-h-[80vh] flex-col">
        {/* Header */}
        <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <div>
              <h2 className="font-display text-xl tracking-wider text-[var(--text-primary)]">WC26 Predictor</h2>
              <p className="text-xs text-[var(--text-muted)]">World Cup 2026 Bracket Challenge</p>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!showRules ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/30 p-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Welcome! Sign in with Google to save your profile, or enter a name to play anonymously.
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--border-strong)] bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-opacity hover:bg-gray-50 disabled:opacity-50"
              >
                <IconGoogle className="h-5 w-5" />
                {linkingGoogle ? "Connecting…" : "Continue with Google"}
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--border)]" />
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">or</span>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Your Name <span className="normal-case font-normal text-[var(--text-muted)]">(anonymous)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={40}
                  className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--pitch-glow)]/50"
                />
              </div>

              {error && <p className="text-xs font-semibold text-[var(--live)]">{error}</p>}

              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="rounded-xl bg-[var(--pitch)] px-4 py-3 text-sm font-bold tracking-tight text-white transition-opacity disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Continue Anonymously"}
              </button>

              <button
                type="button"
                onClick={() => setShowRules(true)}
                className="text-xs font-semibold text-[var(--gold-bright)] hover:underline"
              >
                📖 How it works & Points
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                ← Back
              </button>

              <div className="space-y-3">
                <h3 className="font-display text-lg text-[var(--gold-bright)]">How to Play</h3>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-bold text-[var(--pitch-glow)]">1. FILL YOUR BRACKET</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Click teams to advance them. Complete all 32 picks (R32 → Final + 3rd place).
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-bold text-[var(--pitch-glow)]">2. LOCK WHEN READY</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    You can lock anytime. After locking, bracket picks are final!
                  </p>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <p className="text-xs font-bold text-[var(--pitch-glow)]">3. PREDICT SCORES</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Click matches in the bottom bar to predict 90-min scores. Works even AFTER locking!
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display text-lg text-[var(--gold-bright)]">Point System</h3>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">R32 correct</span>
                    <span className="float-right font-bold">1 pt</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">R16 correct</span>
                    <span className="float-right font-bold">2 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">QF correct</span>
                    <span className="float-right font-bold">4 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">SF correct</span>
                    <span className="float-right font-bold">7 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">3rd place</span>
                    <span className="float-right font-bold">3 pts</span>
                  </div>
                  <div className="rounded bg-[var(--bg-elevated)] p-2">
                    <span className="text-[var(--pitch-glow)]">Final</span>
                    <span className="float-right font-bold">12 pts</span>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/10 p-3">
                  <p className="text-xs font-bold text-[var(--gold-bright)]">SCORE PREDICTIONS (real matches)</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    On actual fixtures in the bottom bar — separate from bracket picks:<br />
                    One side correct = <span className="font-bold text-[var(--gold-bright)]">2 pts</span><br />
                    Exact score (both sides) = <span className="font-bold text-[var(--gold-bright)]">5 pts</span>
                  </p>
                </div>

                <div className="rounded bg-[var(--bg-elevated)] p-2 text-xs">
                  <span className="text-[var(--text-muted)]">Group stage (rail)</span>
                  <span className="float-right font-bold text-[var(--pitch-glow)]">1 pt per correct</span>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-mid)]/30 p-3">
                <p className="text-xs font-semibold text-[var(--text-primary)]">⚠️ Key Rules:</p>
                <ul className="mt-1 space-y-1 text-xs text-[var(--text-secondary)]">
                  <li>• Score predictions work until kickoff (lock doesn&apos;t matter)</li>
                  <li>• Score points are based on the real result, not bracket picks</li>
                  <li>• Group games in bottom bar = 1 point per correct winner pick</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="rounded-xl bg-[var(--pitch)] px-4 py-2 text-sm font-bold text-white"
              >
                Got it! Start Playing 🚀
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
