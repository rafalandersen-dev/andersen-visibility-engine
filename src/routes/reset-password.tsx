import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuthLanguage } from "@/hooks/use-auth-language";
import { AuthLanguagePicker } from "@/components/AuthLanguagePicker";
import {
  observePasswordResetSession,
  type PasswordResetStatus,
} from "@/lib/password-reset-session";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Milo Growth" },
      { name: "description", content: "Choose a new password for your Milo Growth account." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { language, chooseLanguage, t } = useAuthLanguage();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PasswordResetStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => observePasswordResetSession(supabase.auth, setStatus), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || status !== "ready") return;
    if (password.length < 8) {
      toast.error(t("authScreen.passwordShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("authScreen.passwordMismatch"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("authScreen.passwordUpdated"));
      navigate({ to: "/app", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("authScreen.passwordFailed");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      lang={language}
      className="min-h-screen flex items-center justify-center bg-background px-6 py-12"
    >
      <div className="w-full max-w-md">
        <AuthLanguagePicker language={language} onChange={chooseLanguage} disabled={busy} />
        <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground">
          ← {t("authScreen.home")}
        </Link>
        <h1 className="mt-6 font-display text-3xl">{t("authScreen.newHeading")}</h1>

        {status === "checking" ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("authScreen.checking")}</p>
        ) : status === "invalid" ? (
          <div className="mt-6 rounded-lg border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{t("authScreen.invalid")}</p>
            <div className="mt-5">
              <Button asChild>
                <Link to="/auth" search={{ mode: "reset" }}>
                  {t("authScreen.requestNew")}
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{t("authScreen.newHelp")}</p>
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">{t("authScreen.newPassword")}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("authScreen.passwordHint")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">{t("authScreen.confirmPassword")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t("authScreen.repeatPassword")}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {t(busy ? "authScreen.updating" : "authScreen.updatePassword")}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
