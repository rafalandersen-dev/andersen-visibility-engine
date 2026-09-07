/** DEV-only local fixtures. No identity, credentials, billing or queue records. */
import { setState } from "./store";
import { seedProjects } from "./mock-data";
import type { ContentAsset, Opportunity, Project } from "./types";
let initialized = false;
export function initializeVisualQa() {
  if (!import.meta.env.DEV || import.meta.env.VITE_MILO_VISUAL_QA !== "true" || initialized) return;
  initialized = true;
  const project: Project = {
    ...seedProjects[0],
    id: "milo-preview",
    name: "Butelki Wodorowe",
    businessName: "Butelki Wodorowe",
    businessType: "Sklep internetowy",
    targetAudience: "Osoby szukające butelek do codziennego użytku",
    toneOfVoice: "Rzeczowy, przyjazny i oparty na źródłach",
    brandNotes: "Bez niepotwierdzonych twierdzeń zdrowotnych",
    currency: "PLN",
    websiteUrl: "https://example.invalid",
    primaryLanguage: "Polish",
    primaryContentLanguage: "pl",
    appLanguage: "pl",
    additionalLanguages: ["English"],
    market: "PL",
    mainLocation: "Warszawa, Polska",
    targetLocations: ["Polska"],
    publishMode: "manualLive",
    description:
      "Demonstracyjny sklep z butelkami wielorazowymi i akcesoriami do wody. Materiały do oceny układu aplikacji.",
    uniqueSellingPoints:
      "Przejrzyste porównania materiałów, łatwa pielęgnacja, możliwość ponownego użycia.",
  };
  const titles = [
    "Woda wodorowa — co mówią badania i jak ją pić?",
    "Jak wybrać butelkę wodorową do podróży?",
    "Butelka szklana czy stalowa? Porównanie materiałów",
    "Jak dbać o butelkę wielorazową?",
    "Poradnik: wybierz pojemność butelki do codziennego użytku",
  ];
  const start = new Date();
  start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));
  start.setHours(9, 0, 0, 0);
  const content: ContentAsset[] = titles.map((title, index) => {
    const slot = new Date(start);
    slot.setDate(slot.getDate() + index * 2 + 1);
    return {
      id: `preview-content-${index}`,
      projectId: project.id,
      opportunityId: `preview-opportunity-${index}`,
      title,
      slug: `poradnik-${index}`,
      metaTitle: title,
      metaDescription:
        "Praktyczny poradnik: najważniejsze pytania, porównanie możliwości i źródła, które warto sprawdzić przed podjęciem decyzji.",
      h1: title,
      outline: ["Najważniejsze pytania", "Na co zwrócić uwagę", "Podsumowanie"],
      faq: [],
      cta: "Sprawdź dostępne modele",
      markdown: `## Najważniejsze pytania\n\n${title}\n\nTen artykuł jest przykładem do oceny układu i edycji w Milo. Przed publikacją należy uzupełnić treść oraz sprawdzić źródła.\n\n## Na co zwrócić uwagę\n\nPorównaj pojemność, materiał, łatwość czyszczenia i instrukcję użytkowania.\n\n## Podsumowanie\n\nWybierz rozwiązanie dopasowane do codziennych potrzeb.`,
      internalLinks: [],
      schemaSuggestions: [],
      editorNotes: "Dane demonstracyjne do lokalnego podglądu. Nie publikować.",
      status: "Approved",
      updatedAt: new Date().toISOString(),
      language: "Polish",
      assetType: "article",
      images: [
        {
          id: `preview-image-${index}`,
          url:
            index === 1
              ? "/preview/assets/travel-bottle.webp"
              : index === 2
                ? "/preview/assets/bottle-comparison.webp"
                : "/preview/assets/water-glass.webp",
          concept: "Fotografia ilustracyjna",
          alt: index === 1 ? "Butelka nad jeziorem" : "Szklanka wody w świetle dziennym",
          placement: "featured",
          status: "accepted",
          source: "generated",
        },
      ],
      ...(index < 3
        ? { scheduledPublishAt: slot.toISOString(), scheduledPublishStatus: "pending" as const }
        : {
            liveUrl: `https://example.invalid/poradnik-${index}`,
            livePublishStatus: "published" as const,
            livePublishedAt: new Date(Date.now() - 86400000 * index).toISOString(),
          }),
    };
  });
  const opportunities: Opportunity[] = content.map((asset, index) => ({
    id: asset.opportunityId!,
    projectId: project.id,
    title: asset.title,
    status: "approved",
    currentContentAssetId: asset.id,
    language: "Polish",
    targetAudience: "Klienci sklepu",
    recommendedCta: "Sprawdź modele",
    source: "manual",
    priority: "High",
    businessValue: "Pomaga klientom świadomie porównać dostępne rozwiązania.",
    businessImpact: "high",
    searchIntent: "Informational",
    targetQuery: asset.title,
    contentType: "Blog Article",
    recommendedAction: "Przygotuj artykuł",
    reasonDiscovered: "Temat dodany do demonstracyjnego planu",
    createdAt: asset.updatedAt,
    updatedAt: asset.updatedAt,
    dueAt: asset.scheduledPublishAt?.slice(0, 10),
  }));
  setState((state) => ({
    ...state,
    userId: null,
    hydrated: true,
    hydrationFailed: false,
    projects: [project],
    activeProjectId: project.id,
    services: [],
    content,
    opportunities,
    audits: [],
    discoverySuggestions: [],
    pendingActions: [],
    authorityOpportunities: [],
    calendar: [],
    subscription: undefined,
    billingProfile: undefined,
  }));
}
