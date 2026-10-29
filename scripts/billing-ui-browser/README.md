# Billing route — local synthetic browser harness

This **loopback-only** harness mounts the **real** billing route
(`src/routes/_authenticated/app.billing.tsx`), the **real** commercial panel
(`src/components/billing/StripeCommercialPanel.tsx`) and the real controller and
presentation helpers, in actual React with actual Radix controls and the
project's compiled Tailwind. It never starts the application server, never
reads `.env` and never contacts a service.

It exists because `renderToStaticMarkup` runs no effects and renders no Radix
portal: the unit suites cannot observe the first read, dialog focus, Escape,
return focus, a double click before the first response, a timeout, or a reentry
after a remount. Those are checked here.

The existing `scripts/milestone-ui-browser` harness covers pricing, Setup,
Today, Editor and Analytics. It does **not** cover Billing, and nothing in it
should be cited as evidence for this route.

## Build and serve

From this checkout:

```sh
node scripts/billing-ui-browser/build.cjs
python3 -m http.server 8767 --bind 127.0.0.1 --directory /tmp/milo-billing-ui-browser
```

Then open `http://127.0.0.1:8767/`.

- Output goes to `/tmp/milo-billing-ui-browser` (override with `MILO_FIXTURE_OUT`;
  an unwritable `/tmp` falls back to `os.tmpdir()`). Nothing is written inside
  the repository and no production asset is touched.
- `build-info.json` records the build timestamp, the source root, the exact real
  sources that were bundled, the fixture-backed modules and the (empty) list of
  blocked backend inputs. `metafile.json` is esbuild's full input inventory.
- Rebuild after every source change; the builder consumes product source and
  never writes to it.
- The author of this packet did **not** start a listener. Start and stop only
  your own static server, on a free loopback port.

## What is real and what is synthetic

**Real:** the billing route and all of its JSX, `StripeCommercialPanel` and
`CommercialConfirmation`, `src/lib/stripe-commercial-ui.ts`,
`src/lib/billing-presentation.ts`, `src/lib/billing.ts`, the i18n catalogs and
resolver, and the `@/components/ui` Radix button, input, label, select and
dialog.

**Synthetic, replaced at bundle resolution:** `@/lib/store`, `@/lib/auth`,
`@tanstack/react-router`, `sonner`, `@/components/AppShell`,
`@/components/StripeSandboxPanel`, and the server functions in
`stripe-commercial.functions.ts`, `entitlements.functions.ts` and
`billing.functions.ts`. Any other `*.functions.ts` is stubbed to refuse.

The synthetic server answers in the **accepted caller API shapes** only, and it
checks the request shape before answering: the exact allowed key set (extra
keys are rejected, as the real `.strict()` schemas do), UUID-shaped
identities, a sellable plan, a bounded integer seat count, a non-negative
integer amount and a lowercase three-letter currency. Anything else is
`request_invalid`.

That is shape checking and nothing more. It enforces no ownership, no
idempotency, no quote binding and no state machine, and its UUID test is a
hexadecimal shape rather than the full Zod UUID contract — so **validator
parity with the real endpoints is explicitly not part of harness acceptance**.
Its only purpose is to stop the harness showing a success for a request the
real endpoint would reject before its handler ran. It cannot be used to argue
that the server is correct.

The dev `VITE_MILO_VISUAL_QA` hardcode (Pro / active / paid) is explicitly
compiled **off**. It is a layout aid and cannot establish a provider, a current
price, a pending operation or recovery behaviour.

## Controls

All controls are in the black bar at the top.

| Control                           | Effect                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scenario**                      | The verified summary the read returns: `verifiedPaid`, `fixtureMoney` (the only scenario with a current amount, labelled on screen as fixture evidence), `verifiedFree`, `paddle`, `manualClear`, `manualHeld`, `held`, `unestablished`, `cancelEligible`, `ambiguous`. Changing it resets the synthetic server. |
| **Read**                          | `ok`, `slow` (delayed, for the refresh state) or `failure` (the read resolves `{ ok: false }`).                                                                                                                                                                                                                  |
| **Prepare**                       | `ok`, `slow`, `zero` (a real zero amount due, period-end effective), `capacity` (`capacity_conflict_working`), `prorationConflict` (`preview_preview_line_proration_conflict`), `held`.                                                                                                                          |
| **Confirm**                       | `applied`, `awaiting_payment`, `scheduled`, `timeout` (rejects after the slow delay), `uncertain` (`quote_consumption_uncertain`), `declined` (`change_invoice_unpaid`), `fenced` (`operation_fenced`), `refused` (`operation_refused`).                                                                         |
| **Cancel**                        | `ok`, `timeout`, `uncertain`, `notApplied` — applies to both cancellation and reversal.                                                                                                                                                                                                                          |
| **Language**                      | en / pl / sv / da, through the real i18n resolver. Resets the fixture.                                                                                                                                                                                                                                           |
| **User**                          | Switches the signed-in identity, so a response in flight for the previous user can be observed being discarded.                                                                                                                                                                                                  |
| **Owner role**                    | Toggles the owner-only sections.                                                                                                                                                                                                                                                                                 |
| **Projection verified**           | When on, an applied confirmation also settles the synthetic projection immediately. Turning it on ALSO settles an applied operation that is already pending, so the scenario below needs no second request. When off (the default) the projection stays pending — the honest default.                            |
| **Settle synthetic projection**   | Settles the pending synthetic projection on its own, with no commercial request at all. Enabled only after an operation actually answered `applied`; a declined, uncertain, fenced or refused operation is never turned into a success by it.                                                                    |
| **Remount route (reentry)**       | Remounts the real route with the synthetic server state untouched.                                                                                                                                                                                                                                               |
| **Reset fixture** / **Clear log** | Discard in-memory state / diagnostics.                                                                                                                                                                                                                                                                           |

