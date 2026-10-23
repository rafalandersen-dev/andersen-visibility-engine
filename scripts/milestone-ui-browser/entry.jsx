import React, { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fixture, subscribe, notify, reset, record } from "./fixture.js";
import { emit } from "./store.js";
import { Toaster } from "./toasts.jsx";
import { Route as PricingRoute } from "@/routes/pricing";
import { Route as SetupRoute } from "@/routes/_authenticated/app.setup";
import { Route as TodayRoute } from "@/routes/_authenticated/app.today";
import { Route as EditorRoute } from "@/routes/_authenticated/app.editor";
import { Route as AnalyticsRoute } from "@/routes/_authenticated/app.analytics";
fixture.storeEmit = emit;
const components = {
  pricing: PricingRoute.options.component,
  setup: SetupRoute.options.component,
  today: TodayRoute.options.component,
  editor: EditorRoute.options.component,
  analytics: AnalyticsRoute.options.component,
};
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});
class Boundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    fixture.errors.push(String(error.stack || error));
    notify();
  }
  render() {
    return this.state.error ? (
      <pre className="fixture-error" role="alert">
        {String(this.state.error.stack || this.state.error)}
      </pre>
    ) : (
      this.props.children
    );
  }
}
function FixtureLog() {
  useSyncExternalStore(
    subscribe,
    () => fixture.revision,
    () => fixture.revision,
  );
  return (
    <details>
      <summary>
        Intent log ({fixture.events.length}) · errors {fixture.errors.length} · blocked requests{" "}
        {fixture.blockedRequests.length}
      </summary>
      <pre className="fixture-log" id="fixture-log">
        {JSON.stringify(
          {
            events: fixture.events.slice(-15),
            errors: fixture.errors,
            blockedRequests: fixture.blockedRequests,
            approvalMode: fixture.approvalMode,
            approvals: fixture.approvals,
            language: fixture.state.projects[0] && {
              legacy: fixture.state.projects[0].primaryLanguage,
              effective: fixture.state.projects[0].primaryContentLanguage,
            },
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}
function App() {
  // Diagnostics must not rerender the product tree: a read logs an event, and a
  // new product render can legitimately cause an effect with changed inputs.
  useSyncExternalStore(
    subscribe,
    () => fixture.routeRevision,
    () => fixture.routeRevision,
  );
  const [mount, setMount] = useState(0);
  const Screen = components[fixture.screen];
  const change = (screen) => {
    fixture.screen = screen;
    fixture.search = screen === "editor" ? { id: fixture.state.content[0]?.id } : {};
    fixture.routeRevision++;
    setMount((m) => m + 1);
    record("fixture-screen", { screen });
  };
  return (
    <>
      <div className="fixture-bar">
        <strong>LOCAL SYNTHETIC FIXTURE · no live access</strong>
        <div>
          {Object.keys(components).map((screen) => (
            <button
              key={screen}
              onClick={() => change(screen)}
              aria-pressed={fixture.screen === screen}
            >
              {screen}
            </button>
          ))}
          <label>
            Scenario{" "}
            <select
              aria-label="Fixture scenario"
              value={fixture.scenario}
              onChange={(e) => {
                reset(e.target.value);
                queryClient.clear();
                setMount((m) => m + 1);
              }}
            >
              {["ready", "review", "draft", "armed", "blocked", "empty"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Publication approval{" "}
            <select
              aria-label="Fixture publication approval"
              value={fixture.approvalMode}
              onChange={(e) => {
                fixture.approvalMode = e.target.value;
                reset();
                queryClient.clear();
                setMount((m) => m + 1);
              }}
            >
              {["needed", "current", "stale", "unavailable"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            UI language{" "}
            <select
              aria-label="Fixture UI language"
              value={fixture.locale}
              onChange={(e) => {
                fixture.locale = e.target.value;
                reset();
                queryClient.clear();
                setMount((m) => m + 1);
              }}
            >
              {["en", "pl", "sv", "da"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              reset();
              queryClient.clear();
              setMount((m) => m + 1);
            }}
          >
            Reset fixture
          </button>
          <button
            onClick={() => {
              fixture.events = [];
              fixture.errors = [];
              fixture.blockedRequests = [];
              notify();
            }}
          >
            Clear log
          </button>
        </div>
        <div className="fixture-caption">
          Real route components and controls. Synthetic store/auth/server adapters; shared shell,
          GSC card and marked child panels are fixtures. Unsupported external operations are
          refused.
        </div>
        <FixtureLog />
      </div>
      <Boundary key={fixture.screen + mount}>
        <Screen />
      </Boundary>
      <Toaster />
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
