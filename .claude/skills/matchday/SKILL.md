---
name: matchday
description: Update World Cup 2026 results and bookings (yellow/red cards) in data/matches.json. Use daily during the tournament when the user wants to enter or refresh match results, scores, or card data — e.g. "update today's results", "enter the bookings", "refresh the match data".
---

# Matchday update

Bring `data/matches.json` up to date with the latest played matches: final
scores and, crucially, the **booking data (cards)** that drives the Sweepstake 3
"worst disciplinary record" prize. Scores are also pulled live by the
`poll-matches` Netlify function, but **cards are manual** — there's no free API
tier for them, so this file is the source of record. (See README "Live data".)

## What feeds the scoring

Sweepstake 3 (`src/lib/sweepstake3.ts`) tallies **group-stage** matches only,
once `status: "finished"`:

- `yellow` → **1 pt** each — standalone yellows (a booking with no send-off).
- `red` → **3 pts** each — **direct (straight) reds only**.
- `secondYellow` → **0 pts** — players sent off for a second yellow. These score
  nothing and are excluded from tiebreaks. Track them separately; never fold
  them into `yellow`.

The single most important judgement each day is **direct red vs second yellow** —
they score 3 vs 0. Get this right.

## Steps

1. **Find what needs entering.** Read `data/matches.json`. The matches to update
   are **group stage** (`m1`–`m72`), `status` still `"scheduled"`, with a
   `kickoff` now in the past (today is given in context). Knockout matches
   (`m73`+) don't carry cards — only enter those if the user asks, and they use
   `score` + optional `shootout`, not `cards`.

2. **Research each match.** For every match, find the **final score** and the
   **per-team** card breakdown. Fan out parallel research agents by match (or
   match-day) for speed. For each agent, require:
   - Final score (home = first-named team in the fixture).
   - Per team: count of standalone `yellow`, direct `red`, and `secondYellow`
     send-offs — with the distinction above made explicit.
   - At least two corroborating sources, a confidence rating, and notes on
     anything uncertain.
   - Source preference: ESPN match report, FIFA match centre, Sofascore. Treat a
     single FOX Sports boxscore with caution — its parse has previously
     mis-rendered a single yellow as a second-yellow send-off. Go with the
     multi-source consensus, not one outlier.
   - Only mark a match `finished` if a **confirmed final result** exists. If it
     hasn't kicked off or is still live, leave it `scheduled`.

3. **Apply with the helper script — never hand-edit the JSON.** The repeated
   `"status": "scheduled"` lines make manual edits error-prone. Write the
   researched data to a temp JSON file and run:

   ```bash
   node scripts/apply-results.mjs /tmp/matchday.json
   ```

   Input shape (zero card fields may be omitted; a clean side is `{}`):

   ```json
   [
     {
       "id": "m14",
       "status": "finished",
       "score": { "home": 1, "away": 1 },
       "cards": {
         "home": { "yellow": 2 },
         "away": { "yellow": 1, "red": 1, "secondYellow": 1 }
       }
     }
   ]
   ```

   The script enforces the same invariants as `data.test.ts` (finished→score,
   cards→group only, shootout rules) and refuses to write if anything is off.

4. **Validate.** Run `npm test`. `data.test.ts` and `sweepstake3.test.ts` are
   the backstop. Don't push if they fail.

5. **Report.** Summarise what was entered, show the current Sweepstake 3
   standings (leader = worst record), and flag any low-confidence/uncertain
   matches so the organiser can double-check.

6. **Commit & push** only when the user asks. Netlify auto-deploys; open tabs
   refetch `/matches.json` within ~5 minutes.

## Don'ts

- **Never run `npm run import-fixtures`** — it regenerates `teams.json` and
  **overwrites `matches.json`**, wiping entered results. It's one-time setup.
- Don't add `cards` to knockout matches (the test rejects it).
- Don't fold second-yellow send-offs into the `yellow` count.
- Don't guess card counts — if sources conflict and can't be resolved, leave the
  match `scheduled` (or enter score only) and flag it rather than inventing data.
