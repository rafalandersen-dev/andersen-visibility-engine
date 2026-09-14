import { z } from "zod";
import { teamProjectTarget } from "./project-team-view";

export const miloHomeSearch = z
  .object({
    owner: z.string().uuid().optional(),
    project: teamProjectTarget.shape.projectId.optional(),
    conversation: z.union([z.string().uuid(), z.literal("new")]).optional(),
  })
  .refine((value) => !!value.owner === !!value.project && (!value.conversation || !!value.owner));
type Scope = z.infer<typeof teamProjectTarget>;
const bookmark = teamProjectTarget.extend({ conversationId: z.string().uuid() });
const bookmarks = z.array(bookmark).max(64);
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

/** This is a navigation preference, never evidence of access. Keep only bounded
 * identifiers in this tab's session storage, without titles, prompts or answers.
 * Explicit URL targets always take precedence and still require server reads. */
function sessionStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}
function key(actor: string) {
  return `milo-conversation-location:${z.string().uuid().parse(actor)}`;
}
function read(actor: string, storage?: Storage) {
  const raw = storage?.getItem(key(actor));
  if (!raw || raw.length > 24000) return [];
  const result = bookmarks.safeParse(JSON.parse(raw));
  return result.success ? result.data : [];
}
export function rememberedMiloConversation(
  actor: string,
  scope: Scope,
  storage: Storage | undefined = sessionStorage(),
) {
  try {
    const target = teamProjectTarget.parse(scope);
    return read(actor, storage).find(
      (item) => item.ownerId === target.ownerId && item.projectId === target.projectId,
    )?.conversationId;
  } catch {
    return undefined;
  }
}
export function rememberMiloConversation(
  actor: string,
  scope: Scope,
  conversationId: string,
  storage: Storage | undefined = sessionStorage(),
) {
  try {
    const next = bookmark.parse({ ...scope, conversationId });
    let previous: z.infer<typeof bookmarks> = [];
    try {
      previous = read(actor, storage);
    } catch {
      // Replace malformed preference data without changing server state.
    }
    storage?.setItem(
      key(actor),
      JSON.stringify(
        [
          next,
          ...previous.filter(
            (item) => item.ownerId !== next.ownerId || item.projectId !== next.projectId,
          ),
        ].slice(0, 64),
      ),
    );
  } catch {
    // A blocked/full session store cannot block conversation navigation.
  }
}
export function forgetMiloConversation(
  actor: string,
  scope: Scope,
  storage: Storage | undefined = sessionStorage(),
) {
  try {
    const target = teamProjectTarget.parse(scope);
    storage?.setItem(
      key(actor),
      JSON.stringify(
        read(actor, storage).filter(
          (item) => item.ownerId !== target.ownerId || item.projectId !== target.projectId,
        ),
      ),
    );
  } catch {
    // Navigation still works if tab preferences are unavailable.
  }
}
export function miloConversationHref(scope: Scope, conversationId: string) {
  const input = miloHomeSearch.parse({
    owner: scope.ownerId,
    project: scope.projectId,
    conversation: conversationId,
  });
  return `/app?${new URLSearchParams({
    owner: input.owner!,
    project: input.project!,
    conversation: input.conversation!,
  })}`;
}
