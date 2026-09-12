/** Croatian authoring only; not registered in the runtime or language picker. */
export const hrCollab: Readonly<Record<string, string>> = {
  "awareness.title": "Trenutačni rad na projektu",
  "awareness.help":
    "Samo u aplikaciji. Ove provjere ne šalju e-poštu. Zadržavanja ostaju vidljiva dok se red čekanja ne promijeni; njihovo otvaranje ne odobrava niti ponovno pokreće rad.",
  "awareness.project": "Odaberi projekt",
  "awareness.approval": "Potrebno je odobrenje točne verzije",
  "awareness.resume": "Odobrena verzija i dalje je zadržana",
  "awareness.late":
    "Ovaj je datum prošao. Pregledajte nacrt i odaberite izričitu radnju zakazivanja.",
  "awareness.paused":
    "Automatizacija je namjerno pauzirana. Postojeća zadržavanja objava ostaju zasebna.",
  "awareness.disabled": "Automatizacija je onemogućena.",
  "awareness.settings": "Otvori postavke rasporeda",
  "awareness.history":
    "Posljednji spremljeni tjedni rezultat — povijesni podatak, a ne nova provjera kapaciteta ili izvora",
  "awareness.empty": "Na ovoj stranici nema zadržavanja zbog odobrenja.",
  "awareness.page": "Stranica reda čekanja {page} od {pages}",
  "awareness.error":
    "Trenutačne zapise nije bilo moguće provjeriti. Osvježite prije poduzimanja radnji.",
  "awareness.checked": "Provjereno {at}",
  "awareness.weekly": "Trenutačni zapisi tjednih termina",
  "awareness.earlier": "Ranija upozorenja pristigle pošte",
  "notifications.failureInspect": "Pregledaj pojedinosti objave",
  "notifications.failureReadError":
    "Pojedinosti objave nije bilo moguće provjeriti. Pokušajte ponovno prije odluke o sljedećoj radnji.",
  "notifications.failureReason.contentReview":
    "Spremljeni pokušaj blokirale su provjere sadržaja. Otvorite nacrt kako biste pregledali njegovu trenutačnu spremnost.",
  "notifications.failureReason.destination":
    "Spremljeni pokušaj prijavio je pogrešku veze ili odgovora odredišta. Provjerite odredište prije ponovnog pokušaja.",
  "notifications.failureReason.configuration":
    "Spremljeni pokušaj prijavio je nedostajuće ili nevaljane postavke objavljivanja. Provjerite Postavke projekta.",
  "notifications.failureReason.unknown":
    "Spremljenu pogrešku nije bilo moguće razvrstati. Pregledajte nacrt i odredište prije ponovnog pokušaja.",
  "notifications.failureRecorded":
    "Zapis ažuriran {at}, u vremenskoj zoni vašeg preglednika. Zabilježeni pokušaji: {attempts}.",
  "notifications.failureDraftChanged":
    "Nacrt se promijenio nakon ovog zapisa. Ove pojedinosti možda više ne opisuju njegovu trenutačnu spremnost.",
  "notifications.failureHttp": "Zabilježeni odgovor web-mjesta: HTTP {status}.",
  "notifications.failureCheck.links":
    "Riješite interne poveznice na ploči za sigurnost poveznica u uređivaču.",
  "notifications.failureCheck.sourcesReview":
    "Provjerite tvrdnje prema izvorima ili s kvalificiranim autorom te dovršite ljudski pregled.",
  "notifications.failureCheck.author":
    "Dodajte ime stvarnog autora i biografiju, kvalifikaciju ili profil.",
  "notifications.failureHistoryLimit":
    "Ovo su povijesni podaci spremljeni u Milu. Ne provjeravaju odredište, ne odobravaju trenutačni nacrt niti ponovno pokreću objavljivanje.",
  "notifications.failureState.absent":
    "Nije pronađen odgovarajući zapis reda čekanja. Osvježite obavijesti i pregledajte nacrt.",
  "notifications.failureState.changed":
    "Red čekanja više ne označava ovu stavku kao neuspjelu. Osvježite obavijesti; samo to ne potvrđuje stanje odredišnog web-mjesta.",
  "notifications.recoveryInspect": "Pregledaj spremljeni rad",
  "notifications.recoveryReadError":
    "Spremljene zapise automatizacije nije bilo moguće provjeriti. Pokušajte ponovno prije odluke o ponovnom pokretanju.",
  "notifications.recoveryState.absent":
    "Nije pronađen trenutačni zapis pokretanja. Osvježite obavijesti kako biste provjerili je li ovaj incident riješen.",
  "notifications.recoveryState.running": "Najnovije pokretanje označeno je kao aktivno.",
  "notifications.recoveryState.completed":
    "Najnovije pokretanje je završeno. Osvježite obavijesti za trenutačne probleme.",
  "notifications.recoveryState.review_required": "Prekinuto pokretanje i dalje zahtijeva pregled.",
  "notifications.recoverySnapshot":
    "Milo zapisi provjereni {at}, u vremenskoj zoni vašeg preglednika.",
  "notifications.recoveryCounts":
    "Plan {period}: spremljeni nacrti {saved}. Zapisi reda čekanja za te nacrte: {pending} čeka, {publishing} u tijeku, {published} evidentirano kao objavljeno, {failed} neuspjelo i {cancelled} otkazano.",
  "notifications.recoveryEvidenceLimit":
    "Ovo su zapisi spremljeni u Milu. Ne provjeravaju posljednju radnju umjetne inteligencije ni odredišno web-mjesto. Provjerite odredište prije ponavljanja objave s neizvjesnim ishodom. Ovaj prikaz ne pokreće rad ponovno.",
  "notifications.recoveryMore":
    "Prikazano {shown} od {total} spremljenih nacrta. Otvorite kalendar kako biste pregledali preostali rad.",
  "notifications.emailAddressUnverified":
    "Trenutačna adresa e-pošte vašeg računa nije potvrđena. Dovršite potvrdu e-pošte, a zatim provjerite ponovno. Ako je administrator promijenio adresu, a nemate poveznicu za potvrdu, obratite se Milo podršci. Obavijesti u aplikaciji ostaju dostupne.",
  "notifications.emailAddressUnavailable":
    "Milo nije mogao provjeriti trenutačnu potvrdu vaše e-pošte. Pokušajte kasnije. I dalje možete isključiti sažetke i koristiti obavijesti u aplikaciji.",
  "notifications.generation_capacity_low":
    "Dopušteni broj pokušaja pripreme možda neće pokriti plan",
  "notifications.generation_capacity_unavailable":
    "Dopušteni broj pokušaja pripreme nije bilo moguće provjeriti",
  "notifications.capacityLow":
    "Za plan {period} još nedostaje {missing} nacrta u ovom projektu i ukupno {total} u vašim aktivnim rasporedima. Na računu vam preostaje {remaining} pokušaja pripreme u razdoblju {usagePeriod}. To je zajednički kapacitet, a ne obećanje dovršenih članaka. Pregledajte raspored; spremljeni nacrti ostaju dostupni za pregled i objavu.",
  "notifications.capacityUnavailable":
    "Milo nije mogao provjeriti zajednički dopušteni broj pokušaja pripreme za {usagePeriod}. Za plan {period} ovdje još nedostaje {missing} nacrta. Provjerite kasnije. Spremljeni nacrti i druge obavijesti ostaju dostupni.",
  "notifications.scheduler_recovery": "Automatizacija zahtijeva pregled oporavka",
  "notifications.recovery":
    "Priprema je pauzirana nakon prekinutog pokretanja. Pregledajte spremljene nacrte i posljednju radnju prije ponovnog pokretanja. Postojeća odobrenja objave ostaju nepromijenjena.",
  "notifications.emailTitle": "Sažeci e-poštom",
  "notifications.emailDescription":
    "Primite jedan sažetak novih upozorenja, najviše jednom na sat, na potvrđenu adresu računa. Svaki se incident pojavljuje jednom.",
  "notifications.emailDisabled":
    "Dostava e-pošte još nije aktivirana. Obavijesti u aplikaciji dostupne su.",
  "notifications.emailEnable": "Omogući sažetke e-poštom",
  "notifications.emailDisable": "Isključi sažetke e-poštom",
  "notifications.emailError": "Postavke e-pošte privremeno nisu dostupne.",
  "notifications.emailSaveError": "Postavke e-pošte nije bilo moguće spremiti.",
  "notifications.emailHistory": "Nedavna aktivnost e-pošte",
  "notifications.emailStatus.pending": "Čeka",
  "notifications.emailStatus.leased": "Provjera trenutačnog stanja",
  "notifications.emailStatus.sending": "Slanje",
  "notifications.emailStatus.accepted": "Prihvatio pružatelj usluge e-pošte",
  "notifications.emailStatus.unknown": "Ishod dostave treba provjeriti",
  "notifications.emailStatus.cancelled": "Otkazano",
  "notifications.emailStatus.failed": "E-poruku nije bilo moguće pripremiti",
  "notifications.title": "Obavijesti",
  "notifications.subtitle":
    "Vaše predstojeće odluke i problemi s objavljivanjem, provjereni prema najnovijem stanju na poslužitelju.",
  "notifications.loading": "Provjera vašeg plana…",
  "notifications.empty": "Trenutačno nema radnji koje zahtijevaju vašu pozornost.",
  "notifications.error": "Obavijesti privremeno nisu dostupne.",
  "notifications.stale":
    "Najnovija provjera nije dovršena. Ovo su posljednja potvrđena upozorenja.",
  "notifications.refresh": "Provjeri ponovno",
  "notifications.read": "Označi kao pročitano",
  "notifications.unread": "Nepročitano",
  "notifications.saved": "Pročitano",
  "notifications.open": "Otvori zadatak",
  "notifications.calendar": "Otvori kalendar",
  "notifications.project": "Projekt",
  "notifications.approval_due": "Uskoro je potrebno odobrenje",
  "notifications.publication_failed": "Objava zahtijeva provjeru",
  "notifications.manual_overdue": "Ručni zadatak kasni",
  "notifications.cadence_gap": "Sljedeći tjedan zahtijeva pozornost",
  "notifications.coverage":
    "{missing} od {total} planiranih termina nije spremno i u redu čekanja.",
  "notifications.failure":
    "Provjerite odredište prije ponovnog pokušaja: prekinuta objava možda je već dostupna na web-mjestu.",
  "notifications.approval": "Pregledajte trenutačnu verziju prije planiranog roka.",
  "notifications.manual":
    "Dovršite ovaj zadatak ili odaberite novi datum. Ovaj se rok odnosi na ručni zadatak.",
  "notifications.readError":
    "Ovu obavijest nije bilo moguće označiti kao pročitanu. Pokušajte ponovno.",
  "team.title": "Milov tim",
  "team.help": "Jedan radni prostor sa stručnim prikazima stvarnog rada i znanja projekta.",
  "team.selectProject": "Odaberite projekt kako biste vidjeli njegov tim.",
  "team.scope":
    "Status poslova obuhvaća odabrani tjedan. Spremljeni savjeti i izvješća datirani su dokazi, a ne dokaz aktivnog posla ili boljih rezultata.",
  "team.aiRole": "Stručnjak umjetne inteligencije",
  "team.records":
    "Spremljeni zapisi znanja: {count} · provjerite status pregleda u znanju projekta",
  "team.lastDelivery": "Posljednja isporuka u poslovima ovog tjedna",
  "team.auditFetched": "Spremljena revizija web-mjesta",
  "team.auditPartial": "Spremljena revizija koja koristi samo kontekst projekta",
  "team.adviceSaved": "Spremljeni savjeti o spremnosti za umjetnu inteligenciju",
  "team.imports": "Spremljeni uvozi GSC mjerenja: {count}",
  "team.measurementMissing": "Nema spremljenih GSC mjerenja",
  "team.authorityPrerequisite":
    "Podatke pružatelja usluge i ovlasti za kontaktiranje treba provjeriti u radnom prostoru povratnih poveznica.",
  "team.lesson.title": "Zapamti uredničko pravilo",
  "team.lesson.help":
    "Napišite trajnu preferenciju za ovaj projekt. Spremanjem postaje izričita uputa projekta za relevantan budući rad. Obične izmjene članka ne stvaraju pravila. Time se ne uspostavlja činjenični dokaz.",
  "team.lesson.rule": "Uputa za ovaj projekt",
  "team.lesson.target": "Primijeni na",
  "team.lesson.text": "Pisanje",
  "team.lesson.visual": "Vizualni sadržaj",
  "team.lesson.both": "Pisanje i vizualni sadržaj",
  "team.lesson.save": "Spremi uputu projekta",
  "team.lesson.manage": "Pregledaj, uredi ili zaboravi znanje",
  "team.lesson.saved":
    "Spremljeno u ovaj projekt. Možete urediti, vratiti ili opozvati u znanju projekta.",
  "team.lesson.unknown":
    "Spremanje nije moguće potvrditi. Provjerite znanje projekta prije ponovnog unosa upute.",
  "team.role.lead": "Milo — voditelj rasta",
  "team.description.lead": "Koordinira spremljeni raspored, pokrivenost i odluke.",
  "team.open.lead": "Pregledaj tjednu pripremu",
  "team.role.brand": "Strateg brenda",
  "team.description.brand":
    "Činjenice projekta, preferencije i pravila koja se mogu opozvati, uz izvor i povijest pregleda.",
  "team.open.brand": "Pregledaj znanje projekta",
  "team.role.research": "Istraživač pretraživanja",
  "team.description.research":
    "Tjedni istraživački sažeci i spremljene prilike. Pregledajte izvore i hipoteze prije pisanja.",
  "team.open.research": "Pregledaj prilike",
  "team.role.content": "Urednik sadržaja",
  "team.description.content":
    "Zadržani članci i dalje zahtijevaju urednički pregled i odobrenje objave točne verzije.",
  "team.open.content": "Pregledaj članke",
  "team.role.image": "Autor vizualnog sadržaja",
  "team.description.image":
    "Predloženi vizualni sadržaj koristi kontekst projekta. Zadržavanje ne znači vizualno odobrenje.",
  "team.open.image": "Pregledaj vizualni sadržaj članka",
  "team.role.seo": "SEO stručnjak",
  "team.description.seo":
    "Datirani nalazi revizije stranice, internih poveznica i lokalnih podataka/entiteta. Djelomične revizije zadržavaju svoja ograničenja.",
  "team.open.seo": "Pregledaj SEO nalaze",
  "team.role.authority": "Povratne poveznice i autoritet",
  "team.description.authority":
    "Istraživanje, praćenje i prijedlozi ovise o provjerenom pristupu pružatelju usluge. Slanje poruka i kupnja postavljanja poveznica zahtijevaju zasebne ovlasti.",
  "team.open.authority": "Provjeri radni prostor povratnih poveznica",
  "team.role.ai": "Analitičar vidljivosti u umjetnoj inteligenciji",
  "team.description.ai":
    "Savjeti o spremnosti odvojeni su od opaženih odgovora, spominjanja i citiranja. Ovdje nije uspostavljeno praćenje opažanja.",
  "team.open.ai": "Pregledaj savjete o spremnosti",
  "team.role.performance": "Analitičar rezultata",
  "team.description.performance":
    "Spremljena izvješća i datirana mjerenja. Nedostajući podaci su nepoznanica; sama promjena prije/poslije ne dokazuje uzročnost.",
  "team.open.performance": "Pregledaj mjerenja",
  "team.state.unavailable": "Status nije dostupan",
  "team.state.none": "Nema zabilježenog rada",
  "team.state.unknown": "Ishod je neizvjestan — pregledajte oporavak",
  "team.state.running": "Rad je u tijeku",
  "team.state.review": "Vlasnikove promjene zahtijevaju pregled",
  "team.state.retained": "Rezultati zadržani za pregled",
  "team.state.cancelled": "Priprema otkazana",
  "collaboration.reviewImageLimits":
    "Ove slike premašuju ograničenja pregleda ili se ne mogu sigurno prikazati. Smanjite njihov broj ili veličinu i koristite statične PNG, JPEG ili WebP slike.",
  "collaboration.emailInvitation": "Pošalji pozivnicu e-poštom",
  "collaboration.invitationEmailHelp":
    "Pošaljite pozivnicu na gore prikazanu adresu e-pošte za prikazanu ulogu. Otvaranje poveznice iz e-poruke ne daje pristup.",
  "collaboration.invitationEmailQueued":
    "Zatraženo je slanje pozivnice e-poštom. Ovdje provjerite status dostave.",
  "collaboration.notificationHistory": "Povijest dostave obavijesti",
  "collaboration.notificationSettings": "Obavijesti projekta",
  "collaboration.notificationConsentHelp":
    "Potrebni su i dodjela vlasnika i vaš pristanak. Promjene vaše uloge u projektu zahtijevaju ponovno postavljanje.",
  "collaboration.notificationAssigned": "Vlasnik dodijelio",
  "collaboration.notificationNotAssigned": "Vlasnik nije dodijelio",
  "collaboration.notificationOptedIn": "Primatelj je pristao",
  "collaboration.notificationOptedOut": "Primatelj nije pristao",
  "collaboration.notificationAssign": "Dodijeli obavijesti",
  "collaboration.notificationUnassign": "Ukloni dodjelu",
  "collaboration.notificationOptIn": "Dopusti obavijesti projekta",
  "collaboration.notificationOptOut": "Isključi obavijesti projekta",
  "collaboration.decisionRecorded": "Odluka pregleda zabilježena.",
  "collaboration.decisionUnknown":
    "Odluku nije bilo moguće potvrditi. Osvježite prethodne odluke prije ponovnog pokušaja.",
  "collaboration.reviewNotAllowed":
    "Vaša trenutačna uloga ili pravila projekta ne dopuštaju odluke pregleda.",
  "collaboration.acknowledgeReview": "Pregledao/la sam ovaj prikazani nacrt i sve njegove slike.",
  "collaboration.approveVersion": "Odobri ovu verziju",
  "collaboration.returnForChanges": "Vrati na doradu",
  "collaboration.reviewDoesNotPublish":
    "Bilježenje pregleda ne objavljuje nacrt niti nastavlja zadržani raspored.",
  "collaboration.reviewHistory": "Prethodne odluke pregleda",
  "collaboration.approvalRecorded": "Odobrenje zabilježeno",
  "collaboration.changesRequested": "Zatražene promjene",
  "collaboration.owner": "Vlasnik",
  "collaboration.collaborator": "Suradnik",
  "collaboration.renderedReview": "Pregled prikazanog sadržaja",
  "collaboration.loadingReview": "Učitavanje cijelog pregleda i njegovih slika…",
  "collaboration.incompleteReview":
    "Cijeli pregled nije bilo moguće učitati. Osvježite kako biste provjerili nacrt i sve njegove slike.",
  "collaboration.policyTitle": "Pravila odobravanja",
  "collaboration.policyHelp":
    "Odaberite tko može odobravati rad projekta. Promjena ovih pravila povlači postojeća odobrenja suradnika; neovisna odobrenja vlasnika ostaju.",
  "collaboration.policyUnselected": "Nije odabrano — odobravanje suradnika nije aktivno",
  "collaboration.policy.disabled": "Samo odobrenja vlasnika",
  "collaboration.policy.separate_reviewers": "Zasebni pregledavatelji odobravaju; urednici uređuju",
  "collaboration.policy.editors_can_approve": "Urednici i pregledavatelji mogu odobravati",
  "collaboration.savePolicy": "Spremi pravila odobravanja",
  "collaboration.editDraft": "Uredi nacrt",
  "collaboration.editHelp":
    "Spremanje vraća ovaj nacrt na pregled i povlači njegovo prethodno odobrenje objave.",
  "collaboration.editConflict":
    "Spremljeni nacrt ili vaša uloga promijenili su se. Kopirajte izmjene koje želite zadržati prije učitavanja najnovije spremljene verzije.",
  "collaboration.loadLatest": "Učitaj najnoviju spremljenu verziju",
  "collaboration.draftSaved": "Nacrt spremljen za pregled.",
  "collaboration.editError":
    "Nacrt nije bilo moguće spremiti. Vaše su izmjene još ovdje; provjerite trenutačnu verziju i svoj pristup prije ponovnog pokušaja.",
  "collaboration.saveDraft": "Spremi za pregled",
  "collaboration.question": "Pitanje",
  "collaboration.answer": "Odgovor",
  "collaboration.removeQuestion": "Ukloni pitanje",
  "collaboration.addQuestion": "Dodaj pitanje",
  "collaboration.field.title": "Naslov",
  "collaboration.field.h1": "Glavni naslov",
  "collaboration.field.metaTitle": "Naslov za pretraživanje",
  "collaboration.field.metaDescription": "Opis za pretraživanje",
  "collaboration.field.markdown": "Članak (Markdown)",
  "collaboration.field.cta": "Poziv na radnju",
  "collaboration.field.outline": "Struktura — jedan naslov po retku",
  "collaboration.field.faq": "Pitanja i odgovori",
  "collaboration.comments": "Komentari",
  "collaboration.commentLabel": "Vaš komentar",
  "collaboration.addComment": "Dodaj komentar",
  "collaboration.you": "Vi",
  "collaboration.commentRoleAtPosting": "Uloga u trenutku objave",
  "collaboration.earlierVersion": "Komentar na raniju spremljenu verziju.",
  "collaboration.title": "Suradnici projekta",
  "collaboration.subtitle": "Upravljajte pristupom projektu i otvorite rad podijeljen s vama.",
  "collaboration.owned": "Upravljajte svojim projektom",
  "collaboration.shared": "Podijeljeno s vama",
  "collaboration.invitations": "Vaše pozivnice",
  "collaboration.members": "Osobe s pristupom",
  "collaboration.pending": "Pozivnice projekta",
  "collaboration.email": "Adresa e-pošte",
  "collaboration.role": "Uloga",
  "collaboration.viewer": "Čitatelj",
  "collaboration.editor": "Urednik",
  "collaboration.reviewer": "Pregledavatelj",
  "collaboration.invite": "Izradi pozivnicu",
  "collaboration.inviteHelp":
    "Pozivnica se prikazuje ovdje kada se primatelj prijavi s ovom potvrđenom adresom e-pošte. Istječe nakon sedam dana. Ova radnja ne šalje e-poruku.",
  "collaboration.accept": "Prihvati pozivnicu",
  "collaboration.revoke": "Opozovi pozivnicu",
  "collaboration.remove": "Ukloni pristup",
  "collaboration.saveRole": "Spremi ulogu",
  "collaboration.refresh": "Osvježi",
  "collaboration.open": "Otvori projekt",
  "collaboration.loading": "Učitavanje pristupa projektu…",
  "collaboration.error": "Pristup nije bilo moguće potvrditi. Osvježite prije ponovnog pokušaja.",
  "collaboration.saved": "Pristup projektu ažuriran.",
  "collaboration.empty": "Još nema ničega za prikaz.",
  "collaboration.noOwned":
    "U nastavku možete otvoriti podijeljene projekte bez izrade vlastitog projekta.",
  "collaboration.drafts": "Nacrti projekta",
  "collaboration.back": "Natrag na nacrte",
  "collaboration.previous": "Prethodno",
  "collaboration.next": "Sljedeće",
  "collaboration.removed": "Uklonjeno",
  "collaboration.expires": "Istječe",
  "collaboration.history": "Nedavna aktivnost pristupa",
  "collaboration.pendingState": "Na čekanju",
  "collaboration.expired": "Isteklo",
  "collaboration.accepted": "Prihvaćeno",
  "collaboration.revoked": "Opozvano",
  "emailSettings.language": "Jezik e-pošte",
  "emailSettings.note":
    "Odaberite jezik svojih operativnih sažetaka, mjesečnih izvješća i pozivnica projekta čije slanje zatražite. Time se ne mijenjaju postavke aplikacije, članka ili tržišta. Spremanje jezika ne omogućuje niti šalje e-poštu.",
  "emailSettings.save": "Spremi jezik e-pošte",
  "emailSettings.saved": "Postavke e-pošte spremljene.",
  "emailSettings.uncertain":
    "Spremljene postavke nije bilo moguće potvrditi. Ponovno ih učitajte prije sljedeće promjene; posljednja promjena možda je već spremljena.",
  "emailSettings.reload": "Ponovno učitaj spremljene postavke (odbaci izmjene)",
};
