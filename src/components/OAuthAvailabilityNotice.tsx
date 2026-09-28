import { useT } from "@/i18n";
import type { OAuthAvailability } from "@/lib/mcp-oauth-availability";

/**
 * Claude.ai / Claude Desktop / Cowork custom-connector guidance, shown truthfully per deployment status:
 * full OAuth instructions only when the status call reported the flag on; an "unavailable on this deployment"
 * note with the token alternative when it reported off; a "not verified" note while loading or after a failure.
 */
export function OAuthAvailabilityNotice({ availability }: { availability: OAuthAvailability }) {
  const t = useT();
  const heading =
    availability === "enabled"
      ? t("claude.connectorsHeading")
      : availability === "disabled"
        ? t("claude.oauthUnavailableHeading")
        : t("claude.oauthUnknownHeading");
  const body =
    availability === "enabled"
      ? t("claude.connectorsBody")
      : availability === "disabled"
        ? t("claude.oauthUnavailableBody")
        : t("claude.oauthUnknownBody");
  return (
    <div
      className="mt-5 rounded-md border border-border bg-secondary/20 p-3"
      data-connectors-guidance
      data-oauth-availability={availability}
    >
      <div className="text-xs font-medium text-foreground">{heading}</div>
      {availability === "enabled" ? (
        <p className="mt-1 text-xs text-emerald-700" data-oauth-status>
          {t("claude.oauthEnabledStatus")}
        </p>
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground max-w-2xl">{body}</p>
    </div>
  );
}
