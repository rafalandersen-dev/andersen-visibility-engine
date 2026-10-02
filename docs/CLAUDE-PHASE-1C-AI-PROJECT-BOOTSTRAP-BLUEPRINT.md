# Phase 1C — AI Project Bootstrap Blueprint

> Documentation only. This document changes no runtime code, routes, tools, schemas, migrations, environment variables, OAuth metadata, workspace state, or production behavior.

**Status:** design blueprint (1C.0)  
**Builds on:** Phase 0 read-only connector, Phase 1 rev-safe mutation foundation, Phase 1A direct safe writes, Phase 1B pending actions/proposals  
**Production baseline:** commit `006eaf8dab51e2f1da8e27bb021d3cd825797d80`; `MCP_OAUTH_ENABLED=true`; `MCP_WRITE_TOOLS_ENABLED` off/unset; read connector healthy; write/propose scopes dark  
**Working product name:** AI Project Bootstrap  
**Initial source:** website URL  

## 1. One-sentence goal

Let Claude analyze a business website and create a structured, reviewable project-bootstrap proposal that a Milo owner can inspect, edit, selectively include, approve, and atomically apply to a project, without granting Claude direct project-editing power.

## 2. Product principle

Phase 1C is not a generic website importer and not a direct-write shortcut.

It establishes a reusable onboarding engine:

```text
Source
  -> acquisition
  -> evidence extraction
  -> normalization
  -> confidence and warnings
  -> bootstrap proposal
  -> owner review
  -> deterministic apply
  -> audit
```

The website is only the first source adapter. Future adapters may include Google Business Profile, a questionnaire, CSV, Shopify, WordPress, Wix, Squarespace, or an existing client record. They should all produce the same canonical `ProjectBootstrapDraft` and use the same Phase 1B approval lifecycle.

Core operating model:

- Claude researches and analyzes.
- Claude proposes structured data.
- Milo shows evidence, confidence, warnings, and diffs.
- The owner decides what to include.
- Milo applies deterministic mutations.
- Audit records every material transition.

## 3. Hard boundaries

Phase 1C may propose project setup data only.

It must not:

- publish content;
- delete existing objects;
- change billing, account, OAuth, connector, workspace, or publishing settings;
- modify external services;
- crawl authenticated or paywalled pages;
- submit forms;
- bypass robots, rate limits, bot protections, or access controls;
- treat inferred facts as confirmed facts;
- overwrite an existing project silently;
- let Claude approve, reject, edit-after-approval, or apply its own proposal;
- expose a generic mutation executor.

## 4. Recommended user flows

### 4.1 New project from website

1. User asks Claude to set up a Milo project from a website.
2. Claude confirms the canonical URL and intended business.
3. Claude calls one MCP proposal tool.
4. Milo validates the request and stores a pending bootstrap proposal.
5. The owner opens `/app/actions`.
6. Milo shows each section with source evidence and confidence.
7. The owner may include/exclude editable sections and correct values.
8. The owner approves once.
9. Milo creates the project and selected child objects atomically.
10. Milo records audit events and shows an apply summary.

### 4.2 Enrich an existing project

This should be supported by the canonical model but may ship after the new-project path.

The proposal targets an existing project and shows current -> proposed diffs. Apply is merge/additive only. Existing values are never removed merely because the website did not contain them.

### 4.3 Failure path

If acquisition or extraction is incomplete, Claude may still create a proposal only when:

- at least the canonical URL and business identity are usable;
- missing fields are explicit;
- unsupported or low-confidence values are not promoted as confirmed;
- the owner can safely review the partial result.

Otherwise the tool returns a bounded validation/acquisition error and creates no pending action.

## 5. Architecture decision

### 5.1 Reuse Phase 1B `pendingActions[]`

Recommendation: add a new pending-action type rather than create a second approval system.

```ts
type PendingActionType =
  | ExistingPhase1BTypes
  | "project_bootstrap_proposal";
```

