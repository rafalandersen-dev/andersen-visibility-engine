/** Task continuity (CG-02A): the secondary way back from a draft to its exact Plan
 * task, and Plan's explicit notices for a requested task it cannot select. A
 * notice never selects a different task and never claims anything was done. */
const en = {
  "taskContinuity.backToTask": "Back to task",
  "taskContinuity.saveFirst": "Save your changes before going back to the task.",
  "taskContinuity.planArchived":
    "The requested task is archived, so it is not in active work. No other task was selected.",
  "taskContinuity.showArchived": "Show archived",
  "taskContinuity.planUnavailable":
    "The requested task is not available in this project. It may have been deleted. No other task was selected.",
} as const;
type Copy = Record<keyof typeof en, string>;
const pl: Copy = {
  "taskContinuity.backToTask": "Wróć do zadania",
  "taskContinuity.saveFirst": "Zapisz zmiany, zanim wrócisz do zadania.",
  "taskContinuity.planArchived":
    "Wskazane zadanie jest zarchiwizowane, więc nie ma go w aktywnej pracy. Nie wybrano innego zadania.",
  "taskContinuity.showArchived": "Pokaż archiwum",
  "taskContinuity.planUnavailable":
    "Wskazane zadanie nie jest dostępne w tym projekcie. Mogło zostać usunięte. Nie wybrano innego zadania.",
};
const sv: Copy = {
  "taskContinuity.backToTask": "Tillbaka till uppgiften",
  "taskContinuity.saveFirst": "Spara dina ändringar innan du går tillbaka till uppgiften.",
  "taskContinuity.planArchived":
    "Den begärda uppgiften är arkiverad och finns därför inte i aktivt arbete. Ingen annan uppgift valdes.",
  "taskContinuity.showArchived": "Visa arkiverade",
  "taskContinuity.planUnavailable":
    "Den begärda uppgiften är inte tillgänglig i det här projektet. Den kan ha raderats. Ingen annan uppgift valdes.",
};
const da: Copy = {
  "taskContinuity.backToTask": "Tilbage til opgaven",
  "taskContinuity.saveFirst": "Gem dine ændringer, før du går tilbage til opgaven.",
  "taskContinuity.planArchived":
    "Den ønskede opgave er arkiveret og er derfor ikke i aktivt arbejde. Ingen anden opgave blev valgt.",
  "taskContinuity.showArchived": "Vis arkiverede",
  "taskContinuity.planUnavailable":
    "Den ønskede opgave er ikke tilgængelig i dette projekt. Den kan være slettet. Ingen anden opgave blev valgt.",
};
export const taskContinuityCopy = { en, pl, sv, da } as const;
