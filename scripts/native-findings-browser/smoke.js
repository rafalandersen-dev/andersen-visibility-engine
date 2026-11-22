// Local fixture contract/transport smoke (NOT browser acceptance). Mirrors the INDEPENDENT oracle
// (independent-contract-probes.ts + legacy-grant-probe.ts) against THIS fixture, plus the BFR1-03
// counterexamples (hold-mode actor, retired async generation) and BFR1-05 negative self-checks. Bundled and
// run under Node by smoke.cjs against the active finished source. Every modeled response is the real schema.
//
// Delta the independent receipt mandates: the native-consent GATE is applied to the reviewer read/list/save
// (BFR1-01). A native-bearing finding whose cited set drifted (a reparsed/DELETED member → NULL set digest)
// is now REFUSED, matching SQL read_ai_citation_finding_for_review_v2 (:703-704) — NOT the pre-gate
// masked-success the frozen oracle's probe 13 asserted (the receipt flags that as non-parity).
import { fixture as f, invoke } from "./fixture.js";
import { nativeArtifactStateSchema } from "@/lib/native-ai-artifact";
import { panelProtocolSchema } from "@/lib/citation-panel";
import { evidenceRowSchema } from "@/lib/answer-evidence";
import { knowledgeSourceSchema, knowledgeRecordSchema } from "@/lib/project-knowledge";
import { citationBusinessFactsStateSchema } from "@/lib/citation-business-fact";
import { grantEligibleReviewers, nativeConsentSetDigest } from "@/lib/citation-review-ui";
import { citationFindingReviewInputSchema } from "@/lib/citation-finding-review";

const results = [];
let phase = "init";
// Gate the FIRST WebCrypto digest so a reviewer save/read can be suspended mid-flight (mirrors the oracle).
function gateDigest() {
  const original = crypto.subtle.digest.bind(crypto.subtle);
  let unblock, entered;
  const gate = new Promise((r) => (unblock = r));
  const started = new Promise((r) => (entered = r));
  let first = true;
  crypto.subtle.digest = async (...a) => {
    if (first) {
      first = false;
      entered();
      await gate;
    }
    return original(...a);
  };
  return { started, unblock, restore: () => (crypto.subtle.digest = original) };
}
async function check(name, fn) {
  phase = name;
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (e) {
    results.push({ name, pass: false, error: String(e?.message ?? e) });
  }
}
const assert = (v, m) => {
  if (!v) throw new Error(m);
};
const call = (name, data) => invoke(name, [{ data }]);
const outcome = async (fn) => {
  try {
    return { accepted: true, value: await fn() };
  } catch (e) {
    return { accepted: false, error: String(e?.message ?? e) };
  }
};
const scope = () => ({ projectId: f.control.ids.project, expectedOwnerId: f.control.ids.owner });
const target = (row = f.control.rows.boundNative) => ({
  projectId: f.control.ids.project,
  ownerId: f.control.ids.owner,
  findingRowId: row,
});
const rowOf = (id = f.control.rows.boundNative) =>
  [...f.db.findings.values()].flat().find((r) => r.id === id);
const req = (r) => ({
  ...scope(),
  scope: { panelId: r.panelId, panelVersion: r.panelVersion, client: r.client },
  finding: JSON.parse(JSON.stringify(r.record)),
  expectedVersion: r.version,
  expectedHeadId: r.id,
});
const reset = () => f.control.setupCase();

