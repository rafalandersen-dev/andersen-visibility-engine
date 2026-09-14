/** Slovenian authoring only; not registered in the runtime or language picker. */
export const slCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Trenutno delo na projektu",
  "awareness.help":
    "Samo v aplikaciji. Ta preverjanja ne pošiljajo e-pošte. Zadržanja ostanejo vidna, dokler se čakalna vrsta ne spremeni; odpiranje ne odobri ali znova zažene dela.",
  "awareness.project": "Izberi projekt",
  "awareness.approval": "Ta natančna različica potrebuje odobritev",
  "awareness.resume": "Odobrena različica je še vedno zadržana",
  "awareness.late":
    "Ta datum je že minil. Preglejte osnutek in izrecno izberite dejanje za razporejanje.",
  "awareness.paused":
    "Avtomatizacija je namenoma začasno ustavljena. Obstoječa zadržanja objav ostajajo ločena.",
  "awareness.disabled": "Avtomatizacija je onemogočena.",
  "awareness.settings": "Odpri nastavitve razporeda",
  "awareness.history":
    "Zadnji shranjeni tedenski rezultat — zgodovinski podatek, ne novo preverjanje zmogljivosti ali virov",
  "awareness.empty": "Na tej strani ni zadržanj zaradi odobritve.",
  "awareness.page": "Stran čakalne vrste {page} od {pages}",
  "awareness.error": "Trenutnih zapisov ni bilo mogoče preveriti. Pred ukrepanjem osvežite.",
  "awareness.checked": "Preverjeno {at}",
  "awareness.weekly": "Trenutni zapisi tedenskih terminov",
  "awareness.earlier": "Prejšnja opozorila v mapi Prejeto",
  "notifications.failureInspect": "Preglej podrobnosti objave",
  "notifications.failureReadError":
    "Podrobnosti objave ni bilo mogoče preveriti. Pred odločitvijo o naslednjem koraku poskusite znova.",
  "notifications.failureReason.contentReview":
    "Shranjeni poskus so ustavila preverjanja vsebine. Odprite osnutek in preglejte njegovo trenutno pripravljenost.",
  "notifications.failureReason.destination":
    "Shranjeni poskus je zabeležil napako povezave s ciljem ali njegovega odziva. Pred ponovnim poskusom preverite cilj.",
  "notifications.failureReason.configuration":
    "Shranjeni poskus je zabeležil manjkajoče ali neveljavne nastavitve objavljanja. Preverite nastavitve projekta.",
  "notifications.failureReason.unknown":
    "Shranjene napake ni bilo mogoče razvrstiti. Pred ponovnim poskusom preglejte osnutek in cilj.",
  "notifications.failureRecorded":
    "Zapis posodobljen {at}, v časovnem pasu vašega brskalnika. Zabeleženih poskusov: {attempts}.",
  "notifications.failureDraftChanged":
    "Osnutek se je po tem zapisu spremenil. Te podrobnosti morda ne opisujejo več njegove trenutne pripravljenosti.",
  "notifications.failureHttp": "Zabeležen odziv spletnega mesta: HTTP {status}.",
  "notifications.failureCheck.links":
    "Razrešite notranje povezave v urejevalnikovi plošči za varnost povezav.",
  "notifications.failureCheck.sourcesReview":
    "Preverite trditve glede na vire ali pri usposobljenem avtorju in dokončajte človeški pregled.",
  "notifications.failureCheck.author":
    "Dodajte ime dejanskega avtorja in življenjepis, dokazilo o usposobljenosti ali profil.",
  "notifications.failureHistoryLimit":
    "To so zgodovinski podatki, shranjeni v Milu. Ne preverjajo cilja, ne odobrijo trenutnega osnutka in ne zaženejo objavljanja znova.",
  "notifications.failureState.absent":
    "Ujemajočega se zapisa v čakalni vrsti ni bilo mogoče najti. Osvežite obvestila in preglejte osnutek.",
  "notifications.failureState.changed":
    "Čakalna vrsta tega vnosa ne označuje več kot neuspešnega. Osvežite obvestila; samo ta sprememba ne potrjuje stanja ciljnega spletnega mesta.",
  "notifications.recoveryInspect": "Preglej shranjeno delo",
  "notifications.recoveryReadError":
    "Shranjenih zapisov avtomatizacije ni bilo mogoče preveriti. Pred odločitvijo o ponovnem zagonu poskusite znova.",
  "notifications.recoveryState.absent":
    "Trenutnega zapisa izvajanja ni bilo mogoče najti. Osvežite obvestila in preverite, ali je bil ta dogodek razrešen.",
  "notifications.recoveryState.running": "Zadnje izvajanje je označeno kot aktivno.",
  "notifications.recoveryState.completed":
    "Zadnje izvajanje se je končalo. Osvežite obvestila za trenutne težave.",
  "notifications.recoveryState.review_required": "Prekinjeno izvajanje še vedno potrebuje pregled.",
  "notifications.recoverySnapshot":
    "Zapisi Milo preverjeni {at}, v časovnem pasu vašega brskalnika.",
  "notifications.recoveryCounts":
    "Načrt {period}: {saved} shranjenih osnutkov. Zapisi v čakalni vrsti za te osnutke: {pending} čaka, {publishing} se izvaja, {published} je zabeleženih kot objavljenih, {failed} neuspešnih in {cancelled} preklicanih.",
  "notifications.recoveryEvidenceLimit":
    "To so zapisi, shranjeni v Milu. Ne preverjajo zadnje operacije umetne inteligence ali ciljnega spletnega mesta. Pred ponovnim poskusom objave z negotovim izidom preverite cilj. Ta pogled ne zažene dela znova.",
  "notifications.recoveryMore":
    "Prikazanih je {shown} od {total} shranjenih osnutkov. Odprite koledar za pregled preostalega dela.",
  "notifications.emailAddressUnverified":
    "Vaš trenutni e-poštni naslov računa ni potrjen. Dokončajte potrditev naslova in nato preverite znova. Če je naslov spremenil skrbnik in nimate povezave za potrditev, se obrnite na podporo Milo. Obvestila v aplikaciji ostajajo na voljo.",
  "notifications.emailAddressUnavailable":
    "Milo ni mogel preveriti potrditve vašega trenutnega e-poštnega naslova. Poskusite pozneje. Povzetke lahko še vedno izklopite in uporabljate obvestila v aplikaciji.",
  "notifications.generation_capacity_low":
    "Razpoložljivo število poskusov priprave morda ne zadostuje za načrt",
  "notifications.generation_capacity_unavailable":
    "Razpoložljivega števila poskusov priprave ni bilo mogoče preveriti",
  "notifications.capacityLow":
    "Načrt {period} še potrebuje {missing} osnutkov za ta projekt in {total} v vseh vaših aktivnih razporedih. Na vašem računu je za obdobje {usagePeriod} še {remaining} poskusov priprave. Ta zmogljivost je skupna in ni zagotovilo dokončanih člankov. Preglejte razpored; shranjeni osnutki ostajajo na voljo za pregled in objavo.",
  "notifications.capacityUnavailable":
    "Milo ni mogel preveriti skupnega razpoložljivega števila poskusov priprave za {usagePeriod}. Načrt {period} tukaj še potrebuje {missing} osnutkov. Preverite pozneje. Shranjeni osnutki in druga obvestila ostajajo na voljo.",
  "notifications.scheduler_recovery": "Avtomatizacija potrebuje pregled za obnovitev",
  "notifications.recovery":
    "Priprava je po prekinjenem izvajanju začasno ustavljena. Pred ponovnim zagonom preglejte shranjene osnutke in zadnjo operacijo. Obstoječe odobritve objav ostajajo nespremenjene.",
  "notifications.emailTitle": "Povzetki po e-pošti",
  "notifications.emailDescription":
    "Prejmite en povzetek novih opozoril, največ enkrat na uro, na potrjeni naslov računa. Vsak dogodek se pojavi enkrat.",
  "notifications.emailDisabled":
    "Dostava e-pošte še ni aktivirana. Obvestila v aplikaciji so na voljo.",
  "notifications.emailEnable": "Omogoči povzetke po e-pošti",
  "notifications.emailDisable": "Izklopi povzetke po e-pošti",
  "notifications.emailError": "Nastavitve e-pošte trenutno niso na voljo.",
  "notifications.emailSaveError": "Nastavitev e-pošte ni bilo mogoče shraniti.",
  "notifications.emailHistory": "Nedavna dejavnost e-pošte",
  "notifications.emailStatus.pending": "Čakanje",
  "notifications.emailStatus.leased": "Preverjanje trenutnega stanja",
  "notifications.emailStatus.sending": "Pošiljanje",
  "notifications.emailStatus.accepted": "Sprejel ponudnik e-pošte",
  "notifications.emailStatus.unknown": "Izid dostave je treba preveriti",
  "notifications.emailStatus.cancelled": "Preklicano",
  "notifications.emailStatus.failed": "E-pošte ni bilo mogoče pripraviti",
  "notifications.title": "Obvestila",
  "notifications.subtitle":
    "Vaše prihajajoče odločitve in težave z objavljanjem, preverjene glede na najnovejše stanje strežnika.",
  "notifications.loading": "Preverjanje vašega načrta…",
  "notifications.empty": "Trenutno ni dejanj, ki potrebujejo vašo pozornost.",
  "notifications.error": "Obvestila trenutno niso na voljo.",
  "notifications.stale":
    "Zadnjega preverjanja ni bilo mogoče dokončati. To so zadnja potrjena opozorila.",
  "notifications.refresh": "Preveri znova",
  "notifications.read": "Označi kot prebrano",
  "notifications.unread": "Neprebrano",
  "notifications.saved": "Prebrano",
  "notifications.open": "Odpri nalogo",
  "notifications.calendar": "Odpri koledar",
  "notifications.project": "Projekt",
  "notifications.approval_due": "Rok za odobritev se bliža",
  "notifications.publication_failed": "Objavo je treba preveriti",
  "notifications.manual_overdue": "Rok ročne naloge je potekel",
  "notifications.cadence_gap": "Naslednji teden potrebuje pozornost",
  "notifications.coverage":
    "{missing} od {total} načrtovanih terminov ni pripravljenih in uvrščenih v čakalno vrsto.",
  "notifications.failure":
    "Pred ponovnim poskusom preverite cilj: prekinjena objava je morda že javno dostopna.",
  "notifications.approval": "Preglejte trenutno različico pred načrtovanim rokom.",
  "notifications.manual":
    "Dokončajte to nalogo ali izberite nov datum. Ta rok velja za ročno nalogo.",
  "notifications.readError":
    "Tega obvestila ni bilo mogoče označiti kot prebranega. Poskusite znova.",
  "team.title": "Milova ekipa",
  "team.help": "En delovni prostor s specialističnimi pogledi na dejansko delo in znanje projekta.",
  "team.selectProject": "Izberite projekt za prikaz njegove ekipe.",
  "team.scope":
    "Stanje opravil zajema izbrani teden. Shranjeni nasveti in poročila so datirana dokazila, ne dokaz aktivnega opravila ali izboljšanih rezultatov.",
  "team.aiRole": "Specialist z umetno inteligenco",
  "team.records": "{count} shranjenih zapisov znanja · stanje pregleda preverite v znanju projekta",
  "team.lastDelivery": "Zadnji predani rezultat v opravilih tega tedna",
  "team.auditFetched": "Shranjena revizija spletnega mesta",
  "team.auditPartial": "Shranjena revizija samo na podlagi konteksta projekta",
  "team.adviceSaved": "Shranjeni nasveti o pripravljenosti za umetno inteligenco",
  "team.imports": "{count} shranjenih uvozov meritev GSC",
  "team.measurementMissing": "Ni shranjenih meritev GSC",
  "team.authorityPrerequisite":
    "Podatke ponudnika in pooblastila za nagovarjanje je treba preveriti v delovnem prostoru za povratne povezave.",
  "team.lesson.title": "Zapomni si uredniško pravilo",
  "team.lesson.help":
    "Zapišite ponavljajočo se željo za ta projekt. S shranjevanjem postane izrecno navodilo projekta za ustrezno prihodnje delo. Običajni popravki članka ne ustvarjajo takih pravil. To ne predstavlja dokaza o dejstvih.",
  "team.lesson.rule": "Navodilo za ta projekt",
  "team.lesson.target": "Velja za",
  "team.lesson.text": "Pisanje",
  "team.lesson.visual": "Vizualne vsebine",
  "team.lesson.both": "Pisanje in vizualne vsebine",
  "team.lesson.save": "Shrani navodilo projekta",
  "team.lesson.manage": "Preglej, uredi ali pozabi znanje",
  "team.lesson.saved":
    "Shranjeno v ta projekt. V znanju projekta lahko navodilo uredite, povrnete ali prekličete.",
  "team.lesson.unknown":
    "Shranjevanja ni bilo mogoče potrditi. Pred ponovnim vnosom navodila preverite znanje projekta.",
  "team.role.lead": "Milo — vodja rasti",
  "team.description.lead": "Usklajuje shranjeni razpored, pokritost in odločitve.",
  "team.open.lead": "Preglej tedensko pripravo",
  "team.role.brand": "Strateg blagovne znamke",
  "team.description.brand":
    "Dejstva projekta, želje in pravila, ki jih je mogoče razveljaviti, z zgodovino virov in pregledov.",
  "team.open.brand": "Preglej znanje projekta",
  "team.role.research": "Raziskovalec iskanja",
  "team.description.research":
    "Tedenska raziskovalna izhodišča in shranjene priložnosti. Pred pisanjem preglejte vire in hipoteze.",
  "team.open.research": "Preglej priložnosti",
  "team.role.content": "Urednik vsebin",
  "team.description.content":
    "Ohranjeni članki še vedno potrebujejo uredniški pregled in odobritev objave natančno določene različice.",
  "team.open.content": "Preglej članke",
  "team.role.image": "Ustvarjalec vizualnih vsebin",
  "team.description.image":
    "Predlagane vizualne vsebine uporabljajo kontekst projekta. Ohranitev ne pomeni odobritve vizualne vsebine.",
  "team.open.image": "Preglej vizualne vsebine članka",
  "team.role.seo": "Specialist SEO",
  "team.description.seo":
    "Datirane ugotovitve revizij strani, notranjih povezav in lokalnih podatkov oziroma entitet. Omejitve delnih revizij ostajajo veljavne.",
  "team.open.seo": "Preglej ugotovitve SEO",
  "team.role.authority": "Povratne povezave in avtoriteta",
  "team.description.authority":
    "Raziskovanje, spremljanje in predlogi so odvisni od preverjenega dostopa do ponudnika. Pošiljanje sporočil in nakup umestitev zahtevata ločeno pooblastilo.",
  "team.open.authority": "Preveri delovni prostor za povratne povezave",
  "team.role.ai": "Analitik vidnosti v umetni inteligenci",
  "team.description.ai":
    "Nasveti o pripravljenosti so ločeni od opaženih odgovorov, omemb in navedb. Spremljanje opaženih rezultatov tukaj ni potrjeno.",
  "team.open.ai": "Preglej nasvete o pripravljenosti",
  "team.role.performance": "Analitik uspešnosti",
  "team.description.performance":
    "Shranjena poročila in datirane meritve. Manjkajoči podatki pomenijo neznano stanje; sama sprememba med prej in potem ne dokazuje vzročnosti.",
  "team.open.performance": "Preglej meritve",
  "team.state.unavailable": "Stanje ni na voljo",
  "team.state.none": "Ni zabeleženega dela",
  "team.state.unknown": "Izid je negotov — preglejte obnovitev",
  "team.state.running": "Delo poteka",
  "team.state.review": "Spremembe lastnika potrebujejo pregled",
  "team.state.retained": "Rezultati ohranjeni za pregled",
  "team.state.cancelled": "Priprava preklicana",
  "collaboration.reviewImageLimits":
    "Te slike presegajo omejitve pregleda ali jih ni mogoče varno prikazati. Zmanjšajte njihovo število ali velikost in uporabite statične slike PNG, JPEG ali WebP.",
  "collaboration.emailInvitation": "Pošlji povabilo po e-pošti",
  "collaboration.invitationEmailHelp":
    "Pošljite povabilo za prikazano vlogo na zgoraj prikazani e-poštni naslov. Odpiranje povezave v e-pošti ne dodeli dostopa.",
  "collaboration.invitationEmailQueued":
    "Pošiljanje povabila po e-pošti je zahtevano. Tukaj preverite stanje dostave.",
  "collaboration.notificationHistory": "Zgodovina dostave obvestil",
  "collaboration.notificationSettings": "Obvestila projekta",
  "collaboration.notificationConsentHelp":
    "Potrebni sta dodelitev s strani lastnika in vaša privolitev. Ob spremembi vaše vloge v projektu je treba nastavitve obnoviti.",
  "collaboration.notificationAssigned": "Dodelil lastnik",
  "collaboration.notificationNotAssigned": "Lastnik ni dodelil",
  "collaboration.notificationOptedIn": "Prejemnik je privolil",
  "collaboration.notificationOptedOut": "Prejemnik ni privolil",
  "collaboration.notificationAssign": "Dodeli obvestila",
  "collaboration.notificationUnassign": "Odstrani dodelitev",
  "collaboration.notificationOptIn": "Dovoli obvestila projekta",
  "collaboration.notificationOptOut": "Izklopi obvestila projekta",
  "collaboration.decisionRecorded": "Odločitev pregleda zabeležena.",
  "collaboration.decisionUnknown":
    "Odločitve ni bilo mogoče potrditi. Pred ponovnim poskusom osvežite pretekle odločitve.",
  "collaboration.reviewNotAllowed":
    "Vaša trenutna vloga ali pravila projekta ne dovoljujejo odločanja o pregledu.",
  "collaboration.acknowledgeReview": "Pregledal/-a sem ta izrisani osnutek in vse njegove slike.",
  "collaboration.approveVersion": "Odobri to različico",
  "collaboration.returnForChanges": "Vrni v popravek",
  "collaboration.reviewDoesNotPublish":
    "Zapis pregleda ne objavi osnutka in ne nadaljuje zadržanega razporeda.",
  "collaboration.reviewHistory": "Pretekle odločitve pregledov",
  "collaboration.approvalRecorded": "Odobritev zabeležena",
  "collaboration.changesRequested": "Zahtevane spremembe",
  "collaboration.owner": "Lastnik",
  "collaboration.collaborator": "Sodelavec",
  "collaboration.renderedReview": "Pregled izrisane vsebine",
  "collaboration.loadingReview": "Nalaganje celotnega pregleda in njegovih slik…",
  "collaboration.incompleteReview":
    "Celotnega pregleda ni bilo mogoče naložiti. Osvežite za preverjanje osnutka in vseh njegovih slik.",
  "collaboration.policyTitle": "Pravila odobravanja",
  "collaboration.policyHelp":
    "Izberite, kdo lahko odobri delo projekta. Sprememba teh pravil umakne obstoječe odobritve sodelavcev; neodvisne odobritve lastnika ostanejo.",
  "collaboration.policyUnselected": "Ni izbrano — odobravanje sodelavcev je neaktivno",
  "collaboration.policy.disabled": "Samo odobritve lastnika",
  "collaboration.policy.separate_reviewers": "Ločeni pregledovalci odobravajo; uredniki urejajo",
  "collaboration.policy.editors_can_approve": "Uredniki in pregledovalci lahko odobravajo",
  "collaboration.savePolicy": "Shrani pravila odobravanja",
  "collaboration.editDraft": "Uredi osnutek",
  "collaboration.editHelp":
    "Shranjevanje vrne ta osnutek v pregled in umakne njegovo prejšnjo odobritev objave.",
  "collaboration.editConflict":
    "Shranjeni osnutek ali vaša vloga se je spremenila. Pred nalaganjem zadnje shranjene različice kopirajte popravke, ki jih želite ohraniti.",
  "collaboration.loadLatest": "Naloži zadnjo shranjeno različico",
  "collaboration.draftSaved": "Osnutek shranjen za pregled.",
  "collaboration.editError":
    "Osnutka ni bilo mogoče shraniti. Vaši popravki so še vedno tukaj; pred ponovnim poskusom preverite trenutno različico in svoj dostop.",
  "collaboration.saveDraft": "Shrani za pregled",
  "collaboration.question": "Vprašanje",
  "collaboration.answer": "Odgovor",
  "collaboration.removeQuestion": "Odstrani vprašanje",
  "collaboration.addQuestion": "Dodaj vprašanje",
  "collaboration.field.title": "Naslov",
  "collaboration.field.h1": "Glavni naslov",
  "collaboration.field.metaTitle": "Naslov za iskanje",
  "collaboration.field.metaDescription": "Opis za iskanje",
  "collaboration.field.markdown": "Članek (Markdown)",
  "collaboration.field.cta": "Poziv k dejanju",
  "collaboration.field.outline": "Oris — vsak naslov v svoji vrstici",
  "collaboration.field.faq": "Vprašanja in odgovori",
  "collaboration.comments": "Komentarji",
  "collaboration.commentLabel": "Vaš komentar",
  "collaboration.addComment": "Dodaj komentar",
  "collaboration.you": "Vi",
  "collaboration.commentRoleAtPosting": "Vloga ob objavi",
  "collaboration.earlierVersion": "Komentar na prejšnjo shranjeno različico.",
  "collaboration.title": "Sodelavci projekta",
  "collaboration.subtitle": "Upravljajte dostop do projekta in odprite delo, deljeno z vami.",
  "collaboration.owned": "Upravljaj svoj projekt",
  "collaboration.shared": "Deljeno z vami",
  "collaboration.invitations": "Vaša povabila",
  "collaboration.members": "Osebe z dostopom",
  "collaboration.pending": "Povabila projekta",
  "collaboration.email": "E-poštni naslov",
  "collaboration.role": "Vloga",
  "collaboration.viewer": "Bralec",
  "collaboration.editor": "Urednik",
  "collaboration.reviewer": "Pregledovalec",
  "collaboration.invite": "Ustvari povabilo",
  "collaboration.inviteHelp":
    "Povabilo se tukaj prikaže, ko se prejemnik prijavi s tem potrjenim e-poštnim naslovom. Poteče po sedmih dneh. To dejanje ne pošlje e-pošte.",
  "collaboration.accept": "Sprejmi povabilo",
  "collaboration.revoke": "Prekliči povabilo",
  "collaboration.remove": "Odstrani dostop",
  "collaboration.saveRole": "Shrani vlogo",
  "collaboration.refresh": "Osveži",
  "collaboration.open": "Odpri projekt",
  "collaboration.loading": "Nalaganje dostopa do projekta…",
  "collaboration.error": "Dostopa ni bilo mogoče potrditi. Pred ponovnim poskusom osvežite.",
  "collaboration.saved": "Dostop do projekta posodobljen.",
  "collaboration.empty": "Za zdaj ni ničesar za prikaz.",
  "collaboration.noOwned":
    "Spodaj lahko odprete deljene projekte, ne da bi ustvarili svoj projekt.",
  "collaboration.drafts": "Osnutki projekta",
  "collaboration.back": "Nazaj na osnutke",
  "collaboration.previous": "Prejšnje",
  "collaboration.next": "Naslednje",
  "collaboration.removed": "Odstranjeno",
  "collaboration.expires": "Poteče",
  "collaboration.history": "Nedavna dejavnost dostopa",
  "collaboration.pendingState": "Čaka",
  "collaboration.expired": "Poteklo",
  "collaboration.accepted": "Sprejeto",
  "collaboration.revoked": "Preklicano",
  "emailSettings.language": "Jezik e-pošte",
  "emailSettings.note":
    "Izberite jezik za operativne povzetke, mesečna poročila in povabila v projekte, ki jih zahtevate. To ne spremeni nastavitev aplikacije, člankov ali trga. Shranjevanje jezika ne omogoči ali pošlje e-pošte.",
  "emailSettings.save": "Shrani jezik e-pošte",
  "emailSettings.saved": "Nastavitve e-pošte shranjene.",
  "emailSettings.uncertain":
    "Shranjenih nastavitev ni bilo mogoče potrditi. Pred naslednjo spremembo jih znova naložite; vaša zadnja sprememba je morda že shranjena.",
  "emailSettings.reload": "Znova naloži shranjene nastavitve (zavrzi spremembe)",
  "collaboration.seats":
    "Vaš paket {plan} vključuje {workingSeats} delovnih mest (uredniki in pregledovalci, vključno z vami) in {viewerSeats} mest za ogled. V uporabi: {usedWorkingSeats} delovnih, {usedViewerSeats} za ogled. Čakajoča povabila rezervirajo mesta, dokler ne potečejo.",
  "collaboration.seatLimit":
    "Za to vlogo ni prostega mesta. Vaš paket vključuje {workingSeats} delovnih mest in {viewerSeats} mest za ogled. Nekoga odstranite ali prekličite povabilo ali nadgradite paket.",
};
