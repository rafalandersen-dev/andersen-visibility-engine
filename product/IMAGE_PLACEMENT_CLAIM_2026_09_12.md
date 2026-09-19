# Image placement guidance correction

Prepared after 6f2e613 on codex/milo-report-branding-authority-20260912. Unreleased; overall 60% / implementation 75%, paid NO-GO and all release/provider boundaries remain unchanged.

The Arrange hint formerly promised that placement survives edits and publishes exactly as shown. Source inspection contradicts that unconditional promise. image-anchors.ts resolves missing targets as broken and ambiguous targets as ambiguous; content-assembler.ts weaves resolved images and excludes unresolved ones. Presentation is compiled into bounded classes and markup; the WordPress transport sends assembled HTML or converted Markdown, which cannot establish how the destination renders it. Existing pres.capability already limits its claim to the Milo preview.

Updated arrange.hint in EN/PL/SV/DA and staged FR/DE/ES/IT. The hint explains relative placement, asks users to recheck after edits, identifies missing/ambiguous sections, and states that the destination appearance is not verified by the preview. One existing key per catalog changed. No assembler, placement, checklist, connector, image or enablement behavior changed. DE/ES/IT workflow source fingerprints reflect this reviewed source change; baseline source revision identifiers remain historical.

Validation: runtime and all four staged catalog suites plus existing anchored assembly and checklist regression suites, full TypeScript and production build. Logs: /tmp/milo-placement-claim-{tests,types,build}.log. These tests check local assembly/checklist behavior, source keys, values and placeholders; they do not prove live rendering or fluent interface acceptance. No CMS, image generation or publication request was made.

The Arrange exact-placement source claim is resolved by corrected wording. Automatic scheduling and other recorded source-claim/acceptance work remain open.
