import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { useAppLanguage, useT } from "@/i18n";
import { Button } from "./ui/button";
import { SpecialistPortrait } from "./SpecialistPortrait";
import { MiloDraftProposal } from "./MiloDraftProposal";
import { MiloConversationActions } from "./MiloConversationActions";
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
  awaitingFirstConfirmation,
  conversationReadEnabled,
  sendOutcome,
  retainedSendOutcome,
  type MiloProject,
  type SendOutcome,
} from "@/lib/milo-conversation.ui";
import { runTeamRequest } from "@/lib/team-request-queue";
import { firstUseConsent, firstUseContext, type FirstUseSuggestion } from "@/lib/milo-first-use";

type Selection = { id: string; fresh: boolean; count: number };
type Props = {
  actorId: string;
  project: MiloProject;
  /** Provider checks spend the owner's quota. Owners always may consent; a collaborator
   * only with a working role (editor or reviewer), which the caller derives from the
   * membership directory. The database refuses consent from viewers regardless. */
  canConsentChecks?: boolean;
  onOpenResult: (event: ConversationEvent) => void;
  location?: string;
  onLocationChange?: (location: string, replace: boolean) => void;
  onConfirmedConversation?: (id: string) => void;
  conversationHref?: (id: string) => string;
  /** Start suggestions from `firstUseContext`, derived by the caller for exactly this
   * actor/owner/project. Without them only neutral suggestions are shown. They only
   * fill in the composer: never send, never consent. */
  startSuggestions?: readonly FirstUseSuggestion[];
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
  const [erasingId, setErasingId] = useState<string>();
  const [erasedNotice, setErasedNotice] = useState(false);
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
    setErasedNotice(false);
    onLocationChange?.("new", false);
    setHistoryOpen(false);
    historyToggle.current?.focus();
  }
  return (
    <div className="min-w-0 space-y-3" data-milo-project={project.projectId}>
      {/* One compact row: the privacy of this conversation and, below the xl layout,
          the history toggle. Neither is private content. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-1">
        <p className="min-w-0 text-xs text-muted-foreground" data-milo-private-indicator>
          {t(actorId === project.ownerId ? "chat.private" : "chat.sharedPrivate")}
        </p>
        <Button
          ref={historyToggle}
          className="min-h-11 xl:hidden"
          variant="ghost"
          aria-expanded={historyOpen}
          aria-controls={historyId}
          onClick={() => setHistoryOpen((value) => !value)}
        >
          {t("chat.history")}
        </Button>
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div>
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
                            setErasedNotice(false);
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
        <div className="min-w-0 space-y-4">
          {erasedNotice && <p role="status">{t("chat.erased")}</p>}
          {selected && !selected.fresh && (
            <MiloConversationActions
              key={`actions:${actorId}:${project.ownerId}:${project.projectId}:${selected.id}`}
              actorId={actorId}
              project={project}
              conversationId={selected.id}
              canExport={!directory.isError && !historyUnavailable && erasingId !== selected.id}
              onErasing={() => {
                setErasingId(selected.id);
                setHistoryUnavailable(true);
                setErasedNotice(false);
              }}
              onErased={() => {
                if (!alive.current || currentSelection.current.id !== selected.id) return;
                setSelected({ id: crypto.randomUUID(), fresh: true, count: 0 });
                setErasingId(undefined);
                setHistoryUnavailable(false);
                setErasedNotice(true);
                setOffset(0);
                onLocationChange?.("new", true);
                historyToggle.current?.focus();
              }}
            />
          )}
          {selected && erasingId !== selected.id ? (
            // Kept mounted (concealed) while directory authorization fails, so an
            // in-flight, uncertain or not-saved request keeps its in-memory identity.
            // Any scope or consent-role change is a different key and discards it.
            <ConversationSession
              key={`${actorId}:${project.ownerId}:${project.projectId}:${props.canConsentChecks === true}:${selected.id}`}
              {...props}
              selection={selected}
              concealed={directory.isError}
              onConfirmed={(id, sent) => {
                // Only the id-checked fresh flag and, for a confirmed SEND, the URL.
                // This render's location callback carries its own source location,
                // so the route ignores it once navigation has moved on.
                setSelected((value) =>
                  value?.id === id && value.fresh ? { ...value, fresh: false } : value,
                );
                if (!sent) return;
                setErasedNotice(false);
                onLocationChange?.(id, true);
              }}
              onDirectoryRefresh={() =>
                void client.invalidateQueries({ queryKey: [...prefix, "directory"] })
              }
              onUnavailableChange={setHistoryUnavailable}
            />
          ) : selected && erasingId === selected.id ? null : (
            <div role="status">{t(directory.isError ? "chat.unavailable" : "common.loading")}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationSession({
  actorId,
  project,
  onOpenResult,
  selection,
  canConsentChecks = false,
  concealed,
  onConfirmed,
  onDirectoryRefresh,
  onUnavailableChange,
  onLocationChange,
  onConfirmedConversation,
  startSuggestions,
}: Props & {
  selection: Selection;
  concealed: boolean;
  /** A confirmed read (`sent` false) or send (`sent` true) of this conversation. */
  onConfirmed: (id: string, sent: boolean) => void;
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
  const [allowChecks, setAllowChecks] = useState(false);
  const [request, setRequest] = useState<z.infer<typeof conversationSend>>();
  const [sending, setSending] = useState(false),
    [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<SendOutcome>(),
    [actionError, setActionError] = useState(false);
  const sendUnconfirmed = outcome === "uncertain";
  const uncertainTurns = useRef(new Set<string>());
  const alive = useRef(true),
    dispatching = useRef(false),
    mutating = useRef(false),
    composer = useRef<HTMLTextAreaElement>(null);
  const messageId = useId(),
    hintId = useId(),
    suggestionHintId = useId();
  const consent = firstUseConsent(actorId, project, canConsentChecks);
  const suggestions = startSuggestions ?? firstUseContext(actorId, project, undefined).suggestions;
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
    enabled: conversationReadEnabled({ fresh: selection.fresh, concealed, outcome }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    // No interval read while the begin call itself is in flight: it would compete
    // with that send for the same actor admission.
    refetchInterval: (query) =>
      sending ? false : query.state.data?.turns.some(isActiveTurn) ? 3000 : 15000,
  });
  // Concealment drops cached private history; revealing requires a fresh read.
  const { ownerId, projectId } = project;
  useEffect(() => {
    if (concealed)
      client.removeQueries({
        queryKey: [...conversationKey(actorId, { ownerId, projectId }), "history", selection.id],
      });
  }, [concealed, client, actorId, ownerId, projectId, selection.id]);
  const page = history.isError || concealed ? undefined : history.data;
  const firstUnconfirmed = awaitingFirstConfirmation({ fresh: selection.fresh, outcome });
  // As before CR: the effect's own committed callbacks, so the route's source-location
  // guard ignores a confirmation from a conversation navigation has left.
  useEffect(() => {
    if (!page) return;
    onConfirmedConversation?.(selection.id);
    onLocationChange?.(selection.id, true);
  }, [page, selection.id, onConfirmedConversation, onLocationChange]);
  // A read confirmed this conversation exists: it is no longer a fresh draft. A pure,
  // id-checked state update; it never navigates.
  const markConfirmed = useRef(onConfirmed);
  useEffect(() => {
    markConfirmed.current = onConfirmed;
  });
  // Only a still-fresh selection: an existing conversation's reads never touch
  // parent state, so they cannot add an intermediate parent render.
  useEffect(() => {
    if (page && selection.fresh) markConfirmed.current(selection.id, false);
  }, [page, selection.id, selection.fresh]);
  useEffect(() => {
    // An unsaved new conversation cannot be read yet; that is not lost access.
    onUnavailableChange(history.isError && !firstUnconfirmed);
  }, [history.isError, firstUnconfirmed, onUnavailableChange]);
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
        allowProviderChecks: allowChecks && (actorId === project.ownerId || canConsentChecks),
      });
    dispatching.current = true;
    setRequest(input);
    setSending(true);
    setOutcome(undefined);
    setActionError(false);
    setFollowLatest(true);
    // The URL is promoted and a new conversation read only after confirmation.
    let result: SendOutcome = "uncertain";
    try {
      result = sendOutcome(await sendMiloMessageFn({ data: input }), input.turnId);
    } catch {
      result = "uncertain";
    } finally {
      dispatching.current = false;
    }
    // A busy refusal proves only that THIS attempt did not commit. Once a request's
    // outcome has been uncertain, an earlier attempt may have saved and queued it,
    // so it stays uncertain (same identity, text and duplicate protection).
    result = retainedSendOutcome(result, uncertainTurns.current.has(input.turnId));
    if (result === "uncertain") uncertainTurns.current.add(input.turnId);
    if (!alive.current) return;
    setSending(false);
    setOutcome(result);
    if (result === "notSaved") return; // Confirmed rollback: nothing saved, text kept.
    if (result === "saved") {
      setBody("");
      setAllowGeneration(false);
      setAllowChecks(false);
      onConfirmed(input.conversationId, true);
    }
    // History first, then the directory, never both at once.
    void client
      .invalidateQueries({ queryKey: prefix })
      .finally(() => alive.current && onDirectoryRefresh());
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
  // Authorization is failing: show nothing private (no history, request text or
  // composer). Local request state stays in memory until authorization returns.
  if (concealed) return <div role="status">{t("chat.unavailable")}</div>;
  return (
    <section className="milo-start-session min-w-0 space-y-4" aria-label={t("chat.title")}>
      {/* The project is named by the selector and composer label, and its privacy by the
          workspace row; the heading stays for assistive navigation. */}
      <h2 className="sr-only">{project.name}</h2>
      {/* Nothing exists to refresh before the first send; the control appears with it. */}
      {!(selection.fresh && !request) && (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={refresh} disabled={history.isFetching}>
            {t("collaboration.refresh")}
          </Button>
        </div>
      )}
      {selection.fresh && !request && (
        <div className="milo-start-welcome space-y-2" data-milo-first-use>
          <h3 className="font-display text-xl leading-tight">{t("chat.welcome")}</h3>
          <div
            role="group"
            aria-label={t("conversationStart.suggestions")}
            aria-describedby={suggestionHintId}
            className="grid gap-2 sm:grid-cols-2"
          >
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion.id}
                type="button"
                variant="outline"
                data-first-use-suggestion={suggestion.id}
                className="milo-start-suggestion h-auto min-h-11 w-full justify-start whitespace-normal py-2 text-left break-words [overflow-wrap:anywhere]"
                onClick={() => {
                  // Fills in the message only: no send, no consent, no request.
                  setBody(t(suggestion.key, suggestion.vars));
                  composer.current?.focus();
                }}
              >
                {t(suggestion.key, suggestion.vars)}
              </Button>
            ))}
          </div>
          <p id={suggestionHintId} className="text-xs leading-5 text-muted-foreground">
            {t(
              actorId === project.ownerId
                ? "conversationStart.ownedIntro"
                : "conversationStart.sharedIntro",
            )}{" "}
            {t("conversationStart.suggestionHint")}
          </p>
        </div>
      )}
      {!selection.fresh && history.isPending && <p role="status">{t("common.loading")}</p>}
      {history.isError && !firstUnconfirmed && (
        <div role="alert" className="space-y-3 rounded-xl border p-4">
          <p>{t("chat.unavailable")}</p>
          {/* Read-only re-check: it never resends, resumes or replays the request. */}
          <Button size="sm" variant="outline" onClick={refresh} disabled={history.isFetching}>
            {t("collaboration.refresh")}
          </Button>
        </div>
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
                  {turn.allowProviderChecks && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {t("chat.providerChecksEnabled")}
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
      {outcome === "notSaved" && request && !sending && (
        <div role="alert" className="space-y-3 rounded-xl border p-4">
          <p>{t("chat.notSavedBusy")}</p>
          {/* Nothing was saved; this resubmits the identical request, never a new one. */}
          {body === request.body && (
            <Button variant="outline" disabled={working} onClick={() => void submit(request)}>
              {t("common.retry")}
            </Button>
          )}
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
        className="milo-start-composer rounded-2xl border bg-card p-4 shadow-sm"
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
          rows={3}
          maxLength={8000}
          disabled={sending || working || awaiting}
          aria-describedby={hintId}
          aria-invalid={tooLong || undefined}
          placeholder={t("chat.placeholder")}
          className="mt-2 block min-h-24 w-full resize-y rounded-xl border bg-background p-3 text-sm leading-6 focus-visible:outline focus-visible:outline-2"
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
        {(consent.generation || consent.checks) && (
          // Per-message permissions: unchecked by default, reset after every saved send
          // and on any scope/role change (the session key). The short label names the
          // permission; its consequence stays visible, the full wording one click away.
          <fieldset
            className={`milo-start-consent mt-3 rounded-xl border px-3 pb-2 ${consent.generation && consent.checks ? "sm:grid sm:grid-cols-2 sm:gap-x-5" : ""}`}
          >
            <legend className="px-1 text-xs font-semibold">
              {t("conversationStart.consent.title")}{" "}
              <span className="font-normal text-muted-foreground">
                · {t("conversationStart.consent.note")}
              </span>
            </legend>
            {consent.generation && (
              <ConsentOption
                kind="generation"
                checked={allowGeneration}
                disabled={sending || working || awaiting}
                onChange={setAllowGeneration}
                label={t("conversationStart.consent.generationLabel")}
                summary={t("conversationStart.consent.generationSummary")}
                more={t("conversationStart.consent.generationDetails")}
                full={t("chat.allowGeneration")}
              />
            )}
            {consent.checks && (
              <ConsentOption
                kind="checks"
                checked={allowChecks}
                disabled={sending || working || awaiting}
                onChange={setAllowChecks}
                label={t("conversationStart.consent.checksLabel")}
                summary={t("conversationStart.consent.checksSummary")}
                more={t("conversationStart.consent.checksDetails")}
                full={t("chat.allowProviderChecks")}
              />
            )}
          </fieldset>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs text-muted-foreground">{t("chat.usage")}</p>
          <Button type="submit" className="min-h-11 px-6" disabled={!canSend}>
            {t("chat.send")}
          </Button>
        </div>
      </form>
    </section>
  );
}
/** One per-message permission: a short label, its visible bounded consequence (also the
 * checkbox description) and the complete reviewed wording in native details. */
function ConsentOption({
  kind,
  checked,
  disabled,
  onChange,
  label,
  summary,
  more,
  full,
}: {
  kind: "generation" | "checks";
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  summary: string;
  more: string;
  full: string;
}) {
  const inputId = useId(),
    summaryId = useId();
  return (
    <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3" data-consent={kind}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-1.5 size-4"
        checked={checked}
        disabled={disabled}
        aria-describedby={summaryId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="block cursor-pointer py-0.5 text-sm font-medium">
          {label}
        </label>
        <p id={summaryId} className="text-xs leading-5 text-muted-foreground">
          {summary}
        </p>
        <details className="text-xs leading-5">
          <summary className="milo-start-more w-fit cursor-pointer py-0.5">{more}</summary>
          <p className="pb-1">{full}</p>
        </details>
      </div>
    </div>
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
