import { useCallback, useEffect, useRef, useState } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useT } from "@/i18n";
import { useStore, saveWorkspaceNow } from "@/lib/store";
import { SourceRefreshPanel } from "./SourceRefreshPanel";
import {
  readSourceRefreshFn,
  readSourceImpactFn,
  configureShopifyCatalogFn,
} from "@/lib/source-refresh.functions";
import * as api from "@/lib/project-knowledge.functions";
import type { KnowledgeRecord, KnowledgeSource } from "@/lib/project-knowledge";
import { selectProjectKnowledge } from "@/lib/project-knowledge";
import {
  brandFieldValue,
  brandRecordDisposition,
  brandRecordPatch,
  extractLabelledBrandProposals,
  filterBrandKnowledge,
  knowledgeBrandFields,
  mappedBrandField,
  resolveKnowledgeBrand,
} from "@/lib/knowledge-brand";
import { displayBrandValue } from "@/lib/brand-proposal";
import type { BrandDocumentText } from "@/lib/brand-document";

const categories: [KnowledgeRecord["category"], string][] = [
  ["voice", "knowledge.category.voice"],
  ["audience", "knowledge.category.audience"],
  ["offer", "knowledge.category.offer"],
  ["fact", "knowledge.category.fact"],
  ["claimRestriction", "knowledge.category.claimRestriction"],
  ["visualStyle", "knowledge.category.visualStyle"],
  ["terminology", "knowledge.category.terminology"],
  ["lesson", "knowledge.category.lesson"],
  ["writingExample", "knowledge.category.writingExample"],
];
type State = { sources: KnowledgeSource[]; records: KnowledgeRecord[] };
type Draft = Pick<
  KnowledgeRecord,
  "key" | "category" | "appliesTo" | "value" | "locator" | "excerpt"
>;
const blank = (): Draft => ({
  key: "voice.guidance",
  category: "voice",
  appliesTo: "both",
  value: "",
  locator: "Owner instruction",
});
const parseDocument = createClientOnlyFn(async (file: File) => {
  const { extractBrandDocument } = await import("@/lib/brand-document.client");
  return extractBrandDocument(file);
});

/** Mounted with an account/project key. Document bytes and extracted text live
 * only in this panel's memory; they never enter the persisted setup draft. */
