/** Latvian authoring only; not registered in the runtime or language picker.
 * `backlinks.gapNote` and `backlinks.integrity.*` follow `backlink-integrity.ts`;
 * `linknet.policyNote` and `linknet.reciprocalWarn` follow `link-network-copy.ts`. */
export const lvLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Saišu izaugsmes tīkls",
  "linknet.subtitle":
    "Saņemiet atbilstības ar piemērotām vietnēm Milo tīklā, nosūtiet personisku iepazīšanās ziņojumu un ļaujiet Milo pārbaudīt, vai saite tiešām ir publicēta.",
  "linknet.policyNote":
    "Atbilstība ir pirmajā vietā: atbilstībām nepieciešamas kopīgas tēmas, tiešās saišu apmaiņas tiek atzīmētas, un nekas netiek izvietots automātiski. Šīs pārbaudes negarantē atbilstību meklētājprogrammu politikām.",
  "linknet.topics": "Tēmas",
  "linknet.topicsPlaceholder": "Tēmas (atdalītas ar komatiem)",
  "linknet.contact": "Kontakta e-pasts",
  "linknet.contactPlaceholder": "Kontakta e-pasts partneriem",
  "linknet.join": "Pievienoties tīklam",
  "linknet.update": "Atjaunināt ierakstu",
  "linknet.pause": "Apturēt",
  "linknet.joined": "Iekļauts sarakstā — partneri tagad var atrast šo vietni.",
  "linknet.paused": "Ieraksts apturēts.",
  "linknet.find": "Atrast partnerus",
  "linknet.noMatches":
    "Atbilstošu partneru vēl nav — tīkls aug ar katru Milo vietni, kas pievienojas.",
  "linknet.score": "Atbilstība",
  "linknet.copyIntro": "Kopēt iepazīšanās e-pastu",
  "linknet.introCopied": "Iepazīšanās ziņojums nokopēts — ielīmējiet to savā e-pastā.",
  "linknet.markContacted": "Atzīmēt kā uzrunātu",
  "linknet.markAgreed": "Atzīmēt kā saskaņotu",
  "linknet.decline": "Noraidīt",
  "linknet.targetUrlPlaceholder": "Saskaņotās lapas URL (kur atradīsies saite)",
  "linknet.verify": "Pārbaudīt saiti",
  "linknet.verified": "Saite atrasta — izvietojums ir publicēts un pārbaudīts.",
  "linknet.notFound": "Šajā lapā saite vēl nav atrasta — pārbaudīts un reģistrēts.",
  "linknet.liveSince": "Publicēts kopš",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Pēdējā pārbaude: saite nav atrasta",
  "linknet.reciprocalWarn":
    "Tas izveidotu tiešu saišu apmaiņu ar šo vietni. Pārskatiet tās atbilstību un izvairieties no pārmērīgas apmaiņas.",
  "linknet.status.suggested": "Ieteikts",
  "linknet.status.contacted": "Uzrunāts",
  "linknet.status.agreed": "Saskaņots",
  "linknet.status.live_verified": "Publicēts ✓",
  "linknet.status.declined": "Noraidīts",
  "backlinks.title": "Atpakaļsaites",
  "backlinks.subtitle":
    "Reāli atpakaļsaišu dati jūsu domēnam — profila spēks, saišu nepilnības salīdzinājumā ar konkurentiem un droši saišu veidošanas ieteikumi.",
  "backlinks.disclaimer":
    "Atpakaļsaišu rādītāji iegūti no ārēja saišu indeksa un ir aplēses — neviens indekss neredz visas saites. Ieteikumi ir tikai godprātīgi (white-hat) ieteikumi: Milo nekad neierosina saišu shēmas vai neatklātas apmaksātas saites un negarantē pozīcijas, datplūsmu vai ieņēmumus.",
  "backlinks.run": "Veikt atpakaļsaišu analīzi",
  "backlinks.rerun": "Atsvaidzināt analīzi",
  "backlinks.running": "Notiek analīze…",
  "backlinks.empty":
    "Veiciet atpakaļsaišu analīzi, lai redzētu sava domēna reālo saišu profilu, tā salīdzinājumu ar konkurentiem un domēnus, kas veido saites uz tiem, bet ne uz jums.",
  "backlinks.notConfigured.title": "Pievienojiet atpakaļsaišu datu avotu",
  "backlinks.notConfigured.body":
    "Šis modulis izmanto DataForSEO atpakaļsaišu indeksu, un tas vēl nav pievienots. Darbvietas īpašniekam jāizveido DataForSEO konts (maksa par lietošanu) un jāpievieno DATAFORSEO_LOGIN un DATAFORSEO_PASSWORD kā servera puses noslēpumi. Līdz tam atpakaļsaišu dati nav pieejami.",
  "backlinks.status.ready.title": "DataForSEO darbojas",
  "backlinks.status.ready.body": "Backlinks API ir pievienots un atbild.",
  "backlinks.status.lowBalance.title": "DataForSEO atlikums ir zems",
  "backlinks.status.lowBalance.body":
    "Drīzumā papildiniet atlikumu, lai analīzes netiktu pārtrauktas.",
  "backlinks.status.paused.title": "DataForSEO piekļuve ir apturēta",
  "backlinks.status.paused.body":
    "Pirms nākamās analīzes sazinieties ar DataForSEO atbalsta dienestu, lai atkārtoti aktivizētu kontu.",
  "backlinks.status.error.title": "DataForSEO statuss nav pieejams",
  "backlinks.status.error.body":
    "Kontu vai Backlinks API neizdevās pārbaudīt. Atsvaidziniet statusu vai pārbaudiet pakalpojumu sniedzēja paneli.",
  "backlinks.status.balance": "Atlikums: {balance}.",
  "backlinks.status.refresh": "Atsvaidzināt statusu",
  "backlinks.competitorsUsed": "Salīdzinātie konkurenti: {list}",
  "backlinks.competitorsFromAnalysis":
    "Tiek izmantoti konkurenti no jaunākās konkurentu analīzes: {list}",
  "backlinks.noCompetitors":
    "Šajā projektā nav konkurentu URL — analīze aptvers tikai jūsu profilu. Pievienojiet konkurentus projekta iestatīšanā vai konkurentu modulī, lai redzētu saišu nepilnības.",
  "backlinks.lastRun": "Pēdējā analīze: {date}",
  "backlinks.score.overall": "Saišu pozīcija",
  "backlinks.score.profile": "Profila spēks",
  "backlinks.score.gap": "Nepilnība salīdzinājumā ar konkurentiem",
  "backlinks.score.quality": "Saišu kvalitāte",
  "backlinks.gapHint": "augstāks = vairāk iespējams iegūt",
  "backlinks.summaryHeading": "Kopsavilkums",
  "backlinks.topActions": "Galvenās saišu darbības",
  "backlinks.profileTable": "Jūsu domēns salīdzinājumā ar konkurentiem",
  "backlinks.table.domain": "Domēns",
  "backlinks.table.rank": "Domēna rangs",
  "backlinks.table.backlinks": "Atpakaļsaites",
  "backlinks.table.referringDomains": "Atsauces domēni",
  "backlinks.table.broken": "Bojātas",
  "backlinks.table.spam": "Surogātpasta rādītājs",
  "backlinks.table.notFetched": "Datus neizdevās iegūt",
  "backlinks.you": "Jūs",
  "backlinks.gapHeading": "Saišu nepilnība — tie veido saites uz konkurentiem, nevis uz jums",
  "backlinks.gapNote":
    "Pakalpojumu sniedzēja indeksa paraugs, kas pieprasīts, izslēdzot jūsu domēnu. Tas neatkarīgi nepārbauda, ka šīm vietnēm nav saišu uz jums.",
  "backlinks.gap.linksTo": "Saites uz",
  "backlinks.gapEmpty":
    "Saišu nepilnības netika atrastas — vai nu netika iegūti konkurentu dati, vai nebija pārklāšanās.",
  "backlinks.referringHeading": "Galvenie atsauces domēni, kas veido saites uz jums",
  "backlinks.referringEmpty":
    "Indeksā vēl nav atrasti atsauces domēni — jauns domēns bieži sākas no nulles.",
  "backlinks.recommendations": "Ieteikumi",
  "backlinks.effort": "Piepūle",
  "backlinks.target": "Mērķis / platforma",
  "backlinks.approach": "Pieeja",
  "backlinks.action.convert": "Izveidot iespēju",
  "backlinks.action.converted": "Iespēja izveidota",
  "backlinks.action.convertTop": "Pārvērst galvenos ieteikumus",
  "backlinks.toast.done": "Atpakaļsaišu analīze pabeigta",
  "backlinks.toast.converted": "Iespēja izveidota",
  "backlinks.toast.convertedTop": "Izveidotas iespējas: {count}",
  "backlinks.category.linkGapTargets": "Saišu nepilnību mērķi",
  "backlinks.category.contentForLinks": "Saturs saitēm",
  "backlinks.category.digitalPr": "Digitālais PR",
  "backlinks.category.partnerships": "Partnerības un sponsorēšana",
  "backlinks.category.directories": "Katalogi un profili",
  "backlinks.category.linkHygiene": "Saišu higiēna",
  "backlinks.integrity.partial": "Daļēji rādītāji",
  "backlinks.integrity.source":
    "Deklarētais avots: DataForSEO indekss saglabātās analīzes datumā parādītajiem domēniem, ieskaitot apakšdomēnus. Avota etiķetes saglabātajos darbvietas datos nav neatkarīga verifikācija. — nozīmē “nav pieejams”, nekad nulli. Indeksa aptvērums ir nepilnīgs; tās nav galamērķu pārbaudes reāllaikā.",
  "backlinks.integrity.legacy":
    "Saglabāta mantota analīze. Agrākā normalizācija varēja pārvērst trūkstošos datus par nullēm, tāpēc tās skaitliskais pamats nav pieejams. Sākotnējie ieteikumi paliek vēsturiski padomi.",
  "backlinks.integrity.scores":
    "Rezultāti un ieteikumi ir AI aplēses no pieejamajiem pierādījumiem, nevis pakalpojumu sniedzēja mērījumi, pozīciju garantijas vai izmērīti rezultāti.",
  "backlinks.integrity.sample":
    "Ierobežots populārāko domēnu paraugs. Izlaistie domēni nepierāda saišu neesamību vai zudumu; pastāvīga uzraudzība netiek nodrošināta.",
  "backlinks.integrity.failed":
    "Pieprasījums neizdevās. Šī tabula nav pieejama; tas nenozīmē nulle atpakaļsaišu vai saišu nepilnību neesamību.",
  "backlinks.integrity.not_requested":
    "Nepilnību paraugs netika pieprasīts, jo netika norādīti konkurentu domēni.",
  "backlinks.integrity.unknown": "Šīs tabulas datu vākšanas statuss nav zināms.",
  "backlinks.integrity.empty":
    "Nav rindu, ko parādīt. Pirms šīs tabulas interpretēšanas pārbaudiet iepriekš norādīto datu vākšanas statusu.",
  "marketplace.title": "Sponsorētas publikācijas",
  "marketplace.subtitle":
    "Saskaņojiet atpakaļsaišu iespējas ar pārredzamiem, redakcionāli pārskatītiem sponsorētiem izvietojumiem.",
  "marketplace.disclosureTitle": "Godprātīgs (white-hat) tirgus.",
  "marketplace.disclosure":
    'Katram pieprasījumam nepieciešama skaidra sponsorēšanas atklāšana un rel="sponsored". Pieprasījums nav pirkums un nekad negarantē pozīcijas, datplūsmu vai ieņēmumus.',
  "marketplace.demoNoticeTitle": "Priekšskatījuma katalogs.",
  "marketplace.demoNotice":
    "Tālāk norādītie domēni, rādītāji un cenas ir demonstrācijas dati, kamēr gaida piekļuvi Linkhouse API. Pieprasījumi tiek saglabāti tikai Milo pārskatīšanai; pakalpojumu sniedzējam netiek izveidots pasūtījums vai maksājums.",
  "marketplace.demoBadge": "Demo",
  "marketplace.integrationTitle": "Linkhouse integrācija",
  "marketplace.integrationLive":
    "Pakalpojumu sniedzēja katalogs ir pievienots. Katram apmaksātam pasūtījumam joprojām nepieciešams precīzās kopsummas apstiprinājums.",
  "marketplace.integrationPending":
    "Produkcijas līgums ir gatavs; galapunktu kartēšana un akreditācijas dati gaida Linkhouse dokumentāciju.",
  "marketplace.catalogConnected": "Aktīvs katalogs",
  "marketplace.catalogDemo": "Demonstrācijas katalogs",
  "marketplace.orderingEnabled": "Pasūtīšana ieslēgta",
  "marketplace.orderingLocked": "Pasūtīšana bloķēta",
  "marketplace.offers": "Piedāvājumi",
  "marketplace.orders": "Pieprasījumi",
  "marketplace.search": "Meklēt domēnus vai tēmas…",
  "marketplace.noAnalysis":
    "Veiciet atpakaļsaišu analīzi, lai atbilstības noteikšanai pievienotu saišu nepilnību signālus. Atbilstība pēc tēmas un tirgus jau ir aktīva.",
  "marketplace.reason.linkGap": "Saišu nepilnība salīdzinājumā ar konkurentiem",
  "marketplace.rank": "Domēna rangs",
  "marketplace.traffic": "Aptuvenā datplūsma",
  "marketplace.turnaround": "Izpildes laiks",
  "marketplace.days": "{count} dienas",
  "marketplace.price": "Orientējošā cena",
  "marketplace.request": "Pieprasīt pārskatīšanu",
  "marketplace.reviewPrice": "Pārskatīt cenu",
  "marketplace.quoteLocked": "Nepieciešama cenas piedāvājuma iestatīšana",
  "marketplace.requested": "Pieprasīts",
  "marketplace.quoteTitle": "Pārskatiet publikācijas cenu",
  "marketplace.basePrice": "Pakalpojumu sniedzēja cena",
  "marketplace.serviceFee": "Milo pakalpojuma maksa ({count}%)",
  "marketplace.totalPrice": "Precīzā kopsumma",
  "marketplace.quoteExpires":
    "Šis cenas piedāvājums ir derīgs līdz {time}. Pēc šī laika nepieciešams jauns piedāvājums.",
  "marketplace.confirmSponsored":
    'Es pieprasu skaidru sponsorēšanas atklāšanu un rel="sponsored" vai nofollow saitei.',
  "marketplace.confirmPaymentLive":
    "Es skaidri atļauju pakalpojumu sniedzēja pasūtījumu par precīzo kopsummu €{total}.",
  "marketplace.confirmPaymentDemo":
    "Es apstiprinu pārskatīšanas pieprasījumu par €{total} un saprotu, ka demonstrācijas režīms neizveido pakalpojumu sniedzēja pasūtījumu vai maksājumu.",
  "marketplace.confirmPurchase": "Apstiprināt apmaksātu pasūtījumu",
  "marketplace.confirmDemoRequest": "Saglabāt pārskatīšanas pieprasījumu",
  "marketplace.confirmedAt": "Apstiprināts",
  "marketplace.ordersEmpty": "Publikāciju pieprasījumu vēl nav.",
  "marketplace.toast.exists": "Šim piedāvājumam jau ir aktīvs pieprasījums.",
  "marketplace.toast.requested": "Publikācijas pieprasījums saglabāts pārskatīšanai.",
  "marketplace.toast.submitted": "Apmaksātais pasūtījums nosūtīts pakalpojumu sniedzējam.",
  "marketplace.toast.catalogError":
    "Pakalpojumu sniedzēja katalogu neizdevās atsvaidzināt. Drošais demonstrācijas katalogs joprojām ir pieejams.",
  "marketplace.toast.quoteError": "Cenas piedāvājumu neizdevās sagatavot. Lūdzu, mēģiniet vēlreiz.",
  "marketplace.toast.quoteExpired":
    "Cenas piedāvājuma derīgums beidzies. Pirms apstiprināšanas pieprasiet jaunu cenu.",
  "marketplace.toast.orderError": "Pasūtījums netika izveidots. Maksājums netika veikts.",
  "marketplace.toast.orderReview":
    "Pakalpojumu sniedzēja rezultātu neizdevās apstiprināt. Milo saglabāja pieprasījumu kā “Pārskatīšanā”; neatkārtojiet, līdz tas ir saskaņots.",
  "marketplace.status.Requested": "Pieprasīts",
  "marketplace.status.In Review": "Pārskatīšanā",
  "marketplace.status.Submitted": "Iesniegts",
  "marketplace.status.Accepted": "Pieņemts",
  "marketplace.status.Published": "Publicēts",
  "marketplace.status.Failed": "Neizdevās",
  "marketplace.status.Cancelled": "Atcelts",
};