async function main() {
  await reset();
  // ---- BF01 positive seeds satisfy the actual contracts (probes 01-07) ----
  await check("01 native summary contract", async () => {
    nativeArtifactStateSchema.parse(await call("readNativeArtifactsFn", scope()));
  });
  await check("02 protocol seed contract", async () => {
    panelProtocolSchema.parse((await call("readCitationProtocolFn", scope())).panels[0]);
  });
  await check("03 answer seed contract", async () => {
    evidenceRowSchema.parse((await call("readAnswerEvidenceFn", scope())).answers[0]);
  });
  await check("04 knowledge seed contract", async () => {
    const k = await call("readProjectKnowledgeFn", { projectId: "p" });
    knowledgeSourceSchema.parse(k.sources[0]);
    knowledgeRecordSchema.parse(k.records[0]);
  });
  await check("05 facts seed contract", async () => {
    citationBusinessFactsStateSchema.parse(await call("readCitationBusinessFactsFn", scope()));
  });
  await check("06 owner detail contract", async () => {
    assert(
      !!(await call("getCitationFindingFn", { ...scope(), id: f.control.rows.boundNative })),
      "no detail",
    );
  });
  await check("07 grant candidates", async () => {
    assert(
      grantEligibleReviewers(f.db.roster, f.control.ids.owner, f.db.policy.mode).length > 0,
      "no eligible reviewer",
    );
  });

  // ---- BF02 canonical whole-set digest (probe 08) ----
  await check("08 fullset hash equals the real client helper", async () => {
    const r = rowOf(f.control.rows.multiNative);
    const items = r.record.evidence
      .filter((e) => e.kind === "native")
      .map((e) => ({ id: e.id, parsedSha256: e.nativeBinding.parsedSha256 }));
    const client = await nativeConsentSetDigest(items);
    assert(client === (await f.control.expectedNativeSetDigest(r.id)), "digest mismatch");
    const grant = await call("grantCitationReviewNativeAssignmentFn", {
      projectId: "p",
      findingRowId: r.id,
      reviewerId: f.control.ids.reviewer,
      nativeSetSha256: client,
    });
    assert(grant.active === true, "grant failed");
  });
  await check("09 owner findings scoped to project", async () => {
    assert(
      (await call("readCitationFindingsFn", { ...scope(), projectId: "q" })).findings.length === 0,
      "foreign findings leaked",
    );
  });

  await reset();
  f.control.setActor("reviewer");
  await check("10 reviewer valid control inspectionComplete", async () => {
    assert(
      (await call("getCitationFindingForReviewFn", target())).inspectionComplete,
      "not complete",
    );
  });
  await check("11 reviewer foreign owner/project refused", async () => {
    const r = await outcome(() =>
      call("getCitationFindingForReviewFn", {
        ...target(),
        projectId: "q",
        ownerId: "00000000-0000-4000-8000-000000000099",
      }),
    );
    assert(!r.accepted, "foreign accepted");
  });
  f.control.setFlag("mask", true);
  await check("12 admitted masked projection carries no native material", async () => {
    const v = await call("getCitationFindingForReviewFn", target());
    assert(v.record === null && !v.evidence.some((e) => e.nativeMaterial), "mask leaked");
  });

  // ---- BFR1-01 corrected gate: a deleted cited native REFUSES the read (server parity), not masked ----
  await reset();
  await f.control.grantNative(f.control.rows.multiNative);
  await call("removeNativeArtifactFn", { ...scope(), id: f.control.artifacts.bing });
  f.control.setActor("reviewer");
  await check("13 deleted cited native refuses the read (corrected gate)", async () => {
    const r = await outcome(() =>
      call("getCitationFindingForReviewFn", target(f.control.rows.multiNative)),
    );
    assert(!r.accepted, "drifted/deleted native set was not refused");
  });

  await reset();
  f.control.setActor("reviewer");
  f.control.defer("readNativeArtifactsFn");
  await check("14 deferred owner refusal is not bypassed", async () => {
    const p = outcome(() => call("readNativeArtifactsFn", scope()));
    await f.control.release("readNativeArtifactsFn", "ok", { syntheticOverride: true });
    const r = await p;
    assert(!r.accepted && f.inspect.violations().length > 0, "deferred bypass");
  });

  // ---- BF06 save ledger (probes 15-16), now owner/project scoped ----
  await reset();
  await check("15 new finding lost-ack exact retry", async () => {
    const d = req(rowOf());
    d.finding.findingId = "00000000-0000-4000-8000-000000777777";
    d.expectedVersion = 0;
    d.expectedHeadId = null;
    f.control.setFlag("lostAck", true);
    const first = await outcome(() => call("saveCitationFindingFn", d));
    const second = await call("saveCitationFindingFn", d);
    assert(
      !first.accepted && second.version === 1 && f.inspect.headVersion(d.finding.findingId) === 1,
      "retry duplicated/conflicted",
    );
  });
  await reset();
  await check("16 edit changed payload and wrong head conflict", async () => {
    const d = req(rowOf());
    const wrong = await outcome(() =>
      call("saveCitationFindingFn", {
        ...d,
        expectedHeadId: "00000000-0000-4000-8000-000000000099",
      }),
    );
    assert(!wrong.accepted, "wrong head accepted");
    await call("saveCitationFindingFn", d);
    d.finding.observation = "Different payload after first save";
    const changed = await outcome(() => call("saveCitationFindingFn", d));
    assert(!changed.accepted, "changed stale payload accepted");
  });
  await check("17 reset clears ledger + aligns actor", async () => {
    await f.control.setupCase({ actor: "reviewer" });
    assert(f.ledger.size === 0 && f.auth.actorId === f.state.userId, "reset leak");
  });
  await check("18 old timer cannot mutate the new case", async () => {
    f.control.reHydrateSameActor();
    await reset();
    const epoch = f.epoch;
    await new Promise((r) => setTimeout(r, 5));
    assert(epoch === f.epoch, "old timer mutated new case");
  });

  // ---- BFR1-02 receipt + scope semantics (probes 19-24) ----
  await reset();
  await check("19 owner may read its own review list", async () => {
    const r = await outcome(() => call("readCitationFindingReviewsFn", target()));
    assert(r.accepted, "owner review-list refused: " + r.error);
  });
  await reset();
  f.control.setActor("reviewer");
  await check("20 native consent off refuses read + notes + save", async () => {
    const v = await call("getCitationFindingForReviewFn", target());
    f.db.assignments.get(
      `p:${f.control.rows.boundNative}:${f.control.ids.reviewer}`,
    ).native.active = false;
    const rd = await outcome(() => call("getCitationFindingForReviewFn", target()));
    const notes = await outcome(() => call("readCitationFindingReviewsFn", target()));
    const save = await outcome(() =>
      call("saveCitationFindingReviewFn", {
        ...target(),
        expectedSha: v.recordSha256,
        decision: "approved",
        note: "private",
      }),
    );
    assert(!rd.accepted && !notes.accepted && !save.accepted, "bound native consent bypass");
  });
  await reset();
  f.control.setActor("reviewer");
  await check("21 receipt inspectionComplete matches view; exact retry same receipt", async () => {
    const v = await call("getCitationFindingForReviewFn", target());
    const d = { ...target(), expectedSha: v.recordSha256, decision: "approved", note: "inspected" };
    const r = await call("saveCitationFindingReviewFn", d);
    const retry = await outcome(() => call("saveCitationFindingReviewFn", d));
    assert(
      r.inspectionComplete === v.inspectionComplete && retry.accepted && retry.value.id === r.id,
      "receipt/retry mismatch",
    );
    const changed = await outcome(() =>
      call("saveCitationFindingReviewFn", { ...d, decision: "rejected" }),
    );
    assert(!changed.accepted, "changed same-pin decision did not conflict");
  });
  await reset();
  f.control.setActor("reviewer");
  await check("22 withdrawal validates exact owner/project/own scope", async () => {
    const v = await call("getCitationFindingForReviewFn", target());
    const r = await call("saveCitationFindingReviewFn", {
      ...target(),
      expectedSha: v.recordSha256,
      decision: "approved",
      note: "private",
    });
    const bad = await outcome(() =>
      call("removeCitationFindingReviewFn", {
        projectId: "q",
        ownerId: "00000000-0000-4000-8000-000000000099",
        id: r.id,
      }),
    );
    assert(!bad.accepted, "foreign-scope withdrawal accepted");
    const ok = await call("removeCitationFindingReviewFn", {
      projectId: "p",
      ownerId: f.control.ids.owner,
      id: r.id,
    });
    assert(ok === true, "own withdrawal refused");
    const list = await call("readCitationFindingReviewsFn", target());
    const mine = list.reviews.find((x) => x.id === r.id);
    assert(
      mine.withdrawn && mine.note === null && mine.recordSha256 === null,
      "withdrawn note/hash not masked",
    );
  });
  await reset();
  await check("23 changed live binding cannot regrant the old immutable finding", async () => {
    const old = rowOf().record.evidence[0].nativeBinding.parsedSha256;
    f.control.reparseArtifact(f.control.artifacts.google);
    const digest = await f.control.expectedNativeSetDigest(f.control.rows.boundNative);
    const r = await outcome(() =>
      call("grantCitationReviewNativeAssignmentFn", {
        projectId: "p",
        findingRowId: f.control.rows.boundNative,
        reviewerId: f.control.ids.reviewer,
        nativeSetSha256: digest,
      }),
    );
    assert(
      !r.accepted &&
        rowOf().record.evidence[0].nativeBinding.parsedSha256 === old &&
        digest === null,
      "changed material granted against old binding",
    );
  });
  await reset();
  await check("24 exact scope + mandatory expectedOwnerId", async () => {
    const foreign = await call("readCitationProtocolFn", { ...scope(), projectId: "q" });
    const missing = await outcome(() => call("readCitationFindingsFn", { projectId: "p" }));
    const digest = await f.control.expectedNativeSetDigest(f.control.rows.boundNative);
    const grant = await outcome(() =>
      call("grantCitationReviewNativeAssignmentFn", {
        projectId: "q",
        findingRowId: f.control.rows.boundNative,
        reviewerId: f.control.ids.reviewer,
        nativeSetSha256: digest,
      }),
    );
    assert(foreign.panels.length === 0 && !missing.accepted && !grant.accepted, "scope/input gaps");
  });

  // ---- BFR1-03 deferred execution bound to request actor + retired generation (probes 25-26) ----
  await reset();
  f.control.setActor("reviewer");
  await check("25 hold preserves the request actor", async () => {
    f.control.defer("readNativeArtifactsFn", "hold");
    const p = outcome(() => call("readNativeArtifactsFn", scope()));
    f.control.setActor("owner");
    await f.control.release("readNativeArtifactsFn");
    const r = await p;
    assert(!r.accepted, "reviewer-issued owner call authorized after actor switch");
  });
  await reset();
  await check("26 retired async grant cannot mutate the next case", async () => {
    const digest = await f.control.expectedNativeSetDigest(f.control.rows.multiNative);
    const original = crypto.subtle.digest.bind(crypto.subtle);
    let unblock;
    const gate = new Promise((r) => (unblock = r));
    let first = true;
    crypto.subtle.digest = async (...args) => {
      if (first) {
        first = false;
        await gate;
      }
      return original(...args);
    };
    try {
      f.control.defer("grantCitationReviewNativeAssignmentFn");
      const p = outcome(() =>
        call("grantCitationReviewNativeAssignmentFn", {
          projectId: "p",
          findingRowId: f.control.rows.multiNative,
          reviewerId: f.control.ids.reviewer,
          nativeSetSha256: digest,
        }),
      );
      await reset();
      const before = f.db.assignments.size;
      unblock();
      await new Promise((r) => setTimeout(r, 5));
      const after = f.db.assignments.size;
      await p;
      assert(
        after === before,
        "retired async grant mutated the new generation: " + before + " -> " + after,
      );
    } finally {
      crypto.subtle.digest = original;
    }
  });

  // ---- extra: legacy grant clears native consent (legacy-grant-probe counterexample) ----
  await reset();
  await check("27 legacy grant clears native consent", async () => {
    const key = `p:${f.control.rows.boundNative}:${f.control.ids.reviewer}`;
    assert(f.db.assignments.get(key).native.active === true, "default native consent missing");
    await call("grantCitationReviewAssignmentFn", {
      projectId: "p",
      findingRowId: f.control.rows.boundNative,
      reviewerId: f.control.ids.reviewer,
    });
    assert(!f.db.assignments.get(key).native, "legacy grant retained native consent");
    f.control.setActor("reviewer");
    const r = await outcome(() => call("getCitationFindingForReviewFn", target()));
    assert(!r.accepted, "native material still readable after legacy grant cleared consent");
  });
  // ---- extra: reset disposes pending + timers (teardown isolation) ----
  await reset();
  await check("28 reset disposes in-flight pending and timers", async () => {
    f.control.defer("readNativeArtifactsFn");
    call("readNativeArtifactsFn", scope()).catch(() => {});
    f.control.reHydrateSameActor();
    await reset();
    assert(f.inspect.pending().length === 0, "pending leaked across reset");
  });

  // ================= BFR2 residual regressions (the 9 new counterexamples) =================

  // ---- BFR2-F01 authority + native re-grant ----
  await reset();
  await check("29 native regrant reactivates after revoke (R2D02)", async () => {
    const args = {
      projectId: "p",
      findingRowId: f.control.rows.boundNative,
      reviewerId: f.control.ids.reviewer,
    };
    await call("revokeCitationReviewAssignmentFn", args);
    const grant = await call("grantCitationReviewNativeAssignmentFn", {
      ...args,
      nativeSetSha256: await f.control.expectedNativeSetDigest(args.findingRowId),
    });
    f.control.setActor("reviewer");
    const read = await outcome(() => call("getCitationFindingForReviewFn", target()));
    assert(
      grant.active === true && read.accepted,
      "grant reports active but read=" + JSON.stringify(read),
    );
  });
  await reset();
  await check("30 inactive member is refused detail", async () => {
    f.db.roster.find((x) => x.actorId === f.control.ids.reviewer).active = false;
    f.control.setActor("reviewer");
    assert(
      !(await outcome(() => call("getCitationFindingForReviewFn", target()))).accepted,
      "inactive member served material",
    );
  });
  await reset();
  await check("31 disabled policy is refused detail", async () => {
    f.db.policy.mode = "disabled";
    f.control.setActor("reviewer");
    assert(
      !(await outcome(() => call("getCitationFindingForReviewFn", target()))).accepted,
      "disabled policy served material",
    );
  });
  await reset();
  await check("32 erased finding refuses native grant with no assignment mutation", async () => {
    f.control.setFlag("evidenceErased", true);
    const key = `p:${f.control.rows.boundNative}:${f.control.ids.reviewer}`;
    const before = JSON.stringify(f.db.assignments.get(key));
    const digest = await f.control.expectedNativeSetDigest(f.control.rows.boundNative);
    const r = await outcome(() =>
      call("grantCitationReviewNativeAssignmentFn", {
        projectId: "p",
        findingRowId: f.control.rows.boundNative,
        reviewerId: f.control.ids.reviewer,
        nativeSetSha256: digest,
      }),
    );
    assert(
      !r.accepted && JSON.stringify(f.db.assignments.get(key)) === before,
      "erased grant accepted or mutated",
    );
  });
  await reset();
  await check("38 member restore alone does not revive consent; a fresh grant does", async () => {
    f.control.setActor("reviewer");
    assert(
      (await outcome(() => call("getCitationFindingForReviewFn", target()))).accepted,
      "baseline reviewer read refused",
    );
    f.control.setActor("owner");
    f.control.setMemberActive(false);
    f.control.setMemberActive(true); // remove + restore → authority revision bumped twice
    f.control.setActor("reviewer");
    assert(
      !(await outcome(() => call("getCitationFindingForReviewFn", target()))).accepted,
      "old consent revived after bare restore",
    );
    f.control.setActor("owner");
    await call("grantCitationReviewNativeAssignmentFn", {
      projectId: "p",
      findingRowId: f.control.rows.boundNative,
      reviewerId: f.control.ids.reviewer,
      nativeSetSha256: await f.control.expectedNativeSetDigest(f.control.rows.boundNative),
    });
    f.control.setActor("reviewer");
    assert(
      (await outcome(() => call("getCitationFindingForReviewFn", target()))).accepted,
      "explicit fresh grant did not recover the read",
    );
  });

  // ---- BFR2-F02 request context through reviewer awaits (no global auth swap) ----
  await reset();
  f.control.setActor("reviewer");
  await check(
    "33 reviewer save keeps the request actor across a digest switch (R2D03)",
    async () => {
      const v = await call("getCitationFindingForReviewFn", target());
      const g = gateDigest();
      try {
        const p = outcome(() =>
          call("saveCitationFindingReviewFn", {
            ...target(),
            expectedSha: v.recordSha256,
            decision: "approved",
            note: "captured actor",
          }),
        );
        await g.started;
        f.control.setActor("owner");
        g.unblock();
        const r = await p;
        const receipts = [...f.db.reviews.values()].flat();
        assert(
          !r.accepted || receipts.every((x) => x.reviewerId === f.control.ids.reviewer),
          "receipt attributed to replacement actor " +
            JSON.stringify(receipts.map((x) => x.reviewerId)),
        );
      } finally {
        g.restore();
      }
    },
  );
  await reset();
  f.control.setActor("reviewer");
  await check("34 retired reviewer save cannot mutate the next generation (R2D04)", async () => {
    const v = await call("getCitationFindingForReviewFn", target());
    const g = gateDigest();
    try {
      const p = outcome(() =>
        call("saveCitationFindingReviewFn", {
          ...target(),
          expectedSha: v.recordSha256,
          decision: "approved",
          note: "retired case",
        }),
      );
      await g.started;
      await f.control.setupCase();
      const before = f.db.reviews.size;
      g.unblock();
      await p;
      const after = f.db.reviews.size;
      assert(
        before === after && after === 0,
        "retired reviewer save wrote the replacement generation " +
          JSON.stringify({ before, after }),
      );
    } finally {
      g.restore();
    }
  });
  await reset();
  f.control.setActor("reviewer");
  await check("35 held reviewer read cannot restore auth after signout (R2D05)", async () => {
    f.control.defer("getCitationFindingForReviewFn", "hold");
    const p = outcome(() => call("getCitationFindingForReviewFn", target()));
    f.control.setActor("owner");
    const g = gateDigest();
    try {
      const release = f.control.release("getCitationFindingForReviewFn");
      await g.started;
      f.control.signOut();
      g.unblock();
      await release;
      await p;
      assert(
        f.auth.actorId === null,
        "retired hold restored auth " + f.auth.actorId + " while store " + f.state.userId,
      );
    } finally {
      g.restore();
    }
  });
  await reset();
  await check(
    "40 simultaneous held owner + reviewer keep their own captured authority",
    async () => {
      f.control.setActor("owner");
      f.control.defer("readNativeArtifactsFn", "hold");
      const ownerP = outcome(() => call("readNativeArtifactsFn", scope()));
      f.control.setActor("reviewer");
      f.control.defer("getCitationFindingForReviewFn", "hold");
      const revP = outcome(() => call("getCitationFindingForReviewFn", target()));
      f.control.setActor("none"); // live actor is neither; each held call must use its captured ctx
      await f.control.release("readNativeArtifactsFn");
      await f.control.release("getCitationFindingForReviewFn");
      const ownerR = await ownerP;
      const revR = await revP;
      assert(
        ownerR.accepted,
        "owner-held read refused under its captured owner ctx: " + JSON.stringify(ownerR),
      );
      assert(
        revR.accepted,
        "reviewer-held read refused under its captured reviewer ctx: " + JSON.stringify(revR),
      );
    },
  );

  // ---- BFR2-F03 real input validation before effects + saved native pins ----
  await reset();
  f.control.setActor("reviewer");
  await check("36 oversize review note rejected before any receipt (R2D06)", async () => {
    const v = await call("getCitationFindingForReviewFn", target());
    const bad = {
      ...target(),
      expectedSha: v.recordSha256,
      decision: "approved",
      note: "x".repeat(2001),
    };
    assert(
      !citationFindingReviewInputSchema.safeParse(bad).success,
      "probe note is unexpectedly valid input",
    );
    const r = await outcome(() => call("saveCitationFindingReviewFn", bad));
    const count = [...f.db.reviews.values()].flat().length;
    assert(
      !r.accepted && count === 0,
      "invalid input accepted/persisted " + JSON.stringify({ accepted: r.accepted, count }),
    );
  });
  await reset();
  await check("37 stale native binding save is refused with no head advance (R2D07)", async () => {
    const d = req(rowOf());
    f.control.reparseArtifact(f.control.artifacts.google);
    const before = f.inspect.headVersion(d.finding.findingId);
    const r = await outcome(() => call("saveCitationFindingFn", d));
    const after = f.inspect.headVersion(d.finding.findingId);
    assert(
      !r.accepted && after === before,
      "stale native pin saved " + JSON.stringify({ accepted: r.accepted, before, after }),
    );
  });

  // ---- coordinated lifecycle APIs for the driver owner ----
  await reset();
  f.control.setActor("reviewer");
  await check(
    "39 retireCase preserves traces, retires the generation, surfaces held inFlight",
    async () => {
      const v = await call("getCitationFindingForReviewFn", target());
      const g = gateDigest();
      try {
        const p = outcome(() =>
          call("saveCitationFindingReviewFn", {
            ...target(),
            expectedSha: v.recordSha256,
            decision: "approved",
            note: "held",
          }),
        );
        await g.started;
        const heldVisible = f.inspect
          .inFlight()
          .some((e) => e.name === "saveCitationFindingReviewFn");
        const callsBefore = f.inspect.calls().length;
        const ret = await f.control.retireCase();
        assert(f.inspect.calls().length === callsBefore, "retireCase reset the call trace");
        assert(
          ret.generation > 0 && typeof ret.inFlight === "number",
          "retireCase summary missing",
        );
        g.unblock();
        const r = await p; // resumes on the retired generation → refuses, no receipt
        assert(
          heldVisible && !r.accepted && [...f.db.reviews.values()].flat().length === 0,
          "held save mutated/accepted after retireCase",
        );
      } finally {
        g.restore();
      }
    },
  );

  // ================= BFR3 residual regressions =================

  // ---- BFR3-F01: a deferred-COMMIT handler held in an external digest stays in-flight through retireCase ----
  await reset();
  await check(
    "41 deferred-commit retirement keeps inFlight until TRUE settlement (BFR3-F01)",
    async () => {
      const row = f.control.rows.multiNative;
      const sha = await f.control.expectedNativeSetDigest(row);
      const beforeDb = f.db;
      const beforeAuth = f.auth.actorId;
      const g = gateDigest();
      try {
        f.control.defer("grantCitationReviewNativeAssignmentFn"); // default commit mode
        const p = outcome(() =>
          call("grantCitationReviewNativeAssignmentFn", {
            projectId: "p",
            findingRowId: row,
            reviewerId: f.control.ids.reviewer,
            nativeSetSha256: sha,
          }),
        );
        await g.started;
        const before = f.inspect.inFlight();
        const callsBefore = JSON.stringify(f.inspect.calls());
        await f.control.retireCase(); // rejects the DELIVERY; the committed handler is still held in the digest
        await new Promise((r) => setTimeout(r, 5));
        const during = f.inspect.inFlight();
        const preserved =
          f.db === beforeDb &&
          f.auth.actorId === beforeAuth &&
          JSON.stringify(f.inspect.calls()) === callsBefore;
        g.unblock();
        const r = await p;
        await new Promise((r2) => setTimeout(r2, 5));
        const after = f.inspect.inFlight();
        assert(
          before.length === 1 &&
            during.length === 1 &&
            after.length === 0 &&
            preserved &&
            !r.accepted,
          "unsettled work hidden or state lost " +
            JSON.stringify({
              before: before.length,
              during: during.length,
              after: after.length,
              preserved,
              accepted: r.accepted,
            }),
        );
      } finally {
        g.unblock();
        g.restore();
      }
    },
  );

  // ---- BFR3-F02: native binding resolution requires exact owner/project at save ----
  await reset();
  await check(
    "42 save native binding requires exact owner/project (valid-p + foreign-q) (BFR3-F02)",
    async () => {
      const old = rowOf();
      const base = (findingId, projectId) => ({
        projectId,
        expectedOwnerId: f.control.ids.owner,
        scope: { panelId: old.panelId, panelVersion: old.panelVersion, client: old.client },
        finding: { ...JSON.parse(JSON.stringify(old.record)), findingId },
        expectedVersion: 0,
        expectedHeadId: null,
      });
      const okReq = base("00000000-0000-4000-8000-000000777770", "p");
      const okR = await outcome(() => call("saveCitationFindingFn", okReq));
      assert(
        okR.accepted && f.inspect.headVersion(okReq.finding.findingId) === 1,
        "valid project-p bound save rejected " + JSON.stringify(okR),
      );
      const foreign = base("00000000-0000-4000-8000-000000777771", "q"); // same bound-p artifact, new finding in q
      const fR = await outcome(() => call("saveCitationFindingFn", foreign));
      assert(
        !fR.accepted && f.inspect.headVersion(foreign.finding.findingId) === 0,
        "foreign-project native binding accepted " + JSON.stringify(fR),
      );
    },
  );
  await reset();
  await check(
    "43 committed lost-ack retry returns BEFORE the current-binding re-check (BFR3-F02 preserve)",
    async () => {
      const old = rowOf();
      const d = {
        projectId: "p",
        expectedOwnerId: f.control.ids.owner,
        scope: { panelId: old.panelId, panelVersion: old.panelVersion, client: old.client },
        finding: {
          ...JSON.parse(JSON.stringify(old.record)),
          findingId: "00000000-0000-4000-8000-000000777772",
        },
        expectedVersion: 0,
        expectedHeadId: null,
      };
      f.control.setFlag("lostAck", true);
      const first = await outcome(() => call("saveCitationFindingFn", d)); // commits v1 then loses the ack
      assert(!first.accepted, "lost-ack did not surface");
      f.control.reparseArtifact(f.control.artifacts.google); // a FRESH binding check would now fail
      const retry = await call("saveCitationFindingFn", d); // exact retry → ledger hit BEFORE the binding re-check
      assert(
        retry.version === 1 && f.inspect.headVersion(d.finding.findingId) === 1,
        "exact lost-ack retry not idempotent " + JSON.stringify(retry),
      );
    },
  );

  // ---- BFR4-F01: a queued normal-path dispatch is refused if the case retires before it runs ----
  await reset();
  await check("44 queued save dispatch refused after immediate retireCase (BFR4-F01)", async () => {
    const old = rowOf();
    const id = "00000000-0000-4000-8000-000000777773";
    const d = {
      projectId: "p",
      expectedOwnerId: f.control.ids.owner,
      scope: { panelId: old.panelId, panelVersion: old.panelVersion, client: old.client },
      finding: { ...JSON.parse(JSON.stringify(old.record)), findingId: id },
      expectedVersion: 0,
      expectedHeadId: null,
    };
    const p = outcome(() => call("saveCitationFindingFn", d)); // delivery is queued on a microtask
    const callsSnap = JSON.stringify(f.inspect.calls());
    const before = f.inspect.headVersion(id);
    await f.control.retireCase(); // bumps the generation SYNCHRONOUSLY before the queued dispatch executes
    const r = await p;
    const after = f.inspect.headVersion(id);
    await new Promise((res) => setTimeout(res, 5));
    assert(
      before === 0 &&
        after === 0 &&
        !r.accepted &&
        String(r.error).includes("fixture_case_retired") &&
        JSON.stringify(f.inspect.calls()) === callsSnap &&
        f.inspect.inFlight().length === 0,
      "queued save mutated a retired case " +
        JSON.stringify({
          before,
          after,
          accepted: r.accepted,
          error: r.error,
          inFlight: f.inspect.inFlight().length,
        }),
    );
  });

  const passed = results.every((r) => r.pass);
  console.log(
    JSON.stringify(
      {
        passed,
        phase: passed ? null : phase,
        failed: results.filter((r) => !r.pass),
        total: results.length,
        results,
      },
      null,
      2,
    ),
  );
  return passed ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.log(JSON.stringify({ passed: false, phase, fatal: String(e?.stack ?? e) }, null, 2));
    process.exit(1);
  });
