import type { Project } from "./types";
const empty = (value: unknown) =>
  value == null || value === "" || (Array.isArray(value) && value.length === 0);
const same = (a: unknown, b: unknown) =>
  (empty(a) && empty(b)) || JSON.stringify(a) === JSON.stringify(b);
/** An interrupted wizard may fill missing fields but cannot erase an owner's
 * existing profile or overwrite a field changed after the wizard last saved. */
export function onboardingProjectPatch(
  current: Project,
  proposed: Partial<Project>,
  baseline?: Partial<Project>,
): Partial<Project> {
  const patch: Partial<Project> = {};
  for (const [field, value] of Object.entries(proposed)) {
    const key = field as keyof Project;
    if (key === "setupComplete" || key === "onboardingCompletedAt") {
      if (value) Object.assign(patch, { [key]: value });
      continue;
    }
    if (baseline) {
      if (same(baseline[key], value)) continue;
      if (!same(current[key], baseline[key]) && !same(current[key], value))
        throw new Error("onboarding_project_changed");
    } else if (!empty(current[key])) continue;
    if (!same(current[key], value)) Object.assign(patch, { [key]: value });
  }
  return patch;
}
