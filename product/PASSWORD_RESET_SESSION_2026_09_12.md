# Password reset session lifecycle

Prepared after bec3b5e on codex/milo-report-branding-authority-20260912. Unreleased; overall 60% / implementation 75%, paid NO-GO and existing release/account/provider boundaries persist.

The reset page previously used a one-way resolved flag. After becoming ready it ignored sign-out, while an outstanding initial session lookup could still update state after unmount. Initial getSession rejection was unhandled. The new observer catches lookup rejections, retains the delayed eight-second session recheck, invalidates readiness on sign-out and ignores stale async results after newer authentication events or cleanup. It unsubscribes and clears the timer on cleanup. A recovery/sign-in event must carry a session. A later valid recovery event can recover the page from an earlier invalid result.

The page still permits an existing authenticated session, matching previous behavior. This is a session-lifecycle correction, not proof that an arbitrary existing session originated from a recovery link. Submission now also requires ready state. Password validation, updateUser, success navigation, language selection and invalid-link/request-new UI remain unchanged. Existing invalid-link wording still groups absent session and terminal lookup failure; distinct network-retry presentation remains future UX work.

Eight local fake-timer tests pass, covering immediate subscription delivery as well as existing sessions, the full wait, initial/final lookup rejection, recovery events, sign-out versus stale lookup, final-check versus newer recovery and unmount cleanup. These tests do not prove actual token exchange, expired-link handling by the provider or a real password change. No credentials, accounts or real authentication operations were used.

Full TypeScript, changed-file lint and production build pass. Logs /tmp/milo-reset-session-{tests,types,lint,build}.log. Required real recovery/session acceptance and confirmation resend remain open.
