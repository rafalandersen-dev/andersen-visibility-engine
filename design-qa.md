# Milo Growth — selected workspace QA

Date: 6 September 2026. Scope: Today cockpit, Plan list/inspector, light calendar and shared responsive shell, plus the confirmed setup/editor/connector/store defects. This is not acceptance of every legacy module or live provider integration.

final result: passed

## Visual evidence and state

Source visual truth: the user-selected list and calendar concepts and unified cockpit mock in the conversation. Original ImageGen IDs: `exec-48c8d6d0-8745-4607-9101-3acbec91aede.png` (list), `exec-5fc9c2dd-76ef-486a-89ee-d40392fe2fa2.png` (calendar), `exec-983b907b-9c0a-4c9b-a358-260bfdaea2c0.png` (unified cockpit). Private comparison copies are `source-list.png`, `source-calendar.png`, `source-cockpit.png` inside the companion visual QA report. Original references contain account identity, so they are not added to this public repository.

Browser-rendered implementation screenshots are in `docs/premium-redesign/evidence/`: `implementation-cockpit.jpg`, `implementation-list.jpg`, `implementation-calendar.jpg`, `implementation-mobile-home.jpg`, `implementation-mobile-list.jpg`, `implementation-tablet.jpg`, `implementation-editor.jpg`.

- Source images: 1487 × 1058 pixels, no device frame. CSS viewport/density cannot be inferred from a generated mock.
- Desktop browser: 1363 × 936 CSS pixels, devicePixelRatio 1. Cockpit/list captures: 1348 × 926 pixels returned by the browser capture pipeline. Calendar full-content capture: 1185 × 936 pixels; it is a scaled full-content capture, not a 1:1 viewport measurement.
- Comparison normalization: proportional source resize to the corresponding screenshot width; neither image is stretched. The companion report contains `comparison-cockpit-final.jpg`, `comparison-list-final.jpg`, `comparison-calendar-final.jpg`, plus readable `focus-inspector.jpg` and `focus-calendar-preview.jpg`. Different canvas heights and capture scaling are explicitly retained; no pixel-perfect or numerical similarity claim is made.
- Responsive QA uses a same-origin iframe with 390 × 844 and 768 × 844 CSS viewports. The 390px viewport has 375px usable body width after its scrollbar; DOM checks confirmed body scrollWidth equals usable width. Saved images crop away the outer QA controls. Tablet screenshot is 768 × 844.
- State: Polish interface, DEV-only demonstration workspace, five articles (three armed for the following Tuesday/Thursday/Saturday and two published), one project, no authenticated user. List has the first article selected; calendar shows 7–13 September 2026. Browser timezone is America/Los_Angeles. Production values remain driven by workspace data.

## Findings and comparison history

No actionable P0/P1/P2 finding remains in the selected workspace scope after the following iterations.

| Severity / earlier finding | Fix | Post-fix evidence |
|---|---|---|
| P1: workspace inherited the marketing serif, weakening the approved sans hierarchy | Scope Inter to workspace headings, include weight 700, restore prominent cockpit/article hierarchy | Final cockpit full-view comparison |
| P1: inspector led with a dense metadata form and pushed article actions below the visible area | Put image, title, status, date, review and reschedule first; keep full metadata, pipeline and Milo Score in expandable details | Final list comparison and inspector region |
| P2: initial calendar imagery made events bulky and omitted the selected next-publication strip | Compact text events; separate preview strip with existing review/reschedule handlers | Final calendar comparison and preview region |
| P2: mobile list header survived its intended hidden breakpoint | Scope responsive header display explicitly; wrap full titles and status chips | Mobile list screenshot |
| P1: editor's malformed grid declaration stacked the library and article | Valid 260px/minmax grid, bounded scrollable library and content min-width | Editor screenshot |
| P1: direct Plan navigation or project changes could retain an empty selector result | Cache selector identity as well as state while retaining shallow-equal result identity | Mobile Plan has all five rows; three focused regression tests |
| P2: DEV screenshot gate could hydrate a server UTC label against the browser timezone | Wait for local fixture initialization before rendering the workspace | Fresh navigation console check: no application errors |

## Required fidelity surfaces

