import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { releaseIdentity, sourceFingerprint } from "../../build/release-identity";
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "milo-identity-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "package.json"), '{"name":"fixture"}');
  writeFileSync(join(root, "src", "app.ts"), "export const answer=42;");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe("release identity", () => {
  it("produces stable fingerprints without inventing a commit for exported sources", () => {
    const one = releaseIdentity(root);
    expect(one.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(releaseIdentity(root)).toEqual(one);
    expect(one.revision).toBeNull();
    expect(one.modified).toBeNull();
  });
  it("detects changed bundled source", () => {
    const before = sourceFingerprint(root);
    writeFileSync(join(root, "src", "app.ts"), "export const answer=43;");
    expect(sourceFingerprint(root)).not.toBe(before);
  });
  it("detects file renames even when their content is unchanged", () => {
    const before = sourceFingerprint(root);
    renameSync(join(root, "src", "app.ts"), join(root, "src", "other.ts"));
    expect(sourceFingerprint(root)).not.toBe(before);
  });
  it("includes lockfile changes", () => {
    const before = sourceFingerprint(root);
    writeFileSync(join(root, "package-lock.json"), '{"version":2}');
    expect(sourceFingerprint(root)).not.toBe(before);
  });
  it("ignores credentials/environment, dependency trees and evidence documents", () => {
    const before = sourceFingerprint(root);
    writeFileSync(join(root, ".env"), "PRIVATE=test-fixture");
    writeFileSync(join(root, "src", ".env.local"), "PRIVATE=other-test-fixture");
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "node_modules", "example"), "ignored");
    mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "evidence", "report.md"), "notes");
    expect(sourceFingerprint(root)).toBe(before);
  });
  it("refuses to fingerprint symlinks outside the input tree", () => {
    symlinkSync(join(root, "package.json"), join(root, "src", "linked"));
    expect(() => sourceFingerprint(root)).toThrow("source_identity_symlink");
    expect(releaseIdentity(root).fingerprint).toBeNull();
  });
  it("does not provide a false identity for an incomplete checkout", () => {
    rmSync(join(root, "package.json"));
    expect(releaseIdentity(root).fingerprint).toBeNull();
  });
  it("reports a real commit and marks changed application inputs separately", () => {
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, stdio: "pipe", encoding: "utf8" });
    git("init", "--quiet");
    git("config", "user.email", "fixture@example.test");
    git("config", "user.name", "Fixture");
    git("config", "commit.gpgsign", "false");
    git("config", "core.hooksPath", "/dev/null");
    git("add", ".");
    git("commit", "-m", "fixture");
    const clean = releaseIdentity(root);
    expect(clean.revision).toBe(git("rev-parse", "HEAD").trim());
    expect(clean.modified).toBe(false);
    writeFileSync(join(root, "src", "app.ts"), "modified");
    expect(releaseIdentity(root)).toMatchObject({ revision: clean.revision, modified: true });
  });
});
