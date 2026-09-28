/** Romanian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const roCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Se încarcă…",
  "citationForward.title": "De la constatare la schimbare verificată",
  "citationForward.intro":
    "Preluați o versiune de constatare acceptată într-o sarcină din Plan, scrieți schimbarea în Studio, publicați-o prin aprobarea existentă, apoi înregistrați ce ați inspectat efectiv la destinație.",
  "citationForward.authority":
    "Acceptarea unei constatări nu acordă nimic: publicarea are în continuare nevoie de aprobarea Studio și de permisiunile dvs. obișnuite Manual/Review/Autopilot. O sarcină, o ciornă, o aprobare sau o confirmare a conectorului nu sunt niciodată dovadă că pagina afișează schimbarea.",
  "citationForward.findings.title": "Constatări și sarcini din Plan",
  "citationForward.findings.empty":
    "Nicio constatare de legat deocamdată (acceptată sau în așteptarea celei de-a doua revizuiri, versiunea curentă).",
  "citationForward.findings.pick": "Versiunea constatării",
  "citationForward.findings.pickPlaceholder": "Alegeți o versiune a constatării",
  "citationForward.findings.pinned": "Fixat la v{pinned} · curent v{head}",
  "citationForward.findings.state.current": "versiunea curentă",
  "citationForward.findings.state.superseded":
    "înlocuită de o versiune mai nouă (fixarea rămâne pe rândul revizuit)",
  "citationForward.findings.state.deleted": "rândul fixat a fost șters",
  "citationForward.findings.state.dismissed": "respinsă de dvs. (nu se poate lega)",
  "citationForward.findings.state.dissent": "dezacord independent înregistrat",
  "citationForward.findings.state.second_review": "în așteptarea celei de-a doua revizuiri",
  "citationForward.task.create": "Creați sarcină în Plan din această versiune",
  "citationForward.task.attach": "Atașați la o sarcină existentă",
  "citationForward.task.attachPlaceholder": "Alegeți o sarcină",
  "citationForward.task.created": "Sarcina din Plan a fost creată.",
  "citationForward.task.attached": "Atașat la sarcină.",
  "citationForward.task.listTitle": "Sarcini legate de această versiune a constatării",
  "citationForward.task.listEmpty":
    "Nicio sarcină nu este legată de această versiune a constatării.",
  "citationForward.task.state.active": "activă",
  "citationForward.task.state.archived": "arhivată",
  "citationForward.task.state.deleted": "ștearsă",
  "citationForward.task.state.missing": "lipsește (sarcina nu mai este în acest spațiu de lucru)",
  "citationForward.task.localNote":
    "Identitatea și legăturile sarcinilor trăiesc în stocarea spațiului dvs. de lucru; nu acordă acces de revizor și nu sunt dovezi de server.",
  "citationForward.studio.manualDraft": "Creați o ciornă manuală în Studio (fără IA)",
  "citationForward.studio.manualNote":
    "O ciornă manuală nu costă nimic și pornește goală; calea de generare cu IA rămâne în Plan și folosește bugetul dvs. lunar de IA.",
  "citationForward.studio.open": "Deschideți ciorna în Studio",
  "citationForward.studio.plan": "Deschideți în Plan (generare IA)",
  "citationForward.improvement.title": "Înregistrare de îmbunătățire",
  "citationForward.improvement.intro":
    "Legați încercarea publicată exactă pentru această sarcină, versiunea de aprobare pe care a purtat-o și capturile de referință făcute înaintea ei. Fiecare câmp al legăturii derivă din încercarea aleasă.",
  "citationForward.improvement.start": "Înregistrați îmbunătățirea pentru această sarcină",
  "citationForward.improvement.publication": "Încercare publicată",
  "citationForward.improvement.publicationNone":
    "Nicio încercare publicată cu URL activ nu este încă înregistrată pentru această sarcină. Publicați mai întâi prin Studio; o încercare începută sau respinsă nu poate fi legată.",
  "citationForward.improvement.publicationOption": "{finished} · versiunea {version} · {url}",
  "citationForward.improvement.approvedBy": "Aprobat de",
  "citationForward.improvement.approvedByOwner": "mine (proprietar)",
  "citationForward.improvement.description": "Ce s-a schimbat (descriere)",
  "citationForward.improvement.baselines": "Capturi de referință (înainte de publicare)",
  "citationForward.improvement.baselinesNone":
    "Nicio captură din domeniu nu precede această publicare; un înainte/după verificat nu va fi posibil pentru această încercare.",
  "citationForward.improvement.baselinesHint":
    "Sunt oferite doar capturi făcute înainte de publicare. Serverul verifică din nou acest lucru.",
  "citationForward.improvement.review": "Revizuiți înregistrarea exactă",
  "citationForward.improvement.save": "Salvați îmbunătățirea",
  "citationForward.improvement.retry": "Reîncercați aceeași înregistrare",
  "citationForward.improvement.back": "Înapoi la editare",
  "citationForward.improvement.cancel": "Anulați",
  "citationForward.improvement.saved": "Salvat ca v{version}.",
  "citationForward.improvement.listTitle": "Îmbunătățiri",
  "citationForward.improvement.listEmpty":
    "Nicio îmbunătățire înregistrată încă pentru acest proiect.",
  "citationForward.improvement.status.unverified": "neverificată",
  "citationForward.improvement.status.approval_bound": "legată de aprobare",
  "citationForward.improvement.status.connector_receipt":
    "confirmare a conectorului (doar confirmare de primire)",
  "citationForward.improvement.status.owner_attested":
    "atestată de proprietar (observația dvs., nu dovadă independentă)",
  "citationForward.improvement.evidence.baseline_absent": "nicio referință înregistrată",
  "citationForward.improvement.evidence.baseline_missing":
    "referință lipsă (o captură a fost ștearsă sau a ieșit din domeniu)",
  "citationForward.improvement.evidence.baseline_recorded": "referință înregistrată",
  "citationForward.improvement.statusNote":
    "Stările sunt valori de server în timp real. O confirmare a conectorului dovedește că acesta a răspuns, nu că pagina afișează schimbarea; o atestare a proprietarului este propria dvs. observație.",
  "citationForward.improvement.detailRows": "Rânduri de constatare fixate",
  "citationForward.improvement.detailTask": "Sarcină",
  "citationForward.improvement.detailDestination": "Destinație",
  "citationForward.improvement.detailNoBinding": "Nicio publicare legată (înregistrare ciornă).",
  "citationForward.improvement.remove": "Eliminați această versiune",
  "citationForward.improvement.removed": "Eliminat.",
  "citationForward.improvement.version": "v. {version}",
  "citationForward.issue.findings_required": "Alegeți cel puțin o versiune a constatării.",
  "citationForward.issue.finding_unavailable":
    "Un rând de constatare selectat a fost șters; alegeți versiunea curentă.",
  "citationForward.issue.finding_not_bindable":
    "O constatare respinsă sau înlocuită nu poate fi legată; alegeți versiunea sa acceptată curentă.",
  "citationForward.issue.scope_mixed":
    "Toate constatările selectate trebuie să aparțină aceleiași versiuni de panou blocate și aceluiași client.",
  "citationForward.issue.task_invalid": "Identitatea sarcinii nu este validă.",
  "citationForward.issue.publication_required": "Alegeți încercarea publicată de legat.",
  "citationForward.issue.publication_task_mismatch":
    "Încercarea aleasă a fost înregistrată pentru altă sarcină.",
  "citationForward.issue.description_required": "Descrieți schimbarea.",
  "citationForward.issue.baseline_after_publication":
    "O referință aleasă a fost capturată după publicare.",
  "citationForward.issue.invalid": "Înregistrarea nu este validă.",
  "citationForward.inspection.title": "Inspecția destinației de către proprietar",
  "citationForward.inspection.intro":
    "Deschideți URL-ul publicat exact, comparați-l cu instantaneul aprobat, apoi înregistrați ce ați văzut. Deschiderea linkului sau un răspuns reușit nu atestă nimic de la sine.",
  "citationForward.inspection.open": "Deschideți URL-ul publicat",
  "citationForward.inspection.snapshot": "Instantaneu aprobat",
  "citationForward.inspection.result": "Ce ați văzut?",
  "citationForward.inspection.shows_approved_content": "Afișează conținutul aprobat",
  "citationForward.inspection.does_not_show": "Nu îl afișează",
  "citationForward.inspection.inconclusive": "Neconcludent",
  "citationForward.inspection.record": "Înregistrați inspecția",
  "citationForward.inspection.baselineRequired":
    "O inspecție pozitivă are nevoie de capturile de referință pe care le îmbunătățește; editați mai întâi înregistrarea.",
  "citationForward.inspection.bindingRequired":
    "Această înregistrare nu are nicio legătură de publicare de inspectat.",
  "citationForward.inspection.negativeNote":
    "O inspecție negativă sau neconcludentă este stocată, iar îmbunătățirea rămâne neverificată pentru livrare.",
  "citationForward.error.conflict":
    "Cineva a salvat o versiune mai nouă în timp ce editați. Ciorna dvs. este păstrată; nimic nu a fost scris.",
  "citationForward.error.conflictContinue": "Continuați pe versiunea curentă",
  "citationForward.error.findingUnresolved":
    "O constatare selectată nu se mai rezolvă în acest domeniu.",
  "citationForward.error.baselineUnresolved":
    "O captură de referință nu se mai rezolvă în acest proiect.",
  "citationForward.error.bindingUnresolved":
    "Legătura de publicare nu corespunde încercării înregistrate.",
  "citationForward.error.bindingUnapproved": "Versiunea legată nu este aprobată în prezent.",
  "citationForward.error.approvalMismatch":
    "Versiunea de aprobare sau aprobatorul declarat nu corespunde aprobării reale.",
  "citationForward.error.taskMismatch": "Publicarea a fost înregistrată pentru altă sarcină.",
  "citationForward.error.destinationMismatch": "Destinația nu corespunde URL-ului publicat.",
  "citationForward.error.inspectionInvalid":
    "Inspecția nu este validă pentru această publicare (URL, timp sau stare).",
  "citationForward.error.verificationUnbacked":
    "O verificare are nevoie de o inspecție pozitivă a proprietarului asupra URL-ului publicat.",
  "citationForward.error.scopeDrift": "Această îmbunătățire a fost înregistrată în alt domeniu.",
  "citationForward.error.capacity": "Capacitatea de îmbunătățiri a acestui proiect a fost atinsă.",
  "citationForward.error.invalid": "Înregistrarea a fost refuzată ca nevalidă.",
  "citationForward.error.unavailable":
    "Salvarea nu a putut fi finalizată. Reîmprospătați și încercați din nou.",
  "citationForward.error.loadEvidence": "Istoricul publicărilor nu a putut fi încărcat.",
  "citationForward.error.loadImprovements": "Îmbunătățirile nu au putut fi încărcate.",
  "citationForward.readiness.title": "Pregătire pentru retestare",
  "citationForward.readiness.verified":
    "Schimbări distincte atestate de proprietar: {count} din {required} necesare",
  "citationForward.readiness.receipts":
    "Doar confirmări ale conectorului (nu dovadă de livrare): {count}",
  "citationForward.readiness.approvalBound": "Doar legate de aprobare: {count}",
  "citationForward.readiness.unverified": "Neverificate: {count}",
  "citationForward.readiness.baselineMissing": "Referință lipsă: {count}",
  "citationForward.readiness.note":
    "Numărătorile provin din stări de server în timp real; aici nu se calculează nicio rundă de comparație, iar o atestare a proprietarului nu este niciodată dovadă independentă.",
  "citationForward.task.pinnedTitle": "Sarcini din Plan fixate la versiuni de constatare",
  "citationForward.task.pinnedEmpty":
    "Nicio sarcină din Plan nu este fixată la o versiune de constatare în acest proiect.",
  "citationForward.task.readFailed":
    "Constatarea nu a putut fi citită; nu a fost creată nicio sarcină.",
  "citationForward.task.notEligible":
    "Versiunea constatării returnată de server nu este cea selectată sau nu mai este eligibilă; nu a fost creată nicio sarcină.",
  "citationForward.task.stale":
    "Proiectul sau contul s-a schimbat în timp ce constatarea era citită; nu a fost creată nicio sarcină.",
  "citationForward.improvement.rowsPick": "Versiuni de constatare de legat",
  "citationForward.improvement.useCurrent":
    "Legați versiunea curentă v{head} în locul rândului fixat",
  "citationForward.improvement.publicationPartial":
    "Doar {loaded} din {total} încercări înregistrate au putut fi încărcate; încercările mai vechi nu sunt oferite aici.",
  "citationForward.improvement.historyRow": "versiune anterioară (istoric)",
  "citationForward.inspection.notHead":
    "Există o versiune mai nouă a acestei îmbunătățiri. Deschideți versiunea curentă și inspectați-o pe aceea.",
  "citationForward.inspection.retry": "Reîncercați aceeași inspecție",
  "citationForward.error.findingStale":
    "O constatare legată s-a schimbat de când ați revizuit această înregistrare. Nimic nu a fost scris; deschideți versiunea curentă a constatării și revizuiți din nou.",
  "citationForward.readiness.unavailable":
    "Pregătirea nu poate fi afișată: stările în timp real nu au putut fi reîmprospătate.",
  "citationForward.improvement.approvalDelegate": "Aprobat de un revizor delegat: {email}",
  "citationForward.improvement.approvalNone":
    "Această versiune nu este aprobată în prezent; încercarea nu poate fi legată.",
  "citationForward.issue.approval_unknown":
    "Starea de aprobare a încercării alese nu a putut fi încărcată.",
  "citationForward.issue.approval_unavailable":
    "Versiunea încercării alese nu este aprobată în prezent.",
  "citationForward.task.duplicate":
    "O sarcină din Plan este deja fixată la această versiune a constatării (listată mai jos); nu a fost creată o a doua sarcină. Folosiți-o sau atașați explicit versiunea la altă sarcină.",
};
