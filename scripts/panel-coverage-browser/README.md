# CG-03B panel-coverage local browser fixture

Loopback-only, synthetic-data fixture for the read-only **Coverage of approved panels** view. It mounts the **actual** `CitationPanelProtocolPanel`, which includes:

- the existing authoring list and lock review;
- the new coverage view;
- the real `panelCoverageEntries`, `panelHeads`, `lockIssues` and `buildPanelDraft` helpers;
- the central i18n catalogs, React Query and the compiled `src/styles.css`.

It is keyed by owner + project exactly as the citation-review route keys it. The synthetic replacements are the two server-function modules (`protocol-functions.js`, `answer-functions.js`) and the store's interface-language read (`store.js`).

## Build and open

```sh
node scripts/panel-coverage-browser/build.cjs
python3 -m http.server 8769 --bind 127.0.0.1 --directory /tmp/milo-panel-coverage-browser-20261030
```

Open `http://127.0.0.1:8769/?locale=en&variant=ready`, adding `&check=1` for the scripted report.

- **Parameters:** `locale` is one of `en|pl|sv|da`; `variant` is one of `ready|loading|empty|error`; `MILO_BROWSER_OUT` changes the output directory.
- **Build:** reads no `.env`, starts no app server and installs nothing. It uses a unique, exclusively created write probe.
- **Bundle check:** it refuses Supabase and `.server` modules. It confirms the real panel, helper, protocol library and copy are in the bundle and the real store and server-function modules are not.

## Dataset (`ready`, project p) — every number is written out in `entry.jsx`

| Version                               | Expected display                                                                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery D v1 (locked)               | planned 40; observed 3; deleted 1; never observed 36; outcomes complete 1 / failed 1 / off-protocol 2 (4 ≠ 3 on purpose); extra saved 2; extra deleted 1; unmatched 2 |
| Discovery D v2 (locked)               | observed 5; deleted 2; never observed **unknown**; cause-neutral incomplete note; unmatched 1                                                                         |
| Discovery D v3 (draft head, lockable) | not in coverage; shown by the existing authoring list                                                                                                                 |
| Brand B v1 (locked)                   | run approved 2026-09-02: allowance 5, used **2**, saved now 0, deleted 1. No planned grid, no 0/0, no money                                                           |
| Global                                | 4 deleted records unmatched to any version (separate note)                                                                                                            |

Project q has one discovery version with observed 7.

## Scripted check (`check=1`)

**`ready`** asserts:

- **Versions:** the coverage version order is D v2, D v1, B v1, even though the authoring list shows the draft v3 head.
- **Numbers:** each version's exact numbers, the incomplete note only on v2, and no percentages.
- **Brand panel:** the brand-run line, its authoritative use, and no grid, 0/0 or money.
- **Overflow:** the global overflow note.
- **Disclosure:** the native details disclosure opens and closes.
- **Lock:** Review and lock, then Approve and lock on draft v3, using the real lock review. Coverage is read again and becomes D v4 (observed 0, never observed 40), D v2, D v1, B v1. The write audit must be exactly one `lockCitationPanelFn` call with `{projectId: "p", expectedOwnerId, panelId: D, expectedVersion: 3}`.
- **Failed refresh:** a coverage refresh fails with numbers cached. The panel shows the error and no numbers, then recovers on a good read.
- **Project switch:** switching to project q never shows project p rows, then shows q's own version. Switching back restores p.

**`loading`** shows a status and no numbers while authoring loads. **`error`** shows an alert and no numbers. **`empty`** shows the empty state.

The report (`#results`, `window.__panelCoverageReport`) lists steps, overflow, network attempts, every server-function call and the writes.

The 390×844 layout, real keyboard use (Tab to each "Record details", Enter/Space) and the four languages are for the reviewer's browser run.

## Boundaries

- **Fonts:** the stylesheet's `@fontsource` imports are stripped, so text renders in system fallback fonts.
- **What this proves:** local interaction evidence with synthetic data only. It is not production, customer or provider evidence.
- **Not tested:** the server's resolution, report math, auth or storage. Those stay covered by the existing protocol tests.
- **Production state:** a production panel's real counts come only from a scoped live read. Nothing here claims they are zero.
