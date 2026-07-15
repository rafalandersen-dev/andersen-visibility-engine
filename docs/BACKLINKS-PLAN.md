# Backlinks — plan & status (handoff)

Ostatnia aktualizacja: 2026-07-13. Autor pierwszej warstwy: Claude Code. Kontynuacja: Codex.

## Cel biznesowy

Domknąć ofertę Milo Growth pod wzrost pozycji w Google **pełnym cyklem link-buildingu**:
od zrozumienia profilu linków, przez znalezienie celów, aż po realne pozyskanie linków
(wymiana / płatna publikacja / outreach) — tak, żeby klient nie musiał iść do zewnętrznej agencji.

Strategia ma **3 warstwy**. Zbudowana jest tylko warstwa 1.

---

## Warstwa 1 — Backlink Intelligence ✅ ZBUDOWANE (prod, commit `7a9b6c8`)

Moduł `/app/backlinks` ("Linki zwrotne" w nawigacji, między Authority a AI Visibility).
Dane: **DataForSEO Backlinks API** (pay-as-you-go, ~$0,12–0,15 / analiza).

Co robi:
- **Profil własnej domeny** — domain rank, backlinks, referring domains, broken, spam score
  (`/v3/backlinks/summary/live`) + top 25 domen linkujących (`/v3/backlinks/referring_domains/live`).
- **Porównanie z ≤3 konkurentami** (te same metryki; domeny z `project.competitorUrls`,
  fallback: ostatnia analiza w module Konkurencja).
- **Luka linkowa** — domeny linkujące do konkurencji, ale nie do nas
  (`/v3/backlinks/domain_intersection/live`, `exclude_targets:[own]`).
- **Rekomendacje AI** (gemini interpretuje realne dane, nie zmyśla domen) w 6 kategoriach:
  Link Gap Targets, Content for Links, Digital PR, Partnerships & Sponsorships,
  Directories & Profiles, Link Hygiene.
- **4 wyniki 0–100**: overall / profile strength / gap vs competitors (wyżej = większa luka)
  / link quality.
- Konwersja rekomendacji → **Opportunity** (status `Linked`, `source:"backlinks"`),
  pojedynczo i bulk "top 5". Dedup przez `convertedRecommendationIds`.
- **Reguły white-hat wymuszone w prompt**: żadnych wymian linków / PBN / mass-directory-spam
  / kupowania linków przekazujących ranking; płatne = tylko oznaczona publikacja sponsorowana;
  brak gwarancji pozycji/ruchu/przychodu. Disclaimer w UI (i18n en/pl/sv/da).

Pliki:
- `src/lib/backlinks.server.ts` — klient DataForSEO (Basic auth, timeout 25s, friendly errors,
  normalizery eksportowane do testów). **11 testów** w `backlinks.server.test.ts`.
- `src/lib/ai.functions.ts` — `generateBacklinksFn` (pobiera dane → gemini → normalizacja/zod)
  + `getBacklinksStatusFn` (czy skonfigurowane, bez sekretów).
- `src/lib/mock-ai.ts` — surface klienta: `runBacklinkAnalysis`, `getBacklinksStatus`,
  `createOpportunityFromBacklinkRecommendation`, `createOpportunitiesFromTopBacklinkActions`.
- `src/lib/store.ts` — `backlinkAnalyses[]` (flat workspace array), `upsertBacklinkAnalysis`,
  `markBacklinkRecommendationsConverted`.
- `src/lib/types.ts` — `BacklinkAnalysisResult`, `BacklinkRecommendation`,
  `BacklinkTargetSummary`, `BacklinkGapDomain`, `BacklinkReferringDomain`, kategorie;
  `OpportunitySource` rozszerzone o `"backlinks"`.
- `src/routes/_authenticated/app.backlinks.tsx` — strona.
- `src/components/AppShell.tsx` — pozycja w nawigacji (ikona Link2).
- `src/i18n/{en,pl,sv,da}.ts` — pełne tłumaczenia (klucze `backlinks.*`, `nav.backlinks`).

