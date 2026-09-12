import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useT, useAppLanguage } from "@/i18n";
import {
  getOperationalEmailSettingsFn,
  setOperationalEmailSettingsFn,
  setOperationalEmailLanguageFn,
} from "@/lib/operational-email.functions";
import {
  EMAIL_LANGUAGE_OPTIONS,
  emailLocaleSchema,
  type EmailLanguage,
} from "@/lib/email-languages";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Settings = Awaited<ReturnType<typeof getOperationalEmailSettingsFn>>;
type Change =
  | { kind: "language"; locale: EmailLanguage }
  | { kind: "enabled"; enabled: boolean; locale: EmailLanguage };

export function OperationalEmailSettings() {
  const { user } = useAuth();
  return user ? <OwnerEmailSettings key={user.id} userId={user.id} /> : null;
}

function OwnerEmailSettings({ userId }: { userId: string }) {
  const t = useT();
  const [uncertain, setUncertain] = useState(false);
  const [revision, setRevision] = useState(0);
  const query = useQuery({
    queryKey: ["operational-email-settings", userId],
    queryFn: () => getOperationalEmailSettingsFn(),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const refresh = async () => {
    const result = await query.refetch();
    if (result.isSuccess) {
      setUncertain(false);
      setRevision((n) => n + 1);
    }
    return result.isSuccess;
  };
  const save = useMutation({
    mutationFn: (change: Change) =>
      change.kind === "language"
        ? setOperationalEmailLanguageFn({ data: { locale: change.locale } })
        : setOperationalEmailSettingsFn({
            data: { enabled: change.enabled, locale: change.locale },
          }),
    retry: false,
    onSuccess: async () => {
      if (await refresh()) toast.success(t("emailSettings.saved"));
    },
    onError: () => toast.error(t("emailSettings.uncertain")),
  });
  const locked = uncertain || save.isPending || query.isFetching || !query.isSuccess;
  const submit = (change: Change) => {
    if (locked) return;
    setUncertain(true);
    save.mutate(change);
  };
  return (
    <section
      className="rounded-2xl border bg-card p-5 sm:p-6"
      aria-labelledby="email-settings-title"
    >
      <h2 id="email-settings-title" className="font-semibold">
        {t("notifications.emailTitle")}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("notifications.emailDescription")}</p>
      {query.isPending && (
        <p role="status" className="mt-3 text-sm">
          {t("notifications.loading")}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="mt-3 text-sm">
          {t("notifications.emailError")}
        </p>
      )}
      {uncertain && !save.isPending && (
        <p role="alert" className="mt-3 text-sm">
          {t("emailSettings.uncertain")}
        </p>
      )}
      {query.isSuccess && (
        <EmailForm key={revision} settings={query.data} locked={locked} submit={submit} />
      )}
      <Button
        type="button"
        className="mt-3"
        variant="ghost"
        disabled={save.isPending || query.isFetching}
        onClick={() => void refresh()}
      >
        {t("emailSettings.reload")}
      </Button>
    </section>
  );
}

function EmailForm({
  settings,
  locked,
  submit,
}: {
  settings: Settings;
  locked: boolean;
  submit: (change: Change) => void;
}) {
  const t = useT(),
    appLocale = useAppLanguage();
  const [language, setLanguage] = useState(settings.preference.locale);
  return (
    <>
      {!settings.ready && <p className="mt-3 text-sm">{t("notifications.emailDisabled")}</p>}
      {settings.addressVerification !== "verified" && (
        <p className="mt-3 text-sm" role="status">
          {t(
            settings.addressVerification === "unverified"
              ? "notifications.emailAddressUnverified"
              : "notifications.emailAddressUnavailable",
          )}
        </p>
      )}
      <div className="mt-4 space-y-2">
        <label htmlFor="operational-email-language" className="block text-sm font-medium">
          {t("emailSettings.language")}
        </label>
        <p className="text-xs text-muted-foreground">{t("emailSettings.note")}</p>
        <select
          id="operational-email-language"
          className="max-w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={language}
          disabled={locked}
          onChange={(event) => setLanguage(emailLocaleSchema.parse(event.target.value))}
        >
          {EMAIL_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} lang={option.value}>
              {option.native}
            </option>
          ))}
        </select>
        <Button
          type="button"
          className="ml-2"
          variant="outline"
          disabled={locked || language === settings.preference.locale}
          onClick={() => submit({ kind: "language", locale: language })}
        >
          {t("emailSettings.save")}
        </Button>
      </div>
      <Button
        type="button"
        className="mt-4"
        variant="outline"
        disabled={
          locked ||
          ((!settings.ready || settings.addressVerification !== "verified") &&
            !settings.preference.enabled)
        }
        onClick={() =>
          submit({
            kind: "enabled",
            enabled: !settings.preference.enabled,
            locale: settings.preference.locale,
          })
        }
      >
        {t(
          settings.preference.enabled ? "notifications.emailDisable" : "notifications.emailEnable",
        )}
      </Button>
      {settings.history.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer">{t("notifications.emailHistory")}</summary>
          <ul className="mt-3 space-y-2">
            {settings.history.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2">
                <time dateTime={item.created_at}>
                  {new Intl.DateTimeFormat(appLocale, {
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
  );
}
