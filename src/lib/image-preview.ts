/** Per-mounted-view refresh state. Never cache signed URLs across login sessions. */
export const PRIVATE_IMAGE_REFRESH_MS = 45 * 60_000;
export const PRIVATE_IMAGE_RETRY_MS = 30_000;
export function createImagePreviewSession(options: {
  load: () => Promise<string>;
  apply: (url: string) => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let active = true,
    inFlight = false;
  let lastAttempt: number | undefined, lastSuccess: number | undefined;
  return {
    async refresh(force = false) {
      const at = now();
      if (
        !active ||
        inFlight ||
        (lastAttempt !== undefined && at - lastAttempt < PRIVATE_IMAGE_RETRY_MS)
      )
        return;
      if (!force && lastSuccess !== undefined && at - lastSuccess < PRIVATE_IMAGE_REFRESH_MS)
        return;
      inFlight = true;
      lastAttempt = at;
      try {
        const url = await options.load();
        if (active && url) {
          lastSuccess = now();
          options.apply(url);
        }
      } catch {
        // A broken preview is not a content mutation or an approval failure.
        // Focus, the next refresh interval or an image error may retry later.
      } finally {
        inFlight = false;
      }
    },
    dispose() {
      active = false;
    },
  };
}
