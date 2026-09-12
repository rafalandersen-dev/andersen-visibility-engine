export const DIGEST_KINDS = [
  "approval_due",
  "publication_failed",
  "manual_overdue",
  "cadence_gap",
  "scheduler_recovery",
  "generation_capacity_low",
  "generation_capacity_unavailable",
] as const;
export type DigestCopy = {
  subject: string;
  intro: string;
  open: string;
  footer: string;
  kinds: Record<(typeof DIGEST_KINDS)[number], string>;
};
export type InvitationCopy = {
  subject: string;
  intro: string;
  instruction: string;
  open: string;
  footer: string;
  roles: Record<"viewer" | "editor" | "reviewer", string>;
};
export type EmailCopy = { digest: DigestCopy; invitation: InvitationCopy };
