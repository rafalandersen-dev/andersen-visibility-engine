import { z } from "zod";
import { specialistRoles, type SpecialistRole } from "./specialist-team";
import type { ConversationTurn } from "./milo-conversation";

const identity = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const specialistTool = z.discriminatedUnion("name", [
  z.object({ name: z.literal("project_brief") }).strict(),
  z.object({ name: z.literal("draft_read"), assetId: identity }).strict(),
  z.object({ name: z.literal("draft_seo_review"), assetId: identity }).strict(),
  z.object({ name: z.literal("project_knowledge") }).strict(),
  z.object({ name: z.literal("saved_audit") }).strict(),
  z
    .object({
      name: z.literal("weekly_preparation"),
      weekStart: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine(
          (v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
        ),
    })
    .strict(),
  z
    .object({
      name: z.literal("draft_generation"),
      opportunityId: identity,
      assetType: z.enum([
        "brief",
        "article",
        "servicePage",
        "landingPage",
        "faq",
        "comparison",
        "gbpPost",
        "meta",
        "socialPack",
      ]),
    })
    .strict(),
]);
export type SpecialistTool = z.infer<typeof specialistTool>;
export const specialistAssignment = z
  .object({
    role: z.enum(specialistRoles),
    task: z.string().trim().min(1).max(1500),
    tools: z.array(specialistTool).max(2),
  })
  .strict();
export type SpecialistAssignment = z.infer<typeof specialistAssignment>;
export const specialistPlan = z
  .object({
    handoff: z.string().trim().min(1).max(1200),
    assignments: z.array(specialistAssignment).min(1).max(2),
  })
  .strict()
  .superRefine((plan, context) => {
    if (new Set(plan.assignments.map((a) => a.role)).size !== plan.assignments.length)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate specialist" });
    const tools = plan.assignments.flatMap((assignment) => assignment.tools);
    if (
      tools.filter((tool) => tool.name === "draft_generation").length > 1 ||
      new Set(tools.map((tool) => JSON.stringify(tool))).size !== tools.length
    )
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate tool work" });
  });

export function toolAllowed(role: SpecialistRole, tool: SpecialistTool, owner: boolean) {
  if (
    ["project_knowledge", "weekly_preparation", "saved_audit", "draft_generation"].includes(
      tool.name,
    ) &&
    !owner
  )
    return false;
  if (tool.name === "draft_generation") return role === "content";
  if (tool.name === "draft_seo_review") return role === "seo" || role === "content";
  if (tool.name === "weekly_preparation") return ["lead", "research", "content"].includes(role);
  if (tool.name === "saved_audit") return ["seo", "research", "performance"].includes(role);
  return true;
}
export function toolCatalog(owner: boolean) {
  return [
    {
      name: "project_brief",
      arguments: {},
      purpose:
        "Read this project's safe brief and available draft IDs; owners also see saved content opportunity IDs.",
    },
    {
      name: "draft_read",
      arguments: { assetId: "saved draft ID" },
      purpose:
        "Read current authorized draft content, metadata and version; long content is labelled partial.",
    },
    {
      name: "draft_seo_review",
      arguments: { assetId: "saved draft ID" },
      purpose:
        "SEO/content specialist: compute structural checks on saved draft text, not live crawl or ranking measurements.",
    },
    ...(owner
      ? [
          {
            name: "project_knowledge",
            arguments: {},
            purpose: "Read current accepted project knowledge and source limitations; owner only.",
          },
          {
            name: "saved_audit",
            arguments: {},
            purpose:
              "SEO/research/performance specialist: read the latest saved audit; no new website fetch.",
          },
          {
            name: "weekly_preparation",
            arguments: { weekStart: "YYYY-MM-DD" },
            purpose:
              "Lead/research/content specialist: read weekly readiness; no scheduling or approval mutation.",
          },
          {
            name: "draft_generation",
            arguments: {
              opportunityId: "saved opportunity ID",
              assetType:
                "article|brief|servicePage|landingPage|faq|comparison|gbpPost|meta|socialPack",
            },
            purpose:
              "Content specialist: generate and retain ONE draft for an existing opportunity only when the user explicitly asks to generate it. Consumes generation allowance and money admission; never publishes.",
          },
        ]
      : []),
  ];
}
export function clipUtf8(text: string, bytes: number) {
  return new TextDecoder().decode(
    new TextEncoder().encode(text.slice(0, bytes)).subarray(0, bytes),
    { stream: true },
  );
}
/** Current task is supplied separately and is never truncated. Explicit counts
 * distinguish persisted history from the bounded history used in this request. */
export function specialistMemory(turns: ConversationTurn[], ordinal: number) {
  const recent = turns.filter((turn) => turn.ordinal < ordinal).slice(-12);
  const history: Array<{
    ordinal: number;
    user: string;
    state: string;
    replies: Array<{ role: string; text: string }>;
    receipts: Array<{ tool?: string; state?: string; reference?: unknown }>;
  }> = [];
  let bytes = 2,
    shortened = false;
  for (const turn of [...recent].reverse()) {
    const user = clipUtf8(turn.body, 1500);
    const sourceReplies = turn.events.filter((event) => event.kind === "assistant");
    const replies = sourceReplies
      .slice(-2)
      .map((event) => ({ role: event.role, text: clipUtf8(event.text, 2200) }));
    shortened ||=
      user !== turn.body ||
      sourceReplies.length > 2 ||
      replies.some((reply, index) => reply.text !== sourceReplies.slice(-2)[index].text);
    const sourceReceipts = turn.events.filter(
      (event) => event.kind === "tool" && event.state !== "running",
    );
    shortened ||= sourceReceipts.length > 5;
    const receipts = sourceReceipts
      .slice(-5)
      .map((event) => ({ tool: event.tool, state: event.state, reference: event.reference }));
    const row = { ordinal: turn.ordinal, user, state: turn.state, replies, receipts };
    const size = new TextEncoder().encode(JSON.stringify(row)).byteLength + 1;
    if (bytes + size > 12000) break;
    history.unshift(row);
    bytes += size;
  }
  return { history, omittedTurns: ordinal - 1 - history.length, shortened };
}

/** Escaping nested evidence also costs prompt bytes. Keep the current task
 * intact; mark any shortened context explicitly and leave room for instructions. */
export function serializeSpecialistContext(
  context: Record<string, unknown> & { userTask: string },
) {
  const original = JSON.stringify(context);
  if (new TextEncoder().encode(original).byteLength <= 56000) return original;
  const shorten = (value: unknown, limit: number): unknown => {
    if (typeof value === "string") return clipUtf8(value, limit);
    if (Array.isArray(value)) return value.map((item) => shorten(item, limit));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, shorten(item, limit)]),
      );
    return value;
  };
  for (const limit of [6000, 3000, 1500, 700]) {
    const shortened = {
      ...(shorten(context, limit) as Record<string, unknown>),
      userTask: context.userTask,
      contextShortened: true,
    };
    const encoded = JSON.stringify(shortened);
    if (new TextEncoder().encode(encoded).byteLength <= 56000) return encoded;
  }
  throw new Error("Conversation context exceeds its processing limit.");
}
