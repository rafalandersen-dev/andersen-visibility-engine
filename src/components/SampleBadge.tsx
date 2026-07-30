import { isSampleId } from "@/lib/store";

/**
 * Marks rows that came from the seeded demo workspace so nobody mistakes
 * illustrative content for their own data. Renders nothing for real rows.
 */
export function SampleBadge({ id, className = "" }: { id: string; className?: string }) {
  if (!isSampleId(id)) return null;
  return (
    <span
      title="Example data included with your trial workspace — not your own content."
      className={`inline-flex shrink-0 items-center rounded-full border border-[#ddd8cd] bg-[#f2eee4] px-1.5 py-px text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8a7a55] ${className}`}
    >
      Sample
    </span>
  );
}
