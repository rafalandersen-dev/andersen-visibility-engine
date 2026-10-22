/**
 * Entry point for the CC pinned-hop service candidate. NOT deployed, NOT part of
 * the app build. Build locally with the repository's existing esbuild:
 *   node node_modules/.bin/esbuild services/pinned-hop/main.ts --bundle \
 *     --platform=node --target=node22 --format=esm --outfile=<out>/pinned-hop.mjs
 * Required environment (provided by the host's secret store, never committed):
 *   MILO_PINNED_HOP_KEY  shared HMAC key, at least 32 bytes
 *   PORT                 listen port (host-assigned)
 */
import { createServer } from "node:http";
import { importHopKey } from "../../src/lib/pinned-hop/protocol";
import { createPinnedHopService } from "../../src/lib/pinned-hop/service.server";

const secret = process.env.MILO_PINNED_HOP_KEY ?? "";
const port = Number(process.env.PORT ?? "10000");
const key = await importHopKey(secret); // throws hop_key_too_short: refuse to start
const service = createPinnedHopService({
  key,
  log: (event) => console.log(JSON.stringify({ svc: "pinned-hop", ...event })),
});
const server = createServer((req, res) => void service.handle(req, res));
server.maxConnections = 32;
server.headersTimeout = 5_000;
server.requestTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.listen(port, () =>
  console.log(JSON.stringify({ svc: "pinned-hop", code: "ok", route: "health", ms: 0 })),
);
