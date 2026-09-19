/** Latvian authoring only; not registered in the runtime or language picker.
 * Nine billing/launch/beta keys follow `launch-readiness.ts`, and the two
 * `launch.conn.gsc` import states follow `gsc-integrity.ts`; both override `en.ts`. */
export const lvCommerce: Readonly<Record<string, string>> = {
  "billing.stripeTest.title": "Stripe maksājuma tests",
  "billing.stripeTest.description":
    "Testa maksājums tikai īpašniekam. Izmantojiet Stripe testa maksājuma datus. Reāla maksa netiek iekasēta, un jūsu Milo plāns nemainās.",
  "billing.stripeTest.open": "Atvērt testa maksājumu",
  "billing.stripeTest.opening": "Notiek atvēršana…",
  "billing.stripeTest.error":
    "Testa maksājumu neizdevās apstiprināt. Mēģiniet vēlreiz šeit, lai atkārtoti izmantotu to pašu mēģinājumu.",
  "billing.title": "Norēķini un plāns",
  "billing.subtitle": "Pārvaldiet savu plānu, norēķinu profilu un papildinājumus.",
  "billing.owner.title": "Īpašnieka konts",
  "billing.owner.desc":
    "Jums ir neierobežots projektu skaits un nav norēķinu. Uz šo kontu neattiecas plāna ierobežojumi.",
  "billing.currentPlan": "Pašreizējais plāns",
  "billing.status": "Statuss",
  "billing.billingMarket": "Norēķinu tirgus",
  "billing.currency": "Valūta",
  "billing.price": "Cena",
  "billing.perMonth": "/mēnesī",
  "billing.limits": "Plāna limiti",
  "billing.profile": "Norēķinu profils",
  "billing.customerType": "Klienta veids",
  "billing.business": "Uzņēmums",
  "billing.consumer": "Patērētājs",
  "billing.billingName": "Norēķinu vārds",
  "billing.businessName": "Uzņēmuma nosaukums",
  "billing.billingEmail": "Norēķinu e-pasts",
  "billing.billingCountry": "Norēķinu valsts",
  "billing.vatId": "PVN / nodokļu maksātāja numurs",
  "billing.derivedMarket": "Noteiktais norēķinu tirgus",
  "billing.saveProfile": "Saglabāt norēķinu profilu",
  "billing.profileSaved": "Norēķinu profils saglabāts",
  "billing.selectCountryFirst": "Izvēlieties norēķinu valsti, lai redzētu vietējās cenas.",
  "billing.choosePlan": "Izvēlieties plānu",
  "billing.recommended": "Ieteicams",
  "billing.choose": "Izvēlēties",
  "billing.currentLabel": "Pašreizējais plāns",
  "billing.upgrade": "Pāriet uz augstāku plānu",
  "billing.addons": "Papildinājumi",
  "billing.assistedSetup": "Asistēta iestatīšana",
  "billing.monthlyCare": "Ikmēneša aprūpe",
  "billing.oneTime": "vienreizēji",
  "billing.checkoutNotConfigured":
    "Maksājums vēl nav konfigurēts. Lai aktivizētu šo plānu, sazinieties ar atbalsta dienestu.",
  "billing.contactSupport": "Sazināties ar atbalsta dienestu",
  "billing.checkoutPendingMsg":
    "Maksājums sākts. Jūsu plāns tiks aktivizēts, tiklīdz maksājums būs apstiprināts.",
  "billing.rulesNote":
    "Jūsu norēķinu tirgus ir balstīts uz jūsu uzņēmuma vai norēķinu valsti. Vietnes valodas vai publiskā reģiona maiņa neietekmē tiesības uz cenu.",
  "billing.taxNote":
    "Milo atbalsta gan uzņēmumus, gan patērētājus. Nodokļu un rēķinu informācija var atšķirties atkarībā no valsts, un pirms publiskās palaišanas to var būt nepieciešams pārskatīt.",
  "billing.paddleNote":
    "Reālo maksājumu iestatīšana un verifikācija nav pabeigta. Pirms maksas plāna izvēles sazinieties ar atbalsta dienestu.",
  "billing.noGuarantee": "Pozīcijas, datplūsma, ieņēmumi vai AI citējumi netiek garantēti.",
  "billing.marketReview":
    "Norēķinu valsts maiņa var ietekmēt cenas, un tai nepieciešama pārskatīšana.",
  "billing.manual.title": "Manuāla aktivizēšana (tikai īpašniekam)",
  "billing.manual.desc":
    "Aktivizējiet plānu manuāli kontiem, kas maksā pēc rēķina, beta vai bezmaksas kontiem. Parastiem lietotājiem netiek rādīts.",
  "billing.manual.beta": "Aktivizēt kā manuālu beta versiju",
  "billing.manual.comped": "Aktivizēt kā manuāli piešķirtu bez maksas",
  "billing.manual.reset": "Atiestatīt uz bezmaksas priekšskatījumu",
  "billing.statusLabel.freePreview": "Bezmaksas priekšskatījums",
  "billing.statusLabel.checkoutPending": "Maksājums gaida",
  "billing.statusLabel.active": "Aktīvs",
  "billing.statusLabel.pastDue": "Kavēts maksājums",
  "billing.statusLabel.cancelled": "Atcelts",
  "billing.statusLabel.manualBeta": "Manuāla beta versija",
  "billing.statusLabel.manualComped": "Manuāli piešķirts bez maksas",
  "launch.title": "Beta palaišanas kontrolsaraksts",
  "launch.subtitle":
    "Sekojiet šī projekta iestatīšanas, satura, publicēšanas, mērīšanas, autoritātes un norēķinu gatavībai.",
  "launch.noProject": "Izveidojiet projektu, lai redzētu palaišanas kontrolsarakstu.",
  "launch.betaNotesCta": "Beta piezīmes",
  "launch.readiness": "Gatavība palaišanai",
  "launch.essentialsDone": "būtiskie punkti izpildīti",
  "launch.optionalDone": "Izpildīti arī neobligātie punkti: {n}",
  "launch.optional": "Neobligāti",
  "launch.statusTitle": "Iestatīšanas un savienojumu statuss",
  "launch.section.foundation": "Projekta pamati",
  "launch.section.content": "Satura sistēma",
  "launch.section.publishing": "Publicēšana",
  "launch.section.measurement": "Mērīšana",
  "launch.section.authority": "Autoritāte",
  "launch.section.billing": "Norēķini un beta",
  "launch.item.businessProfile": "Uzņēmuma profils aizpildīts",
  "launch.item.businessProfile.desc":
    "Uzņēmuma nosaukums un apraksts ir iestatīti, tāpēc Milo ir konteksts.",
  "launch.item.websiteUrl": "Vietnes URL pievienots",
  "launch.item.websiteUrl.desc":
    "Tiek izmantots auditiem, analītikas saskaņošanai un publicēšanai.",
  "launch.item.marketLanguage": "Tirgus un valoda izvēlēti",
  "launch.item.marketLanguage.desc": "Nosaka satura valodu un lokalizēto pozicionējumu.",
  "launch.item.services": "Pakalpojumi vai produkti pievienoti",
  "launch.item.services.desc": "Pastāstiet Milo, ko šis uzņēmums patiesībā pārdod.",
  "launch.item.brandIntelligence": "Brand Intelligence uzsākts",
  "launch.item.brandIntelligence.desc":
    "Balss, apgalvojumi un piedāvājumi nodrošina, ka saturs atbilst zīmolam un ir drošs.",
  "launch.item.opportunity": "Ģenerēta vismaz viena iespēja",
  "launch.item.opportunity.desc": "Strukturētas redzamības idejas, kas balstītas uzņēmumā.",
  "launch.item.contentAsset": "Ģenerēts vismaz viens satura vienums",
  "launch.item.contentAsset.desc": "No iespējas izveidots satura uzdevums vai melnraksts.",
  "launch.item.miloScore": "Vismaz viens Milo Score novērtējums",
  "launch.item.miloScore.desc": "Novērtējiet melnrakstu pirms publicēšanas.",
  "launch.item.reviewed": "Melnraksts pārskatīts vai uzlabots",
  "launch.item.reviewed.desc": "Nododiet melnrakstu pārskatīšanai, apstipriniet vai uzlabojiet to.",
  "launch.item.connectorSelected": "Savienotājs izvēlēts",
  "launch.item.connectorSelected.desc":
    "Projekta iestatīšanā izvēlieties pielāgotu, WordPress vai Shopify savienotāju.",
  "launch.item.connectorConfigured": "Savienotājs konfigurēts",
  "launch.item.connectorConfigured.desc":
    "Publicēšanai nepieciešamie akreditācijas dati vai galapunkti ir iestatīti.",
  "launch.item.connectorTested": "Savienojums pārbaudīts (WordPress/Shopify)",
  "launch.item.connectorTested.desc":
    "Palaidiet “Pārbaudīt savienojumu”, lai pārbaudītu piekļuvi. Veiksmīgs tests nepārbauda publicēšanas atļaujas un negarantē turpmāku publicēšanu.",
  "launch.item.draftSent": "Nosūtīts vismaz viens melnraksts",
  "launch.item.draftSent.desc": "Nosūtiet apstiprinātu saturu uz pievienoto vietni kā melnrakstu.",
  "launch.item.publishedLive": "Publicēta vismaz viena lapa",
  "launch.item.publishedLive.desc": "Publicējiet pārskatītu melnrakstu no Milo.",
  "launch.item.analyticsSnippet": "Analītikas koda fragments pieejams",
  "launch.item.analyticsSnippet.desc":
    "Nokopējiet Milo koda fragmentu no analītikas un pievienojiet to savai vietnei.",
  "launch.item.analyticsEvents": "Analītikas notikumi saņemti",
  "launch.item.analyticsEvents.desc":
    "Pēc koda fragmenta instalēšanas apmeklējiet savu vietni, lai apstiprinātu izsekošanu.",
  "launch.item.gscImport": "GSC Lite imports pievienots",
  "launch.item.gscImport.desc":
    "Importējiet Search Console CSV, lai saistītu parādījumus un klikšķus.",
  "launch.item.publishedByMilo": "Pieejami dati par Milo publicētajām lapām",
  "launch.item.publishedByMilo.desc":
    "Publicētās Milo lapas saskaņotas ar Search Console veiktspēju.",
  "launch.item.authorityGenerated": "Autoritātes iespējas ģenerētas",
  "launch.item.authorityGenerated.desc":
    "Droši autoritātes uzdevumi, piemēram, katalogi un partneru saites.",
  "launch.item.authorityProgress": "Autoritātes vienums plānots vai publicēts",
  "launch.item.authorityProgress.desc":
    "Pārvietojiet autoritātes uzdevumu uz statusu “plānots”, “uzrunāts” vai “publicēts”.",
  "launch.item.billingProfile": "Norēķinu profils aizpildīts",
  "launch.item.billingProfile.desc": "Norēķinu valsts nosaka jūsu cenu tirgu.",
  "launch.item.planSelected": "Plāns izvēlēts (vai bezmaksas priekšskatījums)",
  "launch.item.planSelected.desc":
    "Bezmaksas priekšskatījums ir aktīvs pēc noklusējuma — maksājums nav nepieciešams.",
  "launch.item.betaStatus": "Redzams beta / bezmaksas / gaidošs statuss",
  "launch.item.betaStatus.desc":
    "Manuālas beta versijas, bezmaksas piešķīruma vai gaidoša maksājuma statuss tiek rādīts sadaļā Norēķini.",
  "launch.item.paddlePending": "Gaida reālo maksājumu verifikāciju",
  "launch.item.paddlePending.desc":
    "Stripe ir izvēlētais Paddle aizstājējs. Smilškastes iestatīšana un reālā maksājumu dzīves cikla pārbaudes vēl jāveic.",
  "launch.conn.website": "Vietne",
  "launch.conn.website.ok": "Vietnes URL ir iestatīts.",
  "launch.conn.website.none": "Pievienojiet vietnes URL projekta iestatīšanā.",
  "launch.conn.brand": "Brand Intelligence",
  "launch.conn.brand.ok": "Zīmola konteksts uzsākts.",
  "launch.conn.brand.none": "Vēl nav uzsākts.",
  "launch.conn.connector": "Publicēšanas savienotājs",
  "launch.conn.connector.none": "Savienotājs nav izvēlēts.",
  "launch.conn.connector.partial": "Izvēlēts, bet konfigurācija nav pabeigta.",
  "launch.conn.connector.customOk": "Pielāgotie galapunkti konfigurēti.",
  "launch.conn.connector.wpOk": "WordPress pievienots un pārbaudīts.",
  "launch.conn.connector.wpUntested": "WordPress konfigurēts — pārbaudiet savienojumu.",
  "launch.conn.connector.shopifyOk": "Shopify pievienots un pārbaudīts.",
  "launch.conn.connector.shopifyUntested": "Shopify konfigurēts — pārbaudiet savienojumu.",
  "launch.conn.analytics": "Analītika",
  "launch.conn.analytics.ok": "Notikumi saņemti.",
  "launch.conn.analytics.pending": "Instalējiet koda fragmentu un apmeklējiet savu vietni.",
  "launch.conn.gsc": "GSC Lite",
  "launch.conn.gsc.ok": "CSV importēts.",
  "launch.conn.gsc.csvOnly":
    "Īpašnieka sniegtais CSV saglabāts; tas neapliecina OAuth savienojuma statusu.",
  "launch.conn.gsc.synced":
    "Saglabātais imports deklarē API avotu; pašreizējais savienojums un izcelsme nav neatkarīgi verificēti.",
  "launch.conn.gsc.connectedNotSynced": "Pievienots — palaidiet sinhronizāciju.",
  "launch.conn.gsc.reconnect": "Savienojums jāpievieno atkārtoti.",
  "launch.conn.gsc.none": "Importu vēl nav.",
  "launch.conn.authority": "Autoritāte",
  "launch.conn.authority.ok": "Iespējas ģenerētas.",
  "launch.conn.authority.none": "Vēl nekas nav ģenerēts.",
  "launch.conn.billing": "Norēķini",
  "launch.conn.billing.ok": "Norēķinu profils iestatīts.",
  "launch.conn.billing.pending": "Pievienojiet norēķinu valsti, lai cenas būtu pareizas.",
  "launch.qa.title": "Īpašnieka kvalitātes pārbaude",
  "launch.qa.ownerOnly": "Tikai īpašniekam",
  "launch.qa.projectId": "Projekta ID",
  "launch.qa.plan": "Plāns",
  "launch.qa.subStatus": "Abonementa statuss",
  "launch.qa.connector": "Savienotājs",
  "launch.qa.sent": "Nosūtītie melnraksti",
  "launch.qa.live": "Publicēti",
  "launch.qa.analyticsEvents": "Analītikas notikumi (30 d.)",
  "launch.qa.gscImports": "GSC importi",
  "launch.qa.gscOAuth": "GSC OAuth konfigurēts",
  "launch.qa.gscConnected": "GSC savienojums",
  "launch.qa.gscSite": "GSC izvēlētā vietne",
  "launch.qa.gscSyncRows": "GSC pēdējās sinhronizācijas rindas",
  "launch.qa.gscSyncDate": "GSC pēdējās sinhronizācijas datums",
  "launch.qa.authorityCount": "Autoritātes vienumi",
  "launch.qa.contentCount": "Satura vienumi",
  "launch.qa.aiCandidate": "AI kandidāts konfigurēts",
  "launch.qa.paddle": "Mantotā Paddle integrācija konfigurēta",
  "launch.qa.yes": "Jā",
  "launch.qa.no": "Nē",
  "beta.title": "Beta piezīmes",
  "beta.subtitle":
    "Pašreizējie ierobežojumi un tas, kas jāapstiprina pirms plašākas pašapkalpošanās palaišanas.",
  "beta.intro":
    "Šīs piezīmes uzskaita atlikušo iestatīšanas un pieņemšanas darbu. Vadītā demonstrācijā jāizmanto verificētas plūsmas; kontrolsaraksta izpilde vien nenosaka gatavību maksas pašapkalpošanās palaišanai.",
  "beta.limitsTitle": "Pašreizējie beta versijas ierobežojumi",
  "beta.reassure":
    "Izvēlieties demonstrācijas plūsmas, balstoties uz verificētiem pierādījumiem. Nepārbaudītās integrācijas un maksas palaišanas priekšnosacījumiem jāpaliek redzamiem.",
  "beta.demoSafeTitle": "Piezīmes drošām demonstrācijām",
  "beta.backToChecklist": "Atpakaļ uz kontrolsarakstu",
  "beta.openDemoScript": "Atvērt demonstrācijas scenāriju",
  "beta.limit.paddle":
    "Reālie maksājumi nav gatavi vispārējai maksas palaišanai. Stripe smilškastes konfigurācija un reālā maksājumu dzīves cikla pārbaudes vēl jāveic.",
  "beta.limit.wordpress":
    "WordPress savienotājs ir izveidots, bet tam joprojām nepieciešama testēšana tiešsaistē ar reālu vietni.",
  "beta.limit.shopify":
    "Shopify savienotājs ir izveidots, bet tam joprojām nepieciešama testēšana tiešsaistē ar reālu veikalu.",
  "beta.limit.aiCandidate":
    "Alternatīvajam AI modelim (novērtēšanas kandidātam) pirms palaišanas nepieciešama vides konfigurācija.",
  "beta.limit.legal":
    "Juridiskās lapas ir beta gatavības melnraksti, un tās jāpārskata pirms plašākas maksas palaišanas.",
  "beta.limit.analytics":
    "Lai saņemtu notikumus, analītikai klienta vietnē jābūt instalētam Milo koda fragmentam.",
  "beta.limit.gsc":
    "GSC Lite atbalsta manuālu CSV importu un neobligātu OAuth/API sinhronizāciju, kur ir konfigurēts Google OAuth. Manuālais imports joprojām ir pieejams kā rezerves variants.",
  "beta.limit.images":
    "Publicēšanā var iekļaut pārskatītas attēlu atsauces. Attēlu pārsūtīšanai, galvenajiem attēliem un galīgajam izkārtojumam joprojām nepieciešamas pārbaudes reālās vietnēs katram savienotājam.",
  "beta.demo.rankings":
    "Nesoliet pozīcijas, datplūsmu vai garantētus AI citējumus — Milo darbojas ar AI palīdzību, un tā darbu pārskata cilvēki.",
  "beta.demo.payments":
    "Paskaidrojiet, ka Stripe ir izvēlētais maksājumu pakalpojumu sniedzējs un iestatīšanas un maksājumu dzīves cikla verifikācija nav pabeigta. Nepasniedziet maksājumus kā aktīvus.",
  "beta.demo.connectors":
    "Norādiet, ka WordPress un Shopify savienotājiem katrā vietnē nepieciešama pilnīga testēšana tiešsaistē.",
  "beta.demo.data":
    "Norādiet, ka analītikas un GSC pierādījumi ir atkarīgi no datu pieejamības demonstrācijas projektā.",
};
