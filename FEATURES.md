# 2xBet — World Cup 2026 Bracket Challenge

A guide to everything the app does, where users find it, and what they see at each step.

## 1. Signing in

**Where:** Full-screen login page shown before anything else, if you haven't signed in yet.

Every player must have a real account — there is no "play as guest" option. You choose one of:

- **Sign in with Google** — one-click, uses your Google account's name automatically.
- **Sign up / sign in with email + password** — enter an email, password, and (when
  signing up) a display name.
- **Forgot password** — a link on the sign-in tab sends a password-reset email to the
  address you enter.

If Google doesn't share a name, or you're finishing an email sign-up, you'll see one
extra screen asking for a display name before you land in the app.

A **"How it works & Points"** link on the login page opens the full rules and scoring
breakdown (same content described in section 6 below) before you've even signed in.

## 2. The bracket (main screen)

**Where:** The big tree of matchups in the center of the screen — this is the home screen.

This is a single-elimination bracket from the Round of 32 through the Final, plus a
third-place match. For each matchup:

- Tap a team's code/flag to advance them to the next round. Tapping the same pick again
  removes it.
- Advancing a team automatically clears any picks that depended on their opponent
  further down the bracket (so the bracket never shows an impossible path).
- Tap the middle of a match "ticket" to open full match details (see section 4).
- Tap a team's flag to open that team's tournament journey (see section 5).
- Once real results come in, played/live matches are shown with the actual score,
  live minute, and a colored connector line showing whether your pick was right or
  wrong.
- A gold trophy card in the center of the bracket shows the champion you've picked,
  with confetti when a new champion pick locks in.
- While you're actively picking (not yet locked), a small guidance banner points you
  to the next matchup worth filling in.

New players get a starter bracket auto-filled with a plausible pick so the tree isn't
empty on your first visit — you can change any of it before locking.

## 3. The prediction rail (bottom bar)

**Where:** The horizontal scrolling strip along the bottom of the screen.

This lists every match in the tournament in chronological order — group stage games
first, then knockout games (which mirror your bracket picks).

- **Group-stage games**: tap a team directly in the rail to pick the winner. These
  picks are independent of the bracket and can be edited even after you lock your
  bracket.
- **Knockout games**: shown read-only here — they reflect whatever you picked in the
  bracket above.
- **Score predictions**: tap any match card (before kickoff) to guess the exact
  full-time score, from the match detail modal (section 4). This works for every
  match, group stage or knockout, and stays open until that specific match kicks off
  — locking your bracket does not close this.
- Live matches are marked with a pulsing "LIVE" indicator; the next upcoming match is
  highlighted with a countdown.
- The rail auto-scrolls to today's action on load, and can be scrolled manually with
  the arrow buttons.

## 4. Match detail

**Where:** Opens when you tap the center of any bracket card or any rail card.

- Goal-by-goal timeline (regulation, extra time, and penalties, if applicable).
- Kickoff time and venue.
- A **Predictions panel** showing:
  - Your score prediction, editable right up until kickoff (a small ✓/✕ pair to save
    or clear it).
  - Everyone else's score predictions, once you've made yours (or once the match has
    been played).
  - Points earned per prediction, once the match is graded.
  - **"Haven't predicted yet"** — a list of names of every locked, active (not
    abandoned) player who hasn't submitted a score prediction for that specific match,
    so you can see who to nudge.
- Left/right arrow keys (or the small match-tab strip at the top) jump between
  matches without closing the modal.

## 5. Team journey

**Where:** Opens when you tap a team's flag (in the bracket, rail, or match detail).

A master–detail view of everything that team has played in the tournament: a fixture
list on the left (win/draw/loss color-coded) with the running record (W-D-L, goals
for/against), and a full goal-by-goal breakdown of whichever match you select on the
right.

## 6. Locking your bracket

**Where:** The lock button in the top-right toolbar.

- The button is disabled with a tooltip explaining how many picks are left until your
  bracket is complete (all 32 slots across every round).
- Clicking it opens a confirmation dialog — locking is permanent for your bracket
  picks. (Score predictions on individual matches remain editable until each match's
  own kickoff, regardless of lock state.)
- Once locked, your entry shows a "Locked" badge instead of the lock button, and your
  picks appear on the shared leaderboard.

**Scoring** (shown in full on the login page and in-app rules screen):

| Round | Points per correct pick |
|---|---|
| Round of 32 | 1 |
| Round of 16 | 2 |
| Quarter-final | 4 |
| Semi-final | 7 |
| Third place | 3 |
| Final (champion) | 12 |
| Group-stage rail pick | 1 |

Score predictions (any real fixture, group or knockout) are separate from the bracket
points above:
- One side of the score correct: **2 pts**
- Exact score, both sides: **5 pts**

## 7. Viewing other players / leaderboard

**Where:** The "Viewing as" pill at the top center of the header.

Opens a drawer with two sections:
- **Leaderboard** — every locked player, ranked by total points (ties broken by
  correct-pick count, then name), each row showing their name, an icon for how they
  signed in (Google, email, or the plain anonymous icon — only shown if they truly
  have no linked Google/email account), and how many picks they've gotten right so
  far.
- **Still editing** — players who haven't locked yet, listed separately since they
  aren't ranked.

Selecting anyone switches the whole app into **read-only view** of their bracket and
rail picks (their name replaces "You" in the header). Selecting yourself (or the
active viewer again) switches back to your own editable bracket.

## 8. Account menu

**Where:** The small round icon in the top-right of the header (appears once you're
signed in and viewing your own bracket).

- The icon itself reflects how you signed in: Google logo, mail icon for email/password,
  or a plain person icon only if you have no linked login method at all.
- Clicking it opens a small popover showing your email and a **Sign out** action.
- Sign out asks for confirmation first, then signs you out and returns you to the
  login page. (Your data isn't lost — signing back in with the same Google/email
  account restores your bracket.)

## 9. Reset

**Where:** The reset button in the header toolbar (only visible while unlocked).

Clears every bracket pick back to empty, so you can start over. Only available before
locking.

## 10. Live updates

The tournament data (scores, live minutes, goal scorers, venues) refreshes
automatically about once a minute while the app is open — no manual refresh needed.
A small banner appears if a refresh fails, letting you know you're seeing the last
known data rather than silently going stale.
