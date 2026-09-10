import { AlertTriangle, Check } from "lucide-react";
import { useT } from "@/i18n";
import type { ChecklistItem } from "@/lib/types";
import type { schemaConnectorCapability } from "@/lib/schema-delivery";

export function PublishingChecklist({
  items,
  schema,
}: {
  items: ChecklistItem[];
  schema: ReturnType<typeof schemaConnectorCapability>;
}) {
  const t = useT();
  const blockers = items.filter((i) => i.blocking && !i.passed);
  const warnings = items.filter((i) => !i.blocking && !i.passed);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {blockers.length ? (
          <>
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
            {t("publishingFidelity.blocked", { count: blockers.length })}
          </>
        ) : (
          <>
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
            {t("publishingFidelity.clear")}
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("publishingFidelity.gates")}</p>
      {blockers.length ? (
        <ul className="space-y-1.5">
          {blockers.map((b) => (
            <li
              key={b.key}
              className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs"
            >
              <div className="font-medium text-foreground">{b.label}</div>
              {b.detail ? <p className="mt-0.5 text-muted-foreground">{b.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {warnings.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t("publishingFidelity.warnings", { count: warnings.length })}
          </summary>
          <ul className="mt-1.5 space-y-1">
            {warnings.map((w) => (
              <li key={w.key} className="text-muted-foreground">
                <span className="text-foreground/80">{w.label}</span>
                {w.detail ? ` — ${w.detail}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {t(schema.generated ? "publishingFidelity.generated" : "publishingFidelity.empty")}{" "}
        {schema.generated &&
          t(
            schema.connector === "none"
              ? "publishingFidelity.none"
              : schema.connector === "custom"
                ? "publishingFidelity.custom"
                : "publishingFidelity.planned",
            { connector: schema.connector },
          )}
        {schema.generated && schema.connector !== "custom" && (
          <> {t("publishingFidelity.unverified")}</>
        )}
      </p>
    </div>
  );
}
