import { useEffect, useRef, useState } from "react";
import {
  readKnowledgeOutputReviewFn,
  readKnowledgeOutputReviewHistoryFn,
  saveKnowledgeOutputReviewFn,
  withdrawKnowledgeOutputReviewFn,
} from "@/lib/project-knowledge.functions";
import { Button } from "./ui/button";
import { useAppLanguage, useT } from "@/i18n";

/** Ephemeral inspection; authority and history stay on the server. */
export function KnowledgeOutputInspection({
  projectId,
  assetId,
  onReviewChange,
}: {
  projectId: string;
  assetId: string;
  onReviewChange?: () => void;
}) {
  const locale = useAppLanguage();
  const t = useT();
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof readKnowledgeOutputReviewFn>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof readKnowledgeOutputReviewHistoryFn>>
  >([]);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const reviewId = useRef<string | null>(null);
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function inspect() {
    const id = ++request.current;
    setBusy(true);
    setFailed(false);
    setSnapshot(null);
    setAcknowledged([]);
    setConfirmed(false);
    setSaved(false);
    setHistory([]);
    reviewId.current = null;
    try {
      const [result, reviews] = await Promise.allSettled([
        readKnowledgeOutputReviewFn({ data: { projectId, assetId } }),
        readKnowledgeOutputReviewHistoryFn({ data: { projectId, assetId } }),
      ]);
      if (id === request.current) {
        if (result.status === "fulfilled") setSnapshot(result.value);
        if (reviews.status === "fulfilled") setHistory(reviews.value);
        if (result.status === "rejected" || reviews.status === "rejected") setFailed(true);
      }
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  async function mutate(withdrawId?: string) {
    if (!snapshot && !withdrawId) return;
    const id = request.current;
    setBusy(true);
    setFailed(false);
    setSaved(false);
    try {
      if (withdrawId)
        await withdrawKnowledgeOutputReviewFn({
          data: { projectId, assetId, reviewId: withdrawId },
        });
      else if (snapshot) {
        reviewId.current ??= crypto.randomUUID();
        await saveKnowledgeOutputReviewFn({
          data: {
            projectId,
            assetId,
            review: {
              reviewId: reviewId.current,
              expectedVersion: snapshot.version,
              expectedContext: snapshot.contextHash,
              reviewedFacts: acknowledged,
              confirmDeliverable: true,
            },
          },
        });
      }
      const reviews = await readKnowledgeOutputReviewHistoryFn({ data: { projectId, assetId } });
      if (id === request.current) {
        setHistory(reviews);
        setSaved(!withdrawId);
        if (withdrawId) {
          reviewId.current = null;
          setAcknowledged([]);
          setConfirmed(false);
        }
        onReviewChange?.();
      }
    } catch {
      if (id === request.current) setFailed(true);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void inspect()}
      >
        {t("knowledge.inspect.open")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm">
          {t("knowledge.inspect.failed")}
        </p>
      )}
      {snapshot && (
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm">{t("knowledge.inspect.help")}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(snapshot.checkedAt).toLocaleString(locale)}
          </p>
          <h6 className="font-medium">{snapshot.title}</h6>
          <p className="text-sm">{snapshot.deliverable.metaTitle}</p>
          <p className="text-sm">{snapshot.deliverable.metaDescription}</p>
          <p className="text-xs">/{snapshot.deliverable.slug}</p>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
            {snapshot.deliverable.markdown}
          </pre>
          <iframe
            title={t("knowledge.review.preview")}
            className="h-96 w-full rounded border bg-white"
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>body{font:16px system-ui;line-height:1.6;padding:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${snapshot.deliverable.html}`}
          />
          {snapshot.forgotten && <p role="status">{t("knowledge.inspect.forgotten")}</p>}
          {snapshot.facts.map((fact, index) => (
            <div key={index} className="border-t pt-2 text-sm">
              <p>
                {fact.kind === "image" ? t("knowledge.inspect.image") : t("knowledge.inspect.text")}{" "}
                · {fact.outputId}
              </p>
              <p>
                {t("knowledge.inspect.original")}: {fact.reference.recordRevision} /{" "}
                {fact.reference.sourceRevision}
              </p>
              {fact.record && fact.source ? (
                <>
                  <p className="font-medium">
                    {fact.record.key} · {fact.source.label}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{fact.record.value}</p>
                  <p>
                    {t("knowledge.inspect.current")}: {fact.record.revision} /{" "}
                    {fact.source.revision}
                  </p>
                  <p>
                    {t(`knowledge.status.${fact.record.status}`)} ·{" "}
                    {t(`knowledge.status.${fact.source.status}`)}
                  </p>
                  {fact.record.validUntil && (
                    <p>
                      {t("knowledge.inspect.until")}:{" "}
                      {new Date(fact.record.validUntil).toLocaleString(locale)}
                    </p>
                  )}
                </>
              ) : (
                <p>{t("knowledge.inspect.unavailable")}</p>
              )}
              {snapshot.reviewable && (
                <label className="flex gap-2 pt-2">
                  <input
                    type="checkbox"
                    disabled={busy || saved}
                    checked={acknowledged.includes(fact.reviewKey)}
                    onChange={(e) =>
                      setAcknowledged((current) =>
                        e.target.checked
                          ? [...current, fact.reviewKey]
                          : current.filter((key) => key !== fact.reviewKey),
                      )
                    }
                  />
                  {t("knowledge.review.fact")}
                </label>
              )}
            </div>
          ))}
          {snapshot.reviewable ? (
            <div className="space-y-2">
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy || saved}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {t("knowledge.review.confirm")}
              </label>
              <Button
                type="button"
                size="sm"
                disabled={
                  busy || saved || !confirmed || acknowledged.length !== snapshot.facts.length
                }
                onClick={() => void mutate()}
              >
                {t("knowledge.review.save")}
              </Button>
            </div>
          ) : (
            <p className="text-sm">{t("knowledge.review.ineligible")}</p>
          )}
          {saved && <p role="status">{t("knowledge.review.saved")}</p>}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              request.current++;
              setSnapshot(null);
            }}
          >
            {t("knowledge.inspect.close")}
          </Button>
        </div>
      )}
      {history.length > 0 && (
        <div className="space-y-2 border-t pt-2">
          <h6 className="font-medium">{t("knowledge.review.history")}</h6>
          <p className="text-xs">{t("knowledge.review.historyHelp")}</p>
          {history.map((row) => (
            <div key={row.reviewId} className="text-sm">
              {new Date(row.reviewedAt).toLocaleString(locale)} ·{" "}
              {t(row.active ? "knowledge.review.recorded" : "knowledge.review.withdrawn")}
              {row.active && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void mutate(row.reviewId)}
                >
                  {t("knowledge.review.withdraw")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