### ⚠️ BLOKER — czeka na klucze (Rafa)
Strona pokazuje kartę "Podłącz źródło danych" dopóki nie ma sekretów. Trzeba:
1. Założyć konto na **app.dataforseo.com**, doładować (min. ~$50).
2. Skopiować login/hasło API z **app.dataforseo.com/api-access**.
3. Dodać w **Lovable Cloud → Secrets** (NIE "Build secrets"!): `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`.
4. E2E na zalogowanym koncie (dziś niezrobione — wtyczka Chrome odłączona, strona za loginem).

---

## Warstwa 2 — Marketplace publikacji sponsorowanych 🟡 MVP ZBUDOWANE

Zamysł: z rekomendacji "Link Gap Targets" / "Digital PR" przejść do faktycznego **pozyskania** linku.
Opcja rozważana: integracja z **Linkhouse** (marketplace publikacji sponsorowanych, ma API),
z ewentualną marżą Andersena (revenue share). Alternatywy: WhitePress, Getfluence, ręczna baza.

Do zaprojektowania przez Codex:
- Model: katalog dostępnych domen/publikacji + cena + metryki (DR, ruch, tematyka) →
  matching do luki linkowej z warstwy 1.
- "Zamów publikację" jako oznaczony sponsored post (zgodne z regułami white-hat).
- Rozliczenie / marża, jeśli w grę wchodzi odsprzedaż.
- **Uwaga prawna/jakościowa**: trzymać się oznaczonych publikacji, unikać wszystkiego,
  co Google traktuje jako link scheme.

Stan MVP (Codex, 2026-07-15):
- `/app/link-marketplace` z katalogiem ofert za interfejsem dostawcy (obecnie adapter demo),
- scoring dopasowania do rynku, języka, tematyki i domen z luki linkowej warstwy 1,
- wyszukiwanie, metryki, orientacyjne ceny i czas realizacji,
- zapis reviewowalnych zgłoszeń do `linkMarketplaceOrders[]` w flat JSONB workspace,
- deduplikacja aktywnych zgłoszeń oraz lista statusów realizacji,
- wymuszone `rel="sponsored"`, jawny disclaimer i brak automatycznego zakupu,
- i18n en/pl/sv/da oraz testy jednostkowe matchingu.

Następny krok warstwy 2: uzyskać dokumentację/klucze API Linkhouse, zastąpić adapter demo
adapterem produkcyjnym i dodać kontrolowany backendowy flow wyceny/zamówienia. Nie wysyłać
płatnego zamówienia bez osobnego potwierdzenia użytkownika.

## Warstwa 3 — AI Outreach ⛔ NIE ZBUDOWANE

Zamysł: dla celów, których nie da się "kupić" (partnerstwa, PR, katalogi branżowe) —
AI generuje spersonalizowane maile outreachowe na bazie kontekstu (luka, powód linkowania,
sugerowany asset). Ewentualnie: kolejka wysyłek, statusy, follow-upy.
Do przemyślenia integracja z istniejącym connectorem publikacji / Resend.

---

## Wzorce projektu, których trzymać się przy dalszej pracy

- **Model AI**: `google/gemini-3-flash-preview` (jedna stała `MODEL`). Pattern: free-form
  `generateJsonText` + brace-matching parse + LUŹNE zod + defensywna normalizacja.
  gpt-5-mini NIE działa (reasoning tokens rozwalają budżet).
- **Nowe kolekcje**: flat JSONB w `workspaces.data`; dodać do State, emptyState, ssrSnapshot,
  hydrate `?? []`, `saveWorkspaceNow` snapshot (5 miejsc — patrz jak zrobione `backlinkAnalyses`).
- **Opportunity z modułu** = status `Linked` (regeneracja opp. wymienia tylko `New`, nie ruszy Linked).
- **Deploy**: push do GitHub `main` (auto-sync do Lovable) → Lovable MCP `deploy_project`.
  Prod: milogrowth.com. Lovable project id `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`.
- **DB Milo**: do SQL/DDL używać **Lovable MCP** `query_database` (Supabase MCP jest podpięty
  do innego projektu — andersen-os).
- **⚠️ Prettier**: repo NIE jest prettier-clean. `eslint --fix` na istniejących plikach
  przeformatowuje całość i zaśmieca diff. Lintować/formatować TYLKO nowe pliki.
- **Weryfikacja**: `npx tsc --noEmit`, `./node_modules/.bin/vitest run` (obecnie 422 zielone),
  `npx vite build`.