The existing lifecycle remains authoritative:

```text
pending -> applied
pending -> rejected
pending -> expired
```

Approval and application remain Milo UI/server actions, never MCP actions.

### 5.2 Canonical producer/consumer split

Source adapters are producers. The proposal/apply engine is the consumer.

```ts
interface BootstrapSourceAdapter {
  sourceType: "website" | FutureSourceType;
  acquire(input: SourceInput): Promise<SourceBundle>;
  extract(bundle: SourceBundle): Promise<ProjectBootstrapDraft>;
}
```

All adapters must output the same normalized draft shape. No source-specific apply logic is allowed.

## 6. Initial website acquisition contract

### 6.1 Input

Required:

- `websiteUrl`
- stable `requestId`

Optional:

- `targetProjectId` for future enrichment mode;
- `preferredLanguage`;
- user-supplied context such as business name or location, clearly marked as user-provided evidence.

### 6.2 URL validation

Before any fetch:

- require `https://` or safely upgrade `http://` when appropriate;
- normalize host casing, trailing slash, fragments, and tracking parameters;
- reject non-public schemes and malformed URLs;
- block localhost, loopback, link-local, RFC1918/private ranges, cloud metadata hosts, and DNS-rebinding targets;
- resolve redirects with a low cap and revalidate every destination;
- store both submitted and canonical URL.

SSRF protection is release-blocking.

### 6.3 Crawl limits

Recommended first slice:

- maximum 20 fetched HTML pages;
- maximum depth 2 from the canonical origin;
- same-origin only;
- maximum 2 MB response body per page after decompression;
- maximum 15 seconds per page and 60 seconds total acquisition budget;
- HTML and supported structured text only;
- no images, video, archives, executables, or arbitrary binary download;
- deduplicate normalized URLs;
- prefer sitemap and navigation links over broad crawling.

Priority pages:

1. homepage;
2. about/company;
3. service/product overview pages;
4. contact/location;
5. pricing when public;
6. FAQ;
7. selected high-signal pages from sitemap/navigation.

### 6.4 Collected source material

For each page store a bounded evidence record:

```ts
interface SourcePageEvidence {
  url: string;
  canonicalUrl?: string;
  title?: string;
  metaDescription?: string;
  language?: string;
  headings: string[];
  visibleTextExcerpt: string;
  structuredDataTypes: string[];
  fetchedAt: string;
  statusCode: number;
  contentHash: string;
}
```

Do not store complete page HTML in workspace state. Keep only bounded excerpts and evidence pointers required for review and audit.

## 7. Canonical bootstrap draft

```ts
interface ProjectBootstrapDraft {
  schemaVersion: 1;
  source: {
    type: "website";
    submittedUrl: string;
    canonicalUrl: string;
    fetchedAt: string;
    pageCount: number;
    contentHash: string;
  };
  project: ProposedProjectIdentity;
  business: ProposedBusinessProfile;
  services: ProposedService[];
  products: ProposedProduct[];
  audiences: ProposedAudience[];
  locations: ProposedLocation[];
  keywords: ProposedKeyword[];
  competitors: ProposedCompetitor[];
  opportunities: ProposedOpportunity[];
  trackingRecommendations: ProposedTrackingRecommendation[];
  warnings: BootstrapWarning[];
  extractionSummary: BootstrapExtractionSummary;
}
```

Every proposed value uses an evidence-aware envelope:

```ts
interface ProposedValue<T> {
  value: T;
  confidence: number; // 0..1
  basis: "explicit" | "structured_data" | "strong_inference" | "weak_inference" | "user_provided";
  evidence: EvidenceRef[];
  editable: boolean;
}

interface EvidenceRef {
  url: string;
  label?: string;
  excerpt?: string; // bounded, plain text
}
```

### 7.1 Project identity

Suggested fields:

- project name;
- website URL;
- primary language;
- industry/category;
- short business summary;
- operating model: local, ecommerce, SaaS, professional service, venue, publisher, or mixed;
- primary location or service area where explicit.

