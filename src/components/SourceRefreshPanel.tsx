import { useState } from "react";
import { Button } from "./ui/button";
import { useAppLanguage, useT } from "@/i18n";
import type { KnowledgeSource } from "@/lib/project-knowledge";
import type { readSourceRefresh } from "@/lib/source-refresh.server";
import { compareSourceSnapshots } from "@/lib/source-refresh";
import { refreshProjectSourceFn, reviewSourceFactFn } from "@/lib/source-refresh.functions";

type RefreshState = Awaited<ReturnType<typeof readSourceRefresh>>[number];
export function SourceRefreshPanel({
  source,
  state,
  disabled,
  change,
}: {
  source: KnowledgeSource;
  state?: RefreshState;
  disabled: boolean;
  change: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const locale = useAppLanguage();
  const t = useT();
  const [cooldown, setCooldown] = useState(false);
  const snapshot = state?.snapshot;
  const changes = snapshot ? compareSourceSnapshots(state?.history[0], snapshot) : [];
  return (
    <section className="space-y-3 rounded-md bg-muted/40 p-3" aria-label={t("refresh.title")}>
      <h5 className="font-medium">{t("refresh.title")}</h5>
      <p className="text-xs text-muted-foreground">{t("refresh.intro")}</p>
      <p className="text-sm">{state ? t(`refresh.${state.status}`) : t("refresh.never")}</p>
      {state && (
        <p className="text-xs">
          {t("refresh.lastAttempt")}: {new Date(state.lastAttempt).toLocaleString(locale)}
        </p>
      )}
      <p className="text-xs">
        {t("refresh.lastSuccess")}:{" "}
        {snapshot ? new Date(snapshot.observedAt).toLocaleString(locale) : t("refresh.never")}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || state?.status === "running"}
        onClick={() =>
          void change(async () => {
            const result = await refreshProjectSourceFn({
              data: {
                projectId: source.projectId,
                sourceId: source.id,
                expectedRevision: source.revision,
              },
            });
            setCooldown(result.status === "cooldown");
          })
        }
      >
        {t("refresh.refresh")}
      </Button>
      {cooldown && (
        <p role="status" className="text-xs">
          {t("refresh.cooldown")}
        </p>
      )}
      {snapshot && (
        <>
          <p className="text-xs">{t(`refresh.${snapshot.coverage}`)}</p>
          {!!snapshot.warnings?.length && (
            <p className="text-xs" role="status">
              {t("refresh.warnings")}:{" "}
              {snapshot.warnings.map((warning) => t(`refresh.warning.${warning}`)).join(" ")}
            </p>
          )}
          {!!((snapshot.conflicts?.length ?? 0) + (state?.conflictingKeys.length ?? 0)) && (
            <p className="text-xs" role="status">
              {t("refresh.conflicts")}:{" "}
              {(snapshot.conflicts?.length ?? 0) + (state?.conflictingKeys.length ?? 0)}
            </p>
          )}
          {!snapshot.facts.length && <p className="text-sm">{t("refresh.empty")}</p>}
          {snapshot.facts.map((fact) => {
            const accepted = state?.accepted[fact.key] === fact.fingerprint;
            const delta = changes.find((c) => c.key === fact.key);
            return (
              <div key={fact.key} className="space-y-1 border-t pt-2 text-sm break-words">
                <p>{fact.value}</p>
                <p className="text-xs text-muted-foreground">
                  {fact.locator}
                  {fact.market
                    ? ` · ${fact.market === "shop-default" ? t("refresh.defaultMarket") : fact.market}`
                    : ""}
                  {fact.currency ? ` · ${fact.currency}` : ""}
                </p>
                {delta && (
                  <p className="text-xs">
                    {t(`refresh.${delta.kind}`)}
                    {delta.previous ? `: ${delta.previous.value} → ${fact.value}` : ""}
                  </p>
                )}
                {fact.validUntil && (
                  <p className="text-xs">
                    {t("refresh.validUntil")}: {new Date(fact.validUntil).toLocaleString(locale)}
                  </p>
                )}
                {fact.validityUnknown && <p className="text-xs">{t("refresh.validityUnknown")}</p>}
                <p className="text-xs">{t(accepted ? "refresh.accepted" : "refresh.proposed")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || state?.status !== "ok"}
                  onClick={() =>
                    void change(() =>
                      reviewSourceFactFn({
                        data: {
                          projectId: source.projectId,
                          sourceId: source.id,
                          expectedRevision: snapshot.revision,
                          key: fact.key,
                          fingerprint: fact.fingerprint,
                          accept: !accepted,
                          previous: accepted,
                        },
                      }),
                    )
                  }
                >
                  {t(accepted ? "refresh.withdraw" : "refresh.accept")}
                </Button>
              </div>
            );
          })}
          {changes
            .filter((c) => !c.current)
            .map((delta) => (
              <p key={delta.key} className="text-sm">
                {t(`refresh.${delta.kind}`)}: {delta.previous?.value}
              </p>
            ))}
          {!!state?.reviewHistory.length && (
            <details>
              <summary className="cursor-pointer text-sm">{t("refresh.reviewHistory")}</summary>
              {state.reviewHistory.map((review, index) => (
                <p key={index} className="text-xs break-words">
                  {new Date(review.reviewedAt).toLocaleString(locale)} ·{" "}
                  {t(review.accepted ? "refresh.accepted" : "refresh.withdraw")} ·{" "}
                  {t("knowledge.ui.version")} {review.revision} ·{" "}
                  {snapshot.facts.find(
                    (f) => f.key === review.key && f.fingerprint === review.fingerprint,
                  )?.value ?? review.key}
                </p>
              ))}
            </details>
          )}
          {!!state?.history.length && (
            <details>
              <summary className="cursor-pointer text-sm">{t("refresh.history")}</summary>
              {state.history.map((old) => (
                <div key={old.revision} className="mt-2 border-t pt-2 text-xs">
                  <p>
                    {new Date(old.observedAt).toLocaleString(locale)} ·{" "}
                    {t(`refresh.${old.coverage}`)}
                  </p>
                  {old.facts.map((fact) => (
                    <p key={fact.key}>{fact.value}</p>
                  ))}
                </div>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
