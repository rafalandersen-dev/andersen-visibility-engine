import { runTeamRequest } from "@/lib/team-request-queue";
import { useState } from "react";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { Button } from "./ui/button";
import { teamDraftFields } from "@/lib/project-team";
import { saveProjectTeamDraftFn } from "@/lib/project-team.functions";
import { toast } from "sonner";
type Fields = z.infer<typeof teamDraftFields>;
export function ProjectTeamDraftEditor({
  ownerId,
  projectId,
  assetId,
  hash,
  membershipRevision,
  fields,
}: {
  ownerId: string;
  projectId: string;
  assetId: string;
  hash: string;
  membershipRevision: number;
  fields: Fields;
}) {
  const t = useT();
  const { user } = useAuth();
  const client = useQueryClient();
  // Keep a fixed base while typing. Background refetches must never overwrite
  // unsaved edits or silently rebase them onto someone else's saved content.
  const [base, setBase] = useState({ hash, membershipRevision, fields: structuredClone(fields) });
  const [draft, setDraft] = useState<Fields>(() => structuredClone(fields));
  const [editId, setEditId] = useState(() => crypto.randomUUID());
  const dirty = JSON.stringify(draft) !== JSON.stringify(base.fields);
  const changed = base.hash !== hash || base.membershipRevision !== membershipRevision;
  const update = (next: Fields) => {
    setDraft(next);
    setEditId(crypto.randomUUID());
  };
  const mutation = useMutation({
    mutationFn: () =>
      runTeamRequest(() =>
        saveProjectTeamDraftFn({
          data: {
            ownerId,
            projectId,
            assetId,
            editId,
            expectedHash: base.hash,
            expectedMembershipRevision: base.membershipRevision,
            fields: draft,
          },
        }),
      ),
    onSuccess: (result) => {
      setBase({
        hash: result.draftHash,
        membershipRevision: base.membershipRevision,
        fields: structuredClone(draft),
      });
      setEditId(crypto.randomUUID());
      toast.success(t("collaboration.draftSaved"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
    onError: () => {
      toast.error(t("collaboration.editError"));
      void client.invalidateQueries({ queryKey: ["project-teams", user?.id] });
    },
  });
  const scalar = (
    key: "title" | "h1" | "metaTitle" | "metaDescription" | "markdown" | "cta",
    maxLength: number,
    rows = 2,
  ) => (
    <label key={key} className="block text-sm">
      {t(`collaboration.field.${key}`)}
      <textarea
        required={key === "title"}
        maxLength={maxLength}
        rows={rows}
        value={draft[key]}
        disabled={mutation.isPending}
        onChange={(e) => update({ ...draft, [key]: e.target.value })}
        className="mt-1 w-full rounded-md border bg-background p-3"
      />
    </label>
  );
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-semibold">{t("collaboration.editDraft")}</summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty && !changed && !mutation.isPending) mutation.mutate();
        }}
      >
        <p className="text-sm text-muted-foreground">{t("collaboration.editHelp")}</p>
        {changed && (
          <div role="alert" className="space-y-2 rounded-lg border p-3">
            <p>{t("collaboration.editConflict")}</p>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                setDraft(structuredClone(fields));
                setBase({ hash, membershipRevision, fields: structuredClone(fields) });
                setEditId(crypto.randomUUID());
              }}
            >
              {t("collaboration.loadLatest")}
            </Button>
          </div>
        )}
        {scalar("title", 1000)}
        {scalar("h1", 1000)}
        {scalar("metaTitle", 1000)}
        {scalar("metaDescription", 4000, 3)}
        {scalar("markdown", 1000000, 18)}
        {scalar("cta", 16000, 3)}
        <label className="block text-sm">
          {t("collaboration.field.outline")}
          <textarea
            rows={5}
            value={draft.outline.join("\n")}
            disabled={mutation.isPending}
            onChange={(e) => update({ ...draft, outline: e.target.value.split("\n") })}
            className="mt-1 w-full rounded-md border bg-background p-3"
          />
        </label>
        <fieldset className="space-y-3">
          <legend>{t("collaboration.field.faq")}</legend>
          {draft.faq.map((item, index) => (
            <div key={index} className="space-y-2 rounded-lg border p-3">
              <label className="block text-sm">
                {t("collaboration.question")}
                <input
                  maxLength={1000}
                  value={item.q}
                  disabled={mutation.isPending}
                  onChange={(e) =>
                    update({
                      ...draft,
                      faq: draft.faq.map((f, i) => (i === index ? { ...f, q: e.target.value } : f)),
                    })
                  }
                  className="mt-1 w-full rounded-md border bg-background p-2"
                />
              </label>
              <label className="block text-sm">
                {t("collaboration.answer")}
                <textarea
                  maxLength={16000}
                  rows={3}
                  value={item.a}
                  disabled={mutation.isPending}
                  onChange={(e) =>
                    update({
                      ...draft,
                      faq: draft.faq.map((f, i) => (i === index ? { ...f, a: e.target.value } : f)),
                    })
                  }
                  className="mt-1 w-full rounded-md border bg-background p-2"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => update({ ...draft, faq: draft.faq.filter((_, i) => i !== index) })}
              >
                {t("collaboration.removeQuestion")}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending || draft.faq.length >= 100}
            onClick={() => update({ ...draft, faq: [...draft.faq, { q: "", a: "" }] })}
          >
            {t("collaboration.addQuestion")}
          </Button>
        </fieldset>
        <Button
          type="submit"
          disabled={
            mutation.isPending || changed || !dirty || !teamDraftFields.safeParse(draft).success
          }
        >
          {t("collaboration.saveDraft")}
        </Button>
      </form>
    </details>
  );
}
