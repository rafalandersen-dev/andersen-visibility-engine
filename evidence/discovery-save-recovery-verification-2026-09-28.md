# Discovery acceptance save recovery verification

The acceptance action now reports pending or unconfirmed persistence and permits an explicit retry of current workspace changes. A retry retains the existing opportunity IDs and does not repeat acceptance or provider work. Newer selections survive completion. Recovery controls are bound to the originating user/session epoch/project and cannot save from a stale context.

Independent verification:35suites/787tests passed for acceptance flow, recovery controller, banner, selection and locale contracts; TypeScript, production build and diff checks passed. Unchanged store/entity/session tests retain prior independent coverage. Real browser checks over the real view/store with a fake local backend covered rejection and retry, later selection preservation and subsequent acceptance, project change and round trip, same-account rehydration, and keyboard interaction at375px. All described cases passed locally.

The fake backend is not production or concurrent-writer proof. These changes cover the mounted discovery view; global navigation/signout recovery remains open. Four active locales and20staged locales retain their activation status; staged fluency is not asserted. No schema, credential, permissions, AI generation or production mutation occurred during verification.

This change depends on the selection correction in PR163. Do not merge this stacked change into that prerequisite feature branch. Integrate with main normally after the prerequisite release and obtain the resulting exact-head release checks.
