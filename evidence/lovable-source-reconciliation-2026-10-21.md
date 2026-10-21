# Lovable source reconciliation — 21 October 2026

This candidate joins current main `d64faac3a9ed7681747b15be0ebbba0018e2b233` with preserved Lovable work `70dbb4f03f29476cbc0f6e96686ee8e8d460b931` using a normal merge. PR172 security versions and PR173 profile-save behavior are retained. It does not deploy or modify the database, email configuration, domains or scheduled work.

The email worker, Supabase client, preview-auth broker and generated types match the preserved Lovable source byte-for-byte. The email delta narrows error logging and changes environment access syntax; authorization, delivery, retry and dead-letter logic are unchanged. Generated types add existing schema declarations, remove none, and match repository migrations; this is not evidence that every migration is deployed.

Only `@lovable.dev/vite-tanstack-config` changes resolved package version (2.13.1 to 2.23.1). Both locks retain main's TanStack security resolutions and the entities 4.5.0 compatibility pin. The helper uses the public npm registry with the same integrity hash as Lovable's artifact; no private cache URL is required. No other npm package entries are added or removed.

## Review and validation

Claude authored the reconciliation and regression tests in the existing authorized session. Codex independently reviewed the source delta, dependency graphs, generated schema additions, queue authorization and the preview broker's target-origin/request matching, fallback, logout and cleanup behavior. No blocking correctness or security finding was identified. The broker trusts the vendor editor origin; it does not separately bind replies to `event.source`, a hardening limitation retained from the vendor-generated source, not a demonstrated exploit.

- Frozen installation succeeds without lock changes on Bun 1.3.3 and 1.4.0; npm frozen-lock dry run agrees.
- Typecheck and production build pass. The built email route retains the bracketed environment lookup. Incidental generated route ordering was restored.
- 34 new synthetic tests cover email queue boundaries and the preview broker. No network or actual email delivery occurs in these tests. Nine existing-behavior assertions also pass against the pre-change worker; only the intended narrowed-logging assertion fails there.
- Full local suite: 7,592 passed, one five-second timeout in the large-DOCX bundle test (444 files, 7,593 tests). Its isolated rerun passes all six tests in 2.1 seconds. The full run is not recorded as wholly green.
- Codex's independent targeted check passes all 45 tests across the two new suites and the existing knowledge-brand suite; independent typecheck and entities resolution also pass. New test files pass ESLint/format checks. Vendor-generated files retain existing formatting errors; repository-wide lint is not claimed clean.

## Release boundary

The original GitHub connection is restored. Lovable's active email domain is shown as verified, with prior successful delivery activity, but no fresh email was sent by this reconciliation. The restore notice was dismissed by keeping the repository version after verifying the backup remained available. Production remains on the prior revision pending separate owner publication approval. GitHub checks, Lovable source sync and preview acceptance must be verified for the resulting commit before release; no production acceptance is claimed here.

This review record is a necessary Codex integration/evidence exception under the working agreement; application implementation remains Claude-authored.
