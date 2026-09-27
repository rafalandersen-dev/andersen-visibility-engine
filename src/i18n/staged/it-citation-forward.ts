/** Italian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const itCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Caricamento…",
  "citationForward.title": "Dal rilievo al cambiamento verificato",
  "citationForward.intro":
    "Porta una versione di rilievo accettata in un'attività del Plan, scrivi la modifica in Studio, pubblicala tramite l'approvazione esistente e poi registra ciò che hai effettivamente ispezionato alla destinazione.",
  "citationForward.authority":
    "Accettare un rilievo non concede nulla: la pubblicazione richiede ancora l'approvazione di Studio e i tuoi normali permessi Manual/Review/Autopilot. Un'attività, una bozza, un'approvazione o una conferma del connettore non provano mai che la pagina mostri la modifica.",
  "citationForward.findings.title": "Rilievi e attività del Plan",
  "citationForward.findings.empty":
    "Nessun rilievo collegabile per ora (accettato o in attesa di seconda revisione, versione corrente).",
  "citationForward.findings.pick": "Versione del rilievo",
  "citationForward.findings.pickPlaceholder": "Scegli una versione del rilievo",
  "citationForward.findings.pinned": "Fissato a v{pinned} · corrente v{head}",
  "citationForward.findings.state.current": "versione corrente",
  "citationForward.findings.state.superseded":
    "sostituita da una versione più recente (il fissaggio resta sulla riga revisionata)",
  "citationForward.findings.state.deleted": "riga fissata eliminata",
  "citationForward.findings.state.dismissed": "scartato da te (non collegabile)",
  "citationForward.findings.state.dissent": "dissenso indipendente registrato",
  "citationForward.findings.state.second_review": "in attesa di seconda revisione",
  "citationForward.task.create": "Crea attività del Plan da questa versione",
  "citationForward.task.attach": "Allega a un'attività esistente",
  "citationForward.task.attachPlaceholder": "Scegli un'attività",
  "citationForward.task.created": "Attività del Plan creata.",
  "citationForward.task.attached": "Allegato all'attività.",
  "citationForward.task.listTitle": "Attività collegate a questa versione del rilievo",
  "citationForward.task.listEmpty": "Nessuna attività è collegata a questa versione del rilievo.",
  "citationForward.task.state.active": "attiva",
  "citationForward.task.state.archived": "archiviata",
  "citationForward.task.state.deleted": "eliminata",
  "citationForward.task.state.missing": "mancante (attività non più in questo spazio di lavoro)",
  "citationForward.task.localNote":
    "L'identità e i collegamenti delle attività vivono nell'archivio del tuo spazio di lavoro; non concedono accesso ai revisori e non sono prove del server.",
  "citationForward.studio.manualDraft": "Crea bozza manuale in Studio (senza IA)",
  "citationForward.studio.manualNote":
    "Una bozza manuale non costa nulla e parte vuota; la generazione con IA resta nel Plan e usa il tuo budget IA mensile.",
  "citationForward.studio.open": "Apri bozza in Studio",
  "citationForward.studio.plan": "Apri nel Plan (generazione IA)",
  "citationForward.improvement.title": "Registrazione del miglioramento",
  "citationForward.improvement.intro":
    "Collega il tentativo pubblicato esatto per questa attività, la versione di approvazione che portava e le acquisizioni di riferimento prese prima. Ogni campo del collegamento deriva dal tentativo scelto.",
  "citationForward.improvement.start": "Registra miglioramento per questa attività",
  "citationForward.improvement.publication": "Tentativo pubblicato",
  "citationForward.improvement.publicationNone":
    "Per questa attività non è ancora registrato alcun tentativo pubblicato con URL attivo. Pubblica prima tramite Studio; un tentativo avviato o respinto non può essere collegato.",
  "citationForward.improvement.publicationOption": "{finished} · versione {version} · {url}",
  "citationForward.improvement.approvedBy": "Approvato da",
  "citationForward.improvement.approvedByOwner": "me (titolare)",
  "citationForward.improvement.description": "Cosa è cambiato (descrizione)",
  "citationForward.improvement.baselines":
    "Acquisizioni di riferimento (prima della pubblicazione)",
  "citationForward.improvement.baselinesNone":
    "Nessuna acquisizione nell'ambito precede questa pubblicazione; un prima/dopo verificato non sarà possibile per questo tentativo.",
  "citationForward.improvement.baselinesHint":
    "Vengono offerte solo acquisizioni prese prima della pubblicazione. Il server lo verifica di nuovo.",
  "citationForward.improvement.review": "Rivedi la registrazione esatta",
  "citationForward.improvement.save": "Salva miglioramento",
  "citationForward.improvement.retry": "Riprova con la stessa registrazione",
  "citationForward.improvement.back": "Torna alla modifica",
  "citationForward.improvement.cancel": "Annulla",
  "citationForward.improvement.saved": "Salvato come v{version}.",
  "citationForward.improvement.listTitle": "Miglioramenti",
  "citationForward.improvement.listEmpty":
    "Nessun miglioramento registrato per questo progetto, per ora.",
  "citationForward.improvement.status.unverified": "non verificato",
  "citationForward.improvement.status.approval_bound": "collegato all'approvazione",
  "citationForward.improvement.status.connector_receipt": "ricevuta del connettore (solo conferma)",
  "citationForward.improvement.status.owner_attested":
    "attestato dal titolare (la tua osservazione, non una prova indipendente)",
  "citationForward.improvement.evidence.baseline_absent": "nessun riferimento registrato",
  "citationForward.improvement.evidence.baseline_missing":
    "riferimento mancante (un'acquisizione è stata eliminata o è uscita dall'ambito)",
  "citationForward.improvement.evidence.baseline_recorded": "riferimento registrato",
  "citationForward.improvement.statusNote":
    "Gli stati sono valori del server in tempo reale. Una ricevuta del connettore prova che il connettore ha risposto, non che la pagina mostri la modifica; un'attestazione del titolare è la tua osservazione.",
  "citationForward.improvement.detailRows": "Righe di rilievo fissate",
  "citationForward.improvement.detailTask": "Attività",
  "citationForward.improvement.detailDestination": "Destinazione",
  "citationForward.improvement.detailNoBinding":
    "Nessuna pubblicazione collegata (registrazione bozza).",
  "citationForward.improvement.remove": "Rimuovi questa versione",
  "citationForward.improvement.removed": "Rimosso.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Scegli almeno una versione del rilievo.",
  "citationForward.issue.finding_unavailable":
    "Una riga di rilievo selezionata è stata eliminata; scegli la versione corrente.",
  "citationForward.issue.finding_not_bindable":
    "Un rilievo scartato o sostituito non può essere collegato; scegli la sua versione accettata corrente.",
  "citationForward.issue.scope_mixed":
    "Tutti i rilievi selezionati devono appartenere alla stessa versione di pannello bloccata e allo stesso cliente.",
  "citationForward.issue.task_invalid": "L'identità dell'attività non è valida.",
  "citationForward.issue.publication_required": "Scegli il tentativo pubblicato da collegare.",
  "citationForward.issue.publication_task_mismatch":
    "Il tentativo scelto è stato registrato per un'altra attività.",
  "citationForward.issue.description_required": "Descrivi la modifica.",
  "citationForward.issue.baseline_after_publication":
    "Un riferimento scelto è stato acquisito dopo la pubblicazione.",
  "citationForward.issue.invalid": "La registrazione non è valida.",
  "citationForward.inspection.title": "Ispezione della destinazione da parte del titolare",
  "citationForward.inspection.intro":
    "Apri l'URL pubblicato esatto, confrontalo con l'istantanea approvata e poi registra ciò che hai visto. Aprire il link o ricevere una risposta corretta non attesta nulla di per sé.",
  "citationForward.inspection.open": "Apri URL pubblicato",
  "citationForward.inspection.snapshot": "Istantanea approvata",
  "citationForward.inspection.result": "Cosa hai visto?",
  "citationForward.inspection.shows_approved_content": "Mostra il contenuto approvato",
  "citationForward.inspection.does_not_show": "Non lo mostra",
  "citationForward.inspection.inconclusive": "Non conclusivo",
  "citationForward.inspection.record": "Registra ispezione",
  "citationForward.inspection.baselineRequired":
    "Un'ispezione positiva richiede le acquisizioni di riferimento che migliora; modifica prima la registrazione.",
  "citationForward.inspection.bindingRequired":
    "Questa registrazione non ha alcun collegamento di pubblicazione da ispezionare.",
  "citationForward.inspection.negativeNote":
    "Un'ispezione negativa o non conclusiva viene salvata e il miglioramento resta non verificato per la consegna.",
  "citationForward.error.conflict":
    "Qualcuno ha salvato una versione più recente mentre stavi modificando. La tua bozza è conservata; non è stato scritto nulla.",
  "citationForward.error.conflictContinue": "Continua sulla versione corrente",
  "citationForward.error.findingUnresolved":
    "Un rilievo selezionato non si risolve più in questo ambito.",
  "citationForward.error.baselineUnresolved":
    "Un'acquisizione di riferimento non si risolve più in questo progetto.",
  "citationForward.error.bindingUnresolved":
    "Il collegamento di pubblicazione non corrisponde al tentativo registrato.",
  "citationForward.error.bindingUnapproved": "La versione collegata non è attualmente approvata.",
  "citationForward.error.approvalMismatch":
    "La versione di approvazione o l'approvatore dichiarati non corrispondono all'approvazione effettiva.",
  "citationForward.error.taskMismatch":
    "La pubblicazione è stata registrata per un'altra attività.",
  "citationForward.error.destinationMismatch":
    "La destinazione non corrisponde all'URL pubblicato.",
  "citationForward.error.inspectionInvalid":
    "L'ispezione non è valida per questa pubblicazione (URL, ora o stato).",
  "citationForward.error.verificationUnbacked":
    "Una verifica richiede un'ispezione positiva del titolare dell'URL pubblicato.",
  "citationForward.error.scopeDrift": "Questo miglioramento è stato registrato in un altro ambito.",
  "citationForward.error.capacity": "Capacità di miglioramenti raggiunta per questo progetto.",
  "citationForward.error.invalid": "La registrazione è stata rifiutata come non valida.",
  "citationForward.error.unavailable": "Il salvataggio non è stato completato. Aggiorna e riprova.",
  "citationForward.error.loadEvidence": "Impossibile caricare la cronologia delle pubblicazioni.",
  "citationForward.error.loadImprovements": "Impossibile caricare i miglioramenti.",
  "citationForward.readiness.title": "Prontezza per il nuovo test",
  "citationForward.readiness.verified":
    "Cambiamenti distinti attestati dal titolare: {count} su {required} richiesti",
  "citationForward.readiness.receipts":
    "Solo ricevute del connettore (non prova di consegna): {count}",
  "citationForward.readiness.approvalBound": "Solo collegati all'approvazione: {count}",
  "citationForward.readiness.unverified": "Non verificati: {count}",
  "citationForward.readiness.baselineMissing": "Riferimento mancante: {count}",
  "citationForward.readiness.note":
    "I conteggi provengono da stati del server in tempo reale; qui non viene calcolato alcun ciclo di confronto e un'attestazione del titolare non è mai una prova indipendente.",
  "citationForward.task.pinnedTitle": "Attività del Plan fissate a versioni di rilievo",
  "citationForward.task.pinnedEmpty":
    "Nessuna attività del Plan è fissata a una versione di rilievo in questo progetto.",
  "citationForward.task.readFailed":
    "Il rilievo non è stato letto; nessuna attività è stata creata.",
  "citationForward.task.notEligible":
    "La versione del rilievo restituita dal server non è quella selezionata o non è più idonea; nessuna attività è stata creata.",
  "citationForward.task.stale":
    "Il progetto o l'account è cambiato durante la lettura del rilievo; nessuna attività è stata creata.",
  "citationForward.improvement.rowsPick": "Versioni di rilievo da collegare",
  "citationForward.improvement.useCurrent":
    "Collega la versione corrente v{head} invece della riga fissata",
  "citationForward.improvement.publicationPartial":
    "Solo {loaded} di {total} tentativi registrati sono stati caricati; i tentativi più vecchi non sono offerti qui.",
  "citationForward.improvement.historyRow": "versione precedente (cronologia)",
  "citationForward.inspection.notHead":
    "Esiste una versione più recente di questo miglioramento. Apri la versione corrente e ispeziona quella.",
  "citationForward.inspection.retry": "Riprova la stessa ispezione",
  "citationForward.error.findingStale":
    "Un rilievo collegato è cambiato da quando hai rivisto questa registrazione. Non è stato scritto nulla; apri la versione corrente del rilievo e rivedila.",
  "citationForward.readiness.unavailable":
    "La prontezza non può essere mostrata: gli stati in tempo reale non sono stati aggiornati.",
  "citationForward.improvement.approvalDelegate": "Approvato da un revisore delegato: {email}",
  "citationForward.improvement.approvalNone":
    "Questa versione non è attualmente approvata; il tentativo non può essere collegato.",
  "citationForward.issue.approval_unknown":
    "Impossibile caricare lo stato di approvazione del tentativo scelto.",
  "citationForward.issue.approval_unavailable":
    "La versione del tentativo scelto non è attualmente approvata.",
  "citationForward.task.duplicate":
    "Un'attività del Plan è già fissata a questa versione del rilievo (elencata sotto); non è stata creata una seconda attività. Usala, oppure allega esplicitamente la versione a un'altra attività.",
};
