/** Slovak authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const skCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Načítava sa…",
  "citationForward.title": "Od zistenia k overenej zmene",
  "citationForward.intro":
    "Preneste prijatú verziu zistenia do úlohy v Pláne, napíšte zmenu v Studiu, zverejnite ju cez existujúce schválenie a potom zaznamenajte, čo ste na cieľovom mieste skutočne skontrolovali.",
  "citationForward.authority":
    "Prijatie zistenia nič neudeľuje: zverejnenie stále vyžaduje schválenie v Studiu a vaše bežné oprávnenia Manual/Review/Autopilot. Úloha, koncept, schválenie ani potvrdenie konektora nikdy nedokazujú, že stránka zmenu zobrazuje.",
  "citationForward.findings.title": "Zistenia a úlohy v Pláne",
  "citationForward.findings.empty":
    "Zatiaľ žiadne zistenie na naviazanie (prijaté alebo čakajúce na druhú kontrolu, aktuálna verzia).",
  "citationForward.findings.pick": "Verzia zistenia",
  "citationForward.findings.pickPlaceholder": "Vyberte verziu zistenia",
  "citationForward.findings.pinned": "Pripnuté k v{pinned} · aktuálna v{head}",
  "citationForward.findings.state.current": "aktuálna verzia",
  "citationForward.findings.state.superseded":
    "nahradené novšou verziou (pripnutie zostáva na skontrolovanom riadku)",
  "citationForward.findings.state.deleted": "pripnutý riadok odstránený",
  "citationForward.findings.state.dismissed": "vami zamietnuté (nedá sa naviazať)",
  "citationForward.findings.state.dissent": "zaznamenaný nezávislý nesúhlas",
  "citationForward.findings.state.second_review": "čaká na druhú kontrolu",
  "citationForward.task.create": "Vytvoriť úlohu v Pláne z tejto verzie",
  "citationForward.task.attach": "Pripojiť k existujúcej úlohe",
  "citationForward.task.attachPlaceholder": "Vyberte úlohu",
  "citationForward.task.created": "Úloha v Pláne vytvorená.",
  "citationForward.task.attached": "Pripojené k úlohe.",
  "citationForward.task.listTitle": "Úlohy prepojené s touto verziou zistenia",
  "citationForward.task.listEmpty": "S touto verziou zistenia nie je prepojená žiadna úloha.",
  "citationForward.task.state.active": "aktívna",
  "citationForward.task.state.archived": "archivovaná",
  "citationForward.task.state.deleted": "odstránená",
  "citationForward.task.state.missing": "chýba (úloha už nie je v tomto pracovnom priestore)",
  "citationForward.task.localNote":
    "Identita úloh a väzby žijú v úložisku vášho pracovného priestoru; neudeľujú prístup kontrolóra a nie sú dôkazom zo servera.",
  "citationForward.studio.manualDraft": "Vytvoriť ručný koncept v Studiu (bez AI)",
  "citationForward.studio.manualNote":
    "Ručný koncept nič nestojí a začína prázdny; cesta generovania AI zostáva v Pláne a čerpá váš mesačný rozpočet na AI.",
  "citationForward.studio.open": "Otvoriť koncept v Studiu",
  "citationForward.studio.plan": "Otvoriť v Pláne (generovanie AI)",
  "citationForward.improvement.title": "Záznam zlepšenia",
  "citationForward.improvement.intro":
    "Naviažte presný zverejnený pokus pre túto úlohu, verziu schválenia, ktorú niesol, a referenčné záznamy zhotovené pred ním. Každé pole väzby sa odvodzuje zo zvoleného pokusu.",
  "citationForward.improvement.start": "Zaznamenať zlepšenie pre túto úlohu",
  "citationForward.improvement.publication": "Zverejnený pokus",
  "citationForward.improvement.publicationNone":
    "Pre túto úlohu zatiaľ nie je zaznamenaný žiadny zverejnený pokus so živou URL. Najprv zverejnite cez Studio; začatý alebo zamietnutý pokus sa nedá naviazať.",
  "citationForward.improvement.publicationOption": "{finished} · verzia {version} · {url}",
  "citationForward.improvement.approvedBy": "Schválil(a)",
  "citationForward.improvement.approvedByOwner": "ja (vlastník)",
  "citationForward.improvement.description": "Čo sa zmenilo (opis)",
  "citationForward.improvement.baselines": "Referenčné záznamy (pred zverejnením)",
  "citationForward.improvement.baselinesNone":
    "Žiadny záznam v rozsahu nepredchádza tomuto zverejneniu; overené pred/po nebude pre tento pokus možné.",
  "citationForward.improvement.baselinesHint":
    "Ponúkajú sa len záznamy zhotovené pred zverejnením. Server to znova kontroluje.",
  "citationForward.improvement.review": "Skontrolovať presný záznam",
  "citationForward.improvement.save": "Uložiť zlepšenie",
  "citationForward.improvement.retry": "Zopakovať rovnaký záznam",
  "citationForward.improvement.back": "Späť na úpravy",
  "citationForward.improvement.cancel": "Zrušiť",
  "citationForward.improvement.saved": "Uložené ako v{version}.",
  "citationForward.improvement.listTitle": "Zlepšenia",
  "citationForward.improvement.listEmpty":
    "Pre tento projekt zatiaľ nie je zaznamenané žiadne zlepšenie.",
  "citationForward.improvement.status.unverified": "neoverené",
  "citationForward.improvement.status.approval_bound": "viazané na schválenie",
  "citationForward.improvement.status.connector_receipt":
    "potvrdenie konektora (iba potvrdenie prijatia)",
  "citationForward.improvement.status.owner_attested":
    "potvrdené vlastníkom (vaše pozorovanie, nie nezávislý dôkaz)",
  "citationForward.improvement.evidence.baseline_absent": "žiadna referencia nezaznamenaná",
  "citationForward.improvement.evidence.baseline_missing":
    "referencia chýba (záznam bol odstránený alebo opustil rozsah)",
  "citationForward.improvement.evidence.baseline_recorded": "referencia zaznamenaná",
  "citationForward.improvement.statusNote":
    "Stavy sú živé hodnoty zo servera. Potvrdenie konektora dokazuje, že konektor odpovedal, nie že stránka zmenu zobrazuje; potvrdenie vlastníka je vaše vlastné pozorovanie.",
  "citationForward.improvement.detailRows": "Pripnuté riadky zistení",
  "citationForward.improvement.detailTask": "Úloha",
  "citationForward.improvement.detailDestination": "Cieľové miesto",
  "citationForward.improvement.detailNoBinding":
    "Žiadne zverejnenie nie je naviazané (konceptový záznam).",
  "citationForward.improvement.remove": "Odstrániť túto verziu",
  "citationForward.improvement.removed": "Odstránené.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Vyberte aspoň jednu verziu zistenia.",
  "citationForward.issue.finding_unavailable":
    "Vybraný riadok zistenia bol odstránený; vyberte aktuálnu verziu.",
  "citationForward.issue.finding_not_bindable":
    "Zamietnuté alebo nahradené zistenie sa nedá naviazať; vyberte jeho aktuálnu prijatú verziu.",
  "citationForward.issue.scope_mixed":
    "Všetky vybrané zistenia musia patriť k rovnakej uzamknutej verzii panela a rovnakému klientovi.",
  "citationForward.issue.task_invalid": "Identita úlohy nie je platná.",
  "citationForward.issue.publication_required": "Vyberte zverejnený pokus na naviazanie.",
  "citationForward.issue.publication_task_mismatch": "Zvolený pokus bol zaznamenaný pre inú úlohu.",
  "citationForward.issue.description_required": "Opíšte zmenu.",
  "citationForward.issue.baseline_after_publication":
    "Zvolená referencia bola zhotovená po zverejnení.",
  "citationForward.issue.invalid": "Záznam nie je platný.",
  "citationForward.inspection.title": "Kontrola cieľového miesta vlastníkom",
  "citationForward.inspection.intro":
    "Otvorte presnú zverejnenú URL, porovnajte ju so schválenou snímkou a potom zaznamenajte, čo ste videli. Otvorenie odkazu ani úspešná odpoveď samy osebe nič nedosvedčujú.",
  "citationForward.inspection.open": "Otvoriť zverejnenú URL",
  "citationForward.inspection.snapshot": "Schválená snímka",
  "citationForward.inspection.result": "Čo ste videli?",
  "citationForward.inspection.shows_approved_content": "Zobrazuje schválený obsah",
  "citationForward.inspection.does_not_show": "Nezobrazuje ho",
  "citationForward.inspection.inconclusive": "Nepreukazné",
  "citationForward.inspection.record": "Zaznamenať kontrolu",
  "citationForward.inspection.baselineRequired":
    "Kladná kontrola potrebuje referenčné záznamy, na ktoré nadväzuje; najprv upravte záznam.",
  "citationForward.inspection.bindingRequired":
    "Tento záznam nemá žiadnu väzbu na zverejnenie, ktorú by bolo možné skontrolovať.",
  "citationForward.inspection.negativeNote":
    "Záporná alebo nepreukazná kontrola sa uloží a zlepšenie zostáva pre dodanie neoverené.",
  "citationForward.error.conflict":
    "Niekto uložil novšiu verziu, kým ste upravovali. Váš koncept je zachovaný; nič nebolo zapísané.",
  "citationForward.error.conflictContinue": "Pokračovať na aktuálnej verzii",
  "citationForward.error.findingUnresolved":
    "Vybrané zistenie sa v tomto rozsahu už nedá dohľadať.",
  "citationForward.error.baselineUnresolved":
    "Referenčný záznam sa v tomto projekte už nedá dohľadať.",
  "citationForward.error.bindingUnresolved":
    "Väzba na zverejnenie nezodpovedá zaznamenanému pokusu.",
  "citationForward.error.bindingUnapproved": "Naviazaná verzia nie je aktuálne schválená.",
  "citationForward.error.approvalMismatch":
    "Uvedená verzia schválenia alebo schvaľovateľ nezodpovedá skutočnému schváleniu.",
  "citationForward.error.taskMismatch": "Zverejnenie bolo zaznamenané pre inú úlohu.",
  "citationForward.error.destinationMismatch": "Cieľové miesto nezodpovedá zverejnenej URL.",
  "citationForward.error.inspectionInvalid":
    "Kontrola nie je pre toto zverejnenie platná (URL, čas alebo stav).",
  "citationForward.error.verificationUnbacked":
    "Overenie vyžaduje kladnú kontrolu zverejnenej URL vlastníkom.",
  "citationForward.error.scopeDrift": "Toto zlepšenie bolo zaznamenané pod iným rozsahom.",
  "citationForward.error.capacity": "Kapacita zlepšení pre tento projekt je vyčerpaná.",
  "citationForward.error.invalid": "Záznam bol odmietnutý ako neplatný.",
  "citationForward.error.unavailable":
    "Uloženie sa nepodarilo dokončiť. Obnovte stránku a skúste to znova.",
  "citationForward.error.loadEvidence": "Históriu zverejnení sa nepodarilo načítať.",
  "citationForward.error.loadImprovements": "Zlepšenia sa nepodarilo načítať.",
  "citationForward.readiness.title": "Pripravenosť na opakovaný test",
  "citationForward.readiness.verified":
    "Vlastníkom potvrdené odlišné zmeny: {count} z {required} požadovaných",
  "citationForward.readiness.receipts": "Iba potvrdenia konektora (nie dôkaz dodania): {count}",
  "citationForward.readiness.approvalBound": "Iba viazané na schválenie: {count}",
  "citationForward.readiness.unverified": "Neoverené: {count}",
  "citationForward.readiness.baselineMissing": "Referencia chýba: {count}",
  "citationForward.readiness.note":
    "Počty pochádzajú zo živých stavov servera; tu sa nepočíta žiadne porovnávacie kolo a potvrdenie vlastníka nikdy nie je nezávislý dôkaz.",
  "citationForward.task.pinnedTitle": "Úlohy v Pláne pripnuté k verziám zistení",
  "citationForward.task.pinnedEmpty":
    "V tomto projekte nie je žiadna úloha v Pláne pripnutá k verzii zistenia.",
  "citationForward.task.readFailed":
    "Zistenie sa nepodarilo prečítať; žiadna úloha nebola vytvorená.",
  "citationForward.task.notEligible":
    "Verzia zistenia vrátená serverom nie je tá vybraná alebo už nie je spôsobilá; žiadna úloha nebola vytvorená.",
  "citationForward.task.stale":
    "Počas čítania zistenia sa zmenil projekt alebo účet; žiadna úloha nebola vytvorená.",
  "citationForward.improvement.rowsPick": "Verzie zistení na naviazanie",
  "citationForward.improvement.useCurrent":
    "Naviazať aktuálnu verziu v{head} namiesto pripnutého riadku",
  "citationForward.improvement.publicationPartial":
    "Podarilo sa načítať len {loaded} z {total} zaznamenaných pokusov; staršie pokusy sa tu neponúkajú.",
  "citationForward.improvement.historyRow": "skoršia verzia (história)",
  "citationForward.inspection.notHead":
    "Existuje novšia verzia tohto zlepšenia. Otvorte aktuálnu verziu a skontrolujte ju.",
  "citationForward.inspection.retry": "Zopakovať rovnakú kontrolu",
  "citationForward.error.findingStale":
    "Naviazané zistenie sa od vašej kontroly tohto záznamu zmenilo. Nič nebolo zapísané; otvorte aktuálnu verziu zistenia a skontrolujte ju znova.",
  "citationForward.readiness.unavailable":
    "Pripravenosť nemožno zobraziť: živé stavy sa nepodarilo obnoviť.",
  "citationForward.improvement.approvalDelegate": "Schválil(a) poverený kontrolór: {email}",
  "citationForward.improvement.approvalNone":
    "Táto verzia nie je aktuálne schválená; pokus sa nedá naviazať.",
  "citationForward.issue.approval_unknown":
    "Stav schválenia zvoleného pokusu sa nepodarilo načítať.",
  "citationForward.issue.approval_unavailable":
    "Verzia zvoleného pokusu nie je aktuálne schválená.",
  "citationForward.task.duplicate":
    "K tejto verzii zistenia je už pripnutá úloha v Pláne (uvedená nižšie); druhá úloha nebola vytvorená. Použite ju alebo verziu výslovne pripojte k inej úlohe.",
};
