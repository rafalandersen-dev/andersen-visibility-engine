/** Croatian authoring only; not registered in the runtime or language picker. */
export const hrAuditScreen: Readonly<Record<string, string>> = {
  "auditScreen.title": "Pregled stranice",
  "auditScreen.subtitle":
    "Pregledajte sadržaj početne stranice i podatke o tvrtki uz zasebne dokaze o tehničkom pretraživanju, indeksiranju i performansama.",
  "auditScreen.complete": "Pregled stranice dovršen",
  "auditScreen.failed": "Pregled nije uspio. Pokušajte ponovno.",
  "auditScreen.bulkCreated": "Prilike izrađene iz prioritetnih nalaza: {count}",
  "auditScreen.setupHelp":
    "Prije pokretanja pregleda stranice izradite projekt s podacima o tvrtki i web-mjestom.",
  "auditScreen.website": "URL web-mjesta",
  "auditScreen.inputHelp":
    "Pregled za {business}{location} koristi čitljiv tekst s unesenog URL-a početne stranice, kada je dostupan, te vaše podatke o tvrtki. Ako stranicu nije moguće pročitati, procjena koristi samo poslovni kontekst koji ste unijeli. Ova radnja ne pokreće zasebno tehničko pretraživanje web-mjesta.",
  "auditScreen.running": "Pregled u tijeku…",
  "auditScreen.rerun": "Ponovno pokreni pregled",
  "auditScreen.run": "Pokreni pregled",
  "auditScreen.incomplete": "Pregled nije dovršen",
  "auditScreen.first": "Pokrenite prvi pregled stranice",
  "auditScreen.emptyHelp":
    "Milo procjenjuje dostupan tekst početne stranice i podatke o tvrtki prema jasnoći, osnovama SEO-a, lokalnoj vidljivosti, spremnosti za odgovore umjetne inteligencije, konverziji i povjerenju. Pregledajte preporuke poredane po prioritetu i odaberite koje će postati prilike u Planu. Ova radnja obuhvaća jednu stranicu i uneseni kontekst; tehničko pretraživanje ima zasebne kontrole iznad.",
  "auditScreen.readProof":
    "Čitljiv tekst dohvaćen je s unesenog URL-a početne stranice. Ovaj pregled procjenjuje taj tekst zajedno s podacima o vašoj tvrtki. Njegove ocjene predstavljaju procjene, a ne izmjerene tehničke pokazatelje ili pretraživanje cijelog web-mjesta.",
  "auditScreen.unreadFallback":
    "Stranicu nije bilo moguće pročitati; ovaj pregled koristi podatke o tvrtki koje ste unijeli.",
  "auditScreen.unreadHelp":
    "Ove ocjene okvirne su procjene vaših unosa, a ne mjerenja stvarnog web-mjesta.",
  "auditScreen.indicative": "Okvirno · stranica nije pročitana",
  "auditScreen.overall": "Ukupno",
  "auditScreen.estimate": "procj.",
  "auditScreen.topFixes": "Prioritetne preporuke",
  "auditScreen.createTop": "Izradi prilike iz najviše 5 prioritetnih nalaza",
  "auditScreen.noneRemaining":
    "Nema preostalih nalaza visokog ili srednjeg prioriteta koji nisu pretvoreni u prilike.",
  "auditScreen.scoreHelp":
    "Više ocjene označavaju bolju procjenu. Ne mjere trenutačni položaj u rezultatima pretraživanja ni tehničke performanse.",
  "auditScreen.category.Business Clarity": "Jasnoća poslovanja",
  "auditScreen.category.SEO Basics": "Osnove SEO-a",
  "auditScreen.category.Local Visibility": "Lokalna vidljivost",
  "auditScreen.category.AI Readiness": "Spremnost za umjetnu inteligenciju",
  "auditScreen.category.Conversion & Trust": "Konverzija i povjerenje",
};
