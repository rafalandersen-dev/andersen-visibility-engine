/** Domain coverage of saved answer evidence (CG-03A): per declared domain, x of the same n eligible
 * answers, mutually exclusive quality counts and the exact-record drill-down. Role names reuse
 * `answer.own` / `answer.competitor`. Polish, Swedish and Danish are author-written; no fluent-speaker
 * acceptance is claimed. */
const en = {
  "answerCoverage.title": "Citations by domain",
  "answerCoverage.source":
    "Counted from {n} complete saved answers in this group that also have a complete citation list. Each answer counts once per domain. Only the supplied citation links count, not links or names in the answer text.",
  "answerCoverage.noEligible":
    "This group has no complete answer with a complete citation list, so domain coverage is unknown here (not 0%).",
  "answerCoverage.count": "{x}/{n} answers cite it",
  "answerCoverage.showPresent": "Show answers citing {host}",
  "answerCoverage.alsoCompetitor":
    "Also listed as a competitor. It is the same domain, so it is not compared with itself.",
  "answerCoverage.overlaps":
    "Overlaps with {hosts}: one citation can count for both, so these results are not independent.",
  "answerCoverage.quality": "All {total} saved answers in this group, by quality:",
  "answerCoverage.quality.eligible": "Counted, complete answer and citation list: {count}",
  "answerCoverage.quality.incompleteCitations": "Not counted, citation list incomplete: {count}",
  "answerCoverage.quality.failed": "Not counted, failed: {count}",
  "answerCoverage.quality.truncated": "Not counted, truncated: {count}",
  "answerCoverage.focus.present": "answers citing {host}",
  "answerCoverage.focus.eligible": "answers counted for citations",
  "answerCoverage.focus.incompleteCitations": "answers with an incomplete citation list",
  "answerCoverage.focus.failed": "failed answers",
  "answerCoverage.focus.truncated": "truncated answers",
  "answerCoverage.showing": "Showing {count} saved answer records: {label}.",
  "answerCoverage.showAll": "Show all records",
  "answerCoverage.noneInWindow": "No current saved answers in this date range.",
} as const;
type Copy = Record<keyof typeof en, string>;
const pl: Copy = {
  "answerCoverage.title": "Cytowania według domeny",
  "answerCoverage.source":
    "Policzono na podstawie {n} pełnych zapisanych odpowiedzi z tej grupy, które mają także pełną listę cytowań. Każda odpowiedź liczy się raz dla danej domeny. Liczą się tylko podane linki cytowań, a nie linki ani nazwy w treści odpowiedzi.",
  "answerCoverage.noEligible":
    "W tej grupie nie ma pełnej odpowiedzi z pełną listą cytowań, więc pokrycie domen jest tu nieznane (to nie jest 0%).",
  "answerCoverage.count": "cytowana w {x}/{n} odpowiedzi",
  "answerCoverage.showPresent": "Pokaż odpowiedzi cytujące {host}",
  "answerCoverage.alsoCompetitor":
    "Podana także jako konkurent. To ta sama domena, więc nie jest porównywana sama ze sobą.",
  "answerCoverage.overlaps":
    "Pokrywa się z {hosts}: jedno cytowanie może liczyć się dla obu, więc te wyniki nie są niezależne.",
  "answerCoverage.quality": "Wszystkie zapisane odpowiedzi w tej grupie ({total}) według jakości:",
  "answerCoverage.quality.eligible": "Policzone, pełna odpowiedź i lista cytowań: {count}",
  "answerCoverage.quality.incompleteCitations": "Niepoliczone, niepełna lista cytowań: {count}",
  "answerCoverage.quality.failed": "Niepoliczone, błąd: {count}",
  "answerCoverage.quality.truncated": "Niepoliczone, ucięte: {count}",
  "answerCoverage.focus.present": "odpowiedzi cytujące {host}",
  "answerCoverage.focus.eligible": "odpowiedzi policzone dla cytowań",
  "answerCoverage.focus.incompleteCitations": "odpowiedzi z niepełną listą cytowań",
  "answerCoverage.focus.failed": "odpowiedzi zakończone błędem",
  "answerCoverage.focus.truncated": "ucięte odpowiedzi",
  "answerCoverage.showing": "Wyświetlane zapisane odpowiedzi ({count}): {label}.",
  "answerCoverage.showAll": "Pokaż wszystkie zapisy",
  "answerCoverage.noneInWindow": "Brak aktualnych zapisanych odpowiedzi w tym zakresie dat.",
};
const sv: Copy = {
  "answerCoverage.title": "Citeringar per domän",
  "answerCoverage.source":
    "Räknat på {n} fullständiga sparade svar i den här gruppen som också har en fullständig citeringslista. Varje svar räknas en gång per domän. Endast angivna citeringslänkar räknas, inte länkar eller namn i svarstexten.",
  "answerCoverage.noEligible":
    "Gruppen har inget fullständigt svar med fullständig citeringslista, så domäntäckningen är okänd här (inte 0 %).",
  "answerCoverage.count": "citeras i {x}/{n} svar",
  "answerCoverage.showPresent": "Visa svar som citerar {host}",
  "answerCoverage.alsoCompetitor":
    "Angiven även som konkurrent. Det är samma domän, så den jämförs inte med sig själv.",
  "answerCoverage.overlaps":
    "Överlappar med {hosts}: en citering kan räknas för båda, så resultaten är inte oberoende.",
  "answerCoverage.quality": "Alla {total} sparade svar i den här gruppen, efter kvalitet:",
  "answerCoverage.quality.eligible": "Räknade, fullständigt svar och citeringslista: {count}",
  "answerCoverage.quality.incompleteCitations":
    "Inte räknade, ofullständig citeringslista: {count}",
  "answerCoverage.quality.failed": "Inte räknade, misslyckade: {count}",
  "answerCoverage.quality.truncated": "Inte räknade, avkortade: {count}",
  "answerCoverage.focus.present": "svar som citerar {host}",
  "answerCoverage.focus.eligible": "svar som räknas för citeringar",
  "answerCoverage.focus.incompleteCitations": "svar med ofullständig citeringslista",
  "answerCoverage.focus.failed": "misslyckade svar",
  "answerCoverage.focus.truncated": "avkortade svar",
  "answerCoverage.showing": "Visar {count} sparade svarsposter: {label}.",
  "answerCoverage.showAll": "Visa alla poster",
  "answerCoverage.noneInWindow": "Inga aktuella sparade svar i det här datumintervallet.",
};
const da: Copy = {
  "answerCoverage.title": "Citater pr. domæne",
  "answerCoverage.source":
    "Optalt ud fra {n} komplette gemte svar i denne gruppe, som også har en komplet citatliste. Hvert svar tæller én gang pr. domæne. Kun de angivne citatlinks tæller, ikke links eller navne i svarteksten.",
  "answerCoverage.noEligible":
    "Gruppen har intet komplet svar med komplet citatliste, så domænedækningen er ukendt her (ikke 0 %).",
  "answerCoverage.count": "citeret i {x}/{n} svar",
  "answerCoverage.showPresent": "Vis svar, der citerer {host}",
  "answerCoverage.alsoCompetitor":
    "Også angivet som konkurrent. Det er det samme domæne, så det sammenlignes ikke med sig selv.",
  "answerCoverage.overlaps":
    "Overlapper med {hosts}: ét citat kan tælle for begge, så resultaterne er ikke uafhængige.",
  "answerCoverage.quality": "Alle {total} gemte svar i denne gruppe, efter kvalitet:",
  "answerCoverage.quality.eligible": "Optalt, komplet svar og citatliste: {count}",
  "answerCoverage.quality.incompleteCitations": "Ikke optalt, ufuldstændig citatliste: {count}",
  "answerCoverage.quality.failed": "Ikke optalt, mislykket: {count}",
  "answerCoverage.quality.truncated": "Ikke optalt, afkortet: {count}",
  "answerCoverage.focus.present": "svar, der citerer {host}",
  "answerCoverage.focus.eligible": "svar, der tæller for citater",
  "answerCoverage.focus.incompleteCitations": "svar med ufuldstændig citatliste",
  "answerCoverage.focus.failed": "mislykkede svar",
  "answerCoverage.focus.truncated": "afkortede svar",
  "answerCoverage.showing": "Viser {count} gemte svarposter: {label}.",
  "answerCoverage.showAll": "Vis alle poster",
  "answerCoverage.noneInWindow": "Ingen aktuelle gemte svar i dette datointerval.",
};
export const answerCoverageCopy = { en, pl, sv, da } as const;
