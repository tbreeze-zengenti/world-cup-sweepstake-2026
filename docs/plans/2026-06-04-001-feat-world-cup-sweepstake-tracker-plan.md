---
title: "feat: World Cup 2026 Sweepstake Tracker"
type: feat
status: active
date: 2026-06-04
---

# ✨ World Cup 2026 Sweepstake Tracker

## Overview

A responsive single-page web app, deployed to Netlify, for the ~40 members of a workplace World Cup 2026 sweepstake (48 entries — 8 people hold two teams) to track how each person's team is doing and who is winning each of the three prize pots.

**MVP decision (per organiser, 2026-06-04): all tournament data comes from manually-maintained JSON files in the repo.** No external API, no serverless functions, no API keys. Updating results = edit JSON → commit → Netlify deploys. A live results API (football-data.org) is a researched, clearly-scoped **Phase 2** behind a data-adapter interface.

**Timeline pressure:** the tournament starts **11 June 2026** (one week away). MVP must ship before then. Tournament: 48 teams, 12 groups (A–L) of 4, top 2 + 8 best third-placed teams → Round of 32 → R16 → QF → SF → third-place match → Final (19 July). 104 matches total (72 group, 32 knockout).

## Problem Statement / Motivation

The sweepstake exists in `sweepstake.json` (48 entries: `{ name, team, emoji }`, Slack-style emoji codes). Members currently have no way to see, at a glance:

1. **Sweepstake 1 (£3/entry → £144):** overall tournament — winner £96, runner-up £48. Who is still alive?
2. **Sweepstake 2 (£1/entry → £48):** team that **concedes the most goals in the group stage only**. Tiebreak: among tied teams, **fewest goals scored** wins; still tied → **split the prize**.
3. **Sweepstake 3 (£1/entry → £48):** **worst disciplinary record in the group stage only** — 1 pt per yellow, 3 pts per red.

The app keeps everyone (including holders of "rubbish teams") engaged for the whole group stage.

## Proposed Solution

**Stack:** React + Vite + TypeScript SPA. Static deploy to Netlify (publish `dist/`, SPA fallback redirect). No backend in MVP.

**Data model — three source files, everything else derived:**

### `data/sweepstake.json` (exists, move under `data/`)
Unchanged. 48 entries. Note: one entrant name contains an emoji code (`"Moomin :cat:"`) — **never run emoji substitution over the `name` field**, only `emoji`.

### `data/teams.json` (new — authored once)
Canonical team registry keyed by a stable slug; bridges sweepstake names ↔ display ↔ flags ↔ groups:

```json
{
  "ecuador":  { "name": "Ecuador",  "sweepstakeName": "Ecuador",  "fifaCode": "ECU", "iso2": "ec", "group": "A" },
  "ir-iran":  { "name": "IR Iran",  "sweepstakeName": "IR Iran",  "fifaCode": "IRN", "iso2": "ir", "group": "G" }
}
```

- `iso2` drives flag rendering. **England/Scotland have no ISO-3166 country code** — render via region-subdivision flag emoji (🏴󠁧󠁢󠁥󠁮󠁧󠁿/🏴󠁧󠁢󠁳󠁣󠁴󠁿, `gb-eng`/`gb-sct`) or SVG flag assets (e.g. bundled `flag-icons` set) — pick SVGs for consistency across platforms (Windows renders flag emoji as letter pairs).
- Group assignments seeded from the openfootball public-domain dataset (see Sources) and verified by hand once.
- **Build-time validation (Vitest):** every `sweepstake.json` team resolves to exactly one `teams.json` entry and vice-versa (48 ↔ 48). A miss fails CI — a silent mapping miss would corrupt all three pots.

### `data/matches.json` (new — fixtures authored once, results edited by organiser)
All 104 matches, one schema for both stages. Cards live on the match so discipline is auditable per match:

```json
{
  "id": "m01",
  "stage": "group",            // "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final"
  "group": "A",                // group matches only
  "kickoff": "2026-06-11T19:00:00Z",
  "home": "mexico", "away": "south-africa",   // team slugs; knockout placeholders: "winner-m73", "group-a-runner-up", etc.
  "status": "scheduled",       // "scheduled" | "finished"
  "score": { "home": 0, "away": 0 },          // FT score incl. extra time; omit until finished
  "shootout": { "home": 4, "away": 2 },       // knockout only, when applicable — decides winner
  "cards": {                   // group stage only (that's all SW3 needs)
    "home": { "yellow": 2, "red": 0, "secondYellow": 0 },
    "away": { "yellow": 1, "red": 1, "secondYellow": 0 }
  }
}
```

- Fixtures (dates, groups, venues optional) bootstrapped from `openfootball/worldcup.json` 2026 file via a one-off conversion script (`scripts/import-fixtures.ts`), then committed — the script is dev tooling, not runtime.
- `status: "finished"` is the **only** trigger for a match counting anywhere (standings, SW2, SW3, progression). No wall-clock logic — avoids in-progress ambiguity entirely in MVP.
- Knockout progression: when a knockout match is finished, the bracket resolves `winner-mXX` placeholders from `score` + `shootout`. **Winner determination keys off shootout when present** (a shootout match is a draw at FT).
- **Build-time validation:** exactly 104 matches; 72 group matches = 6 per group; every slug exists in `teams.json`; finished matches have scores; knockout placeholder references resolve.

