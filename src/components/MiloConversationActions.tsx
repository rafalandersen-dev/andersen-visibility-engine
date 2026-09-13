import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n";
import {
  buildConversationExport,
  checkedConversationErasure,
} from "@/lib/milo-conversation-lifecycle";
import {
  eraseMiloConversationFn,
  exportMiloConversationPageFn,
} from "@/lib/milo-conversation-lifecycle.functions";
import { conversationKey, type MiloProject } from "@/lib/milo-conversation.ui";
import { runTeamRequest } from "@/lib/team-request-queue";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";

/** Key this component by actor, owner, project and conversation. Navigation
 * aborts waiting work and prevents a late export from downloading private data. */
export function MiloConversationActions({
  actorId,
  project,
  conversationId,
  canExport,
  onErasing,
  onErased,
}: {
  actorId: string;
  project: MiloProject;
  conversationId: string;
  canExport: boolean;
  onErasing: () => void;
  onErased: () => void;
}) {
  const t = useT(),
    client = useQueryClient();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState<"export" | "erase">();
  const [exportFailed, setExportFailed] = useState(false),
    [unconfirmed, setUnconfirmed] = useState(false);
  const alive = useRef(true),
    inFlight = useRef(false),
    lifecycle = useRef(new AbortController());
  useEffect(() => {
    alive.current = true;
    if (lifecycle.current.signal.aborted) lifecycle.current = new AbortController();
    return () => {
      alive.current = false;
      lifecycle.current.abort();
    };
  }, []);
  const target = { ownerId: project.ownerId, projectId: project.projectId, conversationId };
  async function exportFile() {
    if (inFlight.current || !canExport || unconfirmed) return;
    inFlight.current = true;
    setBusy("export");
    setExportFailed(false);
    try {
      const signal = lifecycle.current.signal;
      const result = await buildConversationExport(
        actorId,
        target,
        (input) => runTeamRequest(() => exportMiloConversationPageFn({ data: input }), signal),
        signal,
      );
      if (!alive.current || signal.aborted) return;
      const url = URL.createObjectURL(result.blob),
        anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = result.filename;
        document.body.append(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        // Give the browser time to take ownership of the download before release.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      if (alive.current) setExportFailed(true);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(undefined);
    }
  }
  async function erase() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("erase");
    setOpen(false);
    setExportFailed(false);
    onErasing();
    try {
      const signal = lifecycle.current.signal;
      const result = await runTeamRequest(() => eraseMiloConversationFn({ data: target }), signal);
      checkedConversationErasure(actorId, target, result);
      const prefix = conversationKey(actorId, project);
      // Purge this exact private history and its proposals, even if the caller
      // navigated away after the erasure was already dispatched.
      const predicate = (query: { queryKey: readonly unknown[] }) =>
        (query.queryKey[0] === "milo-conversation" &&
          query.queryKey[1] === actorId &&
          query.queryKey[2] === project.ownerId &&
          query.queryKey[3] === project.projectId &&
          query.queryKey[4] === "history" &&
          query.queryKey[5] === conversationId) ||
        (query.queryKey[0] === "milo-draft-proposal" &&
          query.queryKey[1] === actorId &&
          query.queryKey[2] === project.ownerId &&
          query.queryKey[3] === project.projectId &&
          query.queryKey[4] === conversationId);
      await client.cancelQueries({ predicate });
      client.removeQueries({ predicate });
      // Directory entries include titles. Remove the old title immediately,
      // and require a new authorized read before rendering another directory.
      await client.cancelQueries({ queryKey: [...prefix, "directory"] });
      client.resetQueries({ queryKey: [...prefix, "directory"] });
      if (alive.current && !signal.aborted) onErased();
    } catch {
      if (alive.current) setUnconfirmed(true);
    } finally {
      inFlight.current = false;
      if (alive.current) setBusy(undefined);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy || !canExport || unconfirmed}
          onClick={() => void exportFile()}
        >
          {t("chat.export")}
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!!busy || unconfirmed}>
              {t("chat.erase")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>{t("chat.eraseTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("chat.eraseHelp")}</AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void erase();
                }}
              >
                {t("chat.erase")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {unconfirmed && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void erase()}>
            {t("chat.eraseRetry")}
          </Button>
        )}
      </div>
      {!unconfirmed && <p className="text-xs text-muted-foreground">{t("chat.exportHelp")}</p>}
      {busy && (
        <p role="status" className="text-sm">
          {t(busy === "export" ? "chat.exporting" : "chat.erasing")}
        </p>
      )}
      {exportFailed && (
        <p role="alert" className="text-sm">
          {t("chat.exportFailed")}
        </p>
      )}
      {unconfirmed && (
        <p role="alert" className="text-sm">
          {t("chat.eraseUnconfirmed")}
        </p>
      )}
    </div>
  );
}
