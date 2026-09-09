import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { OwnerBenchmarkPanel } from "@/components/OwnerBenchmarkPanel";
import { useT } from "@/i18n";
export const Route = createFileRoute("/_authenticated/app/owner-test")({
  validateSearch: (search: Record<string, unknown>) => ({
    run: z.string().uuid().optional().catch(undefined).parse(search.run),
  }),
  head: () => ({ meta: [{ title: "Generation test — Milo Growth" }] }),
  component: OwnerTestPage,
});
function OwnerTestPage() {
  const { run } = Route.useSearch();
  const t = useT();
  return (
    <AppShell title={t("benchmark.title")} description={t("benchmark.description")}>
      {run ? <OwnerBenchmarkPanel key={run} runId={run} /> : null}
    </AppShell>
  );
}
