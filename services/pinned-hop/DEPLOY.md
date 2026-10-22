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

- **Cold start.** The app gives the whole hop sequence a single `HOMEPAGE_TIMEOUT_MS` budget of 8 s, with per-hop `HOP_MAX_MS` of 8 s and `HOP_MIN_MS` of 0.5 s. A host that sleeps when idle and needs tens of seconds to wake (Render Free was recorded on 7 October at 50 s or more) will make the **first** capture after an idle period fail with the retryable `timeout`. A later attempt, once the service is awake, can succeed.
  - This is a correctness-preserving failure: nothing is saved and the existing source is not overwritten.
  - It is still a real usability limit, so acceptance should begin with a `GET /healthz` warm-up.
- **Restart.** Challenges are bound to one process incarnation, with a 20 s TTL. A restart between challenge and hop is refused, which is fail-closed.
- **Capacity.** At most 32 sockets, bounded pending challenges and per-request byte limits (`HOP_MAX_*`). A single small instance suffices for owner-initiated intake; no load measurement exists.

No plan upgrade is recommended from this evidence alone. Decide only after measured warm and cold behaviour on the provisioned host.
