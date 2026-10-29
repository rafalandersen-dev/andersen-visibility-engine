import React, { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import {
  CANCEL_MODES,
  CONFIRM_MODES,
  PREPARE_MODES,
  READ_MODES,
  SCENARIO_NAMES,
  Toaster,
  clearLog,
  fixture,
  notify,
  requestCounts,
  reset,
  settleProjection,
  subscribe,
} from "./fixture.js";
import { Route as BillingRoute } from "@/routes/_authenticated/app.billing";

const Billing = BillingRoute.options.component;

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

function Select({ label, value, options, onChange }) {
  return (
    <label>
      {label}{" "}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={String(option)}>{String(option)}</option>
        ))}
      </select>
    </label>
  );
}

function Diagnostics() {
  useSyncExternalStore(
    subscribe,
    () => fixture.revision,
    () => fixture.revision,
  );
  return (
    <details>
      <summary>
        Requests {fixture.requests.length} · errors {fixture.errors.length} · blocked network{" "}
        {fixture.blockedRequests.length} · operations {fixture.openOperation ? 1 : 0}
      </summary>
      <pre className="fixture-log" id="fixture-log">
        {JSON.stringify(
          {
            counts: requestCounts(),
            openOperation: fixture.openOperation,
            projectedPlanId: fixture.projectedPlanId,
            recent: fixture.requests.slice(-12),
            errors: fixture.errors,
            blockedRequests: fixture.blockedRequests,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}

function App() {
  // The toolbar follows `revision`, which every request, settlement and mode
  // change bumps. It used to follow `mountRevision`, which only changes on
  // reset/remount — so an applied answer set `pendingSettlement` and the
  // Settle button stayed disabled until some unrelated control forced a
  // render. `mountRevision` is still the route's remount key below, and
  // nothing remounts the product merely to refresh toolbar availability.
  useSyncExternalStore(
    subscribe,
    () => fixture.revision,
    () => fixture.revision,
  );
  const [, force] = useState(0);
  const apply = (patch) => {
    Object.assign(fixture, patch);
    notify();
    force((n) => n + 1);
  };
  // A REMOUNT of the real route, with the synthetic server state untouched.
  // This is the reentry path: the page must discover the existing operation,
  // not create another one.
  const remount = () => {
    fixture.mountRevision++;
    notify();
  };
  return (
    <>
      <div className="fixture-bar">
        <strong>LOCAL SYNTHETIC BILLING FIXTURE · no live access · no real customer data</strong>
        <div>
          <Select
            label="Scenario"
            value={fixture.scenario}
            options={SCENARIO_NAMES}
            onChange={(scenario) => {
              reset({ scenario });
              force((n) => n + 1);
            }}
          />
          <Select
            label="Read"
            value={fixture.readMode}
            options={READ_MODES}
            onChange={(readMode) => apply({ readMode })}
          />
          <Select
            label="Prepare"
            value={fixture.prepareMode}
            options={PREPARE_MODES}
            onChange={(prepareMode) => apply({ prepareMode })}
          />
          <Select
            label="Confirm"
            value={fixture.confirmMode}
            options={CONFIRM_MODES}
            onChange={(confirmMode) => apply({ confirmMode })}
          />
          <Select
            label="Cancel"
            value={fixture.cancelMode}
            options={CANCEL_MODES}
            onChange={(cancelMode) => apply({ cancelMode })}
          />
          <Select
            label="Language"
            value={fixture.locale}
            options={["en", "pl", "sv", "da"]}
            onChange={(locale) => {
              reset({ locale });
              force((n) => n + 1);
            }}
          />
          <Select
            label="User"
            value={fixture.userId}
            options={["fixture-user-a", "fixture-user-b"]}
            onChange={(userId) => apply({ userId })}
          />
        </div>
        <div>
          <button
            type="button"
            aria-pressed={fixture.owner}
            onClick={() => apply({ owner: !fixture.owner })}
          >
            Owner role: {fixture.owner ? "on" : "off"}
          </button>
          <button
            type="button"
            aria-pressed={fixture.projectionApplies}
            onClick={() => {
              const next = !fixture.projectionApplies;
              // Turning it ON also settles whatever applied operation is
              // already pending, so the documented scenario — confirm once,
              // then refresh — works without a second commercial request.
              if (next) settleProjection();
              apply({ projectionApplies: next });
            }}
          >
            Projection verified: {fixture.projectionApplies ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => {
              settleProjection();
              force((n) => n + 1);
            }}
            disabled={!fixture.pendingSettlement}
          >
            Settle synthetic projection
          </button>
          <button type="button" onClick={remount}>
            Remount route (reentry)
          </button>
          <button
            type="button"
            onClick={() => {
              reset({});
              force((n) => n + 1);
            }}
          >
            Reset fixture
          </button>
          <button type="button" onClick={clearLog}>
            Clear log
          </button>
        </div>
        <div>
          Real route, panel, controller and presentation. Store, auth, router, toasts, shell and the
          server API are synthetic in-memory adapters with the accepted shapes. Network is denied
          and CSP connect-src is &apos;none&apos;.
        </div>
        <Diagnostics />
      </div>
      <Boundary key={"mount-" + fixture.mountRevision}>
        <Billing />
      </Boundary>
      <Toaster />
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
