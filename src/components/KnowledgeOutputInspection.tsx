import { useEffect, useRef, useState } from "react";
import { readKnowledgeOutputReviewFn } from "@/lib/project-knowledge.functions";
import { Button } from "./ui/button";
import { useT } from "@/i18n";

/** Read-only, ephemeral inspection. Never stored in editable workspace data. */
export function KnowledgeOutputInspection({
  projectId,
  assetId,
}: {
  projectId: string;
  assetId: string;
}) {
  const t = useT();
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof readKnowledgeOutputReviewFn>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
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
    try {
      const result = await readKnowledgeOutputReviewFn({ data: { projectId, assetId } });
      if (id === request.current) setSnapshot(result);
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
            {new Date(snapshot.checkedAt).toLocaleString()}
          </p>
          <h6 className="font-medium">{snapshot.title}</h6>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm">
            {snapshot.markdown}
          </pre>
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
                      {new Date(fact.record.validUntil).toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <p>{t("knowledge.inspect.unavailable")}</p>
              )}
            </div>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => setSnapshot(null)}>
            {t("knowledge.inspect.close")}
          </Button>
        </div>
      )}
    </div>
  );
}