### 7.2 Business profile

Suggested fields:

- business name;
- one-sentence description;
- longer summary;
- value proposition;
- tone/brand traits;
- contact channels found publicly;
- public social profile links;
- opening hours where explicit;
- legal/business identifiers only when publicly displayed and useful.

### 7.3 Services and products

Keep services and products separate.

Each item may contain:

- name;
- normalized name;
- description;
- category;
- source URL;
- price text only when explicit;
- target audience references;
- location availability;
- confidence and evidence.

Initial caps:

- 30 services;
- 30 products;
- 300 characters description per item.

### 7.4 Audiences

Audience extraction is frequently inferential. The UI must distinguish:

- explicitly named audiences;
- strongly implied audiences;
- weak suggestions requiring confirmation.

Initial cap: 10 audience segments.

### 7.5 Locations

Locations may be:

- physical business locations;
- service areas;
- markets/countries;
- online/global.

Do not convert every address mention into a business location. Require explicit business context.

Initial cap: 20 locations.

### 7.6 Keywords

Phase 1C keywords are seed terms, not validated SEO opportunities.

Classify as:

- branded;
- service/product;
- location-modified;
- audience/problem;
- informational.

Do not claim search volume, ranking difficulty, or commercial value without a separate data source. Initial cap: 40 keywords.

### 7.7 Competitors

Competitor proposals are suggestions, not facts, unless the website explicitly compares or names them.

For the first implementation:

- allow up to 5 suggestions;
- require a rationale;
- mark source as explicit or inferred;
- do not fabricate domains;
- omit competitors when evidence is too weak.

External competitor discovery belongs primarily in Phase 2. Phase 1C should remain conservative.

### 7.8 First opportunities

Only create onboarding/setup opportunities that are directly supported by acquired evidence, for example:

- unclear or missing page title/description;
- absent service detail pages;
- missing contact/location clarity;
- missing FAQ where the business has complex services;
- missing analytics/GSC connection as a setup recommendation;
- incomplete business profile fields.

Do not turn Phase 1C into a full SEO audit. Cap at 10 initial opportunities.

## 8. Confidence model

Confidence must be deterministic enough to explain and bounded enough not to imply scientific certainty.

Recommended bands:

- `high`: 0.85-1.00;
- `medium`: 0.60-0.84;
- `low`: below 0.60.

Rules:

- explicit page text and valid structured data may support high confidence;
- cross-page agreement increases confidence;
- contradiction lowers confidence and creates a warning;
- inference-only audience, location, or competitor data cannot be high confidence;
- confidence is per field/item, not only global;
- Milo displays the basis and source evidence, not just a percentage.

The proposal also has a summary score for sorting only. It must never hide low-confidence sections.

## 9. Normalization rules

Normalization must not erase meaningful distinctions.

Examples:

- trim whitespace, normalize punctuation and casing;
- deduplicate exact and near-identical services while preserving aliases;
- normalize country/language codes;
- canonicalize URLs;
- preserve source wording separately from normalized labels;
- do not collapse distinct services merely because they share a parent category;
- do not translate content unless requested; store detected source language.

Every normalization rule should be deterministic and covered by fixtures.

## 10. Pending action payload

```ts
interface ProjectBootstrapPendingPayload {
  mode: "create_project" | "enrich_project";
  targetProjectId?: string;
  draft: ProjectBootstrapDraft;
  ownerSelections: BootstrapOwnerSelections;
  proposalVersion: number;
}

interface BootstrapOwnerSelections {
  includeProjectIdentity: boolean;
  includeBusinessProfile: boolean;
  serviceIds: string[];
  productIds: string[];
  audienceIds: string[];
  locationIds: string[];
  keywordIds: string[];
  competitorIds: string[];
  opportunityIds: string[];
  trackingRecommendationIds: string[];
}
```

At creation, selections default to conservative inclusion:

