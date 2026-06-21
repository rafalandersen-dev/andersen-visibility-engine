# Andersen Visibility Engine

AI SEO & AI-visibility tool by **Andersen Innovations**. Helps small businesses
plan, brief, draft and approve structured SEO content for both Google and
AI-overview style answers.

This repository is **MVP 0.1** — a polished, clickable shell with mocked AI
generation. It is intended for internal demos and external code review before
real LLM providers and persistence are wired in.

---

## What the app does

Six routes, one cohesive workflow:

1. **Dashboard** (`/`) — programme snapshot for the active project: stats,
   recent content, quick actions.
2. **Project Setup** (`/setup`) — brand identity, languages, target
   locations, tone of voice, USPs. Zod-validated.
3. **Services & Products** (`/services`) — CRUD list of offerings that
   anchor every generated piece of content.
4. **SEO Opportunities** (`/opportunities`) — filterable cards. Each card
   can be turned into a landing-page brief or an article draft.
5. **Content Calendar** (`/calendar`) — 30-day plan grouped by ISO week.
6. **Editor** (`/editor`) — markdown body, metadata, outline, FAQ, CTA,
   schema suggestions; status workflow (Draft → In Review → Approved →
   Exported) with `.md` / `.html` export.

Design system: a calm Scandinavian palette (Deep Graphite, Warm Ivory,
Champagne Gold) defined as semantic tokens in `src/styles.css`.

---

## Current MVP scope

In scope for 0.1:
- Three demo brands seeded out of the box.
- Local-only state, persisted to `localStorage`.
- Mock AI generation for opportunities, calendars, briefs, drafts,
  metadata, FAQs and CTAs.
- Project-scoped views (everything filters by `activeProjectId`).
- Markdown / HTML export from the editor.

**Out of scope (do not build yet):**
- Real LLM provider integration
- Automatic publishing to a CMS
- Rank tracking, backlinks, competitor scraping
- Google Search Console, Semrush, Ahrefs integrations
- Payments or agency billing
- Multi-user auth, roles, agency workspaces
- Complex analytics dashboards / charts

---

## What is mocked

| Concern | Where it lives | Notes |
| --- | --- | --- |
| AI generation | `src/lib/mock-ai.ts` | Seven async functions simulate latency and return deterministic content. |
| Seed brands & content | `src/lib/mock-data.ts` | All fixtures + `SEED_ANCHOR` timestamp. |
| Persistence | `src/lib/store.ts` | `useSyncExternalStore` + `localStorage` key `ave-store-v1`. |
| Date formatting | `src/lib/format.ts` | UTC formatters to keep SSR == client. |

Nothing else fabricates data — UI components only read from the store and
call mock-ai functions.

---

## How the project context works

Every entity (`ServiceItem`, `Opportunity`, `CalendarItem`,
`ContentAsset`) carries a `projectId`. The store holds a single
`activeProjectId`; the sidebar project switcher updates it via
`setActiveProject(id)`.

Each route selects its slice client-side:

```ts
const items = useStore((s) =>
  s.opportunities.filter((o) => o.projectId === s.activeProjectId),
);
```

Creating a project (`/setup?new=1`) calls `addProject(...)` which both
inserts the project and sets it active. Switching projects never mixes
data across brands.

---

## How the mock AI generation flow works

```
UI button ─▶ mock-ai.generate*()
              │
              ├─ awaits a small delay (simulated latency)
              ├─ reads context from getState() (project, opportunity, asset)
              ├─ produces typed result (Opportunity[] / ContentAsset / …)
              └─ writes via store actions:
                   replaceNewOpportunities()
                   replacePlannedCalendar()
                   upsertContent()
```

Re-running a generator is safe: opportunity regeneration only replaces
items still in status `New`; calendar regeneration only replaces items
still `Planned`. Anything already in progress is preserved.

To swap in a real provider, replace the body of each `generate*`
function in `src/lib/mock-ai.ts`. Keep the signatures and the store
actions unchanged — no UI changes are required.

---

## Project structure

```
src/
  components/AppShell.tsx     # sidebar + topbar layout
  lib/
    types.ts                  # canonical domain types
    store.ts                  # reactive store + actions
    mock-data.ts              # seed fixtures (pinned timestamps)
    mock-ai.ts                # mock generation layer (swap point)
    format.ts                 # SSR-safe date formatters
  routes/                     # TanStack Start file-based routes
    __root.tsx
    index.tsx                 # Dashboard
    setup.tsx                 # Project Setup
    services.tsx              # Services & Products
    opportunities.tsx         # SEO Opportunities
    calendar.tsx              # Content Calendar
    editor.tsx                # Content Editor
  styles.css                  # Tailwind v4 + semantic design tokens
```

---

## Running locally

```bash
bun install
bun dev
```

The app uses **TanStack Start** (Vite 7, React 19) with file-based
routing. `src/routeTree.gen.ts` is auto-generated — do not edit it.

---

## Suggested next technical steps

1. **Replace mock AI** in `src/lib/mock-ai.ts` with real provider calls
   (Lovable AI Gateway is the default; OpenAI / Anthropic also fit the
   same signatures). Stream long outputs into the editor.
2. **Add persistence** by enabling Lovable Cloud. Move the store from
   `localStorage` to server-backed reads/writes; keep the action API
   identical so the UI doesn't change.
3. **Add auth** so each user sees only their own projects. Roles in a
   separate `user_roles` table (never on the profile row).
4. **Brief & draft prompts** — extract prompt construction into a small
   `src/lib/prompts/` module so prompts can be versioned and reviewed
   independently of UI.
5. **Tests** — add Vitest coverage for store reducers and mock-ai
   determinism before swapping in real LLMs.
6. **Telemetry hooks** (only after providers are real) so token cost and
   latency per generation are observable.

---

## License

Internal — Andersen Innovations.
