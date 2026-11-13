import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getWorkspaceSaveContext, useStore } from "@/lib/store";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { GSC_REPORT_TIMEZONE } from "@/lib/native-ai-report";
import {
  NativeGoogleCsvError,
  nativeGoogleReportDescriptor,
  parseNativeGoogleFilters,
  parseNativeGoogleReportCsv,
  type NativeGoogleReportCsv,
  type NativeGoogleReportPreview,
} from "@/lib/native-google-ai-csv";
import type { NativeArtifactMetadata } from "@/lib/native-ai-artifact";
import {
  NATIVE_COMPLETENESS,
  NATIVE_GOOGLE_CSV_FILES,
  type NativeReportParsedRead,
} from "@/lib/native-google-intake";
import {
  fileTooLarge,
  intakeBadge,
  isGoogleArtifactSource,
  normalizeUtcCapturedAt,
  persistErrorKey,
  rawCellText,
  reviewFingerprint,
  sourceIncomplete,
  type NativeIntakeFingerprintInputs,
} from "@/lib/native-google-intake-ui";
import {
  readNativeArtifactsFn,
  removeNativeArtifactFn,
  stageNativeArtifactFn,
} from "@/lib/native-ai-artifact.functions";
import {
  persistNativeReportFn,
  readNativeReportParseStatesFn,
  readNativeReportParsedFn,
} from "@/lib/native-google-intake.functions";

