import type { OnboardingLanguage } from "@/lib/types";

/** Relevance checks cannot promise search-policy compliance. */
export const linkNetworkCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "linknet.policyNote":
      "Relevance comes first: matches require shared topics, direct link swaps are flagged, and nothing is placed automatically. These checks do not guarantee compliance with search-engine policies.",
    "linknet.reciprocalWarn":
      "This would create a direct link exchange with this site. Review its relevance and avoid excessive exchanges.",
  },
  pl: {
    "linknet.policyNote":
      "Trafność jest najważniejsza: dopasowania wymagają wspólnych tematów, bezpośrednie wymiany linków są oznaczane i nic nie jest umieszczane automatycznie. Te kontrole nie gwarantują zgodności z zasadami wyszukiwarek.",
    "linknet.reciprocalWarn":
      "To utworzyłoby bezpośrednią wymianę linków z tą witryną. Oceń jej trafność i unikaj nadmiernej wymiany.",
  },
  sv: {
    "linknet.policyNote":
      "Relevans kommer först: matchningar kräver gemensamma ämnen, direkta länkbyten flaggas och ingenting placeras automatiskt. Kontrollerna garanterar inte att sökmotorernas regler följs.",
    "linknet.reciprocalWarn":
      "Detta skulle skapa ett direkt länkbyte med den här webbplatsen. Bedöm relevansen och undvik överdrivna länkbyten.",
  },
  da: {
    "linknet.policyNote":
      "Relevans kommer først: match kræver fælles emner, direkte linkbytte markeres, og intet placeres automatisk. Kontrollerne garanterer ikke, at søgemaskinernes regler overholdes.",
    "linknet.reciprocalWarn":
      "Dette ville skabe et direkte linkbytte med dette websted. Vurder relevansen, og undgå overdreven udveksling.",
  },
};
