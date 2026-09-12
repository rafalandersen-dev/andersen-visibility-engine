# Pricing accessibility follow-up — 12 September 2026

Source review after pricing delivery72c0417, with successor source227cfbf/combined2916799 inspected read-only. This record is evidence and remaining work, not a full accessibility audit or assistive-technology acceptance. No source edits, external operations or release occurred in this review.

## Confirmed follow-up implementation in successor

- PricingBody receives the selected device language; portaled SelectContent explicitly declares that language. Shared SelectContent uses Radix Portal outside the translated main root, while document language is derived from the /pricing path. The explicit attribute prevents translated menu content inheriting English from that document.
- The market SelectTrigger now has the translated publicPricing.market accessible name. Previously the nearby text was an unassociated div.

These fixes were verified in successor source, not separately tested in this predecessor. Successor validation and any browser/assistive-technology evidence are owned by its delivery record.

## Remaining comparison-table issue

Pricing CompareRow renders enabled boolean values as a bare Check icon and disabled values as an em dash. The built-browser accessibility tree captured during pricing delivery exposed no readable value for enabled feature cells. Source inspection confirms there is no explicit included/not-included text. A screen-reader user therefore lacks an explicit equivalent of the visual feature inclusion information.

Recommended bounded follow-up: give both boolean states localized readable values (visually hidden text is suitable), hide decorative icon/dash from accessibility APIs, and identify row/column headers with semantic th/scope as appropriate. Preserve the PLAN_LIMITS booleans, all quantities, plan order, market values, currency, prices, destinations and commercial holds. Include an appropriate rendered accessibility check; do not call local structural checks real screen-reader acceptance.

The accepted successor01a094bd-c05f-76e1-b75d-7891d973e045 received these findings through task messages and retains implementation ownership. Its next handoff should preserve this outstanding item if not completed before transfer. Do not duplicate concurrent public-page edits.

Full R00–R24/D01–D08 remains open: overall60%, implementation75%; release/security and real-use acceptance boundaries from HANDOFF_2026_09_12_PRICING_DELIVERY.md remain unchanged.
