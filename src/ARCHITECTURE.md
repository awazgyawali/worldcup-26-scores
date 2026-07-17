# Architecture

This app was originally a single 3,941-line `App.jsx` + a single 2,429-line
`index.css`. Both were split into feature files below with **no intended
behavior/visual change** (Stage A), except for one deliberate redesign of the
match-prediction panel (Stage B, noted at the bottom). Read this file before
adding features — it tells you which file owns what, so you don't duplicate
logic or reach into the wrong module.

## Data flow

`App.jsx` is the composition root. It owns *all* state (`useState`/`useRef`)
and wires two data sources:

- **`hooks/usePredictions.js`** — Firebase auth (anonymous bootstrap linked to
  Google or email/password — see the mandatory-login note further down),
  Firestore sync of the user's `winners` object, the realtime `friends` list
  (for the leaderboard/rail), and lock state. `App.jsx` never touches
  Firestore/Auth directly — everything goes through this hook. Each prediction
  doc also carries `authProvider` ("google" | "email" | "anonymous", written by
  `getAuthProviderTag()`), only used today to render a badge in `FriendsModal`.
- **`hooks/useWorldCup.js`** — polls `openfootball/worldcup.json` every 60s,
  enriches raw matches (resolves `W##`/`L##` refs, computes status/live
  minute/scores), and derives the confirmed Round-of-32 team list and each
  team's per-tournament match "journey".

`App.jsx` combines these into derived values via `lib/bracket.js` and
`lib/scoring.js` (`slotMatches`, `actual`, `stats`, `rankedFriends`, etc.),
then prop-drills them into `ScrollBracket`, `MatchdayPage`, and the modals.
**There is no React Context anywhere in this app — props are drilled
explicitly on purpose.** Keep it that way; don't introduce Context for a
single new field.

## Folder layout

```
src/
  lib/                   Pure functions + constants. No JSX, no React state.
    teams.js              Team metadata (flags/codes), name normalization, teamFor()
    rounds.js              ROUNDS/THIRD_PLACE shape, slot key() helper, round labels
    bracket.js             Bracket slot logic: getMatchTeams, normalize (cascade-clear
                            picks), buildSlotMatches/buildActual, pick-progress,
                            guidance-key logic (which slot to nudge the user to pick next)
    scoring.js              Score-prediction storage/grading: getScorePrediction,
                            gradeWinners, gradeScorePrediction, getMatchPredictionInfo,
                            connector stroke/verdict colors
    format.js               Date/time/countdown formatting, flag URL builders
    NOTE: bracket.js and scoring.js import from each other (bracket.js needs
    getScorePrediction for the rail-guide finder; scoring.js needs isMatchScorable/
    getMatchTeams for grading). This is a real circular ES import — it works because
    both sides only call the other's functions at runtime, never at module-load time.
    Don't move code between these files without keeping that in mind.

  hooks/
    usePredictions.js       (pre-existing) Firebase auth/sync/friends/lock — see above
    useWorldCup.js           Live tournament data polling — see above

  components/
    common/                 Cross-cutting UI with no feature ownership
      icons.jsx              All inline SVG icons
      Modal.jsx               Modal + Drawer shells (Escape-to-close, scroll lock)
      Confetti.jsx
      BootLoadingOverlay.jsx
      Countdown.jsx           Self-ticking "kickoff in Xm" badge

    bracket/                The knockout bracket tree (main view)
      TeamRow.jsx             One team's row inside a MatchCard (flag/code/verdict/score)
      Connectors.jsx          SVG bracket connectors + BracketGuideLabel + bracketHighlightFor()
      MatchCard.jsx           One bracket match "ticket" (two TeamRows + status middle)
      PodiumColumn.jsx        TrophyMark + ThirdPlaceCard + the center PodiumColumn
      ScrollBracket.jsx       BracketColumn + the full left/center/right bracket tree

    team/                   Team "tournament journey" modal (master-detail)
      journeyHelpers.js       Pure helpers: journeyResult, buildJourneyTimeline
      JourneyTimeline.jsx     Goal-by-goal timeline pieces + JourneyMatchDetail (detail pane)
      TeamModal.jsx           JourneyListItem (fixture list row) + TeamModal itself

    match/                  Match detail modal (score, goals, score-prediction panel)
      MatchModal.jsx          GoalTimeline + MatchTeamHeader + MatchPredictionsList +
                              MatchModal. See "Stage B" note below for the prediction panel.
                              Also renders a "Haven't predicted yet" line (locked,
                              non-abandoned friends missing a score prediction for this
                              fixture) via `lib/scoring.js`'s
                              `friendsMissingScorePredictionForMatch()`.

    header/
      HeaderToolbar.jsx       ViewingAsPicker + AccountMenu (account icon → popover with
                              signed-in email + Sign out, backed by SignOutConfirmModal)
                              + HeaderToolbar (Lock/Reset only)

    modals/                 Everything else that opens as a Modal/Drawer
      LoginPage.jsx           Dedicated full-screen onboarding gate (not a dismissible
                              modal): email/password sign in + sign up, forgot password,
                              Google, rules screen. No guest/anonymous play — every
                              user must authenticate with Google or email+password
                              before `needsName` clears. (Anonymous Firebase auth is
                              still used internally as a transient bootstrap identity
                              that gets linked to the real credential — see
                              `usePredictions.js` — but it's never exposed as a UI choice.)
      FriendsModal.jsx        Leaderboard + friend-switcher drawer. Each row shows a
                              ProviderIcon (Google/email/anonymous) from `friend.authProvider`.
      LockConfirmModal.jsx    Confirm-before-locking dialog
      SignOutConfirmModal.jsx Confirm-before-sign-out dialog, used by AccountMenu

  App.jsx                  Composition root only — no component definitions besides
                            `export default function App()`.
```