### Derived (computed client-side in pure, unit-tested functions — `src/lib/`)
- `standings.ts` — group tables: P W D L GF GA GD Pts, FIFA tiebreak order (points → GD → goals scored → head-to-head as far as practical; document any simplification).
- `thirdPlace.ts` — ranked best-thirds table (points → GD → goals scored); top 8 advance. Shown during the group-complete → R32 window so the ~12 third-placed teams aren't in unexplained limbo.
- `bracket.ts` — knockout tree from matches; alive/eliminated/champion/runner-up per team.
- `sweepstake1.ts` — per-entrant status: `alive | eliminated | finalist | champion | runner-up`; payouts shown only when final is finished. Same person can win both prizes (two-team holders) — display both.
- `sweepstake2.ts` — conceded leaderboard from **finished group matches only**: rank by GA desc → tiebreak GF asc → split. Show "£48 split N ways (£16 each)". Badge **Provisional** until all 72 group matches finished.
- `sweepstake3.ts` — discipline points from `cards`: `yellow×1 + red×3 + secondYellow×4` *(default — see Decisions)*. Provisional/final same as SW2.

### UI (mobile-first, members check on phones)

| View | Content |
|---|---|
| **Groups** (default during group stage) | 12 group cards in responsive grid (1-col @360px → 2 → 3/4-col desktop). Each: standings table + that group's 6 fixtures/results. Each team row: flag, team, holder name. Compact column set on narrow screens (P, GD, Pts) expanding wider. |
| **Knockout** | Desktop/tablet: full bracket R32→Final, horizontal scroll if needed. Mobile: **round tabs/accordion** (R32 / R16 / QF / SF / Final) — no tiny-bracket pinch-zooming. Third-place match shown, marked as not affecting Sweepstake 1. |
| **Pots** | Three sections: SW1 status board (alive/eliminated counts, finalists, winners); SW2 conceded leaderboard; SW3 discipline leaderboard. Each shows its rules text and Provisional/Final badge. |
| **People** | Per-entrant list (find yourself fast): each person with their team(s), group position, alive/eliminated, current standing in each pot. Two-team holders ("Al Roberts" + "Al Roberts 2") grouped under one person. |

