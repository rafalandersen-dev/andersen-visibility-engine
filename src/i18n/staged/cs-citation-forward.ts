/** Czech authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const csCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Načítání…",
  "citationForward.title": "Od zjištění k ověřené změně",
  "citationForward.intro":
    "Převeďte přijatou verzi zjištění do úkolu v Plánu, napište změnu ve Studiu, zveřejněte ji přes stávající schválení a poté zaznamenejte, co jste na cílovém místě skutečně zkontrolovali.",
  "citationForward.authority":
    "Přijetí zjištění nic neuděluje: zveřejnění stále vyžaduje schválení ve Studiu a vaše běžná oprávnění Manual/Review/Autopilot. Úkol, koncept, schválení ani potvrzení konektoru nikdy nedokazují, že stránka změnu zobrazuje.",
  "citationForward.findings.title": "Zjištění a úkoly v Plánu",
  "citationForward.findings.empty":
    "Zatím žádné zjištění k navázání (přijaté nebo čekající na druhou kontrolu, aktuální verze).",
  "citationForward.findings.pick": "Verze zjištění",
  "citationForward.findings.pickPlaceholder": "Vyberte verzi zjištění",
  "citationForward.findings.pinned": "Připnuto k v{pinned} · aktuální v{head}",
  "citationForward.findings.state.current": "aktuální verze",
  "citationForward.findings.state.superseded":
    "nahrazeno novější verzí (připnutí zůstává na zkontrolovaném řádku)",
  "citationForward.findings.state.deleted": "připnutý řádek smazán",
  "citationForward.findings.state.dismissed": "vámi zamítnuto (nelze navázat)",
  "citationForward.findings.state.dissent": "zaznamenán nezávislý nesouhlas",
  "citationForward.findings.state.second_review": "čeká na druhou kontrolu",
  "citationForward.task.create": "Vytvořit úkol v Plánu z této verze",
  "citationForward.task.attach": "Připojit k existujícímu úkolu",
  "citationForward.task.attachPlaceholder": "Vyberte úkol",
  "citationForward.task.created": "Úkol v Plánu vytvořen.",
  "citationForward.task.attached": "Připojeno k úkolu.",
  "citationForward.task.listTitle": "Úkoly propojené s touto verzí zjištění",
  "citationForward.task.listEmpty": "S touto verzí zjištění není propojen žádný úkol.",
  "citationForward.task.state.active": "aktivní",
  "citationForward.task.state.archived": "archivovaný",
  "citationForward.task.state.deleted": "smazaný",
  "citationForward.task.state.missing": "chybí (úkol už není v tomto pracovním prostoru)",
  "citationForward.task.localNote":
    "Identita úkolů a vazby žijí v úložišti vašeho pracovního prostoru; neudělují přístup kontrolora a nejsou důkazem ze serveru.",
  "citationForward.studio.manualDraft": "Vytvořit ruční koncept ve Studiu (bez AI)",
  "citationForward.studio.manualNote":
    "Ruční koncept nic nestojí a začíná prázdný; cesta generování AI zůstává v Plánu a čerpá váš měsíční rozpočet na AI.",
  "citationForward.studio.open": "Otevřít koncept ve Studiu",
  "citationForward.studio.plan": "Otevřít v Plánu (generování AI)",
  "citationForward.improvement.title": "Záznam zlepšení",
  "citationForward.improvement.intro":
    "Navažte přesný zveřejněný pokus pro tento úkol, verzi schválení, kterou nesl, a referenční záznamy pořízené před ním. Každé pole vazby se odvozuje ze zvoleného pokusu.",
  "citationForward.improvement.start": "Zaznamenat zlepšení pro tento úkol",
  "citationForward.improvement.publication": "Zveřejněný pokus",
  "citationForward.improvement.publicationNone":
    "Pro tento úkol zatím není zaznamenán žádný zveřejněný pokus s živou URL. Nejprve zveřejněte přes Studio; zahájený nebo zamítnutý pokus nelze navázat.",
  "citationForward.improvement.publicationOption": "{finished} · verze {version} · {url}",
  "citationForward.improvement.approvedBy": "Schválil(a)",
  "citationForward.improvement.approvedByOwner": "já (vlastník)",
  "citationForward.improvement.description": "Co se změnilo (popis)",
  "citationForward.improvement.baselines": "Referenční záznamy (před zveřejněním)",
  "citationForward.improvement.baselinesNone":
    "Žádný záznam v rozsahu nepředchází tomuto zveřejnění; ověřené před/po nebude pro tento pokus možné.",
  "citationForward.improvement.baselinesHint":
    "Nabízejí se jen záznamy pořízené před zveřejněním. Server to znovu kontroluje.",
  "citationForward.improvement.review": "Zkontrolovat přesný záznam",
  "citationForward.improvement.save": "Uložit zlepšení",
  "citationForward.improvement.retry": "Zopakovat stejný záznam",
  "citationForward.improvement.back": "Zpět k úpravám",
  "citationForward.improvement.cancel": "Zrušit",
  "citationForward.improvement.saved": "Uloženo jako v{version}.",
  "citationForward.improvement.listTitle": "Zlepšení",
  "citationForward.improvement.listEmpty":
    "Pro tento projekt zatím není zaznamenáno žádné zlepšení.",
  "citationForward.improvement.status.unverified": "neověřeno",
  "citationForward.improvement.status.approval_bound": "vázáno na schválení",
  "citationForward.improvement.status.connector_receipt":
    "potvrzení konektoru (pouze potvrzení příjmu)",
  "citationForward.improvement.status.owner_attested":
    "potvrzeno vlastníkem (vaše pozorování, ne nezávislý důkaz)",
  "citationForward.improvement.evidence.baseline_absent": "žádná reference zaznamenána",
  "citationForward.improvement.evidence.baseline_missing":
    "reference chybí (záznam byl smazán nebo opustil rozsah)",
  "citationForward.improvement.evidence.baseline_recorded": "reference zaznamenána",
  "citationForward.improvement.statusNote":
    "Stavy jsou živé hodnoty ze serveru. Potvrzení konektoru dokazuje, že konektor odpověděl, ne že stránka změnu zobrazuje; potvrzení vlastníka je vaše vlastní pozorování.",
  "citationForward.improvement.detailRows": "Připnuté řádky zjištění",
  "citationForward.improvement.detailTask": "Úkol",
  "citationForward.improvement.detailDestination": "Cílové místo",
  "citationForward.improvement.detailNoBinding": "Žádné zveřejnění nenavázáno (konceptový záznam).",
  "citationForward.improvement.remove": "Odstranit tuto verzi",
  "citationForward.improvement.removed": "Odstraněno.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Vyberte alespoň jednu verzi zjištění.",
  "citationForward.issue.finding_unavailable":
    "Vybraný řádek zjištění byl smazán; vyberte aktuální verzi.",
  "citationForward.issue.finding_not_bindable":
    "Zamítnuté nebo nahrazené zjištění nelze navázat; vyberte jeho aktuální přijatou verzi.",
  "citationForward.issue.scope_mixed":
    "Všechna vybraná zjištění musí patřit ke stejné uzamčené verzi panelu a stejnému klientovi.",
  "citationForward.issue.task_invalid": "Identita úkolu není platná.",
  "citationForward.issue.publication_required": "Vyberte zveřejněný pokus k navázání.",
  "citationForward.issue.publication_task_mismatch": "Zvolený pokus byl zaznamenán pro jiný úkol.",
  "citationForward.issue.description_required": "Popište změnu.",
  "citationForward.issue.baseline_after_publication":
    "Zvolená reference byla pořízena po zveřejnění.",
  "citationForward.issue.invalid": "Záznam není platný.",
  "citationForward.inspection.title": "Kontrola cílového místa vlastníkem",
  "citationForward.inspection.intro":
    "Otevřete přesnou zveřejněnou URL, porovnejte ji se schváleným snímkem a poté zaznamenejte, co jste viděli. Otevření odkazu ani úspěšná odpověď samy o sobě nic nedosvědčují.",
  "citationForward.inspection.open": "Otevřít zveřejněnou URL",
  "citationForward.inspection.snapshot": "Schválený snímek",
  "citationForward.inspection.result": "Co jste viděli?",
  "citationForward.inspection.shows_approved_content": "Zobrazuje schválený obsah",
  "citationForward.inspection.does_not_show": "Nezobrazuje ho",
  "citationForward.inspection.inconclusive": "Neprůkazné",
  "citationForward.inspection.record": "Zaznamenat kontrolu",
  "citationForward.inspection.baselineRequired":
    "Kladná kontrola potřebuje referenční záznamy, na které navazuje; nejprve upravte záznam.",
  "citationForward.inspection.bindingRequired":
    "Tento záznam nemá žádnou vazbu na zveřejnění, kterou by šlo zkontrolovat.",
  "citationForward.inspection.negativeNote":
    "Záporná nebo neprůkazná kontrola se uloží a zlepšení zůstává pro dodání neověřené.",
  "citationForward.error.conflict":
    "Někdo uložil novější verzi, zatímco jste upravovali. Váš koncept je zachován; nic nebylo zapsáno.",
  "citationForward.error.conflictContinue": "Pokračovat na aktuální verzi",
  "citationForward.error.findingUnresolved":
    "Vybrané zjištění se v tomto rozsahu už nedaří dohledat.",
  "citationForward.error.baselineUnresolved":
    "Referenční záznam se v tomto projektu už nedaří dohledat.",
  "citationForward.error.bindingUnresolved": "Vazba na zveřejnění neodpovídá zaznamenanému pokusu.",
  "citationForward.error.bindingUnapproved": "Navázaná verze není aktuálně schválena.",
  "citationForward.error.approvalMismatch":
    "Uvedená verze schválení nebo schvalovatel neodpovídá skutečnému schválení.",
  "citationForward.error.taskMismatch": "Zveřejnění bylo zaznamenáno pro jiný úkol.",
  "citationForward.error.destinationMismatch": "Cílové místo neodpovídá zveřejněné URL.",
  "citationForward.error.inspectionInvalid":
    "Kontrola není pro toto zveřejnění platná (URL, čas nebo stav).",
  "citationForward.error.verificationUnbacked":
    "Ověření vyžaduje kladnou kontrolu zveřejněné URL vlastníkem.",
  "citationForward.error.scopeDrift": "Toto zlepšení bylo zaznamenáno pod jiným rozsahem.",
  "citationForward.error.capacity": "Kapacita zlepšení pro tento projekt je vyčerpána.",
  "citationForward.error.invalid": "Záznam byl odmítnut jako neplatný.",
  "citationForward.error.unavailable":
    "Uložení se nepodařilo dokončit. Obnovte stránku a zkuste to znovu.",
  "citationForward.error.loadEvidence": "Historii zveřejnění se nepodařilo načíst.",
  "citationForward.error.loadImprovements": "Zlepšení se nepodařilo načíst.",
  "citationForward.readiness.title": "Připravenost k opakovanému testu",
  "citationForward.readiness.verified":
    "Vlastníkem potvrzené odlišné změny: {count} z {required} požadovaných",
  "citationForward.readiness.receipts": "Pouze potvrzení konektoru (ne důkaz dodání): {count}",
  "citationForward.readiness.approvalBound": "Pouze vázáno na schválení: {count}",
  "citationForward.readiness.unverified": "Neověřeno: {count}",
  "citationForward.readiness.baselineMissing": "Reference chybí: {count}",
  "citationForward.readiness.note":
    "Počty pocházejí z živých stavů serveru; zde se nepočítá žádné srovnávací kolo a potvrzení vlastníka nikdy není nezávislý důkaz.",
  "citationForward.task.pinnedTitle": "Úkoly v Plánu připnuté k verzím zjištění",
  "citationForward.task.pinnedEmpty":
    "V tomto projektu není žádný úkol v Plánu připnut k verzi zjištění.",
  "citationForward.task.readFailed": "Zjištění se nepodařilo přečíst; žádný úkol nebyl vytvořen.",
  "citationForward.task.notEligible":
    "Verze zjištění vrácená serverem není ta vybraná nebo už není způsobilá; žádný úkol nebyl vytvořen.",
  "citationForward.task.stale":
    "Během čtení zjištění se změnil projekt nebo účet; žádný úkol nebyl vytvořen.",
  "citationForward.improvement.rowsPick": "Verze zjištění k navázání",
  "citationForward.improvement.useCurrent": "Navázat aktuální verzi v{head} místo připnutého řádku",
  "citationForward.improvement.publicationPartial":
    "Podařilo se načíst jen {loaded} z {total} zaznamenaných pokusů; starší pokusy se zde nenabízejí.",
  "citationForward.improvement.historyRow": "dřívější verze (historie)",
  "citationForward.inspection.notHead":
    "Existuje novější verze tohoto zlepšení. Otevřete aktuální verzi a zkontrolujte ji.",
  "citationForward.inspection.retry": "Zopakovat stejnou kontrolu",
  "citationForward.error.findingStale":
    "Navázané zjištění se od vaší kontroly tohoto záznamu změnilo. Nic nebylo zapsáno; otevřete aktuální verzi zjištění a zkontrolujte ji znovu.",
  "citationForward.readiness.unavailable":
    "Připravenost nelze zobrazit: živé stavy se nepodařilo obnovit.",
  "citationForward.improvement.approvalDelegate": "Schválil(a) pověřený kontrolor: {email}",
  "citationForward.improvement.approvalNone":
    "Tato verze není aktuálně schválena; pokus nelze navázat.",
  "citationForward.issue.approval_unknown": "Stav schválení zvoleného pokusu se nepodařilo načíst.",
  "citationForward.issue.approval_unavailable": "Verze zvoleného pokusu není aktuálně schválena.",
  "citationForward.task.duplicate":
    "K této verzi zjištění je již připnut úkol v Plánu (uveden níže); druhý úkol nebyl vytvořen. Použijte jej, nebo verzi výslovně připojte k jinému úkolu.",
};
