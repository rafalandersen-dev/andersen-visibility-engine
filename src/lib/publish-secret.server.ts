/**
 * Custom-connector publish secret storage — SERVER ONLY (service role).
 *
 * Launch Gate P0-3: the publish secret used to live plaintext inside the
 * client-writable workspace data, which ships to the browser on every
 * hydrate. It now lives in public.project_publish_secrets — RLS enabled with
 * ZERO policies (deny-all; only the service role reads or writes) — and is
 * AES-256-GCM encrypted at rest via crypto.server.ts when the encryption key
 * is configured. The browser only ever learns the boolean "a secret is set"
 * (Project.publishSecretSet).
 *
 * Legacy projects keep working: resolvePublishSecret falls back to the old
 * plaintext Project.publishSecret field when no stored row exists, and
 * lazily migrates it into the store on first use. The stored secret always
 * WINS over the legacy field, so a stale client copy re-writing old workspace
 * data can never resurrect a rotated secret.
 *
 * Never import this from client code.
 */
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto.server";
import type { Project } from "./types";

const TABLE = "project_publish_secrets";

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
type Admin = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c: string,
          v: string,
        ) => {
          maybeSingle: () => Promise<{ data: Row | null; error: { message?: string } | null }>;
        };
      };
    };
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

/** Upsert the secret for (user, project). Throws on failure so the UI can say so. */
export async function storePublishSecret(
  userId: string,
  projectId: string,
  secret: string,
): Promise<void> {
  const encoded = await encodeStoredSecret(secret);
  const db = await admin();
  const { error } = await db.from(TABLE).upsert(
    {
      user_id: userId,
      project_id: projectId,
      secret: encoded,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,project_id" },
  );
  if (error) throw new Error(`publish_secret_write_failed: ${error.message ?? "unknown"}`);
}

/** The stored secret for (user, project), "" when absent or undecryptable. */
export async function readStoredPublishSecret(userId: string, projectId: string): Promise<string> {
  try {
    const db = await admin();
    const { data, error } = await db
      .from(TABLE)
      .select("secret")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (error || !data) return "";
    return decodeStoredSecret(String(data.secret ?? ""));
  } catch {
    return "";
  }
}

/**
 * The effective publish secret for a project: the stored row when present,
 * else the legacy plaintext field — which is then lazily migrated into the
 * store (best-effort; the publish must not fail on a migration hiccup). The
 * legacy field itself is blanked by the client the next time publishing
 * settings are saved, not here: workspace entities are client-merged by
 * recency, so a server-side blank could be silently undone by a stale tab.
 */
export async function resolvePublishSecret(
  userId: string,
  project: Pick<Project, "id" | "publishSecret">,
): Promise<string> {
  const stored = await readStoredPublishSecret(userId, project.id);
  if (stored) return stored;
  const legacy = (project.publishSecret ?? "").trim();
  if (legacy) {
    try {
      await storePublishSecret(userId, project.id, legacy);
    } catch {
      // Best-effort migration only.
    }
  }
  return legacy;
}