Cross-cutting:
- **Pre-tournament state** (ships ~9 June, starts 11 June): fixtures + zeroed tables + "Tournament starts 11 June" banner; pots show "Starts after first matches". Nothing looks broken.
- **Freshness:** site shows "Results updated to: <last finished match date>" derived from data — sets expectations since updates are manual.
- Client refetches `matches.json` every ~5 minutes when the tab is open/visible (simple `setInterval` + `visibilitychange`), so an open phone tab picks up newly deployed results without a manual reload. This satisfies the rate-limited-polling requirement in MVP (it only ever hits Netlify's CDN).

### Organiser workflow (MVP)
After each matchday: edit `data/matches.json` (score, cards, status → finished), commit, push. Netlify auto-deploys (~1 min). Validation tests run in CI so a typo'd slug or missing score can't ship.

## Phase 2 (out of MVP scope, designed-for): live API

Researched and viable later, behind a `TournamentDataSource` interface (`StaticJsonSource` in MVP):

- **Source:** football-data.org v4 free tier — confirmed it includes the World Cup (competition `WC`): standings (incl. GF/GA), all fixtures/results, knockout. 10 req/min, scores slightly delayed (fine). **Cards are NOT in the free tier** (€29/mo pack) — discipline stays manual even in Phase 2, or paid later.
- **Rate-limit architecture (verified against current Netlify docs):** single Netlify Function proxy returning `Netlify-CDN-Cache-Control: public, durable, s-maxage=300, stale-while-revalidate=3600`. The `durable` directive shares the cached response across all edge nodes → upstream hit ≈ once per 5 min globally regardless of visitor count. API key in a Functions-scoped env var. ~8.6k invocations/month worst case vs 125k free allowance.
- Alternatives rejected: API-Football free plan can't access current seasons; balldontlie FIFA free tier is teams/stadiums only; TheStatsAPI from $50/mo.

## Technical Considerations

- **Greenfield repo** — needs full scaffold: Vite + React + TS, Vitest, `netlify.toml` (`publish = "dist"`, SPA fallback `/* → /index.html 200`), README with the organiser update workflow.
- **Pure derivation functions** are the heart of correctness — all three pots and the bracket are computed, so they get thorough unit tests with fixture scenarios (see Acceptance Criteria).
- **UTF-8 names throughout** (`Côte d'Ivoire`, `Curaçao`, `Türkiye`); display entrant `name` verbatim; always show full names (three different Tims).
- **Flag rendering:** SVG assets keyed by `iso2`/subdivision code, not raw emoji (Windows + England/Scotland issues). Slack `emoji` field retained as data but not the render source.
- No state management library needed — one data fetch, derived via memoized selectors.
- No auth, no PII concerns beyond first names+surnames already shared within the workplace group.

## Decisions needing organiser sign-off (defaults baked in, easy to change — each is one constant)

| # | Question | Default in plan |
|---|---|---|
| D1 | Second-yellow red in SW3 | **4 pts** (1 yellow + 3 red — player received both). Tracked as `secondYellow` so the rule is one constant. Rule text shown in UI. |
| D2 | SW3 tie | Mirror SW2's spirit: most reds → fewest goals scored → **split**. Shown in rules text. |
| D3 | Prize-split rounding | Display "£48 split N ways (£X.XX each)"; pennies handled by humans. |
| D4 | When pots settle | Only when **all 72 group matches have `status: finished`** (SW2/SW3) / final finished (SW1). Provisional badge until then. |

## Acceptance Criteria

**Data integrity**
- [ ] CI test: 48 sweepstake entries ↔ 48 `teams.json` entries, bijective; any mismatch fails the build
- [ ] CI test: `matches.json` has 104 matches, 6 per group × 12, valid slugs, resolvable knockout placeholders
- [ ] `"Moomin :cat:"` renders verbatim; accented names render correctly end-to-end

**Group stage**
- [ ] 12 groups render as a responsive grid; standings (P W D L GF GA GD Pts) computed correctly from finished matches (unit tests incl. tiebreaks)
- [ ] Every team row shows flag + holder; usable at 360px without clipped numbers
- [ ] Best-thirds table renders with exactly 8 marked as advancing once group stage completes

**Knockout**
- [ ] Bracket R32→Final resolves from match results; shootout matches award the correct winner (unit test)
- [ ] Mobile shows round tabs/accordion; desktop shows full bracket
- [ ] Third-place match visible, marked non-determining for SW1

**Pots**
- [ ] SW1: every entrant exactly one status (alive/eliminated/finalist/champion/runner-up); £96/£48 shown only after final finishes
- [ ] SW2: leaderboard from group-stage finished matches only; tiebreak most-conceded → fewest-scored → split, with split amounts displayed (unit tests for each branch)
- [ ] SW3: 1×Y + 3×R (+4 second-yellow per D1) from group matches only; rules text + Provisional/Final badge displayed (unit tests)
- [ ] People view groups two-team holders under one person with both teams' statuses

**States & deploy**
- [ ] Pre-tournament state looks intentional (banner, zeroed tables, pot placeholders)
- [ ] "Results updated to <date>" freshness line derived from data
- [ ] Open tab auto-refreshes data every ~5 min (visible-tab only)
- [ ] Deploys to Netlify from repo: `netlify.toml`, SPA redirect, all tests pass in CI
- [ ] README documents the organiser's edit→commit→deploy workflow incl. card recording convention

## Success Metrics

- Ships before 11 June 2026 kickoff
- Organiser can enter a full matchday's results in <10 minutes with validation catching mistakes
- Members can find their own status in ≤2 taps on a phone
- All three pots' winners are determined automatically and match a manual check of the rules

## Dependencies & Risks

| Risk | Mitigation |
|---|---|
| Fixture bootstrap data (openfootball 2026) incomplete/wrong | One-off import is hand-verified against FIFA's published schedule; it's 104 rows, checkable in an evening |
| Organiser data-entry errors (slugs, scores) | CI validation + obvious-on-sight UI (wrong score visible to 40 invested people within minutes) |
| Manual card entry is tedious | Only group stage needed (72 matches); cards optional per match until SW3 view flags gaps |
| Best-thirds/head-to-head tiebreak complexity | Implement points→GD→GF (covers virtually all real cases); document simplification; organiser can verify against official table |
| One-week deadline | MVP is static + pure functions — no API auth, no backend, no integration risk |

## Sources & References

### Internal
- Sweepstake data: `sweepstake.json` (48 entries)
- SpecFlow analysis: 27 edge cases & 15 decision points incorporated above (mapping misses, shootouts, third-place limbo, two-team holders, emoji-in-name, England/Scotland flags)

### External
- football-data.org coverage (free tier includes World Cup; cards paid-only): https://www.football-data.org/coverage · https://docs.football-data.org/general/v4/match.html
- Netlify CDN/durable caching (Phase 2 pattern): https://docs.netlify.com/build/caching/caching-overview/ · functions: https://docs.netlify.com/build/functions/overview/ · scheduled: https://docs.netlify.com/build/functions/scheduled-functions/ · blobs: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- Fixture bootstrap (public domain): https://github.com/openfootball/worldcup.json (`2026/worldcup.json`)
- Rejected API alternatives: API-Football (free plan season-restricted) https://www.api-football.com/pricing · balldontlie FIFA https://fifa.balldontlie.io/ · TheStatsAPI https://www.thestatsapi.com/world-cup
