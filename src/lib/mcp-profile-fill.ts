import { z } from "zod";
import {
  validateProjectSetupPayload,
  PROJECT_SETUP_PROJECT_FIELDS,
  type ProjectSetupProposalPayload,
} from "./pending-actions";
import {
  brandProposal,
  brandProposalEntries,
  mergeBrandProposal,
  type BrandProposal,
} from "./brand-proposal";
import type { Project } from "./types";

const identity = z.string().trim().min(1).max(100);
export const profileFillSchema = z
  .object({
    projectId: identity,
    requestId: identity,
    payload: z
      .record(z.unknown())
      .superRefine((value, ctx) => {
        if (
          Object.keys(value).some((k) => k !== "projectFields" && k !== "brandIntelligence") ||
          new TextEncoder().encode(JSON.stringify(value)).byteLength > 16384
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Only bounded profile and brand fields are allowed",
          });
          return;
        }
        try {
          validateProjectSetupPayload(value);
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid profile fields" });
        }
      })
      .transform((value) => validateProjectSetupPayload(value)),
  })
  .strict();
export type ProfileFillReceipt = {
  requestId: string;
  fingerprint: string;
  filled: string[];
  requiresProposal: string[];
};
const knownFields = new Set<string>([
  ...PROJECT_SETUP_PROJECT_FIELDS,
  ...Object.entries(
    brandProposal.json.properties as Record<
      string,
      { type: string; properties?: Record<string, unknown> }
    >,
  ).flatMap(([group, shape]) =>
    shape.type === "object"
      ? Object.keys(shape.properties ?? {}).map((key) => `brandIntelligence.${group}.${key}`)
      : [`brandIntelligence.${group}`],
  ),
]);
const fieldNames = z.array(z.string().refine((value) => knownFields.has(value))).max(60);
const receiptsSchema = z
  .array(
    z
      .object({
        requestId: identity,
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        filled: fieldNames,
        requiresProposal: fieldNames,
      })
      .strict(),
  )
  .max(200);
export class ProfileFillError extends Error {
  constructor(readonly reason: "not_found" | "conflict" | "capacity") {
    super(reason);
  }
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const blank = (value: unknown) =>
  value == null ||
  (typeof value === "string" && !value.trim()) ||
  (Array.isArray(value) && value.length === 0);
export async function prepareProfileFill(input: z.infer<typeof profileFillSchema>) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical(input))),
  );
  return {
    input,
    fingerprint: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    ),
    now: new Date().toISOString(),
  };
}
/** Re-evaluate ownership inside every revision retry. Receipts never re-fill an owner-cleared field. */
export function applyProfileFill(
  data: Record<string, unknown>,
  prepared: Awaited<ReturnType<typeof prepareProfileFill>>,
) {
  const { input, fingerprint, now } = prepared;
  const projects = Array.isArray(data.projects) ? (data.projects as Project[]) : [];
  const project = projects.find((p) => p.id === input.projectId);
  if (!project) throw new ProfileFillError("not_found");
  const parsedReceipts = receiptsSchema.safeParse(project.mcpProfileFillRequests ?? []);
  if (!parsedReceipts.success) throw new ProfileFillError("conflict");
  const receipts = parsedReceipts.data;
  const previous = receipts.find((r) => r.requestId === input.requestId);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new ProfileFillError("conflict");
    return {
      data,
      result: {
        projectId: project.id,
        filled: previous.filled,
        requiresProposal: previous.requiresProposal,
        deduped: true,
        status: "previously_processed",
      },
    };
  }
  if (receipts.length >= 200) throw new ProfileFillError("capacity");
  const filled: string[] = [],
    requiresProposal: string[] = [];
  const fields: NonNullable<ProjectSetupProposalPayload["projectFields"]> = {};
  const brand: Record<string, unknown> = {};
  const accept = (name: string, current: unknown, proposed: unknown) => {
    if (blank(proposed) || same(current, proposed)) return false;
    if (!blank(current)) {
      requiresProposal.push(name);
      return false;
    }
    filled.push(name);
    return true;
  };
  for (const [key, value] of Object.entries(input.payload.projectFields ?? {})) {
    if (accept(key, project[key as keyof Project], value))
      Object.assign(fields, { [key]: structuredClone(value) });
  }
  for (const { field, value } of brandProposalEntries(input.payload.brandIntelligence)) {
    const [group, leaf] = field.split(".");
    const currentGroup = (
      project.brandIntelligence as unknown as Record<string, unknown> | undefined
    )?.[group];
    const current = leaf
      ? (currentGroup as Record<string, unknown> | undefined)?.[leaf]
      : currentGroup;
    if (!accept(`brandIntelligence.${field}`, current, value)) continue;
    if (leaf)
      brand[group] = {
        ...(brand[group] as Record<string, unknown> | undefined),
        [leaf]: structuredClone(value),
      };
    else brand[group] = structuredClone(value);
  }
  const receipt = {
    requestId: input.requestId,
    fingerprint,
    filled: filled.sort(),
    requiresProposal: requiresProposal.sort(),
  };
  const next = {
    ...project,
    ...fields,
    ...(Object.keys(brand).length
      ? {
          brandIntelligence: mergeBrandProposal(
            project.brandIntelligence,
            brand as BrandProposal,
            now,
          ),
        }
      : {}),
    mcpProfileFillRequests: [...receipts, receipt],
  };
  return {
    data: { ...data, projects: projects.map((p) => (p.id === project.id ? next : p)) },
    result: {
      projectId: project.id,
      filled: receipt.filled,
      requiresProposal: receipt.requiresProposal,
      deduped: false,
      status: "processed",
    },
  };
}
