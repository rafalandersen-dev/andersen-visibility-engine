// Shared in-page fixture state and log. Loaded first by the bundle; the network guard in
// index.html is already in place before any module evaluates.
export const fixture = (window.__taskFixture = {
  state: null,
  actorId: null,
  events: [],
  invoked: [],
  seq: 0,
});
// Every event keeps its payload, its order (seq), the check step and, for a Delete confirmation, the
// narrow confirmation phase it happened in, so the report can audit writes exactly.
export function record(type, payload) {
  fixture.events.push({
    seq: ++fixture.seq,
    type,
    payload,
    path: location.hash,
    step: fixture.step,
    phase: fixture.phase,
  });
  // Bounded diagnostics, but store writes are never evicted: the write audit needs all of them.
  if (fixture.events.length > 400) {
    const i = fixture.events.findIndex((e) => !e.type.startsWith("store."));
    if (i >= 0) fixture.events.splice(i, 1);
  }
}
// Server functions are replaced at bundle resolution. Reads get an explicit synthetic
// answer or an honest failure; anything else is a recorded, refused write.
const READS = {
  readCitationFindingsFn: () => fixture.reads.findings,
  readPublicationEvidenceFn: () => ({ items: [], page: 0, pageSize: 50, hasMore: false }),
  readAnswerEvidenceFn: () => ({ answers: [] }),
  readCitationImprovementsFn: () => ({ improvements: [] }),
  readChangeArtifactsFn: () => ({ artifacts: [] }),
};
export function invoke(name, args) {
  const read = /^(read|get|list|fetch|load|check)/.test(name);
  fixture.invoked.push({ name, read, path: location.hash });
  record("fn." + name, { read });
  if (read && READS[name]) return Promise.resolve(structuredClone(READS[name](args)));
  return Promise.reject(
    Error(
      read
        ? `Fixture has no synthetic answer for ${name}.`
        : `Fixture refuses ${name}: no writes, generation, approval or publication.`,
    ),
  );
}
