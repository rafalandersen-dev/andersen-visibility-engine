import { useCallback, useEffect, useRef, useState } from "react";
import { createClientOnlyFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { saveWorkspaceNow } from "@/lib/store";
import * as api from "@/lib/project-knowledge.functions";
import type { KnowledgeRecord, KnowledgeSource } from "@/lib/project-knowledge";
import { selectProjectKnowledge } from "@/lib/project-knowledge";
import type { BrandDocumentText } from "@/lib/brand-document";

const categories: [KnowledgeRecord["category"], string][] = [
  ["voice", "Voice"],
  ["audience", "Audience"],
  ["offer", "Products and services"],
  ["fact", "Business fact"],
  ["claimRestriction", "Claim restrictions"],
  ["visualStyle", "Visual style"],
  ["terminology", "Terminology"],
  ["lesson", "Editorial lesson"],
  ["writingExample", "Writing example"],
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
      if (alive.current && current === request.current) {
        setState(next);
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
              ? "No readable text was found. Use a text-based PDF or DOCX, or enter an instruction manually."
              : "This document could not be extracted within the supported limits. Use a smaller, unencrypted PDF or DOCX, or enter an instruction manually.",
          );
          return;
        }
        setFailed(true);
        toast.error(
          "This change could not be confirmed. Refresh and check the saved version before trying again.",
        );
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
        <h3 className="font-display text-lg">What Milo knows</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          Refresh saved knowledge
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Project references and recurring instructions supplement your brand settings above. Review
        source material before accepting it. An accepted claim is still source-reported evidence.
      </p>
      {loading && <p role="status">Loading project knowledge…</p>}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Saved knowledge could not be confirmed. Refresh before making another change.
        </p>
      )}
      {!loading && !failed && state.records.length === 0 && (
        <p className="text-sm text-muted-foreground">No additional project knowledge saved yet.</p>
      )}
      {state.records.map((record) => {
        const source = state.sources.find((s) => s.id === record.sourceId);
        const inactive =
          !source || source.status !== "active" || source.revision !== record.sourceRevision;
        return (
          <article key={record.id} className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {categories.find(([key]) => key === record.category)?.[1]} ·{" "}
              {inactive
                ? "Source removed or replaced — held"
                : conflicts.has(record.key)
                  ? "Conflicting accepted instructions — held"
                  : record.status}{" "}
              · Version {record.revision}
            </p>
            <p className="text-sm whitespace-pre-wrap break-words">{record.value}</p>
            <p className="text-xs text-muted-foreground">
              {source?.label} · {record.locator} · Source version {record.sourceRevision}
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
                Review / edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={async () => {
                  if (working.current) return;
                  working.current = true;
                  setBusy(true);
                  try {
                    const versions = await api.knowledgeHistoryFn({
                      data: { projectId, kind: "record", id: record.id },
                    });
                    if (alive.current)
                      setHistory({ record, versions: versions as KnowledgeRecord[] });
                  } catch {
                    if (alive.current) setFailed(true);
                  } finally {
                    working.current = false;
                    if (alive.current) setBusy(false);
                  }
                }}
              >
                History / revert
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setRemove({ kind: "record", item: record })}
              >
                Forget
              </Button>
            </div>
          </article>
        );
      })}
      {history && (
        <div className="rounded-md border p-3 space-y-2">
          <h4 className="font-medium">Saved versions</h4>
          {history.versions.map((version) => (
            <div key={version.revision} className="space-y-1">
              <p className="text-sm">
                Version {version.revision} · {version.status}: {version.value}
              </p>
              <p className="text-xs text-muted-foreground">
                Saved {new Date(version.updatedAt).toLocaleString()}
                {version.reviewedAt
                  ? ` · Reviewed ${new Date(version.reviewedAt).toLocaleString()}`
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
                  Restore as a new version
                </Button>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={() => setHistory(null)}>
            Close history
          </Button>
        </div>
      )}
      <div className="space-y-3 rounded-md border p-4">
        <h4 className="font-medium">{editing ? "Review project knowledge" : "Teach Milo"}</h4>
        <label className="block text-sm">
          Category
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
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Save one combined instruction per category. Conflicting accepted alternatives are held for
          review; edit the existing instruction to expand it.
        </p>
        <label className="block text-sm">
          Instruction
          <Textarea
            value={draft.value}
            maxLength={2000}
            disabled={disabled}
            onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          Use for
          <select
            className="mt-1 block w-full rounded-md border bg-background p-2"
            value={draft.appliesTo}
            disabled={disabled}
            onChange={(e) =>
              setDraft((d) => ({ ...d, appliesTo: e.target.value as Draft["appliesTo"] }))
            }
          >
            <option value="both">Writing and images</option>
            <option value="text">Writing</option>
            <option value="visual">Images</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={disabled || !draft.value.trim()}
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
            {editing ? "Accept this version" : "Remember for this project"}
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
                Reject
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
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <h4 className="font-medium">Brand guidelines and sources</h4>
        <label className="block text-sm">
          Website reference
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
              if (!result.changed && alive.current)
                toast.message("The captured homepage excerpt is unchanged.");
            })
          }
        >
          Build from website
        </Button>
        <p className="text-xs text-muted-foreground">
          Captures a limited homepage text excerpt for your review. This does not verify business
          claims or scan the full site.
        </p>
        <p className="text-xs text-muted-foreground">
          PDF or DOCX, up to 5 MiB and 40 PDF pages. Text extraction only: scanned pages, logos and
          graphic rules need manual review. Current originals are private; replacement, revoke and
          forget remove the previous original.
        </p>
        <label className="block text-sm">
          Upload brand guidelines
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
        {state.sources.map((source) => (
          <div key={source.id} className="rounded-md border p-3 space-y-2">
            <p className="text-sm">
              {source.label} · Version {source.revision} · {source.status}
            </p>
            <p className="text-xs text-muted-foreground">
              Observed {new Date(source.observedAt).toLocaleString()}
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
                    View source website
                  </a>
                </>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => void showSourceHistory(source)}
              >
                Source history
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
                  Revoke source
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
                  Review original text
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setRemove({ kind: "source", item: source })}
              >
                Forget source and history
              </Button>
            </div>
            {source.kind === "document" && (
              <label className="block text-xs">
                Replace document (existing records will need review)
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
          <h4 className="font-medium">Source history: {sourceHistory.source.label}</h4>
          {sourceHistory.versions.map((version) => (
            <p className="text-sm" key={version.revision}>
              Version {version.revision} · {version.label} · {version.status} ·{" "}
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
              Older source versions
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={() => setSourceHistory(null)}>
            Close source history
          </Button>
        </div>
      )}
      {document && (
        <div className="space-y-2">
          <h4 className="font-medium">Review extracted text: {document.source.label}</h4>
          {document.text.warnings.includes("parser_warnings") && (
            <p role="status" className="text-sm">
              The document parser reported warnings. Compare extracted passages with your original
              before accepting them.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Choose a passage to save as a proposal, then edit and accept the instruction. No AI
            summary or visual interpretation has been performed.
          </p>
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
                Save first 2,000 characters as a proposal
              </Button>
            </details>
          ))}
          <Button type="button" variant="ghost" onClick={() => setDocument(null)}>
            Close extracted text
          </Button>
        </div>
      )}
      {remove && (
        <div role="alert" className="rounded border border-destructive p-3 space-y-2">
          <p className="text-sm">
            Permanently forget{" "}
            {remove.kind === "source"
              ? "this source, its original document, derived records and history"
              : "this record and its history"}
            ? This cannot be reverted. Existing published pages stay as they are.
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
            Permanently forget
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setRemove(null)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
