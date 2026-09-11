import { z } from "zod";

const identity = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const short = z.string().max(1000);
const draftStatus = z.enum(["Draft", "In Review", "Approved", "Rejected", "Exported"]);
export const teamProjectTarget = z
  .object({ ownerId: z.string().uuid(), projectId: identity })
  .strict();

// Deliberate allowlists: Project carries legacy publish secrets, connector
// settings, billing-adjacent metadata and owner-only integration details.
// Never spread Project/ContentAsset or a workspace into a collaborator response.
const projectView = z.object({
  id: identity,
  name: short,
  businessName: short.default(""),
  description: z.string().max(16000).default(""),
  primaryLanguage: z.string().max(100).default("English"),
});
const draftSummary = z.object({
  id: identity,
  projectId: identity,
  title: short,
  status: draftStatus,
  updatedAt: z.string().max(100),
});
const draftDetail = draftSummary.extend({
  markdown: z.string().max(1000000),
  h1: short.default(""),
  metaTitle: short.default(""),
  metaDescription: z.string().max(4000).default(""),
  outline: z.array(short).max(100).default([]),
  faq: z
    .array(z.object({ q: short, a: z.string().max(16000) }))
    .max(100)
    .default([]),
  cta: z.string().max(16000).default(""),
  // Media is identified here; URLs/bytes require a separate scoped reader.
  // Storage paths, signed URLs and import receipts are never copied implicitly.
  images: z
    .array(
      z.object({
        id: z.string(),
        alt: z.string().max(4000).default(""),
        caption: z.string().max(4000).optional(),
      }),
    )
    .default([]),
});

/** Projection only, not authorization. Server entry points must resolve an
 * active membership and fetch only this owner's project before calling. */
export function projectTeamList(
  target: z.infer<typeof teamProjectTarget>,
  rawProject: unknown,
  rawDrafts: unknown,
  remaining: number,
) {
  const scope = teamProjectTarget.parse(target);
  const project = projectView.parse(rawProject);
  const drafts = z.array(draftSummary).max(100).parse(rawDrafts);
  z.number().int().min(0).max(100000).parse(remaining);
  if (
    project.id !== scope.projectId ||
    drafts.some((d) => d.projectId !== scope.projectId) ||
    new Set(drafts.map((d) => d.id)).size !== drafts.length
  )
    throw new Error("team_project_scope");
  return { project, drafts, remaining };
}

/** Never deserialize a member's update as a full owner workspace mutation. */
export function projectTeamDraft(
  target: z.infer<typeof teamProjectTarget>,
  assetId: string,
  rawDraft: unknown,
) {
  const scope = teamProjectTarget.parse(target);
  identity.parse(assetId);
  const draft = draftDetail.parse(rawDraft);
  if (draft.id !== assetId || draft.projectId !== scope.projectId)
    throw new Error("team_project_scope");
  if (new TextEncoder().encode(JSON.stringify(draft)).byteLength > 2000000)
    throw new Error("team_draft_too_large");
  return draft;
}
