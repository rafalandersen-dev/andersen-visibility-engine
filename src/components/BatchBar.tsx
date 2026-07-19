/**
 * Bulk actions for selected board cards. Deliberately only the inert, governable
 * moves — Prioritise, Set target date, Archive — each guarded per item by
 * canTransitionOpportunity with a per-item outcome toast. There is NO bulk arm,
 * publish or delete: nothing here can push content to a customer's live site.
 */
import { Check, CalendarPlus, Archive, X } from "lucide-react";

export function BatchBar({
  count,
  onPrioritise,
  onSetDate,
  onArchive,
  onClear,
}: {
  count: number;
  onPrioritise: () => void;
  onSetDate: () => void;
  onArchive: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[#ddd8cd] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(30,34,32,.16)]">
      <span className="px-1 text-[11px] font-medium text-[#3a3a3a]">{count} selected</span>
      <span className="mx-0.5 h-4 w-px bg-[#e4ded4]" />
      <BatchButton icon={<Check className="h-3.5 w-3.5" />} label="Prioritise" onClick={onPrioritise} />
      <BatchButton
        icon={<CalendarPlus className="h-3.5 w-3.5" />}
        label="Set target date"
        onClick={onSetDate}
      />
      <BatchButton icon={<Archive className="h-3.5 w-3.5" />} label="Archive" onClick={onArchive} />
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="ml-0.5 grid h-7 w-7 place-items-center rounded-full text-[#65717e] hover:bg-[#f2ede3]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function BatchButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border border-[#e4ded4] bg-[#faf7f0] px-2.5 py-1 text-[10px] font-medium text-[#4f5b68] hover:border-[#c2b7a7] hover:bg-[#f2ede3]"
    >
      {icon}
      {label}
    </button>
  );
}
