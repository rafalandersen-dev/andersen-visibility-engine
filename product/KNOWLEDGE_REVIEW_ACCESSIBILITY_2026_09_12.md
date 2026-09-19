# Knowledge review accessibility — 12 September 2026

The component now connects each fact acknowledgement checkbox to that fact’s displayed evidence using an instance-unique React ID and aria-describedby. Previously the repeated checkbox labels had no explicit relationship to their respective fact details. The panel declares its selected interface language and exposes busy state while inspection or mutation is pending. Existing saved/forgotten status roles and the failure alert remain in place.

The server calls, exact-version checks, confirmation requirements, mutation guard and iframe sandbox are unchanged. Authored evidence can have a different language from the interface; no article language is inferred from the selected interface language, and mixed-language content remains a broader acceptance item.

Validation: 33 focused component/Finnish tests pass; component lint and whitespace pass. The local browser harness passed all four interaction groups with Finnish text, plus checks for the evidence-description relationship, panel language and busy state during pending save. Type checking passed (log: /tmp/milo-knowledge-review-accessibility-types.log). The temporary local server was stopped. The harness uses local server-function fixtures and no production stylesheet. This is not full-page responsive, keyboard or screen-reader acceptance.
