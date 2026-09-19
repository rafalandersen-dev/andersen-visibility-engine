import { z } from "zod";
import { conversationTarget, conversationTurn } from "./milo-conversation";
import { metadataFields, metadataPatch } from "./milo-draft-proposal";

export const conversationExportRequest = conversationTarget
  .extend({
    after: z.number().int().min(0).max(500).default(0),
    version: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .refine((input) => input.after === 0 || !!input.version);
const exportedProposal = z
  .object({
    proposalId: z.string().uuid(),
    assetId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    before: metadataFields,
    fields: metadataPatch,
    explanation: z.string().min(1).max(1500),
    createdAt: z.string().datetime({ offset: true }),
    appliedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .refine(
    (proposal) =>
      Object.keys(proposal.before).sort().join() === Object.keys(proposal.fields).sort().join(),
  );
export const conversationExportPage = conversationTarget
  .extend({
    actorId: z.string().uuid(),
    title: z.string().max(800),
    version: z.string().regex(/^[a-f0-9]{64}$/),
    observedAt: z.string().datetime({ offset: true }),
    turnCount: z.number().int().min(0).max(500),
    nextAfter: z.number().int().min(0).max(500),
    hasMore: z.boolean(),
    entries: z
      .array(
        z
          .object({
            turn: conversationTurn,
            proposal: exportedProposal.nullable(),
            omittedProposals: z.number().int().min(0).max(1),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export const conversationErased = conversationTarget
  .extend({
    actorId: z.string().uuid(),
    erased: z.literal(true),
  })
  .strict();

function sameScope(
  actor: string,
  target: z.infer<typeof conversationTarget>,
  result: z.infer<typeof conversationTarget> & { actorId: string },
) {
  if (
    result.actorId !== actor ||
    result.ownerId !== target.ownerId ||
    result.projectId !== target.projectId ||
    result.conversationId !== target.conversationId
  )
    throw new Error("Conversation access could not be confirmed.");
}
export function checkedConversationErasure(
  actor: string,
  target: z.infer<typeof conversationTarget>,
  raw: unknown,
) {
  const result = conversationErased.parse(raw);
  sameScope(actor, target, result);
  return result;
}
export function checkedConversationExportPage(
  actor: string,
  rawInput: z.input<typeof conversationExportRequest>,
  raw: unknown,
) {
  const input = conversationExportRequest.parse(rawInput),
    result = conversationExportPage.parse(raw);
  sameScope(actor, input, result);
  if (
    (input.version && input.version !== result.version) ||
    input.after > result.turnCount ||
    result.entries.length !== Math.min(20, result.turnCount - input.after) ||
    result.nextAfter !== input.after + result.entries.length ||
    result.hasMore !== result.nextAfter < result.turnCount ||
    result.entries.some(
      (entry, index) =>
        entry.turn.ordinal !== input.after + index + 1 ||
        (entry.proposal !== null && entry.omittedProposals !== 0),
    )
  )
    throw new Error("Conversation export could not be confirmed.");
  return result;
}

/** No partial download: bounded ordered pages plus a final authenticated fence.
 * The file records historical proposals, never current permission to apply them. */
export async function buildConversationExport(
  actor: string,
  rawTarget: z.infer<typeof conversationTarget>,
  read: (input: z.infer<typeof conversationExportRequest>) => Promise<unknown>,
  signal: AbortSignal,
) {
  const target = conversationTarget.parse(rawTarget);
  z.string().uuid().parse(actor);
  let first: z.infer<typeof conversationExportPage> | undefined;
  let after = 0,
    totalBytes = 0,
    omitted = 0;
  const parts: string[] = [],
    turnIds = new Set<string>(),
    proposalIds = new Set<string>();
  const checkLive = () => {
    if (signal.aborted) throw new Error("Conversation export cancelled.");
  };
  for (let pageIndex = 0; pageIndex < 25; pageIndex++) {
    checkLive();
    const input = { ...target, after, ...(first ? { version: first.version } : {}) };
    const page = checkedConversationExportPage(actor, input, await read(input));
    checkLive();
    first ??= page;
    if (page.title !== first.title || page.turnCount !== first.turnCount)
      throw new Error("Conversation export changed.");
    for (const entry of page.entries) {
      if (
        turnIds.has(entry.turn.turnId) ||
        (entry.proposal && proposalIds.has(entry.proposal.proposalId))
      )
        throw new Error("Conversation export has duplicate records.");
      turnIds.add(entry.turn.turnId);
      if (entry.proposal) proposalIds.add(entry.proposal.proposalId);
      const serialized = JSON.stringify(entry);
      totalBytes += new TextEncoder().encode(serialized).byteLength;
      if (totalBytes > 96 * 1024 * 1024) throw new Error("Conversation export is too large.");
      parts.push(serialized);
      omitted += entry.omittedProposals;
    }
    after = page.nextAfter;
    if (!page.hasMore) break;
  }
  if (!first || after !== first.turnCount) throw new Error("Conversation export is incomplete.");
  checkLive();
  const finalInput = { ...target, after, version: first.version };
  const final = checkedConversationExportPage(actor, finalInput, await read(finalInput));
  checkLive();
  if (final.turnCount !== first.turnCount || final.title !== first.title)
    throw new Error("Conversation export changed.");
  const header = JSON.stringify({
    format: "milo-conversation-v1",
    actorId: actor,
    ...target,
    title: first.title,
    observedAt: final.observedAt,
    version: first.version,
    turnCount: first.turnCount,
    omittedProposals: omitted,
    scope:
      "Stored conversation messages, execution receipts and historical draft proposals. Proposals for drafts no longer in this project are omitted. This export grants no permission to apply or publish. Linked drafts, generated files, billing and provider records are stored separately.",
  });
  // Blob parts avoid allocating another string containing the full history.
  const blob = new Blob(
    [
      header.slice(0, -1),
      ',"entries":[',
      ...parts.flatMap((part, i) => (i ? [",", part] : [part])),
      "]}",
    ],
    { type: "application/json;charset=utf-8" },
  );
  return { blob, filename: `milo-conversation-${target.conversationId}.json` };
}
