/** Maltese authoring only; not registered in the runtime or language picker.
 * Nine billing/launch/beta keys follow `launch-readiness.ts`, and the two
 * `launch.conn.gsc` import states follow `gsc-integrity.ts`; both override `en.ts`. */
export const mtCommerce: Readonly<Record<string, string>> = {
  "billing.stripeTest.title": "Test tal-ħlas ta’ Stripe",
  "billing.stripeTest.description":
    "Ħlas ta’ prova għas-sid biss. Uża d-dettalji tal-ħlas ta’ prova ta’ Stripe. Ma jiġi ddebitat l-ebda ħlas reali u l-pjan tiegħek f’Milo ma jinbidilx.",
  "billing.stripeTest.open": "Iftaħ il-ħlas ta’ prova",
  "billing.stripeTest.opening": "Qed jinfetaħ…",
  "billing.stripeTest.error":
    "Il-ħlas ta’ prova ma setax jiġi kkonfermat. Erġa’ pprova minn hawn biex jerġa’ jintuża l-istess tentattiv.",
  "billing.title": "Fatturazzjoni u pjan",
  "billing.subtitle": "Immaniġġja l-pjan, il-profil tal-fatturazzjoni u ż-żidiet tiegħek.",
  "billing.owner.title": "Kont tas-sid",
  "billing.owner.desc":
    "Għandek proġetti illimitati u l-ebda fatturazzjoni. Il-limiti tal-pjan ma japplikawx għal dan il-kont.",
  "billing.currentPlan": "Pjan attwali",
  "billing.status": "Stat",
  "billing.billingMarket": "Suq tal-fatturazzjoni",
  "billing.currency": "Munita",
  "billing.price": "Prezz",
  "billing.perMonth": "/xahar",
  "billing.limits": "Limiti tal-pjan",
  "billing.profile": "Profil tal-fatturazzjoni",
  "billing.customerType": "Tip ta’ klijent",
  "billing.business": "Negozju",
  "billing.consumer": "Konsumatur",
  "billing.billingName": "Isem għall-fatturazzjoni",
  "billing.businessName": "Isem in-negozju",
  "billing.billingEmail": "Email għall-fatturazzjoni",
  "billing.billingCountry": "Pajjiż tal-fatturazzjoni",
  "billing.vatId": "Numru tal-VAT / tat-taxxa",
  "billing.derivedMarket": "Suq tal-fatturazzjoni ddeterminat",
  "billing.saveProfile": "Issejvja l-profil tal-fatturazzjoni",
  "billing.profileSaved": "Il-profil tal-fatturazzjoni ġie ssejvjat",
  "billing.selectCountryFirst": "Agħżel pajjiż tal-fatturazzjoni biex tara l-prezzijiet lokali.",
  "billing.choosePlan": "Agħżel pjan",
  "billing.recommended": "Rakkomandat",
  "billing.choose": "Agħżel",
  "billing.currentLabel": "Pjan attwali",
  "billing.upgrade": "Aqleb għal pjan ogħla",
  "billing.addons": "Żidiet",
  "billing.assistedSetup": "Konfigurazzjoni assistita",
  "billing.monthlyCare": "Kura mensili",
  "billing.oneTime": "darba biss",
  "billing.checkoutNotConfigured":
    "Il-ħlas għadu mhuwiex ikkonfigurat. Biex tattiva dan il-pjan, ikkuntattja l-appoġġ.",
  "billing.contactSupport": "Ikkuntattja l-appoġġ",
  "billing.checkoutPendingMsg":
    "Il-ħlas inbeda. Il-pjan tiegħek jiġi attivat hekk kif il-ħlas jiġi kkonfermat.",
  "billing.rulesNote":
    "Is-suq tal-fatturazzjoni tiegħek huwa bbażat fuq il-pajjiż tan-negozju jew tal-fatturazzjoni tiegħek. It-tibdil tal-lingwa tas-sit jew tar-reġjun pubbliku ma jaffettwax l-eliġibbiltà għall-prezz.",
  "billing.taxNote":
    "Milo jappoġġa kemm negozji kif ukoll konsumaturi. Id-dettalji tat-taxxa u tal-fatturi jistgħu jvarjaw skont il-pajjiż u jistgħu jeħtieġu reviżjoni qabel it-tnedija pubblika.",
  "billing.paddleNote":
    "Il-konfigurazzjoni u l-verifika tal-ħlasijiet reali mhumiex lesti. Qabel ma tagħżel pjan imħallas, ikkuntattja l-appoġġ.",
  "billing.noGuarantee":
    "Mhumiex garantiti pożizzjonijiet, traffiku, dħul jew ċitazzjonijiet mill-IA.",
  "billing.marketReview":
    "It-tibdil tal-pajjiż tal-fatturazzjoni jista’ jaffettwa l-prezzijiet u jeħtieġ reviżjoni.",
  "billing.manual.title": "Attivazzjoni manwali (għas-sid biss)",
  "billing.manual.desc":
    "Attiva pjan manwalment għal kontijiet li jħallsu b’fattura, beta jew b’xejn. Ma jintwerax lill-utenti normali.",
  "billing.manual.beta": "Attiva bħala beta manwali",
  "billing.manual.comped": "Attiva bħala mogħti b’xejn manwalment",
  "billing.manual.reset": "Irrisettja għall-previżjoni b’xejn",
  "billing.statusLabel.freePreview": "Previżjoni b’xejn",
  "billing.statusLabel.checkoutPending": "Ħlas pendenti",
  "billing.statusLabel.active": "Attiv",
  "billing.statusLabel.pastDue": "Ħlas skadut",
  "billing.statusLabel.cancelled": "Ikkanċellat",
  "billing.statusLabel.manualBeta": "Beta manwali",
  "billing.statusLabel.manualComped": "Mogħti b’xejn manwalment",
  "launch.title": "Lista ta’ kontroll għat-tnedija beta",
  "launch.subtitle":
    "Segwi t-tħejjija ta’ dan il-proġett fil-konfigurazzjoni, fil-kontenut, fil-pubblikazzjoni, fil-kejl, fl-awtorità u fil-fatturazzjoni.",
  "launch.noProject": "Oħloq proġett biex tara l-lista ta’ kontroll għat-tnedija.",
  "launch.betaNotesCta": "Noti tal-beta",
  "launch.readiness": "Tħejjija għat-tnedija",
  "launch.essentialsDone": "punti essenzjali lesti",
  "launch.optionalDone": "Punti mhux obbligatorji lesti wkoll: {n}",
  "launch.optional": "Mhux obbligatorju",
  "launch.statusTitle": "Stat tal-konfigurazzjoni u tal-konnessjonijiet",
  "launch.section.foundation": "Pedamenti tal-proġett",
  "launch.section.content": "Sistema tal-kontenut",
  "launch.section.publishing": "Pubblikazzjoni",
  "launch.section.measurement": "Kejl",
  "launch.section.authority": "Awtorità",
  "launch.section.billing": "Fatturazzjoni u beta",
  "launch.item.businessProfile": "Il-profil tan-negozju mimli",
  "launch.item.businessProfile.desc":
    "L-isem u d-deskrizzjoni tan-negozju huma ssettjati, għalhekk Milo għandu l-kuntest.",
  "launch.item.websiteUrl": "L-URL tas-sit miżjud",
  "launch.item.websiteUrl.desc":
    "Jintuża għall-awditi, għat-tqabbil tal-analitika u għall-pubblikazzjoni.",
  "launch.item.marketLanguage": "Is-suq u l-lingwa magħżula",
  "launch.item.marketLanguage.desc":
    "Jiddetermina l-lingwa tal-kontenut u l-pożizzjonament lokalizzat.",
  "launch.item.services": "Servizzi jew prodotti miżjuda",
  "launch.item.services.desc": "Għid lil Milo x’jbigħ verament dan in-negozju.",
  "launch.item.brandIntelligence": "Brand Intelligence mibdi",
  "launch.item.brandIntelligence.desc":
    "Il-vuċi, l-istqarrijiet u l-offerti jiżguraw li l-kontenut jaqbel mal-brand u jkun sikur.",
  "launch.item.opportunity": "Mill-inqas opportunità waħda ġġenerata",
  "launch.item.opportunity.desc": "Ideat strutturati ta’ viżibbiltà bbażati fuq in-negozju.",
  "launch.item.contentAsset": "Mill-inqas oġġett wieħed tal-kontenut iġġenerat",
  "launch.item.contentAsset.desc": "Kompitu tal-kontenut jew abbozz maħluq minn opportunità.",
  "launch.item.miloScore": "Mill-inqas valutazzjoni waħda ta’ Milo Score",
  "launch.item.miloScore.desc": "Ivvaluta abbozz qabel il-pubblikazzjoni.",
  "launch.item.reviewed": "Abbozz rivedut jew imtejjeb",
  "launch.item.reviewed.desc": "Ibgħat abbozz għar-reviżjoni, approvah jew tejjbu.",
  "launch.item.connectorSelected": "Konnettur magħżul",
  "launch.item.connectorSelected.desc":
    "Fil-konfigurazzjoni tal-proġett, agħżel konnettur personalizzat, WordPress jew Shopify.",
  "launch.item.connectorConfigured": "Konnettur ikkonfigurat",
  "launch.item.connectorConfigured.desc":
    "Il-kredenzjali jew l-endpoints meħtieġa għall-pubblikazzjoni huma ssettjati.",
  "launch.item.connectorTested": "Konnessjoni ttestjata (WordPress/Shopify)",
  "launch.item.connectorTested.desc":
    "Ħaddem “Ittestja l-konnessjoni” biex tiċċekkja l-aċċess. Test b’suċċess ma jivverifikax il-permessi tal-pubblikazzjoni u ma jiggarantixxix pubblikazzjoni futura.",
  "launch.item.draftSent": "Mill-inqas abbozz wieħed mibgħut",
  "launch.item.draftSent.desc": "Ibgħat kontenut approvat lis-sit konness bħala abbozz.",
  "launch.item.publishedLive": "Mill-inqas paġna waħda ppubblikata",
  "launch.item.publishedLive.desc": "Ippubblika abbozz rivedut minn Milo.",
  "launch.item.analyticsSnippet": "Is-snippet tal-analitika disponibbli",
  "launch.item.analyticsSnippet.desc":
    "Ikkopja s-snippet ta’ Milo mill-analitika u żidu fis-sit tiegħek.",
  "launch.item.analyticsEvents": "Avvenimenti tal-analitika riċevuti",
  "launch.item.analyticsEvents.desc":
    "Wara li tinstalla s-snippet, żur is-sit tiegħek biex tikkonferma t-traċċar.",
  "launch.item.gscImport": "Importazzjoni ta’ GSC Lite miżjuda",
  "launch.item.gscImport.desc":
    "Importa CSV ta’ Search Console biex torbot l-impressjonijiet u l-klikks.",
  "launch.item.publishedByMilo": "Dejta disponibbli dwar il-paġni ppubblikati minn Milo",
  "launch.item.publishedByMilo.desc":
    "Il-paġni ppubblikati minn Milo mqabbla mal-prestazzjoni ta’ Search Console.",
  "launch.item.authorityGenerated": "Opportunitajiet ta’ awtorità ġġenerati",
  "launch.item.authorityGenerated.desc":
    "Kompiti sikuri ta’ awtorità bħal direttorji u links ta’ sħab.",
  "launch.item.authorityProgress": "Oġġett ta’ awtorità ppjanat jew ippubblikat",
  "launch.item.authorityProgress.desc":
    "Mexxi kompitu ta’ awtorità għall-istat “ippjanat”, “ikkuntattjat” jew “ippubblikat”.",
  "launch.item.billingProfile": "Il-profil tal-fatturazzjoni mimli",
  "launch.item.billingProfile.desc":
    "Il-pajjiż tal-fatturazzjoni jiddetermina s-suq tal-prezzijiet tiegħek.",
  "launch.item.planSelected": "Pjan magħżul (jew previżjoni b’xejn)",
  "launch.item.planSelected.desc":
    "Il-previżjoni b’xejn hija attiva b’mod awtomatiku — ma hemm bżonn l-ebda ħlas.",
  "launch.item.betaStatus": "Stat beta / b’xejn / pendenti viżibbli",
  "launch.item.betaStatus.desc":
    "L-istat ta’ beta manwali, għotja b’xejn jew ħlas pendenti jintwera fit-taqsima tal-Fatturazzjoni.",
  "launch.item.paddlePending": "Qed tistenna l-verifika tal-ħlasijiet reali",
  "launch.item.paddlePending.desc":
    "Stripe huwa s-sostitut magħżul għal Paddle. Il-konfigurazzjoni tas-sandbox u l-verifiki taċ-ċiklu tal-ħajja tal-ħlasijiet reali għadhom pendenti.",
  "launch.conn.website": "Sit",
  "launch.conn.website.ok": "L-URL tas-sit huwa ssettjat.",
  "launch.conn.website.none": "Żid l-URL tas-sit fil-konfigurazzjoni tal-proġett.",
  "launch.conn.brand": "Brand Intelligence",
  "launch.conn.brand.ok": "Il-kuntest tal-brand inbeda.",
  "launch.conn.brand.none": "Għadu ma nbediex.",
  "launch.conn.connector": "Konnettur tal-pubblikazzjoni",
  "launch.conn.connector.none": "L-ebda konnettur magħżul.",
  "launch.conn.connector.partial": "Magħżul, iżda l-konfigurazzjoni mhijiex lesta.",
  "launch.conn.connector.customOk": "L-endpoints personalizzati huma kkonfigurati.",
  "launch.conn.connector.wpOk": "WordPress konness u ttestjat.",
  "launch.conn.connector.wpUntested": "WordPress ikkonfigurat — ittestja l-konnessjoni.",
  "launch.conn.connector.shopifyOk": "Shopify konness u ttestjat.",
  "launch.conn.connector.shopifyUntested": "Shopify ikkonfigurat — ittestja l-konnessjoni.",
  "launch.conn.analytics": "Analitika",
  "launch.conn.analytics.ok": "Avvenimenti riċevuti.",
  "launch.conn.analytics.pending": "Installa s-snippet u żur is-sit tiegħek.",
  "launch.conn.gsc": "GSC Lite",
  "launch.conn.gsc.ok": "CSV importat.",
  "launch.conn.gsc.csvOnly":
    "CSV ipprovdut mis-sid issejvjat; ma jikkonfermax l-istat tal-konnessjoni OAuth.",
  "launch.conn.gsc.synced":
    "L-importazzjoni ssejvjata tiddikjara sors API; il-konnessjoni attwali u l-oriġini mhumiex ivverifikati b’mod indipendenti.",
  "launch.conn.gsc.connectedNotSynced": "Konness — ħaddem is-sinkronizzazzjoni.",
  "launch.conn.gsc.reconnect": "Il-konnessjoni trid terġa’ ssir.",
  "launch.conn.gsc.none": "Għad m’hemmx importazzjonijiet.",
  "launch.conn.authority": "Awtorità",
  "launch.conn.authority.ok": "Opportunitajiet iġġenerati.",
  "launch.conn.authority.none": "Għadu ma ġie ġġenerat xejn.",
  "launch.conn.billing": "Fatturazzjoni",
  "launch.conn.billing.ok": "Il-profil tal-fatturazzjoni huwa ssettjat.",
  "launch.conn.billing.pending": "Żid pajjiż tal-fatturazzjoni biex il-prezzijiet ikunu korretti.",
  "launch.qa.title": "Verifika tal-kwalità mis-sid",
  "launch.qa.ownerOnly": "Għas-sid biss",
  "launch.qa.projectId": "ID tal-proġett",
  "launch.qa.plan": "Pjan",
  "launch.qa.subStatus": "Stat tal-abbonament",
  "launch.qa.connector": "Konnettur",
  "launch.qa.sent": "Abbozzi mibgħuta",
  "launch.qa.live": "Ippubblikati",
  "launch.qa.analyticsEvents": "Avvenimenti tal-analitika (30 jum)",
  "launch.qa.gscImports": "Importazzjonijiet ta’ GSC",
  "launch.qa.gscOAuth": "GSC OAuth ikkonfigurat",
  "launch.qa.gscConnected": "Konnessjoni ta’ GSC",
  "launch.qa.gscSite": "Sit magħżul f’GSC",
  "launch.qa.gscSyncRows": "Ringieli tal-aħħar sinkronizzazzjoni ta’ GSC",
  "launch.qa.gscSyncDate": "Data tal-aħħar sinkronizzazzjoni ta’ GSC",
  "launch.qa.authorityCount": "Oġġetti ta’ awtorità",
  "launch.qa.contentCount": "Oġġetti tal-kontenut",
  "launch.qa.aiCandidate": "Kandidat tal-IA kkonfigurat",
  "launch.qa.paddle": "Integrazzjoni preċedenti ta’ Paddle ikkonfigurata",
  "launch.qa.yes": "Iva",
  "launch.qa.no": "Le",
  "beta.title": "Noti tal-beta",
  "beta.subtitle":
    "Il-limitazzjonijiet attwali u dak li jrid jiġi kkonfermat qabel tnedija usa’ b’servizz awtonomu.",
  "beta.intro":
    "Dawn in-noti jelenkaw ix-xogħol li fadal fuq il-konfigurazzjoni u l-aċċettazzjoni. Dimostrazzjoni ggwidata għandha tuża flussi vverifikati; it-tlestija tal-lista ta’ kontroll waħedha ma tistabbilixxix it-tħejjija għal tnedija mħallsa b’servizz awtonomu.",
  "beta.limitsTitle": "Limitazzjonijiet attwali tal-beta",
  "beta.reassure":
    "Agħżel il-flussi tad-dimostrazzjoni abbażi ta’ evidenza vverifikata. L-integrazzjonijiet mhux ittestjati u l-prerekwiżiti tat-tnedija mħallsa għandhom jibqgħu viżibbli.",
  "beta.demoSafeTitle": "Noti għal dimostrazzjonijiet sikuri",
  "beta.backToChecklist": "Lura għal-lista ta’ kontroll",
  "beta.openDemoScript": "Iftaħ l-iskript tad-dimostrazzjoni",
  "beta.limit.paddle":
    "Il-ħlasijiet reali mhumiex lesti għal tnedija ġenerali mħallsa. Il-konfigurazzjoni tas-sandbox ta’ Stripe u l-verifiki taċ-ċiklu tal-ħajja tal-ħlasijiet reali għadhom pendenti.",
  "beta.limit.wordpress":
    "Il-konnettur ta’ WordPress huwa mibni, iżda għadu jeħtieġ ittestjar online ma’ sit reali.",
  "beta.limit.shopify":
    "Il-konnettur ta’ Shopify huwa mibni, iżda għadu jeħtieġ ittestjar online ma’ ħanut reali.",
  "beta.limit.aiCandidate":
    "Il-mudell alternattiv tal-IA (kandidat għall-evalwazzjoni) jeħtieġ konfigurazzjoni tal-ambjent qabel it-tnedija.",
  "beta.limit.legal":
    "Il-paġni legali huma abbozzi tat-tħejjija għall-beta u għandhom jiġu riveduti qabel tnedija mħallsa usa’.",
  "beta.limit.analytics":
    "Biex jiġu riċevuti l-avvenimenti, l-analitika teħtieġ is-snippet ta’ Milo installat fis-sit tal-klijent.",
  "beta.limit.gsc":
    "GSC Lite jappoġġa importazzjoni manwali ta’ CSV u sinkronizzazzjoni OAuth/API mhux obbligatorja fejn Google OAuth ikun ikkonfigurat. L-importazzjoni manwali tibqa’ disponibbli bħala alternattiva.",
  "beta.limit.images":
    "Il-pubblikazzjoni tista’ tinkludi referenzi ta’ stampi riveduti. It-trasferiment tal-istampi, l-istampi ewlenin u t-tqassim finali għadhom jeħtieġu verifiki fuq siti reali għal kull konnettur.",
  "beta.demo.rankings":
    "Twiegħedx pożizzjonijiet, traffiku jew ċitazzjonijiet garantiti mill-IA — Milo huwa assistit mill-IA u x-xogħol tiegħu jiġi rivedut minn persuni.",
  "beta.demo.payments":
    "Spjega li Stripe huwa l-fornitur tal-ħlasijiet magħżul u li l-verifika tal-konfigurazzjoni u taċ-ċiklu tal-ħajja tal-ħlasijiet mhijiex lesta. Tippreżentax il-ħlasijiet bħala attivi.",
  "beta.demo.connectors":
    "Indika li l-konnetturi ta’ WordPress u Shopify jeħtieġu ttestjar sħiħ online fuq kull sit.",
  "beta.demo.data":
    "Indika li l-evidenza tal-analitika u ta’ GSC tiddependi fuq id-disponibbiltà tad-dejta fil-proġett tad-dimostrazzjoni.",
};
