/** Bounded processing for one explicit owner action. A page mount never calls this. */
export async function processTechnicalCrawl<T extends { revision: number; status: string }>(
  step: () => Promise<T | null>,
  stopped: () => boolean,
  progress: (saved: T | null) => Promise<unknown>,
  pause: () => Promise<unknown> = () => new Promise((resolve) => setTimeout(resolve, 250)),
) {
  let previousRevision = -1;
  for (let count = 0; count < 202 && !stopped(); count++) {
    const saved = await step();
    if (stopped()) return;
    await progress(saved);
    if (!saved || !["preparing", "running"].includes(saved.status)) return;
    // Another visit may own the lease. Do not keep requesting unchanged state.
    if (saved.revision === previousRevision) return;
    previousRevision = saved.revision;
    if (!stopped()) await pause();
  }
}
