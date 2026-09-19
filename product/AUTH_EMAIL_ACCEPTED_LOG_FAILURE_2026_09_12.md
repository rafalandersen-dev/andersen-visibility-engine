# Preserve accepted authentication email outcomes

Prepared after bdeda78 on codex/milo-report-branding-authority-20260912. Unreleased; overall 60% / implementation 75%, paid NO-GO and release/provider/account limits remain unchanged.

Inspection of sendDirectAuthEmail found the post-send sent-log write inside the provider-send try/catch. A rejected database write after successful provider acceptance was therefore classified as email delivery failure, wrote a failed status and returned a retry-inviting error. This could encourage another authentication email even though the provider had already accepted the first one.

Moved the sent-log write after the provider error boundary. A thrown logging failure or a resolved database error now emits only auth_email_sent_log_failed and preserves the successful handler response. It does not make another provider request or write a false failed-delivery status. Raw database diagnostics are not logged. Pending-log behavior and actual provider-send failure handling are unchanged, as are sender, recipient, templates, locale, action link, account retention and provider idempotency inputs. Successful provider acceptance is not inbox-delivery proof.

Four new mocked regressions cover signup and recovery with both rejected log requests and resolved error responses. They require one send, a successful response, no failed-status write, fixed diagnostics and no account deletion. All 73 tests across two files pass, including existing real-template rendering and failure/account-retention coverage. Full TypeScript and production build pass. Scoped lint retains the same three preexisting no-explicit-any errors in the handler; the changed test is lint-clean. Logs /tmp/milo-auth-acceptance-{tests,types,lint,build}.log. No actual email, account, credential, provider or database operation was performed.

Confirmation resend is still incomplete: the current branded administrative generation route and native Supabase resend are distinct, and native delivery configuration remains unverified. Do not claim this correction implements resend, delivery acceptance, or authentication rate-limit acceptance.
