# Pinned-hop service — deployment recipe (default OFF)

Source only. Codex/owner provisions. Nothing here creates a service, key or setting.

## Build and start (Node 22+)

```
npm ci --ignore-scripts
node node_modules/.bin/esbuild services/pinned-hop/main.ts --bundle \
  --platform=node --target=node22 --format=esm --outfile=dist-hop/pinned-hop.mjs
node dist-hop/pinned-hop.mjs
```

- **Health check:** `GET /healthz` is readiness only. It never fetches a destination, touches a lease or issues a nonce.
- **Other routes:** `POST /v1/challenge` and `POST /v1/hop` (signed and single-use; see `src/lib/pinned-hop/protocol.ts`).

## Environment variable NAMES (values live only in each host's secret store)

| Where       | Names                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hop service | `MILO_PINNED_HOP_KEY` (shared HMAC key, at least 32 bytes; the service refuses to start otherwise), `PORT` (assigned by the host) |
| Milo app    | `MILO_PINNED_HOP_URL` (must be `https://…`), `MILO_PINNED_HOP_KEY` (the same key)                                                 |

If either app variable is missing, or the URL is not HTTPS, the transport stays **OFF** (`pinnedHopConfigFromEnv` returns `null`) and intake behaves as today. Never commit, log or paste the key.

## Runtime constraints that matter on a free/sleeping host

- **Cold start.** Configured app intake performs readiness on demand before the signed homepage sequence. At most four unsigned `GET /healthz` probes start at approximately 0/20/40/60 seconds; each has an8second ceiling within a70second startup deadline. No background keep-alive is added. Readiness never contacts a destination or sends the shared key. A ready response does not grant authority: the subsequent fresh challenge, all DNS/URL/redirect/TLS checks and the unchanged8second homepage budget still apply. No destination hop, source write, unknown outcome or paid work is automatically replayed.
  - Startup failure retains the previous source observation and reports unavailable. Source refresh keeps its2minute lease and10minute admission cooldown.
  - A startup that consumes a weekly worker's60second pre-generation allowance may save source evidence and yield; the next normal visit can use that evidence. The worker's deadline and pause/access checks are unchanged.
  - Production acceptance must start after real idle time without operator prewarming. Local fault tests are not production evidence.
- **Restart.** Challenges are bound to one process incarnation, with a 20 s TTL. A restart between challenge and hop is refused, which is fail-closed.
- **Capacity.** At most 4 sockets, bounded pending challenges and per-request byte limits (`HOP_MAX_*`). A single small instance suffices for owner-initiated intake; no load measurement exists.

No plan upgrade is recommended from this evidence alone. Decide only after measured warm and cold behaviour on the provisioned host.
