import { useAppLanguage } from "@/i18n";
import { translate } from "@/i18n/translate";
import { fixture, notify } from "./fixture.js";
export function useAuthLanguage() {
  const language = useAppLanguage();
  return {
    language,
    chooseLanguage: (lang) => {
      fixture.state = {
        ...fixture.state,
        projects: fixture.state.projects.map((p) => ({ ...p, appLanguage: lang })),
      };
      window.miloFixture.storeEmit();
      notify();
    },
    t: (key, vars) => translate(language, key, vars),
  };
}
