import { describe, expect, it } from "vitest";
import {
  forgetMiloConversation,
  miloHomeSearch,
  miloConversationHref,
  rememberedMiloConversation,
  rememberMiloConversation,
} from "./milo-conversation-location";
const actor = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const first = "00000000-0000-4000-8000-000000000003";
const second = "00000000-0000-4000-8000-000000000004";
const scope = { ownerId: actor, projectId: "p" };
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
describe("private conversation navigation preferences", () => {
  it("forgets an abandoned bookmark only for the current actor and client", () => {
    const db = storage();
    rememberMiloConversation(actor, scope, first, db);
    rememberMiloConversation(actor, { ...scope, ownerId: other }, second, db);
    rememberMiloConversation(other, scope, second, db);
    forgetMiloConversation(actor, scope, db);
    expect(rememberedMiloConversation(actor, scope, db)).toBeUndefined();
    expect(rememberedMiloConversation(actor, { ...scope, ownerId: other }, db)).toBe(second);
    expect(rememberedMiloConversation(other, scope, db)).toBe(second);
  });
  it("requires an exact owner/project pair for a conversation link or an explicit new conversation", () => {
    for (const conversation of [first, "new"])
      expect(miloHomeSearch.parse({ owner: actor, project: "p", conversation })).toEqual({
        owner: actor,
        project: "p",
        conversation,
      });
    expect(miloHomeSearch.parse({})).toEqual({});
    for (const input of [
      { conversation: first },
      { owner: actor, conversation: first },
      { project: "p", conversation: first },
      { owner: actor },
      { project: "p" },
      { owner: actor, project: "../p", conversation: first },
      { owner: actor, project: "p", conversation: "arbitrary" },
      { owner: actor, project: "p", conversation: [first] },
    ])
      expect(() => miloHomeSearch.parse(input)).toThrow();
  });
  it("creates only an internal bookmark with its immutable project and conversation", () => {
    const href = miloConversationHref(scope, first);
    const url = new URL(href, "https://milogrowth.com");
    expect(url.pathname).toBe("/app");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      owner: actor,
      project: "p",
      conversation: first,
    });
    expect(() =>
      miloConversationHref({ ...scope, projectId: "https://evil.test" }, first),
    ).toThrow();
  });
  it("isolates the authenticated actor, owner and repeated project IDs", () => {
    const db = storage();
    rememberMiloConversation(actor, scope, first, db);
    expect(rememberedMiloConversation(actor, scope, db)).toBe(first);
    expect(rememberedMiloConversation(other, scope, db)).toBeUndefined();
    expect(rememberedMiloConversation(actor, { ...scope, ownerId: other }, db)).toBeUndefined();
    expect(rememberedMiloConversation(actor, { ...scope, projectId: "q" }, db)).toBeUndefined();
    rememberMiloConversation(actor, { ...scope, ownerId: other }, second, db);
    expect(rememberedMiloConversation(actor, scope, db)).toBe(first);
    expect(rememberedMiloConversation(actor, { ...scope, ownerId: other }, db)).toBe(second);
  });
  it("updates a single client preference without storing title, prompt or response content", () => {
    const db = storage();
    rememberMiloConversation(actor, scope, first, db);
    rememberMiloConversation(actor, scope, second, db);
    const entries = JSON.parse([...db.values.values()][0]);
    expect(entries).toEqual([{ ...scope, conversationId: second }]);
    rememberMiloConversation(actor, scope, "new", db);
    expect(rememberedMiloConversation(actor, scope, db)).toBe(second);
    rememberMiloConversation(
      actor,
      { ...scope, title: "Private title" } as typeof scope,
      first,
      db,
    );
    expect(rememberedMiloConversation(actor, scope, db)).toBe(second);
  });
  it("bounds retained preferences and keeps recently visited clients", () => {
    const db = storage();
    for (let i = 0; i < 70; i++)
      rememberMiloConversation(actor, { ...scope, projectId: `p${i}` }, first, db);
    expect(JSON.parse([...db.values.values()][0])).toHaveLength(64);
    expect(rememberedMiloConversation(actor, { ...scope, projectId: "p0" }, db)).toBeUndefined();
    expect(rememberedMiloConversation(actor, { ...scope, projectId: "p69" }, db)).toBe(first);
    rememberMiloConversation(actor, { ...scope, projectId: "p6" }, second, db);
    expect(JSON.parse([...db.values.values()][0])[0]).toEqual({
      ...scope,
      projectId: "p6",
      conversationId: second,
    });
  });
  it("ignores malformed, oversized, unbounded or injected preference data", () => {
    const db = storage();
    rememberMiloConversation(actor, scope, first, db);
    const key = [...db.values.keys()][0];
    for (const raw of [
      "{invalid",
      " ".repeat(24001),
      JSON.stringify(Array(65).fill({ ...scope, conversationId: first })),
      JSON.stringify([{ ...scope, conversationId: first, body: "injected" }]),
      JSON.stringify([{ ...scope, conversationId: "new" }]),
    ]) {
      db.values.set(key, raw);
      expect(rememberedMiloConversation(actor, scope, db)).toBeUndefined();
    }
    rememberMiloConversation(actor, scope, second, db);
    expect(rememberedMiloConversation(actor, scope, db)).toBe(second);
  });
  it("tolerates unavailable/full session storage and validates actor identity before writing", () => {
    const unavailable = {
      getItem: () => {
        throw Error("disabled");
      },
      setItem: () => {
        throw Error("full");
      },
    };
    expect(rememberedMiloConversation(actor, scope, unavailable)).toBeUndefined();
    expect(() => rememberMiloConversation(actor, scope, first, unavailable)).not.toThrow();
    const db = storage();
    rememberMiloConversation("not-an-actor", scope, first, db);
    expect(db.values.size).toBe(0);
  });
});
