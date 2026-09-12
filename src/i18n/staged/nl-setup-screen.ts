/** Dutch authoring only; excluded from runtime. */
export const nlSetupScreen: Readonly<Record<string, string>> = {
  "setupScreen.invalidUrl": "{field} moet beginnen met http:// of https://",
  "setupScreen.missing": "Vul de verplichte velden in: {fields}",
  "setupScreen.additional": "Aanvullende contenttalen",
  "setupScreen.sellingPoints": "Unieke verkoopargumenten",
  "setupScreen.publishing": "Publiceren",
  "setupScreen.mode": "Publicatiemodus",
  "setupScreen.mode.draft": "Alleen concept",
  "setupScreen.mode.manual": "Handmatig live publiceren",
  "setupScreen.endpoint": "Endpoint voor conceptaanlevering",
  "setupScreen.liveEndpoint": "Endpoint voor live publicatie",
  "setupScreen.liveHelp":
    "Een apart endpoint voor het publiceren van een beoordeeld concept. Het gebruikt dezelfde geheime publicatiesleutel.",
  "setupScreen.secret": "Geheime publicatiesleutel",
  "setupScreen.secretHelp":
    "Nieuwe geheime sleutels worden door de server opgeslagen en in een verzoekheader naar de ingestelde bestemming gestuurd. Stel op die bestemming dezelfde geheime sleutel in.",
  "setupScreen.destination": "Standaardbestemming",
  "setupScreen.faq": "FAQ-sectie",
  "setupScreen.approvalHelp":
    "Als je een artikel goedkeurt, wordt het als gereed gemarkeerd. Publiceren vereist een aparte actie: nu publiceren of een publicatietijd inplannen. Controleer de inhoud en claims voordat je publiceert.",
  "setupScreen.disclaimer": "Disclaimer voor AI-content",
  "setupScreen.retiredTitle": "Automatisch publiceren bij goedkeuring is verwijderd.",
  "setupScreen.retiredHelp":
    "Dit project gebruikt nu {mode}. Goedkeuring markeert een artikel als gereed; publicatie vereist nog steeds een aparte actie of planning. Eerder goedgekeurde artikelen kunnen nog concepten zijn. Controleer hun status voordat je nieuw werk inplant.",
  "setupScreen.saving": "Opslaan…",
  "setupScreen.save": "Publicatie-instellingen opslaan",
  "setupScreen.saved": "Publicatie-instellingen opgeslagen",
  "setupScreen.failed": "Publicatie-instellingen konden niet worden opgeslagen",
  "setupScreen.tagsExample": "seo, groei",
};
