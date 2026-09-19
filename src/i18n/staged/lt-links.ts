/** Lithuanian authoring only; not registered in the runtime or language picker.
 * `backlinks.gapNote` and `backlinks.integrity.*` follow `backlink-integrity.ts`;
 * `linknet.policyNote` and `linknet.reciprocalWarn` follow `link-network-copy.ts`. */
export const ltLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Nuorodų augimo tinklas",
  "linknet.subtitle":
    "Gaukite atitikmenis su tinkamomis svetainėmis Milo tinkle, išsiųskite asmenišką prisistatymo žinutę ir leiskite Milo patikrinti, ar nuoroda tikrai paskelbta.",
  "linknet.policyNote":
    "Svarbiausia aktualumas: atitikmenims reikia bendrų temų, tiesioginiai nuorodų mainai pažymimi, o niekas nepaskelbiama automatiškai. Šios patikros negarantuoja atitikties paieškos sistemų politikai.",
  "linknet.topics": "Temos",
  "linknet.topicsPlaceholder": "Temos (atskirtos kableliais)",
  "linknet.contact": "Kontaktinis el. paštas",
  "linknet.contactPlaceholder": "Kontaktinis el. paštas partneriams",
  "linknet.join": "Prisijungti prie tinklo",
  "linknet.update": "Atnaujinti įrašą",
  "linknet.pause": "Pristabdyti",
  "linknet.joined": "Įtraukta į sąrašą — partneriai dabar gali rasti šią svetainę.",
  "linknet.paused": "Įrašas pristabdytas.",
  "linknet.find": "Rasti partnerių",
  "linknet.noMatches":
    "Tinkamų partnerių dar nėra — tinklas auga su kiekviena prisijungiančia Milo svetaine.",
  "linknet.score": "Atitikimas",
  "linknet.copyIntro": "Kopijuoti prisistatymo el. laišką",
  "linknet.introCopied": "Prisistatymo žinutė nukopijuota — įklijuokite ją į savo el. laišką.",
  "linknet.markContacted": "Pažymėti kaip susisiektą",
  "linknet.markAgreed": "Pažymėti kaip suderintą",
  "linknet.decline": "Atmesti",
  "linknet.targetUrlPlaceholder": "Suderinto puslapio URL (kur bus nuoroda)",
  "linknet.verify": "Patikrinti nuorodą",
  "linknet.verified": "Nuoroda rasta — išdėstymas paskelbtas ir patikrintas.",
  "linknet.notFound": "Šiame puslapyje nuoroda dar nerasta — patikrinta ir užregistruota.",
  "linknet.liveSince": "Paskelbta nuo",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Paskutinė patikra: nuoroda nerasta",
  "linknet.reciprocalWarn":
    "Taip būtų sukurti tiesioginiai nuorodų mainai su šia svetaine. Peržiūrėkite jos aktualumą ir venkite perteklinių mainų.",
  "linknet.status.suggested": "Pasiūlyta",
  "linknet.status.contacted": "Susisiekta",
  "linknet.status.agreed": "Suderinta",
  "linknet.status.live_verified": "Paskelbta ✓",
  "linknet.status.declined": "Atmesta",
  "backlinks.title": "Atgalinės nuorodos",
  "backlinks.subtitle":
    "Tikri atgalinių nuorodų duomenys jūsų domenui — profilio stiprumas, nuorodų spragos, palyginti su konkurentais, ir saugios nuorodų kūrimo rekomendacijos.",
  "backlinks.disclaimer":
    "Atgalinių nuorodų rodikliai gaunami iš išorinio nuorodų indekso ir yra įverčiai — joks indeksas nemato visų nuorodų. Rekomendacijos yra tik sąžiningi (white-hat) pasiūlymai: Milo niekada nesiūlo nuorodų schemų ar neatskleistų mokamų nuorodų ir negarantuoja pozicijų, srauto ar pajamų.",
  "backlinks.run": "Atlikti atgalinių nuorodų analizę",
  "backlinks.rerun": "Atnaujinti analizę",
  "backlinks.running": "Analizuojama…",
  "backlinks.empty":
    "Atlikite atgalinių nuorodų analizę, kad pamatytumėte tikrą savo domeno nuorodų profilį, jo palyginimą su konkurentais ir domenus, kurie nurodo į juos, bet ne į jus.",
  "backlinks.notConfigured.title": "Prijunkite atgalinių nuorodų duomenų šaltinį",
  "backlinks.notConfigured.body":
    "Šis modulis naudoja DataForSEO atgalinių nuorodų indeksą, kuris dar neprijungtas. Darbo srities savininkas turi susikurti DataForSEO paskyrą (mokama pagal naudojimą) ir pridėti DATAFORSEO_LOGIN bei DATAFORSEO_PASSWORD kaip serverio pusės paslaptis. Iki tol atgalinių nuorodų duomenys nepasiekiami.",
  "backlinks.status.ready.title": "DataForSEO veikia",
  "backlinks.status.ready.body": "Backlinks API prijungta ir atsako.",
  "backlinks.status.lowBalance.title": "DataForSEO likutis mažas",
  "backlinks.status.lowBalance.body": "Netrukus papildykite likutį, kad analizės nenutrūktų.",
  "backlinks.status.paused.title": "DataForSEO prieiga pristabdyta",
  "backlinks.status.paused.body":
    "Prieš kitą analizę susisiekite su DataForSEO pagalbos tarnyba, kad paskyra būtų vėl aktyvinta.",
  "backlinks.status.error.title": "DataForSEO būsena nepasiekiama",
  "backlinks.status.error.body":
    "Nepavyko patikrinti paskyros arba Backlinks API. Atnaujinkite būseną arba patikrinkite paslaugų teikėjo skydelį.",
  "backlinks.status.balance": "Likutis: {balance}.",
  "backlinks.status.refresh": "Atnaujinti būseną",
  "backlinks.competitorsUsed": "Palyginti konkurentai: {list}",
  "backlinks.competitorsFromAnalysis":
    "Naudojami konkurentai iš naujausios konkurentų analizės: {list}",
  "backlinks.noCompetitors":
    "Šiame projekte nėra konkurentų URL — analizė apims tik jūsų profilį. Pridėkite konkurentų projekto sąrankoje arba konkurentų modulyje, kad pamatytumėte nuorodų spragas.",
  "backlinks.lastRun": "Paskutinė analizė: {date}",
  "backlinks.score.overall": "Nuorodų padėtis",
  "backlinks.score.profile": "Profilio stiprumas",
  "backlinks.score.gap": "Spraga, palyginti su konkurentais",
  "backlinks.score.quality": "Nuorodų kokybė",
  "backlinks.gapHint": "didesnis = daugiau galima laimėti",
  "backlinks.summaryHeading": "Santrauka",
  "backlinks.topActions": "Svarbiausi nuorodų veiksmai",
  "backlinks.profileTable": "Jūsų domenas, palyginti su konkurentais",
  "backlinks.table.domain": "Domenas",
  "backlinks.table.rank": "Domeno reitingas",
  "backlinks.table.backlinks": "Atgalinės nuorodos",
  "backlinks.table.referringDomains": "Nukreipiantys domenai",
  "backlinks.table.broken": "Neveikiančios",
  "backlinks.table.spam": "Šlamšto balas",
  "backlinks.table.notFetched": "Duomenų gauti nepavyko",
  "backlinks.you": "Jūs",
  "backlinks.gapHeading": "Nuorodų spraga — jie nurodo į konkurentus, bet ne į jus",
  "backlinks.gapNote":
    "Paslaugų teikėjo indekso pavyzdys, užklaustas neįtraukiant jūsų domeno. Jis nepriklausomai nepatikrina, kad šios svetainės nenurodo į jus.",
  "backlinks.gap.linksTo": "Nurodo į",
  "backlinks.gapEmpty":
    "Nuorodų spragų nerasta — arba nepavyko gauti konkurentų duomenų, arba nebuvo sutapimų.",
  "backlinks.referringHeading": "Svarbiausi į jus nurodantys domenai",
  "backlinks.referringEmpty":
    "Indekse dar nerasta nukreipiančių domenų — naujas domenas dažnai pradeda nuo nulio.",
  "backlinks.recommendations": "Rekomendacijos",
  "backlinks.effort": "Pastangos",
  "backlinks.target": "Tikslas / platforma",
  "backlinks.approach": "Metodas",
  "backlinks.action.convert": "Sukurti galimybę",
  "backlinks.action.converted": "Galimybė sukurta",
  "backlinks.action.convertTop": "Paversti svarbiausias rekomendacijas",
  "backlinks.toast.done": "Atgalinių nuorodų analizė baigta",
  "backlinks.toast.converted": "Galimybė sukurta",
  "backlinks.toast.convertedTop": "Sukurta galimybių: {count}",
  "backlinks.category.linkGapTargets": "Nuorodų spragų tikslai",
  "backlinks.category.contentForLinks": "Turinys nuorodoms",
  "backlinks.category.digitalPr": "Skaitmeniniai viešieji ryšiai",
  "backlinks.category.partnerships": "Partnerystės ir rėmimas",
  "backlinks.category.directories": "Katalogai ir profiliai",
  "backlinks.category.linkHygiene": "Nuorodų higiena",
  "backlinks.integrity.partial": "Daliniai rodikliai",
  "backlinks.integrity.source":
    "Nurodytas šaltinis: DataForSEO indeksas parodytiems domenams išsaugotos analizės datą, įskaitant subdomenus. Šaltinio žymės išsaugotuose darbo srities duomenyse nėra nepriklausoma patikra. — reiškia „nepasiekiama“, niekada ne nulį. Indekso aprėptis neišsami; tai nėra tiesioginės paskirties vietų patikros.",
  "backlinks.integrity.legacy":
    "Išsaugota senoji analizė. Ankstesnė normalizacija galėjo trūkstamus duomenis paversti nuliais, todėl jos skaitinis pagrindas nepasiekiamas. Pradinės rekomendacijos lieka istoriniais patarimais.",
  "backlinks.integrity.scores":
    "Balai ir rekomendacijos yra DI įverčiai pagal turimus įrodymus, o ne paslaugų teikėjo matavimai, pozicijų garantijos ar išmatuoti rezultatai.",
  "backlinks.integrity.sample":
    "Ribotas populiariausių domenų pavyzdys. Praleisti domenai neįrodo, kad nuorodų nėra ar jos prarastos; nuolatinė stebėsena neteikiama.",
  "backlinks.integrity.failed":
    "Užklausa nepavyko. Ši lentelė nepasiekiama; tai nereiškia nulio atgalinių nuorodų ar nuorodų spragų nebuvimo.",
  "backlinks.integrity.not_requested":
    "Spragų pavyzdys nebuvo užklaustas, nes nebuvo nurodyta konkurentų domenų.",
  "backlinks.integrity.unknown": "Šios lentelės duomenų rinkimo būsena nežinoma.",
  "backlinks.integrity.empty":
    "Nėra eilučių, kurias būtų galima parodyti. Prieš interpretuodami šią lentelę patikrinkite aukščiau nurodytą duomenų rinkimo būseną.",
  "marketplace.title": "Remiamos publikacijos",
  "marketplace.subtitle":
    "Susiekite atgalinių nuorodų galimybes su skaidriais, redakciškai peržiūrėtais remiamais išdėstymais.",
  "marketplace.disclosureTitle": "Sąžininga (white-hat) prekyvietė.",
  "marketplace.disclosure":
    'Kiekvienai užklausai reikia aiškaus rėmimo atskleidimo ir rel="sponsored". Užklausa nėra pirkimas ir niekada negarantuoja pozicijų, srauto ar pajamų.',
  "marketplace.demoNoticeTitle": "Peržiūros katalogas.",
  "marketplace.demoNotice":
    "Toliau pateikti domenai, rodikliai ir kainos yra demonstraciniai duomenys, kol laukiama prieigos prie Linkhouse API. Užklausos išsaugomos tik Milo peržiūrai; paslaugų teikėjui nesukuriamas joks užsakymas ar mokėjimas.",
  "marketplace.demoBadge": "Demo",
  "marketplace.integrationTitle": "Linkhouse integracija",
  "marketplace.integrationLive":
    "Paslaugų teikėjo katalogas prijungtas. Kiekvienam mokamam užsakymui vis tiek reikia tikslios bendros sumos patvirtinimo.",
  "marketplace.integrationPending":
    "Produkcinė sutartis parengta; galinių taškų susiejimas ir prisijungimo duomenys laukia Linkhouse dokumentacijos.",
  "marketplace.catalogConnected": "Aktyvus katalogas",
  "marketplace.catalogDemo": "Demonstracinis katalogas",
  "marketplace.orderingEnabled": "Užsakymai įjungti",
  "marketplace.orderingLocked": "Užsakymai užblokuoti",
  "marketplace.offers": "Pasiūlymai",
  "marketplace.orders": "Užklausos",
  "marketplace.search": "Ieškoti domenų ar temų…",
  "marketplace.noAnalysis":
    "Atlikite atgalinių nuorodų analizę, kad į atitikimą būtų įtraukti nuorodų spragų signalai. Atitikimas pagal temą ir rinką jau veikia.",
  "marketplace.reason.linkGap": "Nuorodų spraga, palyginti su konkurentais",
  "marketplace.rank": "Domeno reitingas",
  "marketplace.traffic": "Apytikslis srautas",
  "marketplace.turnaround": "Įvykdymo laikas",
  "marketplace.days": "{count} d.",
  "marketplace.price": "Orientacinė kaina",
  "marketplace.request": "Prašyti peržiūros",
  "marketplace.reviewPrice": "Peržiūrėti kainą",
  "marketplace.quoteLocked": "Reikia kainos pasiūlymo sąrankos",
  "marketplace.requested": "Užklausta",
  "marketplace.quoteTitle": "Peržiūrėkite publikacijos kainą",
  "marketplace.basePrice": "Paslaugų teikėjo kaina",
  "marketplace.serviceFee": "Milo paslaugos mokestis ({count}%)",
  "marketplace.totalPrice": "Tiksli bendra suma",
  "marketplace.quoteExpires":
    "Šis kainos pasiūlymas galioja iki {time}. Po to reikės naujo pasiūlymo.",
  "marketplace.confirmSponsored":
    'Reikalauju aiškaus rėmimo atskleidimo ir rel="sponsored" arba nofollow nuorodai.',
  "marketplace.confirmPaymentLive":
    "Aiškiai leidžiu pateikti paslaugų teikėjo užsakymą už tikslią bendrą €{total} sumą.",
  "marketplace.confirmPaymentDemo":
    "Patvirtinu peržiūros užklausą už €{total} ir suprantu, kad demonstraciniu režimu paslaugų teikėjo užsakymas ar mokėjimas nesukuriamas.",
  "marketplace.confirmPurchase": "Patvirtinti mokamą užsakymą",
  "marketplace.confirmDemoRequest": "Išsaugoti peržiūros užklausą",
  "marketplace.confirmedAt": "Patvirtinta",
  "marketplace.ordersEmpty": "Publikacijų užklausų dar nėra.",
  "marketplace.toast.exists": "Šiam pasiūlymui jau yra aktyvi užklausa.",
  "marketplace.toast.requested": "Publikacijos užklausa išsaugota peržiūrai.",
  "marketplace.toast.submitted": "Mokamas užsakymas pateiktas paslaugų teikėjui.",
  "marketplace.toast.catalogError":
    "Nepavyko atnaujinti paslaugų teikėjo katalogo. Saugus demonstracinis katalogas vis dar pasiekiamas.",
  "marketplace.toast.quoteError": "Nepavyko parengti kainos pasiūlymo. Bandykite dar kartą.",
  "marketplace.toast.quoteExpired":
    "Kainos pasiūlymo galiojimas baigėsi. Prieš patvirtindami paprašykite naujos kainos.",
  "marketplace.toast.orderError": "Užsakymas nesukurtas. Mokėjimas neatliktas.",
  "marketplace.toast.orderReview":
    "Nepavyko patvirtinti paslaugų teikėjo rezultato. Milo išsaugojo užklausą kaip „Peržiūrima“; nekartokite, kol ji nebus suderinta.",
  "marketplace.status.Requested": "Užklausta",
  "marketplace.status.In Review": "Peržiūrima",
  "marketplace.status.Submitted": "Pateikta",
  "marketplace.status.Accepted": "Priimta",
  "marketplace.status.Published": "Paskelbta",
  "marketplace.status.Failed": "Nepavyko",
  "marketplace.status.Cancelled": "Atšaukta",
};
