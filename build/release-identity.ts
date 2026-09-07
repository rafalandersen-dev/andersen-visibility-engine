import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
export interface ReleaseIdentity {
  fingerprint: string | null;
  algorithm: "milo-source-v1";
  revision: string | null;
  modified: boolean | null;
  /** Fixed public input groups; hashes only, no file contents or environment. */
  components: Record<string, string | null> | null;
}
// Deliberately excludes environment files, credentials, .git contents and dependencies.
// This identifies bundled application inputs; it cannot prove runtime configuration.
const inputs = [
  "src",
  "public",
  "build",
  "vite.config.ts",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "bunfig.toml",
];
const excluded = (name: string) =>
  name.startsWith(".env") || name === "node_modules" || name === ".git";
export function sourceFingerprint(root: string, selected: readonly string[] = inputs): string {
  const files: string[] = [];
  const walk = (path: string) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("source_identity_symlink");
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) if (!excluded(name)) walk(join(path, name));
    } else if (stat.isFile()) files.push(path);
  };
  for (const name of selected) if (existsSync(join(root, name))) walk(join(root, name));
  if (!existsSync(join(root, "src")) || !existsSync(join(root, "package.json")))
    throw new Error("source_identity_incomplete");
  const entries = files
    .map((path) => ({ path, name: relative(root, path).split(sep).join("/") }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const hash = createHash("sha256");
  hash.update("milo-source-v1\0");
  for (const entry of entries) {
    const data = readFileSync(entry.path);
    hash.update(entry.name);
    hash.update("\0");
    hash.update(String(data.byteLength));
    hash.update("\0");
    hash.update(data);
    hash.update("\0");
  }
  return hash.digest("hex");
}
export function releaseIdentity(root = process.cwd()): ReleaseIdentity {
  const result: ReleaseIdentity = {
    fingerprint: null,
    algorithm: "milo-source-v1",
    revision: null,
    modified: null,
    components: null,
  };
  try {
    result.fingerprint = sourceFingerprint(resolve(root));
    result.components = Object.fromEntries(
      inputs.map((name) => [
        name,
        existsSync(join(root, name)) ? sourceFingerprint(resolve(root), [name]) : null,
      ]),
    );
  } catch {
    /* expose unknown, never fabricate an identity */
  }
  if (existsSync(join(root, ".git"))) {
    try {
      const options = {
        cwd: root,
        encoding: "utf8" as const,
        stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"],
        timeout: 2000,
      };
      const revision = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
      if (/^[a-f0-9]{40}$/.test(revision)) {
        result.revision = revision;
        result.modified =
          execFileSync(
            "git",
            ["status", "--porcelain", "--untracked-files=all", "--", ...inputs],
            options,
          ).trim().length > 0;
      }
    } catch {
      /* exported source archives may not carry Git metadata */
    }
  }
  return result;
}
