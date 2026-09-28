import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SignOutFlowState } from "@/lib/sign-out-flow";

/**
 * Safe sign-out dialog (AS). Opens only when signing out could leave workspace changes that are
 * not confirmed as saved, or when the sign-out itself was refused. Explicit non-submit choices:
 * Stay (default focus; also cancels a pending pre-sign-out save), Retry save, Sign out anyway
 * (unconfirmed state only), Try again (error state: re-checks the workspace first) and, while
 * unretained producer results of this session are still pending (AY), Stay/wait vs Sign out anyway.
 * Only an in-flight auth sign-out cannot be cancelled. The copy says changes MAY be missing from the
 * server; it never asserts loss and never mentions technical causes.
 *
 * Entry focus (AU): the dialog can open above the mobile navigation Sheet (a second Radix focus
 * scope), where the primitive's default auto-focus left focus on the background sign-out control.
 * `onOpenAutoFocus` therefore places focus on Stay explicitly (again on the next frame, after the
 * nested scopes settle). Focus is moved only on state TRANSITIONS: onto the dialog itself while the
 * auth sign-out is in flight (Stay is disabled then) and back to Stay when that ends in an error.
 * On close, focus returns to the control that opened the dialog when it is still visible.
 */
export function SignOutDialog({
  state,
  onStay,
  onRetry,
  onLeave,
  onRetryAuth,
  onLeavePending,
  t,
}: {
  state: SignOutFlowState;
  onStay: () => void;
  /** Unconfirmed state: one more save of the current workspace changes. */
  onRetry: () => void;
  /** Unconfirmed state: the explicit choice to sign out anyway. */
  onLeave: () => void;
  /** Error state: try the sign-out again (the workspace is re-checked and saved first if needed). */
  onRetryAuth: () => void;
  /** Pending-work gate: leave although pending unretained results may be lost. */
  onLeavePending: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const open = state.kind !== "idle";
  const busy = state.kind === "saving" || state.kind === "signingOut";
  const stayRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousKind = useRef<SignOutFlowState["kind"]>("idle");
  const openerRef = useRef<HTMLElement | null>(null);
  const focusStay = () => {
    const stay = stayRef.current;
    if (stay && !stay.disabled) stay.focus();
  };
  /** Entry focus: Stay when it is enabled, otherwise the dialog itself (auth sign-out in flight). */
  const focusEntry = () => {
    const stay = stayRef.current;
    if (stay && !stay.disabled) stay.focus();
    else contentRef.current?.focus();
  };
  useEffect(() => {
    const previous = previousKind.current;
    previousKind.current = state.kind;
    if (state.kind === "idle" || previous === state.kind) return;
    if (state.kind === "signingOut" && document.activeElement === stayRef.current) {
      contentRef.current?.focus(); // Stay is disabled while the auth request is in flight
    } else if (previous === "signingOut" && state.kind === "error") {
      focusStay(); // the refused sign-out re-enables Stay: return focus once, not on every render
    } else if (!contentRef.current?.contains(document.activeElement)) {
      // The activated control left the DOM with the transition (e.g. the error-state button while
      // the retried sign-out saves first): keep focus inside the dialog, on the safe control.
      focusEntry();
    }
  }, [state.kind]);
  return (
    <AlertDialog open={open}>
      <AlertDialogContent
        ref={contentRef}
        data-sign-out-dialog={state.kind}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          // The control that opened the dialog (desktop sidebar or mobile Sheet sign-out) gets focus back on close.
          openerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          focusEntry();
          requestAnimationFrame(focusEntry); // after a nested Sheet focus scope has settled
        }}
        onCloseAutoFocus={(event) => {
          const opener = openerRef.current;
          openerRef.current = null;
          if (opener && opener.isConnected && opener.offsetParent !== null) {
            event.preventDefault();
            opener.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (state.kind !== "signingOut") onStay(); // Stay also cancels a pending pre-sign-out save
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(
              state.kind === "error"
                ? "shell.signOutDialog.errorTitle"
                : state.kind === "pendingWork"
                  ? "shell.signOutDialog.pendingTitle"
                  : "shell.signOutDialog.title",
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {state.kind === "pendingWork"
              ? t("shell.signOutDialog.pendingBody", { count: state.count })
              : state.kind === "saving"
                ? t("shell.signOutDialog.saving")
                : state.kind === "signingOut"
                  ? t("shell.signOutDialog.signingOut")
                  : state.kind === "error"
                    ? t("shell.signOutDialog.errorBody")
                    : t("shell.signOutDialog.body")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {busy ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t(
              state.kind === "saving"
                ? "shell.workspaceSave.saving"
                : "shell.signOutDialog.signingOut",
            )}
          </p>
        ) : null}
        <AlertDialogFooter>
          <Button
            ref={stayRef}
            type="button"
            variant="outline"
            onClick={onStay}
            disabled={state.kind === "signingOut"}
            data-sign-out-stay
          >
            {t("shell.signOutDialog.stay")}
          </Button>
          {state.kind === "unconfirmed" ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              {t("planScreen.discovery.save.retry")}
            </Button>
          ) : null}
          {state.kind === "unconfirmed" ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onLeave}
              data-sign-out-leave="unconfirmed"
            >
              {t("shell.signOutDialog.leave")}
            </Button>
          ) : null}
          {state.kind === "pendingWork" ? (
            <Button
              type="button"
              variant="destructive"
              onClick={onLeavePending}
              data-sign-out-leave="pendingWork"
            >
              {t("shell.signOutDialog.leave")}
            </Button>
          ) : null}
          {state.kind === "error" ? (
            // Retrying re-checks the workspace and may save or ask again before any new sign-out
            // request, so the label says "Try again", not "Sign out anyway".
            <Button type="button" variant="outline" onClick={onRetryAuth} data-sign-out-retry-auth>
              {t("common.retry")}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
