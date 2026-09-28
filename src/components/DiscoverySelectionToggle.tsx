import { Check } from "@phosphor-icons/react";

/**
 * Discovery suggestion row selector: a native toggle button whose pressed state is the
 * selection state, so assistive technology can tell which suggestions "Add selected" will
 * accept. Accepted/dismissed rows are disabled and never pressed. Native button semantics
 * give Space/Enter activation for free; `type="button"` keeps it out of any form submit.
 * Same pattern as the plan board's row check (aria-pressed toggle button).
 */
export function DiscoverySelectionToggle({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={`grid h-4 w-4 place-items-center rounded-[3px] border ${
        checked ? "border-[#a86f09] bg-[#b87f12] text-white" : "border-[#8e979d] bg-white"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {checked ? <Check size={11} aria-hidden="true" /> : null}
    </button>
  );
}
