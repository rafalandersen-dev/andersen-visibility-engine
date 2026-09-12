import { isSampleId } from "@/lib/store";
import { useT } from "@/i18n";

/**
 * Marks rows that came from the seeded demo workspace so nobody mistakes
 * illustrative content for their own data. Renders nothing for real rows.
 */
export function SampleBadge({ id, className = "" }: { id: string; className?: string }) {
  const t = useT();
  if (!isSampleId(id)) return null;
  return (
    <span
      title={t("planScreen.sample.note", { label: t("planScreen.sample.label") })}
      className={`inline-flex shrink-0 items-center rounded-full border border-[#ddd8cd] bg-[#f2eee4] px-1.5 py-px text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8a7a55] ${className}`}
    >
      {t("planScreen.sample.label")}
    </span>
  );
}
