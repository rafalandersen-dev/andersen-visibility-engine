# Backlinks — plan & status (handoff)

Ostatnia aktualizacja: 2026-07-16. Autor pierwszej warstwy: Claude Code. Kontynuacja: Codex.

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

Stan MVP (Codex, 2026-07-16):
- `/app/link-marketplace` z katalogiem ofert za interfejsem dostawcy (obecnie adapter demo),
- scoring dopasowania do rynku, języka, tematyki i domen z luki linkowej warstwy 1,
- wyszukiwanie, metryki, orientacyjne ceny i czas realizacji,
- backendowa wycena z 15-minutowym TTL, podpisanym tokenem, ceną dostawcy, marżą Milo
  i dokładną sumą do potwierdzenia,
- dwustopniowy flow: „sprawdź cenę” → osobne potwierdzenie sponsorowania i dokładnej kwoty,
- podpis wyceny jest związany z użytkownikiem; backend odrzuca zmianę ceny, wygaśnięcie tokenu,
  innego użytkownika oraz brak wymaganych potwierdzeń,
- `quoteId` jest kontraktem idempotency key dla przyszłego wywołania płatnego zamówienia,
- zapis reviewowalnych zgłoszeń do `linkMarketplaceOrders[]` w flat JSONB workspace wraz
  z breakdownem ceny, czasem potwierdzenia, statusem dostawcy i historią zdarzeń,
- deduplikacja aktywnych zgłoszeń oraz lista statusów realizacji,
- wymuszone `rel="sponsored"`, jawny disclaimer i brak automatycznego zakupu,
- kill switch: płatne zamówienia wymagają jednocześnie zweryfikowanego mapowania API,
  sekretu podpisującego i `LINKHOUSE_ORDERING_ENABLED=true`,
- i18n en/pl/sv/da oraz testy jednostkowe matchingu, pricingu, TTL i potwierdzeń.

Utwardzenie granicy płatnego zamówienia (Codex, 2026-07-18):
- wycena jest podpisana także identyfikatorem projektu, a docelowy URL jest pobierany
  serwerowo z workspace użytkownika — klient nie może podmienić domeny zamówienia,
- aktywne zamówienia tego samego projektu i oferty są odrzucane również na backendzie,
- zgłoszenie jest zapisywane serwerowo, z kontrolą `rev`, **przed** płatnym wywołaniem providera;
  przeglądarka tylko przeładowuje potwierdzony workspace,
- ponowne potwierdzenie tej samej wyceny używa tego samego `quoteId` i nie tworzy drugiego
  rekordu; równoległe wywołania providera mają ten sam klucz idempotency,
- niepewny wynik wywołania providera pozostawia audytowalny status `In Review`, zamiast
  gubić zamówienie lub sugerować bezpieczny retry,
- synchronizacja statusu przyjmuje Milo `orderId`, a backend sam rozwiązuje należący do
  użytkownika `providerOrderId`; identyfikatora dostawcy nie można podać dowolnie z klienta,
- przy wyłączonym kill switchu live katalog i wycena mogą być testowane, ale backend nie
  zapisze rezerwacji i UI nie pozwoli potwierdzić płatnego zamówienia.

Następny krok warstwy 2: uzyskać dokumentację/klucze API Linkhouse, zastąpić adapter demo
adapterem produkcyjnym i dodać kontrolowany backendowy flow wyceny/zamówienia. Oficjalna
strona API (`https://linkhouse.net/api/`) potwierdza wyszukiwanie serwisów, podgląd ofert,
kontrolę i historię zamówień, eksport oraz informacje o saldzie, ale dokumentację wydaje
indywidualnie po kontakcie z zespołem Linkhouse. Nie wysyłać płatnego zamówienia bez osobnego
potwierdzenia użytkownika.

