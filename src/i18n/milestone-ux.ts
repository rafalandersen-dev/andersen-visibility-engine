import type { OnboardingLanguage } from "@/lib/types";

export const milestoneUxCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "editor.action.moreActions": "More actions",
    "editor.action.reviewPublication": "Review publication",
    "analyticsScreen.dataSources": "Data sources and tracking setup",
    "analyticsScreen.advancedEvidence": "Advanced: server and edge log evidence",
  },
  pl: {
    "editor.action.moreActions": "Więcej działań",
    "editor.action.reviewPublication": "Sprawdź publikację",
    "analyticsScreen.dataSources": "Źródła danych i konfiguracja śledzenia",
    "analyticsScreen.advancedEvidence": "Zaawansowane: dane z logów serwera i edge",
  },
  sv: {
    "editor.action.moreActions": "Fler åtgärder",
    "editor.action.reviewPublication": "Granska publiceringen",
    "analyticsScreen.dataSources": "Datakällor och spårningsinställningar",
    "analyticsScreen.advancedEvidence": "Avancerat: data från server- och edge-loggar",
  },
  da: {
    "editor.action.moreActions": "Flere handlinger",
    "editor.action.reviewPublication": "Gennemgå publiceringen",
    "analyticsScreen.dataSources": "Datakilder og sporingsopsætning",
    "analyticsScreen.advancedEvidence": "Avanceret: data fra server- og edge-logfiler",
  },
};
