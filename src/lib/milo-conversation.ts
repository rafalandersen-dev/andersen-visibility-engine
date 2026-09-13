import { z } from "zod";
import { specialistRoles } from "./specialist-team";
import { teamProjectTarget } from "./project-team-view";

const textBytes = (max: number) =>
  z
    .string()
    .max(max)
    .refine((text) => new TextEncoder().encode(text).byteLength <= max);
export const conversationTarget = teamProjectTarget.extend({ conversationId: z.string().uuid() });
export const conversationTurnTarget = conversationTarget.extend({ turnId: z.string().uuid() });
export const conversationSend = conversationTurnTarget.extend({
  body: textBytes(8000).refine((text) => text.trim().length > 0),
  locale: z.string().regex(/^[a-z]{2}$/),
  allowDraftGeneration: z.boolean().optional(),
});
export const conversationRead = conversationTarget.extend({
  after: z.number().int().min(0).max(500).default(0),
});
export const conversationList = teamProjectTarget.extend({
  offset: z.number().int().min(0).max(200).default(0),
});

// Events are server-authored evidence. Never accept event/role/tool/claim fields
// in a browser submission. Result destinations are a fixed internal allowlist.
export const conversationEvent = z
  .object({
    kind: z.enum(["handoff", "assistant", "tool", "status"]),
    role: z.enum(specialistRoles),
    text: textBytes(12000),
    operationId: z.string().uuid().optional(),
    code: z
      .enum([
        "analysing",
        "responding",
        "tool_started",
        "tool_result",
        "provider_unavailable",
        "usage_limit",
        "budget_unavailable",
        "execution_unknown",
        "history_partial",
      ])
      .optional(),
    tool: z
      .enum([
        "project_brief",
        "draft_read",
        "draft_seo_review",
        "draft_metadata_proposal",
        "project_knowledge",
        "weekly_preparation",
        "saved_audit",
        "draft_generation",
      ])
      .optional(),
    state: z
      .enum(["running", "completed", "unavailable", "approval_required", "unknown"])
      .optional(),
    reference: z
      .object({
        kind: z.enum([
          "project",
          "draft",
          "knowledge",
          "weekly",
          "audit",
          "generation",
          "draft_proposal",
        ]),
        id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ConversationEvent = z.infer<typeof conversationEvent>;
export const conversationEvents = z
  .array(conversationEvent)
  .max(24)
  .refine((events) => new TextEncoder().encode(JSON.stringify(events)).byteLength <= 120000);
export const conversationTurn = z
  .object({
    turnId: z.string().uuid(),
    ordinal: z.number().int().min(1).max(500),
    body: textBytes(8000),
    locale: z.string().regex(/^[a-z]{2}$/),
    allowDraftGeneration: z.boolean().optional(),
    state: z.enum(["pending", "running", "completed", "failed", "cancelled", "unknown"]),
    events: conversationEvents,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ConversationTurn = z.infer<typeof conversationTurn>;
export const conversationPage = conversationTarget
  .extend({
    actorId: z.string().uuid(),
    title: textBytes(800),
    turnCount: z.number().int().min(0).max(500),
    turns: z.array(conversationTurn).max(20),
    nextAfter: z.number().int().min(0).max(500),
    hasMore: z.boolean(),
  })
  .strict();
export const conversationDirectory = teamProjectTarget
  .extend({
    actorId: z.string().uuid(),
    conversations: z
      .array(
        z
          .object({
            conversationId: z.string().uuid(),
            title: textBytes(800),
            turnCount: z.number().int().min(0).max(500),
            createdAt: z.string().datetime({ offset: true }),
            updatedAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
