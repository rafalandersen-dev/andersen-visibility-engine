/**
 * Phase 1B.2 — milo.actions.propose scope gating + consent classification.
 * Pure tests over oauth.server helpers: the scope is explicit-only, issuable
 * only under the write flag, and NEVER advertised in metadata.
 */
import { describe, it, expect } from "vitest";
import {
  MCP_PROPOSE_SCOPE,
  MCP_WRITE_SCOPES,
  OAUTH_ISSUABLE_SCOPES,
  SCOPE_LABELS,
  issuableScopes,
  validateScopes,
  validateRegistration,
  protectedResourceMetadata,
  authorizationServerMetadata,
  scopeKind,
  scopeConsentItems,
} from "./oauth.server";
import { MILO_ACTIONS_PROPOSE_SCOPE } from "./pending-actions";

const CALLBACK = "https://claude.ai/api/mcp/auth_callback";
const ALL_SEVEN_PLUS_PROPOSE = [...OAUTH_ISSUABLE_SCOPES, "milo.tasks.write", "milo.projects.write", MCP_PROPOSE_SCOPE].join(" ");

describe("propose scope — issuance gating", () => {
  it("is the same string the pure module exports", () => {
    expect(MCP_PROPOSE_SCOPE).toBe("milo.actions.propose");
    expect(MCP_PROPOSE_SCOPE).toBe(MILO_ACTIONS_PROPOSE_SCOPE);
  });

  it("flag off: not issuable; flag on: issuable alongside the write scopes", () => {
    expect(issuableScopes(false)).not.toContain(MCP_PROPOSE_SCOPE);
    expect(issuableScopes(true)).toContain(MCP_PROPOSE_SCOPE);
    // Existing sets unchanged.
    expect(issuableScopes(false)).toEqual([...OAUTH_ISSUABLE_SCOPES]);
    for (const w of MCP_WRITE_SCOPES) expect(issuableScopes(true)).toContain(w);
    expect(issuableScopes(true)).not.toContain("milo.content.publish");
  });

  it("validateScopes rejects propose against the flag-off set, accepts flag-on", () => {
    const off = validateScopes([MCP_PROPOSE_SCOPE], issuableScopes(false));
    expect(off).toEqual({ ok: false, invalid: [MCP_PROPOSE_SCOPE] });
    const on = validateScopes([MCP_PROPOSE_SCOPE], issuableScopes(true));
    expect(on).toEqual({ ok: true, scopes: [MCP_PROPOSE_SCOPE] });
  });

  it("DCR flag off: explicit propose scope → invalid_scope", () => {
    const r = validateRegistration({ redirect_uris: [CALLBACK], scope: MCP_PROPOSE_SCOPE }, false);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.body.error).toBe("invalid_scope");
      expect(r.body.error_description).toContain(MCP_PROPOSE_SCOPE);
    }
  });

  it("DCR flag on: explicit propose scope (alone or with writes) registers", () => {
    const alone = validateRegistration({ redirect_uris: [CALLBACK], scope: `milo.projects.read offline_access ${MCP_PROPOSE_SCOPE}` }, true);
    expect(alone.ok).toBe(true);
    if (alone.ok) expect(alone.normalized.scope.split(" ")).toContain(MCP_PROPOSE_SCOPE);
    const mixed = validateRegistration({ redirect_uris: [CALLBACK], scope: ALL_SEVEN_PLUS_PROPOSE }, true);
    expect(mixed.ok).toBe(true);
  });

  it("never enters the default grant — no scope field stays reads + offline_access, both flag states", () => {
    for (const flag of [false, true]) {
      const r = validateRegistration({ redirect_uris: [CALLBACK] }, flag);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.normalized.scope.split(" ").sort()).toEqual([...OAUTH_ISSUABLE_SCOPES].sort());
        expect(r.normalized.scope).not.toContain("propose");
        expect(r.normalized.scope).not.toContain("write");
      }
    }
  });

  it("existing read-only and direct-write DCR behavior is unchanged", () => {
    const readOnly = validateRegistration({ redirect_uris: [CALLBACK], scope: "milo.projects.read offline_access" }, false);
    expect(readOnly.ok).toBe(true);
    const writeOff = validateRegistration({ redirect_uris: [CALLBACK], scope: "milo.tasks.write" }, false);
    expect(writeOff.ok).toBe(false);
    const writeOn = validateRegistration({ redirect_uris: [CALLBACK], scope: "milo.tasks.write milo.projects.write" }, true);
    expect(writeOn.ok).toBe(true);
  });
});

