/** Coordinates normal UI fan-out without relaxing server admission.
 * Cancellation drops waiting work; active requests retain their slot until settled. */
export function createTeamRequestQueue() {
  let active = 0;
  const pending: Array<() => void> = [];
  const drain = () => {
    while (active < 2 && pending.length) pending.shift()!();
  };
  return function enqueue<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Request cancelled."));
    if (pending.length >= 100)
      return Promise.reject(new Error("Please wait for current project requests."));
    return new Promise<T>((resolve, reject) => {
      const cancel = () => {
        const index = pending.indexOf(start);
        if (index < 0) return;
        pending.splice(index, 1);
        reject(signal?.reason ?? new Error("Request cancelled."));
      };
      const start = () => {
        signal?.removeEventListener("abort", cancel);
        if (signal?.aborted) {
          reject(signal.reason ?? new Error("Request cancelled."));
          return;
        }
        active++;
        Promise.resolve()
          .then(() => {
            if (signal?.aborted) throw signal.reason ?? new Error("Request cancelled.");
            return work();
          })
          .then(resolve, reject)
          .finally(() => {
            active--;
            drain();
          });
      };
      pending.push(start);
      signal?.addEventListener("abort", cancel, { once: true });
      drain();
    });
  };
}
// React Query calls share one scheduler per browser module instance.
export const runTeamRequest = createTeamRequestQueue();