const fieldClass = "mt-1 block min-h-11 w-full rounded border bg-background p-2 text-sm";
const wrap = "break-words [overflow-wrap:anywhere]";
/** Chunked base64 of the raw bytes; the strict staging schema requires canonical base64. */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
type Snapshot = {
  fingerprint: string;
  base64: string;
  metadata: NativeArtifactMetadata;
  completeness: (typeof NATIVE_COMPLETENESS)[number];
  limitationNote: string;
  preview: NativeGoogleReportPreview;
};
export function NativeGoogleIntakePanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  // Re-render on any workspace session change so the gate and key below reflect the live session.
  useStore((s) => s.userId);
  useStore((s) => s.hydrated);
  const ctx = getWorkspaceSaveContext();
  // Mount the querying panel ONLY for a stable, hydrated session whose LIVE workspace userId matches
  // the signed-in actor. An unstable/mismatched session (sign-out, same-actor re-sign-in mid-flight,
  // hydration loss) renders nothing — so no reads are issued until it settles — and the epoch in the
  // key remounts a FRESH panel (new mount authority, cleared preview/opened/inputs) once it does.
  if (!user || ctx.userId !== user.id || !ctx.hydrated) return null;
  return (
    <Intake key={`${user.id}:${projectId}:${ctx.epoch}`} projectId={projectId} ownerId={user.id} />
  );
}
function Intake({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const t = useT();
  const label = (k: string) => t("nativeIntake." + k);
  const scope = { projectId, expectedOwnerId: ownerId };
  const { user } = useAuth();
  // Re-render on any workspace session change; identity itself is always re-read LIVE below.
  useStore((s) => s.userId);
  useStore((s) => s.hydrated);
  const authId = useRef(user?.id ?? null);
  authId.current = user?.id ?? null;
  // The session this panel belongs to, fixed at mount.
  const bound = useRef({ actor: ownerId, epoch: getWorkspaceSaveContext().epoch, projectId });
  const sessionCurrent = () => {
    const ctx = getWorkspaceSaveContext();
    return (
      authId.current === bound.current.actor &&
      ctx.userId === bound.current.actor &&
      ctx.epoch === bound.current.epoch &&
      ctx.hydrated &&
      projectId === bound.current.projectId
    );
  };
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  // Bumped at the start of each operation and on retirement, so a late settlement from a superseded
  // or retired operation can never apply state, issue a dependent request or refetch.
  const opId = useRef(0);
  const busyRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<NativeGoogleReportCsv>("chart");
  const [property, setProperty] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capturedAt, setCapturedAt] = useState("");
  const [completeness, setCompleteness] = useState<(typeof NATIVE_COMPLETENESS)[number]>("partial");
  const [limitationNote, setLimitationNote] = useState("");
  const [dataFile, setDataFile] = useState<File | null>(null);
  const [filtersFile, setFiltersFile] = useState<File | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [opened, setOpened] = useState<NativeReportParsedRead | null>(null);
  const [removal, setRemoval] = useState<string | null>(null);

  const fileMeta = (f: File | null) =>
    f ? { name: f.name, size: f.size, lastModified: f.lastModified } : null;
  const currentInputs = (): NativeIntakeFingerprintInputs => ({
    file,
    property,
    start,
    end,
    capturedAt,
    completeness,
    limitationNote,
    data: fileMeta(dataFile),
    filters: fileMeta(filtersFile),
  });
  /** Any material input change invalidates the reviewed snapshot: Save then disappears until a new
   * Preview binds the exact reviewed bytes/metadata/completeness/note again. */
  const invalidate = () => {
    setSnapshot(null);
    setError(null);
  };

  // Scope every query key by the session epoch so a new same-actor session never reuses an old
  // "ready" cache before a fresh read; the queryFn re-checks the live scope right before issuing the
  // request, in case it retired between render and execution.
  const list = useQuery({
    queryKey: ["native-artifacts", ownerId, projectId, bound.current.epoch],
    queryFn: () => {
      if (!sessionCurrent()) throw Error("native_artifact_unavailable");
      return readNativeArtifactsFn({ data: scope });
    },
    staleTime: 0,
    retry: false,
  });
  const states = useQuery({
    queryKey: ["native-parse-states", ownerId, projectId, bound.current.epoch],
    queryFn: () => {
      if (!sessionCurrent()) throw Error("native_artifact_unavailable");
      return readNativeReportParseStatesFn({ data: scope });
    },
    staleTime: 0,
    retry: false,
  });
  const stateById = new Map((states.data?.states ?? []).map((s) => [s.id, s]));
  const statesReady = !states.isError && !states.isPending;

  // A retired session (same-actor re-sign-in, hydration loss, project change) drops every pending
  // preview/opened detail and invalidates in-flight operations; it never traps or applies late data.
  const retired = !sessionCurrent();
  useEffect(() => {
    if (retired) {
      opId.current += 1;
      busyRef.current = false;
      setBusy(false);
      setSnapshot(null);
      setOpened(null);
      setRemoval(null);
      setError(null);
    }
  }, [retired]);

  async function runPreview() {
    if (busyRef.current || !sessionCurrent()) return;
    setError(null);
    setSnapshot(null);
    if (!dataFile || !filtersFile) return setError("err.fileRequired");
    // Bound BOTH files before any read, so a giant file is never allocated and no request is made.
    if (fileTooLarge(dataFile.size) || fileTooLarge(filtersFile.size))
      return setError("err.tooLarge");
    const op = ++opId.current;
    busyRef.current = true;
    setBusy(true);
    try {
      const dataBytes = new Uint8Array(await dataFile.arrayBuffer());
      const filterBytes = new Uint8Array(await filtersFile.arrayBuffer());
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      const filterContext = parseNativeGoogleFilters(filterBytes);
      const d = nativeGoogleReportDescriptor(file);
      const capturedAtIso = normalizeUtcCapturedAt(capturedAt);
      const metadata = {
        source: "gsc_generative_ai_search" as const,
        declaredProperty: property,
        reportKind: d.reportKind,
        dimension: d.dimension,
        aggregation: d.aggregation,
        period: { start, end, timezone: GSC_REPORT_TIMEZONE },
        marketScope: filterContext.marketScope,
        filters: filterContext.filters,
        capturedAt: capturedAtIso,
        filename: dataFile.name.slice(0, 255),
      };
      const preview = await parseNativeGoogleReportCsv(file, dataBytes, {
        declaredProperty: property,
        period: { start, end, timezone: GSC_REPORT_TIMEZONE },
        capturedAt: capturedAtIso,
        completeness,
        filterContext,
        filename: dataFile.name.slice(0, 255),
      });
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      setSnapshot({
        fingerprint: reviewFingerprint(currentInputs()),
        base64: bytesToBase64(dataBytes),
        metadata,
        completeness,
        limitationNote,
        preview,
      });
    } catch (e) {
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      setError(e instanceof NativeGoogleCsvError ? "err.parseFailed" : "err.save");
    } finally {
      if (opId.current === op) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  async function save() {
    if (busyRef.current || !snapshot || !sessionCurrent()) return;
    // Save exactly the reviewed snapshot: if any input changed since Preview, refuse (never save
    // un-previewed data). Clearing-on-change already removes the snapshot; this is the belt check.
    if (reviewFingerprint(currentInputs()) !== snapshot.fingerprint) {
      setSnapshot(null);
      return setError("err.reviewStale");
    }
    const op = ++opId.current;
    setError(null);
    busyRef.current = true;
    setBusy(true);
    try {
      const staged = await stageNativeArtifactFn({
        data: { ...scope, metadata: snapshot.metadata, base64: snapshot.base64 },
      });
      // The stored file now exists. Check the live session BEFORE the dependent persist request.
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      // The server re-parses the actual stored bytes; the client preview is never trusted.
      await persistNativeReportFn({
        data: {
          ...scope,
          id: staged.id,
          completeness: snapshot.completeness,
          limitationNote: snapshot.limitationNote,
        },
      });
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      setSnapshot(null);
      await Promise.all([list.refetch(), states.refetch()]);
    } catch (e) {
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      // Inputs are preserved: the raw file may be stored but the report not finished. An exact retry
      // re-stages idempotently (same bytes+metadata → same artifact) and re-parses without duplicates.
      setError(persistErrorKey(e instanceof Error ? e.message : ""));
      void list.refetch();
    } finally {
      if (opId.current === op) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  async function openParsed(id: string) {
    if (busyRef.current || !sessionCurrent()) return;
    const op = ++opId.current;
    setError(null);
    busyRef.current = true;
    setBusy(true);
    try {
      const read = await readNativeReportParsedFn({ data: { ...scope, id } });
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      setOpened(read);
    } catch {
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      // A failed detail read never leaves a stale opened detail on screen — including a previously
      // opened artifact whose result must not read as this (failed) refresh.
      setOpened(null);
      setError("loadError");
    } finally {
      if (opId.current === op) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  async function remove(id: string) {
    if (busyRef.current || !sessionCurrent()) return;
    const op = ++opId.current;
    setError(null);
    busyRef.current = true;
    setBusy(true);
    try {
      await removeNativeArtifactFn({ data: { ...scope, id } });
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      setOpened((prev) => (prev?.id === id ? null : prev));
      setRemoval(null);
      await Promise.all([list.refetch(), states.refetch()]);
    } catch {
      if (opId.current !== op || !mounted.current || !sessionCurrent()) return;
      setError("err.save");
    } finally {
      if (opId.current === op) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const googleArtifacts = (list.data?.artifacts ?? []).filter((a) =>
    isGoogleArtifactSource(a.metadata.source),
  );
  const refreshAll = () => {
    if (!sessionCurrent()) return;
    // A refresh starts a fresh read: drop any opened detail so a stale numeric result is never shown
    // against the new reads; it re-appears only when the current reads succeed and the owner re-opens.
    setOpened(null);
    setError(null);
    void list.refetch();
    void states.refetch();
  };

  return (
    <section className="rounded-xl border p-5 mb-6 space-y-5" aria-labelledby="native-intake-title">
      <h2 id="native-intake-title" className="font-display text-xl">
        {label("title")}
      </h2>
      <p className={`text-sm text-muted-foreground ${wrap}`}>{label("intro")}</p>
      <p className={`text-xs text-muted-foreground ${wrap}`}>{label("declaration")}</p>
      {error && (
        <div
          className="rounded border border-destructive p-2 text-sm text-destructive"
          role="alert"
        >
          <p className={wrap}>{label(error)}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2 min-h-11"
            disabled={busy}
            onClick={refreshAll}
          >
            {label("refresh")}
          </Button>
        </div>
      )}

      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runPreview();
        }}
      >
        <fieldset disabled={busy} className="contents">
          <label className="text-sm">
            {label("fileLabel")}
            <select
              className={fieldClass}
              value={file}
              onChange={(e) => {
                setFile(e.target.value as NativeGoogleReportCsv);
                invalidate();
              }}
            >
              {NATIVE_GOOGLE_CSV_FILES.map((f) => (
                <option key={f} value={f}>
                  {label("file." + f)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {label("completenessLabel")}
            <select
              className={fieldClass}
              value={completeness}
              onChange={(e) => {
                setCompleteness(e.target.value as (typeof NATIVE_COMPLETENESS)[number]);
                invalidate();
              }}
            >
              {NATIVE_COMPLETENESS.map((c) => (
                <option key={c} value={c}>
                  {label("completeness." + c)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm md:col-span-2">
            {label("propertyLabel")}
            <input
              className={fieldClass}
              value={property}
              maxLength={500}
              onChange={(e) => {
                setProperty(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label className="text-sm">
            {label("startLabel")}
            <input
              type="date"
              className={fieldClass}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label className="text-sm">
            {label("endLabel")}
            <input
              type="date"
              className={fieldClass}
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label className="text-sm md:col-span-2">
            {label("capturedAtLabel")}
            <input
              type="datetime-local"
              className={fieldClass}
              value={capturedAt}
              onChange={(e) => {
                setCapturedAt(e.target.value);
                invalidate();
              }}
            />
            <span className="block text-xs text-muted-foreground">{label("capturedAtHelp")}</span>
          </label>
          <label className="text-sm md:col-span-2">
            {label("limitationLabel")}
            <textarea
              className={fieldClass}
              rows={2}
              maxLength={2000}
              value={limitationNote}
              onChange={(e) => {
                setLimitationNote(e.target.value);
                invalidate();
              }}
            />
          </label>
          <label className="text-sm">
            {label("dataCsvLabel")}
            <input
              type="file"
              accept=".csv,text/csv"
              className={fieldClass}
              onChange={(e) => {
                setDataFile(e.target.files?.[0] ?? null);
                invalidate();
              }}
            />
          </label>
          <label className="text-sm">
            {label("filtersCsvLabel")}
            <input
              type="file"
              accept=".csv,text/csv"
              className={fieldClass}
              onChange={(e) => {
                setFiltersFile(e.target.files?.[0] ?? null);
                invalidate();
              }}
            />
          </label>
          <Button type="submit" className="min-h-11 md:col-span-2">
            {label("previewBtn")}
          </Button>
        </fieldset>
      </form>

      {snapshot && (
        <div className="rounded-lg border p-4 space-y-3" data-intake-preview>
          <h3 className="font-display text-lg">{label("previewTitle")}</h3>
          <ReportView view={snapshot.preview} note={snapshot.limitationNote} label={label} t={t} />
          <Button className="min-h-11" disabled={busy} onClick={() => void save()}>
            {label("saveBtn")}
          </Button>
        </div>
      )}

      <h3 className="font-display text-lg">{label("list.title")}</h3>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={refreshAll}
        >
          {label("refresh")}
        </Button>
      </div>
      {list.isError && <p role="alert">{label("loadError")}</p>}
      {list.isPending && <p role="status">{label("common.loading")}</p>}
      {list.data && !list.isError && !googleArtifacts.length && (
        <p className="text-sm">{label("list.empty")}</p>
      )}
      {/* The cached list and any opened detail render only when the current reads substantiate them. */}
      {!list.isError &&
        googleArtifacts.map((a) => {
          const badge = intakeBadge(a.status, stateById.get(a.id)?.parseState, statesReady);
          return (
            <article
              key={a.id}
              className="rounded border p-3 text-sm space-y-2"
              data-intake-artifact={a.id}
            >
              <p className={`font-medium ${wrap}`}>{a.metadata.declaredProperty}</p>
              <p className="text-xs text-muted-foreground">
                {a.metadata.dimension} · {a.metadata.period.start} → {a.metadata.period.end}
              </p>
              <p className="text-xs font-medium" data-intake-badge={badge}>
                {label("badge." + badge)}
              </p>
              <div className="flex flex-wrap gap-2">
                {badge === "ready" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void openParsed(a.id)}
                  >
                    {label("view")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => setRemoval(a.id)}
                >
                  {label("deleteBtn")}
                </Button>
              </div>
              {removal === a.id && (
                <div className="rounded border border-destructive p-3 space-y-2" role="alert">
                  <p>{label("confirmDelete")}</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => void remove(a.id)}
                  >
                    {label("deleteBtn")}
                  </Button>{" "}
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => setRemoval(null)}
                  >
                    {label("cancel")}
                  </Button>
                </div>
              )}
              {opened?.id === a.id && opened.parsed && !states.isError && (
                <div className="rounded bg-muted/40 p-3 space-y-2" data-intake-opened>
                  <ReportView
                    view={{
                      input: opened.parsed.input,
                      withheldPageRows: opened.parsed.withheldPageRows,
                      partial: opened.parsed.partial,
                    }}
                    note={opened.parsed.limitationNote}
                    label={label}
                    t={t}
                  />
                  <details className="text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3">
                      {label("provenanceTitle")}
                    </summary>
                    <p className={wrap}>
                      {t("nativeIntake.provenance", {
                        version: opened.parsed.parserVersion,
                        at: opened.parsedAt ?? "",
                      })}
                    </p>
                    <p className={wrap}>
                      {t("nativeIntake.provenanceActor", { actor: opened.parsedActorId ?? "" })}
                    </p>
                    <p className={wrap}>
                      {label("rawStatusLabel")}: {label("status." + a.status)}
                    </p>
                  </details>
                </div>
              )}
            </article>
          );
        })}

      <details className="text-xs text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-3">{label("techDetails")}</summary>
        <p className={wrap}>{label("techBody")}</p>
        <p className={wrap}>{label("gate")}</p>
      </details>
    </section>
  );
}
function ReportView({
  view,
  note,
  label,
  t,
}: {
  view: NativeGoogleReportPreview;
  note: string;
  label: (k: string) => string;
  t: ReturnType<typeof useT>;
}) {
  const { input, withheldPageRows, partial } = view;
  const country = input.filters["Country"] ?? input.marketScope.country ?? null;
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{label("nativeLabel")}</p>
      <p>
        {t("nativeIntake.metricLabel", {
          metric: label("metric.impressions"),
          unit: label("unit.count"),
        })}
      </p>
      <p>{t("nativeIntake.windowLabel", { start: input.period.start, end: input.period.end })}</p>
      <p>{t("nativeIntake.timezoneLabel", { tz: input.period.timezone ?? "" })}</p>
      <p className={wrap}>
        {label("capturedAtLabel")}: {input.capturedAt}
      </p>
      <p className={wrap}>
        {t("nativeIntake.propertyHeading", { property: input.declaredProperty })}
      </p>
      <p>
        {t("nativeIntake.aggregationLabel", {
          aggregation: label("aggregation." + input.aggregation),
          reportKind: label("reportKind." + input.reportKind),
        })}
      </p>
      {country && <p>{t("nativeIntake.countryFilter", { country })}</p>}
      <p className={`text-xs ${wrap}`}>
        {label("completenessShow")}: {label("completeness." + input.completeness)}
      </p>
      {sourceIncomplete(input.completeness) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("nativeIntake.sourceIncompleteWarn", {
            completeness: label("completeness." + input.completeness),
          })}
        </p>
      )}
      {partial && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("nativeIntake.partialWarn", { count: withheldPageRows })}
        </p>
      )}
      {note && (
        <p className={`text-xs ${wrap}`}>
          {label("limitationShow")}: {note}
        </p>
      )}
      <p className="font-medium">{t("nativeIntake.rowsHeading", { count: input.rows.length })}</p>
      <ul className="space-y-1">
        {input.rows.map((row): ReactNode => {
          const cell = row.cells.impressions;
          return (
            <li key={row.key} className={wrap}>
              <span className="font-medium">{row.key}</span> · {label("rawCellLabel")}:{" "}
              <span>{rawCellText(cell.raw)}</span> · {label("interpretedStatusHeading")}:{" "}
              {label("cell." + cell.status)}
              {cell.value !== null ? ` (${cell.value})` : ""}
            </li>
          );
        })}
      </ul>
      <p className={`text-xs text-muted-foreground ${wrap}`}>{label("limits")}</p>
    </div>
  );
}
