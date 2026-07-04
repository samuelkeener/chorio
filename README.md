# Chorio

A chore and task tracker for Sam and Anne's household, built with React + Vite + Supabase.

## Features

- **Tasks** — one-off to-dos assigned to Sam, Anne, or Both, with optional categories (e.g. "Home Improvement") you can filter by. Auto-populated with every recurring chore too, grouped into Today / Tomorrow / Future / Done sections.
- **Chores** — recurring chores (Daily, Weekly, Biweekly, Monthly, or a Custom interval like "every 5 days"). Rows are color-coded green → yellow → red based on how overdue they are. Chores can optionally get a manual recurring deadline (a specific time, day of week, or day of month) instead of just tracking time since last done.
- Click a chore or task's name to rename it, or its assignee badge to reassign it, right inline.
- **Shopping list** — categorized, with a "clear checked" action.
- **History** — a log of completed tasks/chores with per-person counts.

No login — everyone shares the same view of the same data.

## Getting started

```bash
npm install
npm run dev
```

Requires a `.env.local` with:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Pushing to `main` auto-deploys the live site.

See `CLAUDE.md` for a more detailed breakdown of what's implemented, the database schema, and the roadmap.
