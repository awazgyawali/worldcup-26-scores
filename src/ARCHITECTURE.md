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

- **`hooks/usePredictions.js`** — Firebase auth (anonymous + Google linking),
  Firestore sync of the user's `winners` object, the realtime `friends` list
  (for the leaderboard/rail), and lock state. `App.jsx` never touches
  Firestore/Auth directly — everything goes through this hook.
- **`hooks/useWorldCup.js`** — polls `openfootball/worldcup.json` every 60s,
  enriches raw matches (resolves `W##`/`L##` refs, computes status/live
  minute/scores), and derives the confirmed Round-of-32 team list and each
  team's per-tournament match "journey".

`App.jsx` combines these into derived values via `lib/bracket.js` and
`lib/scoring.js` (`slotMatches`, `actual`, `stats`, `rankedFriends`, etc.),
then prop-drills them into `ScrollBracket`, `PredictionsRail`, and the modals.
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
    useCountUp.js            Small animated-counter hook (used by PointsPill)

  components/
    common/                 Cross-cutting UI with no feature ownership
      icons.jsx              WCLogo + all inline SVG icons
      Modal.jsx               Modal + Drawer shells (Escape-to-close, scroll lock)
      Confetti.jsx
      BootLoadingOverlay.jsx
      PointsEarnedBadge.jsx   Small corner badge, used on bracket + rail cards
      Countdown.jsx           Self-ticking "kickoff in Xm" badge

    bracket/                The knockout bracket tree (main view)
      TeamRow.jsx             One team's row inside a MatchCard (flag/code/verdict/score)
      Connectors.jsx          SVG bracket connectors + BracketGuideLabel + bracketHighlightFor()
      MatchCard.jsx           One bracket match "ticket" (two TeamRows + status middle)
      PodiumColumn.jsx        TrophyMark + ThirdPlaceCard + the center PodiumColumn
      ScrollBracket.jsx       BracketColumn + the full left/center/right bracket tree
      PointsPill.jsx          Points total badge + breakdown popover (above the final)

    rail/                   Bottom horizontal ticker of all matches (group stage +
                            knockout), where group-stage winners are picked directly
      RailCard.jsx            RailTeamRow + RailCard (one compact match card)
      PredictionsRail.jsx     RailGuideLabel + the scrollable rail container

    team/                   Team "tournament journey" modal (master-detail)
      journeyHelpers.js       Pure helpers: journeyResult, buildJourneyTimeline
      JourneyTimeline.jsx     Goal-by-goal timeline pieces + JourneyMatchDetail (detail pane)
      TeamModal.jsx           JourneyListItem (fixture list row) + TeamModal itself

    match/                  Match detail modal (score, goals, score-prediction panel)
      MatchModal.jsx          GoalTimeline + MatchTeamHeader + MatchPredictionsList +
                              MatchModal. See "Stage B" note below for the prediction panel.

    header/
      HeaderToolbar.jsx       ViewingAsPicker + HeaderToolbar (Google connect/Lock/Reset)

    modals/                 Everything else that opens as a Modal/Drawer
      NameModal.jsx           Onboarding: sign in / play anonymously + rules screen
      FriendsModal.jsx        Leaderboard + friend-switcher drawer
      LockConfirmModal.jsx    Confirm-before-locking dialog

  App.jsx                  Composition root only — no component definitions besides
                            `export default function App()`.
```

## "Where do I add X?"

- New bracket visual (a badge, a new connector style) → `components/bracket/`
- New grading/points rule → `lib/scoring.js` (and mirror it in `App.jsx`'s
  `railStats`/`rankedFriends` if it needs to show up in the leaderboard)
- New modal → `components/modals/`, reuse `Modal`/`Drawer` from `common/`
- New rail card behavior (group-stage picks) → `components/rail/`
- Anything about a single team's match history → `components/team/`
- New Firebase field or sync behavior → `hooks/usePredictions.js` only
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
