/** Italian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const itCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Modifiche a schede e configurazione",
  "citationChange.intro":
    "Registra la modifica prevista come artefatto (solo i campi supportati e non segreti), approva esattamente quella versione, dichiara quando è stata eseguita e poi vincola un miglioramento ad essa. Una dichiarazione non è una prova dalla destinazione.",
  "citationChange.artifact.new": "Nuovo artefatto di modifica",
  "citationChange.artifact.kind": "Tipo",
  "citationChange.artifact.kind.listing": "Scheda",
  "citationChange.artifact.kind.configuration": "Configurazione",
  "citationChange.artifact.reference": "Riferimento",
  "citationChange.artifact.referenceHint":
    "L’identificativo della scheda o dell’impostazione (ad esempio l’id del profilo o il percorso dell’impostazione). Nessuna credenziale.",
  "citationChange.artifact.fields": "Campi",
  "citationChange.artifact.fieldsHint":
    "Possono essere registrati solo i campi supportati; credenziali, token e impostazioni private vengono rifiutati e non possono essere aggiunti qui.",
  "citationChange.artifact.before": "Prima",
  "citationChange.artifact.after": "Dopo",
  "citationChange.artifact.save": "Salva artefatto",
  "citationChange.artifact.saved":
    "Artefatto salvato (un contenuto identico restituisce l’artefatto esistente).",
  "citationChange.artifact.remove":
    "Elimina artefatto (il contenuto viene rimosso; gli identificativi restano per l’audit)",
  "citationChange.artifact.empty": "Nessun artefatto di modifica ancora.",
  "citationChange.artifact.unsupported":
    "Campo o valore non supportato; non è stato salvato nulla.",
  "citationChange.approval.title": "Approvazione di questa esatta versione",
  "citationChange.approval.approve": "Approva questa versione",
  "citationChange.approval.revoke": "Revoca approvazione",
  "citationChange.approval.owner": "Approvato da me (proprietario)",
  "citationChange.approval.delegate": "Approvato da un revisore delegato: {email}",
  "citationChange.approval.none": "Attualmente non approvato.",
  "citationChange.receipt.title": "Dichiarazioni di esecuzione",
  "citationChange.receipt.record": "Dichiara eseguito ora",
  "citationChange.receipt.recorded": "Dichiarazione registrata.",
  "citationChange.receipt.none": "Nessuna dichiarazione ancora.",
  "citationChange.receipt.note":
    "Una dichiarazione afferma che una persona ha effettuato la modifica; non prova mai che la destinazione la mostri.",
  "citationChange.binding.kind": "Tipo di vincolo",
  "citationChange.binding.public": "Tentativo pubblicato (URL pubblico)",
  "citationChange.binding.change": "Modifica di scheda / configurazione",
  "citationChange.binding.artifact": "Artefatto",
  "citationChange.binding.receipt": "Dichiarazione di esecuzione",
  "citationChange.binding.chooseArtifact": "Scegli un artefatto approvato",
  "citationChange.binding.chooseReceipt": "Scegli una dichiarazione",
  "citationChange.issue.artifact_required": "Scegli un artefatto approvato.",
  "citationChange.issue.artifact_unapproved": "L’artefatto scelto non è attualmente approvato.",
  "citationChange.issue.receipt_required":
    "Scegli una dichiarazione di esecuzione per l’artefatto.",
  "citationChange.independent.title": "Ispezione indipendente",
  "citationChange.independent.none": "nessuna ispezione indipendente",
  "citationChange.independent.inconclusive": "inconcludente (non affermativa)",
  "citationChange.independent.disputed":
    "contestata (un ispettore assegnato ha visto la modifica mancante; esclusa dalla prontezza verificata)",
  "citationChange.independent.independently_inspected":
    "ispezionata in modo indipendente (un’altra persona autenticata ha visto la modifica approvata)",
  "citationChange.independent.note":
    "L’ispezione indipendente è un’ispezione umana da parte di un’altra persona del team; non è mai una verifica automatica né una prova causale, e una consegna contestata è esclusa anche se l’hai attestata tu.",
  "citationChange.eligible.yes": "conta come modifica verificata",
  "citationChange.eligible.no": "non conta come verificata",
  "citationChange.assign.title": "Assegnazioni di ispezione",
  "citationChange.assign.pick": "Scegli un revisore del team",
  "citationChange.assign.grant": "Concedi ispezione",
  "citationChange.assign.revoke": "Revoca",
  "citationChange.assign.link": "Copia il link dell’ispettore",
  "citationChange.assign.linkCopied": "Link copiato.",
  "citationChange.assign.none": "Nessun ispettore assegnato.",
  "citationChange.assign.effective": "in vigore",
  "citationChange.assign.ineffective": "non più in vigore",
  "citationChange.inspect.title": "Ispeziona una modifica registrata",
  "citationChange.inspect.intro":
    "Apri il riferimento esatto, confrontalo con il contenuto approvato qui sotto e poi registra ciò che hai visto. Aprire il riferimento non attesta nulla di per sé.",
  "citationChange.inspect.reference": "Riferimento",
  "citationChange.inspect.open": "Apri riferimento",
  "citationChange.inspect.approvedVersion": "Versione approvata",
  "citationChange.inspect.approvedContent": "Contenuto approvato",
  "citationChange.inspect.identity": "Identità dell’approvatore e dell’esecutore",
  "citationChange.inspect.identityUnavailable":
    "L’esecutore o l’approvatore di questa modifica è sconosciuto (una pubblicazione più vecchia o un’approvazione irrisolta); non è possibile registrare una ricevuta indipendente.",
  "citationChange.inspect.result": "Cosa hai visto?",
  "citationChange.inspect.shows_approved_content": "Mostra la modifica approvata",
  "citationChange.inspect.does_not_show": "Non la mostra",
  "citationChange.inspect.inconclusive": "Inconcludente",
  "citationChange.inspect.record": "Registra ispezione",
  "citationChange.inspect.retry": "Riprova la stessa ispezione",
  "citationChange.inspect.withdraw": "Ritira la mia ispezione attuale",
  "citationChange.inspect.recorded": "Ispezione registrata come v{version}.",
  "citationChange.inspect.history": "Cronologia delle mie ispezioni",
  "citationChange.inspect.head": "attuale",
  "citationChange.inspect.withdrawn": "ritirata",
  "citationChange.inspect.loadError":
    "Impossibile caricare questa ispezione (non assegnata, revocata o la riga è cambiata).",
  "citationChange.readiness.independent": "Ispezionate in modo indipendente: {count}",
  "citationChange.readiness.disputed": "Contestate (escluse): {count}",
  "citationChange.readiness.receipts":
    "Solo dichiarazioni di esecuzione (non prova di consegna): {count}",
  "citationChange.error.unsupported":
    "Campo, valore o tipo non supportato; non è stato salvato nulla.",
  "citationChange.error.unavailable": "Impossibile caricare o salvare il record della modifica.",
  "citationChange.error.stale": "L’artefatto è cambiato da quando l’hai visto; riaprilo.",
  "citationChange.error.forbidden": "Non sei autorizzato a farlo per questo progetto.",
  "citationChange.error.unapproved": "Questa versione non è attualmente approvata.",
  "citationChange.error.receiptInvalid":
    "L’istante dichiarato è precedente all’approvazione o nel futuro.",
  "citationChange.error.capacity":
    "Raggiunta la capacità di artefatti di modifica per questo progetto.",
  "citationChange.error.inspectionInvalid":
    "L’ispezione non è valida (istante, riferimento o stato).",
  "citationChange.error.notIndependent":
    "Hai eseguito o approvato questa modifica, quindi non puoi ispezionarla in modo indipendente.",
  "citationChange.error.identityUnavailable":
    "L’identità dell’esecutore o dell’approvatore non è disponibile; l’ispezione indipendente è rifiutata.",
  "citationChange.error.inspectionConflict":
    "La tua catena di ispezioni è cambiata; ricarica e registra di nuovo.",
  "citationChange.error.generic": "Impossibile completare l’azione sulle prove della modifica.",
  "citationChange.artifact.fieldKey": "Campo",
  "citationChange.artifact.addField": "Aggiungi campo",
  "citationChange.artifact.removeField": "Rimuovi",
  "citationChange.artifact.removed": "Artefatto eliminato (identificativi di audit conservati).",
  "citationChange.artifact.approvalRevision": "revisione di approvazione {revision}",
  "citationChange.approval.approved": "Approvazione registrata.",
  "citationChange.approval.revoked": "Approvazione revocata.",
  "citationChange.approval.retry": "Riprova la stessa decisione",
  "citationChange.approval.replayed":
    "Si è trattato di una ripetizione di una richiesta precedente; la decisione attuale viene mostrata dopo il ricaricamento.",
  "citationChange.receipt.remove": "Rimuovi dichiarazione",
  "citationChange.receipt.removed": "Dichiarazione rimossa.",
  "citationChange.binding.deleted":
    "L’artefatto vincolato è stato eliminato; restano solo gli identificativi.",
  "citationChange.detail.changeTitle": "Modifica di scheda / configurazione vincolata",
  "citationChange.detail.artifactVersion": "Versione approvata dell’artefatto",
  "citationChange.detail.receiptAt": "Dichiarato eseguito il",
  "citationChange.assign.candidatesNone":
    "Nessun revisore del team idoneo da assegnare (politica o elenco).",
  "citationChange.assign.granted": "Ispezione concessa.",
  "citationChange.assign.revoked": "Ispezione revocata.",
  "citationChange.inspect.kindPublic": "Pagina pubblicata",
  "citationChange.inspect.fresh":
    "La tua ispezione attuale non ha più effetto ({reason}); registrane una nuova rispetto alla tua testa di catena attuale.",
  "citationChange.inspect.reason.superseded": "sostituita da una ricevuta successiva",
  "citationChange.inspect.reason.withdrawn": "ritirata",
  "citationChange.inspect.reason.account": "account non disponibile",
  "citationChange.inspect.reason.assignment": "l’assegnazione è stata concessa di nuovo",
  "citationChange.inspect.reason.authority": "la tua autorità nel team è cambiata",
  "citationChange.inspect.reason.independence": "ora sei l’esecutore o l’approvatore",
  "citationChange.inspect.noContent":
    "Il contenuto approvato non è più disponibile (artefatto eliminato o pubblicazione mancante).",
  "citationChange.inspect.boundFindings": "Rilievi vincolati",
  "citationChange.inspect.withdrawnDone": "Ispezione ritirata.",
  "citationChange.dissent.title": "Dissenso attivo su questa modifica consegnata",
  "citationChange.dissent.row": "{inspector} · riga {row} · {at}",
  "citationChange.status.receipt_recorded":
    "dichiarazione di esecuzione registrata (non prova di consegna)",
  "citationChange.artifact.duplicateField":
    "Questo campo è già usato da un’altra riga; scegli un campo diverso o rimuovi questa riga.",
  "citationChange.artifact.fieldsExhausted":
    "Ogni campo supportato di questo tipo ha già una riga.",
  "citationChange.approval.pendingNote":
    "La richiesta precedente non è tornata. Riprova invia esattamente la stessa decisione (versione {sha}, {decision}, revisione esaminata {revision}); nulla viene ricalcolato dallo stato attuale.",
  "citationChange.approval.newDecision": "Scartala e decidi di nuovo",
  "citationChange.receipt.retry": "Riprova la stessa dichiarazione",
  "citationChange.receipt.newPerformance": "Dichiara una nuova esecuzione",
  "citationChange.receipt.pendingNote":
    "La dichiarazione precedente non è tornata. Riprova invia esattamente lo stesso istante dichiarato ({at}); una nuova esecuzione è un’azione esplicita separata.",
  "citationChange.approval.blockedBy":
    "Risolvi prima la decisione in sospeso per {reference} (riprovala o scartala); le altre approvazioni attendono.",
  "citationChange.receipt.blockedBy":
    "Risolvi prima la dichiarazione in sospeso per {reference} (riprovala o dichiara una nuova esecuzione); le altre dichiarazioni attendono.",
  "citationChange.readiness.verified":
    "Modifiche distinte verificate: {count} di {required} richieste (una modifica conta quando la sua prova è idonea: la tua attestazione o un’ispezione indipendente di una modifica consegnata; una modifica contestata o esclusa non conta mai)",
  "citationChange.readiness.sources":
    "Osservazioni registrate sulle modifiche attuali: attestate dal proprietario {owner}, ispezionate in modo indipendente {independent} (sono conteggi di osservazioni registrate, non prove idonee; contestazioni ed esclusioni decidono il conteggio verificato sopra)",
  "citationChange.evidence.independentBaseline":
    "la baseline è risolta dalla prova indipendente (nessuna attestazione del proprietario su questa riga)",
  "citationChange.inspect.ownerIntro":
    "Apri la scheda o l’impostazione al riferimento esatto, confrontala con i campi approvati qui sotto e poi registra ciò che hai visto. Aprirla non attesta nulla di per sé.",
  "citationChange.inspect.contentUnavailable":
    "Impossibile caricare il contenuto approvato esatto di questa modifica (artefatto eliminato, modificato o non disponibile): un’attestazione positiva non è possibile; un risultato negativo o inconcludente può ancora essere registrato.",
  "citationChange.receipt.stale":
    "non valida sotto l’approvazione attuale (registrata sotto una decisione precedente, o l’approvazione non è più corrente) — dichiara una nuova esecuzione",
  "citationChange.issue.receipt_stale":
    "La dichiarazione scelta non è valida sotto l’approvazione attuale: è stata registrata sotto una decisione di approvazione precedente, oppure l’approvazione non è più corrente. Dichiara una nuova esecuzione e scegli quella.",
  "citationChange.error.receiptStale":
    "La dichiarazione è stata registrata sotto una decisione di approvazione precedente (da allora l’approvazione è stata revocata o decisa di nuovo). Dichiara una nuova esecuzione sotto l’approvazione attuale e vincola quella.",
  "citationChange.binding.receiptStale":
    "La dichiarazione vincolata è stata registrata sotto una decisione di approvazione precedente, quindi questa riga resta a vincolata all’approvazione e nessuna nuova ispezione può vincolare quella dichiarazione. Dichiara una nuova esecuzione sotto l’approvazione attuale e registra una nuova versione della modifica.",
};
