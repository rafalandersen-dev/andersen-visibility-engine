// Optional finite server-render smoke. Not an interaction test or production proof.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fixture, reset } from "./fixture.js";
import { Route as Pricing } from "@/routes/pricing";
import { Route as Setup } from "@/routes/_authenticated/app.setup";
import { Route as Today } from "@/routes/_authenticated/app.today";
import { Route as Editor } from "@/routes/_authenticated/app.editor";
import { Route as Analytics } from "@/routes/_authenticated/app.analytics";
import { publicationVersion, samePublicationVersion } from "@/lib/publication-version";
import { buildActiveInternalPaths } from "@/lib/publish-targets";
import { editorPrimaryAction } from "@/lib/editor-primary-action";
import assert from "node:assert/strict";
let failed = 0;
for (const [name, route] of Object.entries({
  pricing: Pricing,
  setup: Setup,
  today: Today,
  editor: Editor,
  analytics: Analytics,
})) {
  for (const scenario of name === "today"
    ? ["ready", "review", "armed", "blocked", "empty"]
    : ["ready"]) {
    fixture.screen = name;
    reset(scenario);
    const Component = route.options.component;
    const client = new QueryClient();
    try {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <Component />
        </QueryClientProvider>,
      );
      console.log(JSON.stringify({ screen: name, scenario, rendered: true, bytes: html.length }));
    } catch (error) {
      failed++;
      console.error(
        JSON.stringify({
          screen: name,
          scenario,
          rendered: false,
          error: String(error.stack || error),
        }),
      );
    } finally {
      client.clear();
    }
  }
}
if (failed) process.exitCode = 1;

// Finite adapter checks use the real version algorithm and primary-action helper.
// They do not execute React effects or replace the parent's browser interaction.
export const smokeDone = (async () => {
  const read = () =>
    fixture.invoke("readPublicationApprovalFn", [
      { data: { projectId: "fixture-project", assetId: "fixture-article" } },
    ]);
  const localVersion = () => {
    const project = fixture.state.projects[0];
    return publicationVersion(
      fixture.state.content[0],
      project,
      buildActiveInternalPaths(project, fixture.state.content),
    );
  };
  fixture.approvalMode = "needed";
  reset("ready");
  assert.equal((await read()).approved, false);
  assert.equal(editorPrimaryAction(fixture.state.content[0], false, "needed"), "approve");

  fixture.approvalMode = "current";
  reset("ready");
  const current = await read();
  assert.equal(current.approved, true);
  assert.equal(samePublicationVersion(current.version, await localVersion()), true);
  assert.equal(
    editorPrimaryAction(fixture.state.content[0], false, "current"),
    "reviewPublication",
  );
  assert.equal(await read(), current, "repeat reads reuse the seeded receipt");
  fixture.state.content[0] = { ...fixture.state.content[0], title: "Edited after approval" };
  assert.equal(samePublicationVersion((await read()).version, await localVersion()), false);

  fixture.approvalMode = "stale";
  reset("ready");
  assert.equal(samePublicationVersion((await read()).version, await localVersion()), false);

  fixture.approvalMode = "unavailable";
  reset("ready");
  await assert.rejects(read, /Synthetic approval read unavailable/);

  fixture.approvalMode = "needed";
  reset("ready");
  const expectedVersion = await localVersion();
  await fixture.invoke("setPublicationApprovalFn", [
    {
      data: {
        projectId: "fixture-project",
        assetId: "fixture-article",
        expectedVersion,
        approved: true,
      },
    },
  ]);
  assert.equal(samePublicationVersion((await read()).version, expectedVersion), true);
  await assert.rejects(() => fetch("https://denied.example.invalid"), /Fixture denies fetch/);
  await assert.rejects(() => fixture.invoke("unsupportedLiveOperation", []), /blocks unsupported/);
  console.log(
    JSON.stringify({
      fixtureApprovalContracts: "passed",
      cases: [
        "needed",
        "current",
        "unchanged-receipt-after-edit",
        "stale",
        "unavailable",
        "explicit-approval-write",
      ],
      fetchAndUnsupportedOperations: "denied",
      browserEffects: "not covered by this smoke",
    }),
  );
})();
