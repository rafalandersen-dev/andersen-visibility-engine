import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useT } from "@/i18n";
import { useAuth } from "@/lib/auth";
import { teachProjectKnowledgeFn } from "@/lib/project-knowledge.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Deliberate owner instruction only: never extract a global rule from ordinary article edits. */
export function EditorialLesson({ projectId, assetId }: { projectId: string; assetId: string }) {
  const { user } = useAuth();
  return user ? (
    <LessonForm
      key={`${user.id}:${projectId}:${assetId}`}
      projectId={projectId}
      assetId={assetId}
    />
  ) : null;
}
function LessonForm({ projectId, assetId }: { projectId: string; assetId: string }) {
  const t = useT();
  const [value, setValue] = useState("");
  const [target, setTarget] = useState<"text" | "visual" | "both">("text");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "unknown">("idle");
  return (
    <details className="rounded-lg border border-border p-4">
      <summary className="cursor-pointer font-medium">{t("team.lesson.title")}</summary>
      <p className="my-3 text-sm text-muted-foreground">{t("team.lesson.help")}</p>
      <label className="block text-sm space-y-1">
        {t("team.lesson.rule")}
        <Textarea
          value={value}
          maxLength={2000}
          disabled={status !== "idle"}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <label className="block my-3 text-sm">
        {t("team.lesson.target")}
        <select
          className="block w-full rounded-md border bg-background p-2"
          value={target}
          disabled={status !== "idle"}
          onChange={(e) => setTarget(e.target.value as typeof target)}
        >
          {(["text", "visual", "both"] as const).map((key) => (
            <option key={key} value={key}>
              {t(`team.lesson.${key}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3 items-center">
        <Button
          type="button"
          disabled={!value.trim() || status !== "idle"}
          onClick={async () => {
            setStatus("saving");
            try {
              await teachProjectKnowledgeFn({
                data: {
                  projectId,
                  fields: {
                    key: `lesson.editor.${crypto.randomUUID()}`,
                    category: "lesson",
                    appliesTo: target,
                    value: value.trim(),
                    locator: `editor:${assetId}`,
                  },
                },
              });
              setStatus("saved");
            } catch {
              setStatus("unknown");
            }
          }}
        >
          {t("team.lesson.save")}
        </Button>
        <Link className="text-sm underline" to="/app/specialists" search={{ knowledge: true }}>
          {t("team.lesson.manage")}
        </Link>
      </div>
      {status === "saved" && (
        <p role="status" className="mt-3 text-sm">
          {t("team.lesson.saved")}
        </p>
      )}
      {status === "unknown" && (
        <p role="alert" className="mt-3 text-sm">
          {t("team.lesson.unknown")}
        </p>
      )}
    </details>
  );
}
