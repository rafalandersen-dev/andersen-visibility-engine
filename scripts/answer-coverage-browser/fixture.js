// Shared in-page fixture state. The network guard inlined in index.html is in place before this runs.
export const fixture = (window.__coverageFixture = {
  actorId: "00000000-0000-4000-8000-0000000000a1",
  locale: "en",
  variant: "ready",
  datasets: {},
  invoked: [],
});
