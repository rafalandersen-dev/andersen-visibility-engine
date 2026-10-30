# Public discoverability corrections — CG-09A

Author: Claude (bounded subscription session), 30 October 2026. Implementation
only: not deployed, not verified live. HTTP 200 and correct metadata do not
establish indexing, positions or AI citations.

Base: `e2657b3cd24cda15b2797f5599030f2d5ed6daa5` on
`codex/milo-public-discoverability-20261029`. No dependency or lock changes.

## 1. Supported language alternates

`src/lib/locales.ts` now separates two things that were conflated in one table:
the `<html lang>` of a market route, and membership of the reciprocal hreflang
group.

- `LOCALE_ROUTES` still lists all six market routes, so `/eu` keeps `lang="en"`
  and its sitemap priority.
- `LocaleRoute.hreflang` is nullable. `/eu` is `null`; `HREFLANG_ROUTES` is the
  group `/`, `/uk`, `/dk`, `/se`, `/pl`.
- `en-150` is gone. It annotated `/eu` with a UN M.49 area that Google does not
  accept for hreflang, and left two competing generic-English alternates in one
  group. `/` is now the only `en` and the only `x-default`.
- `hreflangLinks()` emits the five members plus `x-default`, identical on every
  member, so the annotations are reciprocal and each member lists itself.
- `/eu` (`src/routes/eu.tsx`) keeps its content, address and self-canonical and
  emits no alternates at all: a one-sided group would claim a membership the
  page is not part of. It is still listed in the sitemap under its own `<loc>`.
- `src/routes/sitemap[.]xml.ts` gates alternates on `isHreflangRoute(path)` and
  maps `HREFLANG_ROUTES`, matching the HTML head.

Market pages, prices and URLs are unchanged. `/eu` remains selectable in the
region picker (`DISPLAY_REGIONS` untouched) — the UI market list and the
hreflang group are now independent.

## 2. Local SEO guide corrections

`src/routes/blog.local-seo-guide.tsx`, same page and route, corrected claims:

- Profile name: the publicly used real-world name without added keywords,
  instead of "the exact legal business name".
- Categories: one primary category for what the business mainly is, plus the
  smallest accurate set of secondary categories — no longer one per service.
- Contact options: Business Profile chat and call history have been turned off;
  SMS/WhatsApp are described as depending on availability for the profile type
  and region, to be confirmed in the profile rather than assumed.
- Removed the unsupported claim that Google rewards active profiles with
  ranking, and the absolute promises "single highest-leverage channel", "the
  better it ranks" and "can move you onto page one".
- Added a Sources section with four official pages and a visible review date
  (30 October 2026). The JSON-LD claims `dateModified` and `inLanguage` only:
  no publication date, no invented author, no client result.
- Review correction (P2, independent review of the initial candidate): the
  internal-link bullet justified ordinary `<a href>` links with "Google only
  follows links in that form", which is more categorical than the linked
  Search Central page supports. It now reads "so Google can reliably discover
  the linked pages". The recommendation itself is unchanged.

Sources linked on the page:
`support.google.com/business/answer/3038177`,
`.../answer/14919056`, `.../answer/3039617`,
`developers.google.com/search/docs/crawling-indexing/links-crawlable#internal-links`.

## 3. Guide link in the home footer

`src/routes/index.tsx` adds one ordinary descriptive link to
`/blog/local-seo-guide` in the existing footer grid, between `/beta` and the
legal links. No new blog system, routing or layout.

The guide exists in English only, and the link says so: the label reads
"Local SEO guide (English)" and carries `lang="en"` and `hrefLang="en"`.

**No new translation key was added, deliberately.** A localized label would
require a new `publicHome.*` key, and that key changes the reviewed English
source fingerprint of the "public home" batch in all twenty staged locales —
`src/i18n/staged/{bg,cs,de,el,es,et,fi,fr,ga,hr,hu,it,lt,lv,mt,nl,pt,ro,sk,sl}-source.ts`
— which this session may not write. Verified by probe: adding one key and its
German translation fails `src/i18n/staged/german.test.ts` with "English copy
changed; review the German translation before updating its source fingerprint".
An untranslated English label with `lang="en"` follows the existing convention
for English-only strings inside localized pages (the region selector labels in
`MarketPage`), omits no language, and weakens no catalog check. If the owner
wants a localized label, the twenty fingerprint files must be in scope and each
staged `*-public-home.ts` needs the translated value.

## 4. Consistent metadata on three pages

`src/routes/beta.tsx`, `src/routes/case-studies.tsx` and
`src/routes/free-ai-visibility-audit.tsx` follow the existing `/pricing`
pattern: one self-canonical, `og:title` (the page title), `og:description`
describing what the page actually contains, `og:url`, and matching
`twitter:title` / `twitter:description`. Document titles and meta descriptions
are byte-identical to before.

Canonical and `og:url` are module constants, so query parameters cannot reach
them; `head()` ignores its context argument, which the test asserts by calling
it with search parameters and comparing the result. None of the three promises
behaviour the page does not have: the beta description states that availability,
scope and pricing are agreed individually, case studies state setup and
workflow only, and the audit description calls itself a readability check, not a
ranking prediction.

## Tests

- `src/lib/locales.test.ts` — table and helper invariants: every market route
  resolves its own `<html lang>`; group tags are well-formed language or
  language-REGION values (which is what rejects `en-150`, not a literal); one
  region-less alternate and it is the root; no two members share a language;
  `/eu` present as a market but out of the group; the group is self-referential
  and carries exactly one `x-default` pointing at the root.