## "Where do I add X?"

- New bracket visual (a badge, a new connector style) → `components/bracket/`
- New grading/points rule → `lib/scoring.js` (and mirror it in `App.jsx`'s
  `railStats`/`rankedFriends` if it needs to show up in the leaderboard)
- New modal → `components/modals/`, reuse `Modal`/`Drawer` from `common/`
- New schedule/match-card behavior (group-stage picks) → `components/matchday/`
  (`ScheduleRailCard` in `MatchdayPage.jsx`)
- Anything about a single team's match history → `components/team/`
- New Firebase field, sync, or auth behavior (email/password, Google, sign out) →
  `hooks/usePredictions.js` only — `LoginPage.jsx` and `HeaderToolbar.jsx` just call
  the callbacks it returns, they never touch `auth`/`firebase.js` directly
- New live-data field from the JSON feed → `hooks/useWorldCup.js`'s `enrichMatch`

## CSS

`src/index.css` is now just `@import` statements into `src/styles/*.css`,
**in the same order as the original single file**:

```
base.css → header.css → bracket.css → drawer.css → loaders.css → rail.css
→ team-journey.css → match-modal.css
```

This order is load-bearing: a few selectors (`.points-popover*`) are defined
twice across sections with the second definition intentionally overriding the
first via cascade order, not specificity. **Do not reorder these imports**,
and if you add a new section, append it — don't insert it between existing
ones unless you've checked for cross-section selector reuse first.

Component files use plain Tailwind utility classes for one-off styling and
reach into these shared `.class-name` selectors (defined in `styles/*.css`)
for anything with keyframe animations, complex gradients, or multi-state
variants (`.match-ticket--live`, `.rail-card--guide`, etc.) that aren't
practical as inline utilities.

## Stage B: match-prediction panel redesign

`components/match/MatchModal.jsx`'s score-prediction section (bottom of the
modal) was intentionally redesigned after the file split, per user feedback
that the original panel (large editable number boxes, shown for every match
regardless of kickoff) was too bulky:

- **Before kickoff**: still an editable two-box score input, just visually
  tighter (smaller boxes/padding) than the original.
- **After kickoff (live/played)**: no editable inputs. Instead a compact
  read-only row list — "You" + your predicted score, then everyone else's
  predictions — reusing `MatchPredictionsList`'s row markup. Each row shows a
  small inline `+N` points pill (`ScorePointsBadge` in `MatchModal.jsx`) once
  the match is graded, computed via `gradeScorePrediction` from `lib/scoring.js`.
- `friendScorePredictionsForMatch` in `lib/scoring.js` was extended to return
  a `points` field per friend (previously only `display`), so this is the one
  place outside `MatchModal.jsx` that Stage B touched. No grading logic
  changed — `points` is just the pre-existing `gradeScorePrediction` result
  exposed on each entry.

## Stage C: comeback picks (Matchday-only second-chance winner)

The bracket is locked, but a slot's picked winner may not even be one of the two
teams that actually reached that knockout game (their team was knocked out
earlier). That dead slot can never score. A **comeback pick** lets the player
re-pick a winner from the two real teams — **in the Matchday tab only, never
touching the bracket** — for a flat **+10** if correct (`MATCHDAY_PICK_POINTS`).
It's purely additive: the dead bracket slot was already worth 0.

On the **third-place game and the final only**, an optional **"risk it"
toggle bar** in the comeback card (risked picks get a fire marker in the
standings and the league comeback list)
(`mdrisk-<slotKey>`, helpers `getMatchdayRisk`/`setMatchdayRisk`/
`comebackStakes`/`isComebackRiskEligible`) trades the safe +10/0 for
**−10/+20** (third place) or **−15/+30** (final) — see
`MATCHDAY_RISK_STAKES`. A bracket pick on these games is worth far more
(third place 40, final 60), so an un-risked comeback shouldn't ride even with
it. Clearing the comeback pick clears the flag; `App.jsx`'s `saveMatchdayRisk`
writes it, editable until kickoff.

- **Storage:** a new `md-<slotKey>` key inside the same `winners` map (e.g.
  `md-r16-3`), alongside the bracket pick (`r16-3`) and score call
  (`r16-3-score`). Synced for free; `normalize`/`normalizeScores` ignore it.
  Helpers `getMatchdayPick`/`setMatchdayPick`/`matchdayKey` in `lib/scoring.js`.
- **Eligibility:** `isComebackEligible(bracketPickId, match, lockTimeMs)` — the
  bracket winner isn't one of the two teams playing, the match is scorable, and
  both real teams are confirmed. Editable until kickoff (same window as score
  calls); `App.jsx`'s `saveMatchdayPick` writes it.
- **Grading:** `gradeWinners` adds `matchdayPoints`/`matchdayCorrect`/
  `matchdayTotal` and folds them into `totalPoints`, so the leaderboard
  (`rankedFriends`) and header total pick it up automatically.
- **UI:** the "Comeback pick" card in `MatchDetailBody` (gated by the
  `allowComeback` prop → Matchday tab, self only), a badge on the Matchday
  schedule rail (`ScheduleRailCard`), and a "Comeback" line + "Comeback pts"
  stat in `StandingsFriendDetail` (via new `buildFriendEvent` fields). The
  bracket views are intentionally untouched.
