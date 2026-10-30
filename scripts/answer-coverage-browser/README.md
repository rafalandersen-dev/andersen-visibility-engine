# CG-03A answer-coverage local browser fixture

Loopback-only, synthetic-data fixture for the domain coverage and evidence drill-down in `AnswerEvidencePanel`. It mounts the **actual** panel, with the real `evidenceCohorts`, `declaredDomains`, `canonicalUuid`, button component and compiled `src/styles.css`. It also uses real React Query and the central i18n catalogs.

These are synthetic: the signed-in actor (`auth.js`), the store's interface-language read (`store.js`) and the four `answer-evidence.functions` calls (`functions.js`). The read returns an in-page dataset validated by the real row schemas; every write is refused and recorded.

## Build and open

```sh
node scripts/answer-coverage-browser/build.cjs
python3 -m http.server 8768 --bind 127.0.0.1 --directory /tmp/milo-answer-coverage-browser-20261030
```

Open `http://127.0.0.1:8768/?locale=en&variant=ready`, adding `&check=1` for the scripted report.

- `locale` is one of `en|pl|sv|da`.
- `variant` is one of `ready|empty|error`.
- `MILO_BROWSER_OUT` changes the output directory.

The build reads no `.env`, starts no app server and installs nothing. It refuses Supabase and `.server` modules, and checks that the real panel, helper, UUID helper and copy are in the bundle and the real store, auth and functions are not.

## Dataset (`ready`) and expected results

One prompt snapshot declares:

- **Own domain:** `www.jasny-dom.example.com`.
- **Competitors:** `rival-one.example.org`, declared twice; `rival-two.example.net`; `jasny-dom.example.com`, identical to own; `shop.jasny-dom.example.com`, a subdomain of own.

The panel must show these rows, in declared order: `jasny-dom.example.com` (also listed as competitor, overlaps `shop…`), `rival-one.example.org`, `rival-two.example.net` and `shop.jasny-dom.example.com` (overlaps own).

| Group                                                             | Answers   | Expected (default window)                                                                                                                                     |
| ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: chat web · consumer-web · manual copy v1 · `synthetic-model-1` | a1–a9, e1 | n=6 (a1, a2, a3, a4, a9, e1); own 3, rival-one 2, rival-two 1, shop 1; quality 6 counted / 1 incomplete list (a5) / 1 failed (a6) / 1 truncated (a7), total 9 |
| B: same, `api` · `synthetic-api-2`                                | b1        | n=1; own 1, others 0                                                                                                                                          |
| Unknown model (×2)                                                | c1, c2    | two separate groups, n=1 each                                                                                                                                 |
| D: search web, incomplete list only                               | d1        | n=0: "unknown (not 0%)", no domain numbers                                                                                                                    |

**Group A answers:**

- **a1:** three own-domain citations, including `www.`, plus rival-one. Own counts once.
- **a2:** cites only `shop…`, so it counts for both own and shop.
- **a3:** a complete, empty citation list: a measured zero.
- **a4:** cites rival-two plus the look-alike `notjasny-dom.example.com`. Its own URL appears only in the answer text.
- **a8:** cites rival-two, but a9 (captured 2026-09-20) corrects it through an UPPERCASE `supersedesId`.
- **e1:** captured 2026-07-15.

**Expected after window changes:**

- **Start set to 2026-08-01:** n=5, own 2.
- **End then set to 2026-09-01:** n=4, rival-one 1, rival-two 1. a8 stays retired, even though its correction is now outside the window.

## Scripted check (`check=1`)

**`ready`** asserts:

- the group A numbers and its overlap and identity notes;
- groups B, C and D;
- **Show answers citing rival-one:** shows exactly a1 and a9; the button is pressed, focus moves to the records heading, and **Show all records** returns;
- the failed-quality button shows exactly a6;
- a8's superseded badge;
- changing the start date clears a domain selection and recounts. A truncated-quality selection is then made again, and changing the end date clears it and recounts on its own. The exact half-open boundary (start included, end excluded) is covered by the unit tests, not by this browser script: no record sits on a boundary here;
- the **Switch project** and **Switch actor** fixture controls (outside the product) clear the selection. The actor wait requires the visible actor label to change, so the old actor's panel cannot satisfy it. The script also waits for the original actor to be restored.

**`empty`** shows "no current saved answers" and no numbers. **`error`** shows an alert and no numbers.

The report (`#results`, `window.__coverageFixtureReport`) lists steps, overflow, network attempts and server calls. It sets `noNetwork`, `noWrites` and `passed`.

Phone width (390×844), real keyboard use and the four languages are for the reviewer to check.

## Boundaries

The build strips the stylesheet's `@fontsource` imports, so the fixture renders in system fallback fonts, not the app's Inter and Fraunces. Text widths therefore differ slightly from production.

This is local interaction evidence with synthetic data, not production, customer or provider evidence. It does not test the server read, the database, auth or capture-protocol eligibility. The numbers describe only the supplied saved answers: they are not market share, a ranking or verified citations.
