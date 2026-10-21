/**
 * Trust-boundary checks for the Lovable-generated preview auth broker
 * (`previewAuthStorage.ts`, 30 September Lovable delta). Synthetic hosts, origins and
 * token strings only; no real session. The broker must:
 * - keep plain localStorage for SSR, custom domains, localhost, unframed previews
 *   and user-named preview hosts;
 * - post session values only to a validated Lovable editor origin (never "*" or an
 *   arbitrary embedder) and accept replies only from that origin with its requestId;
 * - honour the logout tombstone, fall back to localStorage on silence, and remove
 *   every message listener it adds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brokeredPreviewStorage } from "./previewAuthStorage";

const PROJECT = "06b696f6-c02b-468f-b0a0-7ab8af92d6a0";
type Posted = { msg: Record<string, unknown>; origin: string };

function setup({
  host,
  framed = true,
  ancestor,
  referrer = "",
}: {
  host: string;
  framed?: boolean;
  ancestor?: string;
  referrer?: string;
}) {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const listeners = new Set<(e: MessageEvent) => void>();
  const posted: Posted[] = [];
  const parent = {
    postMessage: (msg: Record<string, unknown>, origin: string) => posted.push({ msg, origin }),
  };
  const win: Record<string, unknown> = {
    addEventListener: (_t: string, fn: (e: MessageEvent) => void) => listeners.add(fn),
    removeEventListener: (_t: string, fn: (e: MessageEvent) => void) => listeners.delete(fn),
  };
  win.parent = framed ? parent : win;
  vi.stubGlobal("window", win);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("location", {
    hostname: host,
    ancestorOrigins: ancestor ? { 0: ancestor, length: 1 } : undefined,
  });
  vi.stubGlobal("document", { referrer });
  const reply = (origin: string, data: Record<string, unknown>) => {
    for (const fn of [...listeners]) fn({ origin, data } as MessageEvent);
  };
  return { store, listeners, posted, reply, localStorage };
}
const lastRequest = (posted: Posted[]) => posted[posted.length - 1].msg;
const resultFor = (requestId: unknown, value: string | null) => ({
  type: "lovable-preview-auth:result",
  requestId,
  ok: true,
  value,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("which surfaces use the broker", () => {
  it("returns undefined during SSR", () => {
    expect(brokeredPreviewStorage()).toBeUndefined();
  });
  it.each([
    ["custom domain", "milogrowth.com"],
    ["localhost", "localhost"],
    ["published lovable.app subdomain", "milo-growth.lovable.app"],
    ["user-named preview host", `preview--${PROJECT}.lovable.app`],
    ["UUID not at a trusted position", `x${PROJECT}.lovableproject.com`],
  ])("%s keeps plain localStorage", (_label, host) => {
    const env = setup({ host, ancestor: "https://lovable.dev" });
    expect(brokeredPreviewStorage()).toBe(env.localStorage);
  });
  it("an unframed preview keeps plain localStorage", () => {
    const env = setup({ host: `id-preview--${PROJECT}.lovable.app`, framed: false });
    expect(brokeredPreviewStorage()).toBe(env.localStorage);
  });
  it.each([
    `id-preview--${PROJECT}.lovable.app`,
    `id-preview-8776fd09--${PROJECT}.lovable.app`,
    `project--${PROJECT}.lovable.app`,
    `${PROJECT}.lovableproject.com`,
  ])("a framed editor preview %s is brokered with that project id", async (host) => {
    const env = setup({ host, ancestor: "https://lovable.dev" });
    const storage = brokeredPreviewStorage() as { getItem: (k: string) => Promise<string | null> };
    expect(storage).not.toBe(env.localStorage);
    const pending = storage.getItem("sb-auth");
    expect(lastRequest(env.posted)).toMatchObject({
      type: "lovable-preview-auth:get",
      projectId: PROJECT,
      key: "sb-auth",
    });
    env.reply("https://lovable.dev", resultFor(lastRequest(env.posted).requestId, "token-a"));
    await expect(pending).resolves.toBe("token-a");
  });
});

describe("origin trust", () => {
  const host = `id-preview--${PROJECT}.lovable.app`;
  type Storage = {
    getItem: (k: string) => Promise<string | null>;
    setItem: (k: string, v: string) => Promise<void>;
    removeItem: (k: string) => Promise<void>;
  };

  it.each([
    "https://evil.example",
    "https://lovable.dev.evil.example",
    "https://evil-lovable.dev",
    "http://lovable.dev",
    "http://localhost:3000",
  ])("an untrusted ancestor %s never receives a session value", async (ancestor) => {
    const env = setup({ host, ancestor });
    const storage = brokeredPreviewStorage() as Storage;
    void storage.setItem("sb-auth", "secret-token");
    expect(env.posted.length).toBeGreaterThan(0);
    for (const p of env.posted) expect(p.origin).toBe("https://lovable.dev");
  });

  it("uses the referrer origin only when it is a Lovable editor origin", () => {
    const trusted = setup({ host, referrer: "https://app.lovable.dev/projects/x" });
    void (brokeredPreviewStorage() as Storage).removeItem("k");
    expect(trusted.posted.map((p) => p.origin)).toEqual(["https://app.lovable.dev"]);
    vi.unstubAllGlobals();
    const untrusted = setup({ host, referrer: "https://evil.example/page" });
    void (brokeredPreviewStorage() as Storage).removeItem("k");
    expect(untrusted.posted.map((p) => p.origin)).toEqual(["https://lovable.dev"]);
  });

  it("trusts localhost:3000 only on development preview zones", () => {
    const dev = setup({ host: `id-preview--${PROJECT}.lovableproject-dev.com` });
    void (brokeredPreviewStorage() as Storage).removeItem("k");
    expect(dev.posted.map((p) => p.origin).sort()).toEqual([
      "http://localhost:3000",
      "https://lovable.dev",
    ]);
  });

  it("ignores replies from other origins or with another requestId, then falls back", async () => {
    const env = setup({ host, ancestor: "https://lovable.dev" });
    env.store.set("sb-auth", "local-token");
    const storage = brokeredPreviewStorage() as Storage;
    const pending = storage.getItem("sb-auth");
    const { requestId } = lastRequest(env.posted);
    env.reply("https://evil.example", resultFor(requestId, "forged"));
    env.reply("https://lovable.dev", resultFor("other-request", "forged"));
    await vi.advanceTimersByTimeAsync(2000 + 250 + 2000);
    await expect(pending).resolves.toBe("local-token");
    expect(env.posted).toHaveLength(2); // first get is retried once
    expect(env.listeners.size).toBe(0);
  });
});

describe("tombstone, fallback and cleanup", () => {
  const host = `id-preview--${PROJECT}.lovable.app`;
  const make = () => {
    const env = setup({ host, ancestor: "https://lovable.dev" });
    const storage = brokeredPreviewStorage() as {
      getItem: (k: string) => Promise<string | null>;
      setItem: (k: string, v: string) => Promise<void>;
      removeItem: (k: string) => Promise<void>;
    };
    const answer = (value: string | null) =>
      env.reply("https://lovable.dev", resultFor(lastRequest(env.posted).requestId, value));
    return { env, storage, answer };
  };

  it("the logout tombstone clears the local copy and returns null", async () => {
    const { env, storage, answer } = make();
    env.store.set("sb-auth", "stale-token");
    const pending = storage.getItem("sb-auth");
    answer("");
    await expect(pending).resolves.toBeNull();
    expect(env.store.has("sb-auth")).toBe(false);
  });

  it("a never-synced (null) reply keeps the local value; only the first get retries", async () => {
    const { env, storage, answer } = make();
    env.store.set("sb-auth", "local-token");
    const first = storage.getItem("sb-auth");
    answer(null);
    await expect(first).resolves.toBe("local-token");
    const second = storage.getItem("sb-auth");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(second).resolves.toBe("local-token");
    expect(env.posted).toHaveLength(2);
  });

  it("setItem writes locally first and adopts the broker's value only if local is unchanged", async () => {
    const { env, storage, answer } = make();
    const done = storage.setItem("sb-auth", "mine");
    expect(env.store.get("sb-auth")).toBe("mine");
    expect(lastRequest(env.posted)).toMatchObject({
      type: "lovable-preview-auth:set",
      value: "mine",
    });
    answer("editor-newer");
    await done;
    expect(env.store.get("sb-auth")).toBe("editor-newer");

    const raced = storage.setItem("sb-auth", "second");
    env.store.set("sb-auth", "changed-meanwhile");
    answer("editor-value");
    await raced;
    expect(env.store.get("sb-auth")).toBe("changed-meanwhile");
  });

  it("removeItem clears local and asks the broker to remove", async () => {
    const { env, storage } = make();
    env.store.set("sb-auth", "token");
    const done = storage.removeItem("sb-auth");
    expect(env.store.has("sb-auth")).toBe(false);
    expect(lastRequest(env.posted)).toMatchObject({ type: "lovable-preview-auth:remove" });
    await vi.advanceTimersByTimeAsync(2000);
    await done;
  });

  it("removes every listener after replies and timeouts", async () => {
    const { env, storage, answer } = make();
    const a = storage.getItem("a");
    answer("x");
    await a;
    const b = storage.setItem("b", "y");
    const c = storage.removeItem("c");
    expect(env.listeners.size).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all([b, c]);
    expect(env.listeners.size).toBe(0);
  });
});