- high-confidence explicit values included;
- low-confidence inferred values excluded;
- competitor suggestions excluded unless explicit;
- warnings never excluded.

The owner may edit allowed fields and selections in Milo before approval. Edits are Milo owner actions and must update the pending action with an audit event.

## 11. MCP design

### 11.1 Recommended tool

Expose one new proposal tool:

```text
create_project_bootstrap_proposal
```

Required scope:

```text
milo.actions.propose
```

Required gates:

- `MCP_OAUTH_ENABLED=true`;
- `MCP_WRITE_TOOLS_ENABLED=true`;
- token explicitly granted `milo.actions.propose`.

With the write flag off:

- the tool is absent from `tools/list`;
- invocation returns the established unknown-tool response;
- OAuth metadata remains propose-free;
- DCR requesting propose remains `invalid_scope`.

### 11.2 Input schema

```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "required": ["websiteUrl", "requestId"],
  "properties": {
    "websiteUrl": { "type": "string", "minLength": 8, "maxLength": 2048 },
    "requestId": { "type": "string", "minLength": 1, "maxLength": 100 },
    "targetProjectId": { "type": "string", "maxLength": 100 },
    "preferredLanguage": { "type": "string", "maxLength": 20 },
    "businessNameHint": { "type": "string", "maxLength": 200 },
    "locationHint": { "type": "string", "maxLength": 200 }
  }
}
```

Unknown fields are rejected.

### 11.3 Tool result

Return a bounded summary, not the full extracted payload:

```json
{
  "actionId": "...",
  "status": "pending",
  "mode": "create_project",
  "canonicalUrl": "https://example.com/",
  "projectName": "Example",
  "sections": {
    "services": 6,
    "products": 0,
    "audiences": 3,
    "locations": 1,
    "keywords": 18,
    "competitors": 0,
    "opportunities": 4
  },
  "warnings": 2,
  "deduped": false
}
```

### 11.4 Idempotency

`requestId` follows the proven Phase 1A/1B semantics:

- same owner + client + tool + requestId returns the same action;
- no second crawl or proposal is created;
- replay returns `deduped:true`;
- request IDs are unique across non-terminal and terminal actions for the retention window.

### 11.5 No separate analyze-only MCP tool in the first slice

Avoid a tool that returns a complete website extraction directly to Claude. That creates large outputs, duplicates proposal logic, and increases leakage risk. The proposal tool should acquire, extract, persist a bounded review object, and return only a summary.

Read access to the full proposal remains through existing `get_pending_action` for the originating client under `milo.actions.propose`.

## 12. Owner review UI

Use `/app/actions` and the existing pending-action architecture.

### 12.1 Card summary

Show:

- `Project setup from website` type badge;
- proposed project name;
- canonical domain;
- mode: create or enrich;
- pages analyzed;
- section counts;
- confidence summary;
- warning count;
- proposer/client attribution;
- created and expiry timestamps.

### 12.2 Expanded review

Use sections:

1. Overview;
2. Business profile;
3. Services;
4. Products;
5. Audiences;
6. Locations;
7. Keywords;
8. Competitors;
9. First opportunities;
10. Tracking recommendations;
11. Warnings and source coverage.

Each item shows:

- proposed value;
- included/excluded control;
- confidence band;
- evidence basis;
- source link and short excerpt;
- edit control where permitted;
- current -> proposed diff in enrichment mode.

### 12.3 Owner editing

Owner edits are allowed before approval for setup content only.

Rules:

- edits update the pending action, not project state;
- every edit bumps `updatedAt` and `proposalVersion`;
- audit records section and field names, never secrets or long content values;
- approval confirmation shows the final selected counts;
- no bulk hidden defaults;
- owner can reset a field to Claude's original suggestion.

### 12.4 Confirmation

One explicit confirmation:

> Create this Milo project with 6 services, 3 audiences, 1 location, 18 seed keywords, and 4 first opportunities. Nothing will be published or changed outside Milo.