- `src/lib/public-discoverability.test.ts` — route-level contract. The five
  supported pages publish identical groups and their own canonical; `/eu` has a
  canonical and zero alternates with its market copy intact; the four content
  pages have one canonical equal to `og:url`, no parameters, distinct share
  metadata, and a head that ignores search parameters; the guide's JSON-LD has
  no `datePublished`, an Organization author and a review date not in the
  future; the footer link resolves to the guide with `lang`/`hreflang` `en` in
  all four UI languages; the guide links four official Google sources; the
  corrected claims cannot reappear.

### What these tests do and do not establish

They are unit tests, and their reach is narrower than the acceptance reads:

- The sitemap XML comes from the route's own `GET` handler and is parsed with
  the namespace-aware `saxes` parser, so malformed XML or a wrong namespace
  fails rather than passing a substring search. It is still a direct handler
  call, not a response served over HTTP by the built app.
- The page assertions read the `head()` descriptor objects — the input TanStack
  Start renders from — not a rendered `<head>`. Nothing here proves the
  framework emits them once, in order, or at all.
- The footer-link and guide-content assertions use `renderToStaticMarkup` with
  `@tanstack/react-router` and `use-auth-language` mocked, then parse the
  markup with `parse5`. That verifies the component's own output and anchor
  attributes; it is **not** the application's SSR output and does not prove
  server-rendered HTML, hydration or client navigation.
- No test asserts prose by copying it. The guide checks are negative (the
  corrected claims must not reappear) plus structural (four official sources
  present as real anchors with descriptive text).

Generated HTML and XML from a running build, and the browser pass across
desktop and mobile, remain Codex's independent verification.

Existing public route tests (`public-home-ui`, `public-market-ui`,
`public-beta-ui`, `public-studies-ui`, `public-pricing-ui`, `markets.regions`)
and the i18n catalog/parity/staged tests are unchanged and pass.
`src/lib/sitemap.test.ts` is the customer-site crawler and is not a test of
Milo's own sitemap.

## Commands and results, 30 October 2026

All run from this checkout at `codex/milo-public-discoverability-20261029`,
base `e2657b3c`.

| Command                                                                                                                                                                                                                                                                                                         | Result                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npx --no-install vitest run src/lib/{public-discoverability,locales}.test.ts`                                                                                                                                                                                                                                  | 2 files, 15 tests passed                                                         |
| `npx --no-install vitest run` over `public-home-ui`, `public-market-ui`, `public-beta-ui`, `public-studies-ui`, `public-pricing-ui`, `public-audit-boundary`, `public-audit-client`, `markets.regions`, `technical-sitemap`, `sitemap`, `structured-data`, `i18n/parity`, `i18n/catalogs`, `i18n/staged/german` | 14 files, 210 tests passed                                                       |
| `npx --no-install tsc --noEmit`                                                                                                                                                                                                                                                                                 | clean, before and after the build                                                |
| `npx --no-install eslint` on the ten changed files                                                                                                                                                                                                                                                              | only two pre-existing findings, both in `src/routes/sitemap[.]xml.ts`            |
| `npx --no-install prettier --check` on the ten changed files + this note                                                                                                                                                                                                                                        | only `src/routes/sitemap[.]xml.ts` flagged, for the same pre-existing blank line |
| `bun run build`                                                                                                                                                                                                                                                                                                 | built; nitro server/public output and wrangler config generated                  |
| Re-run of the 14 relevant suites after the build                                                                                                                                                                                                                                                                | 184 tests passed                                                                 |

### Pre-existing findings, reported not changed

`src/routes/sitemap[.]xml.ts` carries two lint findings that predate this work
and lie outside the corrected lines: a stray blank line (L26, also what
`prettier --check` reports) and `no-control-regex` on the NUL separator
escape in `fileToPath` (L68). Neither is touched by this diff; the second cannot
be auto-fixed without a disable comment, so the file would not become
lint-clean either way. For context, `eslint src/routes` reports 988 pre-existing
problems in total, so repo-wide lint is not currently a clean gate.

### Generated route-tree churn

`bun run build` rewrote `src/routeTree.gen.ts` (817 insertions, 818 deletions).
The same 86 route modules are imported before and after; the installed
`@tanstack/router-plugin` emits them in ascending name order where the committed
file has them descending. This is drift between the committed generated file and
the installed plugin, not a route change — this work added no route file and
changed no route id. Typecheck and all relevant suites pass with the regenerated
file. Codex should restore its known-clean prebuild bytes as an integration step
rather than commit the reordering inside this candidate.

### Review correction round, 30 October 2026

One P2 from the independent review of the frozen candidate: the categorical
internal-link justification in `src/routes/blog.local-seo-guide.tsx`, corrected
as described in section 2. Text only — no other source file changed, no test
added, no build needed. Checks run without piping, so exit status is visible:

| Command                                                                                      | Result                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `npx --no-install vitest run src/lib/public-discoverability.test.ts src/lib/locales.test.ts` | 2 files, 15 tests passed, exit 0                 |
| `npx --no-install tsc --noEmit`                                                              | no diagnostics, exit 0                           |
| `npx --no-install eslint src/routes/blog.local-seo-guide.tsx`                                | clean, exit 0 (one prettier re-wrap fixed first) |

## Status

Implemented and locally checked. Not committed, not pushed, not deployed, and
not opened in a browser in this session: code success is not deployment. The
checks above cover route-level descriptors, the sitemap handler's XML and
component markup under mocked router and language providers — not
server-rendered pages, and not indexing, positions or AI citations. The
regenerated `src/routeTree.gen.ts` is to be restored to known-clean bytes
outside the final diff.