export function ProjectKnowledgePanel({
  projectId,
  ownerId,
  initialWebsiteUrl = "",
  onBusyChange,
}: {
  projectId: string;
  ownerId: string;
  initialWebsiteUrl?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useT();
  const profile = useStore((store) => store.projects.find((project) => project.id === projectId));
  const [sourceImpact, setSourceImpact] = useState<Awaited<
    ReturnType<typeof readSourceImpactFn>
  > | null>(null);
  const [refreshState, setRefreshState] = useState<Awaited<ReturnType<typeof readSourceRefreshFn>>>(
    [],
  );
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl);
  const [state, setState] = useState<State>({ sources: [], records: [] });
  const [loading, setLoading] = useState(true),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy || loading);
  }, [busy, loading, onBusyChange]);
  const [draft, setDraft] = useState<Draft>(blank),
    [editing, setEditing] = useState<KnowledgeRecord | null>(null);
  const [document, setDocument] = useState<{
    source: KnowledgeSource;
    text: BrandDocumentText;
  } | null>(null);
  const [history, setHistory] = useState<{
    record: KnowledgeRecord;
    versions: KnowledgeRecord[];
  } | null>(null);
  const [sourceHistory, setSourceHistory] = useState<{
    source: KnowledgeSource;
    versions: KnowledgeSource[];
  } | null>(null);
  const [remove, setRemove] = useState<{
    kind: "source" | "record";
    item: KnowledgeSource | KnowledgeRecord;
  } | null>(null);
  const alive = useRef(true),
    working = useRef(false),
    request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      const next = await api.readProjectKnowledgeFn({ data: { projectId } });
      const observations = await readSourceRefreshFn({ data: { projectId } });
      const impact = await readSourceImpactFn({ data: { projectId } });
      if (alive.current && current === request.current) {
        setRefreshState(observations);
        setSourceImpact(impact);
        setState(next);
        setDocument((current) =>
          current &&
          next.sources.some(
            (source) =>
              source.id === current.source.id &&
              source.revision === current.source.revision &&
              source.status === "active",
          )
            ? current
            : null,
        );
        setFailed(false);
      }
    } catch {
      if (alive.current && current === request.current) setFailed(true);
    } finally {
      if (alive.current && current === request.current) setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    const counter = request;
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      counter.current++;
    };
  }, [load]);
  async function change(action: () => Promise<unknown>) {
    if (working.current || failed || loading) return;
    working.current = true;
    setBusy(true);
    try {
      await action();
      if (alive.current) {
        setEditing(null);
        setDraft(blank());
        setHistory(null);
        setSourceHistory(null);
        setRemove(null);
        await load();
      }
    } catch (error) {
      if (alive.current) {
        if (error instanceof Error && error.message.startsWith("brand_document_")) {
          toast.error(
            error.message === "brand_document_no_text"
              ? t("knowledge.ui.noText")
              : t("knowledge.ui.parseFailed"),
          );
          return;
        }
        setFailed(true);
        toast.error(t("knowledge.ui.changeFailed"));
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function upload(file: File, replacement?: KnowledgeSource) {
    await change(async () => {
      const text = await parseDocument(file);
      if (!alive.current) return;
      const existing = state.sources.find(
        (s) => s.kind === "document" && s.status === "active" && s.fingerprint === text.fingerprint,
      );
      if (existing && !replacement) {
        setDocument({ source: existing, text });
        return;
      }
      await saveWorkspaceNow();
      if (!alive.current) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const source = await api.uploadKnowledgeDocumentFn({
        data: {
          projectId,
          id: replacement?.id ?? crypto.randomUUID(),
          expectedRevision: replacement?.revision ?? 0,
          label: file.name.slice(0, 200),
          base64: btoa(binary),
        },
      });
      if (alive.current) setDocument({ source, text });
    });
  }
  async function showSourceHistory(source: KnowledgeSource, before?: number) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const versions = await api.knowledgeHistoryFn({
        data: { projectId, id: source.id, kind: "source", before },
      });
      if (alive.current) setSourceHistory({ source, versions: versions as KnowledgeSource[] });
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function showRecordHistory(record: KnowledgeRecord, before?: number) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const versions = await api.knowledgeHistoryFn({
        data: { projectId, id: record.id, kind: "record", before },
      });
      if (alive.current) setHistory({ record, versions: versions as KnowledgeRecord[] });
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const disabled = busy || loading || failed;
  const conflicts = new Set(
    ["text", "visual"].flatMap(
      (output) =>
        selectProjectKnowledge(
          state.sources,
          state.records,
          { ownerId, projectId },
          output as "text" | "visual",
          new Date().toISOString(),
        ).conflicts,
    ),
  );
  const selection = selectProjectKnowledge(
    state.sources,
    state.records,
    { ownerId, projectId },
    "text",
    new Date().toISOString(),
  );
  const effectiveBrand = resolveKnowledgeBrand(
    profile ?? {},
    filterBrandKnowledge(selection, profile ?? {}).records,
    new Date().toISOString(),
  );
  const fields = (record: KnowledgeRecord): Draft => ({
    key: record.key,
    category: record.category,
    appliesTo: record.appliesTo,
    value: record.value,
    locator: record.locator,
    ...(record.excerpt ? { excerpt: record.excerpt } : {}),
  });
  return (
    <div className="mt-7 border-t border-border pt-6 space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-display text-lg"> {t("knowledge.ui.title")} </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          {" "}
          {t("knowledge.ui.refresh")}{" "}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground"> {t("knowledge.ui.intro")} </p>
      {loading && <p role="status"> {t("knowledge.ui.loading")} </p>}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {" "}
          {t("knowledge.ui.failed")}{" "}
        </p>
      )}
      {!loading && !failed && state.records.length === 0 && (
        <p className="text-sm text-muted-foreground"> {t("knowledge.ui.empty")} </p>
      )}
      <details className="rounded-md border p-3 space-y-2" open>
        <summary className="font-medium">{t("knowledge.brand.summary")}</summary>
        <p className="text-xs text-muted-foreground">{t("knowledge.brand.explanation")}</p>
        {knowledgeBrandFields.map((field) => (
          <div key={field.field} className="text-sm">
            <span className="font-medium">{t(field.label)}: </span>
            <span className="whitespace-pre-wrap">
              {displayBrandValue(
                brandFieldValue(effectiveBrand, field.field) ||
                  (field.field === "voice.tone" ? profile?.toneOfVoice : undefined),
              ) || t("knowledge.brand.empty")}
            </span>
          </div>
        ))}
      </details>
      {state.records.map((record) => {
        const source = state.sources.find((s) => s.id === record.sourceId);
        const inactive =
          !source || source.status !== "active" || source.revision !== record.sourceRevision;
        return (
          <article key={record.id} className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t(`knowledge.category.${record.category}`)} ·{" "}
              {inactive
                ? t("knowledge.ui.removed")
                : conflicts.has(record.key)
                  ? t("knowledge.ui.conflict")
                  : t(
                      `knowledge.status.${record.validUntil && Date.parse(record.validUntil) <= Date.now() ? "expired" : record.status}`,
                    )}{" "}
              {t("knowledge.ui.versionDot")} {record.revision}
            </p>
            {mappedBrandField(record.key) && (
              <p className="text-sm font-medium">
                {t(mappedBrandField(record.key)!.label)} ·{" "}
                {t(
                  brandRecordDisposition(profile ?? {}, record) === "owner"
                    ? "knowledge.brand.owner"
                    : "knowledge.brand.source",
                )}
              </p>
            )}
            <p className="text-sm whitespace-pre-wrap break-words">{record.value}</p>
            <p className="text-xs text-muted-foreground">
              {source?.label} · {record.locator} {t("knowledge.ui.sourceVersion")}{" "}
              {record.sourceRevision}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || inactive}
                onClick={() => {
                  setEditing(record);
                  setDraft(fields(record));
                }}
              >
                {" "}
                {t("knowledge.ui.review")}{" "}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => void showRecordHistory(record)}
              >
                {" "}
                {t("knowledge.ui.history")}{" "}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setRemove({ kind: "record", item: record })}
              >
                {" "}
                {t("knowledge.ui.forget")}{" "}
              </Button>
            </div>
          </article>
        );
      })}
      {history && (
        <div className="rounded-md border p-3 space-y-2">
          <h4 className="font-medium"> {t("knowledge.ui.savedVersions")} </h4>
          {history.versions.map((version) => (
            <div key={version.revision} className="space-y-1">
              <p className="text-sm">
                {" "}
                {t("knowledge.ui.version")} {version.revision} ·{" "}
                {t(`knowledge.status.${version.status}`)}: {version.value}
              </p>
              <p className="text-xs text-muted-foreground">
                {" "}
                {t("knowledge.ui.savedDate")} {new Date(version.updatedAt).toLocaleString()}
                {version.reviewedAt
                  ? ` · ${t("knowledge.ui.reviewedDate", { date: new Date(version.reviewedAt).toLocaleString() })}`
                  : ""}
              </p>
              {version.revision < history.record.revision && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    void change(() =>
                      api.revertProjectKnowledgeFn({
                        data: {
                          projectId,
                          id: history.record.id,
                          expectedRevision: history.record.revision,
                          restoreRevision: version.revision,
                        },
                      }),
                    )
                  }
                >
                  {" "}
                  {t("knowledge.ui.restore")}{" "}
                </Button>
              )}
            </div>
          ))}
          {history.versions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("knowledge.history.empty")}</p>
          )}
          {history.versions.length === 20 && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                void showRecordHistory(history.record, history.versions.at(-1)!.revision)
              }
            >
              {t("knowledge.history.older")}
            </Button>
          )}
          {history.versions[0]?.revision !== history.record.revision && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => void showRecordHistory(history.record)}
            >
              {t("knowledge.history.latest")}
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setHistory(null)}>
            {" "}
            {t("knowledge.ui.closeHistory")}{" "}
          </Button>
        </div>
      )}
      <div className="space-y-3 rounded-md border p-4">
        <h4 className="font-medium">
          {editing ? t("knowledge.ui.reviewKnowledge") : t("knowledge.ui.teach")}
        </h4>
        <label className="block text-sm">
          {" "}
          {t("knowledge.ui.category")}{" "}
          <select
            className="mt-1 block w-full rounded-md border bg-background p-2"
            value={draft.category}
            disabled={disabled}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                category: e.target.value as Draft["category"],
                key: `${e.target.value}.guidance`,
              }))
            }
          >
            {categories.map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground"> {t("knowledge.ui.categoryHelp")} </p>
        <label className="block text-sm">
          {t("knowledge.brand.target")}
          <select
            className="mt-1 block w-full rounded-md border bg-background p-2"
            value={mappedBrandField(draft.key) ? draft.key : "general"}
            disabled={disabled}
            onChange={(event) => {
              const field = mappedBrandField(event.target.value);
              setDraft((current) => ({
                ...current,
                key: field ? `brand.${field.field}` : `${current.category}.guidance`,
                ...(field ? { category: field.category } : {}),
              }));
            }}
          >
            <option value="general">{t("knowledge.brand.general")}</option>
            {knowledgeBrandFields.map((field) => (
              <option key={field.field} value={`brand.${field.field}`}>
                {t(field.label)}
              </option>
            ))}
          </select>
        </label>
        {mappedBrandField(draft.key) && !brandRecordPatch(draft) && (
          <p role="alert" className="text-sm text-destructive">
            {t("knowledge.brand.invalid")}
          </p>
        )}
        <label className="block text-sm">
          {" "}
          {t("knowledge.ui.instruction")}{" "}
          <Textarea
            value={draft.value}
            maxLength={2000}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          {" "}
          {t("knowledge.ui.useFor")}{" "}
          <select
            className="mt-1 block w-full rounded-md border bg-background p-2"
            value={draft.appliesTo}
            disabled={disabled}
            onChange={(e) =>
              setDraft((d) => ({ ...d, appliesTo: e.target.value as Draft["appliesTo"] }))
            }
          >
            <option value="both"> {t("knowledge.ui.both")} </option>
            <option value="text"> {t("knowledge.ui.text")} </option>
            <option value="visual"> {t("knowledge.ui.visual")} </option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={
              disabled ||
              !draft.value.trim() ||
              (!!mappedBrandField(draft.key) && !brandRecordPatch(draft))
            }
            onClick={() =>
              void change(() =>
                editing
                  ? api.reviewProjectKnowledgeFn({
                      data: {
                        projectId,
                        id: editing.id,
                        expectedRevision: editing.revision,
                        fields: draft,
                        status: "accepted",
                      },
                    })
                  : api.teachProjectKnowledgeFn({ data: { projectId, fields: draft } }),
              )
            }
          >
            {editing ? t("knowledge.ui.accept") : t("knowledge.ui.remember")}
          </Button>
          {editing && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  void change(() =>
                    api.reviewProjectKnowledgeFn({
                      data: {
                        projectId,
                        id: editing.id,
                        expectedRevision: editing.revision,
                        fields: draft,
                        status: "rejected",
                      },
                    }),
                  )
                }
              >
                {" "}
                {t("knowledge.ui.reject")}{" "}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setDraft(blank());
                }}
              >
                {" "}
                {t("knowledge.ui.cancel")}{" "}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <h4 className="font-medium"> {t("knowledge.ui.sources")} </h4>
        <label className="block text-sm">
          {" "}
          {t("knowledge.ui.website")}{" "}
          <Input
            type="url"
            value={websiteUrl}
            disabled={disabled}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yourbusiness.com"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !websiteUrl.trim()}
          onClick={() =>
            void change(async () => {
              await saveWorkspaceNow();
              if (!alive.current) return;
              const result = await api.buildWebsiteKnowledgeFn({
                data: { projectId, url: websiteUrl.trim() },
              });
              if (!result.changed && alive.current) toast.message(t("knowledge.ui.unchanged"));
            })
          }
        >
          {" "}
          {t("knowledge.ui.buildWebsite")}{" "}
        </Button>
        <p className="text-xs text-muted-foreground"> {t("knowledge.ui.websiteHelp")} </p>
        <p className="text-xs text-muted-foreground"> {t("knowledge.ui.limits")} </p>
        <label className="block text-sm">
          {" "}
          {t("knowledge.ui.upload")}{" "}
          <Input
            type="file"
            accept=".pdf,.docx"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
        {profile?.connectorType === "shopify" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("refresh.catalogHelp")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => void change(() => configureShopifyCatalogFn({ data: { projectId } }))}
            >
              {t("refresh.addCatalog")}
            </Button>
          </div>
        )}
        {sourceImpact && sourceImpact.checked > 0 && (
          <div className="rounded-md border p-3 space-y-2">
            <h5 className="font-medium">{t("refresh.affected")}</h5>
            <p className="text-xs text-muted-foreground">{t("refresh.impactHelp")}</p>
            {sourceImpact.affected.map((asset) => (
              <p key={asset.assetId} className="text-sm">
                <a
                  className="underline"
                  href={`/app/editor?id=${encodeURIComponent(asset.assetId)}`}
                >
                  {asset.title}
                </a>{" "}
                · {asset.issues.length} {t("refresh.issues")}
              </p>
            ))}
            {!sourceImpact.affected.length && <p className="text-sm">{t("refresh.noImpact")}</p>}
            {sourceImpact.remaining > 0 && (
              <p className="text-xs">
                {t("refresh.moreImpact")}: {sourceImpact.remaining}
              </p>
            )}
          </div>
        )}
        {state.sources.map((source) => (
          <div key={source.id} className="rounded-md border p-3 space-y-2">
            <p className="text-sm">
              {source.label} {t("knowledge.ui.versionDot")} {source.revision} ·{" "}
              {t(`knowledge.status.${source.status}`)}
            </p>
            <p className="text-xs text-muted-foreground">
              {" "}
              {t("knowledge.ui.observed")} {new Date(source.observedAt).toLocaleString()}
              {source.url && (
                <>
                  {" "}
                  ·{" "}
                  <a
                    className="underline"
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {" "}
                    {t("knowledge.ui.viewWebsite")}{" "}
                  </a>
                </>
              )}
            </p>
            {source.kind === "website" && source.status === "active" && (
              <SourceRefreshPanel
                source={source}
                state={refreshState.find(
                  (row) => row.sourceId === source.id && row.sourceRevision === source.revision,
                )}
                disabled={disabled}
                change={change}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => void showSourceHistory(source)}
              >
                {" "}
                {t("knowledge.ui.sourceHistory")}{" "}
              </Button>
              {source.status === "active" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    void change(async () => {
                      await api.revokeProjectKnowledgeFn({
                        data: { projectId, id: source.id, expectedRevision: source.revision },
                      });
                      if (alive.current) setDocument(null);
                    })
                  }
                >
                  {" "}
                  {t("knowledge.ui.revoke")}{" "}
                </Button>
              )}
              {source.kind === "document" && source.status === "active" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    void change(async () => {
                      const saved = await api.readKnowledgeDocumentFn({
                        data: { projectId, id: source.id, expectedRevision: source.revision },
                      });
                      if (!alive.current) return;
                      const bytes = Uint8Array.from(atob(saved.base64), (c) => c.charCodeAt(0));
                      const text = await parseDocument(new File([bytes], saved.source.label));
                      if (text.fingerprint !== saved.source.fingerprint)
                        throw new Error("document_changed");
                      if (alive.current) setDocument({ source: saved.source, text });
                    })
                  }
                >
                  {" "}
                  {t("knowledge.ui.original")}{" "}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setRemove({ kind: "source", item: source })}
              >
                {" "}
                {t("knowledge.ui.forgetSource")}{" "}
              </Button>
            </div>
            {source.kind === "document" && (
              <label className="block text-xs">
                {" "}
                {t("knowledge.ui.replace")}{" "}
                <Input
                  type="file"
                  accept=".pdf,.docx"
                  disabled={disabled}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(file, source);
                  }}
                />
              </label>
            )}
          </div>
        ))}
      </div>
      {sourceHistory && (
        <div className="rounded-md border p-3 space-y-2">
          <h4 className="font-medium">
            {" "}
            {t("knowledge.ui.sourceHistoryTitle")} {sourceHistory.source.label}
          </h4>
          {sourceHistory.versions.map((version) => (
            <p className="text-sm" key={version.revision}>
              {" "}
              {t("knowledge.ui.version")} {version.revision} · {version.label} ·{" "}
              {t(`knowledge.status.${version.status}`)} ·{" "}
              {new Date(version.observedAt).toLocaleString()}
            </p>
          ))}
          {sourceHistory.versions.length === 20 && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                void showSourceHistory(
                  sourceHistory.source,
                  sourceHistory.versions.at(-1)!.revision,
                )
              }
            >
              {" "}
              {t("knowledge.ui.olderSource")}{" "}
            </Button>
          )}
          {sourceHistory.versions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("knowledge.sourceHistory.empty")}</p>
          )}
          {sourceHistory.versions[0]?.revision !== sourceHistory.source.revision && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => void showSourceHistory(sourceHistory.source)}
            >
              {t("knowledge.sourceHistory.latest")}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => setSourceHistory(null)}
          >
            {" "}
            {t("knowledge.ui.closeSource")}{" "}
          </Button>
        </div>
      )}
      {document && (
        <div className="space-y-2">
          <h4 className="font-medium">
            {" "}
            {t("knowledge.ui.extractedTitle")} {document.source.label}
          </h4>
          {document.text.warnings.includes("parser_warnings") && (
            <p role="status" className="text-sm">
              {" "}
              {t("knowledge.ui.parserWarning")}{" "}
            </p>
          )}
          <p className="text-xs text-muted-foreground"> {t("knowledge.ui.passageHelp")} </p>
          <div className="space-y-3">
            <h4 className="font-medium">{t("knowledge.brand.extracted")}</h4>
            <p className="text-xs text-muted-foreground">{t("knowledge.brand.extractionNote")}</p>
            {extractLabelledBrandProposals(document.text.segments).length === 0 && (
              <p className="text-sm">{t("knowledge.brand.noLabels")}</p>
            )}
            {extractLabelledBrandProposals(document.text.segments).map((proposal) => (
              <MappedBrandProposal
                key={`${document.source.id}:${document.source.revision}:${proposal.key}:${proposal.locator}:${proposal.value}`}
                proposal={proposal}
                disabled={disabled}
                saved={state.records.some(
                  (record) =>
                    record.sourceId === document.source.id &&
                    record.sourceRevision === document.source.revision &&
                    record.key === proposal.key &&
                    record.locator === proposal.locator &&
                    record.excerpt === proposal.excerpt,
                )}
                onSave={(value) =>
                  void change(() =>
                    api.proposeKnowledgeRecordFn({
                      data: {
                        projectId,
                        id: crypto.randomUUID(),
                        sourceId: document.source.id,
                        sourceRevision: document.source.revision,
                        fields: { ...proposal, value },
                      },
                    }),
                  )
                }
              />
            ))}
          </div>
          {document.text.segments.map((segment, index) => (
            <details key={index} className="rounded border p-2">
              <summary>{segment.locator}</summary>
              <p className="text-sm whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                {segment.text}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  void change(() =>
                    api.proposeKnowledgeRecordFn({
                      data: {
                        projectId,
                        id: crypto.randomUUID(),
                        sourceId: document.source.id,
                        sourceRevision: document.source.revision,
                        fields: {
                          ...draft,
                          value: segment.text.slice(0, 2000),
                          excerpt: segment.text.slice(0, 2000),
                          locator: segment.locator,
                        },
                      },
                    }),
                  )
                }
              >
                {" "}
                {t("knowledge.ui.savePassage")}{" "}
              </Button>
            </details>
          ))}
          <Button type="button" variant="ghost" onClick={() => setDocument(null)}>
            {" "}
            {t("knowledge.ui.closeText")}{" "}
          </Button>
        </div>
      )}
      {remove && (
        <div role="alert" className="rounded border border-destructive p-3 space-y-2">
          <p className="text-sm">
            {" "}
            {t("knowledge.ui.permanent")}{" "}
            {remove.kind === "source"
              ? t("knowledge.ui.forgetAll")
              : t("knowledge.ui.forgetRecord")}{" "}
            {t("knowledge.ui.irreversible")}{" "}
          </p>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={() =>
              void change(async () => {
                await api.forgetProjectKnowledgeFn({
                  data: {
                    projectId,
                    kind: remove.kind,
                    id: remove.item.id,
                    expectedRevision: remove.item.revision,
                  },
                });
                if (alive.current) setDocument(null);
              })
            }
          >
            {" "}
            {t("knowledge.ui.permanent")}{" "}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemove(null)}>
            {" "}
            {t("knowledge.ui.cancel")}{" "}
          </Button>
        </div>
      )}
    </div>
  );
}

function MappedBrandProposal({
  proposal,
  disabled,
  saved,
  onSave,
}: {
  proposal: ReturnType<typeof extractLabelledBrandProposals>[number];
  disabled: boolean;
  saved: boolean;
  onSave: (value: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(proposal.value);
  return (
    <div className="rounded border p-3 space-y-2">
      <label className="block text-sm font-medium">
        {t(mappedBrandField(proposal.key)!.label)}
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled || saved}
          maxLength={2000}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {proposal.locator} · {proposal.excerpt}
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || saved || !brandRecordPatch({ ...proposal, value })}
        onClick={() => onSave(value)}
      >
        {t(saved ? "knowledge.brand.saved" : "knowledge.brand.save")}
      </Button>
    </div>
  );
}