For enrichment mode, confirmation must identify the target project and count updates vs additions.

## 13. Deterministic apply

Apply must contain no model call, crawl, external fetch, or free-form execution.

### 13.1 Create mode

One `mutateWorkspace` operation should:

1. revalidate action status, expiry, payload schema, selections, and proposal version;
2. confirm no conflicting existing project identity according to the chosen duplicate policy;
3. mint all entity IDs before mutation for retry safety;
4. create one project;
5. create selected services/products in the project's supported structures;
6. create selected seed keywords, competitors, tracking recommendations, and opportunities in their canonical arrays;
7. mark the action `applied`;
8. record applied entity IDs and resulting workspace rev;
9. append bounded audit events.

All changes are atomic.

### 13.2 Enrich mode

One mutation should:

- verify the target project still exists;
- re-read current fields;
- apply only selected, whitelisted additions/merges;
- preserve existing values not explicitly changed;
- reject stale high-risk diffs when the target changed materially after proposal creation;
- never delete by omission.

### 13.3 Duplicate policy

Recommended first rule:

- canonical domain is the primary duplicate signal;
- if an existing project has the same canonical domain, create mode blocks and directs the owner to enrichment mode;
- similar names alone produce a warning, not an automatic block;
- duplicates within proposed child objects are removed deterministically before apply.

## 14. Data retention and size limits

A bootstrap proposal is materially larger than current Phase 1B actions. Workspace JSONB growth must be controlled.

Recommended limits:

- serialized bootstrap payload max 96 KB;
- preview/evidence excerpts max 16 KB total;
- maximum 20 source page evidence summaries;
- arrays capped as defined above;
- no raw HTML;
- no full fetched page bodies;
- retain applied/rejected bootstrap payloads for 30 days, then compact them to a resolution summary while preserving core audit evidence;
- pending proposals retain full review data until resolved/expired;
- existing global pending-action cap remains enforced, with a lower bootstrap-specific cap of 10 unresolved actions per workspace.

Compaction policy must be designed before implementation if workspace saves currently require old payloads to render resolved cards.

## 15. Security and privacy

Release blockers:

- SSRF protection and redirect revalidation;
- strict content-type and byte limits;
- no credential forwarding to target sites;
- no cookies from the user's browser;
- no authenticated crawl;
- no private network access;
- no raw HTML rendering in Milo;
- safe markdown/text rendering only;
- strict schema validation and unknown-field rejection;
- bounded evidence excerpts;
- owner/workspace isolation;
- originating OAuth client isolation for proposal reads;
- no secrets, tokens, full page content, or personal data in audit rows;
- avoid collecting personal data unless clearly public and necessary for business setup;
- redact email/phone values from generic operational logs.

Prompt-injection defense:

Website content is untrusted data, never instruction. The extraction layer must ignore page text that asks the model/tool to reveal secrets, call tools, alter policy, or perform unrelated actions. Source content cannot change tool scope, destination workspace, action type, caps, or apply behavior.

## 16. Audit model

Recommended events:

- `project_bootstrap_acquisition_started`;
- `project_bootstrap_acquisition_failed`;
- `pending_action_created` with type `project_bootstrap_proposal`;
- `project_bootstrap_owner_edited`;
- `project_bootstrap_owner_selection_changed`;
- `pending_action_rejected`;
- `pending_action_expired`;
- `pending_action_approved`;
- `project_bootstrap_applied`;
- `project_bootstrap_apply_failed`;
- `project_bootstrap_compacted`.

Audit fields may include:

- action ID;
- source type;
- canonical host, preferably hashed or bounded according to existing policy;
- target/create mode;
- counts per section;
- warning count;
- fields/sections changed;
- applied entity IDs where already allowed;
- workspace rev;
- machine reason code.

Never include:

- page body text;
- evidence excerpts;
- proposal field values;
- contact data;
- OAuth tokens, client secrets, refresh families, authorization codes, or headers.

