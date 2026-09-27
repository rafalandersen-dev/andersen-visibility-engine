/** Hungarian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const huCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Betöltés…",
  "citationForward.title": "A megállapítástól az ellenőrzött változtatásig",
  "citationForward.intro":
    "Vigyen át egy elfogadott megállapítás-verziót egy Plan-feladatba, írja meg a változtatást a Studióban, tegye közzé a meglévő jóváhagyáson keresztül, majd rögzítse, mit ellenőrzött ténylegesen a célhelyen.",
  "citationForward.authority":
    "Egy megállapítás elfogadása semmit sem ad: a közzétételhez továbbra is a Studio jóváhagyása és a szokásos Manual/Review/Autopilot jogosultságai kellenek. Egy feladat, egy piszkozat, egy jóváhagyás vagy egy csatlakozó visszaigazolása sosem bizonyítja, hogy az oldal mutatja a változtatást.",
  "citationForward.findings.title": "Megállapítások és Plan-feladatok",
  "citationForward.findings.empty":
    "Még nincs köthető megállapítás (elfogadott vagy második ellenőrzésre váró, aktuális verzió).",
  "citationForward.findings.pick": "Megállapítás verziója",
  "citationForward.findings.pickPlaceholder": "Válasszon megállapítás-verziót",
  "citationForward.findings.pinned": "Rögzítve: v{pinned} · aktuális: v{head}",
  "citationForward.findings.state.current": "aktuális verzió",
  "citationForward.findings.state.superseded":
    "újabb verzió váltotta fel (a rögzítés az ellenőrzött soron marad)",
  "citationForward.findings.state.deleted": "a rögzített sor törölve",
  "citationForward.findings.state.dismissed": "Ön elutasította (nem köthető)",
  "citationForward.findings.state.dissent": "független ellenvélemény rögzítve",
  "citationForward.findings.state.second_review": "második ellenőrzésre vár",
  "citationForward.task.create": "Plan-feladat létrehozása ebből a verzióból",
  "citationForward.task.attach": "Csatolás meglévő feladathoz",
  "citationForward.task.attachPlaceholder": "Válasszon feladatot",
  "citationForward.task.created": "Plan-feladat létrehozva.",
  "citationForward.task.attached": "Csatolva a feladathoz.",
  "citationForward.task.listTitle": "Ehhez a megállapítás-verzióhoz kapcsolt feladatok",
  "citationForward.task.listEmpty": "Ehhez a megállapítás-verzióhoz nincs kapcsolt feladat.",
  "citationForward.task.state.active": "aktív",
  "citationForward.task.state.archived": "archivált",
  "citationForward.task.state.deleted": "törölt",
  "citationForward.task.state.missing": "hiányzik (a feladat már nincs ebben a munkaterületben)",
  "citationForward.task.localNote":
    "A feladatok azonossága és kapcsolatai a munkaterület tárolójában élnek; nem adnak ellenőrzői hozzáférést, és nem szerveroldali bizonyítékok.",
  "citationForward.studio.manualDraft": "Kézi piszkozat létrehozása a Studióban (MI nélkül)",
  "citationForward.studio.manualNote":
    "A kézi piszkozat nem kerül semmibe és üresen indul; az MI-generálás útja a Planban marad, és a havi MI-keretet használja.",
  "citationForward.studio.open": "Piszkozat megnyitása a Studióban",
  "citationForward.studio.plan": "Megnyitás a Planban (MI-generálás)",
  "citationForward.improvement.title": "Javítási bejegyzés",
  "citationForward.improvement.intro":
    "Kösse össze a feladat pontos közzétett kísérletét, az általa hordozott jóváhagyási verziót és az előtte készült alapfelvételeket. Minden kötési mező a kiválasztott kísérletből származik.",
  "citationForward.improvement.start": "Javítás rögzítése ehhez a feladathoz",
  "citationForward.improvement.publication": "Közzétett kísérlet",
  "citationForward.improvement.publicationNone":
    "Ehhez a feladathoz még nincs rögzítve élő URL-lel rendelkező közzétett kísérlet. Először tegye közzé a Studión keresztül; megkezdett vagy elutasított kísérlet nem köthető.",
  "citationForward.improvement.publicationOption": "{finished} · {version} verzió · {url}",
  "citationForward.improvement.approvedBy": "Jóváhagyta",
  "citationForward.improvement.approvedByOwner": "én (tulajdonos)",
  "citationForward.improvement.description": "Mi változott (leírás)",
  "citationForward.improvement.baselines": "Alapfelvételek (a közzététel előtt)",
  "citationForward.improvement.baselinesNone":
    "Egyetlen hatókörön belüli felvétel sem előzi meg ezt a közzétételt; ehhez a kísérlethez ellenőrzött előtte/utána nem lesz lehetséges.",
  "citationForward.improvement.baselinesHint":
    "Csak a közzététel előtt készült felvételek választhatók. A szerver ezt újra ellenőrzi.",
  "citationForward.improvement.review": "A pontos bejegyzés áttekintése",
  "citationForward.improvement.save": "Javítás mentése",
  "citationForward.improvement.retry": "Ugyanazon bejegyzés újraküldése",
  "citationForward.improvement.back": "Vissza a szerkesztéshez",
  "citationForward.improvement.cancel": "Mégse",
  "citationForward.improvement.saved": "Mentve v{version} néven.",
  "citationForward.improvement.listTitle": "Javítások",
  "citationForward.improvement.listEmpty": "Ehhez a projekthez még nincs rögzített javítás.",
  "citationForward.improvement.status.unverified": "nem ellenőrzött",
  "citationForward.improvement.status.approval_bound": "jóváhagyáshoz kötött",
  "citationForward.improvement.status.connector_receipt":
    "csatlakozó visszaigazolása (csak nyugtázás)",
  "citationForward.improvement.status.owner_attested":
    "tulajdonos által tanúsított (az Ön megfigyelése, nem független bizonyíték)",
  "citationForward.improvement.evidence.baseline_absent": "nincs rögzített alap",
  "citationForward.improvement.evidence.baseline_missing":
    "hiányzó alap (egy felvételt töröltek vagy kikerült a hatókörből)",
  "citationForward.improvement.evidence.baseline_recorded": "alap rögzítve",
  "citationForward.improvement.statusNote":
    "Az állapotok élő szerverértékek. A csatlakozó visszaigazolása azt bizonyítja, hogy a csatlakozó válaszolt, nem azt, hogy az oldal mutatja a változtatást; a tulajdonosi tanúsítás az Ön saját megfigyelése.",
  "citationForward.improvement.detailRows": "Rögzített megállapítás-sorok",
  "citationForward.improvement.detailTask": "Feladat",
  "citationForward.improvement.detailDestination": "Célhely",
  "citationForward.improvement.detailNoBinding": "Nincs kötött közzététel (piszkozat-bejegyzés).",
  "citationForward.improvement.remove": "Ennek a verziónak az eltávolítása",
  "citationForward.improvement.removed": "Eltávolítva.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Válasszon legalább egy megállapítás-verziót.",
  "citationForward.issue.finding_unavailable":
    "Egy kiválasztott megállapítás-sort töröltek; válassza az aktuális verziót.",
  "citationForward.issue.finding_not_bindable":
    "Elutasított vagy felváltott megállapítás nem köthető; válassza az aktuális elfogadott verzióját.",
  "citationForward.issue.scope_mixed":
    "Minden kiválasztott megállapításnak ugyanahhoz a zárolt panelverzióhoz és ugyanahhoz az ügyfélhez kell tartoznia.",
  "citationForward.issue.task_invalid": "A feladat azonossága érvénytelen.",
  "citationForward.issue.publication_required": "Válassza ki a kötendő közzétett kísérletet.",
  "citationForward.issue.publication_task_mismatch":
    "A kiválasztott kísérletet másik feladathoz rögzítették.",
  "citationForward.issue.description_required": "Írja le a változtatást.",
  "citationForward.issue.baseline_after_publication":
    "Egy kiválasztott alapfelvétel a közzététel után készült.",
  "citationForward.issue.invalid": "A bejegyzés érvénytelen.",
  "citationForward.inspection.title": "A célhely tulajdonosi ellenőrzése",
  "citationForward.inspection.intro":
    "Nyissa meg a pontos közzétett URL-t, hasonlítsa össze a jóváhagyott pillanatképpel, majd rögzítse, mit látott. A hivatkozás megnyitása vagy egy sikeres válasz önmagában semmit sem tanúsít.",
  "citationForward.inspection.open": "Közzétett URL megnyitása",
  "citationForward.inspection.snapshot": "Jóváhagyott pillanatkép",
  "citationForward.inspection.result": "Mit látott?",
  "citationForward.inspection.shows_approved_content": "A jóváhagyott tartalmat mutatja",
  "citationForward.inspection.does_not_show": "Nem mutatja",
  "citationForward.inspection.inconclusive": "Nem egyértelmű",
  "citationForward.inspection.record": "Ellenőrzés rögzítése",
  "citationForward.inspection.baselineRequired":
    "A pozitív ellenőrzéshez kellenek az alapfelvételek, amelyekhez képest javít; előbb szerkessze a bejegyzést.",
  "citationForward.inspection.bindingRequired":
    "Ennek a bejegyzésnek nincs ellenőrizhető közzétételi kötése.",
  "citationForward.inspection.negativeNote":
    "A negatív vagy nem egyértelmű ellenőrzés tárolódik, a javítás pedig a kézbesítés szempontjából nem ellenőrzött marad.",
  "citationForward.error.conflict":
    "Valaki újabb verziót mentett, miközben Ön szerkesztett. A piszkozata megmaradt; semmi sem íródott.",
  "citationForward.error.conflictContinue": "Folytatás az aktuális verzión",
  "citationForward.error.findingUnresolved":
    "Egy kiválasztott megállapítás ebben a hatókörben már nem oldható fel.",
  "citationForward.error.baselineUnresolved":
    "Egy alapfelvétel ebben a projektben már nem oldható fel.",
  "citationForward.error.bindingUnresolved":
    "A közzétételi kötés nem egyezik a rögzített kísérlettel.",
  "citationForward.error.bindingUnapproved": "A kötött verzió jelenleg nincs jóváhagyva.",
  "citationForward.error.approvalMismatch":
    "A megadott jóváhagyási verzió vagy jóváhagyó nem egyezik a tényleges jóváhagyással.",
  "citationForward.error.taskMismatch": "A közzétételt másik feladathoz rögzítették.",
  "citationForward.error.destinationMismatch": "A célhely nem egyezik a közzétett URL-lel.",
  "citationForward.error.inspectionInvalid":
    "Az ellenőrzés nem érvényes ehhez a közzétételhez (URL, idő vagy állapot).",
  "citationForward.error.verificationUnbacked":
    "Az igazoláshoz a közzétett URL pozitív tulajdonosi ellenőrzése szükséges.",
  "citationForward.error.scopeDrift": "Ezt a javítást másik hatókörben rögzítették.",
  "citationForward.error.capacity": "Elérte a projekt javítási kapacitását.",
  "citationForward.error.invalid": "A bejegyzést érvénytelenként elutasították.",
  "citationForward.error.unavailable": "A mentés nem fejeződött be. Frissítsen, és próbálja újra.",
  "citationForward.error.loadEvidence": "A közzétételi előzményeket nem sikerült betölteni.",
  "citationForward.error.loadImprovements": "A javításokat nem sikerült betölteni.",
  "citationForward.readiness.title": "Készenlét az újratesztelésre",
  "citationForward.readiness.verified":
    "Tulajdonos által tanúsított különböző változtatások: {count} a szükséges {required} közül",
  "citationForward.readiness.receipts":
    "Csak csatlakozó-visszaigazolások (nem kézbesítési bizonyíték): {count}",
  "citationForward.readiness.approvalBound": "Csak jóváhagyáshoz kötött: {count}",
  "citationForward.readiness.unverified": "Nem ellenőrzött: {count}",
  "citationForward.readiness.baselineMissing": "Hiányzó alap: {count}",
  "citationForward.readiness.note":
    "A számok élő szerverállapotokból származnak; itt nem számolunk összehasonlítási kört, és a tulajdonosi tanúsítás sosem független bizonyíték.",
  "citationForward.task.pinnedTitle": "Megállapítás-verziókhoz rögzített Plan-feladatok",
  "citationForward.task.pinnedEmpty":
    "Ebben a projektben egyetlen Plan-feladat sincs megállapítás-verzióhoz rögzítve.",
  "citationForward.task.readFailed":
    "A megállapítást nem sikerült beolvasni; nem jött létre feladat.",
  "citationForward.task.notEligible":
    "A szerver által visszaadott megállapítás-verzió nem a kiválasztott, vagy már nem jogosult; nem jött létre feladat.",
  "citationForward.task.stale":
    "A projekt vagy a fiók megváltozott a megállapítás beolvasása közben; nem jött létre feladat.",
  "citationForward.improvement.rowsPick": "Kötendő megállapítás-verziók",
  "citationForward.improvement.useCurrent":
    "Az aktuális v{head} verzió kötése a rögzített sor helyett",
  "citationForward.improvement.publicationPartial":
    "Csak {loaded} tölthető be a {total} rögzített kísérletből; a régebbi kísérletek itt nem választhatók.",
  "citationForward.improvement.historyRow": "korábbi verzió (előzmény)",
  "citationForward.inspection.notHead":
    "Ennek a javításnak van újabb verziója. Nyissa meg az aktuális verziót, és azt ellenőrizze.",
  "citationForward.inspection.retry": "Ugyanazon ellenőrzés újraküldése",
  "citationForward.error.findingStale":
    "Egy kötött megállapítás megváltozott, mióta áttekintette ezt a bejegyzést. Semmi sem íródott; nyissa meg a megállapítás aktuális verzióját, és tekintse át újra.",
  "citationForward.readiness.unavailable":
    "A készenlét nem jeleníthető meg: az élő állapotokat nem sikerült frissíteni.",
  "citationForward.improvement.approvalDelegate": "Meghatalmazott ellenőrző hagyta jóvá: {email}",
  "citationForward.improvement.approvalNone":
    "Ez a verzió jelenleg nincs jóváhagyva; a kísérlet nem köthető.",
  "citationForward.issue.approval_unknown":
    "A kiválasztott kísérlet jóváhagyási állapotát nem sikerült betölteni.",
  "citationForward.issue.approval_unavailable":
    "A kiválasztott kísérlet verziója jelenleg nincs jóváhagyva.",
  "citationForward.task.duplicate":
    "Ehhez a megállapítás-verzióhoz már rögzítve van egy Plan-feladat (lent felsorolva); második feladat nem jött létre. Használja azt, vagy csatolja a verziót kifejezetten egy másik feladathoz.",
};
