# Native OpenAI admission to the monetary ledger

Date: 2026-09-08. Base: PR #95 merge `a3f7aec29edaa91a03bbe7f29280beec684f3086`.

## Behavior

The 17 native text actions and article-image generation now reserve money against both the authenticated user's account and the global budget before invoking OpenAI. They use the previously applied `reserve_ai_expense` / `reconcile_ai_expense` migration. Missing, paused, exhausted or unconfirmed budgets stop provider work. Existing usage claims and image entitlement checks remain in place.

Scheduler discovery and generation preserve the internal monetary pause type, stop remaining attempts and retain completed drafts. Budget failure is not treated as an empty discovery result or an ordinary per-slot generation error.

Each server invocation creates one UUID used throughout that provider attempt; its job ID currently equals its attempt ID. No automatic provider retry occurs. A later user retry is a new paid attempt and requires a new reservation. This is not cross-request idempotency or a grouped multi-step job budget.

Successful responses retain the full reservation with `actualMicrousd: null`. Explicit provider token counts and safe request IDs are recorded for later cost verification. Missing token fields are unknown, including cases where the compatible SDK substitutes zero. The text adapter reads the single step's raw usage because the SDK's aggregate usage drops raw fields. Raw prompts, supplier bodies, images and credentials are not written to the ledger. No unverified cost is settled or refunded.

An accounting outage preserves useful output and leaves accounting pending. Reservation and reconciliation waits now have a 10-second deadline. Provider execution has an explicit promise race, so a provider ignoring cancellation cannot keep the caller waiting indefinitely. A late success never releases the timed-out attempt's reservation. Cancellation does not prove the supplier stopped billing.

OpenRouter candidates stop before reservation/provider work until a separate model-specific price contract exists. Their credential/routing configuration is retained; configuration alone is not monetary authorization.

## Conservative reserves and their limits

| Native request | Reserved per attempt | Fixed request bounds and rate basis |
| --- | ---: | --- |
| Text | USD0.50 | `gpt-5.6-terra`, low reasoning, standard service tier, single text prompt <=65,536 UTF-8 bytes, <=16,000 completion tokens including reasoning, no tools/retries |
| Image | USD0.10 | `gpt-image-2-2026-04-21`, one medium 1536x1024 image, prompt <=8,192 UTF-8 bytes, no input images/edits/partial images/retries |

Official sources checked on 8 September:

- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra): standard input USD2/M tokens, output USD12/M; cache writes at 1.25 times uncached input. The 272K long-context boundary is outside this request contract. Conservatively treating each prompt byte plus 1,024 framing tokens as input and all input at the cache-write rate gives `(65,536 + 1,024) * 2.5 + 16,000 * 12 = 358,400` USD millionths, below the USD0.50 reserve.
- [Image generation, earlier-model cost table](https://developers.openai.com/api/docs/guides/image-generation#calculating-costs): GPT Image2 medium 1536x1024 output is approximately USD0.041. The text-input rate is USD5/M in [pricing](https://developers.openai.com/api/docs/pricing). The maximum prompt plus 1,024 framing tokens gives USD0.04608 input; combined approximately USD0.08708 is below the USD0.10 reserve.

These are conservative admission allocations based on published rates and fixed settings, not measured invoices, customer prices or a guarantee against provider tariff changes. Image output pricing is an estimate from the official table. Revalidate rates/settings before funding a new budget period. The application retains the full reserve even after success; it does not automatically calculate an invoice from incomplete cache details. Actual invoice reconciliation, cost overrun acceptance, customer result allowances and package prices remain open R09 work.

## Verification

- Full suite: 1,906 tests in 137 files passed; TypeScript and production build passed.
- Focused lint passed. The existing `no-control-regex` finding in `ai.functions.ts` remains outside changed lines; full-file lint is not claimed clean.
- New real-SDK transport tests verify reservation before network work, account identity, fixed provider settings, explicit usage capture, unknown-cost retention, configuration/budget refusal, no retry, provider timeout and accounting outages. The ledger also covers stalled RPCs and late provider completion.
- All supplier/network responses in tests are synthetic. No OpenAI request, benchmark expenditure, customer publication or email was made.
- No dependencies, SQL migrations, budgets, runtime secrets or billing configuration changed. At this documentation revision, code review/merge/release are pending.

## Activation boundary

The owner's USD5 authorization remains limited to one scan, one article and one image. It does not authorize an unrestricted owner budget shared with background jobs, ongoing production generation, top-ups or retries. A controlled benchmark must isolate those three attempts before budget provisioning; do not fund the owner/global monthly budget and assume the money can only be used by the benchmark.

Secure key setup remains separate. The OpenAI connector was reauthenticated and lists Personal / Default project. The form has not returned its widget-authored selection payload to this task, so no confirmed local destination or saved key is claimed. The user explicitly authorized retaining the existing OpenAI account email; do not reopen the company-email migration requirement. No secrets belong in this file.
