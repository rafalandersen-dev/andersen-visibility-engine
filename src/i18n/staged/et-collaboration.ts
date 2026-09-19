/** Estonian authoring only; not registered in the runtime or language picker. */
export const etCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Projekti praegune töö",
  "awareness.help":
    "Ainult rakenduses. Need kontrollid ei saada e-kirju. Peatatud tööd jäävad nähtavaks, kuni järjekord muutub; nende avamine ei kiida tööd heaks ega käivita seda uuesti.",
  "awareness.project": "Vali projekt",
  "awareness.approval": "Täpne versioon vajab heakskiitu",
  "awareness.resume": "Heakskiidetud versioon on endiselt peatatud",
  "awareness.late":
    "See kuupäev on möödunud. Vaata mustand üle ja vali konkreetne ajastamistoiming.",
  "awareness.paused":
    "Automaatika on tahtlikult peatatud. Olemasolevad avaldamispiirangud jäävad eraldi kehtima.",
  "awareness.disabled": "Automaatika on keelatud.",
  "awareness.settings": "Ava ajastusseaded",
  "awareness.history":
    "Viimane salvestatud nädalatulemus — ajalooline teave, mitte mahu või allikate uus kontroll",
  "awareness.empty": "Sellel lehel pole heakskiitu ootavaid peatamisi.",
  "awareness.page": "Järjekorra leht {page} / {pages}",
  "awareness.error": "Praeguseid kirjeid ei õnnestunud kontrollida. Värskenda enne tegutsemist.",
  "awareness.checked": "Kontrollitud {at}",
  "awareness.weekly": "Praegused nädalaplaani ajavahemike kirjed",
  "awareness.earlier": "Varasemad postkasti teated",
  "notifications.failureInspect": "Uuri avaldamise üksikasju",
  "notifications.failureReadError":
    "Avaldamise üksikasju ei õnnestunud kontrollida. Proovi uuesti, enne kui otsustad järgmise sammu.",
  "notifications.failureReason.contentReview":
    "Salvestatud katse blokeerisid sisukontrollid. Ava mustand, et vaadata selle praegust valmisolekut.",
  "notifications.failureReason.destination":
    "Salvestatud katse teatas sihtkoha ühenduse või vastuse veast. Kontrolli sihtkohta enne uuesti proovimist.",
  "notifications.failureReason.configuration":
    "Salvestatud katse teatas puuduvast või kehtetust avaldamisseadistusest. Kontrolli projekti seadistust.",
  "notifications.failureReason.unknown":
    "Salvestatud viga ei õnnestunud liigitada. Vaata mustand ja sihtkoht enne uuesti proovimist üle.",
  "notifications.failureRecorded":
    "Kirjet uuendati {at}, sinu brauseri ajavööndis. Salvestatud katseid: {attempts}.",
  "notifications.failureDraftChanged":
    "Mustand muutus pärast seda kirjet. Need üksikasjad ei pruugi enam kirjeldada praegust valmisolekut.",
  "notifications.failureHttp": "Salvestatud veebisaidi vastus: HTTP {status}.",
  "notifications.failureCheck.links": "Lahenda siselingid redaktori linkide ohutuse paneelis.",
  "notifications.failureCheck.sourcesReview":
    "Kontrolli väiteid allikate või kvalifitseeritud autori abil ja lõpeta inimese ülevaatus.",
  "notifications.failureCheck.author":
    "Lisa tegeliku autori nimi ja elulugu, kvalifikatsioon või profiil.",
  "notifications.failureHistoryLimit":
    "See on Milos salvestatud ajalooline teave. See ei kontrolli sihtkohta, ei kiida praegust mustandit heaks ega käivita avaldamist uuesti.",
  "notifications.failureState.absent":
    "Vastavat järjekorrakirjet ei leitud. Värskenda teavitusi ja vaata mustand üle.",
  "notifications.failureState.changed":
    "Järjekord ei märgi seda kirjet enam ebaõnnestunuks. Värskenda teavitusi; see üksi ei kinnita sihtveebisaidi seisundit.",
  "notifications.recoveryInspect": "Uuri salvestatud tööd",
  "notifications.recoveryReadError":
    "Salvestatud automaatikakirjeid ei õnnestunud kontrollida. Proovi uuesti, enne kui otsustad töö taaskäivitada.",
  "notifications.recoveryState.absent":
    "Praegust käivituskirjet ei leitud. Värskenda teavitusi, et kontrollida, kas juhtum on lahendatud.",
  "notifications.recoveryState.running": "Viimane käivitus on märgitud aktiivseks.",
  "notifications.recoveryState.completed":
    "Viimane käivitus on lõppenud. Praeguste probleemide nägemiseks värskenda teavitusi.",
  "notifications.recoveryState.review_required": "Katkenud käivitus vajab endiselt ülevaatust.",
  "notifications.recoverySnapshot": "Milo kirjeid kontrolliti {at}, sinu brauseri ajavööndis.",
  "notifications.recoveryCounts":
    "Plaan {period}: {saved} salvestatud mustandit. Nende mustandite järjekorrakirjed: {pending} ootel, {publishing} pooleli, {published} avaldatuna registreeritud, {failed} ebaõnnestunud ja {cancelled} tühistatud.",
  "notifications.recoveryEvidenceLimit":
    "Need on Milos salvestatud kirjed. Need ei kinnita viimast tehisintellekti toimingut ega sihtveebisaidi seisundit. Kontrolli sihtkohta enne ebakindla tulemusega avaldamise kordamist. See vaade ei käivita tööd uuesti.",
  "notifications.recoveryMore":
    "Kuvatakse {shown} salvestatud mustandit kokku {total}-st. Ülejäänud töö uurimiseks ava kalender.",
  "notifications.emailAddressUnverified":
    "Sinu praegune konto e-posti aadress on kinnitamata. Kinnita aadress ja kontrolli seejärel uuesti. Kui administraator muutis aadressi ja sul pole kinnituslinki, võta ühendust Milo toega. Rakendusesisesed teavitused jäävad saadavale.",
  "notifications.emailAddressUnavailable":
    "Milo ei saanud kontrollida sinu praeguse e-posti aadressi kinnitust. Proovi hiljem uuesti. Saad endiselt kokkuvõtted välja lülitada ja kasutada rakendusesiseseid teavitusi.",
  "notifications.generation_capacity_low":
    "Ettevalmistuse limiidist ei pruugi plaani jaoks piisata",
  "notifications.generation_capacity_unavailable":
    "Ettevalmistuse limiiti ei õnnestunud kontrollida",
  "notifications.capacityLow":
    "Perioodi {period} plaan vajab selle projekti jaoks veel {missing} mustandit ja sinu aktiivsete ajastuste peale kokku {total}. Kontol on perioodil {usagePeriod} alles {remaining} ettevalmistuskatset. See on jagatud maht, mitte lubadus valmis artiklite kohta. Vaata ajastus üle; salvestatud mustandid jäävad ülevaatamiseks ja avaldamiseks kättesaadavaks.",
  "notifications.capacityUnavailable":
    "Milo ei saanud kinnitada perioodi {usagePeriod} jagatud ettevalmistuslimiiti. Perioodi {period} plaan vajab siin veel {missing} mustandit. Kontrolli hiljem uuesti. Salvestatud mustandid ja muud teavitused jäävad kättesaadavaks.",
  "notifications.scheduler_recovery": "Automaatika vajab taastamise ülevaatust",
  "notifications.recovery":
    "Ettevalmistus peatati pärast katkenud käivitust. Vaata enne taaskäivitamist üle salvestatud mustandid ja viimane toiming. Olemasolevad avaldamise heakskiidud jäävad muutmata.",
  "notifications.emailTitle": "E-posti kokkuvõtted",
  "notifications.emailDescription":
    "Saa kinnitatud kontoaadressile üks uute teadete kokkuvõte kõige sagedamini kord tunnis. Iga juhtum ilmub ühe korra.",
  "notifications.emailDisabled":
    "E-kirjade saatmist pole veel aktiveeritud. Rakendusesisesed teavitused on saadaval.",
  "notifications.emailEnable": "Luba e-posti kokkuvõtted",
  "notifications.emailDisable": "Lülita e-posti kokkuvõtted välja",
  "notifications.emailError": "E-posti seaded pole ajutiselt saadaval.",
  "notifications.emailSaveError": "E-posti eelistusi ei õnnestunud salvestada.",
  "notifications.emailHistory": "Hiljutine e-posti tegevus",
  "notifications.emailStatus.pending": "Ootel",
  "notifications.emailStatus.leased": "Praeguse oleku kontrollimine",
  "notifications.emailStatus.sending": "Saatmine",
  "notifications.emailStatus.accepted": "E-posti teenusepakkuja võttis vastu",
  "notifications.emailStatus.unknown": "Kohaletoimetamise tulemus vajab kontrollimist",
  "notifications.emailStatus.cancelled": "Tühistatud",
  "notifications.emailStatus.failed": "E-kirja ei õnnestunud ette valmistada",
  "notifications.title": "Teavitused",
  "notifications.subtitle":
    "Sinu eelseisvad otsused ja avaldamisprobleemid, kontrollitud serveri viimase oleku alusel.",
  "notifications.loading": "Plaani kontrollimine…",
  "notifications.empty": "Praegu ei vaja ükski toiming sinu tähelepanu.",
  "notifications.error": "Teavitused pole ajutiselt saadaval.",
  "notifications.stale": "Viimane kontroll jäi pooleli. Need on viimased kinnitatud teated.",
  "notifications.refresh": "Kontrolli uuesti",
  "notifications.read": "Märgi loetuks",
  "notifications.unread": "Lugemata",
  "notifications.saved": "Loetud",
  "notifications.open": "Ava ülesanne",
  "notifications.calendar": "Ava kalender",
  "notifications.project": "Projekt",
  "notifications.approval_due": "Heakskiidu tähtaeg läheneb",
  "notifications.publication_failed": "Avaldamine vajab kontrolli",
  "notifications.manual_overdue": "Käsitsi tehtava ülesande tähtaeg on möödunud",
  "notifications.cadence_gap": "Järgmine nädal vajab tähelepanu",
  "notifications.coverage":
    "Valmis ja järjekorda lisatud sisu puudub {missing} kavandatud ajavahemiku jaoks (kokku {total}).",
  "notifications.failure":
    "Kontrolli sihtkohta enne uuesti proovimist: katkenud avaldamine võis juba õnnestuda.",
  "notifications.approval": "Vaata praegune versioon enne kavandatud tähtaega üle.",
  "notifications.manual":
    "Lõpeta ülesanne või vali uus kuupäev. See tähtaeg käib käsitsi tehtava ülesande kohta.",
  "notifications.readError": "Teavitust ei õnnestunud loetuks märkida. Proovi uuesti.",
  "team.title": "Milo meeskond",
  "team.help":
    "Üks tööruum, kus spetsialistide vaated näitavad tegelikku tööd ja projekti teadmisi.",
  "team.selectProject": "Meeskonna nägemiseks vali projekt.",
  "team.scope":
    "Töö olek hõlmab valitud nädalat. Salvestatud nõuanded ja aruanded on kuupäevastatud tõendusandmed, mitte tõend aktiivse töö või paremate tulemuste kohta.",
  "team.aiRole": "Tehisintellekti spetsialist",
  "team.records": "{count} salvestatud teadmiskirjet · vaata olekut projekti teadmistes",
  "team.lastDelivery": "Viimane tulemus selle nädala töödes",
  "team.auditFetched": "Salvestatud veebisaidi audit",
  "team.auditPartial": "Salvestatud audit ainult projekti konteksti põhjal",
  "team.adviceSaved": "Salvestatud tehisintellekti jaoks valmisoleku nõuanded",
  "team.imports": "{count} salvestatud GSC mõõtmiste importi",
  "team.measurementMissing": "Salvestatud GSC mõõtmised puuduvad",
  "team.authorityPrerequisite":
    "Teenusepakkuja andmeid ja ühenduse võtmise luba tuleb kontrollida tagasilinkide tööruumis.",
  "team.lesson.title": "Jäta toimetamisjuhis meelde",
  "team.lesson.help":
    "Kirjuta selle projekti korduv eelistus. Salvestamine muudab selle asjakohase tulevase töö jaoks sõnaselgeks projektijuhiseks. Tavalised artiklimuudatused ei loo meeldejäetavaid juhiseid. See ei loo faktilist tõendit.",
  "team.lesson.rule": "Selle projekti juhis",
  "team.lesson.target": "Rakenda valdkonnale",
  "team.lesson.text": "Kirjutamine",
  "team.lesson.visual": "Visuaalid",
  "team.lesson.both": "Kirjutamine ja visuaalid",
  "team.lesson.save": "Salvesta projektijuhis",
  "team.lesson.manage": "Vaata teadmised üle, muuda või unusta need",
  "team.lesson.saved":
    "Salvestatud sellesse projekti. Saad seda projekti teadmistes muuta, tagasi pöörata või tühistada.",
  "team.lesson.unknown":
    "Salvestamist ei õnnestunud kinnitada. Kontrolli enne juhise uuesti sisestamist projekti teadmisi.",
  "team.role.lead": "Milo — kasvujuht",
  "team.description.lead": "Koordineerib salvestatud ajastust, katvust ja otsuseid.",
  "team.open.lead": "Vaata nädala ettevalmistus üle",
  "team.role.brand": "Brändistrateeg",
  "team.description.brand":
    "Projekti faktid, eelistused ja tagasipööratavad juhised koos allika ning ülevaatusajalooga.",
  "team.open.brand": "Vaata projekti teadmised üle",
  "team.role.research": "Otsingu-uurija",
  "team.description.research":
    "Iganädalased uurimistöö lähteülesanded ja salvestatud võimalused. Vaata allikad ja hüpoteesid enne kirjutamist üle.",
  "team.open.research": "Vaata võimalused üle",
  "team.role.content": "Sisutoimetaja",
  "team.description.content":
    "Säilitatud artiklid vajavad endiselt toimetaja ülevaatust ja täpse versiooni avaldamise heakskiitu.",
  "team.open.content": "Vaata artiklid üle",
  "team.role.image": "Visuaalide looja",
  "team.description.image":
    "Pakutud visuaalid kasutavad projekti konteksti. Säilitamine ei tähenda visuaali heakskiitu.",
  "team.open.image": "Vaata artikli visuaalid üle",
  "team.role.seo": "SEO spetsialist",
  "team.description.seo":
    "Kuupäevastatud lehesisese, siselinkide ning kohaliku/olemi auditi leiud. Osaliste auditite piirangud säilivad.",
  "team.open.seo": "Vaata SEO leiud üle",
  "team.role.authority": "Tagasilingid ja autoriteet",
  "team.description.authority":
    "Uurimistöö, seire ja ettepanekud sõltuvad kontrollitud juurdepääsust teenusepakkujale. Sõnumite saatmine ja paigutuste ostmine vajavad eraldi luba.",
  "team.open.authority": "Kontrolli tagasilinkide tööruumi",
  "team.role.ai": "Tehisintellektis nähtavuse analüütik",
  "team.description.ai":
    "Valmisoleku nõuanded on eraldi vaadeldud vastustest, mainimistest ja allikaviidetest. Tegelikku jälgimist siin ei tõendata.",
  "team.open.ai": "Vaata valmisoleku nõuanded üle",
  "team.role.performance": "Tulemuslikkuse analüütik",
  "team.description.performance":
    "Salvestatud aruanded ja kuupäevastatud mõõtmised. Puuduvad andmed tähendavad teadmata seisu; pelk muutus enne ja pärast ei tõenda põhjuslikkust.",
  "team.open.performance": "Vaata mõõtmised üle",
  "team.state.unavailable": "Olek pole saadaval",
  "team.state.none": "Salvestatud töö puudub",
  "team.state.unknown": "Tulemus on ebakindel — vaata taastamine üle",
  "team.state.running": "Töö käib",
  "team.state.review": "Omaniku muudatused vajavad ülevaatust",
  "team.state.retained": "Tulemused on ülevaatuseks säilitatud",
  "team.state.cancelled": "Ettevalmistus on tühistatud",
  "collaboration.reviewImageLimits":
    "Need pildid ületavad ülevaatuse piiranguid või neid ei saa ohutult kuvada. Vähenda nende arvu või suurust ja kasuta liikumatuid PNG-, JPEG- või WebP-pilte.",
  "collaboration.emailInvitation": "Saada kutse e-postiga",
  "collaboration.invitationEmailHelp":
    "Saada kutse ülal näidatud e-posti aadressile kuvatud rolliga. E-kirja lingi avamine ei anna juurdepääsu.",
  "collaboration.invitationEmailQueued":
    "Kutsekirja saatmine on taotletud. Kontrolli selle kohaletoimetamise olekut siin.",
  "collaboration.notificationHistory": "Teavituste kohaletoimetamise ajalugu",
  "collaboration.notificationSettings": "Projekti teavitused",
  "collaboration.notificationConsentHelp":
    "Vajalikud on nii omaniku määramine kui ka sinu enda nõusolek. Projektirolli muutmisel tuleb seaded uuendada.",
  "collaboration.notificationAssigned": "Omaniku määratud",
  "collaboration.notificationNotAssigned": "Omanik pole määranud",
  "collaboration.notificationOptedIn": "Saaja on nõustunud",
  "collaboration.notificationOptedOut": "Saaja pole nõustunud",
  "collaboration.notificationAssign": "Määra teavitused",
  "collaboration.notificationUnassign": "Eemalda määramine",
  "collaboration.notificationOptIn": "Luba projekti teavitused",
  "collaboration.notificationOptOut": "Lülita projekti teavitused välja",
  "collaboration.decisionRecorded": "Ülevaatuse otsus on salvestatud.",
  "collaboration.decisionUnknown":
    "Otsust ei õnnestunud kinnitada. Värskenda enne uuesti proovimist varasemaid otsuseid.",
  "collaboration.reviewNotAllowed":
    "Sinu praegune roll või projekti reeglid ei luba ülevaatuse otsuseid.",
  "collaboration.acknowledgeReview": "Vaatasin kuvatud mustandi ja kõik selle pildid üle.",
  "collaboration.approveVersion": "Kiida see versioon heaks",
  "collaboration.returnForChanges": "Saada parandamiseks tagasi",
  "collaboration.reviewDoesNotPublish":
    "Ülevaatuse salvestamine ei avalda mustandit ega jätka peatatud ajastust.",
  "collaboration.reviewHistory": "Varasemad ülevaatuse otsused",
  "collaboration.approvalRecorded": "Heakskiit on salvestatud",
  "collaboration.changesRequested": "Muudatused on taotletud",
  "collaboration.owner": "Omanik",
  "collaboration.collaborator": "Kaastöötaja",
  "collaboration.renderedReview": "Kuvatava sisu ülevaatus",
  "collaboration.loadingReview": "Täieliku ülevaatuse ja selle piltide laadimine…",
  "collaboration.incompleteReview":
    "Täielikku ülevaatust ei õnnestunud laadida. Värskenda, et kontrollida mustandit ja kõiki selle pilte.",
  "collaboration.policyTitle": "Heakskiitmise reeglid",
  "collaboration.policyHelp":
    "Vali, kes saab projekti tööd heaks kiita. Nende reeglite muutmine võtab tagasi olemasolevad kaastöötajate heakskiidud; sõltumatud omaniku heakskiidud jäävad alles.",
  "collaboration.policyUnselected": "Valimata — kaastöötajate heakskiitmine pole aktiivne",
  "collaboration.policy.disabled": "Ainult omaniku heakskiidud",
  "collaboration.policy.separate_reviewers":
    "Eraldi ülevaatajad kiidavad heaks; toimetajad muudavad",
  "collaboration.policy.editors_can_approve": "Toimetajad ja ülevaatajad võivad heaks kiita",
  "collaboration.savePolicy": "Salvesta heakskiitmise reeglid",
  "collaboration.editDraft": "Muuda mustandit",
  "collaboration.editHelp":
    "Salvestamine saadab mustandi tagasi ülevaatusele ja võtab tagasi selle varasema avaldamise heakskiidu.",
  "collaboration.editConflict":
    "Salvestatud mustand või sinu roll on muutunud. Kopeeri säilitatavad muudatused enne viimase salvestatud versiooni laadimist.",
  "collaboration.loadLatest": "Laadi viimane salvestatud versioon",
  "collaboration.draftSaved": "Mustand on ülevaatuseks salvestatud.",
  "collaboration.editError":
    "Mustandit ei õnnestunud salvestada. Sinu muudatused on endiselt siin; kontrolli enne uuesti proovimist praegust versiooni ja oma juurdepääsu.",
  "collaboration.saveDraft": "Salvesta ülevaatuseks",
  "collaboration.question": "Küsimus",
  "collaboration.answer": "Vastus",
  "collaboration.removeQuestion": "Eemalda küsimus",
  "collaboration.addQuestion": "Lisa küsimus",
  "collaboration.field.title": "Pealkiri",
  "collaboration.field.h1": "Põhipealkiri",
  "collaboration.field.metaTitle": "Otsingu pealkiri",
  "collaboration.field.metaDescription": "Otsingu kirjeldus",
  "collaboration.field.markdown": "Artikkel (Markdown)",
  "collaboration.field.cta": "Üleskutse tegevusele",
  "collaboration.field.outline": "Kava — üks pealkiri real",
  "collaboration.field.faq": "Küsimused ja vastused",
  "collaboration.comments": "Kommentaarid",
  "collaboration.commentLabel": "Sinu kommentaar",
  "collaboration.addComment": "Lisa kommentaar",
  "collaboration.you": "Sina",
  "collaboration.commentRoleAtPosting": "Roll postitamise ajal",
  "collaboration.earlierVersion": "Kommentaar varasema salvestatud versiooni kohta.",
  "collaboration.title": "Projekti kaastöötajad",
  "collaboration.subtitle": "Halda projekti juurdepääsu ja ava sinuga jagatud töö.",
  "collaboration.owned": "Halda oma projekti",
  "collaboration.shared": "Sinuga jagatud",
  "collaboration.invitations": "Sinu kutsed",
  "collaboration.members": "Juurdepääsuga inimesed",
  "collaboration.pending": "Projekti kutsed",
  "collaboration.email": "E-posti aadress",
  "collaboration.role": "Roll",
  "collaboration.viewer": "Vaataja",
  "collaboration.editor": "Toimetaja",
  "collaboration.reviewer": "Ülevaataja",
  "collaboration.invite": "Loo kutse",
  "collaboration.inviteHelp":
    "Kutse ilmub siia, kui saaja logib sisse selle kinnitatud e-posti aadressiga. Kutse aegub seitsme päeva pärast. See toiming ei saada e-kirja.",
  "collaboration.accept": "Võta kutse vastu",
  "collaboration.revoke": "Tühista kutse",
  "collaboration.remove": "Eemalda juurdepääs",
  "collaboration.saveRole": "Salvesta roll",
  "collaboration.refresh": "Värskenda",
  "collaboration.open": "Ava projekt",
  "collaboration.loading": "Projekti juurdepääsu laadimine…",
  "collaboration.error": "Juurdepääsu ei õnnestunud kinnitada. Värskenda enne uuesti proovimist.",
  "collaboration.saved": "Projekti juurdepääs on uuendatud.",
  "collaboration.empty": "Midagi pole veel näidata.",
  "collaboration.noOwned": "Saad allpool jagatud projekte avada ilma oma projekti loomata.",
  "collaboration.drafts": "Projekti mustandid",
  "collaboration.back": "Tagasi mustandite juurde",
  "collaboration.previous": "Eelmine",
  "collaboration.next": "Järgmine",
  "collaboration.removed": "Eemaldatud",
  "collaboration.expires": "Aegub",
  "collaboration.history": "Hiljutine juurdepääsutegevus",
  "collaboration.pendingState": "Ootel",
  "collaboration.expired": "Aegunud",
  "collaboration.accepted": "Vastu võetud",
  "collaboration.revoked": "Tühistatud",
  "emailSettings.language": "E-kirjade keel",
  "emailSettings.note":
    "Vali oma tegevuskokkuvõtete, kuuaruannete ja taotletavate projektikutsete keel. See ei muuda rakenduse, artikli ega turu seadeid. Keele salvestamine ei luba ega saada e-kirju.",
  "emailSettings.save": "Salvesta e-kirjade keel",
  "emailSettings.saved": "E-posti seaded on salvestatud.",
  "emailSettings.uncertain":
    "Salvestatud seadeid ei õnnestunud kinnitada. Laadi need enne uut muudatust uuesti; viimane muudatus võib juba salvestatud olla.",
  "emailSettings.reload": "Laadi salvestatud seaded uuesti (loobu muudatustest)",
  "collaboration.seats":
    "Sinu pakett {plan} sisaldab {workingSeats} töökohta (toimetajad ja ülevaatajad, sina kaasa arvatud) ja {viewerSeats} vaatajakohta. Kasutusel: {usedWorkingSeats} töökohta, {usedViewerSeats} vaatajakohta. Ootel kutsed hoiavad kohti kuni aegumiseni.",
  "collaboration.seatLimit":
    "Selle rolli jaoks pole vaba kohta. Sinu pakett sisaldab {workingSeats} töökohta ja {viewerSeats} vaatajakohta. Eemalda keegi, tühista kutse või uuenda paketti.",
};
