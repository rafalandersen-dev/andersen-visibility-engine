/** German authoring only. */
export const deSetupScreen: Readonly<Record<string, string>> = {
  "setupScreen.invalidUrl": "{field} muss mit http:// oder https:// beginnen",
  "setupScreen.missing": "Fülle die Pflichtfelder aus: {fields}",
  "setupScreen.additional": "Weitere Inhaltssprachen",
  "setupScreen.sellingPoints": "Alleinstellungsmerkmale",
  "setupScreen.publishing": "Veröffentlichung",
  "setupScreen.mode": "Veröffentlichungsmodus",
  "setupScreen.mode.draft": "Nur Entwurf",
  "setupScreen.mode.manual": "Manuelle Live-Veröffentlichung",
  "setupScreen.endpoint": "Endpunkt für die Entwurfsübermittlung",
  "setupScreen.liveEndpoint": "Endpunkt für die Live-Veröffentlichung",
  "setupScreen.liveHelp":
    "Ein separater Endpunkt zum Veröffentlichen eines geprüften Entwurfs. Er verwendet dasselbe Veröffentlichungsgeheimnis.",
  "setupScreen.secret": "Veröffentlichungsgeheimnis",
  "setupScreen.secretHelp":
    "Neue Geheimnisse werden vom Server gespeichert und in einem Anfrage-Header an das konfigurierte Ziel gesendet. Richte dort dasselbe Geheimnis ein.",
  "setupScreen.destination": "Standardziel",
  "setupScreen.faq": "FAQ-Abschnitt",
  "setupScreen.approvalHelp":
    "Die Freigabe eines Artikels markiert ihn als bereit. Zum Veröffentlichen ist eine separate Aktion erforderlich: jetzt veröffentlichen oder einen Veröffentlichungstermin festlegen. Prüfe die Inhalte und Aussagen vor der Veröffentlichung.",
  "setupScreen.disclaimer": "Haftungshinweis zu KI-Inhalten",
  "setupScreen.retiredTitle": "Die automatische Veröffentlichung bei Freigabe wurde entfernt.",
  "setupScreen.retiredHelp":
    "Dieses Projekt verwendet jetzt {mode}. Eine Freigabe markiert einen Artikel als bereit; die Veröffentlichung benötigt weiterhin eine separate Aktion oder Terminierung. Bereits freigegebene Artikel können noch Entwürfe sein. Prüfe ihren Status, bevor du neue Arbeit terminierst.",
  "setupScreen.saving": "Wird gespeichert…",
  "setupScreen.save": "Veröffentlichungseinstellungen speichern",
  "setupScreen.saved": "Veröffentlichungseinstellungen gespeichert",
  "setupScreen.failed": "Veröffentlichungseinstellungen konnten nicht gespeichert werden",
  "setupScreen.tagsExample": "seo, wachstum",
};