## Request log and what to expect in it

`window.miloBillingFixture.snapshot()` returns the scenario, the modes, the
current synthetic operation, per-endpoint request counts, every distinct
dispatched operation id, console errors and blocked network attempts. The
collapsed **Requests** panel shows the same live.

Expected counts for the decisive scenarios:

1. **First load** — exactly one `getStripeCommercialSummaryFn`, zero mutations.
2. **Double click on Confirm before the first response** — exactly one
   `confirmStripeSubscriptionChangeFn`.
3. **Confirm with `timeout`, then click the recovery action, then remount** —
   `dispatchedOperationIds()` must contain exactly **one** id, and
   `confirmStripeSubscriptionChangeFn` must carry that same `operationId` and
   `quoteId` every time. A second id would be the defect.
4. **Closing a dialog, pressing Escape or clicking the overlay** — zero new
   mutation entries.
5. **Read `failure`** — zero mutations, and after a previously verified read the
   facts stay on screen with the "last verified" warning rather than dropping to
   Free. Every control must also be **disabled** while that read is stale.
6. **Confirm `applied`, then Settle synthetic projection, then Refresh** —
   exactly **one** `confirmStripeSubscriptionChangeFn` in total, two or three
   `getStripeCommercialSummaryFn`, and the newly verified plan **and seat
   count** on screen only after the refresh. The Settle button becomes enabled
   as soon as the applied answer arrives, without touching another control.
   After that refresh the operation notice says the change is verified and the
   waiting line is gone.
   A **timeout → recovery** trace is a different scenario: it legitimately
   shows **two** confirms (the initial timed-out dispatch and the explicit
   same-operation recovery) with still one operation id. Do not report it as a
   one-confirm flow.
7. **Reversal from `cancelEligible`** — the request carries the eligible
   cancellation UUID, and the fixture rejects anything that is not a UUID with
   `request_invalid`, exactly as the real validator would.

## Scenarios root should run

- EN desktop, then PL / SV / DA at 390px width; check overflow and that no
  string falls back to a `billingScreen.*` key.
- Change the billing country without Save, then with Save: the catalogue prices
  follow the form; the current subscription facts do not. Use `fixtureMoney` to
  see a confirmed EUR 149 stay EUR 149 while the catalogue shows PLN.
- Provider routing: `paddle` offers the portal; `verifiedPaid` (Stripe) does not,
  and its Free card routes to the cancellation confirmation; `manualHeld`
  disables the owner's manual controls and refuses a forced call.
- Quote, cancellation and reversal: open each dialog, Tab through it, press
  Escape, and check that focus returns to the exact control that opened it —
  not the body. Confirm exactly once.
- `timeout` → recovery → remount, with the request counts above.
- Pending projection: confirm with **Projection verified** off and check the
  screen says the access has not changed; then use **Settle synthetic
  projection** and **Refresh billing status** and check that the plan and the
  purchased-seat count change only then, with still exactly one confirm in the
  log and the waiting sentence replaced by the verified one. Try a zero-seat
  target and a seat-only change as well.
- Narrow viewport: at 390px the scaffold toolbar must not cover a dialog. It
  scrolls with the page, sits below the modal layer, and hides itself while a
  dialog is open — so heading text, pointer input and focus can all be checked
  on the **unmodified** build with no temporary DOM edits.
- Stale evidence: with a verified summary, switch Read to `failure` and press
  Refresh. The facts must stay, the warning must appear, and both Cancel
  controls, Prepare and any recovery action must be disabled.
- Switch **User** while a slow read or a timed-out confirm is in flight: the
  new session must start empty and the old answer must not appear.
- Console must be clean and `blockedRequests` must stay empty — nothing should
  even attempt a network call.

## Boundaries

- The builder refuses any `.server.ts` or `@/integrations/supabase/**` module at
  resolution time and re-checks esbuild's input inventory afterwards. It also
  asserts that the real route, panel, controller and presentation modules were
  actually bundled, so the harness cannot silently degrade into a mock.
- `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` and
  `window.open` all throw and are logged. Anchor clicks are intercepted. The
  HTML carries `connect-src 'none'`, `form-action 'none'` and `object-src 'none'`.
- No credential, account, customer, subscription, invoice or session identifier
  exists anywhere in this harness, and no payment, refund or provider call is
  possible from it.
- This is local interaction evidence with synthetic data. It is **not** sandbox,
  payment, refund, entitlement, tax, invoice or release acceptance.
