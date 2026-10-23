import React, { useSyncExternalStore } from "react";
import { fixture, record, subscribe } from "./fixture.js";
export const toast = {
  success: (message) => record("toast.success", { message }),
  error: (message) => record("toast.error", { message }),
  info: (message) => record("toast.info", { message }),
  warning: (message) => record("toast.warning", { message }),
};
export function Toaster() {
  useSyncExternalStore(
    subscribe,
    () => fixture.revision,
    () => fixture.revision,
  );
  const last = [...fixture.events].reverse().find((e) => e.type.startsWith("toast."));
  return last ? (
    <div className="fixture-toast" role="status">
      {last.payload.message}
    </div>
  ) : null;
}
