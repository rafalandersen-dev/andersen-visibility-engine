// Shared in-page fixture state, the exact read/write audit and the synthetic server functions. The network
// guard in index.html is already in place before this module evaluates.
import { analyzeAnswer } from "@/lib/answer-evidence";
import { protocolDeviations } from "@/lib/citation-panel";

export const fixture = (window.__manualCaptureFixture = {
  state: null,
  actorId: null,
  epoch: 1,
  seq: 0,
  /** Every server-function call, in order, with its exact input. */
  calls: [],
  /** Bounded diagnostics. */
  events: [],
  /** Every store/auth call, unbounded (for the final ledger). */
  stateAudit: [],
  /** Scripted outcomes for the next importManualCaptureFn calls (see OUTCOMES). Default: "store". */
  outcomes: [],
  /** When set, every read fails (post-save refresh failure). */
  failReads: false,
  /** Names of individual read functions that fail (e.g. only the prompt read). */
  failReadNames: new Set(),
  /** A pending "hang" outcome: call release(...) to settle it. */
  hanging: null,
  db: null,
});
export function record(type, payload) {
  fixture.events.push({ seq: ++fixture.seq, type, payload, hash: location.hash });
  if (fixture.events.length > 400) fixture.events.shift();
  // Store and auth calls are few: keep all of them for the final ledger (diagnostics stay bounded).
  if (type.startsWith("store.") || type.startsWith("auth."))
    fixture.stateAudit.push({ seq: fixture.seq, type, hash: location.hash });
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .filter((k) => v[k] !== undefined)
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
// Stands in for the SQL dedup digest (input jsonb equality); not a claim about the real hash function.
const sameInput = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const slotOf = (input) => {
  const c = input.captureContext;
  return JSON.stringify([c.panelId.toLowerCase(), c.panelVersion, c.slot.questionId, c.slot.round]);
};

/** Store one original as the server would: identical input returns the existing id; a different input at an
 * occupied slot is refused. Returns the id or throws the generic code. */
function commit(input) {
  const db = fixture.db;
  const same = db.answers.find((a) => sameInput(a.input, input));
  if (same) return same.id;
  if (db.answers.some((a) => a.input.captureContext && slotOf(a.input) === slotOf(input)))
    throw Error("citation_protocol_unavailable");
  const prompt = db.prompts.find(
    (p) =>
      p.id.toLowerCase() === input.promptId.toLowerCase() && p.revision === input.promptRevision,
  );
  const id = `5a5a5a5a-0000-4000-8000-${String(db.answers.length + 1).padStart(12, "0")}`;
  db.answers.push({
    id,
    createdAt: new Date().toISOString(),
    hash: id.replaceAll("-", "").padEnd(64, "0"),
    input: clone(input),
    prompt,
    analysis: analyzeAnswer(input, prompt),
  });
  const c = input.captureContext;
  db.captures.push({
    answerId: id,
    panelId: c.panelId,
    panelVersion: c.panelVersion,
    kind: "discovery",
    outcome: input.status,
    // The real canonical comparison against the stored panel (the rest of the resolver stays synthetic).
    deviations: protocolDeviations(
      db.panels.find((p) => p.panelId === c.panelId && p.version === c.panelVersion),
      c,
    ),
    panelResolved: true,
    brandRunResolved: null,
    contextMalformed: false,
    slot: { questionId: c.slot.questionId, round: c.slot.round },
    brandRunId: null,
    captureContext: clone(c),
  });
  return id;
}

/**
 * Synthetic outcomes for one importManualCaptureFn call:
 *  store              commit, return the id (or the existing id for an identical input)
 *  commitThenReject   commit, then throw the generic code (a lost acknowledgement)
 *  commitThenMalformed commit, then return a non-UUID value
 *  reject             do not commit, throw the generic code
 *  prewriteCode       do not commit, throw answer_evidence_unavailable
 *  otherOccupant      store a DIFFERENT input at the same slot, then throw the generic code
 *  hang               wait until fixture.release("store" | "reject") is called
 */
async function importManualCapture(data) {
  const outcome = fixture.outcomes.shift() ?? "store";
  const input = data.answer;
  switch (outcome) {
    case "store":
      return commit(input);
    case "commitThenReject":
      commit(input);
      throw Error("citation_protocol_unavailable");
    case "commitThenMalformed":
      commit(input);
      return "stored";
    case "reject":
      throw Error("citation_protocol_unavailable");
    case "prewriteCode":
      throw Error("answer_evidence_unavailable");
    case "otherOccupant":
      commit({ ...clone(input), rawAnswer: "A different observation entered elsewhere." });
      throw Error("citation_protocol_unavailable");
    case "hang":
      return new Promise((resolve, reject) => {
        fixture.hanging = (how) => {
          fixture.hanging = null;
          if (how === "store") resolve(commit(input));
          else reject(Error("citation_protocol_unavailable"));
        };
      });
  }
  throw Error("unknown outcome " + outcome);
}
fixture.release = (how) => fixture.hanging?.(how);

const READS = {
  readCitationProtocolFn: () => ({
    answers: fixture.db.answers,
    panels: fixture.db.panels,
    brandRuns: [],
    tombstones: [],
    runConsumed: [],
    erasureByVersion: [],
    erasureOverflow: 0,
  }),
  readResolvedCapturesFn: () => ({
    panels: fixture.db.panels,
    brandRuns: [],
    captures: fixture.db.captures,
    erasedSlots: fixture.db.erasedSlots,
    reports: fixture.db.reports,
    erasureOverflow: 0,
  }),
  readAnswerEvidenceFn: () => ({ prompts: fixture.db.prompts, answers: fixture.db.answers }),
};
export async function invoke(name, args) {
  const data = args?.[0]?.data;
  fixture.calls.push({ seq: ++fixture.seq, name, data: data === undefined ? null : clone(data) });
  if (name === "importManualCaptureFn") return importManualCapture(clone(data));
  if (READS[name]) {
    if (fixture.failReads || fixture.failReadNames.has(name)) throw Error("Synthetic read failure");
    return clone(READS[name]());
  }
  throw Error(`Fixture has no synthetic answer for ${name}.`);
}
