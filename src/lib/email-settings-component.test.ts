import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  language: vi.fn(),
  settings: vi.fn(),
  user: { id: "owner" } as { id: string } | null,
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: h.query, useMutation: h.mutation }));
vi.mock("./auth", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("@/i18n", () => ({ useT: () => (key: string) => key, useAppLanguage: () => "sv" }));
vi.mock("./operational-email.functions", () => ({
  getOperationalEmailSettingsFn: vi.fn(),
  setOperationalEmailSettingsFn: h.settings,
  setOperationalEmailLanguageFn: h.language,
}));
import { OperationalEmailSettings } from "@/components/OperationalEmailSettings";
const data = {
  ready: false,
  addressVerification: "unavailable",
  preference: { enabled: false, locale: "de" },
  history: [],
};
const render = () => renderToStaticMarkup(createElement(OperationalEmailSettings));
beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: "owner" };
  h.query.mockReturnValue({ isSuccess: true, data });
  h.mutation.mockReturnValue({ isPending: false, mutate: vi.fn() });
});
it("offers all 24 email languages while preserving the saved language independently of the app language", () => {
  const html = render();
  expect((html.match(/<option /g) ?? []).length).toBe(24);
  expect(html).toContain('value="de" lang="de" selected=""');
  expect(html).toContain("emailSettings.note");
  expect(html).toContain("notifications.emailDisabled");
  expect(h.query.mock.calls[0][0]).toMatchObject({
    queryKey: ["operational-email-settings", "owner"],
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  expect(h.language).not.toHaveBeenCalled();
  expect(h.settings).not.toHaveBeenCalled();
});
it("routes a language-only save to its own endpoint without an enabled flag", async () => {
  render();
  const mutation = h.mutation.mock.calls[0][0];
  expect(mutation.retry).toBe(false);
  await mutation.mutationFn({ kind: "language", locale: "mt" });
  expect(h.language).toHaveBeenCalledExactlyOnceWith({ data: { locale: "mt" } });
  expect(h.settings).not.toHaveBeenCalled();
});
it("submits delivery toggles without a cached language", async () => {
  render();
  await h.mutation.mock.calls[0][0].mutationFn({ kind: "enabled", enabled: false });
  expect(h.settings).toHaveBeenCalledExactlyOnceWith({ data: { enabled: false } });
  expect(h.language).not.toHaveBeenCalled();
});
it("hides stale preferences when their current read fails", () => {
  h.query.mockReturnValue({ isError: true, data });
  const html = render();
  expect(html).toContain("notifications.emailError");
  expect(html).not.toContain("<select");
});
it("does not retain another account's preference controls after sign-out", () => {
  h.user = null;
  expect(render()).toBe("");
  expect(h.query).not.toHaveBeenCalled();
});
