/** Italian authoring only; not registered in runtime. */
export const itCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Lavoro attuale del progetto",
  "awareness.help":
    "Solo nell’app. Questi controlli non inviano email. I blocchi restano visibili finché la coda non cambia; aprirli non approva né riavvia il lavoro.",
  "awareness.project": "Scegli progetto",
  "awareness.approval": "Questa esatta versione richiede approvazione",
  "awareness.resume": "La versione approvata è ancora bloccata",
  "awareness.late":
    "Questa data è trascorsa. Esamina la bozza e scegli un’azione esplicita di programmazione.",
  "awareness.paused":
    "L’automazione è intenzionalmente in pausa. I blocchi di pubblicazione esistenti restano separati.",
  "awareness.disabled": "L’automazione è disattivata.",
  "awareness.settings": "Apri impostazioni di programmazione",
  "awareness.history":
    "Ultimo risultato settimanale salvato — dato storico, non un nuovo controllo della capacità o delle fonti",
  "awareness.empty": "Nessun blocco per approvazione in questa pagina.",
  "awareness.page": "Pagina della coda {page} di {pages}",
  "awareness.error": "Impossibile controllare i dati attuali. Aggiorna prima di agire.",
  "awareness.checked": "Controllato: {at}",
  "awareness.weekly": "Dati attuali degli slot settimanali",
  "awareness.earlier": "Avvisi precedenti nella posta in arrivo",
  "notifications.failureInspect": "Esamina dettagli di pubblicazione",
  "notifications.failureReadError":
    "Impossibile controllare i dettagli di pubblicazione. Riprova prima di decidere come procedere.",
  "notifications.failureReason.contentReview":
    "Il tentativo salvato è stato bloccato dai controlli sui contenuti. Apri la bozza per verificarne lo stato attuale di preparazione.",
  "notifications.failureReason.destination":
    "Il tentativo salvato ha segnalato un errore di connessione o di risposta della destinazione. Controlla la destinazione prima di riprovare.",
  "notifications.failureReason.configuration":
    "Il tentativo salvato ha segnalato una configurazione di pubblicazione mancante o non valida. Controlla la configurazione del progetto.",
  "notifications.failureReason.unknown":
    "Impossibile classificare l’errore salvato. Esamina la bozza e la destinazione prima di riprovare.",
  "notifications.failureRecorded":
    "Registro aggiornato: {at}, nel fuso orario del browser. Tentativi registrati: {attempts}.",
  "notifications.failureDraftChanged":
    "La bozza è cambiata dopo questa registrazione. Questi dettagli potrebbero non descriverne più lo stato attuale di preparazione.",
  "notifications.failureHttp": "Risposta del sito registrata: HTTP {status}.",
  "notifications.failureCheck.links":
    "Risolvi i link interni nel pannello di sicurezza dei link dell’editor.",
  "notifications.failureCheck.sourcesReview":
    "Verifica le affermazioni confrontandole con le fonti o consultando un autore qualificato e completa la revisione umana.",
  "notifications.failureCheck.author":
    "Aggiungi il nome dell’autore reale e una biografia, una qualifica o un profilo.",
  "notifications.failureHistoryLimit":
    "Queste sono informazioni storiche salvate in Milo. Non controllano la destinazione, non approvano la bozza attuale e non riavviano la pubblicazione.",
  "notifications.failureState.absent":
    "Nessuna voce corrispondente trovata nella coda. Aggiorna le notifiche ed esamina la bozza.",
  "notifications.failureState.changed":
    "La coda non indica più questo elemento come non riuscito. Aggiorna le notifiche; questo, da solo, non verifica il sito di destinazione.",
  "notifications.recoveryInspect": "Esamina lavoro salvato",
  "notifications.recoveryReadError":
    "Impossibile controllare i dati salvati dell’automazione. Riprova prima di decidere se riavviare.",
  "notifications.recoveryState.absent":
    "Nessun dato trovato per un’esecuzione attuale. Aggiorna le notifiche per verificare se l’incidente è stato risolto.",
  "notifications.recoveryState.running": "L’ultima esecuzione è contrassegnata come attiva.",
  "notifications.recoveryState.completed":
    "L’ultima esecuzione è terminata. Aggiorna le notifiche per i problemi attuali.",
  "notifications.recoveryState.review_required":
    "L’esecuzione interrotta richiede ancora una revisione.",
  "notifications.recoverySnapshot":
    "Dati di Milo controllati alle {at}, nel fuso orario del browser.",
  "notifications.recoveryCounts":
    "Piano {period}: {saved} bozze salvate. Voci in coda per queste bozze: {pending} in attesa, {publishing} in corso, {published} registrate come pubblicate, {failed} non riuscite e {cancelled} annullate.",
  "notifications.recoveryEvidenceLimit":
    "Questi sono dati salvati in Milo. Non verificano l’ultima operazione IA né il sito di destinazione. Controlla la destinazione prima di ritentare una pubblicazione dall’esito incerto. Questa vista non riavvia il lavoro.",
  "notifications.recoveryMore":
    "Visualizzate {shown} di {total} bozze salvate. Apri il calendario per esaminare il lavoro restante.",
  "notifications.emailAddressUnverified":
    "L’email attuale del tuo account non è stata verificata. Completa la conferma dell’email, poi ricontrolla. Se l’indirizzo è stato modificato da un amministratore e non hai un link di conferma, contatta l’assistenza Milo. Le notifiche nell’app restano disponibili.",
  "notifications.emailAddressUnavailable":
    "Milo non ha potuto controllare la verifica attuale della tua email. Riprova più tardi. Puoi comunque disattivare i riepiloghi e usare le notifiche nell’app.",
  "notifications.generation_capacity_low":
    "I tentativi di preparazione disponibili potrebbero non coprire il piano",
  "notifications.generation_capacity_unavailable":
    "Impossibile controllare i tentativi di preparazione disponibili",
  "notifications.capacityLow":
    "Il piano {period} richiede ancora {missing} bozze per questo progetto e {total} per tutte le programmazioni attive. Il tuo account ha {remaining} tentativi di preparazione rimanenti in {usagePeriod}. Questa capacità è condivisa e non garantisce articoli completati. Esamina la programmazione; le bozze salvate restano disponibili per revisione e pubblicazione.",
  "notifications.capacityUnavailable":
    "Milo non ha potuto verificare i tentativi di preparazione condivisi disponibili per {usagePeriod}. Il piano {period} richiede ancora {missing} bozze qui. Ricontrolla più tardi. Le bozze salvate e le altre notifiche restano disponibili.",
  "notifications.scheduler_recovery": "L’automazione richiede una revisione per il ripristino",
  "notifications.recovery":
    "Preparazione in pausa dopo un’esecuzione interrotta. Esamina le bozze salvate e l’ultima operazione prima di riavviare. Le approvazioni di pubblicazione esistenti restano invariate.",
  "notifications.emailTitle": "Riepiloghi via email",
  "notifications.emailDescription":
    "Ricevi un riepilogo dei nuovi avvisi, al massimo una volta all’ora, all’indirizzo confermato del tuo account. Ogni incidente compare una sola volta.",
  "notifications.emailDisabled":
    "L’invio delle email non è ancora stato attivato. Le notifiche nell’app sono disponibili.",
  "notifications.emailEnable": "Attiva riepiloghi via email",
  "notifications.emailDisable": "Disattiva riepiloghi via email",
  "notifications.emailError": "Le impostazioni email sono temporaneamente non disponibili.",
  "notifications.emailSaveError": "Impossibile salvare le preferenze email.",
  "notifications.emailHistory": "Attività email recente",
  "notifications.emailStatus.pending": "In attesa",
  "notifications.emailStatus.leased": "Controllo dello stato attuale",
  "notifications.emailStatus.sending": "Invio in corso",
  "notifications.emailStatus.accepted": "Accettata dal fornitore email",
  "notifications.emailStatus.unknown": "L’esito della consegna richiede verifica",
  "notifications.emailStatus.cancelled": "Annullata",
  "notifications.emailStatus.failed": "Impossibile preparare l’email",
  "notifications.title": "Notifiche",
  "notifications.subtitle":
    "Le prossime decisioni e i problemi di pubblicazione, verificati rispetto allo stato più recente del server.",
  "notifications.loading": "Controllo del piano in corso…",
  "notifications.empty": "Nessuna azione richiede la tua attenzione al momento.",
  "notifications.error": "Le notifiche sono temporaneamente non disponibili.",
  "notifications.stale":
    "L’ultimo controllo non è stato completato. Questi sono gli ultimi avvisi confermati.",
  "notifications.refresh": "Ricontrolla",
  "notifications.read": "Segna come letta",
  "notifications.unread": "Non letta",
  "notifications.saved": "Letta",
  "notifications.open": "Apri attività",
  "notifications.calendar": "Apri calendario",
  "notifications.project": "Progetto",
  "notifications.approval_due": "Approvazione in scadenza",
  "notifications.publication_failed": "La pubblicazione richiede un controllo",
  "notifications.manual_overdue": "Attività manuale scaduta",
  "notifications.cadence_gap": "La prossima settimana richiede attenzione",
  "notifications.coverage": "{missing} di {total} slot pianificati non sono pronti e in coda.",
  "notifications.failure":
    "Controlla la destinazione prima di riprovare: una pubblicazione interrotta potrebbe essere già online.",
  "notifications.approval": "Esamina la versione attuale prima della scadenza prevista.",
  "notifications.manual":
    "Completa questa attività oppure scegli una nuova data. Questa scadenza riguarda un’attività manuale.",
  "notifications.readError": "Impossibile segnare questa notifica come letta. Riprova.",
  "team.title": "Il team di Milo",
  "team.help":
    "Un unico spazio di lavoro, con viste specialistiche del lavoro reale e delle conoscenze del progetto.",
  "team.selectProject": "Scegli un progetto per vederne il team.",
  "team.scope":
    "Lo stato delle attività copre la settimana selezionata. I consigli e i report salvati sono evidenze datate, non la prova di un’attività in corso o di risultati migliorati.",
  "team.aiRole": "Specialista IA",
  "team.records": "{count} conoscenze salvate · controlla lo stato nelle conoscenze del progetto",
  "team.lastDelivery": "Ultima consegna nelle attività di questa settimana",
  "team.auditFetched": "Revisione del sito salvata",
  "team.auditPartial": "Revisione salvata basata solo sul contesto del progetto",
  "team.adviceSaved": "Consigli sulla preparazione per l’IA salvati",
  "team.imports": "{count} importazioni di misurazioni GSC salvate",
  "team.measurementMissing": "Nessuna misurazione GSC salvata",
  "team.authorityPrerequisite":
    "I dati del fornitore e l’autorizzazione ai contatti esterni devono essere verificati nello spazio di lavoro dei backlink.",
  "team.lesson.title": "Ricorda una lezione editoriale",
  "team.lesson.help":
    "Scrivi una preferenza ricorrente per questo progetto. Salvandola, diventa un’istruzione esplicita del progetto per il lavoro futuro pertinente. Le normali modifiche agli articoli non creano lezioni. Questo non costituisce una prova dei fatti.",
  "team.lesson.rule": "Istruzione per questo progetto",
  "team.lesson.target": "Applica a",
  "team.lesson.text": "Scrittura",
  "team.lesson.visual": "Immagini",
  "team.lesson.both": "Scrittura e immagini",
  "team.lesson.save": "Salva istruzione del progetto",
  "team.lesson.manage": "Esamina, modifica o dimentica conoscenze",
  "team.lesson.saved":
    "Salvata in questo progetto. Puoi modificarla, ripristinarne una versione precedente o revocarla nelle conoscenze del progetto.",
  "team.lesson.unknown":
    "Impossibile confermare il salvataggio. Controlla le conoscenze del progetto prima di inserire nuovamente l’istruzione.",
  "team.role.lead": "Milo — Responsabile della crescita",
  "team.description.lead": "Coordina la programmazione salvata, la copertura e le decisioni.",
  "team.open.lead": "Esamina preparazione settimanale",
  "team.role.brand": "Stratega del marchio",
  "team.description.brand":
    "Fatti del progetto, preferenze e lezioni reversibili, con fonte e cronologia delle revisioni.",
  "team.open.brand": "Esamina conoscenze del progetto",
  "team.role.research": "Specialista di ricerca online",
  "team.description.research":
    "Brief di ricerca settimanali e opportunità salvate. Esamina fonti e ipotesi prima di scrivere.",
  "team.open.research": "Esamina opportunità",
  "team.role.content": "Redattore dei contenuti",
  "team.description.content":
    "Gli articoli conservati richiedono ancora una revisione editoriale e l’approvazione della versione esatta per la pubblicazione.",
  "team.open.content": "Esamina articoli",
  "team.role.image": "Creatore di immagini",
  "team.description.image":
    "Le immagini proposte usano il contesto del progetto. Conservarle non equivale ad approvarle.",
  "team.open.image": "Esamina immagini degli articoli",
  "team.role.seo": "Specialista SEO",
  "team.description.seo":
    "Risultati datati delle revisioni delle pagine, dei link interni e degli aspetti locali e delle entità. Le revisioni parziali mantengono i propri limiti.",
  "team.open.seo": "Esamina risultati SEO",
  "team.role.authority": "Backlink e autorevolezza",
  "team.description.authority":
    "Ricerca, monitoraggio e proposte dipendono dall’accesso verificato al fornitore. L’invio di messaggi e l’acquisto di posizionamenti richiedono autorizzazioni separate.",
  "team.open.authority": "Controlla spazio di lavoro dei backlink",
  "team.role.ai": "Analista della visibilità nell’IA",
  "team.description.ai":
    "I consigli sulla preparazione sono separati dalle risposte, menzioni e citazioni osservate. Qui non viene dimostrata l’esistenza di un monitoraggio delle osservazioni.",
  "team.open.ai": "Esamina consigli sulla preparazione",
  "team.role.performance": "Analista delle prestazioni",
  "team.description.performance":
    "Report salvati e misurazioni datate. I dati mancanti sono sconosciuti; un cambiamento prima/dopo, da solo, non dimostra un nesso causale.",
  "team.open.performance": "Esamina misurazioni",
  "team.state.unavailable": "Stato non disponibile",
  "team.state.none": "Nessun lavoro registrato",
  "team.state.unknown": "Esito incerto — esamina il ripristino",
  "team.state.running": "Lavoro in corso",
  "team.state.review": "Le modifiche del proprietario richiedono revisione",
  "team.state.retained": "Risultati conservati per la revisione",
  "team.state.cancelled": "Preparazione annullata",
  "collaboration.reviewImageLimits":
    "Queste immagini superano i limiti di revisione o non possono essere mostrate in sicurezza. Riducine il numero o le dimensioni e usa immagini statiche PNG, JPEG o WebP.",
  "collaboration.emailInvitation": "Invia invito via email",
  "collaboration.invitationEmailHelp":
    "Invia un invito all’indirizzo email mostrato sopra per il ruolo visualizzato. Aprire il link nell’email non concede l’accesso.",
  "collaboration.invitationEmailQueued":
    "Email di invito richiesta. Controllane qui lo stato di consegna.",
  "collaboration.notificationHistory": "Cronologia di consegna delle notifiche",
  "collaboration.notificationSettings": "Notifiche del progetto",
  "collaboration.notificationConsentHelp":
    "Sono necessari sia l’assegnazione del proprietario sia il tuo consenso. Le modifiche al tuo ruolo nel progetto richiedono una nuova impostazione delle preferenze.",
  "collaboration.notificationAssigned": "Assegnate dal proprietario",
  "collaboration.notificationNotAssigned": "Non assegnate dal proprietario",
  "collaboration.notificationOptedIn": "Il destinatario ha acconsentito",
  "collaboration.notificationOptedOut": "Il destinatario non ha acconsentito",
  "collaboration.notificationAssign": "Assegna notifiche",
  "collaboration.notificationUnassign": "Rimuovi assegnazione",
  "collaboration.notificationOptIn": "Consenti notifiche del progetto",
  "collaboration.notificationOptOut": "Disattiva notifiche del progetto",
  "collaboration.decisionRecorded": "Decisione di revisione registrata.",
  "collaboration.decisionUnknown":
    "Impossibile confermare la decisione. Aggiorna le decisioni precedenti prima di riprovare.",
  "collaboration.reviewNotAllowed":
    "Il tuo ruolo attuale o la politica del progetto non consentono decisioni di revisione.",
  "collaboration.acknowledgeReview":
    "Ho esaminato questa bozza visualizzata e tutte le sue immagini.",
  "collaboration.approveVersion": "Approva questa versione",
  "collaboration.returnForChanges": "Restituisci per modifiche",
  "collaboration.reviewDoesNotPublish":
    "Registrare una revisione non pubblica la bozza né riattiva una programmazione bloccata.",
  "collaboration.reviewHistory": "Decisioni di revisione precedenti",
  "collaboration.approvalRecorded": "Approvazione registrata",
  "collaboration.changesRequested": "Modifiche richieste",
  "collaboration.owner": "Proprietario",
  "collaboration.collaborator": "Collaboratore",
  "collaboration.renderedReview": "Revisione della bozza visualizzata",
  "collaboration.loadingReview": "Caricamento della revisione completa e delle sue immagini…",
  "collaboration.incompleteReview":
    "Impossibile caricare la revisione completa. Aggiorna per controllare la bozza e tutte le sue immagini.",
  "collaboration.policyTitle": "Politica di approvazione",
  "collaboration.policyHelp":
    "Scegli chi può approvare il lavoro del progetto. Modificare questa politica revoca le approvazioni esistenti dei collaboratori; le approvazioni indipendenti del proprietario restano valide.",
  "collaboration.policyUnselected": "Non selezionata — approvazione dei collaboratori inattiva",
  "collaboration.policy.disabled": "Solo approvazioni del proprietario",
  "collaboration.policy.separate_reviewers": "Revisori separati approvano; i Redattori modificano",
  "collaboration.policy.editors_can_approve": "Redattori e Revisori possono approvare",
  "collaboration.savePolicy": "Salva politica di approvazione",
  "collaboration.editDraft": "Modifica bozza",
  "collaboration.editHelp":
    "Il salvataggio riporta questa bozza in revisione e revoca la precedente approvazione di pubblicazione.",
  "collaboration.editConflict":
    "La bozza salvata o il tuo ruolo sono cambiati. Copia le modifiche che vuoi conservare prima di caricare l’ultima versione salvata.",
  "collaboration.loadLatest": "Carica ultima versione salvata",
  "collaboration.draftSaved": "Bozza salvata per la revisione.",
  "collaboration.editError":
    "Impossibile salvare la bozza. Le tue modifiche sono ancora qui; controlla la versione attuale e il tuo accesso prima di riprovare.",
  "collaboration.saveDraft": "Salva per revisione",
  "collaboration.question": "Domanda",
  "collaboration.answer": "Risposta",
  "collaboration.removeQuestion": "Rimuovi domanda",
  "collaboration.addQuestion": "Aggiungi domanda",
  "collaboration.field.title": "Titolo",
  "collaboration.field.h1": "Titolo principale",
  "collaboration.field.metaTitle": "Titolo per la ricerca",
  "collaboration.field.metaDescription": "Descrizione per la ricerca",
  "collaboration.field.markdown": "Articolo (Markdown)",
  "collaboration.field.cta": "Invito all’azione",
  "collaboration.field.outline": "Scaletta — un titolo per riga",
  "collaboration.field.faq": "Domande e risposte",
  "collaboration.comments": "Commenti",
  "collaboration.commentLabel": "Il tuo commento",
  "collaboration.addComment": "Aggiungi commento",
  "collaboration.you": "Tu",
  "collaboration.commentRoleAtPosting": "Ruolo al momento della pubblicazione",
  "collaboration.earlierVersion": "Commento su una versione salvata precedente.",
  "collaboration.title": "Collaboratori del progetto",
  "collaboration.subtitle": "Gestisci l’accesso al progetto e apri il lavoro condiviso con te.",
  "collaboration.owned": "Gestisci il tuo progetto",
  "collaboration.shared": "Condivisi con te",
  "collaboration.invitations": "I tuoi inviti",
  "collaboration.members": "Persone con accesso",
  "collaboration.pending": "Inviti del progetto",
  "collaboration.email": "Indirizzo email",
  "collaboration.role": "Ruolo",
  "collaboration.viewer": "Lettore",
  "collaboration.editor": "Redattore",
  "collaboration.reviewer": "Revisore",
  "collaboration.invite": "Crea invito",
  "collaboration.inviteHelp":
    "L’invito compare qui quando il destinatario accede con questa email verificata. Scade dopo sette giorni. Questa azione non invia email.",
  "collaboration.accept": "Accetta invito",
  "collaboration.revoke": "Revoca invito",
  "collaboration.remove": "Rimuovi accesso",
  "collaboration.saveRole": "Salva ruolo",
  "collaboration.refresh": "Aggiorna",
  "collaboration.open": "Apri progetto",
  "collaboration.loading": "Caricamento dell’accesso al progetto…",
  "collaboration.error": "Impossibile confermare l’accesso. Aggiorna prima di riprovare.",
  "collaboration.saved": "Accesso al progetto aggiornato.",
  "collaboration.empty": "Ancora nessun elemento da mostrare.",
  "collaboration.noOwned":
    "Puoi aprire i progetti condivisi qui sotto senza creare un tuo progetto.",
  "collaboration.drafts": "Bozze del progetto",
  "collaboration.back": "Torna alle bozze",
  "collaboration.previous": "Precedente",
  "collaboration.next": "Successivo",
  "collaboration.removed": "Rimosso",
  "collaboration.expires": "Scade",
  "collaboration.history": "Attività di accesso recente",
  "collaboration.pendingState": "In attesa",
  "collaboration.expired": "Scaduto",
  "collaboration.accepted": "Accettato",
  "collaboration.revoked": "Revocato",
  "emailSettings.language": "Lingua delle email",
  "emailSettings.note":
    "Scegli la lingua dei riepiloghi operativi, dei report mensili e degli inviti al progetto che richiedi. Non cambia le impostazioni dell’app, degli articoli o del mercato. Salvare la lingua non attiva né invia email.",
  "emailSettings.save": "Salva lingua delle email",
  "emailSettings.saved": "Impostazioni email salvate.",
  "emailSettings.uncertain":
    "Impossibile confermare le impostazioni salvate. Ricaricale prima di un’altra modifica; l’ultima modifica potrebbe essere già stata salvata.",
  "emailSettings.reload": "Ricarica impostazioni salvate (scarta modifiche)",
};
