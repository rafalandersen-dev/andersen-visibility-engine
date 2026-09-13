import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { useAppLanguage, useT } from "@/i18n";
import { Button } from "./ui/button";
import { SpecialistPortrait } from "./SpecialistPortrait";
import { MiloDraftProposal } from "./MiloDraftProposal";
import {
  conversationSend,
  type ConversationEvent,
  type ConversationTurn,
} from "@/lib/milo-conversation";
import {
  cancelMiloTurnFn,
  listMiloConversationsFn,
  readMiloConversationFn,
  resumeMiloTurnFn,
  sendMiloMessageFn,
} from "@/lib/milo-conversation.functions";
import {
  checkedDirectory,
  checkedPage,
  conversationKey,
  conversationStatus,
  displayedConversationEvents,
  isActiveTurn,
  lastConversationPage,
  type MiloProject,
} from "@/lib/milo-conversation.ui";
import { runTeamRequest } from "@/lib/team-request-queue";

type Selection = { id: string; fresh: boolean; count: number };
type Props = {
  actorId: string;
  project: MiloProject;
  onOpenResult: (event: ConversationEvent) => void;
  location?: string;
  onLocationChange?: (location: string, replace: boolean) => void;
  onConfirmedConversation?: (id: string) => void;
  conversationHref?: (id: string) => string;
};
function selectionAt(location?: string): Selection | undefined {
  return location
    ? {
        id: location === "new" ? crypto.randomUUID() : location,
        fresh: location === "new",
        count: 0,
      }
    : undefined;
}
export function MiloConversationWorkspace(props: Props) {
  const { actorId, project, location, onLocationChange, conversationHref } = props;
  const t = useT(),
    client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Selection | undefined>(() => selectionAt(location));
  const [observedLocation, setObservedLocation] = useState(location);
  // Reconcile navigation before committing children, so a different URL never
  // briefly renders the old private conversation. Promoting our own fresh ID
  // into its saved URL preserves the session, request identity and composer.
  if (observedLocation !== location) {
    setObservedLocation(location);
    setSelected(
      selected?.id === location || (location === "new" && selected?.fresh)
        ? selected
        : selectionAt(location),
    );
  }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const historyToggle = useRef<HTMLButtonElement>(null);
  const historyId = useId();
  const alive = useRef(true);
  const currentSelection = useRef({ id: selected?.id, location });
  currentSelection.current = { id: selected?.id, location };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const prefix = conversationKey(actorId, project);
  const directory = useQuery({
    queryKey: [...prefix, "directory", offset],
    queryFn: ({ signal }) =>
      runTeamRequest(
        async () =>
          checkedDirectory(
            actorId,
            project,
            await listMiloConversationsFn({
              data: { ownerId: project.ownerId, projectId: project.projectId, offset },
            }),
          ),
        signal,
      ),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 30000,
  });
  useEffect(() => {
    if (selected || !directory.data || directory.isError) return;
    const first = directory.data.conversations[0];
    setSelected(
      first
        ? { id: first.conversationId, fresh: false, count: first.turnCount }
        : { id: crypto.randomUUID(), fresh: true, count: 0 },
    );
    onLocationChange?.(first?.conversationId ?? "new", true);
  }, [selected, directory.data, directory.isError, onLocationChange]);
  const refresh = () => void client.invalidateQueries({ queryKey: prefix });
  async function startNew() {
    // A broken/deleted bookmark can recover, but only after a new successful
    // directory authorization. Cached titles stay hidden during that read.
    if (historyUnavailable) {
      const expected = currentSelection.current;
      const confirmed = await directory.refetch();
      if (
        !alive.current ||
        confirmed.isError ||
        !confirmed.data ||
        currentSelection.current.id !== expected.id ||
        currentSelection.current.location !== expected.location
      )
        return;
    }
    setSelected({ id: crypto.randomUUID(), fresh: true, count: 0 });
    onLocationChange?.("new", false);
    setHistoryOpen(false);
    historyToggle.current?.focus();
  }
  return (
    <div
      className="grid min-w-0 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]"
      data-milo-project={project.projectId}
    >
      <div>
        <Button
          ref={historyToggle}
          className="mb-3 w-full xl:hidden"
          variant="outline"
          aria-expanded={historyOpen}
          aria-controls={historyId}
          onClick={() => setHistoryOpen((value) => !value)}
        >
          {t("chat.history")}
        </Button>
        <aside
          id={historyId}
          className={`${historyOpen ? "" : "hidden xl:block"} min-w-0 rounded-2xl border bg-card p-4 h-fit`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t("chat.history")}</h2>
            <Button size="sm" variant="ghost" onClick={refresh} disabled={directory.isFetching}>
              {t("collaboration.refresh")}
            </Button>
          </div>
          <Button
            className="mt-3 w-full"
            variant="outline"
            disabled={directory.isPending || directory.isFetching || directory.isError}
            onClick={() => void startNew()}
          >
            {t("chat.new")}
          </Button>
          {directory.isPending && (
            <p role="status" className="py-3 text-sm">
              {t("common.loading")}
            </p>
          )}
          {(directory.isError || historyUnavailable) && (
            <p role="alert" className="py-3 text-sm">
              {t("chat.unavailable")}
            </p>
          )}
          {directory.data && !directory.isError && !historyUnavailable && (
            <>
              <ul
                className="mt-3 max-h-60 space-y-1 overflow-y-auto xl:max-h-[55vh]"
                aria-label={t("chat.history")}
              >
                {directory.data.conversations.map((item) => {
                  const Item = conversationHref ? "a" : "button";
                  return (
                    <li key={item.conversationId}>
                      <Item
                        {...(conversationHref
                          ? { href: conversationHref(item.conversationId) }
                          : { type: "button" as const })}
                        aria-current={selected?.id === item.conversationId ? "true" : undefined}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm break-words [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 ${selected?.id === item.conversationId ? "bg-secondary font-medium" : "hover:bg-secondary/60"}`}
                        onClick={(event) => {
                          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
                            return;
                          event.preventDefault();
                          setSelected({
                            id: item.conversationId,
                            fresh: false,
                            count: item.turnCount,
                          });
                          onLocationChange?.(item.conversationId, false);
                          setHistoryOpen(false);
                          historyToggle.current?.focus();
                        }}
                      >
                        {item.title}
                      </Item>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!offset || directory.isFetching}
                  onClick={() => setOffset(offset - 50)}
                >
                  {t("collaboration.previous")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    offset >= 150 ||
                    directory.data.conversations.length < 50 ||
                    directory.isFetching
                  }
                  onClick={() => setOffset(offset + 50)}
                >
                  {t("collaboration.next")}
                </Button>
              </div>
            </>
          )}
        </aside>
      </div>
      {selected && !directory.isError ? (
        <ConversationSession
          key={`${actorId}:${project.ownerId}:${project.projectId}:${selected.id}`}
          {...props}
          selection={selected}
          onStarted={() => {
            setSelected((value) => (value ? { ...value, fresh: false } : value));
            onLocationChange?.(selected.id, true);
          }}
          onDirectoryRefresh={refresh}
          onUnavailableChange={setHistoryUnavailable}
        />
      ) : (
        <div role="status">{t(directory.isError ? "chat.unavailable" : "common.loading")}</div>
      )}
    </div>
  );
}

function ConversationSession({
  actorId,
  project,
  onOpenResult,
  selection,
  onStarted,
  onDirectoryRefresh,
  onUnavailableChange,
  onLocationChange,
  onConfirmedConversation,
}: Props & {
  selection: Selection;
  onStarted: () => void;
  onDirectoryRefresh: () => void;
  onUnavailableChange: (unavailable: boolean) => void;
}) {
  const t = useT(),
    locale = useAppLanguage(),
    client = useQueryClient();
  const [after, setAfter] = useState(() => lastConversationPage(selection.count));
  const [followLatest, setFollowLatest] = useState(true);
  const [body, setBody] = useState("");
  const [allowGeneration, setAllowGeneration] = useState(false);
  const [request, setRequest] = useState<z.infer<typeof conversationSend>>();
  const [sending, setSending] = useState(false),
    [working, setWorking] = useState(false);
  const [sendUnconfirmed, setSendUnconfirmed] = useState(false),
    [actionError, setActionError] = useState(false);
  const alive = useRef(true),
    dispatching = useRef(false),
    mutating = useRef(false),
    composer = useRef<HTMLTextAreaElement>(null);
  const messageId = useId(),
    hintId = useId();
  const target = {
    ownerId: project.ownerId,
    projectId: project.projectId,
    conversationId: selection.id,
  };
  const prefix = [...conversationKey(actorId, project), "history", selection.id];
  const history = useQuery({
    queryKey: [...prefix, after],
    queryFn: ({ signal }) =>
      runTeamRequest(
        async () =>
          checkedPage(
            actorId,
            target,
            await readMiloConversationFn({ data: { ...target, after } }),
          ),
        signal,
      ),
    enabled: !selection.fresh || !!request,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: (query) =>
      sending || query.state.data?.turns.some(isActiveTurn) ? 3000 : 15000,
  });
  const page = history.isError ? undefined : history.data;
  useEffect(() => {
    if (!page) return;
    onConfirmedConversation?.(selection.id);
    onLocationChange?.(selection.id, true);
  }, [page, selection.id, onConfirmedConversation, onLocationChange]);
  useEffect(() => {
    onUnavailableChange(history.isError);
  }, [history.isError, onUnavailableChange]);
  const latest = page?.turns.at(-1);
  const active = page?.turns.find(isActiveTurn);
  const requestSaved = page?.turns.some((turn) => turn.turnId === request?.turnId) ?? false;
  const awaiting = !!request && !requestSaved && (sending || sendUnconfirmed);
  const tooLong = new TextEncoder().encode(body).byteLength > 8000;
  const canSend =
    !sending &&
    !working &&
    !awaiting &&
    !active &&
    !tooLong &&
    !!body.trim() &&
    !history.isError &&
    (selection.fresh || (!!page && !page.hasMore && page.turnCount < 500));
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (followLatest && page && lastConversationPage(page.turnCount) !== after)
      setAfter(lastConversationPage(page.turnCount));
  }, [followLatest, page, after]);
  const refresh = () => void client.invalidateQueries({ queryKey: prefix });
  async function submit(original?: z.infer<typeof conversationSend>) {
    if (dispatching.current || mutating.current || (!original && !canSend)) return;
    const input =
      original ??
      conversationSend.parse({
        ...target,
        turnId: crypto.randomUUID(),
        body,
        locale,
        ...(actorId === project.ownerId ? { allowDraftGeneration: allowGeneration } : {}),
      });
    dispatching.current = true;
    setRequest(input);
    setSending(true);
    setSendUnconfirmed(false);
    setActionError(false);
    setFollowLatest(true);
    onStarted();
    try {
      await sendMiloMessageFn({ data: input });
      if (!alive.current) return;
      setBody("");
      setAllowGeneration(false);
    } catch {
      if (alive.current) setSendUnconfirmed(true);
    } finally {
      dispatching.current = false;
      if (alive.current) {
        setSending(false);
        refresh();
        onDirectoryRefresh();
      }
    }
  }
  async function act(kind: "resume" | "cancel", turnId: string) {
    if (mutating.current || (kind === "resume" && dispatching.current)) return;
    mutating.current = true;
    setWorking(true);
    setActionError(false);
    try {
      await (kind === "cancel" ? cancelMiloTurnFn : resumeMiloTurnFn)({
        data: { ...target, turnId },
      });
    } catch {
      if (alive.current) setActionError(true);
    } finally {
      mutating.current = false;
      if (alive.current) {
        setWorking(false);
        refresh();
        onDirectoryRefresh();
      }
    }
  }
  const stopId = active?.turnId ?? (sending ? request?.turnId : undefined);
  return (
    <section className="min-w-0 space-y-5" aria-label={t("chat.title")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{project.name}</h2>
          <p className="text-xs text-muted-foreground">
            {t(actorId === project.ownerId ? "chat.private" : "chat.sharedPrivate")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={refresh}
          disabled={history.isFetching || selection.fresh}
        >
          {t("collaboration.refresh")}
        </Button>
      </div>
      {selection.fresh && !request && (
        <div className="rounded-2xl bg-card p-6 md:p-9 border">
          <SpecialistPortrait role="lead" />
          <h3 className="mt-5 font-display text-2xl">{t("chat.welcome")}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {t("chat.description")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {["reviewPrompt", "knowledgePrompt"].map((key) => (
              <Button
                key={key}
                variant="outline"
                className="h-auto whitespace-normal text-left"
                onClick={() => {
                  setBody(t(`chat.${key}`));
                  composer.current?.focus();
                }}
              >
                {t(`chat.${key}`)}
              </Button>
            ))}
          </div>
        </div>
      )}
      {!selection.fresh && history.isPending && <p role="status">{t("common.loading")}</p>}
      {history.isError && (
        <p role="alert" className="rounded-xl border p-4">
          {t("chat.unavailable")}
        </p>
      )}
      {page && (
        <>
          {(after > 0 || page.hasMore) && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={after === 0 || history.isFetching}
                onClick={() => {
                  setFollowLatest(false);
                  setAfter(Math.max(0, after - 20));
                }}
              >
                {t("collaboration.previous")}
              </Button>
              <span className="text-xs">
                {t("chat.page", { from: after + 1, to: page.nextAfter, total: page.turnCount })}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!page.hasMore || history.isFetching}
                onClick={() => {
                  setFollowLatest(false);
                  setAfter(page.nextAfter);
                }}
              >
                {t("collaboration.next")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFollowLatest(true);
                  setAfter(lastConversationPage(page.turnCount));
                }}
              >
                {t("chat.latest")}
              </Button>
            </div>
          )}
          <ol className="space-y-7" aria-label={t("chat.messages")}>
            {page.turns.map((turn) => (
              <li key={turn.turnId} className="space-y-4">
                <article className="ml-auto max-w-[92%] rounded-2xl bg-secondary px-5 py-4 md:max-w-[85%]">
                  <p className="mb-2 text-xs font-semibold">{t("chat.you")}</p>
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-6">
                    {turn.body}
                  </p>
                  {turn.allowDraftGeneration && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("chat.generationEnabled")}
                    </p>
                  )}
                </article>
                {displayedConversationEvents(turn).map((event, index) => (
                  <ConversationEventView
                    key={`${turn.turnId}:${index}`}
                    event={event}
                    project={project}
                    actorId={actorId}
                    conversationId={target.conversationId}
                    turnId={turn.turnId}
                    turnState={turn.state}
                    onOpen={onOpenResult}
                  />
                ))}
                <p className="text-xs text-muted-foreground">{t(conversationStatus(turn))}</p>
                {turn.state === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={working || sending}
                    onClick={() => void act("resume", turn.turnId)}
                  >
                    {t("chat.resume")}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {awaiting && (
        <article className="ml-auto max-w-[92%] rounded-2xl border bg-secondary/50 p-4">
          <p className="text-xs font-semibold">{t("chat.you")}</p>
          <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm">
            {request?.body}
          </p>
          <p className="mt-3 text-xs">{t(sending ? "chat.sending" : "chat.sendUnconfirmed")}</p>
        </article>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {active
          ? t(conversationStatus(active))
          : latest
            ? t(conversationStatus(latest))
            : sending
              ? t("chat.sending")
              : ""}
      </div>
      {sendUnconfirmed && !requestSaved && request && (
        <div className="space-y-3 rounded-xl border p-4">
          <p>{t("chat.sendUnconfirmed")}</p>
          <Button
            variant="outline"
            disabled={sending || working}
            onClick={() => void submit(request)}
          >
            {t("chat.recover")}
          </Button>
        </div>
      )}
      {actionError && <p role="alert">{t("chat.unavailable")}</p>}
      {stopId && (
        <div className="space-y-2">
          <Button variant="outline" disabled={working} onClick={() => void act("cancel", stopId)}>
            {t("chat.stop")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("chat.stopHelp")}</p>
        </div>
      )}
      <form
        className="rounded-2xl border bg-card p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={sending || working}
      >
        <label
          htmlFor={messageId}
          className="text-sm font-medium break-words [overflow-wrap:anywhere]"
        >
          {t("chat.messageFor", { project: project.name })}
        </label>
        <textarea
          id={messageId}
          ref={composer}
          value={body}
          rows={4}
          maxLength={8000}
          disabled={sending || working || awaiting}
          aria-describedby={hintId}
          aria-invalid={tooLong || undefined}
          placeholder={t("chat.placeholder")}
          className="mt-3 block min-h-28 w-full resize-y rounded-xl border bg-background p-3 text-sm leading-6 focus-visible:outline focus-visible:outline-2"
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <p id={hintId} className="mt-2 text-xs text-muted-foreground">
          {t(
            tooLong
              ? "chat.tooLong"
              : page && page.turnCount >= 500
                ? "chat.full"
                : "chat.keyboard",
          )}
        </p>
        {actorId === project.ownerId && (
          <label className="mt-3 flex items-start gap-2 text-xs leading-5">
            <input
              type="checkbox"
              className="mt-1"
              checked={allowGeneration}
              disabled={sending || working || awaiting}
              onChange={(event) => setAllowGeneration(event.target.checked)}
            />
            <span>{t("chat.allowGeneration")}</span>
          </label>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs text-muted-foreground">{t("chat.usage")}</p>
          <Button type="submit" disabled={!canSend}>
            {t("chat.send")}
          </Button>
        </div>
      </form>
    </section>
  );
}
function ConversationEventView({
  event,
  project,
  actorId,
  conversationId,
  turnId,
  turnState,
  onOpen,
}: {
  event: ConversationEvent;
  project: MiloProject;
  actorId: string;
  conversationId: string;
  turnId: string;
  turnState: ConversationTurn["state"];
  onOpen: (event: ConversationEvent) => void;
}) {
  const t = useT();
  if (
    event.kind === "tool" &&
    event.tool === "draft_metadata_proposal" &&
    event.operationId &&
    event.state !== "unavailable" &&
    (event.state !== "running" || !["running", "pending"].includes(turnState))
  )
    return (
      <MiloDraftProposal
        key={`${actorId}:${project.ownerId}:${project.projectId}:${conversationId}:${turnId}:${event.operationId}`}
        actorId={actorId}
        ownerId={project.ownerId}
        projectId={project.projectId}
        conversationId={conversationId}
        turnId={turnId}
        proposalId={event.operationId}
      />
    );
  const canOpen =
    event.state === "completed" &&
    event.reference &&
    (actorId === project.ownerId
      ? event.reference.kind !== "project"
      : event.reference.kind === "draft");
  if (event.kind === "tool")
    return (
      <div className="ml-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3 text-xs">
        <div>
          <p className="font-medium">
            {t(event.tool ? `chat.tool.${event.tool}` : "chat.toolUnavailable")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              event.state === "completed"
                ? "chat.evidenceSaved"
                : event.state === "running"
                  ? "chat.running"
                  : "chat.toolUnavailable",
            )}
          </p>
        </div>
        {canOpen && (
          <Button size="sm" variant="ghost" onClick={() => onOpen(event)}>
            {t(
              event.reference?.kind === "generation"
                ? "generationResults.open"
                : "chat.openContext",
            )}
          </Button>
        )}
      </div>
    );
  return (
    <article
      className={`flex min-w-0 gap-3 ${event.kind === "handoff" ? "rounded-xl border-l-4 border-l-primary bg-secondary/30 p-4" : "py-3"}`}
    >
      {event.kind === "assistant" && (
        <div className="hidden sm:block">
          <SpecialistPortrait role={event.role} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {t(`team.role.${event.role}`)}{" "}
          <span className="font-normal text-muted-foreground">· {t("team.aiRole")}</span>
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-7">
          {event.text}
        </p>
        {event.code === "history_partial" && (
          <p className="mt-3 text-xs text-muted-foreground">{t("chat.partialHistory")}</p>
        )}
      </div>
    </article>
  );
}