## 17. Error contract

Reuse established MCP errors where possible.

Recommended machine reasons:

- `invalid_url`;
- `blocked_target`;
- `redirect_blocked`;
- `fetch_timeout`;
- `unsupported_content`;
- `site_unreachable`;
- `insufficient_public_content`;
- `payload_too_large`;
- `bootstrap_cap_reached`;
- `duplicate_project_domain`;
- `stale_proposal_version`;
- `target_project_changed`;
- `workspace_conflict`.

Errors must be bounded and must not echo fetched content, internal network details, stack traces, or secrets.

## 18. Rate limiting and abuse controls

Website acquisition is more expensive than ordinary MCP writes.

Recommendation:

- dedicated bootstrap bucket: 5 proposal creations per hour per token;
- 20 per day per workspace;
- one active acquisition per workspace/client;
- idempotent replay does not consume a new acquisition allowance;
- separate host-level concurrency limit;
- exponential backoff for transient target failures;
- no automatic retry for blocked/security failures;
- preserve the existing write bucket for insertion of the resulting action.

## 19. Observability

Operational metrics:

- acquisition started/succeeded/failed;
- fetch duration and page count;
- extraction duration;
- payload size;
- warning count;
- proposal creation rate;
- approval/rejection/expiry rate;
- owner edit frequency by section;
- apply success/conflict/failure;
- duplicate-domain blocks;
- SSRF/security blocks;
- compaction count and bytes saved.

Logs must use IDs, reason codes, counts, timings, and hashes—not fetched content.

## 20. Testing strategy

### 20.1 Unit fixtures

- URL normalization;
- private IP/metadata blocking;
- redirects to blocked targets;
- sitemap/navigation selection;
- content and page caps;
- language detection;
- JSON-LD extraction;
- service/product deduplication;
- confidence bands;
- contradiction warnings;
- schema unknown-field rejection;
- deterministic entity mapping;
- duplicate-domain policy;
- audit redaction;
- payload compaction.

### 20.2 Adversarial fixtures

- website text containing prompt injection;
- fake tool instructions in page content;
- huge HTML;
- decompression bomb indicators;
- redirect loops;
- DNS rebinding simulation;
- localhost/private host variants;
- malformed structured data;
- conflicting business names/addresses;
- personal blog mistaken for a business;
- multilingual site;
- empty JavaScript shell;
- login wall;
- website with no services or products.

### 20.3 Apply tests

- create project atomically;
- idempotent replay;
- conflict retry safety;
- duplicate canonical domain block;
- excluded sections create nothing;
- owner edits are the applied values;
- stale proposal version rejected;
- action status and entities never diverge;
- apply failure creates no partial project;
- rev increments once per successful apply mutation;
- audit rows contain no content leakage.

## 21. Recommended implementation slices

### 1C.1 — Contracts and threat model, docs/tests only

- canonical draft schema;
- evidence envelope;
- URL/SSRF rules;
- caps and error reasons;
- apply mapping matrix;
- fixtures for representative sites;
- no runtime registration.

### 1C.2 — Website acquisition and extraction service, internal only

- server-only fetcher;
- safe URL resolver;
- bounded crawler;
- extraction/normalization;
- fixture tests;
- no MCP tool and no UI visibility.

### 1C.3 — Dark proposal creation

- new pending-action type;
- strict payload validation;
- `create_project_bootstrap_proposal` tool;
- flag/scope gating;
- idempotency;
- bounded audits;
- no owner apply yet;
- deploy dark.

### 1C.4 — Read-only owner review UI

- bootstrap cards and section renderer;
- evidence/confidence/warnings;
- no edit or approve controls;
- fixture-backed UI QA.

### 1C.5 — Owner editing and selection

- edit pending payload safely;
- include/exclude controls;
- proposal versioning;
- edit audits;
- still no apply.

### 1C.6 — Deterministic create-mode apply