| Surface | Result |
|---|---|
| Fonts and typography | Inter for workspace, clear bold heading hierarchy, readable title wrapping, 12px secondary labels. Status text stays within its container. Marketing Fraunces is outside this scope. |
| Spacing and layout | Dark 238px shell, split cockpit, bounded list/inspector and compact calendar. Inspector begins below Plan controls; extra navigation groups and archive/discovery actions preserve existing capabilities. Mobile stacks the content; week/month grids scroll internally. |
| Colors and tokens | Light content, white surfaces, ink navigation and blue actions match the approved combined direction. Amber armed-publication status is retained intentionally from the pipeline semantics; blue is not substituted merely to match mock data. |
| Images and icons | Generated photographic DEV assets match the glass/bottle/travel subjects and remain sharp in their slots. Real workspaces use their article images or real excerpts, never these fixture images. Existing Lucide icons remain consistent; no CSS/SVG artwork substitutes for photographs. |
| Copy and content | Standalone Polish task labels; genuine queue/live counts replace mock totals. Search describes its actual Plan scope. No claim that readiness estimates are observed AI citations. Product/date/title differences are expected fixture data, not missing text. |

Expected design adaptations: common dark shell across all three options; preserved six navigation sections and their children; existing semantic queue statuses; real local timezone; real article counts/content; no decorative nonfunctional search shortcut. The calendar's expanded existing toolbar and the inspector's preserved detail section add some vertical space compared with ideation. These preserve real tasks and are accepted within the selected combined direction.

## Primary interactions verified

- Today search enters Plan with the query and shows the single matching article.
- List selection opens the corresponding inspector; Escape closes it and restores focus.
- Today and calendar reschedule actions open the existing confirmation with the selected article and 09:00; cancellation leaves the queue unchanged.
- Mobile navigation opens as a labelled modal sheet, closes with Escape and resets its expanded state.
- Day/week/month controls and Today navigation work; Today uses the actual current day.
- Direct mobile Plan navigation renders all five fixture rows after hydration.
- New project opens a blank form; switching back restores edit mode. Create clears the `new` URL flag. Edited USP text survives save, navigation away and return in the local store.
- Direct Connected Apps opens management; real OAuth request handling is preserved in source. No token was created.
- Existing editor opens with a side-by-side article library and editing workspace.

Final console check after a fresh calendar → confirmation/cancel → cockpit navigation: no application errors. Browser-extension errors were excluded. A browser screenshot timeout was resolved by a fresh normal capture; it was not an app failure.

## Engineering validation and limits

- 190 tests passed across 11 suites: pipeline, calendar scheduling, growth work/project form, selector cache, store article fields/link safety/revision/reload, pending project setup actions, MCP server and billing/analytics hardening.
- Final TypeScript check and production build passed; `git diff --check` passed.
- Focused lint passed for the changed UI/new helper files. The existing store's inline `import/order` suppression refers to an unavailable rule; the same failure was reproduced on the baseline. Full-repository lint is not claimed clean.
- Production output contains no `initializeVisualQa`, `VITE_MILO_VISUAL_QA` or generated fixture image paths. DEV fixtures have no user identity and do not persist to cloud. Existing production auth, onboarding and server authorization remain active.
- Live CMS publication, OAuth grants, billing, Linkhouse/DataForSEO/Resend and external analytics collection were not exercised. Cloud persistence was not revalidated with mutations; preview form checks use the local fixture store.
- Automated full accessibility auditing and every legacy board/drag/bulk edge case were not run. Keyboard navigation, Escape, labelled mobile navigation and relevant overflow checks were exercised.

## Follow-up polish and complete-product work

Remaining legacy copy includes English labels inside expanded metadata and the existing reschedule dialog's explanatory date. A full localization pass belongs with the remaining module redesign. Studio, setup sections, backlinks, analytics and other retained screens still need their complete premium pass.

The complete preservation map and concrete remaining completion conditions are in `docs/premium-redesign/FEATURE_INVENTORY.md`, including backlinks providers, observed AI citations, Stripe and all EU locales. This QA pass does not mark those workstreams complete.

## Implementation checklist

- [x] Implement selected cockpit, list/inspector and calendar in the existing application.
- [x] Preserve navigation, pipeline and setup ownership contracts.
- [x] Compare source and rendered output together, fix findings, recapture and inspect focused regions.
- [x] Verify desktop, tablet, mobile and primary interactions.
- [x] Pass the relevant regression tests, typecheck and production build.
- [x] Keep production release separate from the review branch.
