/** Italian authoring only; not registered in runtime. */
export const itLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Rete per la crescita dei link",
  "linknet.subtitle":
    "Trova siti pertinenti nella rete Milo, invia una presentazione personale e lascia che Milo verifichi che il link sia effettivamente online.",
  "linknet.policyNote":
    "La pertinenza viene prima di tutto: gli abbinamenti richiedono argomenti condivisi, gli scambi diretti di link vengono segnalati e nulla viene inserito automaticamente. Questi controlli non garantiscono la conformità alle norme dei motori di ricerca.",
  "linknet.topics": "Argomenti",
  "linknet.topicsPlaceholder": "Argomenti (separati da virgole)",
  "linknet.contact": "Email di contatto",
  "linknet.contactPlaceholder": "Email di contatto per i partner",
  "linknet.join": "Entra nella rete",
  "linknet.update": "Aggiorna la scheda",
  "linknet.pause": "Sospendi",
  "linknet.joined": "Sito elencato: i partner possono ora trovarlo.",
  "linknet.paused": "Scheda sospesa.",
  "linknet.find": "Trova partner",
  "linknet.noMatches":
    "Nessun partner pertinente per ora: la rete cresce con ogni sito Milo che aderisce.",
  "linknet.score": "Corrispondenza",
  "linknet.copyIntro": "Copia l'email di presentazione",
  "linknet.introCopied": "Presentazione copiata: incollala nella tua email.",
  "linknet.markContacted": "Segna come contattato",
  "linknet.markAgreed": "Segna come concordato",
  "linknet.decline": "Rifiuta",
  "linknet.targetUrlPlaceholder": "URL della pagina concordata (dove sarà inserito il link)",
  "linknet.verify": "Verifica il link",
  "linknet.verified": "Link trovato: l'inserimento è online e verificato.",
  "linknet.notFound":
    "Nessun link trovato per ora su quella pagina: controllo eseguito e registrato.",
  "linknet.liveSince": "Online dal",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Ultimo controllo: link non trovato",
  "linknet.reciprocalWarn":
    "Questo creerebbe uno scambio diretto di link con questo sito. Valutane la pertinenza ed evita scambi eccessivi.",
  "linknet.status.suggested": "Suggerito",
  "linknet.status.contacted": "Contattato",
  "linknet.status.agreed": "Concordato",
  "linknet.status.live_verified": "Online ✓",
  "linknet.status.declined": "Rifiutato",
  "backlinks.title": "Backlink",
  "backlinks.subtitle":
    "Dati reali sui backlink del tuo dominio: solidità del profilo, divario rispetto ai concorrenti e raccomandazioni sicure per acquisire link.",
  "backlinks.disclaimer":
    "Le metriche dei backlink provengono da un indice esterno di link e sono stime: nessun indice rileva tutti i link. Le raccomandazioni sono soltanto suggerimenti basati su pratiche corrette: Milo non propone mai schemi di link o link a pagamento non dichiarati e non garantisce posizionamenti, traffico o ricavi.",
  "backlinks.run": "Avvia l'analisi dei backlink",
  "backlinks.rerun": "Aggiorna l'analisi",
  "backlinks.running": "Analisi in corso…",
  "backlinks.empty":
    "Avvia un'analisi dei backlink per vedere il profilo reale dei link del tuo dominio, confrontarlo con quello dei concorrenti e individuare i domini che rimandano a loro ma non a te.",
  "backlinks.notConfigured.title": "Collega una fonte di dati sui backlink",
  "backlinks.notConfigured.body":
    "Questo modulo usa l'indice dei backlink di DataForSEO e non è ancora collegato. Il proprietario dello spazio di lavoro deve creare un account DataForSEO (a consumo) e aggiungere DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD come segreti del backend. Fino ad allora, i dati sui backlink non sono disponibili.",
  "backlinks.status.ready.title": "DataForSEO operativo",
  "backlinks.status.ready.body": "L'API Backlinks è collegata e risponde.",
  "backlinks.status.lowBalance.title": "Il saldo DataForSEO è in esaurimento",
  "backlinks.status.lowBalance.body": "Ricarica presto per evitare interruzioni delle analisi.",
  "backlinks.status.paused.title": "L'accesso a DataForSEO è sospeso",
  "backlinks.status.paused.body":
    "Contatta l'assistenza DataForSEO per riattivare l'account prima di avviare un'altra analisi.",
  "backlinks.status.error.title": "Stato di DataForSEO non disponibile",
  "backlinks.status.error.body":
    "Non è stato possibile verificare l'account o l'API Backlinks. Aggiorna lo stato o controlla il pannello del fornitore.",
  "backlinks.status.balance": "Saldo: {balance}.",
  "backlinks.status.refresh": "Aggiorna lo stato",
  "backlinks.competitorsUsed": "Concorrenti confrontati: {list}",
  "backlinks.competitorsFromAnalysis":
    "Vengono usati i concorrenti dell'ultima analisi Concorrenti: {list}",
  "backlinks.noCompetitors":
    "Questo progetto non contiene URL di concorrenti: l'analisi coprirà soltanto il tuo profilo. Aggiungi concorrenti nella configurazione del progetto o nel modulo Concorrenti per attivare il confronto dei link.",
  "backlinks.lastRun": "Ultima analisi: {date}",
  "backlinks.score.overall": "Posizione dei link",
  "backlinks.score.profile": "Solidità del profilo",
  "backlinks.score.gap": "Divario rispetto ai concorrenti",
  "backlinks.score.quality": "Qualità dei link",
  "backlinks.gapHint": "più alto = maggiori possibilità di miglioramento",
  "backlinks.summaryHeading": "Riepilogo",
  "backlinks.topActions": "Azioni principali sui link",
  "backlinks.profileTable": "Il tuo dominio rispetto ai concorrenti",
  "backlinks.table.domain": "Dominio",
  "backlinks.table.rank": "Punteggio del dominio",
  "backlinks.table.backlinks": "Backlink",
  "backlinks.table.referringDomains": "Domini di provenienza",
  "backlinks.table.broken": "Non funzionanti",
  "backlinks.table.spam": "Punteggio spam",
  "backlinks.table.notFetched": "Non è stato possibile recuperare i dati",
  "backlinks.you": "Tu",
  "backlinks.gapHeading": "Divario nei link: rimandano ai concorrenti, ma non a te",
  "backlinks.gapNote":
    "Campione richiesto all'indice del fornitore escludendo il tuo dominio. Questo non verifica in modo indipendente che questi siti non abbiano link verso di te.",
  "backlinks.gap.linksTo": "Rimanda a",
  "backlinks.gapEmpty":
    "Nessun divario nei link trovato: non sono stati recuperati concorrenti oppure non c'erano sovrapposizioni.",
  "backlinks.referringHeading": "Principali domini con link verso di te",
  "backlinks.referringEmpty":
    "Nessun dominio di provenienza trovato per ora nell'indice: un dominio recente spesso parte da zero.",
  "backlinks.recommendations": "Raccomandazioni",
  "backlinks.effort": "Impegno",
  "backlinks.target": "Destinazione / piattaforma",
  "backlinks.approach": "Approccio",
  "backlinks.action.convert": "Crea opportunità",
  "backlinks.action.converted": "Opportunità creata",
  "backlinks.action.convertTop": "Converti le raccomandazioni principali",
  "backlinks.toast.done": "Analisi dei backlink completata",
  "backlinks.toast.converted": "Opportunità creata",
  "backlinks.toast.convertedTop": "{count} opportunità create",
  "backlinks.category.linkGapTargets": "Obiettivi per colmare il divario nei link",
  "backlinks.category.contentForLinks": "Contenuti per ottenere link",
  "backlinks.category.digitalPr": "PR digitali",
  "backlinks.category.partnerships": "Partnership e sponsorizzazioni",
  "backlinks.category.directories": "Directory e profili",
  "backlinks.category.linkHygiene": "Manutenzione dei link",
  "marketplace.title": "Pubblicazioni sponsorizzate",
  "marketplace.subtitle":
    "Abbina le opportunità di backlink a inserimenti sponsorizzati trasparenti e sottoposti a revisione editoriale.",
  "marketplace.disclosureTitle": "Marketplace basato su pratiche corrette.",
  "marketplace.disclosure":
    'Ogni richiesta richiede una chiara dichiarazione di sponsorizzazione e rel="sponsored". Una richiesta non è un acquisto e non garantisce mai posizionamenti, traffico o ricavi.',
  "marketplace.demoNoticeTitle": "Catalogo in anteprima.",
  "marketplace.demoNotice":
    "I domini, le metriche e i prezzi qui sotto sono dati dimostrativi in attesa dell'accesso all'API Linkhouse. Le richieste vengono salvate soltanto in Milo per la revisione; non viene creato alcun ordine presso il fornitore né alcun pagamento.",
  "marketplace.demoBadge": "Demo",
  "marketplace.integrationTitle": "Integrazione Linkhouse",
  "marketplace.integrationLive":
    "Il catalogo del fornitore è collegato. Ogni ordine a pagamento richiede comunque la conferma dell'importo totale esatto.",
  "marketplace.integrationPending":
    "Il contratto di produzione è pronto; la mappatura degli endpoint e le credenziali sono in attesa della documentazione Linkhouse.",
  "marketplace.catalogConnected": "Catalogo reale",
  "marketplace.catalogDemo": "Catalogo demo",
  "marketplace.orderingEnabled": "Ordini abilitati",
  "marketplace.orderingLocked": "Ordini bloccati",
  "marketplace.offers": "Offerte",
  "marketplace.orders": "Richieste",
  "marketplace.search": "Cerca domini o argomenti…",
  "marketplace.noAnalysis":
    "Avvia Backlink Intelligence per aggiungere al confronto segnali sul divario nei link. L'abbinamento per argomento e mercato è già attivo.",
  "marketplace.reason.linkGap": "Divario nei link rispetto ai concorrenti",
  "marketplace.rank": "Punteggio del dominio",
  "marketplace.traffic": "Traffico stimato",
  "marketplace.turnaround": "Tempi di consegna",
  "marketplace.days": "{count} giorni",
  "marketplace.price": "Prezzo indicativo",
  "marketplace.request": "Richiedi una revisione",
  "marketplace.reviewPrice": "Esamina il prezzo",
  "marketplace.quoteLocked": "Configurazione del preventivo necessaria",
  "marketplace.requested": "Richiesto",
  "marketplace.quoteTitle": "Esamina il prezzo della pubblicazione",
  "marketplace.basePrice": "Prezzo del fornitore",
  "marketplace.serviceFee": "Commissione di servizio Milo ({count}%)",
  "marketplace.totalPrice": "Totale esatto",
  "marketplace.quoteExpires":
    "Questo preventivo scade alle {time}. Dopo tale orario è necessario un nuovo preventivo.",
  "marketplace.confirmSponsored":
    'Richiedo una chiara dichiarazione di sponsorizzazione e rel="sponsored" o nofollow sul link.',
  "marketplace.confirmPaymentLive":
    "Autorizzo esplicitamente un ordine presso il fornitore per il totale esatto di €{total}.",
  "marketplace.confirmPaymentDemo":
    "Confermo la richiesta di revisione da €{total} e comprendo che la modalità demo non crea alcun ordine presso il fornitore né alcun pagamento.",
  "marketplace.confirmPurchase": "Conferma l'ordine a pagamento",
  "marketplace.confirmDemoRequest": "Salva la richiesta di revisione",
  "marketplace.confirmedAt": "Confermato",
  "marketplace.ordersEmpty": "Nessuna richiesta di pubblicazione per ora.",
  "marketplace.toast.exists": "Questa offerta ha già una richiesta attiva.",
  "marketplace.toast.requested": "Richiesta di pubblicazione salvata per la revisione.",
  "marketplace.toast.submitted": "Ordine a pagamento inviato al fornitore.",
  "marketplace.toast.catalogError":
    "Non è stato possibile aggiornare il catalogo del fornitore. Il catalogo demo sicuro resta disponibile.",
  "marketplace.toast.quoteError": "Non è stato possibile preparare un preventivo. Riprova.",
  "marketplace.toast.quoteExpired":
    "Il preventivo è scaduto. Richiedi un nuovo prezzo prima di confermare.",
  "marketplace.toast.orderError":
    "L'ordine non è stato creato. Non è stato effettuato alcun pagamento.",
  "marketplace.toast.orderReview":
    "Non è stato possibile confermare l'esito del fornitore. Milo ha salvato la richiesta come In revisione; non riprovare finché l'esito non è stato riconciliato.",
  "marketplace.status.Requested": "Richiesto",
  "marketplace.status.In Review": "In revisione",
  "marketplace.status.Submitted": "Inviato",
  "marketplace.status.Accepted": "Accettato",
  "marketplace.status.Published": "Pubblicato",
  "marketplace.status.Failed": "Non riuscito",
  "marketplace.status.Cancelled": "Annullato",
  "backlinks.integrity.partial": "Metriche parziali",
  "backlinks.integrity.source":
    "Fonte dichiarata: indice DataForSEO alla data dell'analisi salvata, per i domini visualizzati inclusi i sottodomini. Le etichette delle fonti nei dati salvati dello spazio di lavoro non costituiscono una verifica indipendente. — indica un dato non disponibile, mai zero. La copertura dell'indice è incompleta; non si tratta di controlli in tempo reale sulle destinazioni.",
  "backlinks.integrity.legacy":
    "Analisi precedente conservata. La normalizzazione precedente poteva trasformare i dati mancanti in zeri, quindi la sua base numerica non è disponibile. Le raccomandazioni originali restano consigli storici.",
  "backlinks.integrity.scores":
    "I punteggi e le raccomandazioni sono stime dell'IA basate sulle evidenze disponibili, non misurazioni del fornitore, garanzie di posizionamento o risultati misurati.",
  "backlinks.integrity.sample":
    "Campione limitato dei domini principali. I domini omessi non dimostrano l'assenza o la perdita di link; non viene stabilito alcun monitoraggio continuativo.",
  "backlinks.integrity.failed":
    "Richiesta non riuscita. Questa tabella non è disponibile; ciò non significa zero backlink o assenza di divario nei link.",
  "backlinks.integrity.not_requested":
    "Il campione del divario non è stato richiesto perché non sono stati forniti domini di concorrenti.",
  "backlinks.integrity.unknown": "Lo stato di raccolta della tabella è sconosciuto.",
  "backlinks.integrity.empty":
    "Nessuna riga da visualizzare. Controlla lo stato di raccolta sopra prima di interpretare questa tabella.",
  "backlinkMonitor.website_changed":
    "Il sito visualizzato non corrisponde al progetto salvato. Salva o ricarica il progetto prima della raccolta. Non è stata avviata alcuna raccolta.",
  "backlinkMonitor.unavailable":
    "La raccolta non è disponibile finché lo stato del fornitore non conferma un account attivo con saldo disponibile. La cronologia salvata resta accessibile.",
  "backlinkMonitor.yes": "Sì",
  "backlinkMonitor.no": "No",
  "backlinkMonitor.title": "Cronologia dei backlink",
  "backlinkMonitor.note":
    "Conteggi giornalieri dall'indice DataForSEO per il sito salvato. I dati mancanti sono indicati con —, mai con zero. Queste osservazioni non verificano i singoli inserimenti di link. Ogni richiesta utilizza il budget configurato per il fornitore. La raccolta ricorrente viene controllata separatamente sopra.",
  "backlinkMonitor.from": "Dal (UTC)",
  "backlinkMonitor.to": "Al (UTC)",
  "backlinkMonitor.subdomains": "Includi sottodomini",
  "backlinkMonitor.run": "Richiedi i conteggi giornalieri",
  "backlinkMonitor.running": "Raccolta in corso…",
  "backlinkMonitor.new": "Avvia un'altra richiesta",
  "backlinkMonitor.refresh": "Aggiorna la cronologia",
  "backlinkMonitor.loading": "Caricamento della cronologia salvata…",
  "backlinkMonitor.empty": "Nessuna richiesta salvata per ora.",
  "backlinkMonitor.error": "La cronologia non è disponibile. Prova ad aggiornarla.",
  "backlinkMonitor.uncertain":
    "L'esito non è confermato. Aggiorna la cronologia salvata prima di avviare un'altra richiesta; questo non significa che il fornitore non abbia addebitato nulla.",
  "backlinkMonitor.stored": "Osservazione salvata.",
  "backlinkMonitor.existing":
    "Questa richiesta esiste già. Controlla il suo stato salvato qui sotto.",
  "backlinkMonitor.held":
    "Richiesta sospesa. Controlla la cronologia salvata prima di avviare un'altra richiesta.",
  "backlinkMonitor.reserved": "Riservato",
  "backlinkMonitor.dispatched": "Raccolta in corso",
  "backlinkMonitor.succeeded": "Salvato",
  "backlinkMonitor.unknown": "Non confermato",
  "backlinkMonitor.pending": "In attesa",
  "backlinkMonitor.settled": "Contabilizzato",
  "backlinkMonitor.recover": "Recupera la contabilizzazione",
  "backlinkMonitor.recovered": "Contabilizzazione recuperata dal record salvato del fornitore.",
  "backlinkMonitor.recoveryFailed":
    "Non è stato possibile recuperare la contabilizzazione. L'osservazione salvata resta disponibile.",
  "backlinkMonitor.date": "Data (UTC)",
  "backlinkMonitor.newLinks": "Nuovi backlink",
  "backlinkMonitor.lostLinks": "Backlink persi",
  "backlinkMonitor.newDomains": "Nuovi domini di provenienza",
  "backlinkMonitor.lostDomains": "Domini di provenienza persi",
  "backlinkMonitor.newMainDomains": "Nuovi domini principali di provenienza",
  "backlinkMonitor.lostMainDomains": "Domini principali di provenienza persi",
  "backlinkMonitor.reported": "Segnalato",
  "backlinkMonitor.partial": "Parziale",
  "backlinkMonitor.missing": "Mancante",
  "backlinkMonitor.accounting": "Contabilizzazione",
  "backlinkMonitor.observed": "Osservato",
  "backlinkMonitor.request": "Richiesta",
  "backlinkMonitor.invalid": "Scegli un intervallo valido di 1–92 giorni che termini entro oggi.",
  "backlinkDetails.title": "Evidenze sui singoli backlink",
  "backlinkDetails.note":
    "Link rappresentativi dall'indice DataForSEO, fino a 100 per richiesta. Le date del primo e dell'ultimo rilevamento descrivono l'indice; le date effettive di inserimento e rimozione sono sconosciute. Questo non è un inventario completo dei link. Le richieste consumano il budget configurato per il fornitore.",
  "backlinkDetails.run": "Raccogli i dettagli dei link",
  "backlinkDetails.selection": "Selezione delle date",
  "backlinkDetails.first_seen": "Rilevato per la prima volta nel periodo",
  "backlinkDetails.lost_last_seen": "Segnalato come perso, rilevato l'ultima volta nel periodo",
  "backlinkDetails.limit": "Numero massimo di risultati",
  "backlinkDetails.counts":
    "Visualizzati {retained} dei {returned} link restituiti; {total} corrispondenze del fornitore.",
  "backlinkDetails.partial":
    "Esistono altri risultati del fornitore o evidenze omesse. Ogni pagina è un'osservazione separata e l'indice in tempo reale può cambiare tra una pagina e l'altra.",
  "backlinkDetails.noLinks": "Nessun link conservato per questa richiesta.",
  "backlinkDetails.source": "Pagina di provenienza",
  "backlinkDetails.target": "Destinazione",
  "backlinkDetails.anchor": "Testo del link",
  "backlinkDetails.first": "Primo rilevamento (UTC)",
  "backlinkDetails.last": "Ultimo rilevamento (UTC)",
  "backlinkDetails.rank": "Punteggio del fornitore",
  "backlinkDetails.spam": "Punteggio spam",
  "backlinkDetails.lost": "Segnalato come perso",
  "backlinkDetails.offset": "Salta risultati (0–20 000)",
  "backlinkDetails.page":
    "Pagina {page} · {count} righe osservate in questa sequenza. I conteggi possono includere link ripetuti e non costituiscono un inventario completo.",
  "backlinkDetails.next": "Raccogli la pagina successiva (consuma il budget)",
  "backlinkDetails.nextNote":
    "Continua con lo stesso sito e gli stessi filtri. Questo invia una nuova richiesta al fornitore e utilizza il budget configurato.",
  "backlinkDetails.child":
    "Richiesta per la pagina successiva già creata; aggiorna la cronologia per verificarne l'esito",
  "backlinkDetails.pageLimit":
    "È stato raggiunto il limite di 10 000 pagine per questa sequenza. Potrebbero restare altre corrispondenze.",
  "backlinkRecurring.title": "Monitoraggio continuativo dei backlink",
  "backlinkRecurring.note":
    "Raccogli i conteggi dei backlink nuovi e persi per questo sito salvato ogni giorno o settimana. Ogni esecuzione copre giorni UTC completi dall'indice DataForSEO. Le esecuzioni mancate vengono saltate; le osservazioni non verificano i singoli inserimenti né un inventario completo del web.",
  "backlinkRecurring.loading": "Caricamento delle impostazioni di monitoraggio salvate…",
  "backlinkRecurring.error":
    "Le impostazioni di monitoraggio non sono disponibili. Ricarica per riprovare.",
  "backlinkRecurring.enabled":
    "Monitoraggio abilitato: ogni raccolta richiede comunque fondi disponibili presso il fornitore.",
  "backlinkRecurring.paused":
    "Monitoraggio sospeso. Nessuna nuova raccolta automatica è abilitata.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} riservati o spesi su {cap} per questo monitoraggio.",
  "backlinkRecurring.unsettled":
    "Una richiesta precedente ha un esito o un costo irrisolto. Ulteriori raccolte automatiche sono sospese. Controlla la cronologia; i risultati riusciti e salvati potrebbero consentire il recupero della contabilizzazione. Una richiesta inviata non viene ripetuta automaticamente.",
  "backlinkRecurring.capHeld":
    "Il limite mensile residuo è inferiore al costo di una richiesta completa. La raccolta attende il prossimo mese UTC o il salvataggio di una modifica del limite.",
  "backlinkRecurring.changedWebsite":
    "Il sito è cambiato. Salva le impostazioni di monitoraggio per il sito attualmente salvato nel progetto oppure ricarica il progetto se il sito visualizzato non è aggiornato. Le spese esistenti vengono conservate.",
  "backlinkRecurring.next":
    "Prossima scadenza (UTC): {date}. La raccolta inizia a un successivo controllo della pianificazione quando le verifiche dei fondi e dell'account vengono superate.",
  "backlinkRecurring.pause": "Sospendi il monitoraggio",
  "backlinkRecurring.unavailable":
    "La raccolta del fornitore non è attualmente disponibile. Puoi sospendere il monitoraggio e consultare la cronologia salvata. L'abilitazione richiede la conferma di un account attivo del fornitore con saldo disponibile.",
  "backlinkRecurring.settings": "Impostazioni di monitoraggio",
  "backlinkRecurring.enable": "Abilita la raccolta automatica",
  "backlinkRecurring.cadence": "Frequenza",
  "backlinkRecurring.daily": "Giornaliera",
  "backlinkRecurring.weekly": "Settimanale",
  "backlinkRecurring.days": "Giorni UTC completi per esecuzione",
  "backlinkRecurring.cap": "Limite mensile del fornitore (USD)",
  "backlinkRecurring.save": "Salva le impostazioni di monitoraggio",
  "backlinkRecurring.allowance":
    "Questo limite riguarda soltanto questo monitoraggio; salvarlo non aggiunge fondi all'account. Inserisci 0–100 USD con un massimo di sei cifre decimali. Per l'abilitazione servono almeno 0.024 USD più 0.000036 USD per ogni giorno dell'intervallo. Si applicano anche i limiti dell'account e quelli condivisi del fornitore. La sospensione interrompe i nuovi invii; una raccolta già ammessa può comunque terminare e comportare il costo riservato.",
  "backlinkRecurring.invalid":
    "Inserisci 1–92 giorni interi e un limite USD valido. Il limite abilitato deve coprire almeno una richiesta completa.",
  "backlinkRecurring.saved": "Impostazioni di monitoraggio salvate.",
  "backlinkRecurring.uncertain":
    "Il salvataggio non è confermato. Ricarica le impostazioni salvate prima di apportare un'altra modifica; la modifica precedente potrebbe essere già stata salvata.",
  "backlinkRecurring.refresh": "Ricarica le impostazioni salvate (scarta le modifiche)",
  "backlinkRecurring.history": "Consulta le richieste salvate e la contabilizzazione qui sotto",
  "backlinkRecurring.scheduled": "Esecuzione pianificata",
  "backlinkRecurring.manual": "Richiesta manuale",
  "backlinkRecurring.occurrence": "Occorrenza pianificata (UTC)",
  "backlinkRecurring.undispatched":
    "Questa richiesta pianificata non è stata ammessa al fornitore. Il budget riservato per il monitoraggio viene liberato.",
};
