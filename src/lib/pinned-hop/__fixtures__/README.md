# Fixture-only TLS material (CC pinned-hop tests)

`fixture-only-tls-cert.pem` / `fixture-only-tls-key.pem` form a throwaway self-signed certificate for the
fictional name `probe-target.test`, used only by `src/lib/pinned-hop/tls.test.ts` against a loopback server.
They are NOT secrets, protect nothing and must never be used outside tests.
