import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import {
  readWorkflowComparisonsFn,
  saveWorkflowComparisonFn,
} from "@/lib/workflow-comparison.functions";
import { workflowComparisonSchema } from "@/lib/workflow-comparison";
import { Button } from "@/components/ui/button";
export function WorkflowComparisonPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  return user ? (
    <ComparisonProject key={`${user.id}:${projectId}`} projectId={projectId} ownerId={user.id} />
  ) : null;
}
function ComparisonProject({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const t = useT(),
    locale = useAppLanguage();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const query = useQuery({
    queryKey: ["workflow-comparisons", ownerId, projectId],
    queryFn: () => readWorkflowComparisonsFn({ data: { projectId } }),
    staleTime: 0,
  });
  const money = (n: number | null) =>
    n === null
      ? t("workflow.unknownCost")
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 2,
          maximumFractionDigits: 6,
        }).format(n);
  return (
    <section className="rounded-xl border p-5 space-y-4 mt-6">
      <h2 className="font-display text-xl">{t("workflow.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("workflow.help")}</p>
      <label className="block text-sm">
        {t("workflow.import")}
        <input
          className="mt-2 block w-full rounded border p-2"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(false);
            try {
              if (file.size > 250000) throw Error();
              const input = workflowComparisonSchema.parse(JSON.parse(await file.text()));
              if (input.projectId !== projectId) throw Error();
              await saveWorkflowComparisonFn({
                data: { expectedOwnerId: ownerId, comparison: input },
              });
              await query.refetch();
            } catch {
              setError(true);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <Button
        variant="outline"
        disabled={query.isFetching || busy}
        onClick={() => void query.refetch()}
      >
        {t("weekly.refresh")}
      </Button>
      {(error || query.isError) && <p role="alert">{t("workflow.failed")}</p>}
      {query.isPending && <p role="status">{t("proof.loading")}</p>}
      {!query.isError && query.data && (
        <>
          {query.data.length === 0 && <p className="text-sm">{t("workflow.empty")}</p>}
          {query.data.map((row) => (
            <article key={row.id} className="rounded-lg border p-4 space-y-2">
              <h3 className="font-medium">{row.suiteName}</h3>
              <p className="text-sm">
                {row.baselineVersion} → {row.candidateVersion} ·{" "}
                {t("workflow.cases", { count: row.caseCount })}
              </p>
              <p>{t(`workflow.verdict.${row.verdict}`)}</p>
              <p className="text-sm">
                {t("workflow.cost")}: {money(row.baselineCost)} → {money(row.candidateCost)}
              </p>
              <p className="text-xs text-muted-foreground break-all">
                {t("workflow.fixedBriefs")}: {row.fixedBriefHash}
              </p>
              <p className="text-xs text-muted-foreground">{t("workflow.limits")}</p>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
