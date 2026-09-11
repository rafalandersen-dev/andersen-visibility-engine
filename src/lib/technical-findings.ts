import type { CrawlPage } from "./technical-crawl";
export const technicalFindingCodes = [
  "http_error",
  "missing_title",
  "missing_description",
  "missing_h1",
  "multiple_h1",
  "multiple_canonicals",
  "invalid_jsonld",
  "noindex",
] as const;
export type TechnicalFindingCode = (typeof technicalFindingCodes)[number];
/** Observations support review actions, never a claim about indexation or ranking. */
export function technicalFindings(page: CrawlPage): TechnicalFindingCode[] {
  const o = page.observation;
  if (page.state !== "observed" || !o) return [];
  const result: TechnicalFindingCode[] = [];
  if (o.status >= 400) result.push("http_error");
  if (o.status >= 200 && o.status < 300 && o.complete) {
    if (!o.title.trim()) result.push("missing_title");
    if (!o.descriptions.some((v) => v.trim())) result.push("missing_description");
    if (!o.headings.some((v) => v.trim())) result.push("missing_h1");
    if (o.headings.length > 1) result.push("multiple_h1");
    if (o.canonicals.length > 1) result.push("multiple_canonicals");
  }
  if (o.complete && o.structuredData.some((s) => s.state === "invalid_json" && s.complete))
    result.push("invalid_jsonld");
  if (o.robots.some((r) => /(?:^|[\s,:])noindex(?:$|[\s,])/i.test(r.value))) result.push("noindex");
  return result;
}
export const technicalFindingLabels: Record<string, Record<TechnicalFindingCode, string>> = {
  en: {
    http_error: "Investigate the observed HTTP error",
    missing_title: "Review the missing page title",
    missing_description: "Review the missing meta description",
    missing_h1: "Review the missing main heading",
    multiple_h1: "Review the multiple main headings",
    multiple_canonicals: "Review the multiple canonical declarations",
    invalid_jsonld: "Repair invalid structured-data JSON syntax",
    noindex: "Review the observed noindex directive and its intended scope",
  },
  pl: {
    http_error: "Sprawdź zaobserwowany błąd HTTP",
    missing_title: "Sprawdź brak tytułu strony",
    missing_description: "Sprawdź brak opisu meta",
    missing_h1: "Sprawdź brak nagłówka głównego",
    multiple_h1: "Sprawdź wiele nagłówków głównych",
    multiple_canonicals: "Sprawdź wiele deklaracji kanonicznych",
    invalid_jsonld: "Popraw składnię JSON danych strukturalnych",
    noindex: "Sprawdź dyrektywę noindex i jej zamierzony zakres",
  },
  sv: {
    http_error: "Undersök det observerade HTTP-felet",
    missing_title: "Granska den saknade sidtiteln",
    missing_description: "Granska den saknade metabeskrivningen",
    missing_h1: "Granska den saknade huvudrubriken",
    multiple_h1: "Granska de flera huvudrubrikerna",
    multiple_canonicals: "Granska flera kanoniska deklarationer",
    invalid_jsonld: "Rätta ogiltig JSON-syntax för strukturerad data",
    noindex: "Granska det observerade noindex-direktivet och dess avsedda omfattning",
  },
  da: {
    http_error: "Undersøg den observerede HTTP-fejl",
    missing_title: "Gennemgå den manglende sidetitel",
    missing_description: "Gennemgå den manglende metabeskrivelse",
    missing_h1: "Gennemgå den manglende hovedoverskrift",
    multiple_h1: "Gennemgå de flere hovedoverskrifter",
    multiple_canonicals: "Gennemgå flere kanoniske erklæringer",
    invalid_jsonld: "Ret ugyldig JSON-syntaks for strukturerede data",
    noindex: "Gennemgå det observerede noindex-direktiv og dets tilsigtede omfang",
  },
};