Szkielet produkcyjny oczekuje sekretów (nazwy, bez wartości):
- `LINKHOUSE_API_BASE_URL`, `LINKHOUSE_API_KEY`, `LINKHOUSE_ACCOUNT_ID`,
- `LINK_MARKETPLACE_SIGNING_SECRET`, `LINK_MARKETPLACE_MARGIN_PERCENT`,
- `LINKHOUSE_API_MAPPING_VERIFIED=true` dopiero po implementacji zgodnej z otrzymaną dokumentacją,
- `LINKHOUSE_ORDERING_ENABLED=true` dopiero po bezpłatnym E2E katalogu i wyceny.

Kontrakt providera ma już finalne metody: katalog ofert, wycena, utworzenie zamówienia i odczyt
statusu. Ich mapowanie Linkhouse jest celowo fail-closed (`linkhouse_api_mapping_pending`) do
czasu otrzymania prywatnej dokumentacji. Marża musi być ustawiona jawnie (brak wartości blokuje
live ordering), a samo dodanie kluczy nie odblokowuje płatnych zleceń.

Do czasu podłączenia API katalog demo jest jawnie oznaczony w UI; domeny, metryki i ceny są
danymi demonstracyjnymi, a zgłoszenie zapisuje się tylko w Milo i nie tworzy płatności.

## Warstwa 3 — AI Outreach 🟡 KONTROLOWANA WYSYŁKA ZBUDOWANA

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

Rozszerzenie kontrolowanej wysyłki (Codex, 2026-07-16):
- osobny, fail-closed adapter Resend; szkice nadal działają bez konfiguracji dostawcy,
- dokładna wiadomość jest zawsze ładowana po stronie serwera z workspace użytkownika — klient
  przekazuje tylko ID szkicu, krok i dwa potwierdzenia,
- edycja tematu, treści i odbiorcy automatycznie cofa szkic do ponownej akceptacji,
- każda pierwsza wiadomość i każdy follow-up mają osobny modal z dokładnym odbiorcą, tematem,
  pełną treścią oraz dwoma obowiązkowymi potwierdzeniami,
- żadnych automatycznych kampanii ani automatycznych follow-upów; follow-up można wysłać ręcznie
  dopiero po upływie zapisanego opóźnienia,
- limit domyślny 5 wiadomości / 24 h / workspace (konfigurowalny, twardy max 20), blokada ponownej
  pierwszej wiadomości do tego samego odbiorcy przez 30 dni oraz idempotency key na każdy krok,
- istniejące `suppressed_emails` i `email_unsubscribe_tokens` są sprawdzane fail-closed przed
  wysyłką; każda wiadomość ma link wypisu oraz nagłówki RFC 8058 one-click,
- HTML i plain text, jawny Reply-To, timeout providera, log w `email_send_log`, statusy i historia
  dostawcy w `outreachDrafts[]`, a po zapisie serwerowym klient przeładowuje aktualny rev workspace,
- status integracji w UI; przy braku któregokolwiek sekretu przycisk realnej wysyłki jest zablokowany.

Sekrety wymagane do realnej wysyłki (nazwy, bez wartości):
- `RESEND_API_KEY`,
- `OUTREACH_FROM_EMAIL` — adres w zweryfikowanej domenie/subdomenie Resend,
- `OUTREACH_REPLY_TO_EMAIL` oraz opcjonalnie `OUTREACH_FROM_NAME` (domyślnie „Milo Growth Outreach”),
- `OUTREACH_EMAIL_SENDING_ENABLED=true` dopiero po weryfikacji SPF/DKIM/DMARC i bezpłatnym teście
  na kontrolowany adres,
- opcjonalnie `OUTREACH_DAILY_SEND_LIMIT` (1–20, domyślnie 5) i `SITE_URL`.

Następny krok warstwy 3: zweryfikować osobną subdomenę nadawczą w Resend, dodać sekrety,
przeprowadzić bezpłatny test na adres kontrolowany przez zespół i dopiero potem włączyć kill switch.
Nie wykonywać realnego outreachu bez każdorazowego potwierdzenia w UI.

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
