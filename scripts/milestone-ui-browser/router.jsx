import React, { useSyncExternalStore } from "react";
import { fixture, record, subscribe, notify } from "./fixture.js";
const routeState = () => fixture.routeRevision;
export const createFileRoute = (path) => (options) => ({
  options,
  useSearch: () => {
    useSyncExternalStore(subscribe, routeState, routeState);
    return fixture.search;
  },
});
export const navigate = async (intent) => {
  record("navigate", intent);
  const map = {
    "/pricing": "pricing",
    "/app/setup": "setup",
    "/app/today": "today",
    "/app/editor": "editor",
    "/app/analytics": "analytics",
  };
  if (map[intent.to]) {
    fixture.screen = map[intent.to];
    fixture.search = intent.search ?? {};
    fixture.routeRevision++;
    notify();
  }
};
export const useNavigate = () => navigate;
export const Link = React.forwardRef(function Link(
  { to, search, children, onClick, ...props },
  ref,
) {
  const query = Object.entries(search ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
    .join("&");
  return (
    <a
      {...props}
      ref={ref}
      href={to + (query ? "?" + query : "")}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        void navigate({ to, search });
      }}
    >
      {children}
    </a>
  );
});
export const useRouter = () => ({
  navigate,
  invalidate: async () => {},
  state: { location: { pathname: "/app/" + fixture.screen } },
});
export const useLocation = () => ({ pathname: "/app/" + fixture.screen, search: fixture.search });
