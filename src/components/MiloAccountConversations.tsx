import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useAppLanguage, useT } from "@/i18n";
import {
  accountConversationCursor,
  checkedAccountConversations,
  type AccountConversation,
} from "@/lib/milo-conversation-account";
import { listMyMiloConversationsFn } from "@/lib/milo-conversation-account.functions";
import { checkedConversationErasure } from "@/lib/milo-conversation-lifecycle";
import { eraseMiloConversationFn } from "@/lib/milo-conversation-lifecycle.functions";
import {
  accountConversationsKey,
  purgeErasedConversation,
} from "@/lib/milo-conversation-erasure.ui";
import { runTeamRequest } from "@/lib/team-request-queue";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";

type Target = { ownerId: string; projectId: string; conversationId: string };
type Erasure = "erasing" | "unconfirmed" | "erased";
const targetOf = (entry: AccountConversation): Target => ({
  ownerId: entry.ownerId,
  projectId: entry.projectId,
  conversationId: entry.conversationId,
});

/** Key by actor. Lists only this actor's own conversations, including ones whose
 * project access ended. A failed read hides every title; erasure reuses the exact
 * conversation RPC and never retries automatically. */
export function MiloAccountConversations({
  actorId,
  conversationHref,
  onOpen,
}: {
  actorId: string;
  conversationHref: (target: Target) => string;
  onOpen: (target: Target) => void;
}) {
  const t = useT(),
    locale = useAppLanguage(),
    client = useQueryClient();
  const [erasures, setErasures] = useState<Record<string, Erasure>>({});
  const [confirming, setConfirming] = useState<Target>();
  const alive = useRef(true),
    inFlight = useRef(new Set<string>()),
    lifecycle = useRef(new AbortController()),
    // The confirmation dialog is controlled without a Radix trigger, so Radix would
    // drop keyboard focus on close. Return it to the Delete control that opened the
    // dialog, or to the list container once that control is gone after erasure.
    container = useRef<HTMLDivElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    alive.current = true;
    if (lifecycle.current.signal.aborted) lifecycle.current = new AbortController();
    return () => {
      alive.current = false;
      lifecycle.current.abort();
    };
  }, []);
  const directory = useInfiniteQuery({
    queryKey: accountConversationsKey(actorId),
    initialPageParam: undefined as ReturnType<typeof accountConversationCursor> | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const input = pageParam ? { before: pageParam } : {};
      return checkedAccountConversations(
        actorId,
        input,
        await runTeamRequest(() => listMyMiloConversationsFn({ data: input }), signal),
      );
    },
    getNextPageParam: (last) =>
      last.hasMore ? accountConversationCursor(last.conversations.at(-1)!) : undefined,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchInterval: 30000,
  });
  async function erase(target: Target) {
    const id = target.conversationId;
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setConfirming(undefined);
    setErasures((current) => ({ ...current, [id]: "erasing" }));
    try {
      const signal = lifecycle.current.signal;
      const result = await runTeamRequest(() => eraseMiloConversationFn({ data: target }), signal);
      checkedConversationErasure(actorId, target, result);
      // Mark first: a directory reply that started before erasure cannot restore it.
      if (alive.current) setErasures((current) => ({ ...current, [id]: "erased" }));
      await purgeErasedConversation(client, actorId, target);
    } catch {
      if (alive.current) setErasures((current) => ({ ...current, [id]: "unconfirmed" }));
    } finally {
      inFlight.current.delete(id);
    }
  }
  const entries = (directory.data?.pages.flatMap((page) => page.conversations) ?? []).filter(
    (entry, index, all) =>
      erasures[entry.conversationId] !== "erased" &&
      all.findIndex((other) => other.conversationId === entry.conversationId) === index,
  );
  const started = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  return (
    <div ref={container} tabIndex={-1} className="mx-auto max-w-4xl space-y-4 outline-none">
      {Object.values(erasures).includes("erased") && <p role="status">{t("chat.erased")}</p>}
      {directory.isPending && <p role="status">{t("common.loading")}</p>}
      {directory.isError ? (
        <div role="alert" className="space-y-3 rounded-xl border p-4">
          <p>{t("chat.account.error")}</p>
          <Button
            variant="outline"
            disabled={directory.isFetching}
            onClick={() => void directory.refetch()}
          >
            {t("chat.account.retry")}
          </Button>
        </div>
      ) : (
        directory.data && (
          <>
            {entries.length === 0 ? (
              <p>{t("chat.account.empty")}</p>
            ) : (
              <ul className="space-y-3" aria-label={t("chat.account.title")}>
                {entries.map((entry) => {
                  const target = targetOf(entry),
                    state = erasures[entry.conversationId];
                  return (
                    <li
                      key={entry.conversationId}
                      className="min-w-0 space-y-2 rounded-xl border bg-card p-4"
                    >
                      {state === "erasing" ? (
                        <p role="status" className="text-sm">
                          {t("chat.erasing")}
                        </p>
                      ) : state === "unconfirmed" ? (
                        <p role="alert" className="text-sm">
                          {t("chat.eraseUnconfirmed")}
                        </p>
                      ) : entry.access === "available" ? (
                        <a
                          className="block break-words font-medium underline-offset-4 hover:underline"
                          href={conversationHref(target)}
                          onClick={(event) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button)
                              return;
                            event.preventDefault();
                            onOpen(target);
                          }}
                        >
                          {entry.title}
                        </a>
                      ) : (
                        <p className="text-sm">{t("chat.account.unavailable")}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t("chat.account.started", { date: started(entry.createdAt) })}
                      </p>
                      {state === "unconfirmed" ? (
                        <Button size="sm" variant="outline" onClick={() => void erase(target)}>
                          {t("chat.eraseRetry")}
                        </Button>
                      ) : (
                        state !== "erasing" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              returnFocus.current = event.currentTarget;
                              setConfirming(target);
                            }}
                          >
                            {t("chat.erase")}
                          </Button>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {directory.hasNextPage && (
              <Button
                variant="outline"
                disabled={directory.isFetchingNextPage}
                onClick={() => void directory.fetchNextPage()}
              >
                {t("chat.account.more")}
              </Button>
            )}
          </>
        )
      )}
      <AlertDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(undefined);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const opener = returnFocus.current;
            returnFocus.current = null;
            (opener?.isConnected ? opener : container.current)?.focus();
          }}
        >
          <AlertDialogTitle>{t("chat.eraseTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("chat.eraseHelp")} {t("chat.account.eraseAccess")}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (confirming) void erase(confirming);
              }}
            >
              {t("chat.erase")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
