// Local, disposable fixture only. Never deploy this unauthenticated server.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const { conversationSend, conversationRead, conversationList, conversationTurnTarget } =
  createRequire(import.meta.url)("/tmp/milo-conversation-browser/contracts.cjs");
const actor = "00000000-0000-4000-8000-000000000002",
  owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000003";
const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
  INSERT INTO auth.users(id) VALUES('${owner}'),('${actor}'),('${other}');
  CREATE TABLE public.workspace_meta(user_id uuid PRIMARY KEY,rev bigint DEFAULT 1);
  CREATE TABLE public.workspace_entities(user_id uuid,collection text,entity_id text,data jsonb DEFAULT '{}'::jsonb,PRIMARY KEY(user_id,collection,entity_id));
  INSERT INTO public.workspace_meta(user_id) VALUES('${owner}'),('${other}');`);
for (const name of [
  "20260911020000_project_team_reads.sql",
  "20260913120000_milo_conversations.sql",
])
  await db.exec(await readFile(`supabase/migrations/${name}`, "utf8"));
await db.exec(`INSERT INTO workspace_entities VALUES ('${owner}','projects','p','{"name":"First client"}'),('${other}','projects','p','{"name":"Second client"}');
  INSERT INTO project_team_members(owner_id,project_id,actor_id,role) VALUES('${owner}','p','${actor}','editor'),('${other}','p','${actor}','editor');`);
const query = async (fn, parameters) =>
  (await db.query(`SELECT public.${fn} result`, parameters)).rows[0].result;
const targetArgs = (input) => [
  actor,
  input.ownerId,
  input.projectId,
  input.conversationId,
  input.turnId,
];
const stats = {
  beginCalls: 0,
  rejectedBegin: 0,
  resumeCalls: 0,
  simulatedExecutions: 0,
  cancelled: 0,
  completed: 0,
  lateRejected: 0,
  seededPending: 0,
  revoked: false,
};
const held = new Map();
const seed = async (pending) => {
  const target = {
    ownerId: owner,
    projectId: "p",
    conversationId: randomUUID(),
    turnId: randomUUID(),
  };
  await query("begin_milo_conversation_turn($1,$2,$3,$4,$5,$6,'en')", [
    ...targetArgs(target),
    pending ? "Resume this saved pending task" : "Saved baseline conversation",
  ]);
  if (!pending) {
    const claim = await query("claim_milo_conversation_turn($1,$2,$3,$4,$5)", targetArgs(target));
    await query("advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,0,$7,'completed')", [
      ...targetArgs(target),
      claim.attemptId,
      JSON.stringify([
        {
          kind: "assistant",
          role: "lead",
          text: "This response was retained before either browser tab opened.",
        },
      ]),
    ]);
  }
};
await seed(false);
const retained = async (target) => {
  const page = await query("read_milo_conversation($1,$2,$3,$4,0)", targetArgs(target).slice(0, 4));
  return page.turns.find((turn) => turn.turnId === target.turnId);
};
const execute = async (target) => {
  const claim = await query("claim_milo_conversation_turn($1,$2,$3,$4,$5)", targetArgs(target));
  if (!claim.acquired) return { turn: claim.turn };
  stats.simulatedExecutions++;
  return new Promise((resolve) => held.set(target.turnId, { target, claim, resolve }));
};
async function release() {
  for (const [id, work] of held) {
    held.delete(id);
    try {
      await query("check_milo_conversation_execution($1,$2,$3,$4,$5,$6)", [
        ...targetArgs(work.target),
        work.claim.attemptId,
      ]);
      const turn = await query(
        "advance_milo_conversation_turn($1,$2,$3,$4,$5,$6,0,$7,'completed')",
        [
          ...targetArgs(work.target),
          work.claim.attemptId,
          JSON.stringify([
            { kind: "assistant", role: "seo", text: "SIMULATED RESPONSE SAVED ONCE" },
          ]),
        ],
      );
      stats.completed++;
      work.resolve({ turn });
    } catch {
      stats.lateRejected++;
      work.resolve({ turn: await retained(work.target).catch(() => null) });
    }
  }
}
async function api(name, raw) {
  if (name === "send") {
    const input = conversationSend.parse(raw);
    stats.beginCalls++;
    let saved;
    try {
      saved = await query("begin_milo_conversation_turn($1,$2,$3,$4,$5,$6,$7,$8)", [
        ...targetArgs(input),
        input.body,
        input.locale,
        input.allowDraftGeneration ?? false,
      ]);
    } catch (error) {
      stats.rejectedBegin++;
      throw error;
    }
    return saved.turn.state === "pending" ? execute(input) : { turn: saved.turn };
  }
  if (name === "resume") {
    stats.resumeCalls++;
    return execute(conversationTurnTarget.parse(raw));
  }
  if (name === "cancel") {
    const turn = await query(
      "cancel_milo_conversation_turn($1,$2,$3,$4,$5)",
      targetArgs(conversationTurnTarget.parse(raw)),
    );
    stats.cancelled++;
    return { turn };
  }
  if (name === "read") {
    const input = conversationRead.parse(raw);
    return query("read_milo_conversation($1,$2,$3,$4,$5)", [
      actor,
      input.ownerId,
      input.projectId,
      input.conversationId,
      input.after,
    ]);
  }
  if (name === "list") {
    const input = conversationList.parse(raw);
    return query("list_milo_conversations($1,$2,$3,$4)", [
      actor,
      input.ownerId,
      input.projectId,
      input.offset,
    ]);
  }
  throw Error("Unsupported fixture endpoint");
}
const server = createServer(async (request, response) => {
  response.setHeader("cache-control", "no-store");
  const json = (status, value) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(value));
  };
  try {
    if (request.headers.host !== "127.0.0.1:8775") return json(403, {});
    const url = new URL(request.url, "http://127.0.0.1:8775");
    if (request.method === "GET" && url.pathname === "/api/stats")
      return json(200, {
        ...stats,
        held: held.size,
        turns: (
          await db.query(
            "SELECT state,count(*)::int count FROM milo_conversation_turns GROUP BY state",
          )
        ).rows,
      });
    if (request.method === "GET" && ["/", "/bundle.js"].includes(url.pathname)) {
      response.setHeader(
        "content-type",
        url.pathname === "/" ? "text/html" : "application/javascript",
      );
      return response.end(
        await readFile(
          `/tmp/milo-conversation-browser/${url.pathname === "/" ? "index.html" : "bundle.js"}`,
        ),
      );
    }
    if (request.method !== "POST" || request.headers.origin !== "http://127.0.0.1:8775")
      return json(403, {});
    if (url.pathname.startsWith("/control/")) {
      switch (url.pathname) {
        case "/control/release":
          await release();
          break;
        case "/control/pending":
          await seed(true);
          stats.seededPending++;
          break;
        case "/control/expire":
          await db.exec(
            "UPDATE milo_conversation_turns SET lease_until=now()-interval '1 second' WHERE state='running'",
          );
          break;
        case "/control/revoke":
          await db.query(
            "UPDATE project_team_members SET active=false,revision=revision+1 WHERE owner_id=$1 AND actor_id=$2",
            [owner, actor],
          );
          stats.revoked = true;
          break;
        default:
          return json(404, {});
      }
      return json(200, { ok: true });
    }
    if (!/^\/api\/(send|read|list|resume|cancel)$/.test(url.pathname)) return json(404, {});
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 20000) return json(413, {});
      chunks.push(chunk);
    }
    json(200, await api(url.pathname.slice(5), JSON.parse(Buffer.concat(chunks).toString("utf8"))));
  } catch {
    json(409, { error: "Fixture request unavailable" });
  }
});
server.listen(8775, "127.0.0.1", () =>
  console.log("Milo multi-tab SQL fixture ready at http://127.0.0.1:8775/"),
);
process.on("SIGINT", () => {
  server.closeAllConnections();
  server.close();
  void db.close().finally(() => process.exit(0));
});
