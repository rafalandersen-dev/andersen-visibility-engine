/** Lithuanian authoring only; not registered in the runtime or language picker.
 * Nine billing/launch/beta keys follow `launch-readiness.ts`, and the two
 * `launch.conn.gsc` import states follow `gsc-integrity.ts`; both override `en.ts`. */
export const ltCommerce: Readonly<Record<string, string>> = {
  "billing.stripeTest.title": "Stripe mokėjimo testas",
  "billing.stripeTest.description":
    "Bandomasis mokėjimas tik savininkui. Naudokite Stripe bandomųjų mokėjimų duomenis. Tikro mokesčio neimama, o jūsų Milo planas nesikeičia.",
  "billing.stripeTest.open": "Atidaryti bandomąjį mokėjimą",
  "billing.stripeTest.opening": "Atidaroma…",
  "billing.stripeTest.error":
    "Nepavyko patvirtinti bandomojo mokėjimo. Bandykite dar kartą čia, kad būtų pakartotinai panaudotas tas pats bandymas.",
  "billing.title": "Atsiskaitymai ir planas",
  "billing.subtitle": "Tvarkykite savo planą, atsiskaitymo profilį ir priedus.",
  "billing.owner.title": "Savininko paskyra",
  "billing.owner.desc":
    "Turite neribotą projektų skaičių ir jums netaikomi atsiskaitymai. Šiai paskyrai plano apribojimai netaikomi.",
  "billing.currentPlan": "Dabartinis planas",
  "billing.status": "Būsena",
  "billing.billingMarket": "Atsiskaitymo rinka",
  "billing.currency": "Valiuta",
  "billing.price": "Kaina",
  "billing.perMonth": "/mėn.",
  "billing.limits": "Plano limitai",
  "billing.profile": "Atsiskaitymo profilis",
  "billing.customerType": "Kliento tipas",
  "billing.business": "Įmonė",
  "billing.consumer": "Vartotojas",
  "billing.billingName": "Atsiskaitymo vardas",
  "billing.businessName": "Įmonės pavadinimas",
  "billing.billingEmail": "Atsiskaitymo el. paštas",
  "billing.billingCountry": "Atsiskaitymo šalis",
  "billing.vatId": "PVM / mokesčių mokėtojo kodas",
  "billing.derivedMarket": "Nustatyta atsiskaitymo rinka",
  "billing.saveProfile": "Išsaugoti atsiskaitymo profilį",
  "billing.profileSaved": "Atsiskaitymo profilis išsaugotas",
  "billing.selectCountryFirst": "Pasirinkite atsiskaitymo šalį, kad matytumėte vietines kainas.",
  "billing.choosePlan": "Pasirinkite planą",
  "billing.recommended": "Rekomenduojama",
  "billing.choose": "Pasirinkti",
  "billing.currentLabel": "Dabartinis planas",
  "billing.upgrade": "Pereiti prie aukštesnio plano",
  "billing.addons": "Priedai",
  "billing.assistedSetup": "Sąranka su pagalba",
  "billing.monthlyCare": "Mėnesinė priežiūra",
  "billing.oneTime": "vienkartinis",
  "billing.checkoutNotConfigured":
    "Mokėjimas dar nesukonfigūruotas. Norėdami aktyvinti šį planą, susisiekite su pagalbos tarnyba.",
  "billing.contactSupport": "Susisiekti su pagalbos tarnyba",
  "billing.checkoutPendingMsg":
    "Mokėjimas pradėtas. Jūsų planas bus aktyvintas, kai tik mokėjimas bus patvirtintas.",
  "billing.rulesNote":
    "Jūsų atsiskaitymo rinka nustatoma pagal jūsų įmonės arba atsiskaitymo šalį. Svetainės kalbos ar viešojo regiono keitimas neturi įtakos teisei į kainą.",
  "billing.taxNote":
    "Milo aptarnauja ir įmones, ir vartotojus. Mokesčių ir sąskaitų faktūrų informacija gali skirtis priklausomai nuo šalies, todėl prieš viešą paleidimą ją gali reikėti peržiūrėti.",
  "billing.paddleNote":
    "Tikrų mokėjimų sąranka ir patikra nebaigtos. Prieš rinkdamiesi mokamą planą susisiekite su pagalbos tarnyba.",
  "billing.noGuarantee": "Pozicijos, srautas, pajamos ar DI citatos negarantuojami.",
  "billing.marketReview":
    "Atsiskaitymo šalies keitimas gali paveikti kainas, todėl jį reikia peržiūrėti.",
  "billing.manual.title": "Rankinis aktyvinimas (tik savininkui)",
  "billing.manual.desc":
    "Aktyvinkite planą rankiniu būdu paskyroms, kurios moka pagal sąskaitą faktūrą, beta ar nemokamoms paskyroms. Įprastiems naudotojams nerodoma.",
  "billing.manual.beta": "Aktyvinti kaip rankinę beta versiją",
  "billing.manual.comped": "Aktyvinti kaip rankiniu būdu suteiktą nemokamai",
  "billing.manual.reset": "Atkurti nemokamą peržiūrą",
  "billing.statusLabel.freePreview": "Nemokama peržiūra",
  "billing.statusLabel.checkoutPending": "Laukiama mokėjimo",
  "billing.statusLabel.active": "Aktyvus",
  "billing.statusLabel.pastDue": "Pavėluotas mokėjimas",
  "billing.statusLabel.cancelled": "Atšauktas",
  "billing.statusLabel.manualBeta": "Rankinė beta versija",
  "billing.statusLabel.manualComped": "Rankiniu būdu suteikta nemokamai",
  "launch.title": "Beta paleidimo kontrolinis sąrašas",
  "launch.subtitle":
    "Stebėkite šio projekto sąrankos, turinio, publikavimo, matavimo, autoriteto ir atsiskaitymų parengtį.",
  "launch.noProject": "Sukurkite projektą, kad matytumėte paleidimo kontrolinį sąrašą.",
  "launch.betaNotesCta": "Beta pastabos",
  "launch.readiness": "Pasirengimas paleidimui",
  "launch.essentialsDone": "būtinų punktų atlikta",
  "launch.optionalDone": "Taip pat atlikta neprivalomų punktų: {n}",
  "launch.optional": "Neprivaloma",
  "launch.statusTitle": "Sąrankos ir ryšių būsena",
  "launch.section.foundation": "Projekto pagrindai",
  "launch.section.content": "Turinio sistema",
  "launch.section.publishing": "Publikavimas",
  "launch.section.measurement": "Matavimas",
  "launch.section.authority": "Autoritetas",
  "launch.section.billing": "Atsiskaitymai ir beta",
  "launch.item.businessProfile": "Įmonės profilis užpildytas",
  "launch.item.businessProfile.desc":
    "Įmonės pavadinimas ir aprašymas nustatyti, todėl Milo turi kontekstą.",
  "launch.item.websiteUrl": "Svetainės URL pridėtas",
  "launch.item.websiteUrl.desc": "Naudojamas auditams, analitikos susiejimui ir publikavimui.",
  "launch.item.marketLanguage": "Rinka ir kalba pasirinktos",
  "launch.item.marketLanguage.desc": "Lemia turinio kalbą ir lokalizuotą pozicionavimą.",
  "launch.item.services": "Paslaugos arba produktai pridėti",
  "launch.item.services.desc": "Nurodykite Milo, ką ši įmonė iš tikrųjų parduoda.",
  "launch.item.brandIntelligence": "Brand Intelligence pradėtas",
  "launch.item.brandIntelligence.desc":
    "Tonas, teiginiai ir pasiūlymai užtikrina, kad turinys atitiktų prekės ženklą ir būtų saugus.",
  "launch.item.opportunity": "Sugeneruota bent viena galimybė",
  "launch.item.opportunity.desc": "Struktūruotos matomumo idėjos, pagrįstos įmone.",
  "launch.item.contentAsset": "Sugeneruotas bent vienas turinio elementas",
  "launch.item.contentAsset.desc": "Iš galimybės sukurta turinio užduotis arba juodraštis.",
  "launch.item.miloScore": "Bent vienas Milo Score įvertinimas",
  "launch.item.miloScore.desc": "Įvertinkite juodraštį prieš publikuodami.",
  "launch.item.reviewed": "Juodraštis peržiūrėtas arba patobulintas",
  "launch.item.reviewed.desc":
    "Pateikite juodraštį peržiūrai, patvirtinkite arba patobulinkite jį.",
  "launch.item.connectorSelected": "Jungtis pasirinkta",
  "launch.item.connectorSelected.desc":
    "Projekto sąrankoje pasirinkite pasirinktinę, WordPress arba Shopify jungtį.",
  "launch.item.connectorConfigured": "Jungtis sukonfigūruota",
  "launch.item.connectorConfigured.desc":
    "Publikavimui reikalingi prisijungimo duomenys arba galiniai taškai nustatyti.",
  "launch.item.connectorTested": "Ryšys patikrintas (WordPress/Shopify)",
  "launch.item.connectorTested.desc":
    "Paleiskite „Tikrinti ryšį“, kad patikrintumėte prieigą. Sėkmingas testas nepatikrina publikavimo leidimų ir negarantuoja būsimo publikavimo.",
  "launch.item.draftSent": "Išsiųstas bent vienas juodraštis",
  "launch.item.draftSent.desc":
    "Nusiųskite patvirtintą turinį į prijungtą svetainę kaip juodraštį.",
  "launch.item.publishedLive": "Paskelbtas bent vienas puslapis",
  "launch.item.publishedLive.desc": "Paskelbkite peržiūrėtą juodraštį iš Milo.",
  "launch.item.analyticsSnippet": "Analitikos kodo fragmentas pasiekiamas",
  "launch.item.analyticsSnippet.desc":
    "Nukopijuokite Milo kodo fragmentą iš analitikos ir įdėkite jį į savo svetainę.",
  "launch.item.analyticsEvents": "Analitikos įvykiai gauti",
  "launch.item.analyticsEvents.desc":
    "Įdiegę kodo fragmentą apsilankykite savo svetainėje, kad patvirtintumėte sekimą.",
  "launch.item.gscImport": "GSC Lite importas pridėtas",
  "launch.item.gscImport.desc":
    "Importuokite Search Console CSV, kad susietumėte parodymus ir paspaudimus.",
  "launch.item.publishedByMilo": "Yra duomenų apie Milo paskelbtus puslapius",
  "launch.item.publishedByMilo.desc":
    "Paskelbti Milo puslapiai susieti su Search Console našumo duomenimis.",
  "launch.item.authorityGenerated": "Autoriteto galimybės sugeneruotos",
  "launch.item.authorityGenerated.desc":
    "Saugios autoriteto užduotys, pavyzdžiui, katalogai ir partnerių nuorodos.",
  "launch.item.authorityProgress": "Autoriteto elementas suplanuotas arba paskelbtas",
  "launch.item.authorityProgress.desc":
    "Perkelkite autoriteto užduotį į būseną „suplanuota“, „susisiekta“ arba „paskelbta“.",
  "launch.item.billingProfile": "Atsiskaitymo profilis užpildytas",
  "launch.item.billingProfile.desc": "Atsiskaitymo šalis lemia jūsų kainų rinką.",
  "launch.item.planSelected": "Planas pasirinktas (arba nemokama peržiūra)",
  "launch.item.planSelected.desc":
    "Nemokama peržiūra aktyvi pagal numatytuosius nustatymus — mokėjimas nebūtinas.",
  "launch.item.betaStatus": "Matoma beta / nemokama / laukiama būsena",
  "launch.item.betaStatus.desc":
    "Rankinės beta versijos, nemokamo suteikimo arba laukiamo mokėjimo būsena rodoma skiltyje Atsiskaitymai.",
  "launch.item.paddlePending": "Laukiama tikrų mokėjimų patikros",
  "launch.item.paddlePending.desc":
    "Stripe yra pasirinktas Paddle pakaitalas. Smėlio dėžės sąranka ir tikrų mokėjimų gyvavimo ciklo patikros dar laukia.",
  "launch.conn.website": "Svetainė",
  "launch.conn.website.ok": "Svetainės URL nustatytas.",
  "launch.conn.website.none": "Pridėkite svetainės URL projekto sąrankoje.",
  "launch.conn.brand": "Brand Intelligence",
  "launch.conn.brand.ok": "Prekės ženklo kontekstas pradėtas.",
  "launch.conn.brand.none": "Dar nepradėta.",
  "launch.conn.connector": "Publikavimo jungtis",
  "launch.conn.connector.none": "Jungtis nepasirinkta.",
  "launch.conn.connector.partial": "Pasirinkta, bet konfigūracija nebaigta.",
  "launch.conn.connector.customOk": "Pasirinktiniai galiniai taškai sukonfigūruoti.",
  "launch.conn.connector.wpOk": "WordPress prijungta ir patikrinta.",
  "launch.conn.connector.wpUntested": "WordPress sukonfigūruota — patikrinkite ryšį.",
  "launch.conn.connector.shopifyOk": "Shopify prijungta ir patikrinta.",
  "launch.conn.connector.shopifyUntested": "Shopify sukonfigūruota — patikrinkite ryšį.",
  "launch.conn.analytics": "Analitika",
  "launch.conn.analytics.ok": "Įvykiai gauti.",
  "launch.conn.analytics.pending": "Įdiekite kodo fragmentą ir apsilankykite savo svetainėje.",
  "launch.conn.gsc": "GSC Lite",
  "launch.conn.gsc.ok": "CSV importuotas.",
  "launch.conn.gsc.csvOnly":
    "Savininko pateiktas CSV išsaugotas; jis nepatvirtina OAuth ryšio būsenos.",
  "launch.conn.gsc.synced":
    "Išsaugotas importas nurodo API šaltinį; dabartinis ryšys ir kilmė nėra nepriklausomai patikrinti.",
  "launch.conn.gsc.connectedNotSynced": "Prijungta — paleiskite sinchronizavimą.",
  "launch.conn.gsc.reconnect": "Reikia prisijungti iš naujo.",
  "launch.conn.gsc.none": "Importų dar nėra.",
  "launch.conn.authority": "Autoritetas",
  "launch.conn.authority.ok": "Galimybės sugeneruotos.",
  "launch.conn.authority.none": "Dar nieko nesugeneruota.",
  "launch.conn.billing": "Atsiskaitymai",
  "launch.conn.billing.ok": "Atsiskaitymo profilis nustatytas.",
  "launch.conn.billing.pending": "Pridėkite atsiskaitymo šalį, kad kainos būtų teisingos.",
  "launch.qa.title": "Savininko kokybės patikra",
  "launch.qa.ownerOnly": "Tik savininkui",
  "launch.qa.projectId": "Projekto ID",
  "launch.qa.plan": "Planas",
  "launch.qa.subStatus": "Prenumeratos būsena",
  "launch.qa.connector": "Jungtis",
  "launch.qa.sent": "Išsiųsti juodraščiai",
  "launch.qa.live": "Paskelbta",
  "launch.qa.analyticsEvents": "Analitikos įvykiai (30 d.)",
  "launch.qa.gscImports": "GSC importai",
  "launch.qa.gscOAuth": "GSC OAuth sukonfigūruotas",
  "launch.qa.gscConnected": "GSC ryšys",
  "launch.qa.gscSite": "GSC pasirinkta svetainė",
  "launch.qa.gscSyncRows": "GSC paskutinio sinchronizavimo eilutės",
  "launch.qa.gscSyncDate": "GSC paskutinio sinchronizavimo data",
  "launch.qa.authorityCount": "Autoriteto elementai",
  "launch.qa.contentCount": "Turinio elementai",
  "launch.qa.aiCandidate": "DI kandidatas sukonfigūruotas",
  "launch.qa.paddle": "Senoji Paddle integracija sukonfigūruota",
  "launch.qa.yes": "Taip",
  "launch.qa.no": "Ne",
  "beta.title": "Beta pastabos",
  "beta.subtitle":
    "Dabartiniai apribojimai ir tai, ką reikia patvirtinti prieš platesnį savitarnos paleidimą.",
  "beta.intro":
    "Šiose pastabose išvardytas likęs sąrankos ir priėmimo darbas. Vadovaujamoje demonstracijoje turi būti naudojami patikrinti srautai; vien kontrolinio sąrašo užbaigimas nereiškia pasirengimo mokamam savitarnos paleidimui.",
  "beta.limitsTitle": "Dabartiniai beta versijos apribojimai",
  "beta.reassure":
    "Demonstracijos srautus rinkitės remdamiesi patikrintais įrodymais. Nepatikrintos integracijos ir mokamo paleidimo prielaidos turi likti matomos.",
  "beta.demoSafeTitle": "Saugių demonstracijų pastabos",
  "beta.backToChecklist": "Atgal į kontrolinį sąrašą",
  "beta.openDemoScript": "Atidaryti demonstracijos scenarijų",
  "beta.limit.paddle":
    "Tikri mokėjimai neparengti bendram mokamam paleidimui. Stripe smėlio dėžės konfigūracija ir tikrų mokėjimų gyvavimo ciklo patikros dar laukia.",
  "beta.limit.wordpress":
    "WordPress jungtis sukurta, tačiau jai vis dar reikia tiesioginio testavimo su tikra svetaine.",
  "beta.limit.shopify":
    "Shopify jungtis sukurta, tačiau jai vis dar reikia tiesioginio testavimo su tikra parduotuve.",
  "beta.limit.aiCandidate":
    "Alternatyviam DI modeliui (vertinimo kandidatui) prieš paleidimą reikia aplinkos konfigūracijos.",
  "beta.limit.legal":
    "Teisiniai puslapiai yra beta parengties juodraščiai ir turi būti peržiūrėti prieš platesnį mokamą paleidimą.",
  "beta.limit.analytics":
    "Kad būtų gaunami įvykiai, analitikai kliento svetainėje turi būti įdiegtas Milo kodo fragmentas.",
  "beta.limit.gsc":
    "GSC Lite palaiko rankinį CSV importą ir neprivalomą OAuth/API sinchronizavimą, kai sukonfigūruotas Google OAuth. Rankinis importas lieka prieinamas kaip atsarginis variantas.",
  "beta.limit.images":
    "Publikuojant galima įtraukti peržiūrėtas vaizdų nuorodas. Vaizdų perkėlimui, pagrindiniams vaizdams ir galutiniam išdėstymui vis dar reikia patikrų tikrose svetainėse kiekvienai jungčiai.",
  "beta.demo.rankings":
    "Nežadėkite pozicijų, srauto ar garantuotų DI citatų — Milo veikia su DI pagalba, o jo darbą peržiūri žmonės.",
  "beta.demo.payments":
    "Paaiškinkite, kad Stripe yra pasirinktas mokėjimų paslaugų teikėjas, o sąrankos ir mokėjimų gyvavimo ciklo patikra nebaigta. Nepateikite mokėjimų kaip aktyvių.",
  "beta.demo.connectors":
    "Nurodykite, kad WordPress ir Shopify jungtims kiekvienoje svetainėje reikia išsamaus tiesioginio testavimo.",
  "beta.demo.data":
    "Nurodykite, kad analitikos ir GSC įrodymai priklauso nuo duomenų prieinamumo demonstraciniame projekte.",
};
