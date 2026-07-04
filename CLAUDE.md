# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## What Chorio is

A chore/task management app for Sam and Anne's household. Full vision (app-store-description style — not all of this is built yet, see "Current implementation" below for what's actually live):

- Add daily, weekly, or monthly chores and assign them to family members
- Custom repetition schedules (e.g. every 3 months, every 5 days)
- Users can create their own tabs/categories of tasks and assign specific deadlines
- Everyone can access the app and check off or manually add chores
- Completing a chore records a timestamp and credits the person who did it
- Chores change color as their deadline is missed (green → yellow → red)
- Daily chores automatically populate on the task list

## Current implementation status

Stack: React 19 + Vite + `@supabase/supabase-js`, deployed to a URL that auto-deploys from GitHub (`samuelkeener/chorio`, `main` branch) — pushing to `main` is the deploy step, no separate build/deploy command needed.

**Built:**
- Fixed tabs: Tasks, Chores, Shopping, History (not user-customizable yet — see Roadmap)
- Person toggle: Sam / Anne (renamed from "Wife" on 2026-07-04), used to attribute actions. No real auth — everyone shares the same Supabase anon key, RLS is disabled on all tables to match this trust model (single shared household, not multi-tenant)
- **Tasks tab**: one-off tasks assigned to Sam/Anne/Both, filterable (all/mine/open/done). Completing one stores `completed_by` + `completed_at` and displays "Done by {name} {date} {time}". Has an "AI assist" panel that is currently **non-functional and insecure** — it calls the Anthropic API directly from the browser with no API key; needs a backend/edge function proxy before it can work safely (do not just add a key to the client).
- **Chores tab**: recurring chores with frequency Daily / Weekly / Biweekly / Monthly / Custom (custom = every N days/weeks/months, added 2026-07-04). Tracks `last_done_at` / `last_done_by` (date only shown, no time — unlike Tasks). Rows are color-coded green→yellow→red by how overdue they are (added 2026-07-04):
  - Baseline is `last_done_at`, or `created_at` if never done (so new chores start green, not red)
  - Thresholds scale with the chore's own interval: yellow at `ceil(interval_days / 6)` days overdue, red at double that — this reproduces the originally-specified Daily (+1/+2 days), Weekly (+2/+4), Monthly (+5/+10) targets exactly, and extends the same formula to Biweekly and Custom
  - Colors interpolate smoothly between green/yellow/red rather than jumping in discrete steps
  - Daily/Weekly/Monthly **and Custom** chores can optionally get a **manual recurring deadline** (Daily/Weekly/Monthly added 2026-07-08, Custom added same day): a time-of-day for Daily, a day-of-week + optional time for Weekly, a day-of-month + optional time for Monthly (`deadline_time`/`deadline_weekday`/`deadline_day_of_month` columns), or an arbitrary anchor date+time for Custom (`deadline_anchor`, repeats every N days/weeks/months from that anchor). This is a fixed schedule computed fresh each render (e.g. "every Sunday at 6pm forever", or "every 5 days from June 20"), not a stored date that shifts — completing the chore early doesn't pull the next deadline forward. When set, it fully replaces the last-done-relative color calculation for that chore. Set/edited via an inline per-row editor (click "Set deadline"/"Edit deadline" in the chore's meta row), not just at creation time. A fresh chore is never judged against a scheduled occurrence that predates its own `created_at`.
  - `last_done_at` can be manually edited/backdated per chore (added 2026-07-08) via an "Edit timestamp" link next to "Last done: ..." — same inline-editor pattern as the deadline editor. Does not touch the `history` table (no link between history rows and the chore that generated them).
- **Shopping tab**: categorized list, add/check/delete/clear-checked
- **History tab**: completion log + per-person completed counts (Sam/Anne)

**Database** (Supabase project "chorio", ref `qqsiaszthpyhnctkfwnt`): tables `tasks`, `chores`, `shop_items`, `history`. No RLS policies — was found enabled-with-zero-policies on 2026-07-04 (blocking literally everything, silently, since the app doesn't check Supabase errors), disabled entirely to match the no-auth model.

## Roadmap (priority order, as of 2026-07-04)

1. Points system for completing chores
2. ~~Ability to manually change/backdate the timestamp of a completed chore~~ — done 2026-07-08
3. User-created custom tabs/categories of tasks with their own deadlines
4. "Skip chore today" — removes it from today's view without touching `last_done_by`/`last_done_at`

## Working in this repo

- **Local dev**: `npm run dev` (usually `http://localhost:5173`, hot-reloads on save). Reads `.env.local` for Supabase credentials — **this points at the same production database as the deployed app**, there is no separate dev/staging database. That's intentional (per Sam) — keep using it, but be aware local testing touches real household data.
- **Deploy**: commit + `git push origin main`. No manual build/deploy step.
- **Supabase CLI is linked** to this project (`npx supabase link --project-ref qqsiaszthpyhnctkfwnt`, already done) — use `npx supabase db query --linked "<sql>"` to inspect schema, RLS policies, or data directly instead of guessing from app code.
- **Be careful with browser-automation testing against this app.** Twice in one session, an imprecise Playwright selector (`.check`, `.delete-btn` matching more than one row) hit the wrong row and deleted real chore data instead of test data. If verifying a UI change with automation: use a uniquely-named disposable test item, prefer direct SQL for setup/teardown over clicking through the UI, and never assume the first DOM match is the test row.
