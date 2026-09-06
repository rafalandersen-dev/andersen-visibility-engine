/** Stable external-store snapshots must track both state and selector closure. */
export function createSelectorCache<S, T>(equal: (previous: T, next: T) => boolean) {
  let initialized = false;
  let previousState: S;
  let previousSelector: (state: S) => T;
  let value: T;
  return {
    read(state: S, selector: (state: S) => T): T {
      if (initialized && previousState === state && previousSelector === selector) return value;
      const next = selector(state);
      if (!initialized || !equal(value, next)) value = next;
      initialized = true;
      previousState = state;
      previousSelector = selector;
      return value;
    },
  };
}
