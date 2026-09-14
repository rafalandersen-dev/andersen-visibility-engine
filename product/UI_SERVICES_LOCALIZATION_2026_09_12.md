# Services and Products localization — 12 September 2026

Status: prepared and locally validated, unreleased alongside the On-page Review batch. No PR request, migration or deployment is issued while the known security-review quota is exhausted.

The screen adds18 messages across English, Polish, Swedish and Danish, plus matching staged French. It reuses existing navigation, save/cancel, service/product, priority and other released labels. The combined audit/services candidate contains3,099 keys in each current language and staged French, across17 French batches. French remains outside the runtime and picker.

Table columns, empty state, add/edit form, outcome messages and accessible edit/remove button names use the selected interface language. Service/product and priority dropdowns retain their original explicit values. Project IDs, names, descriptions, audiences, locations, create/update/remove calls and the modal's existing behavior stay unchanged. The empty-state description states how supplied catalog details can inform planning/content work without promising that every brief, draft or CTA will use every field. No data mutation or model request was performed during development.

Validation:98 focused localization/knowledge/workspace/revision checks across11files, full TypeScript, zero-diagnostic changed-file lint and production build pass. Logs `/tmp/milo-ui-services-{focused,types,lint,build}.log`. Static inventory `/tmp/milo-ui-services-embedded-inventory.json` finds no direct displayed-string candidates in this route; route metadata, supplied content and actual fluent/signed-in acceptance remain outside this evidence. The preceding audit batch passes161 checks/11files/types/lint/build. Both-runtime CI and required final-head reviews remain necessary before releasing the combined branch.

The old Calendar and Opportunities route components contain literal English, but both routes unconditionally redirect to Plan before rendering. They are excluded from the next active-screen extraction priority; the source inventory is a triage list, not an exact remaining UI count. No legacy route was changed or removed.

PR135 remains unmerged because security review reported its usage limit (comment5644046082), although code review and both-version CI passed. Avoid duplicate review attempts under that unchanged condition. Overall60% / implementation75% estimates (weighted58.25% /73.5%) remain unchanged, with paid launch NO-GO and the full goal still active.
