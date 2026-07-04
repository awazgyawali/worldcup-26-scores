import { useState } from "react";
import { IconGoogle, IconMail } from "../common/icons";

// ----------------------------------------------------------------------------
// LOGIN PAGE — dedicated full-screen onboarding gate (not a dismissible modal)
// ----------------------------------------------------------------------------
export function LoginPage({
  onSubmit,
  onConnectGoogle,
  onSignInEmail,
  onSignUpEmail,
  onResetPassword,
  linkingGoogle,
}) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "reset" | "name" | "rules"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const busy = submitting || linkingGoogle;

  const resetMessages = () => {
    setError("");
    setInfo("");
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!email.trim() || !password) {
      setError("Enter your email and password");
      return;
    }
    setSubmitting(true);
    try {
      const result =
        mode === "signup"
          ? await onSignUpEmail(email.trim(), password, name)
          : await onSignInEmail(email.trim(), password);
      if (result?.needsManualName) {
        setMode("name");
        setError("Add a display name to finish setting up your account");
        return;
      }
      if (!result?.success) setError(result?.error || "Something went wrong — try again");
    } catch {
      setError("Could not connect — check your network and try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!email.trim()) {
      setError("Enter your email to reset your password");
      return;
    }
    setSubmitting(true);
    try {
      const result = await onResetPassword(email.trim());
      if (result?.success) {
        setInfo("Password reset email sent — check your inbox.");
      } else {
        setError(result?.error || "Could not send reset email");
      }
    } catch {
      setError("Could not send reset email — try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    resetMessages();
    setSubmitting(true);
    try {
      const result = await onConnectGoogle({ submitNameAfter: true });
      if (result?.cancelled) return;
      if (result?.needsManualName) {
        setMode("name");
        setError("Google didn't provide a name — enter one below to continue");
        return;
      }
      if (!result?.success) setError("Something went wrong — try again");
    } catch {
      setError("Could not connect with Google — try again or use email");
    } finally {
      setSubmitting(false);
    }
  };

  const handleName = async (e) => {
    e.preventDefault();
    resetMessages();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter your name");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onSubmit(trimmed);
      if (!ok) setError("Something went wrong — try again");
    } catch {
      setError("Could not connect — check your network and try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__card">
        {/* Header */}
        <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <div>
              <h2 className="font-display text-xl tracking-wider text-[var(--text-primary)]">2xBet by Aawaz</h2>
              <p className="text-xs text-[var(--text-muted)]">World Cup 2026 Bracket Challenge</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {mode === "rules" ? (
            <RulesPanel onBack={() => setMode("signin")} />
          ) : (
            <>
              {mode !== "name" && (
                <div className="mb-4 flex rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/30 p-1">
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); resetMessages(); }}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                      mode === "signin" ? "bg-[var(--pitch)] text-white" : "text-[var(--text-muted)]"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("signup"); resetMessages(); }}
                    className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                      mode === "signup" ? "bg-[var(--pitch)] text-white" : "text-[var(--text-muted)]"
                    }`}
                  >
                    Sign Up
                  </button>
                </div>
              )}

              {(mode === "signin" || mode === "signup") && (
                <form onSubmit={handleEmailAuth} className="flex flex-col gap-3">
                  {mode === "signup" && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        maxLength={40}
                        className="login-input"
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="login-input"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      className="login-input"
                    />
                  </div>

                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => { setMode("reset"); resetMessages(); }}
                      className="self-end text-xs font-semibold text-[var(--gold-bright)] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}

                  {error && <p className="text-xs font-semibold text-[var(--live)]">{error}</p>}
                  {info && <p className="text-xs font-semibold text-[var(--pitch-glow)]">{info}</p>}

                  <button
                    type="submit"
                    disabled={busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--pitch)] px-4 py-3 text-sm font-bold tracking-tight text-white transition-opacity disabled:opacity-50"
                  >
                    <IconMail className="h-4 w-4" />
                    {submitting ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">or</span>
                    <div className="h-px flex-1 bg-[var(--border)]" />
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

                  <button
                    type="button"
                    onClick={() => setMode("rules")}
                    className="text-xs font-semibold text-[var(--gold-bright)] hover:underline"
                  >
                    📖 How it works & Points
                  </button>
                </form>
              )}

              {mode === "reset" && (
                <form onSubmit={handleReset} className="flex flex-col gap-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    Enter your account email and we&apos;ll send you a link to reset your password.
                  </p>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="login-input"
                    />
                  </div>

                  {error && <p className="text-xs font-semibold text-[var(--live)]">{error}</p>}
                  {info && <p className="text-xs font-semibold text-[var(--pitch-glow)]">{info}</p>}

                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-[var(--pitch)] px-4 py-3 text-sm font-bold tracking-tight text-white transition-opacity disabled:opacity-50"
                  >
                    {submitting ? "Sending…" : "Send Reset Link"}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMode("signin"); resetMessages(); }}
                    className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    ← Back to sign in
                  </button>
                </form>
              )}

              {mode === "name" && (
                <form onSubmit={handleName} className="flex flex-col gap-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-mid)]/30 p-4">
                    <p className="text-sm text-[var(--text-secondary)]">
                      Your account is signed in — just add a display name to finish setting up.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your name"
                      maxLength={40}
                      className="login-input"
                    />
                  </div>

                  {error && <p className="text-xs font-semibold text-[var(--live)]">{error}</p>}

                  <button
                    type="submit"
                    disabled={busy || !name.trim()}
                    className="rounded-xl bg-[var(--pitch)] px-4 py-3 text-sm font-bold tracking-tight text-white transition-opacity disabled:opacity-50"
                  >
                    {submitting ? "Saving…" : "Continue"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RulesPanel({ onBack }) {
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
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
        onClick={onBack}
        className="rounded-xl bg-[var(--pitch)] px-4 py-2 text-sm font-bold text-white"
      >
        Got it! Start Playing 🚀
      </button>
    </div>
  );
}
