// Shared in-page fixture state. The network guard inlined in index.html is in place before this runs.
export const fixture = (window.__panelCoverageFixture = {
  locale: "en",
  variant: "ready",
  failCoverage: false,
  datasets: {},
  /** Every server-function call, in order: reads and the one allowed synthetic write (lock). */
  calls: [],
});
