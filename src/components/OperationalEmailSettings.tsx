import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import {
  getOperationalEmailSettingsFn,
  setOperationalEmailSettingsFn,
} from "@/lib/operational-email.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
export function OperationalEmailSettings() {
  const t = useT(),
    locale = useAppLanguage(),
    { user } = useAuth(),
    client = useQueryClient();
  const key = ["operational-email-settings", user?.id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getOperationalEmailSettingsFn(),
    enabled: !!user,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) => setOperationalEmailSettingsFn({ data: { enabled, locale } }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: () => toast.error(t("notifications.emailSaveError")),
  });
  return (
    <section
      className="rounded-2xl border bg-card p-5 sm:p-6"
      aria-labelledby="email-settings-title"
    >
      <h2 id="email-settings-title" className="font-semibold">
        {t("notifications.emailTitle")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("notifications.emailDescription")}</p>
      {query.isError && (
        <p role="alert" className="mt-3 text-sm">
          {t("notifications.emailError")}
        </p>
      )}
      {query.isPending && (
        <p role="status" className="mt-3 text-sm">
          {t("notifications.loading")}
        </p>
      )}
      {query.data && (
        <>
          {!query.data.ready && <p className="mt-3 text-sm">{t("notifications.emailDisabled")}</p>}
          <Button
            className="mt-4"
            variant="outline"
            disabled={save.isPending || (!query.data.ready && !query.data.preference.enabled)}
            onClick={() => save.mutate(!query.data!.preference.enabled)}
          >
            {t(
              query.data.preference.enabled
                ? "notifications.emailDisable"
                : "notifications.emailEnable",
            )}
          </Button>
          {query.data.history.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer">{t("notifications.emailHistory")}</summary>
              <ul className="mt-3 space-y-2">
                {query.data.history.map((item) => (
                  <li key={item.id} className="flex flex-wrap justify-between gap-2">
                    <time dateTime={item.created_at}>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(item.created_at))}
                    </time>
                    <span>{t(`notifications.emailStatus.${item.status}`)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
