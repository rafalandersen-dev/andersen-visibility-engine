/** Project knowledge review strings. Wider intake/review localization remains in P1. */
export const projectKnowledge = {
  en: {
    "knowledge.history.empty": "No older saved versions.",
    "knowledge.history.older": "Older saved versions",
    "knowledge.history.latest": "Latest saved versions",
    "knowledge.sourceHistory.empty": "No older source versions.",
    "knowledge.sourceHistory.latest": "Latest source versions",
  },
  pl: {
    "knowledge.history.empty": "Brak starszych zapisanych wersji.",
    "knowledge.history.older": "Starsze zapisane wersje",
    "knowledge.history.latest": "Najnowsze zapisane wersje",
    "knowledge.sourceHistory.empty": "Brak starszych wersji źródła.",
    "knowledge.sourceHistory.latest": "Najnowsze wersje źródła",
  },
  sv: {
    "knowledge.history.empty": "Det finns inga äldre sparade versioner.",
    "knowledge.history.older": "Äldre sparade versioner",
    "knowledge.history.latest": "Senaste sparade versionerna",
    "knowledge.sourceHistory.empty": "Det finns inga äldre källversioner.",
    "knowledge.sourceHistory.latest": "Senaste källversionerna",
  },
  da: {
    "knowledge.history.empty": "Der er ingen ældre gemte versioner.",
    "knowledge.history.older": "Ældre gemte versioner",
    "knowledge.history.latest": "Seneste gemte versioner",
    "knowledge.sourceHistory.empty": "Der er ingen ældre kildeversioner.",
    "knowledge.sourceHistory.latest": "Seneste kildeversioner",
  },
} satisfies Record<"en" | "pl" | "sv" | "da", Record<string, string>>;