describe("propose scope — metadata stays dark", () => {
  it("PRM and AS metadata contain no propose/write/publish strings", () => {
    const prm = JSON.stringify(protectedResourceMetadata());
    const as = JSON.stringify(authorizationServerMetadata());
    for (const doc of [prm, as]) {
      expect(doc).not.toMatch(/propose/i);
      expect(doc).not.toMatch(/\.write/i);
      expect(doc).not.toMatch(/publish/i);
    }
    expect(JSON.parse(as).scopes_supported).toEqual([...OAUTH_ISSUABLE_SCOPES]);
  });
});

describe("propose scope — consent copy keys", () => {
  it("all four locales carry the propose badge/section/warning and the cannot-approve line", async () => {
    const { en } = await import("../i18n/en");
    const { pl } = await import("../i18n/pl");
    const { sv } = await import("../i18n/sv");
    const { da } = await import("../i18n/da");
    for (const dict of [en, pl, sv, da]) {
      for (const key of ["connect.propose.badge", "connect.propose.title", "connect.propose.warning", "connect.cannot.approve"]) {
        expect(dict[key], key).toBeTruthy();
      }
      // Cannot-list keeps the hard exclusions regardless of grant shape.
      for (const key of ["connect.cannot.publish", "connect.cannot.delete", "connect.cannot.settings", "connect.cannot.billing"]) {
        expect(dict[key], key).toBeTruthy();
      }
    }
    // English wording is conservative: review-before-apply, never self-approving.
    expect(en["connect.propose.warning"]).toMatch(/approve/i);
    expect(en["connect.propose.warning"]).toMatch(/never approve its own/i);
    expect(en["connect.propose.badge"]).toBe("Read & propose access");
  });
});

describe("propose scope — consent classification", () => {
  it("classifies as its own kind, distinct from write; publish stays write", () => {
    expect(scopeKind(MCP_PROPOSE_SCOPE)).toBe("propose");
    expect(scopeKind("milo.tasks.write")).toBe("write");
    expect(scopeKind("milo.content.publish")).toBe("write");
    expect(scopeKind("milo.projects.read")).toBe("read");
    expect(scopeKind("offline_access")).toBe("offline");
  });

  it("has a propose-safe label that never implies direct apply", () => {
    const label = SCOPE_LABELS[MCP_PROPOSE_SCOPE];
    expect(label).toMatch(/approval/i);
    expect(label).toMatch(/never applies/i);
    expect(label).not.toMatch(/create and (update|edit)/i);
  });

  it("consent items: propose-only, direct-write, and mixed grants each classify cleanly", () => {
    const proposeOnly = scopeConsentItems(`milo.projects.read offline_access ${MCP_PROPOSE_SCOPE}`);
    expect(proposeOnly.map((i) => i.kind)).toEqual(["read", "offline", "propose"]);

    const directWrite = scopeConsentItems("milo.projects.read milo.tasks.write");
    expect(directWrite.map((i) => i.kind)).toEqual(["read", "write"]);

    const mixed = scopeConsentItems(ALL_SEVEN_PLUS_PROPOSE);
    expect(mixed.filter((i) => i.kind === "write")).toHaveLength(2);
    expect(mixed.filter((i) => i.kind === "propose")).toHaveLength(1);
    expect(mixed.every((i) => i.label && i.label !== "")).toBe(true);
  });
});
