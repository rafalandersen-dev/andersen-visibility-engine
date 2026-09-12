import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/store", () => ({ useStore: vi.fn() }));
import { getUiLocaleOverride, setUiLocaleOverride } from "./index";
import { UI_LANGUAGE_CODES } from "./catalogs";

const storage = new Map<string, string>();
const reload = vi.fn();
const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
const removeItem = vi.fn((key: string) => storage.delete(key));

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  setItem.mockImplementation((key, value) => storage.set(key, value));
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem, removeItem },
    location: { reload },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("authentication language changes preserve the current page", () => {
  it.each(UI_LANGUAGE_CODES)("stores %s without reloading the form", (language) => {
    setUiLocaleOverride(language, { reload: false });
    expect(getUiLocaleOverride()).toBe(language);
    expect([...storage]).toEqual([["milo.uiLocale", language]]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("retains the existing reload default for workspace callers", () => {
    setUiLocaleOverride("sv");
    expect(getUiLocaleOverride()).toBe("sv");
    expect(reload).toHaveBeenCalledOnce();
    setUiLocaleOverride(null);
    expect(getUiLocaleOverride()).toBeNull();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not persist unsupported or staged language values", () => {
    for (const value of ["fr", "de", "en-US", "__proto__", ""])
      setUiLocaleOverride(value as "en", { reload: false });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload or throw when device storage is unavailable", () => {
    setItem.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(() => setUiLocaleOverride("pl", { reload: false })).not.toThrow();
    expect(reload).not.toHaveBeenCalled();
  });
});
