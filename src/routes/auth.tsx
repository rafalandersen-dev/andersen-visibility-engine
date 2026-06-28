import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { signupWithBrandedEmailFn, requestPasswordResetWithBrandedEmailFn } from "@/lib/auth-email.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  mode: z.enum(["login", "register", "reset"]).optional(),
  message: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Milo Growth" },
      { name: "description", content: "Sign in or create your Milo Growth account to plan your monthly business visibility workflow." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";

function modeFromParam(p: string | undefined): Mode {
  if (p === "register") return "signup";
  if (p === "reset") return "reset";
  return "signin";
}

function AuthPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(() => modeFromParam(search.mode));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(modeFromParam(search.mode));
  }, [search.mode]);

  useEffect(() => {
    if (search.message) toast.success(search.message);
    // only on first mount for the flash message
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, session, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        await signupWithBrandedEmailFn({
          data: {
            email,
            password,
            displayName: displayName || email.split("@")[0],
            redirectTo: `${window.location.origin}/app`,
          },
        });
        toast.success("Account created. Check your inbox to confirm your email.");
        setMode("signin");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back.");
        navigate({ to: "/app", replace: true });
      } else {
        await requestPasswordResetWithBrandedEmailFn({
          data: {
            email,
            redirectTo: `${window.location.origin}/reset-password`,
          },
        });
        toast.success("Password reset email sent.");
        setMode("signin");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    if (busy) return;
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: `${window.location.origin}/app`,
      });
      if (result && "error" in result && result.error) {
        throw result.error;
      }
    } catch (err) {
      const label = provider === "apple" ? "Apple" : "Google";
      const msg = err instanceof Error ? err.message : `${label} sign-in is unavailable right now.`;
      toast.error(msg);
      setBusy(false);
    }
  }


  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      {/* Visual side */}
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <Link to="/" className="block">
          <div className="font-display text-2xl">Milo Growth</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/55">
            Monthly AI growth planner
          </div>
        </Link>
        <div className="space-y-6 max-w-md">
          <div className="h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          <p className="font-display text-2xl leading-snug">
            Your monthly AI growth planner — visibility ideas, content briefs and a clear action plan.
          </p>
          <p className="text-sm text-sidebar-foreground/70">
            Sign in to your workspace or create a new account to start a project.
          </p>
        </div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/45">
          Built by Andersen Innovations
        </div>
      </aside>

      {/* Form side */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden block mb-8 text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
          <h1 className="font-display text-3xl">
            {mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Start with the Free Preview and explore the demo project."
              : mode === "reset"
              ? "We'll send a reset link to your email."
              : "Welcome back to your workspace."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {mode === "signup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Andersen"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            {mode !== "reset" ? (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signup"
                ? "Create account"
                : mode === "reset"
                ? "Send reset link"
                : "Sign in"}
            </Button>
          </form>

          {mode !== "reset" ? (
            <>
              <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                or
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={() => handleOAuth("google")} disabled={busy}>
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full bg-black text-white hover:bg-black/90 hover:text-white border-black"
                onClick={() => handleOAuth("apple")}
                disabled={busy}
              >
                <svg viewBox="0 0 384 512" className="mr-2 h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zM256.6 84.8C283 53 281 24.4 280.3 13.3 256.5 14.7 229 29.5 213.4 47.7c-17.2 19.5-27.3 43.6-25.1 71.5 25.7 2 49.1-11.2 68.3-34.4z" />
                </svg>
                Continue with Apple
              </Button>

            </>
          ) : null}

          <div className="mt-8 space-y-2 text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                <button
                  type="button"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Don't have an account? Create one
                </button>
                <div>
                  <button
                    type="button"
                    className="hover:text-foreground underline-offset-4 hover:underline"
                    onClick={() => setMode("reset")}
                  >
                    Forgot your password?
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="hover:text-foreground underline-offset-4 hover:underline"
                onClick={() => setMode("signin")}
              >
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
