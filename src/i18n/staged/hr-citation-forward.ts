/** Croatian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const hrCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Učitavanje…",
  "citationForward.title": "Od nalaza do provjerene promjene",
  "citationForward.intro":
    "Prenesite prihvaćenu verziju nalaza u zadatak u Planu, napišite promjenu u Studiju, objavite je putem postojećeg odobrenja, a zatim zabilježite što ste stvarno pregledali na odredištu.",
  "citationForward.authority":
    "Prihvaćanje nalaza ništa ne dodjeljuje: objava i dalje zahtijeva odobrenje u Studiju i vaša uobičajena Manual/Review/Autopilot dopuštenja. Zadatak, skica, odobrenje ili potvrda konektora nikada nisu dokaz da stranica prikazuje promjenu.",
  "citationForward.findings.title": "Nalazi i zadaci u Planu",
  "citationForward.findings.empty":
    "Još nema nalaza za povezivanje (prihvaćen ili čeka drugi pregled, trenutačna verzija).",
  "citationForward.findings.pick": "Verzija nalaza",
  "citationForward.findings.pickPlaceholder": "Odaberite verziju nalaza",
  "citationForward.findings.pinned": "Prikvačeno uz v{pinned} · trenutačna v{head}",
  "citationForward.findings.state.current": "trenutačna verzija",
  "citationForward.findings.state.superseded":
    "zamijenjena novijom verzijom (prikvačenje ostaje na pregledanom retku)",
  "citationForward.findings.state.deleted": "prikvačeni redak izbrisan",
  "citationForward.findings.state.dismissed": "odbacili ste (nije moguće povezati)",
  "citationForward.findings.state.dissent": "zabilježeno neovisno neslaganje",
  "citationForward.findings.state.second_review": "čeka drugi pregled",
  "citationForward.task.create": "Stvori zadatak u Planu iz ove verzije",
  "citationForward.task.attach": "Priloži postojećem zadatku",
  "citationForward.task.attachPlaceholder": "Odaberite zadatak",
  "citationForward.task.created": "Zadatak u Planu stvoren.",
  "citationForward.task.attached": "Priloženo zadatku.",
  "citationForward.task.listTitle": "Zadaci povezani s ovom verzijom nalaza",
  "citationForward.task.listEmpty": "Nijedan zadatak nije povezan s ovom verzijom nalaza.",
  "citationForward.task.state.active": "aktivan",
  "citationForward.task.state.archived": "arhiviran",
  "citationForward.task.state.deleted": "izbrisan",
  "citationForward.task.state.missing": "nedostaje (zadatak više nije u ovom radnom prostoru)",
  "citationForward.task.localNote":
    "Identitet zadataka i veze žive u pohrani vašeg radnog prostora; ne daju pristup pregledavatelju i nisu dokaz s poslužitelja.",
  "citationForward.studio.manualDraft": "Stvori ručnu skicu u Studiju (bez AI)",
  "citationForward.studio.manualNote":
    "Ručna skica ništa ne košta i počinje prazna; put generiranja AI-jem ostaje u Planu i troši vaš mjesečni AI proračun.",
  "citationForward.studio.open": "Otvori skicu u Studiju",
  "citationForward.studio.plan": "Otvori u Planu (generiranje AI-jem)",
  "citationForward.improvement.title": "Zapis poboljšanja",
  "citationForward.improvement.intro":
    "Povežite točan objavljeni pokušaj za ovaj zadatak, verziju odobrenja koju je nosio i referentne snimke zabilježene prije njega. Svako polje veze izvodi se iz odabranog pokušaja.",
  "citationForward.improvement.start": "Zabilježi poboljšanje za ovaj zadatak",
  "citationForward.improvement.publication": "Objavljeni pokušaj",
  "citationForward.improvement.publicationNone":
    "Za ovaj zadatak još nije zabilježen nijedan objavljeni pokušaj s aktivnim URL-om. Najprije objavite putem Studija; započeti ili odbijeni pokušaj ne može se povezati.",
  "citationForward.improvement.publicationOption": "{finished} · verzija {version} · {url}",
  "citationForward.improvement.approvedBy": "Odobrio/la",
  "citationForward.improvement.approvedByOwner": "ja (vlasnik)",
  "citationForward.improvement.description": "Što se promijenilo (opis)",
  "citationForward.improvement.baselines": "Referentne snimke (prije objave)",
  "citationForward.improvement.baselinesNone":
    "Nijedna snimka u opsegu ne prethodi ovoj objavi; provjereni prije/poslije neće biti moguć za ovaj pokušaj.",
  "citationForward.improvement.baselinesHint":
    "Nude se samo snimke zabilježene prije objave. Poslužitelj to ponovno provjerava.",
  "citationForward.improvement.review": "Pregledaj točan zapis",
  "citationForward.improvement.save": "Spremi poboljšanje",
  "citationForward.improvement.retry": "Ponovi isti zapis",
  "citationForward.improvement.back": "Natrag na uređivanje",
  "citationForward.improvement.cancel": "Odustani",
  "citationForward.improvement.saved": "Spremljeno kao v{version}.",
  "citationForward.improvement.listTitle": "Poboljšanja",
  "citationForward.improvement.listEmpty":
    "Za ovaj projekt još nije zabilježeno nijedno poboljšanje.",
  "citationForward.improvement.status.unverified": "neprovjereno",
  "citationForward.improvement.status.approval_bound": "vezano uz odobrenje",
  "citationForward.improvement.status.connector_receipt":
    "potvrda konektora (samo potvrda primitka)",
  "citationForward.improvement.status.owner_attested":
    "potvrdio vlasnik (vaše opažanje, ne neovisan dokaz)",
  "citationForward.improvement.evidence.baseline_absent": "referenca nije zabilježena",
  "citationForward.improvement.evidence.baseline_missing":
    "referenca nedostaje (snimka je izbrisana ili je napustila opseg)",
  "citationForward.improvement.evidence.baseline_recorded": "referenca zabilježena",
  "citationForward.improvement.statusNote":
    "Statusi su žive vrijednosti s poslužitelja. Potvrda konektora dokazuje da je konektor odgovorio, a ne da stranica prikazuje promjenu; vlasnikova potvrda vaše je vlastito opažanje.",
  "citationForward.improvement.detailRows": "Prikvačeni retci nalaza",
  "citationForward.improvement.detailTask": "Zadatak",
  "citationForward.improvement.detailDestination": "Odredište",
  "citationForward.improvement.detailNoBinding": "Nema povezane objave (zapis skice).",
  "citationForward.improvement.remove": "Ukloni ovu verziju",
  "citationForward.improvement.removed": "Uklonjeno.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Odaberite barem jednu verziju nalaza.",
  "citationForward.issue.finding_unavailable":
    "Odabrani redak nalaza je izbrisan; odaberite trenutačnu verziju.",
  "citationForward.issue.finding_not_bindable":
    "Odbačeni ili zamijenjeni nalaz ne može se povezati; odaberite njegovu trenutačnu prihvaćenu verziju.",
  "citationForward.issue.scope_mixed":
    "Svi odabrani nalazi moraju pripadati istoj zaključanoj verziji panela i istom klijentu.",
  "citationForward.issue.task_invalid": "Identitet zadatka nije valjan.",
  "citationForward.issue.publication_required": "Odaberite objavljeni pokušaj za povezivanje.",
  "citationForward.issue.publication_task_mismatch":
    "Odabrani pokušaj zabilježen je za drugi zadatak.",
  "citationForward.issue.description_required": "Opišite promjenu.",
  "citationForward.issue.baseline_after_publication":
    "Odabrana referenca snimljena je nakon objave.",
  "citationForward.issue.invalid": "Zapis nije valjan.",
  "citationForward.inspection.title": "Vlasnikov pregled odredišta",
  "citationForward.inspection.intro":
    "Otvorite točan objavljeni URL, usporedite ga s odobrenom snimkom, a zatim zabilježite što ste vidjeli. Otvaranje poveznice ili uspješan odgovor sami po sebi ništa ne potvrđuju.",
  "citationForward.inspection.open": "Otvori objavljeni URL",
  "citationForward.inspection.snapshot": "Odobrena snimka",
  "citationForward.inspection.result": "Što ste vidjeli?",
  "citationForward.inspection.shows_approved_content": "Prikazuje odobreni sadržaj",
  "citationForward.inspection.does_not_show": "Ne prikazuje ga",
  "citationForward.inspection.inconclusive": "Neuvjerljivo",
  "citationForward.inspection.record": "Zabilježi pregled",
  "citationForward.inspection.baselineRequired":
    "Pozitivan pregled treba referentne snimke koje poboljšava; najprije uredite zapis.",
  "citationForward.inspection.bindingRequired":
    "Ovaj zapis nema vezu s objavom koju bi se moglo pregledati.",
  "citationForward.inspection.negativeNote":
    "Negativan ili neuvjerljiv pregled se pohranjuje, a poboljšanje ostaje neprovjereno za isporuku.",
  "citationForward.error.conflict":
    "Netko je spremio noviju verziju dok ste uređivali. Vaša skica je zadržana; ništa nije zapisano.",
  "citationForward.error.conflictContinue": "Nastavi na trenutačnoj verziji",
  "citationForward.error.findingUnresolved":
    "Odabrani nalaz više se ne može razriješiti u ovom opsegu.",
  "citationForward.error.baselineUnresolved":
    "Referentna snimka više se ne može razriješiti u ovom projektu.",
  "citationForward.error.bindingUnresolved": "Veza s objavom ne odgovara zabilježenom pokušaju.",
  "citationForward.error.bindingUnapproved": "Povezana verzija trenutačno nije odobrena.",
  "citationForward.error.approvalMismatch":
    "Navedena verzija odobrenja ili odobravatelj ne odgovara stvarnom odobrenju.",
  "citationForward.error.taskMismatch": "Objava je zabilježena za drugi zadatak.",
  "citationForward.error.destinationMismatch": "Odredište ne odgovara objavljenom URL-u.",
  "citationForward.error.inspectionInvalid":
    "Pregled nije valjan za ovu objavu (URL, vrijeme ili stanje).",
  "citationForward.error.verificationUnbacked":
    "Provjera zahtijeva pozitivan vlasnikov pregled objavljenog URL-a.",
  "citationForward.error.scopeDrift": "Ovo poboljšanje zabilježeno je pod drugim opsegom.",
  "citationForward.error.capacity": "Dosegnut je kapacitet poboljšanja za ovaj projekt.",
  "citationForward.error.invalid": "Zapis je odbijen kao nevaljan.",
  "citationForward.error.unavailable":
    "Spremanje nije moglo biti dovršeno. Osvježite i pokušajte ponovno.",
  "citationForward.error.loadEvidence": "Povijest objava nije moguće učitati.",
  "citationForward.error.loadImprovements": "Poboljšanja nije moguće učitati.",
  "citationForward.readiness.title": "Spremnost za ponovni test",
  "citationForward.readiness.verified":
    "Vlasnički potvrđene različite promjene: {count} od {required} potrebnih",
  "citationForward.readiness.receipts": "Samo potvrde konektora (nisu dokaz isporuke): {count}",
  "citationForward.readiness.approvalBound": "Samo vezano uz odobrenje: {count}",
  "citationForward.readiness.unverified": "Neprovjereno: {count}",
  "citationForward.readiness.baselineMissing": "Referenca nedostaje: {count}",
  "citationForward.readiness.note":
    "Brojevi dolaze iz živih statusa poslužitelja; ovdje se ne izračunava nijedan krug usporedbe, a vlasnikova potvrda nikada nije neovisan dokaz.",
  "citationForward.task.pinnedTitle": "Zadaci u Planu prikvačeni uz verzije nalaza",
  "citationForward.task.pinnedEmpty":
    "Nijedan zadatak u Planu nije prikvačen uz verziju nalaza u ovom projektu.",
  "citationForward.task.readFailed": "Nalaz nije moguće pročitati; zadatak nije stvoren.",
  "citationForward.task.notEligible":
    "Verzija nalaza koju je poslužitelj vratio nije odabrana ili više nije prihvatljiva; zadatak nije stvoren.",
  "citationForward.task.stale":
    "Projekt ili račun promijenjen je tijekom čitanja nalaza; zadatak nije stvoren.",
  "citationForward.improvement.rowsPick": "Verzije nalaza za povezivanje",
  "citationForward.improvement.useCurrent":
    "Poveži trenutačnu verziju v{head} umjesto prikvačenog retka",
  "citationForward.improvement.publicationPartial":
    "Učitano je samo {loaded} od {total} zabilježenih pokušaja; stariji pokušaji ovdje se ne nude.",
  "citationForward.improvement.historyRow": "ranija verzija (povijest)",
  "citationForward.inspection.notHead":
    "Postoji novija verzija ovog poboljšanja. Otvorite trenutačnu verziju i pregledajte nju.",
  "citationForward.inspection.retry": "Ponovi isti pregled",
  "citationForward.error.findingStale":
    "Povezani nalaz promijenio se otkako ste pregledali ovaj zapis. Ništa nije zapisano; otvorite trenutačnu verziju nalaza i ponovno pregledajte.",
  "citationForward.readiness.unavailable":
    "Spremnost nije moguće prikazati: žive statuse nije bilo moguće osvježiti.",
  "citationForward.improvement.approvalDelegate": "Odobrio delegirani pregledavatelj: {email}",
  "citationForward.improvement.approvalNone":
    "Ova verzija trenutačno nije odobrena; pokušaj se ne može povezati.",
  "citationForward.issue.approval_unknown":
    "Stanje odobrenja odabranog pokušaja nije moguće učitati.",
  "citationForward.issue.approval_unavailable":
    "Verzija odabranog pokušaja trenutačno nije odobrena.",
};
