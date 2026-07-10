import { useState } from "react";
import { IconGoogle, IconMail, BrandBadge } from "../common/icons";
import { ROUNDS, THIRD_PLACE, SCORE_EXACT_POINTS_BY_ROUND } from "../../lib/rounds";
import { SCORE_ONE_SIDE_POINTS } from "../../lib/scoring";

function fmtPts(n) {
  return n === 1 ? "1 pt" : `${n} pts`;
}

const SCORE_TILES = [
  {
    key: "oneside",
    label: "One side",
    desc: "Either team's score",
    points: SCORE_ONE_SIDE_POINTS,
  },
];

/** Exact-score bonus scales with round, same shape as bracket pick rows. */
const EXACT_SCORE_ROWS = [
  ...ROUNDS.filter((r) => r.key !== "final").map((r) => ({
    label: `${r.short} exact`,
    points: SCORE_EXACT_POINTS_BY_ROUND[r.key],
  })),
  { label: "3rd place exact", points: SCORE_EXACT_POINTS_BY_ROUND.third },
  { label: "Final exact", points: SCORE_EXACT_POINTS_BY_ROUND.final, highlight: true },
];

function BrandPanel({ onShowRules, scoringRows, scoreTiles = SCORE_TILES }) {
  return (
    <div className="login-brand">
      <div className="flex items-center gap-3">
        <BrandBadge className="h-10 w-10 text-base" />
        <h2 className="font-display text-lg tracking-wider text-white">
          2XBET <span className="text-white/45 font-semibold">by Aawaz</span>
        </h2>
      </div>

      <div className="login-brand__tagline">
        <h1>Call every game.<br />Outscore your friends.</h1>
        <p>
          Pick the full World Cup 2026 bracket, then call exact scores match by match.
          The trophy is bragging rights.
        </p>
      </div>

      <div className="login-brand__scoring">
        <p className="login-brand__scoring-title">Bracket picks</p>
        <div className="login-brand__scoring-grid">
          {scoringRows.map((row) => (
            <div
              key={row.label}
              className={["login-brand__scoring-row", row.highlight && "login-brand__scoring-row--highlight"].filter(Boolean).join(" ")}
            >
              <span>{row.label}</span>
              <span className="login-brand__scoring-pts">{row.points}</span>
            </div>
          ))}
        </div>

        <p className="login-brand__scoring-title login-brand__scoring-title--score">Score calls · per match</p>
        <div className="login-brand__score-tiles">
          {scoreTiles.map((tile) => (
            <div
              key={tile.key}
              className={["login-brand__score-tile", tile.featured && "login-brand__score-tile--featured"].filter(Boolean).join(" ")}
            >
              <span className="login-brand__score-tile-pts">+{tile.points}</span>
              <span className="login-brand__score-tile-label">{tile.label}</span>
              <span className="login-brand__score-tile-desc">{tile.desc}</span>
            </div>
          ))}
        </div>

        <p className="login-brand__scoring-title login-brand__scoring-title--score">Both sides (exact) · by round</p>
        <div className="login-brand__scoring-grid">
          {EXACT_SCORE_ROWS.map((row) => (
            <div
              key={row.label}
              className={["login-brand__scoring-row", row.highlight && "login-brand__scoring-row--highlight"].filter(Boolean).join(" ")}
            >
              <span>{row.label}</span>
              <span className="login-brand__scoring-pts">{row.points}</span>
            </div>
          ))}
        </div>
      </div>

      <button type="button" onClick={onShowRules} className="login-brand__rules">
        Read the full rules — how it works &amp; points
      </button>
    </div>
  );
}

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

  const scoringRows = [
    ...ROUNDS.filter((r) => r.key !== "final").map((r) => ({ label: `${r.label} pick`, points: r.points })),
    { label: THIRD_PLACE.label, points: THIRD_PLACE.points },
    { label: "Champion", points: ROUNDS.find((r) => r.key === "final").points, highlight: true },
  ];

  const mobilePoints = [
    { label: "Round of 16", val: ROUNDS.find((r) => r.key === "r16")?.points ?? 10 },
    { label: "Champion", val: ROUNDS.find((r) => r.key === "final")?.points ?? 60 },
    { label: "One side", val: SCORE_ONE_SIDE_POINTS },
    { label: "Final exact", val: SCORE_EXACT_POINTS_BY_ROUND.final },
  ];

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

  if (mode === "rules") {
    return (
      <div className="login-page">
        <div className="login-page__card login-page__card--rules">
          <div className="login-page__card-header border-b border-[var(--border)] bg-[var(--bg-elevated)] px-6 py-4">
            <div className="flex items-center gap-3">
              <BrandBadge className="h-9 w-9 text-sm" />
              <div>
                <h2 className="font-display text-xl tracking-wider text-[var(--text-primary)]">2XBET by Aawaz</h2>
                <p className="text-xs text-[var(--text-muted)]">World Cup 2026 Bracket Challenge</p>
              </div>
            </div>
          </div>
          <div className="login-page__card-body nice-scroll">
            <RulesPanel onBack={() => setMode("signin")} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-split">
        <BrandPanel onShowRules={() => setMode("rules")} scoringRows={scoringRows} mobilePoints={mobilePoints} />

        <div className="login-auth">
          <div className="login-auth__inner">
            <div className="login-auth__brand-row">
              <BrandBadge className="h-9 w-9 text-sm" />
              <span className="text-lg font-extrabold tracking-tight text-white">2XBET</span>
            </div>

            <div className="login-mobile-hero">
              <h1>Call every game. Outscore your friends.</h1>
              <p>Pick the World Cup 2026 bracket, then call exact scores match by match.</p>
            </div>

            <>
              <div className="login-auth__intro">
                <h2 className="text-[1.625rem] font-extrabold tracking-tight text-[var(--text-primary)]">Get in the game</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                  Sign in with Google or email to save your bracket and join the leaderboard.
                </p>
              </div>
              {mode !== "name" && (
                <div className="login-tab-toggle">
                  <button
                    type="button"
                    onClick={() => { setMode("signin"); resetMessages(); }}
                    className={["login-tab-toggle__btn", mode === "signin" && "login-tab-toggle__btn--active"].filter(Boolean).join(" ")}
                  >
                    SIGN IN
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("signup"); resetMessages(); }}
                    className={["login-tab-toggle__btn", mode === "signup" && "login-tab-toggle__btn--active"].filter(Boolean).join(" ")}
                  >
                    SIGN UP
                  </button>
                </div>
              )}

              {(mode === "signin" || mode === "signup") && (
                <form onSubmit={handleEmailAuth} className="mt-6 flex flex-col gap-4">
                  {mode === "signup" && (
                    <div>
                      <label className="login-field-label">Display Name</label>
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
                    <label className="login-field-label">Email</label>
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
                    <label className="login-field-label">Password</label>
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
                      className="self-end text-sm font-semibold text-[var(--pitch-glow)] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}

                  {error && <p className="text-xs font-semibold text-[var(--live)]">{error}</p>}
                  {info && <p className="text-xs font-semibold text-[var(--pitch-glow)]">{info}</p>}

                  <button type="submit" disabled={busy} className="login-btn-primary">
                    <IconMail className="h-4 w-4" />
                    {submitting ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-[var(--border)]" />
                    <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">or</span>
                    <div className="h-px flex-1 bg-[var(--border)]" />
                  </div>

                  <button type="button" onClick={handleGoogle} disabled={busy} className="login-btn-google">
                    <IconGoogle className="h-5 w-5" />
                    {linkingGoogle ? "Connecting…" : "Continue with Google"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("rules")}
                    className="text-center text-sm font-semibold text-[var(--pitch-glow)] hover:underline"
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
                <form onSubmit={handleName} className="mt-6 flex flex-col gap-4">
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

            <div className="login-mobile-points">
              {mobilePoints.map((p) => (
                <div key={p.label} className="login-mobile-points__item">
                  <span>{p.label}</span>
                  <span>{p.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RulesPanel({ onBack }) {
  const bracketRows = [
    ...ROUNDS.filter((r) => r.key !== "final").map((r) => ({
      label: `${r.short} correct`,
      points: r.points,
    })),
    { label: "3rd place", points: THIRD_PLACE.points },
    { label: "Final", points: ROUNDS.find((r) => r.key === "final").points },
  ];

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
          {bracketRows.map((row) => (
            <div key={row.label} className="rounded bg-[var(--bg-elevated)] p-2">
              <span className="text-[var(--pitch-glow)]">{row.label}</span>
              <span className="float-right font-bold">{fmtPts(row.points)}</span>
            </div>
          ))}
        </div>

        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">Score calls · per match</p>
        <div className="grid grid-cols-2 gap-2">
          {SCORE_TILES.map((tile) => (
            <div
              key={tile.key}
              className={[
                "flex flex-col gap-0.5 rounded-lg border p-3",
                tile.featured
                  ? "border-[var(--gold)]/35 bg-[var(--gold)]/10"
                  : "border-[var(--border)] bg-[var(--bg-elevated)]",
              ].join(" ")}
            >
              <span className={["font-display text-2xl leading-none tracking-wide", tile.featured ? "text-[var(--gold-bright)]" : "text-[var(--pitch-glow)]"].join(" ")}>
                +{tile.points}
              </span>
              <span className="text-xs font-bold text-[var(--text-primary)]">{tile.label}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{tile.desc}</span>
            </div>
          ))}
        </div>

        <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">Both sides (exact) · by round</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {EXACT_SCORE_ROWS.map((row) => (
            <div
              key={row.label}
              className={[
                "rounded p-2",
                row.highlight ? "bg-[var(--gold)]/10 border border-[var(--gold)]/35" : "bg-[var(--bg-elevated)]",
              ].join(" ")}
            >
              <span className="text-[var(--pitch-glow)]">{row.label}</span>
              <span className="float-right font-bold">{fmtPts(row.points)}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--text-muted)]">
          Call 90-min scores on real fixtures — separate from bracket picks.
        </p>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-mid)]/30 p-3">
        <p className="text-xs font-semibold text-[var(--text-primary)]">⚠️ Key Rules:</p>
        <ul className="mt-1 space-y-1 text-xs text-[var(--text-secondary)]">
          <li>• Score predictions work until kickoff (lock doesn&apos;t matter)</li>
          <li>• Score points are based on the real result, not bracket picks</li>
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