- project and child object mapping;
- duplicate-domain guard;
- atomic `mutateWorkspace` apply;
- audit and apply summary;
- deploy dark.

### 1C.7 — Live smoke window and rollback

- enable write tools temporarily;
- fresh propose-only DCR;
- Claude creates one project-bootstrap proposal;
- owner reviews, edits, approves;
- verify project/entities/rev/audits;
- verify idempotent replay and negative checks;
- darken flag;
- verify metadata/tools/DCR dark state;
- preserve evidence.

### 1C.8 — Enrichment mode

Ship only after create mode is live-proven. Add current -> proposed diffs and stale-target guards.

## 22. Live smoke acceptance criteria

A live smoke passes only if all are true:

- dark baseline is read-only/propose-free;
- flag-on DCR requires explicit `milo.actions.propose`;
- tool appears only for correctly scoped tokens;
- one website produces one pending bootstrap action;
- stable `requestId` replay returns the same action;
- evidence and confidence render correctly;
- owner can exclude and edit selected values;
- Claude cannot approve, apply, reject, publish, delete, or alter settings;
- one explicit owner confirmation creates the project atomically;
- selected entity counts match the final review;
- duplicate canonical domain is blocked;
- workspace rev is correct;
- audit contains no fetched values, secrets, tokens, contact data, or page content;
- malformed/blocked URLs create no action;
- rollback removes the tool and propose scope from live behavior while preserving owner data;
- existing Claude read connector remains healthy.

## 23. Decisions resolved by this blueprint

- Internal product concept: **AI Project Bootstrap**.
- First source adapter: public website URL.
- Approval system: reuse Phase 1B pending actions.
- Scope: reuse explicit-only `milo.actions.propose`.
- Runtime gate: reuse `MCP_WRITE_TOOLS_ENABLED`.
- MCP surface: one creation tool; existing list/get tools provide proposal visibility.
- Claude cannot resolve proposals.
- Apply is deterministic and atomic.
- Website content is untrusted evidence, never instruction.
- Competitor suggestions remain conservative in 1C; deeper discovery moves to Phase 2.
- Seed keywords do not claim volume/difficulty.
- Create mode ships before enrichment mode.
- No full HTML or page bodies in workspace state or audit.

## 24. Open decisions before coding

These must be resolved in a short follow-up decision record:

1. Exact mapping from bootstrap sections into the current project/workspace data structures.
2. Whether owner edits mutate the pending action in place or use a separate owner-overrides object while preserving the original draft.
3. Exact payload compaction timing and resolved-card requirements.
4. Whether acquisition/extraction runs synchronously within MCP request limits or via a bounded job model with polling.
5. Which existing server fetch/AI extraction infrastructure can be reused.
6. Initial supported site rendering model: static HTML only, or controlled rendered-page fallback.
7. Exact canonical-domain duplicate behavior for multi-location and multi-brand businesses.
8. Which contact fields, if any, belong in Milo project state.
9. Whether first opportunities are created as opportunities, tasks, recommendations, or a smaller bootstrap-specific object.
10. Exact internationalization and translation behavior for multilingual sites.

## 25. Stop conditions

Do not start implementation when any of these remain unresolved:

- no verified SSRF strategy;
- no canonical mapping to existing state structures;
- no bounded execution model for acquisition;
- no payload-size/retention plan;
- no deterministic apply map;
- no audit redaction tests;
- no representative and adversarial fixtures;
- any proposed design lets fetched content influence tool authorization or runtime execution.

## 26. Bottom line

Phase 1C should become Milo's reusable onboarding engine, not a one-off importer.

The smallest correct release is:

```text
public website
  -> bounded evidence
  -> canonical bootstrap draft
  -> Phase 1B pending action
  -> owner review/edit/select
  -> one explicit approval
  -> atomic project creation
  -> redacted audit
```

This preserves the safety model already proven in production while creating the foundation for Phase 2 audits, Phase 3 planning, Phase 4 content work, and Phase 5 analytics-driven actions.