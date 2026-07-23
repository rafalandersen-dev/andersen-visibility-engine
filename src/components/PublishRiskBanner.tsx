/**
 * In-app alert for content dated soon that will NOT publish as things stand —
 * dashed calendar targets with a missing/unready draft, and armed go-lives whose
 * asset regressed after arming (the cron refuses those at fire time). Rendered
 * on the dashboard and on Plan so the owner never discovers a misfire the
 * morning after. Pure presentation: the caller computes `upcomingPublishRisks`.
 */
import { Warning } from "@phosphor-icons/react";
import type { PublishRisk } from "@/lib/calendar-schedule";
import { formatDate, formatDateTimeLocal } from "@/lib/format";
import { useT } from "@/i18n";

const MAX_LISTED = 3;

export function PublishRiskBanner({
  risks,
  onOpenRisk,
  className = "",
}: {
  risks: PublishRisk[];
  onOpenRisk: (risk: PublishRisk) => void;
  className?: string;
}) {
  const t = useT();
  if (risks.length === 0) return null;
  return (
    <div
      className={`rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <Warning size={14} weight="fill" />
        {t("calsched.banner", { count: String(risks.length) })}
      </div>
      <ul className="mt-1.5 grid gap-1">
        {risks.slice(0, MAX_LISTED).map((risk) => (
          <li key={`${risk.kind}:${risk.opportunityId ?? risk.assetId}`}>
            <button
              type="button"
              onClick={() => onOpenRisk(risk)}
              className="w-full rounded px-1 py-0.5 text-left text-xs text-amber-900/90 hover:bg-amber-500/10"
            >
              <span className="font-medium">{risk.title}</span>
              <span className="text-amber-800/80">
                {" — "}
                {risk.kind === "armed"
                  ? t("calsched.banner.armed", { when: formatDateTimeLocal(risk.when) })
                  : t("calsched.banner.target", { when: formatDate(risk.when) })}
                {" · "}
                {risk.reasons[0]}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {risks.length > MAX_LISTED ? (
        <p className="mt-1 px-1 text-[11px] text-amber-800/70">
          {t("calsched.banner.more", { count: String(risks.length - MAX_LISTED) })}
        </p>
      ) : null}
    </div>
  );
}
