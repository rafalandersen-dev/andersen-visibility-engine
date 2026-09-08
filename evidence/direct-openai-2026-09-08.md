# Direct OpenAI generation — source and activation evidence

Owner instruction, 8 September: remove Lovable AI credit consumption for native text and image generation. Creating a new OpenAI API key is authorized; no plaintext key was requested or exposed. The approved USD5 scan/article/image benchmark remains at zero calls and zero spend.

## Source change

- All shared text actions now use direct `api.openai.com/v1/chat/completions`, GPT-5.6 Terra, low reasoning effort, standard service tier and `store:false`. The real installed AI SDK maps the existing per-action output cap to `max_completion_tokens`, including reasoning. The old Lovable provider module is removed.
- The only alternate text route is the exact configured OpenRouter candidate with its own key. It requires explicit evaluation/production opt-in through the existing router. A missing candidate key or unconfigured model cannot fall back to Lovable or use arbitrary model IDs.
- Images use direct OpenAI Images API, `gpt-image-2-2026-04-21`, one1536x1024 image, medium quality, WebP85%, opaque background and default moderation. Stale `IMAGE_GEN_PROVIDER=lovable` or `AI_IMAGE_MODEL` cannot restore the old route. Missing/blank OpenAI credentials stop generation, even when a Lovable key remains present for other services.
- Text retains64KiB UTF-8 prompt/256KiB result,60-second deadline, per-action token caps and zero retries. Image processing retains120 seconds,8MiB response/16,384 chunks,5MiB decoded image and adds an8KiB UTF-8 assembled-prompt bound. Both direct transports reject redirects and never retry a potentially billed failure.
- Returned image bytes still require shared upload validation/private staging and later approval. Auth, account entitlements, atomic usage claims, draft/proposal restrictions and publishing are preserved. Public-audit Worker's existing direct Gemini route is outside this change.

## Model references, checked 8 September

[Terra model](https://developers.openai.com/api/docs/models/gpt-5.6-terra) supports Chat Completions and low reasoning; published standard text rates are USD2/input million tokens and USD12/output million tokens. [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna) is a cheaper high-volume option, but no equivalent article quality has been established for Milo. Terra is the initial quality/cost choice, not a measured winner.

[Image2 model](https://developers.openai.com/api/docs/models/gpt-image-2) identifies the dated snapshot. The [image guide](https://developers.openai.com/api/docs/guides/image-generation) documents fixed size/quality, inline base64, WebP and compression. [Pricing](https://developers.openai.com/api/docs/pricing) is reference data, not a measured invoice or an active monetary cap.

## Activation and remaining boundary

The secure key picker currently shows Personal organization and Default project. These are standard labels; [OpenAI project documentation](https://help.openai.com/en/articles/9186755-managing-your-work-in-platform-with-projects) explains the automatically created Default project and that project budgets are alerts, not hard caps. The connected account email is awaiting confirmation against the company address. No picker-confirmed opaque IDs, local destination approval, created key or runtime OpenAI configuration is recorded yet.

Deploying the source without OpenAI configuration intentionally pauses native generation. It does not restore Lovable AI as a workaround. Installing a usable runtime key must be coordinated with the approved benchmark and enforced monetary accounting; do not interpret key creation or a project budget alert as a funded operating budget. The existing monetary foundation remains disconnected/unfunded, and customer delivered-result accounting remains separate.

Full-plan R00–R24 / D01–D08 remains open. No live generation, quality acceptance, benchmark savings, Stripe acceptance, new email or client publication is claimed by this source packet.

## Verification

Full suite:1,877 tests/136 files passed (41 additional cases versus #94). TypeScript and production build passed. Focused lint passed; ai.functions.ts retains its pre-existing no-control-regex violation outside the changed lines. Source diff check passed. Review/release remain pending. Tests use synthetic credentials and mocked HTTP; the text integration exercises the real installed SDK request serialization. No paid provider call is made by these tests.
