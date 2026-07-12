# CricLive — Web Frontend

Next.js 16 (App Router, TypeScript, Tailwind v4) client for the CricLive API.

## Run

```bash
npm install
npm run dev     # http://localhost:3000 (backend must be running on :3001)
npm run build && npm start   # production
```

Environment (`.env`):

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

## Pages

| Route | What it is |
|---|---|
| `/` | Marketing home: CMS blocks (hero, features, pricing preview, CTA) + **live score panel** (live matches + upcoming schedule, 15s refresh) |
| `/[...slug]` | CMS catch-all — renders any published page (`/features`, `/demo`, `/contact`, …) |
| `/pricing` | Plans from the API; signed-in org owners can switch plans (trial auto-starts) |
| `/news` · `/news/[slug]` | Published news feed + article pages |
| `/admin/cms` | Super-admin CMS manager: create/edit/publish pages (block JSON editor, revisions) |
| `/matches` | Match list — All / Live / Upcoming / Results |
| `/matches/[id]` | Match center: live Summary (WebSocket), Scorecard, Commentary, Overs (Manhattan), Stats (wagon wheel + partnerships), MVP, Squads |
| `/tournaments` · `/tournaments/[id]` | Public tournaments: fixtures, points table (NRR), leaders, teams |
| `/login` · `/register` | Auth (JWT stored in localStorage) |
| `/admin` | Your organizations (create org) |
| `/admin/[orgId]` | Org hub: tournaments (create + attach teams + generate fixtures), matches, teams (logo upload), players, venues, **news manager** (cover upload, publish), **roles & access** (custom roles with permission grid, members, scoped grants), **billing** (plan + entitlements) |
| `/score/[matchId]` | **Scorer console**: toss → openers → run pad with extras (WD/NB/BYE/LB), wicket flow with new-batter picker, over-change bowler picker, undo, rain interruption + DLS resume, declare, follow-on decision, super over, finalize with player of the match |

## Architecture notes

- `src/lib/api.ts` — fetch wrapper with bearer token; `src/lib/auth.tsx` — auth context.
- `src/lib/useLive.ts` — Socket.IO hook: joins `match:{id}`, applies `state`/`ball`/`status`/`correction` pushes, tracks presence, falls back to 4s polling when WS is blocked. Listeners attach **before** join (snapshot arrives with the ack).
- Scoring posts carry `client_event_id` (idempotency) and `expected_seq` (optimistic concurrency); a 409 means resync.
- All pages are client components against the public REST API; theme tokens live in `globals.css` (`@theme`).
