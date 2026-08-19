/**
 * Connector secret storage — SERVER ONLY (service role).
 *
 * Launch Gate P0-3 (and the WP/Shopify follow-up): connector credentials used
 * to live plaintext inside the client-writable workspace data, which ships to
 * the browser on every hydrate. They now live in
 * public.project_publish_secrets — RLS enabled with ZERO policies (deny-all;
 * only the service role reads or writes) — keyed by (user_id, project_id,
 * secret_name) and AES-256-GCM encrypted at rest via crypto.server.ts when the
 * encryption key is configured. The browser only ever learns the boolean "a
 * secret is set" (Project.publishSecretSet, wordpress.applicationPasswordSet,
 * shopify.adminAccessTokenSet).
 *
 * Legacy projects keep working: each resolver falls back to the old plaintext
 * workspace field when no stored row exists, and lazily migrates it into the
 * store on first use. The stored secret always WINS over the legacy field, so
 * a stale client copy re-writing old workspace data can never resurrect a
 * rotated secret.
 *
 * Never import this from client code.
 */
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto.server";
import type { Project } from "./types";

const TABLE = "project_publish_secrets";

/** The named secrets a project can hold. 'publish' is the pre-existing custom-connector secret. */
export type ProjectSecretName = "publish" | "wordpressAppPassword" | "shopifyAdminToken";

/**
 * Stored format: "v1.<ivB64>.<ctB64>" (encrypted) or "plain.<secret>" when no
 * encryption key is configured — still service-role-only and out of the
 * browser, which is strictly better than the workspace blob it replaces.
 */
const PLAIN_PREFIX = "plain.";

export async function encodeStoredSecret(secret: string): Promise<string> {
  if (isEncryptionConfigured()) return encryptSecret(secret);
  return `${PLAIN_PREFIX}${secret}`;
}

/** Decode a stored value. Returns "" for unknown formats or a failed decrypt. */
export async function decodeStoredSecret(stored: string): Promise<string> {
  if (!stored) return "";
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length);
  if (stored.startsWith("v1.")) return decryptSecret(stored);
  return "";
}

type Row = Record<string, unknown>;
type SelectChain = {
  eq: (c: string, v: string) => SelectChain;
  maybeSingle: () => Promise<{ data: Row | null; error: { message?: string } | null }>;
};
type Admin = {
  from: (t: string) => {
    select: (c: string) => SelectChain;
    upsert: (
      values: Row,
      options?: { onConflict?: string },
    ) => Promise<{ error: { message?: string } | null }>;
  };
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** Upsert one named secret for (user, project). Throws on failure so the UI can say so. */
export async function storeProjectSecret(
  userId: string,
  projectId: string,
  name: ProjectSecretName,
  secret: string,
): Promise<void> {
  const encoded = await encodeStoredSecret(secret);
  const db = await admin();
  const { error } = await db.from(TABLE).upsert(
    {
      user_id: userId,
      project_id: projectId,
      secret_name: name,
      secret: encoded,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,project_id,secret_name" },
  );
  if (error) throw new Error(`publish_secret_write_failed: ${error.message ?? "unknown"}`);
}

/** One stored named secret for (user, project), "" when absent or undecryptable. */
export async function readStoredProjectSecret(
  userId: string,
  projectId: string,
  name: ProjectSecretName,
): Promise<string> {
  try {
    const db = await admin();
    const { data, error } = await db
      .from(TABLE)
      .select("secret")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("secret_name", name)
      .maybeSingle();
    if (error || !data) return "";
    return decodeStoredSecret(String(data.secret ?? ""));
  } catch {
    return "";
  }
}

/** Upsert the custom-connector publish secret for (user, project). */
export async function storePublishSecret(
  userId: string,
  projectId: string,
  secret: string,
): Promise<void> {
  await storeProjectSecret(userId, projectId, "publish", secret);
}

/** The stored publish secret for (user, project), "" when absent or undecryptable. */
export async function readStoredPublishSecret(userId: string, projectId: string): Promise<string> {
  return readStoredProjectSecret(userId, projectId, "publish");
}

/**
 * Stored-first resolution with lazy legacy migration, shared by all three
 * resolvers below: the stored row when present, else the legacy plaintext
 * workspace field — which is then migrated into the store (best-effort; a
 * publish must not fail on a migration hiccup). The legacy field itself is
 * blanked by the client the next time settings are saved, not here: workspace
 * entities are client-merged by recency, so a server-side blank could be
 * silently undone by a stale tab.
 */
async function resolveStoredFirst(
  userId: string,
  projectId: string,
  name: ProjectSecretName,
  legacyValue: string | undefined,
): Promise<string> {
  const stored = await readStoredProjectSecret(userId, projectId, name);
  if (stored) return stored;
  const legacy = (legacyValue ?? "").trim();
  if (legacy) {
    try {
      await storeProjectSecret(userId, projectId, name, legacy);
    } catch {
      // Best-effort migration only.
    }
  }
  return legacy;
}

/** The effective custom-connector publish secret for a project. */
export async function resolvePublishSecret(
  userId: string,
  project: Pick<Project, "id" | "publishSecret">,
): Promise<string> {
  return resolveStoredFirst(userId, project.id, "publish", project.publishSecret);
}

/** The effective WordPress application password for a project. */
export async function resolveWordPressAppPassword(
  userId: string,
  project: Pick<Project, "id" | "wordpress">,
): Promise<string> {
  return resolveStoredFirst(
    userId,
    project.id,
    "wordpressAppPassword",
    project.wordpress?.applicationPassword,
  );
}

/** The effective Shopify Admin access token for a project. */
export async function resolveShopifyAdminToken(
  userId: string,
  project: Pick<Project, "id" | "shopify">,
): Promise<string> {
  return resolveStoredFirst(
    userId,
    project.id,
    "shopifyAdminToken",
    project.shopify?.adminAccessToken,
  );
}
