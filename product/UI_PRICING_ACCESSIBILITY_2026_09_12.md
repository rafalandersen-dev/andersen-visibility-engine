# Pricing comparison accessibility — 12 September 2026

Source3503796; combined candidatec3e0e25 normally includes docs-only47bb01c/4595208. Unreleased. Overall60%, implementation75%, weighted58.25%/73.5%; paid launch NO-GO.

All20 boolean comparison cells now expose translated Included/Not included text. Checkmarks and dashes are decorative aria-hidden elements. Six column headers and seven row headers have explicit scope. Existing PLAN_LIMITS expressions, amounts, market state, billing eligibility and links are unchanged. Two messages added in EN/PL/SV/DA plus staged French:3766 keys/catalog,714 prepared additions across the existing14 batches,28 French batches. No new language enabled.

Validation:52 tests/3files (8pricing regressions including four new table semantics cases,44 catalog/French checks), full TypeScript, zero changed-file lint findings, production build and diff check pass. Logs /tmp/milo-pricing-accessibility-{tests,catalogs,types,lint,build}.log. First invocation specified two nonexistent catalog test paths; pricing's8 passed; correct catalog paths then ran44 successfully. No source edits during checks.

Built-browser GET-only local preview4192 verified EN→PL→SV→DA→EN. AX text now includes all enabled/disabled cell values, with no bare dash or unlabelled check in those cells. DOM confirms20 boolean labels,13 hidden checkmarks,6 column scopes/7 row scopes. Error log empty. Local English restored, temporary tab closed and preview process stopped. No fluent-screen-reader, signed-in, real-use, provider, payment or release acceptance claimed.

Normally merged docs-only47bb01c/4595208: docs/BETA-DEMO-CHECKLIST.md now distinguishes saved-evidence walkthrough from separately authorized live operations and unexecuted R22/R23 acceptance. No source changed by this merge; no duplicate build required.

Ready policy update a3a07ee879d1f2c7bb2ab6b7ed069f5ba6f91bf7 remains OUTSIDE candidate. Next task should inspect and normally integrate it, preserving legal/commercial acceptance and14-day first-payment guarantee. MarketPage static language/region control/copy consistency and nested link-button elements remain next implementation work.
