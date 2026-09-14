import { useId } from "react";
import { UI_LANGUAGE_CODES } from "@/i18n/catalogs";
import { translate } from "@/i18n/translate";
import type { OnboardingLanguage } from "@/lib/types";

const LANGUAGE_NAMES: Record<OnboardingLanguage, string> = {
  en: "English",
  pl: "Polski",
  sv: "Svenska",
  da: "Dansk",
};

export function AuthLanguagePicker({
  language,
  onChange,
  disabled,
}: {
  language: OnboardingLanguage;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="mb-6 flex items-center justify-end gap-2 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {translate(language, "shell.language")}
      </label>
      <select
        id={id}
        value={language}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-md border border-border bg-background px-2 py-1.5 text-foreground disabled:opacity-50"
      >
        {UI_LANGUAGE_CODES.map((code) => (
          <option key={code} value={code}>
            {LANGUAGE_NAMES[code]}
          </option>
        ))}
      </select>
    </div>
  );
}
