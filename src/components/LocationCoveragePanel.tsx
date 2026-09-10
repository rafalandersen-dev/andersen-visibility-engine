import { coverageRows } from "@/lib/location-coverage-selection";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import * as knowledge from "@/lib/project-knowledge.functions";
import { coverageSchema, emptyCoverage, type Coverage } from "@/lib/location-coverage";
import type { KnowledgeRecord } from "@/lib/project-knowledge";
import type { Project } from "@/lib/types";
import { readPublicationEvidenceFn } from "@/lib/publication-evidence.functions";

export function LocationCoveragePanel({ project }: { project: Project }) {
  const { user } = useAuth();
  return user ? (
    <CoverageProject key={`${user.id}:${project.id}`} ownerId={user.id} project={project} />
  ) : null;
}
function CoverageProject({ ownerId, project }: { ownerId: string; project: Project }) {
  const t = useT();
  const projectId = project.id;
  const [draft, setDraft] = useState<Coverage>(emptyCoverage);
  const [editing, setEditing] = useState<KnowledgeRecord | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [locator, setLocator] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [failed, setFailed] = useState(false);
  const query = useQuery({
    queryKey: ["location-coverage", ownerId, projectId],
    queryFn: () => knowledge.readProjectKnowledgeFn({ data: { projectId } }),
    staleTime: 0,
  });
  const [publicationPage, setPublicationPage] = useState(0);
  const publications = useQuery({
    queryKey: ["coverage-publications", ownerId, projectId, publicationPage],
    queryFn: () => readPublicationEvidenceFn({ data: { projectId, page: publicationPage } }),
    staleTime: 0,
  });
  const rows =
    query.data && !query.isError
      ? coverageRows(
          query.data.sources,
          query.data.records,
          { ownerId, projectId },
          new Date().toISOString(),
        )
      : [];
  async function change(action: () => Promise<unknown>) {
    if (lock.current || failed) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await action();
      setEditing(null);
      setDraft(emptyCoverage);
      setSourceId("");
      setLocator("");
      await query.refetch();
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const targets = [...new Set([project.mainLocation, ...project.targetLocations].filter(Boolean))];
  const globalTarget = project.market ?? "";
  const globalLanguage = project.primaryContentLanguage ?? project.primaryLanguage;
  const targetDrafts: Coverage[] = [
    ...targets.map((target) => ({ ...emptyCoverage, target })),
    ...(globalTarget
      ? [
          {
            ...emptyCoverage,
            kind: "global" as const,
            target: globalTarget,
            language: globalLanguage,
          },
        ]
      : []),
  ];
  const valid = coverageSchema.safeParse(draft).success && !!locator.trim();
  return (
    <section className="rounded-xl border bg-card p-5 mb-6 space-y-5">
      <h2 className="font-display text-xl">{t("coverage.title")}</h2>
      <p className="text-sm text-muted-foreground">{t("coverage.help")}</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <Link to="/app/setup" className="underline">
          {t("coverage.setup")}
        </Link>
        <Link to="/app/plan" className="underline">
          {t("coverage.plan")}
        </Link>
        <Link to="/app/specialists" search={{ knowledge: true }} className="underline">
          {t("coverage.history")}
        </Link>
        <Link to="/app/report" className="underline">
          {t("coverage.proof")}
        </Link>
      </div>
      <p className="text-sm">
        {t("coverage.targets")}:{" "}
        {[project.mainLocation, ...project.targetLocations].filter(Boolean).join(" · ") ||
          t("coverage.missing")}
      </p>
      <Button
        variant="outline"
        disabled={busy || query.isFetching}
        onClick={async () => {
          const result = await query.refetch();
          if (!result.isError && failed) {
            setFailed(false);
            setEditing(null);
            setDraft(emptyCoverage);
            setSourceId("");
            setLocator("");
          }
        }}
      >
        {t("weekly.refresh")}
      </Button>
      {query.isPending && <p role="status">{t("proof.loading")}</p>}
      {query.isError && <p role="alert">{t("coverage.failed")}</p>}
      {failed && <p role="alert">{t("coverage.failed")}</p>}
      {query.data && !query.isError && (
        <>
          <div className="flex flex-wrap gap-3">
            {targetDrafts.map((target) => {
              const present = rows.some(
                (row) =>
                  row.state === "reviewed" &&
                  row.value?.kind === target.kind &&
                  row.value.target.trim().toLowerCase() === target.target.trim().toLowerCase() &&
                  (target.kind === "local" || row.value.language === target.language),
              );
              return (
                <Button
                  key={`${target.kind}:${target.target}`}
                  variant="outline"
                  disabled={busy || failed}
                  onClick={() => {
                    setEditing(null);
                    setSourceId("");
                    setLocator("");
                    setDraft(target);
                  }}
                >
                  {target.target} {target.language} ·{" "}
                  {t(present ? "coverage.hasRecord" : "coverage.noRecord")}
                </Button>
              );
            })}
          </div>
          {!rows.length && <p>{t("coverage.empty")}</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.map((row) => (
              <article className="border rounded-lg p-4 space-y-2" key={row.record.id}>
                <h3 className="font-medium">
                  {row.value?.target ?? row.record.key}{" "}
                  {row.value?.service ? `· ${row.value.service}` : ""}
                </h3>
                <p className="text-sm">
                  {t(`coverage.${row.state}`)} · {t(`knowledge.status.${row.record.status}`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.source?.label} · {row.record.locator} · {t("knowledge.ui.sourceVersion")}{" "}
                  {row.record.sourceRevision} · {row.source?.observedAt} ·{" "}
                  {t("knowledge.ui.version")} {row.record.revision}
                </p>
                <p className="text-xs">
                  {t("knowledge.ui.savedDate")} {row.record.updatedAt}
                  {row.record.reviewedAt ? ` · ${row.record.reviewedAt}` : ""}
                </p>
                {row.value && (
                  <dl className="text-sm space-y-1">
                    {(row.value.kind === "local"
                      ? [
                          "name",
                          "address",
                          "phone",
                          "service",
                          "pageUrl",
                          "citationUrl",
                          "reviewUrl",
                          "gbpUrl",
                        ]
                      : ["language", "pageUrl", "alternateUrl"]
                    ).map((field) => (
                      <div key={field}>
                        <dt className="inline text-muted-foreground">
                          {t(`coverage.field.${field}`)}:{" "}
                        </dt>
                        <dd className="inline break-words">
                          {row.value![field as keyof Coverage] || t("coverage.missing")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                {row.value?.notes && <p className="text-sm">{row.value.notes}</p>}
                <p className="text-xs text-muted-foreground">{t("coverage.unverified")}</p>
                <Button
                  variant="outline"
                  disabled={busy || !row.value}
                  onClick={() => {
                    setEditing(row.record);
                    setDraft(row.value!);
                    setLocator(row.record.locator);
                    setSourceId(row.record.sourceId);
                  }}
                >
                  {t("knowledge.ui.review")}
                </Button>
              </article>
            ))}
          </div>
          <form
            className="border-t pt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid || busy) return;
              void change(async () => {
                const value = coverageSchema.parse(draft);
                const fields = {
                  key: editing?.key ?? `coverage.${value.kind}.${crypto.randomUUID()}`,
                  category: "fact" as const,
                  appliesTo: "text" as const,
                  value: JSON.stringify(value),
                  locator: locator.trim(),
                };
                if (editing)
                  await knowledge.reviewProjectKnowledgeFn({
                    data: {
                      projectId,
                      id: editing.id,
                      expectedRevision: editing.revision,
                      fields,
                      status: "accepted",
                    },
                  });
                else if (sourceId) {
                  const source = query.data!.sources.find(
                    (s) => s.id === sourceId && s.status === "active",
                  );
                  if (!source) throw Error("source_unavailable");
                  await knowledge.proposeKnowledgeRecordFn({
                    data: {
                      projectId,
                      id: crypto.randomUUID(),
                      sourceId,
                      sourceRevision: source.revision,
                      fields,
                    },
                  });
                } else await knowledge.teachProjectKnowledgeFn({ data: { projectId, fields } });
              });
            }}
          >
            <h3 className="font-medium">{t(editing ? "coverage.edit" : "coverage.add")}</h3>
            <fieldset disabled={busy || failed} className="space-y-4">
              <label className="block text-sm">
                {t("coverage.kind")}
                <select
                  className="block border rounded p-2 bg-background"
                  value={draft.kind}
                  disabled={!!editing}
                  onChange={(e) =>
                    setDraft({ ...emptyCoverage, kind: e.target.value as Coverage["kind"] })
                  }
                >
                  <option value="local">{t("coverage.local")}</option>
                  <option value="global">{t("coverage.global")}</option>
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                {(
                  [
                    "target",
                    ...(draft.kind === "local"
                      ? [
                          "name",
                          "address",
                          "phone",
                          "service",
                          "pageUrl",
                          "citationUrl",
                          "reviewUrl",
                          "gbpUrl",
                        ]
                      : ["language", "pageUrl", "alternateUrl"]),
                    "notes",
                  ] as (keyof Coverage)[]
                ).map((field) => (
                  <label key={field} className="text-sm">
                    {t(`coverage.field.${field}`)}
                    <Input
                      value={draft[field]}
                      onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                      maxLength={
                        field.endsWith("Url")
                          ? 500
                          : field === "notes"
                            ? 400
                            : field === "address"
                              ? 240
                              : field === "phone"
                                ? 60
                                : field === "language"
                                  ? 35
                                  : 160
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("coverage.urlHelp")}</p>
              {!editing && (
                <label className="block text-sm">
                  {t("coverage.source")}
                  <select
                    className="block border rounded p-2 bg-background max-w-full"
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                  >
                    <option value="">{t("coverage.owner")}</option>
                    {query.data.sources
                      .filter((s) => s.status === "active")
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label} · {s.revision}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="block text-sm">
                {t("coverage.locator")}
                <Input
                  maxLength={200}
                  value={locator}
                  onChange={(e) => setLocator(e.target.value)}
                />
              </label>
              <p className="text-xs text-muted-foreground">{t("coverage.reviewHelp")}</p>
              <Button type="submit" disabled={!valid}>
                {t(!editing && sourceId ? "coverage.propose" : "coverage.save")}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setDraft(emptyCoverage);
                    setSourceId("");
                    setLocator("");
                  }}
                >
                  {t("knowledge.ui.cancel")}
                </Button>
              )}
            </fieldset>
          </form>
        </>
      )}
      <div className="border-t pt-4 space-y-3">
        <h3 className="font-medium">{t("coverage.publications")}</h3>
        <p className="text-sm text-muted-foreground">{t("coverage.publicationHelp")}</p>
        {publications.isPending && <p role="status">{t("proof.loading")}</p>}
        {publications.isError && <p role="alert">{t("coverage.failed")}</p>}
        {publications.data && !publications.isError && (
          <>
            <p>{t("proof.total", { count: publications.data.total })}</p>
            {publications.data.items.map((item) => (
              <article className="border rounded p-3 text-sm" key={item.id}>
                <p>
                  {item.title} · {t(`proof.state.${item.outcome}`)} · {item.startedAt}
                </p>
                <p>
                  {t("coverage.matches")}:{" "}
                  {rows
                    .filter(
                      (row) =>
                        row.state === "reviewed" &&
                        row.value?.pageUrl &&
                        row.value.pageUrl === item.outcomeData?.liveUrl,
                    )
                    .map((row) => row.value!.target)
                    .join(" · ") || t("coverage.noMatch")}
                </p>
                <p className="text-xs break-all">
                  {t("proof.version")}: {item.versionHash}
                </p>
              </article>
            ))}
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={publicationPage === 0}
                onClick={() => setPublicationPage((p) => p - 1)}
              >
                {t("proof.previous")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  (publicationPage + 1) * 50 >= publications.data.total || publicationPage >= 19
                }
                onClick={() => setPublicationPage((p) => p + 1)}
              >
                {t("proof.next")}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
