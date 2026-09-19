/** Czech authoring only; not registered in the runtime or language picker. */
export const csAuditScreen: Readonly<Record<string, string>> = {
  "auditScreen.title": "Kontrola stránky",
  "auditScreen.subtitle":
    "Zkontrolujte obsah úvodní stránky a údaje o firmě vedle samostatných podkladů z technického procházení webu, indexace a měření výkonu.",
  "auditScreen.complete": "Kontrola stránky dokončena",
  "auditScreen.failed": "Kontrola se nezdařila. Zkuste to znovu.",
  "auditScreen.bulkCreated": "Příležitosti vytvořené z prioritních zjištění: {count}",
  "auditScreen.setupHelp": "Před kontrolou stránky vytvořte projekt s údaji o firmě a webem.",
  "auditScreen.website": "URL webu",
  "auditScreen.inputHelp":
    "Zkontrolujte firmu {business}{location} s využitím čitelného textu ze zadané URL úvodní stránky, pokud je dostupný, a údajů o firmě. Pokud stránku nelze načíst, hodnocení vychází pouze z vámi poskytnutého kontextu firmy. Tato akce nespouští samostatné technické procházení webu.",
  "auditScreen.running": "Probíhá kontrola…",
  "auditScreen.rerun": "Zopakovat kontrolu",
  "auditScreen.run": "Spustit kontrolu",
  "auditScreen.incomplete": "Kontrola se nedokončila",
  "auditScreen.first": "Spustit první kontrolu stránky",
  "auditScreen.emptyHelp":
    "Milo posoudí dostupný text úvodní stránky a údaje o firmě z hlediska srozumitelnosti, základů SEO, místní viditelnosti, připravenosti pro odpovědi AI, konverzí a důvěry. Zkontrolujte doporučení seřazená podle priority a vyberte, ze kterých vzniknou příležitosti v Plánu. Tato akce zahrnuje jednu stránku a poskytnutý kontext; technické procházení webu má vlastní ovládání výše.",
  "auditScreen.readProof":
    "Ze zadané URL úvodní stránky byl získán čitelný text. Tato kontrola ho hodnotí spolu s údaji o firmě. Skóre představují hodnocení, nikoli naměřené technické metriky nebo úplné procházení webu.",
  "auditScreen.unreadFallback":
    "Stránku se nepodařilo načíst; tato kontrola používá vámi poskytnuté údaje o firmě.",
  "auditScreen.unreadHelp":
    "Tato skóre jsou orientačním hodnocením vašich vstupů, nikoli měřením skutečného webu.",
  "auditScreen.indicative": "Orientační · stránka nebyla načtena",
  "auditScreen.overall": "Celkem",
  "auditScreen.estimate": "odhad",
  "auditScreen.topFixes": "Prioritní doporučení",
  "auditScreen.createTop": "Vytvořit příležitosti až z 5 prioritních zjištění",
  "auditScreen.noneRemaining":
    "Nezbývají žádná zjištění s vysokou nebo střední prioritou, která ještě nebyla převedena na příležitosti.",
  "auditScreen.scoreHelp":
    "Vyšší skóre znamená lepší hodnocení. Neměří aktuální pozice ve vyhledávání ani technický výkon.",
  "auditScreen.category.Business Clarity": "Srozumitelnost nabídky firmy",
  "auditScreen.category.SEO Basics": "Základy SEO",
  "auditScreen.category.Local Visibility": "Místní viditelnost",
  "auditScreen.category.AI Readiness": "Připravenost pro AI",
  "auditScreen.category.Conversion & Trust": "Konverze a důvěra",
};
