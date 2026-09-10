import { specialistRoles, type SpecialistRole } from "@/lib/specialist-team";

/** Original geometric AI portraits. Decorative: the adjacent role supplies the accessible name. */
export function SpecialistPortrait({ role }: { role: SpecialistRole }) {
  const i = specialistRoles.indexOf(role);
  const colors = [
    "#c8e3d4",
    "#e5d3ed",
    "#c9dcf3",
    "#f1d8c4",
    "#edcfdd",
    "#d5dfbb",
    "#ecdba9",
    "#c5e1e7",
    "#d8d6ed",
  ];
  return (
    <svg viewBox="0 0 96 96" className="h-16 w-16 shrink-0" aria-hidden="true" focusable="false">
      <rect width="96" height="96" rx="28" fill={colors[i]} />
      <path d="M24 94c0-21 10-29 24-29s24 8 24 29" fill="#243d37" />
      <path d="M48 16v-5" stroke="#243d37" strokeWidth="3" />
      <circle cx="48" cy="9" r="4" fill="#243d37" />
      <rect
        x="22"
        y="22"
        width="52"
        height="48"
        rx={i % 2 ? 19 : 13}
        fill="#fbf8ef"
        stroke="#243d37"
        strokeWidth="2"
      />
      <rect x="17" y="38" width="6" height="17" rx="3" fill="#243d37" />
      <rect x="73" y="38" width="6" height="17" rx="3" fill="#243d37" />
      {i % 3 === 0 ? (
        <path d="M29 42h13m12 0h13" stroke="#243d37" strokeWidth="5" strokeLinecap="round" />
      ) : i % 3 === 1 ? (
        <g fill="none" stroke="#243d37" strokeWidth="2">
          <circle cx="35" cy="42" r="8" />
          <circle cx="61" cy="42" r="8" />
          <path d="M43 42h10" />
        </g>
      ) : (
        <g fill="#243d37">
          <circle cx="35" cy="42" r="5" />
          <circle cx="61" cy="42" r="5" />
        </g>
      )}
      <path
        d={i % 2 ? "M39 57h18" : "M39 55q9 8 18 0"}
        stroke="#243d37"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M${36 + i} 81h${24 - i * 2}`}
        stroke={colors[i]}
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
