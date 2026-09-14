export type PasswordResetStatus = "checking" | "ready" | "invalid";
interface SessionSource {
  getSession(): Promise<{ data: { session: unknown | null } }>;
  onAuthStateChange(callback: (event: string, session: unknown | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
}
/** Observe only. Never exchanges credentials, updates a password or signs out.
 * Existing authenticated sessions remain eligible, matching the reset page.
 */
export function observePasswordResetSession(
  auth: SessionSource,
  update: (status: PasswordResetStatus) => void,
): () => void {
  let active = true;
  let revision = 0;
  const finish = (status: PasswordResetStatus) => {
    if (!active) return;
    clearTimeout(timer);
    update(status);
  };
  const check = async (final: boolean) => {
    const expected = revision;
    try {
      const { data } = await auth.getSession();
      if (!active || expected !== revision) return;
      if (data.session) finish("ready");
      else if (final) finish("invalid");
    } catch {
      if (active && expected === revision && final) finish("invalid");
      // Initial transport failure still receives the delayed recheck.
    }
  };
  const timer = setTimeout(() => {
    void check(true);
  }, 8000);
  update("checking");
  const { data } = auth.onAuthStateChange((event, session) => {
    if (!active) return;
    if (event === "SIGNED_OUT") {
      revision++;
      finish("invalid");
    } else if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
      revision++;
      finish("ready");
    }
  });
  void check(false);
  return () => {
    active = false;
    clearTimeout(timer);
    data.subscription.unsubscribe();
  };
}
