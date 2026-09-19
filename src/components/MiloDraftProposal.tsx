import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import { draftProposalView, metadataField } from "@/lib/milo-draft-proposal";
import {
  readMiloDraftProposalFn,
  applyMiloDraftProposalFn,
} from "@/lib/milo-draft-proposal.functions";
import { runTeamRequest } from "@/lib/team-request-queue";
import { Button } from "./ui/button";

type Props = {
  actorId: string;
  ownerId: string;
  projectId: string;
  conversationId: string;
  turnId: string;
  proposalId: string;
};
/** Parent keys this review by actor, client, conversation and operation. Cached
 * reads never authorize a save, and failed reads hide cached private content. */
export function MiloDraftProposal({ actorId, ...target }: Props) {
  const t = useT(),
    client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const busy = useRef(false);
  const lifecycle = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);
  const queryKey = [
    "milo-draft-proposal",
    actorId,
    target.ownerId,
    target.projectId,
    target.conversationId,
    target.turnId,
    target.proposalId,
  ];
  const checked = (raw: unknown) => {
    const view = draftProposalView.parse(raw);
    if (
      view.actorId !== actorId ||
      Object.entries(target).some(([key, value]) => view[key as keyof typeof target] !== value)
    )
      throw new Error("Draft proposal unavailable.");
    return view;
  };
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) =>
      checked(await runTeamRequest(() => readMiloDraftProposalFn({ data: target }), signal)),
    enabled: open && !saving,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 15000,
  });
  const view = query.isError ? undefined : query.data;
  const canSave = view?.state === "ready" && !query.isFetching && !saving && !unconfirmed;
  async function refresh() {
    if (busy.current) return;
    const result = await query.refetch();
    if (!result.isError) setUnconfirmed(false);
  }
  async function save() {
    if (busy.current || !canSave) return;
    busy.current = true;
    setSaving(true);
    try {
      const signal = lifecycle.current.signal;
      const result = checked(
        await runTeamRequest(() => applyMiloDraftProposalFn({ data: target }), signal),
      );
      if (result.state !== "applied") throw new Error("Draft save unconfirmed.");
      // A dispatched save may finish after navigation or conversation erasure.
      // Never recreate a deleted private proposal cache from its late response.
      if (!signal.aborted) client.setQueryData(queryKey, result);
      void client.invalidateQueries({ queryKey: ["project-teams", actorId] });
    } catch {
      setUnconfirmed(true);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="ml-4 min-w-0 rounded-xl border bg-secondary/20 p-4 text-sm">
      <p className="font-medium">{t("chat.tool.draft_metadata_proposal")}</p>
      {!open ? (
        <Button className="mt-3" size="sm" variant="outline" onClick={() => setOpen(true)}>
          {t("chat.proposal.review")}
        </Button>
      ) : (
        <div className="mt-3 space-y-4">
          {query.isPending && <p role="status">{t("common.loading")}</p>}
          {query.isError && <p role="alert">{t("chat.unavailable")}</p>}
          {view && (
            <>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {view.explanation}
              </p>
              <dl className="space-y-4">
                {metadataField.options
                  .filter((field) => Object.hasOwn(view.fields, field))
                  .map((field) => (
                    <div key={field}>
                      <dt className="font-medium">{t(`collaboration.field.${field}`)}</dt>
                      <dd className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
                        {(["before", "fields"] as const).map((side) => (
                          <div key={side} className="min-w-0 rounded-lg border bg-background p-3">
                            <p className="mb-2 text-xs font-semibold text-muted-foreground">
                              {t(
                                side === "before" ? "chat.proposal.before" : "chat.proposal.after",
                              )}
                            </p>
                            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                              {view[side][field] || t("chat.proposal.empty")}
                            </p>
                          </div>
                        ))}
                      </dd>
                    </div>
                  ))}
              </dl>
              <p role="status">{t(`chat.proposal.${view.state}`)}</p>
              <a
                className="inline-block underline underline-offset-4"
                href={`/app/collaborators?${new URLSearchParams({ owner: target.ownerId, project: target.projectId, asset: view.assetId })}`}
              >
                {t("chat.openContext")}
              </a>
            </>
          )}
          {unconfirmed && <p role="alert">{t("chat.proposal.unconfirmed")}</p>}
          <div className="flex flex-wrap gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={query.isFetching || saving}
              onClick={() => void refresh()}
            >
              {t("benchmark.refresh")}
            </Button>
            {view && view.state !== "applied" && (
              <Button size="sm" disabled={!canSave} onClick={() => void save()}>
                {saving ? t("common.loading") : t("setup.saveChanges")}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
