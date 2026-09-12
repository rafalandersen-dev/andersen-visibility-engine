import type { OnboardingLanguage } from "@/lib/types";

/** Plan display copy; stored lifecycle values and scheduling authority stay separate. */
export const planScreenCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "planScreen.orphans.title": "Drafts without a linked opportunity",
    "planScreen.orphans.help":
      "These drafts are not linked to an available opportunity. Any armed publication schedule remains active. Open a draft to review its status or manage its scheduled publication.",
    "planScreen.orphans.when": "Scheduled to publish: {date}",
    "planScreen.orphans.open": "Open draft",
    "planScreen.orphans.manage": "Manage schedule",
    "planScreen.deck.count": "Content items: {count}",
    "planScreen.archive.title": "Archived opportunities",
    "planScreen.archive.help": "Restore an opportunity here to return it to active work.",
    "planScreen.archive.at": "Archived: {date}",
    "planScreen.archive.undated": "Archived (date unavailable)",
    "planScreen.archive.restored": "Opportunity restored",
    "planScreen.archive.restore": "Restore",
    "planScreen.archive.empty": "Nothing is archived.",
  },
  pl: {
    "planScreen.orphans.title": "Szkice bez powiązanej możliwości SEO",
    "planScreen.orphans.help":
      "Te szkice nie są powiązane z dostępną możliwością SEO. Aktywny harmonogram publikacji pozostaje w mocy. Otwórz szkic, aby sprawdzić jego status lub zarządzać zaplanowaną publikacją.",
    "planScreen.orphans.when": "Zaplanowana publikacja: {date}",
    "planScreen.orphans.open": "Otwórz szkic",
    "planScreen.orphans.manage": "Zarządzaj harmonogramem",
    "planScreen.deck.count": "Materiały: {count}",
    "planScreen.archive.title": "Zarchiwizowane możliwości SEO",
    "planScreen.archive.help": "Przywróć możliwość SEO, aby wróciła do aktywnej pracy.",
    "planScreen.archive.at": "Zarchiwizowano: {date}",
    "planScreen.archive.undated": "Zarchiwizowano (data niedostępna)",
    "planScreen.archive.restored": "Możliwość SEO przywrócona",
    "planScreen.archive.restore": "Przywróć",
    "planScreen.archive.empty": "Archiwum jest puste.",
  },
  sv: {
    "planScreen.orphans.title": "Utkast utan länkad möjlighet",
    "planScreen.orphans.help":
      "Dessa utkast är inte länkade till en tillgänglig möjlighet. Eventuella aktiverade publiceringsscheman är fortfarande aktiva. Öppna ett utkast för att granska dess status eller hantera den schemalagda publiceringen.",
    "planScreen.orphans.when": "Schemalagd publicering: {date}",
    "planScreen.orphans.open": "Öppna utkast",
    "planScreen.orphans.manage": "Hantera schema",
    "planScreen.deck.count": "Innehållsobjekt: {count}",
    "planScreen.archive.title": "Arkiverade möjligheter",
    "planScreen.archive.help":
      "Återställ en möjlighet här för att återföra den till aktivt arbete.",
    "planScreen.archive.at": "Arkiverad: {date}",
    "planScreen.archive.undated": "Arkiverad (datum saknas)",
    "planScreen.archive.restored": "Möjligheten har återställts",
    "planScreen.archive.restore": "Återställ",
    "planScreen.archive.empty": "Inget är arkiverat.",
  },
  da: {
    "planScreen.orphans.title": "Udkast uden tilknyttet mulighed",
    "planScreen.orphans.help":
      "Disse udkast er ikke knyttet til en tilgængelig mulighed. Eventuelle aktiverede publiceringsplaner er stadig aktive. Åbn et udkast for at gennemgå dets status eller administrere den planlagte publicering.",
    "planScreen.orphans.when": "Planlagt publicering: {date}",
    "planScreen.orphans.open": "Åbn udkast",
    "planScreen.orphans.manage": "Administrér tidsplan",
    "planScreen.deck.count": "Indholdselementer: {count}",
    "planScreen.archive.title": "Arkiverede muligheder",
    "planScreen.archive.help": "Gendan en mulighed her for at vende tilbage til aktivt arbejde.",
    "planScreen.archive.at": "Arkiveret: {date}",
    "planScreen.archive.undated": "Arkiveret (dato mangler)",
    "planScreen.archive.restored": "Muligheden er gendannet",
    "planScreen.archive.restore": "Gendan",
    "planScreen.archive.empty": "Intet er arkiveret.",
  },
};
