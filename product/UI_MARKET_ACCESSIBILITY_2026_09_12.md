# Market language and public accessibility — 12 September 2026

Prepared, unreleased delivery. Overall approximately60%, implementation75%; weighted58.25%/73.5%. Paid launch remains NO-GO. Market source31b03f9, policy integration279550f, final accessibility correctiona84f2dc on codex/milo-market-accessibility-20260912.

MarketingShell now accepts a static language independently of optional device language controls; existing controls retain precedence and the default remains English. MarketPage supplies config.lang, so /pl,/se,/dk expose pl/sv/da on main and shared navigation; /uk,/eu remain English. No device picker or language write is added to market routes.

RegionSelector now has a translated accessible name and placeholder, and its detached listbox carries the page language. Existing English region-name policy is preserved with explicit lang=en spans in the selector and shared footer. The pick handler, milo_display_region storage key, route navigation, billing-market mapping, amounts, currencies, plan identities, eligibility copy and contact targets remain unchanged.

Controls reuse current pricing/beta/legal translations. Two additional messages per EN/PL/SV/DA catalog plus staged French cover the region note and selector name:3768keys/catalog,716prepared additions across14existing batches,28French batches. No language enabled. Public market copy now references content priorities in Plan and draft review; publishing preparation, site-specific connector testing, data availability, individually agreed pilots and payment/supplier holds are explicit. Localized market descriptions/metadata and plan proper names retain their existing scope; this is not fluent or commercial acceptance.

Twelve source link/button compositions across MarketingShell, MarketPage, pricing and case studies now use Button asChild. Native anchors retain their targets, button styling and focus behavior without nested native buttons. Pricing card link margins and full width remain intact.

Browser verification found an inherited mobile overflow from the earlier comparison-label fix: absolute sr-only labels escaped the static table scroller into the positioned page section. Document width was755 at390viewport while the table itself correctly scrolled. Making the scroller relative contains those labels. Final built document width390 in EN/PL/SV/DA, with20semantic labels, no nested link/buttons and no CTA text overflow; table remains780wide inside340wide scroller. No accessible values were removed.

## Validation

- Final88focused tests across7files pass, including12new regressions for all five routes, price/target/name/portal-language preservation, no implicit writes, all five picker values, failed storage and shell control precedence. Existing pricing/studies tests now reject nested interactive composition.
- Full TypeScript passes for the combined market/policy source. Final changes afterward are a CSS class and a test regex escape; final build/tests/lint pass. No runtime logic changed after the type check.
- Production build and changed-file ESLint pass with zero findings. Initial lint caught one unnecessary escape in the new test; corrected and rechecked. Diff whitespace check passes.
- Logs: /tmp/milo-market-focused-final.log, /tmp/milo-market-types.log, /tmp/milo-market-lint-final.log, /tmp/milo-market-build-final.log. Source fixed before final tests/build; no source mutation during checks.
- Built GET-only local browser verification covered /pl→/se by keyboard, /dk selection/reload, /uk and /eu, translated names, correct root/menu languages, explicitly English menu labels, canonical five-market prices and390px layout. Case studies and pricing expose native links without nested buttons. Final four-language pricing checks pass above; browser error log empty. One screenshot caught the closing menu animation; subsequent tree confirmed closed/no residual menu. No persistent visual defect was inferred from that animation frame.
- Built terms/refunds confirm12September date, planned Stripe, checkout hold, retained14-day guarantee and no Paddle assertions. Integrated source matches the reviewed policy delivery; its original25section/22unchanged comparator remains /tmp/milo-policy-provider-comparison.json.

Policy a3a07ee is now INCLUDED via normal merge279550f. See POLICY_PAYMENT_PROVIDER_ALIGNMENT_2026_09_12.md. Guarantee eligibility,14days, original-method5–10business-day refunds,2business-day replies, renewal exceptions and30day price notice remain unchanged. Legal/commercial acceptance remains open.

English device preference restored; temporary browser closed, viewport reset, preview stopped. No provider, payment, email, account, production data, migration, review-consuming PR or deployment operation. Security-review quota hold and PR134 production remain unchanged. Real R22/R23 acceptance is still required.
