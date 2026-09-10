import { brandRecordPatch, mappedBrandField } from "./knowledge-brand";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { knowledgeRecordSchema } from "./project-knowledge";

const project = z.object({ projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }).strict();
const revision = z.number().int().min(1).max(9999);
const item = project.extend({ id: z.string().uuid(), expectedRevision: revision });
const fields = knowledgeRecordSchema
  .innerType()
  .pick({
    key: true,
    category: true,
    appliesTo: true,
    value: true,
    locator: true,
    excerpt: true,
    validUntil: true,
  })
  .superRefine((record, context) => {
    if (mappedBrandField(record.key) && !brandRecordPatch(record))
      context.addIssue({ code: "custom", message: "Invalid canonical brand field value" });
  });

export const buildWebsiteKnowledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.extend({ url: z.string().max(2000) }).parse(v))
  .handler(async ({ data, context }) => {
    const { captureProjectWebsiteKnowledge } = await import("./project-knowledge-website.server");
    return captureProjectWebsiteKnowledge(
      { ownerId: context.userId, projectId: data.projectId },
      data.url,
    );
  });

export const readKnowledgeDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => item.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectKnowledgeDocument } = await import("./project-knowledge.server");
    return readProjectKnowledgeDocument(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
      data.expectedRevision,
    );
  });

export const readProjectKnowledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.parse(v))
  .handler(async ({ data, context }) => {
    const { readProjectKnowledge } = await import("./project-knowledge.server");
    return readProjectKnowledge({ ownerId: context.userId, projectId: data.projectId });
  });

export const uploadKnowledgeDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project
      .extend({
        id: z.string().uuid(),
        expectedRevision: z.number().int().min(0).max(9999),
        label: z.string().trim().min(1).max(200),
        base64: z.string().min(4).max(6990508),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { saveProjectKnowledgeDocument } = await import("./project-knowledge.server");
    const { projectId, ...input } = data;
    return saveProjectKnowledgeDocument({ ownerId: context.userId, projectId }, input);
  });

export const proposeKnowledgeRecordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project
      .extend({
        id: z.string().uuid(),
        sourceId: z.string().uuid(),
        sourceRevision: revision,
        fields,
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { writeProjectKnowledge } = await import("./project-knowledge.server");
    const scope = { ownerId: context.userId, projectId: data.projectId };
    return writeProjectKnowledge(
      scope,
      "record",
      {
        ...scope,
        ...data.fields,
        id: data.id,
        revision: 1,
        sourceId: data.sourceId,
        sourceRevision: data.sourceRevision,
        status: "proposed",
        updatedAt: new Date().toISOString(),
      },
      0,
    );
  });

export const teachProjectKnowledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => project.extend({ fields }).parse(v))
  .handler(async ({ data, context }) => {
    const { writeProjectKnowledgePair } = await import("./project-knowledge.server");
    const scope = { ownerId: context.userId, projectId: data.projectId };
    const now = new Date().toISOString();
    const bytes = new TextEncoder().encode(JSON.stringify(data.fields));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    const sourceId = crypto.randomUUID();
    const result = await writeProjectKnowledgePair(
      scope,
      {
        ...scope,
        id: sourceId,
        revision: 1,
        kind: "owner",
        label: "Owner instruction",
        status: "active",
        observedAt: now,
        fingerprint: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(
          "",
        ),
      },

      {
        ...scope,
        ...data.fields,
        id: crypto.randomUUID(),
        revision: 1,
        sourceId,
        sourceRevision: 1,
        status: "accepted",
        updatedAt: now,
        reviewedAt: now,
      },
      0,
      0,
    );
    return result.record;
  });

export const reviewProjectKnowledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    item
      .extend({ fields, status: z.enum(["accepted", "rejected", "disputed", "expired"]) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { readProjectKnowledge, writeProjectKnowledge, KnowledgeUnavailableError } =
      await import("./project-knowledge.server");
    const scope = { ownerId: context.userId, projectId: data.projectId };
    const state = await readProjectKnowledge(scope);
    const record = state.records.find(
      (r) => r.id === data.id && r.revision === data.expectedRevision,
    );
    if (!record) throw new KnowledgeUnavailableError();
    const now = new Date().toISOString();
    return writeProjectKnowledge(
      scope,
      "record",
      {
        ...record,
        ...data.fields,
        status: data.status,
        revision: data.expectedRevision + 1,
        updatedAt: now,
        reviewedAt: now,
      },
      data.expectedRevision,
    );
  });

export const revokeProjectKnowledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => item.parse(v))
  .handler(async ({ data, context }) => {
    const { revokeProjectKnowledgeSource } = await import("./project-knowledge.server");
    return revokeProjectKnowledgeSource(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
      data.expectedRevision,
    );
  });

export const forgetProjectKnowledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => item.extend({ kind: z.enum(["source", "record"]) }).parse(v))
  .handler(async ({ data, context }) => {
    const { forgetProjectKnowledge } = await import("./project-knowledge.server");
    await forgetProjectKnowledge(
      { ownerId: context.userId, projectId: data.projectId },
      data.kind,
      data.id,
      data.expectedRevision,
    );
    return { forgotten: true };
  });

export const knowledgeHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    project
      .extend({
        id: z.string().uuid(),
        kind: z.enum(["source", "record"]),
        before: revision.optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { readProjectKnowledgeHistory } = await import("./project-knowledge.server");
    return readProjectKnowledgeHistory(
      { ownerId: context.userId, projectId: data.projectId },
      data.kind,
      data.id,
      data.before,
    );
  });

export const revertProjectKnowledgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => item.extend({ restoreRevision: revision }).parse(v))
  .handler(async ({ data, context }) => {
    const { revertProjectKnowledgeRecord } = await import("./project-knowledge.server");
    return revertProjectKnowledgeRecord(
      { ownerId: context.userId, projectId: data.projectId },
      data.id,
      data.expectedRevision,
      data.restoreRevision,
    );
  });
