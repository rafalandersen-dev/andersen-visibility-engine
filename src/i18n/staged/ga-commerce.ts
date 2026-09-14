/** Irish authoring only; not registered in the runtime or language picker.
 * Nine billing/launch/beta keys follow `launch-readiness.ts`, and the two
 * `launch.conn.gsc` import states follow `gsc-integrity.ts`; both override `en.ts`. */
export const gaCommerce: Readonly<Record<string, string>> = {
  "billing.stripeTest.title": "Tástáil íocaíochta Stripe",
  "billing.stripeTest.description":
    "Íocaíocht tástála don úinéir amháin. Úsáid sonraí íocaíochta tástála Stripe. Ní ghearrtar aon fhíortháille agus ní athraíonn do phlean Milo.",
  "billing.stripeTest.open": "Oscail an íocaíocht tástála",
  "billing.stripeTest.opening": "Á hoscailt…",
  "billing.stripeTest.error":
    "Níorbh fhéidir an íocaíocht tástála a dheimhniú. Bain triail eile as anseo chun an iarracht chéanna a athúsáid.",
  "billing.title": "Billeáil agus plean",
  "billing.subtitle": "Bainistigh do phlean, do phróifíl billeála agus do bhreiseáin.",
  "billing.owner.title": "Cuntas úinéara",
  "billing.owner.desc":
    "Tá tionscadail gan teorainn agat agus níl aon bhilleáil ann. Ní bhaineann teorainneacha an phlean leis an gcuntas seo.",
  "billing.currentPlan": "Plean reatha",
  "billing.status": "Stádas",
  "billing.billingMarket": "Margadh billeála",
  "billing.currency": "Airgeadra",
  "billing.price": "Praghas",
  "billing.perMonth": "/mí",
  "billing.limits": "Teorainneacha an phlean",
  "billing.profile": "Próifíl billeála",
  "billing.customerType": "Cineál custaiméara",
  "billing.business": "Gnó",
  "billing.consumer": "Tomhaltóir",
  "billing.billingName": "Ainm billeála",
  "billing.businessName": "Ainm an ghnó",
  "billing.billingEmail": "Ríomhphost billeála",
  "billing.billingCountry": "Tír billeála",
  "billing.vatId": "Uimhir CBL / chánach",
  "billing.derivedMarket": "Margadh billeála díorthaithe",
  "billing.saveProfile": "Sábháil an phróifíl billeála",
  "billing.profileSaved": "Sábháladh an phróifíl billeála",
  "billing.selectCountryFirst": "Roghnaigh tír billeála chun praghsáil áitiúil a fheiceáil.",
  "billing.choosePlan": "Roghnaigh plean",
  "billing.recommended": "Molta",
  "billing.choose": "Roghnaigh",
  "billing.currentLabel": "Plean reatha",
  "billing.upgrade": "Uasghrádaigh",
  "billing.addons": "Breiseáin",
  "billing.assistedSetup": "Socrú le cúnamh",
  "billing.monthlyCare": "Cúram míosúil",
  "billing.oneTime": "aon uair amháin",
  "billing.checkoutNotConfigured":
    "Níl an íocaíocht cumraithe fós. Chun an plean seo a ghníomhachtú, déan teagmháil leis an tacaíocht.",
  "billing.contactSupport": "Déan teagmháil leis an tacaíocht",
  "billing.checkoutPendingMsg":
    "Tosaíodh an íocaíocht. Gníomhachtófar do phlean a luaithe a dheimhneofar an íocaíocht.",
  "billing.rulesNote":
    "Tá do mhargadh billeála bunaithe ar thír do ghnó nó do bhilleála. Ní dhéanann athrú ar theanga an tsuímh ná ar an réigiún poiblí difear don incháilitheacht praghais.",
  "billing.taxNote":
    "Tacaíonn Milo le gnólachtaí agus le tomhaltóirí araon. D’fhéadfadh sonraí cánach agus sonraisc a bheith éagsúil de réir tíre agus d’fhéadfadh go mbeadh gá iad a athbhreithniú roimh sheoladh poiblí.",
  "billing.paddleNote":
    "Níl socrú agus fíorú na bhfíoríocaíochtaí críochnaithe. Sula roghnaíonn tú plean íoctha, déan teagmháil leis an tacaíocht.",
  "billing.noGuarantee": "Ní ráthaítear suíomhanna, trácht, ioncam ná luanna in IS.",
  "billing.marketReview":
    "D’fhéadfadh athrú ar thír na billeála dul i bhfeidhm ar phraghsáil agus teastaíonn athbhreithniú.",
  "billing.manual.title": "Gníomhachtú de láimh (don úinéir amháin)",
  "billing.manual.desc":
    "Gníomhachtaigh plean de láimh do chuntais sonrasc, béite nó saor in aisce. Ní thaispeántar é do ghnáthúsáideoirí.",
  "billing.manual.beta": "Gníomhachtaigh mar bhéite de láimh",
  "billing.manual.comped": "Gníomhachtaigh mar shaor in aisce de láimh",
  "billing.manual.reset": "Athshocraigh go réamhamharc saor in aisce",
  "billing.statusLabel.freePreview": "Réamhamharc saor in aisce",
  "billing.statusLabel.checkoutPending": "Íocaíocht ar feitheamh",
  "billing.statusLabel.active": "Gníomhach",
  "billing.statusLabel.pastDue": "Íocaíocht thar téarma",
  "billing.statusLabel.cancelled": "Cealaithe",
  "billing.statusLabel.manualBeta": "Béite de láimh",
  "billing.statusLabel.manualComped": "Saor in aisce de láimh",
  "launch.title": "Seicliosta seolta béite",
  "launch.subtitle":
    "Rianaigh ullmhacht an tionscadail seo don socrú, don ábhar, don fhoilsiú, don tomhas, don údarás agus don bhilleáil.",
  "launch.noProject": "Cruthaigh tionscadal chun an seicliosta seolta a fheiceáil.",
  "launch.betaNotesCta": "Nótaí béite",
  "launch.readiness": "Ullmhacht seolta",
  "launch.essentialsDone": "bunriachtanais críochnaithe",
  "launch.optionalDone": "Míreanna roghnacha críochnaithe freisin: {n}",
  "launch.optional": "Roghnach",
  "launch.statusTitle": "Stádas an tsocraithe agus na nascanna",
  "launch.section.foundation": "Bunús an tionscadail",
  "launch.section.content": "Córas ábhair",
  "launch.section.publishing": "Foilsiú",
  "launch.section.measurement": "Tomhas",
  "launch.section.authority": "Údarás",
  "launch.section.billing": "Billeáil agus béite",
  "launch.item.businessProfile": "Próifíl ghnó comhlánaithe",
  "launch.item.businessProfile.desc":
    "Tá ainm agus cur síos an ghnó socraithe, mar sin tá comhthéacs ag Milo.",
  "launch.item.websiteUrl": "URL an tsuímh curtha leis",
  "launch.item.websiteUrl.desc":
    "Úsáidtear é d’iniúchtaí, do mheaitseáil anailísíochta agus d’fhoilsiú.",
  "launch.item.marketLanguage": "Margadh agus teanga roghnaithe",
  "launch.item.marketLanguage.desc": "Rialaíonn sé teanga an ábhair agus an suíomhú logánaithe.",
  "launch.item.services": "Seirbhísí nó táirgí curtha leis",
  "launch.item.services.desc": "Inis do Milo cad a dhíolann an gnó seo i ndáiríre.",
  "launch.item.brandIntelligence": "Brand Intelligence tosaithe",
  "launch.item.brandIntelligence.desc":
    "Cinntíonn guth, éilimh agus tairiscintí go n-oireann an t-ábhar don bhranda agus go bhfuil sé sábháilte.",
  "launch.item.opportunity": "Deis amháin ar a laghad ginte",
  "launch.item.opportunity.desc": "Smaointe infheictheachta struchtúrtha bunaithe ar an ngnó.",
  "launch.item.contentAsset": "Mír ábhair amháin ar a laghad ginte",
  "launch.item.contentAsset.desc": "Tasc ábhair nó dréacht cruthaithe ó dheis.",
  "launch.item.miloScore": "Measúnú Milo Score amháin ar a laghad",
  "launch.item.miloScore.desc": "Déan measúnú ar dhréacht roimh fhoilsiú.",
  "launch.item.reviewed": "Dréacht athbhreithnithe nó feabhsaithe",
  "launch.item.reviewed.desc": "Cuir dréacht faoi athbhreithniú, ceadaigh é nó feabhsaigh é.",
  "launch.item.connectorSelected": "Nascóir roghnaithe",
  "launch.item.connectorSelected.desc":
    "I socrú an tionscadail, roghnaigh nascóir saincheaptha, WordPress nó Shopify.",
  "launch.item.connectorConfigured": "Nascóir cumraithe",
  "launch.item.connectorConfigured.desc":
    "Tá na dintiúir nó na críochphointí a theastaíonn le foilsiú socraithe.",
  "launch.item.connectorTested": "Nasc tástáilte (WordPress/Shopify)",
  "launch.item.connectorTested.desc":
    "Rith “Tástáil an nasc” chun rochtain a sheiceáil. Ní fhíoraíonn tástáil rathúil ceadanna foilsithe agus ní ráthaíonn sí foilsiú amach anseo.",
  "launch.item.draftSent": "Dréacht amháin ar a laghad seolta",
  "launch.item.draftSent.desc": "Seol ábhar ceadaithe chuig an suíomh nasctha mar dhréacht.",
  "launch.item.publishedLive": "Leathanach amháin ar a laghad foilsithe",
  "launch.item.publishedLive.desc": "Foilsigh dréacht athbhreithnithe ó Milo.",
  "launch.item.analyticsSnippet": "Mír chóid anailísíochta ar fáil",
  "launch.item.analyticsSnippet.desc":
    "Cóipeáil mír chóid Milo ón anailísíocht agus cuir le do shuíomh í.",
  "launch.item.analyticsEvents": "Imeachtaí anailísíochta faighte",
  "launch.item.analyticsEvents.desc":
    "Tar éis duit an mhír chóid a shuiteáil, tabhair cuairt ar do shuíomh chun an rianú a dheimhniú.",
  "launch.item.gscImport": "Iompórtáil GSC Lite curtha leis",
  "launch.item.gscImport.desc":
    "Iompórtáil CSV Search Console chun imprisin agus cliceanna a nascadh.",
  "launch.item.publishedByMilo": "Sonraí ar fáil faoi leathanaigh a d’fhoilsigh Milo",
  "launch.item.publishedByMilo.desc":
    "Leathanaigh a d’fhoilsigh Milo meaitseáilte le feidhmíocht Search Console.",
  "launch.item.authorityGenerated": "Deiseanna údaráis ginte",
  "launch.item.authorityGenerated.desc":
    "Tascanna údaráis sábháilte ar nós eolairí agus naisc chomhpháirtithe.",
  "launch.item.authorityProgress": "Mír údaráis pleanáilte nó foilsithe",
  "launch.item.authorityProgress.desc":
    "Bog tasc údaráis go dtí an stádas “pleanáilte”, “déanta teagmháil” nó “foilsithe”.",
  "launch.item.billingProfile": "Próifíl billeála comhlánaithe",
  "launch.item.billingProfile.desc": "Cinneann tír na billeála do mhargadh praghsála.",
  "launch.item.planSelected": "Plean roghnaithe (nó réamhamharc saor in aisce)",
  "launch.item.planSelected.desc":
    "Tá an réamhamharc saor in aisce gníomhach de réir réamhshocraithe — ní theastaíonn íocaíocht.",
  "launch.item.betaStatus": "Stádas béite / saor in aisce / ar feitheamh le feiceáil",
  "launch.item.betaStatus.desc":
    "Taispeántar stádas béite de láimh, saor in aisce nó íocaíochta ar feitheamh sa rannán Billeáil.",
  "launch.item.paddlePending": "Ag fanacht le fíorú na bhfíoríocaíochtaí",
  "launch.item.paddlePending.desc":
    "Is é Stripe an rogha in áit Paddle. Tá socrú an bhosca gainimh agus seiceálacha shaolré na bhfíoríocaíochtaí fós ar feitheamh.",
  "launch.conn.website": "Suíomh gréasáin",
  "launch.conn.website.ok": "Tá URL an tsuímh socraithe.",
  "launch.conn.website.none": "Cuir URL an tsuímh leis i socrú an tionscadail.",
  "launch.conn.brand": "Brand Intelligence",
  "launch.conn.brand.ok": "Tosaíodh comhthéacs an bhranda.",
  "launch.conn.brand.none": "Níor tosaíodh fós.",
  "launch.conn.connector": "Nascóir foilsithe",
  "launch.conn.connector.none": "Níl nascóir roghnaithe.",
  "launch.conn.connector.partial": "Roghnaithe, ach níl an chumraíocht críochnaithe.",
  "launch.conn.connector.customOk": "Tá na críochphointí saincheaptha cumraithe.",
  "launch.conn.connector.wpOk": "WordPress nasctha agus tástáilte.",
  "launch.conn.connector.wpUntested": "WordPress cumraithe — tástáil an nasc.",
  "launch.conn.connector.shopifyOk": "Shopify nasctha agus tástáilte.",
  "launch.conn.connector.shopifyUntested": "Shopify cumraithe — tástáil an nasc.",
  "launch.conn.analytics": "Anailísíocht",
  "launch.conn.analytics.ok": "Imeachtaí faighte.",
  "launch.conn.analytics.pending": "Suiteáil an mhír chóid agus tabhair cuairt ar do shuíomh.",
  "launch.conn.gsc": "GSC Lite",
  "launch.conn.gsc.ok": "CSV iompórtáilte.",
  "launch.conn.gsc.csvOnly":
    "Sábháladh CSV a sholáthair an t-úinéir; ní dheimhníonn sé stádas an naisc OAuth.",
  "launch.conn.gsc.synced":
    "Dearbhaíonn an iompórtáil shábháilte foinse API; níl an nasc reatha ná an bunús fíoraithe go neamhspleách.",
  "launch.conn.gsc.connectedNotSynced": "Nasctha — rith sioncronú.",
  "launch.conn.gsc.reconnect": "Teastaíonn athnascadh.",
  "launch.conn.gsc.none": "Níl iompórtálacha ann fós.",
  "launch.conn.authority": "Údarás",
  "launch.conn.authority.ok": "Deiseanna ginte.",
  "launch.conn.authority.none": "Níl aon rud ginte fós.",
  "launch.conn.billing": "Billeáil",
  "launch.conn.billing.ok": "Tá an phróifíl billeála socraithe.",
  "launch.conn.billing.pending": "Cuir tír billeála leis ionas go mbeidh an phraghsáil ceart.",
  "launch.qa.title": "Seiceáil cáilíochta an úinéara",
  "launch.qa.ownerOnly": "Don úinéir amháin",
  "launch.qa.projectId": "Aitheantas an tionscadail",
  "launch.qa.plan": "Plean",
  "launch.qa.subStatus": "Stádas an tsíntiúis",
  "launch.qa.connector": "Nascóir",
  "launch.qa.sent": "Dréachtaí seolta",
  "launch.qa.live": "Foilsithe",
  "launch.qa.analyticsEvents": "Imeachtaí anailísíochta (30 lá)",
  "launch.qa.gscImports": "Iompórtálacha GSC",
  "launch.qa.gscOAuth": "GSC OAuth cumraithe",
  "launch.qa.gscConnected": "Nasc GSC",
  "launch.qa.gscSite": "Suíomh roghnaithe GSC",
  "launch.qa.gscSyncRows": "Sraitheanna an tsioncronaithe dheireanaigh GSC",
  "launch.qa.gscSyncDate": "Dáta an tsioncronaithe dheireanaigh GSC",
  "launch.qa.authorityCount": "Míreanna údaráis",
  "launch.qa.contentCount": "Míreanna ábhair",
  "launch.qa.aiCandidate": "Iarrthóir IS cumraithe",
  "launch.qa.paddle": "Comhtháthú oidhreachta Paddle cumraithe",
  "launch.qa.yes": "Tá",
  "launch.qa.no": "Níl",
  "beta.title": "Nótaí béite",
  "beta.subtitle":
    "Na teorainneacha reatha agus a bhfuil le deimhniú roimh sheoladh féinseirbhíse níos leithne.",
  "beta.intro":
    "Liostaíonn na nótaí seo an obair shocraithe agus ghlactha atá fágtha. Ba cheart sreafaí fíoraithe a úsáid i dtaispeántas treoraithe; ní chruthaíonn críochnú an tseicliosta leis féin ullmhacht do sheoladh féinseirbhíse íoctha.",
  "beta.limitsTitle": "Teorainneacha reatha na béite",
  "beta.reassure":
    "Roghnaigh sreafaí taispeána bunaithe ar fhianaise fhíoraithe. Ba cheart go bhfanfadh comhtháthuithe gan tástáil agus réamhriachtanais an tseolta íoctha le feiceáil.",
  "beta.demoSafeTitle": "Nótaí do thaispeántais shábháilte",
  "beta.backToChecklist": "Ar ais chuig an seicliosta",
  "beta.openDemoScript": "Oscail script an taispeántais",
  "beta.limit.paddle":
    "Níl fíoríocaíochtaí réidh do sheoladh íoctha ginearálta. Tá cumraíocht bhosca gainimh Stripe agus seiceálacha shaolré na bhfíoríocaíochtaí fós ar feitheamh.",
  "beta.limit.wordpress":
    "Tá an nascóir WordPress tógtha, ach teastaíonn tástáil ar líne le suíomh fíor fós.",
  "beta.limit.shopify":
    "Tá an nascóir Shopify tógtha, ach teastaíonn tástáil ar líne le siopa fíor fós.",
  "beta.limit.aiCandidate":
    "Teastaíonn cumraíocht timpeallachta ón tsamhail IS mhalartach (iarrthóir meastóireachta) roimh sheoladh.",
  "beta.limit.legal":
    "Is dréachtaí ullmhachta béite iad na leathanaigh dhlíthiúla agus ba cheart iad a athbhreithniú roimh sheoladh íoctha níos leithne.",
  "beta.limit.analytics":
    "Chun imeachtaí a fháil, teastaíonn mír chóid Milo suiteáilte ar shuíomh an chliaint ón anailísíocht.",
  "beta.limit.gsc":
    "Tacaíonn GSC Lite le hiompórtáil CSV de láimh agus le sioncronú roghnach OAuth/API nuair atá Google OAuth cumraithe. Fanann iompórtáil de láimh ar fáil mar rogha chúltaca.",
  "beta.limit.images":
    "Is féidir tagairtí íomhá athbhreithnithe a chur san áireamh san fhoilsiú. Teastaíonn seiceálacha ar shuíomhanna fíora do gach nascóir fós d’aistriú íomhánna, do phríomhíomhánna agus don leagan amach deiridh.",
  "beta.demo.rankings":
    "Ná geall suíomhanna, trácht ná luanna ráthaithe in IS — oibríonn Milo le cúnamh IS agus déanann daoine athbhreithniú ar a chuid oibre.",
  "beta.demo.payments":
    "Mínigh gurb é Stripe an soláthraí íocaíochta roghnaithe agus nach bhfuil fíorú an tsocraithe agus shaolré na n-íocaíochtaí críochnaithe. Ná cuir íocaíochtaí i láthair mar ghníomhach.",
  "beta.demo.connectors":
    "Luaigh go dteastaíonn tástáil iomlán ar líne ar gach suíomh do nascóirí WordPress agus Shopify.",
  "beta.demo.data":
    "Luaigh go mbraitheann fianaise anailísíochta agus GSC ar infhaighteacht sonraí sa tionscadal taispeána.",
};
