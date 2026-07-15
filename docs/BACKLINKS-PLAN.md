# Backlinks — plan & status (handoff)

Ostatnia aktualizacja: 2026-07-15. Autor pierwszej warstwy: Claude Code. Kontynuacja: Codex.

## Cel biznesowy

Domknąć ofertę Milo Growth pod wzrost pozycji w Google **pełnym cyklem link-buildingu**:
od zrozumienia profilu linków, przez znalezienie celów, aż po realne pozyskanie linków
(wymiana / płatna publikacja / outreach) — tak, żeby klient nie musiał iść do zewnętrznej agencji.

Strategia ma **3 warstwy**. Warstwa 1 jest zweryfikowana E2E, a warstwy 2 i 3 działają
na produkcji jako bezpieczne MVP wymagające integracji zewnętrznych.

---

## Warstwa 1 — Backlink Intelligence ✅ ZBUDOWANE I ZWERYFIKOWANE E2E (prod, commit `7a9b6c8`)

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

### ✅ DataForSEO podłączone i sprawdzone (2026-07-15)
- `DATAFORSEO_LOGIN` i `DATAFORSEO_PASSWORD` są zapisane w **Lovable Cloud → Secrets**.
- Produkcyjny test `/app/backlinks` zakończył się sukcesem: profil, top referring domains
  i rekomendacje AI zostały zapisane i wyrenderowane.
- Test wykonał 5 wywołań Backlinks API i kosztował **$0.048936** (saldo po teście: `$0.951064`).
- Projekt smoke użyty do testu ma domenę `example.com`; przed analizą klienta trzeba ustawić
  prawdziwą domenę i konkurentów w konfiguracji projektu.

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
adapterem produkcyjnym i dodać kontrolowany backendowy flow wyceny/zamówienia. Oficjalna
strona API (`https://linkhouse.net/api/`) potwierdza wyszukiwanie serwisów, podgląd ofert,
kontrolę i historię zamówień, eksport oraz informacje o saldzie, ale dokumentację wydaje
indywidualnie po kontakcie z zespołem Linkhouse. Nie wysyłać płatnego zamówienia bez osobnego
potwierdzenia użytkownika.

Do czasu podłączenia API katalog demo jest jawnie oznaczony w UI; domeny, metryki i ceny są
danymi demonstracyjnymi, a zgłoszenie zapisuje się tylko w Milo i nie tworzy płatności.

## Warstwa 3 — AI Outreach 🟡 MVP ZBUDOWANE

Zamysł: dla celów, których nie da się "kupić" (partnerstwa, PR, katalogi branżowe) —
AI generuje spersonalizowane maile outreachowe na bazie kontekstu (luka, powód linkowania,
sugerowany asset). Ewentualnie: kolejka wysyłek, statusy, follow-upy.
Do przemyślenia integracja z istniejącym connectorem publikacji / Resend.

Stan MVP (Codex, 2026-07-15):
- `/app/outreach` z celami sugerowanymi z luki linkowej i zgłoszeń marketplace,
- formularz dla domen manualnych, opcjonalnego kontaktu, realnego powodu i oferowanego assetu,
- serwerowe generowanie przez istniejący Lovable AI Gateway (`google/gemini-3-flash-preview`),
- pierwszy mail + maks. 2 follow-upy, kolejka szkiców i statusy realizacji,
- twarde reguły antyspamowe: zero wymiany/kupowania linku, fake-personalizacji, presji,
  zmyślonych faktów i obietnic wyników,
- brak automatycznej wysyłki; szkic wymaga przeglądu, może być skopiowany i ręcznie oznaczony,
- `outreachDrafts[]` w flat JSONB workspace, i18n en/pl/sv/da i testy helperów.

Następny krok warstwy 3: podłączyć zweryfikowanego nadawcę (np. Resend), dodać zgodę użytkownika
przy każdym uruchomieniu kampanii, unsubscribe/suppression oraz limity częstotliwości. Nie wysyłać
wiadomości, dopóki te zabezpieczenia i dane nadawcy nie są gotowe.

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
