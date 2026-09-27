/** Slovenian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const slCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Nalaganje…",
  "citationForward.title": "Od ugotovitve do preverjene spremembe",
  "citationForward.intro":
    "Prenesite sprejeto različico ugotovitve v nalogo v Planu, zapišite spremembo v Studiu, jo objavite prek obstoječe odobritve in nato zabeležite, kaj ste na cilju dejansko pregledali.",
  "citationForward.authority":
    "Sprejetje ugotovitve ne podeljuje ničesar: objava še vedno zahteva odobritev v Studiu in vaša običajna dovoljenja Manual/Review/Autopilot. Naloga, osnutek, odobritev ali potrditev priključka nikoli niso dokaz, da stran prikazuje spremembo.",
  "citationForward.findings.title": "Ugotovitve in naloge v Planu",
  "citationForward.findings.empty":
    "Še ni ugotovitve za povezavo (sprejeta ali čaka na drugi pregled, trenutna različica).",
  "citationForward.findings.pick": "Različica ugotovitve",
  "citationForward.findings.pickPlaceholder": "Izberite različico ugotovitve",
  "citationForward.findings.pinned": "Pripeto na r{pinned} · trenutna r{head}",
  "citationForward.findings.state.current": "trenutna različica",
  "citationForward.findings.state.superseded":
    "nadomeščena z novejšo različico (pripetje ostane na pregledani vrstici)",
  "citationForward.findings.state.deleted": "pripeta vrstica izbrisana",
  "citationForward.findings.state.dismissed": "zavrnili ste (ni mogoče povezati)",
  "citationForward.findings.state.dissent": "zabeleženo neodvisno nestrinjanje",
  "citationForward.findings.state.second_review": "čaka na drugi pregled",
  "citationForward.task.create": "Ustvari nalogo v Planu iz te različice",
  "citationForward.task.attach": "Pripni obstoječi nalogi",
  "citationForward.task.attachPlaceholder": "Izberite nalogo",
  "citationForward.task.created": "Naloga v Planu ustvarjena.",
  "citationForward.task.attached": "Pripeto nalogi.",
  "citationForward.task.listTitle": "Naloge, povezane s to različico ugotovitve",
  "citationForward.task.listEmpty": "S to različico ugotovitve ni povezana nobena naloga.",
  "citationForward.task.state.active": "aktivna",
  "citationForward.task.state.archived": "arhivirana",
  "citationForward.task.state.deleted": "izbrisana",
  "citationForward.task.state.missing": "manjka (naloga ni več v tem delovnem prostoru)",
  "citationForward.task.localNote":
    "Identiteta nalog in povezave živijo v shrambi vašega delovnega prostora; ne podeljujejo dostopa pregledovalca in niso dokaz s strežnika.",
  "citationForward.studio.manualDraft": "Ustvari ročni osnutek v Studiu (brez UI)",
  "citationForward.studio.manualNote":
    "Ročni osnutek ne stane nič in se začne prazen; pot generiranja z UI ostaja v Planu in porablja vaš mesečni proračun za UI.",
  "citationForward.studio.open": "Odpri osnutek v Studiu",
  "citationForward.studio.plan": "Odpri v Planu (generiranje z UI)",
  "citationForward.improvement.title": "Zapis izboljšave",
  "citationForward.improvement.intro":
    "Povežite natančen objavljeni poskus za to nalogo, različico odobritve, ki jo je nosil, in referenčne zajeme, posnete pred njim. Vsako polje povezave izhaja iz izbranega poskusa.",
  "citationForward.improvement.start": "Zabeleži izboljšavo za to nalogo",
  "citationForward.improvement.publication": "Objavljeni poskus",
  "citationForward.improvement.publicationNone":
    "Za to nalogo še ni zabeležen noben objavljeni poskus z živim URL-jem. Najprej objavite prek Studia; začetega ali zavrnjenega poskusa ni mogoče povezati.",
  "citationForward.improvement.publicationOption": "{finished} · različica {version} · {url}",
  "citationForward.improvement.approvedBy": "Odobril(a)",
  "citationForward.improvement.approvedByOwner": "jaz (lastnik)",
  "citationForward.improvement.description": "Kaj se je spremenilo (opis)",
  "citationForward.improvement.baselines": "Referenčni zajemi (pred objavo)",
  "citationForward.improvement.baselinesNone":
    "Noben zajem v obsegu ne predhodi tej objavi; preverjeno prej/potem za ta poskus ne bo mogoče.",
  "citationForward.improvement.baselinesHint":
    "Ponujeni so samo zajemi, posneti pred objavo. Strežnik to znova preveri.",
  "citationForward.improvement.review": "Preglej natančen zapis",
  "citationForward.improvement.save": "Shrani izboljšavo",
  "citationForward.improvement.retry": "Ponovi isti zapis",
  "citationForward.improvement.back": "Nazaj na urejanje",
  "citationForward.improvement.cancel": "Prekliči",
  "citationForward.improvement.saved": "Shranjeno kot r{version}.",
  "citationForward.improvement.listTitle": "Izboljšave",
  "citationForward.improvement.listEmpty": "Za ta projekt še ni zabeležena nobena izboljšava.",
  "citationForward.improvement.status.unverified": "nepreverjeno",
  "citationForward.improvement.status.approval_bound": "vezano na odobritev",
  "citationForward.improvement.status.connector_receipt":
    "potrdilo priključka (samo potrditev prejema)",
  "citationForward.improvement.status.owner_attested":
    "potrdil lastnik (vaše opažanje, ne neodvisen dokaz)",
  "citationForward.improvement.evidence.baseline_absent": "referenca ni zabeležena",
  "citationForward.improvement.evidence.baseline_missing":
    "referenca manjka (zajem je bil izbrisan ali je zapustil obseg)",
  "citationForward.improvement.evidence.baseline_recorded": "referenca zabeležena",
  "citationForward.improvement.statusNote":
    "Stanja so žive vrednosti s strežnika. Potrdilo priključka dokazuje, da je priključek odgovoril, ne da stran prikazuje spremembo; lastnikovo potrdilo je vaše lastno opažanje.",
  "citationForward.improvement.detailRows": "Pripete vrstice ugotovitev",
  "citationForward.improvement.detailTask": "Naloga",
  "citationForward.improvement.detailDestination": "Cilj",
  "citationForward.improvement.detailNoBinding": "Nobena objava ni povezana (osnutek zapisa).",
  "citationForward.improvement.remove": "Odstrani to različico",
  "citationForward.improvement.removed": "Odstranjeno.",
  "citationForward.improvement.version": "r{version}",
  "citationForward.issue.findings_required": "Izberite vsaj eno različico ugotovitve.",
  "citationForward.issue.finding_unavailable":
    "Izbrana vrstica ugotovitve je bila izbrisana; izberite trenutno različico.",
  "citationForward.issue.finding_not_bindable":
    "Zavrnjene ali nadomeščene ugotovitve ni mogoče povezati; izberite njeno trenutno sprejeto različico.",
  "citationForward.issue.scope_mixed":
    "Vse izbrane ugotovitve morajo pripadati isti zaklenjeni različici plošče in istemu naročniku.",
  "citationForward.issue.task_invalid": "Identiteta naloge ni veljavna.",
  "citationForward.issue.publication_required": "Izberite objavljeni poskus za povezavo.",
  "citationForward.issue.publication_task_mismatch":
    "Izbrani poskus je bil zabeležen za drugo nalogo.",
  "citationForward.issue.description_required": "Opišite spremembo.",
  "citationForward.issue.baseline_after_publication": "Izbrana referenca je bila zajeta po objavi.",
  "citationForward.issue.invalid": "Zapis ni veljaven.",
  "citationForward.inspection.title": "Lastnikov pregled cilja",
  "citationForward.inspection.intro":
    "Odprite natančen objavljeni URL, ga primerjajte z odobrenim posnetkom in nato zabeležite, kaj ste videli. Odpiranje povezave ali uspešen odgovor sama po sebi ničesar ne potrjujeta.",
  "citationForward.inspection.open": "Odpri objavljeni URL",
  "citationForward.inspection.snapshot": "Odobreni posnetek",
  "citationForward.inspection.result": "Kaj ste videli?",
  "citationForward.inspection.shows_approved_content": "Prikazuje odobreno vsebino",
  "citationForward.inspection.does_not_show": "Je ne prikazuje",
  "citationForward.inspection.inconclusive": "Neprepričljivo",
  "citationForward.inspection.record": "Zabeleži pregled",
  "citationForward.inspection.baselineRequired":
    "Pozitiven pregled potrebuje referenčne zajeme, ki jih izboljšuje; najprej uredite zapis.",
  "citationForward.inspection.bindingRequired":
    "Ta zapis nima povezave z objavo, ki bi jo bilo mogoče pregledati.",
  "citationForward.inspection.negativeNote":
    "Negativen ali neprepričljiv pregled se shrani, izboljšava pa ostane za dostavo nepreverjena.",
  "citationForward.error.conflict":
    "Nekdo je med vašim urejanjem shranil novejšo različico. Vaš osnutek je ohranjen; nič ni bilo zapisano.",
  "citationForward.error.conflictContinue": "Nadaljuj na trenutni različici",
  "citationForward.error.findingUnresolved":
    "Izbrane ugotovitve v tem obsegu ni več mogoče razrešiti.",
  "citationForward.error.baselineUnresolved":
    "Referenčnega zajema v tem projektu ni več mogoče razrešiti.",
  "citationForward.error.bindingUnresolved":
    "Povezava z objavo se ne ujema z zabeleženim poskusom.",
  "citationForward.error.bindingUnapproved": "Povezana različica trenutno ni odobrena.",
  "citationForward.error.approvalMismatch":
    "Navedena različica odobritve ali odobritelj se ne ujema z dejansko odobritvijo.",
  "citationForward.error.taskMismatch": "Objava je bila zabeležena za drugo nalogo.",
  "citationForward.error.destinationMismatch": "Cilj se ne ujema z objavljenim URL-jem.",
  "citationForward.error.inspectionInvalid":
    "Pregled za to objavo ni veljaven (URL, čas ali stanje).",
  "citationForward.error.verificationUnbacked":
    "Preverjanje zahteva pozitiven lastnikov pregled objavljenega URL-ja.",
  "citationForward.error.scopeDrift": "Ta izboljšava je bila zabeležena v drugem obsegu.",
  "citationForward.error.capacity": "Zmogljivost izboljšav za ta projekt je dosežena.",
  "citationForward.error.invalid": "Zapis je bil zavrnjen kot neveljaven.",
  "citationForward.error.unavailable":
    "Shranjevanja ni bilo mogoče dokončati. Osvežite in poskusite znova.",
  "citationForward.error.loadEvidence": "Zgodovine objav ni bilo mogoče naložiti.",
  "citationForward.error.loadImprovements": "Izboljšav ni bilo mogoče naložiti.",
  "citationForward.readiness.title": "Pripravljenost za ponovni test",
  "citationForward.readiness.verified":
    "Lastnikovo potrjene različne spremembe: {count} od {required} zahtevanih",
  "citationForward.readiness.receipts": "Samo potrdila priključka (niso dokaz dostave): {count}",
  "citationForward.readiness.approvalBound": "Samo vezano na odobritev: {count}",
  "citationForward.readiness.unverified": "Nepreverjeno: {count}",
  "citationForward.readiness.baselineMissing": "Referenca manjka: {count}",
  "citationForward.readiness.note":
    "Števila izhajajo iz živih stanj strežnika; tu se ne izračuna noben krog primerjave in lastnikovo potrdilo nikoli ni neodvisen dokaz.",
  "citationForward.task.pinnedTitle": "Naloge v Planu, pripete na različice ugotovitev",
  "citationForward.task.pinnedEmpty":
    "V tem projektu nobena naloga v Planu ni pripeta na različico ugotovitve.",
  "citationForward.task.readFailed":
    "Ugotovitve ni bilo mogoče prebrati; naloga ni bila ustvarjena.",
  "citationForward.task.notEligible":
    "Različica ugotovitve, ki jo je vrnil strežnik, ni izbrana ali ni več ustrezna; naloga ni bila ustvarjena.",
  "citationForward.task.stale":
    "Projekt ali račun se je med branjem ugotovitve spremenil; naloga ni bila ustvarjena.",
  "citationForward.improvement.rowsPick": "Različice ugotovitev za povezavo",
  "citationForward.improvement.useCurrent":
    "Poveži trenutno različico r{head} namesto pripete vrstice",
  "citationForward.improvement.publicationPartial":
    "Naložiti je bilo mogoče samo {loaded} od {total} zabeleženih poskusov; starejši poskusi tu niso ponujeni.",
  "citationForward.improvement.historyRow": "prejšnja različica (zgodovina)",
  "citationForward.inspection.notHead":
    "Obstaja novejša različica te izboljšave. Odprite trenutno različico in preglejte njo.",
  "citationForward.inspection.retry": "Ponovi isti pregled",
  "citationForward.error.findingStale":
    "Povezana ugotovitev se je spremenila, odkar ste pregledali ta zapis. Nič ni bilo zapisano; odprite trenutno različico ugotovitve in znova preglejte.",
  "citationForward.readiness.unavailable":
    "Pripravljenosti ni mogoče prikazati: živih stanj ni bilo mogoče osvežiti.",
  "citationForward.improvement.approvalDelegate": "Odobril pooblaščeni pregledovalec: {email}",
  "citationForward.improvement.approvalNone":
    "Ta različica trenutno ni odobrena; poskusa ni mogoče povezati.",
  "citationForward.issue.approval_unknown":
    "Stanja odobritve izbranega poskusa ni bilo mogoče naložiti.",
  "citationForward.issue.approval_unavailable": "Različica izbranega poskusa trenutno ni odobrena.",
};
