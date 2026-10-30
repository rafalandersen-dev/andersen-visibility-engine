// The central i18n hooks read the active project's interface language from the store. This fixture
// only answers that read; no workspace exists here.
import { fixture } from "./fixture.js";
let snapshot = null;
export function useStore(selector) {
  if (!snapshot || snapshot.projects[0].appLanguage !== fixture.locale)
    snapshot = { projects: [{ id: "p", appLanguage: fixture.locale }], activeProjectId: "p" };
  return selector(snapshot);
}
