/** Irish authoring only; not registered in the runtime or language picker.
 * `backlinks.gapNote` and `backlinks.integrity.*` follow `backlink-integrity.ts`;
 * `linknet.policyNote` and `linknet.reciprocalWarn` follow `link-network-copy.ts`. */
export const gaLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Líonra fáis nasc",
  "linknet.subtitle":
    "Faigh meaitseálacha le suíomhanna oiriúnacha i líonra Milo, seol teachtaireacht réamhráite phearsanta agus lig do Milo a fhíorú go bhfuil an nasc foilsithe i ndáiríre.",
  "linknet.policyNote":
    "Ábharthacht ar dtús: teastaíonn téamaí comhroinnte le haghaidh meaitseálacha, marcáiltear malartuithe nasc díreacha, agus ní chuirtear aon rud i bhfeidhm go huathoibríoch. Ní ráthaíonn na seiceálacha seo comhlíonadh beartas inneall cuardaigh.",
  "linknet.topics": "Téamaí",
  "linknet.topicsPlaceholder": "Téamaí (scartha le camóga)",
  "linknet.contact": "Ríomhphost teagmhála",
  "linknet.contactPlaceholder": "Ríomhphost teagmhála do chomhpháirtithe",
  "linknet.join": "Téigh isteach sa líonra",
  "linknet.update": "Nuashonraigh an liostú",
  "linknet.pause": "Cuir ar sos",
  "linknet.joined": "Liostaithe — is féidir le comhpháirtithe an suíomh seo a aimsiú anois.",
  "linknet.paused": "Cuireadh an liostú ar sos.",
  "linknet.find": "Aimsigh comhpháirtithe",
  "linknet.noMatches":
    "Níl comhpháirtithe oiriúnacha ann fós — fásann an líonra le gach suíomh Milo a théann isteach.",
  "linknet.score": "Oiriúnacht",
  "linknet.copyIntro": "Cóipeáil an ríomhphost réamhráite",
  "linknet.introCopied": "Cóipeáladh an teachtaireacht réamhráite — greamaigh i do ríomhphost í.",
  "linknet.markContacted": "Marcáil mar déanta teagmháil",
  "linknet.markAgreed": "Marcáil mar comhaontaithe",
  "linknet.decline": "Diúltaigh",
  "linknet.targetUrlPlaceholder": "URL an leathanaigh chomhaontaithe (áit a mbeidh an nasc)",
  "linknet.verify": "Fíoraigh an nasc",
  "linknet.verified": "Aimsíodh an nasc — tá an socrúchán foilsithe agus fíoraithe.",
  "linknet.notFound": "Níor aimsíodh an nasc ar an leathanach seo fós — seiceáilte agus taifeadta.",
  "linknet.liveSince": "Foilsithe ó",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "An tseiceáil dheireanach: níor aimsíodh an nasc",
  "linknet.reciprocalWarn":
    "Chruthódh sé seo malartú nasc díreach leis an suíomh seo. Athbhreithnigh a ábharthacht agus seachain malartuithe iomarcacha.",
  "linknet.status.suggested": "Molta",
  "linknet.status.contacted": "Déanta teagmháil",
  "linknet.status.agreed": "Comhaontaithe",
  "linknet.status.live_verified": "Foilsithe ✓",
  "linknet.status.declined": "Diúltaithe",
  "backlinks.title": "Naisc isteach",
  "backlinks.subtitle":
    "Fíorshonraí nasc isteach do d’fhearann — neart na próifíle, bearnaí nasc i gcomparáid le hiomaitheoirí agus moltaí sábháilte chun naisc a thógáil.",
  "backlinks.disclaimer":
    "Tagann méadrachtaí nasc isteach ó innéacs seachtrach nasc agus is meastacháin iad — ní fheiceann aon innéacs gach nasc. Is moltaí macánta (white-hat) amháin iad na moltaí: ní mholann Milo scéimeanna nasc ná naisc íoctha gan nochtadh riamh agus ní ráthaíonn sé suíomhanna, trácht ná ioncam.",
  "backlinks.run": "Rith anailís nasc isteach",
  "backlinks.rerun": "Athnuaigh an anailís",
  "backlinks.running": "Anailís ar siúl…",
  "backlinks.empty":
    "Rith anailís nasc isteach chun fíorphróifíl nasc d’fhearainn a fheiceáil, conas a sheasann sí i gcomparáid le hiomaitheoirí, agus na fearainn a nascann leo ach ní leatsa.",
  "backlinks.notConfigured.title": "Nasc foinse sonraí nasc isteach",
  "backlinks.notConfigured.body":
    "Úsáideann an modúl seo innéacs nasc isteach DataForSEO, nach bhfuil nasctha fós. Ní mór d’úinéir an spáis oibre cuntas DataForSEO a chruthú (íoc de réir úsáide) agus DATAFORSEO_LOGIN agus DATAFORSEO_PASSWORD a chur leis mar rúin ar thaobh an fhreastalaí. Go dtí sin, níl sonraí nasc isteach ar fáil.",
  "backlinks.status.ready.title": "Tá DataForSEO ag obair",
  "backlinks.status.ready.body": "Tá an Backlinks API nasctha agus ag freagairt.",
  "backlinks.status.lowBalance.title": "Tá iarmhéid DataForSEO íseal",
  "backlinks.status.lowBalance.body":
    "Cuir leis an iarmhéid go luath ionas nach gcuirfear isteach ar anailísí.",
  "backlinks.status.paused.title": "Tá rochtain DataForSEO ar sos",
  "backlinks.status.paused.body":
    "Roimh an gcéad anailís eile, déan teagmháil le tacaíocht DataForSEO chun an cuntas a athghníomhachtú.",
  "backlinks.status.error.title": "Níl stádas DataForSEO ar fáil",
  "backlinks.status.error.body":
    "Níorbh fhéidir an cuntas ná an Backlinks API a sheiceáil. Athnuaigh an stádas nó seiceáil painéal an tsoláthraí.",
  "backlinks.status.balance": "Iarmhéid: {balance}.",
  "backlinks.status.refresh": "Athnuaigh an stádas",
  "backlinks.competitorsUsed": "Iomaitheoirí i gcomparáid: {list}",
  "backlinks.competitorsFromAnalysis":
    "Iomaitheoirí ón anailís iomaitheoirí is déanaí á n-úsáid: {list}",
  "backlinks.noCompetitors":
    "Níl URLanna iomaitheoirí sa tionscadal seo — ní chlúdóidh an anailís ach do phróifíl féin. Cuir iomaitheoirí leis i socrú an tionscadail nó sa mhodúl iomaitheoirí chun bearnaí nasc a fheiceáil.",
  "backlinks.lastRun": "An anailís dheireanach: {date}",
  "backlinks.score.overall": "Seasamh nasc",
  "backlinks.score.profile": "Neart na próifíle",
  "backlinks.score.gap": "Bearna i gcomparáid le hiomaitheoirí",
  "backlinks.score.quality": "Cáilíocht nasc",
  "backlinks.gapHint": "níos airde = níos mó le gnóthú",
  "backlinks.summaryHeading": "Achoimre",
  "backlinks.topActions": "Príomhghníomhartha nasc",
  "backlinks.profileTable": "D’fhearann i gcomparáid le hiomaitheoirí",
  "backlinks.table.domain": "Fearann",
  "backlinks.table.rank": "Rangú fearainn",
  "backlinks.table.backlinks": "Naisc isteach",
  "backlinks.table.referringDomains": "Fearainn atreoraithe",
  "backlinks.table.broken": "Briste",
  "backlinks.table.spam": "Scór turscair",
  "backlinks.table.notFetched": "Níorbh fhéidir na sonraí a fháil",
  "backlinks.you": "Tusa",
  "backlinks.gapHeading": "Bearna nasc — nascann siad le hiomaitheoirí, ní leatsa",
  "backlinks.gapNote":
    "Sampla ó innéacs an tsoláthraí a iarradh agus d’fhearann eisiata. Ní fhíoraíonn sé go neamhspleách nach nascann na suíomhanna seo leatsa.",
  "backlinks.gap.linksTo": "Nascann le",
  "backlinks.gapEmpty":
    "Níor aimsíodh aon bhearnaí nasc — níor fuarthas sonraí iomaitheoirí nó ní raibh aon fhorluí ann.",
  "backlinks.referringHeading": "Na príomhfhearainn a nascann leatsa",
  "backlinks.referringEmpty":
    "Níor aimsíodh fearainn atreoraithe san innéacs fós — is minic a thosaíonn fearann nua ó náid.",
  "backlinks.recommendations": "Moltaí",
  "backlinks.effort": "Iarracht",
  "backlinks.target": "Sprioc / ardán",
  "backlinks.approach": "Cur chuige",
  "backlinks.action.convert": "Cruthaigh deis",
  "backlinks.action.converted": "Cruthaíodh an deis",
  "backlinks.action.convertTop": "Tiontaigh na príomhmholtaí",
  "backlinks.toast.done": "Críochnaíodh an anailís nasc isteach",
  "backlinks.toast.converted": "Cruthaíodh an deis",
  "backlinks.toast.convertedTop": "Deiseanna cruthaithe: {count}",
  "backlinks.category.linkGapTargets": "Spriocanna bearnaí nasc",
  "backlinks.category.contentForLinks": "Ábhar le haghaidh nasc",
  "backlinks.category.digitalPr": "Caidreamh poiblí digiteach",
  "backlinks.category.partnerships": "Comhpháirtíochtaí agus urraíocht",
  "backlinks.category.directories": "Eolairí agus próifílí",
  "backlinks.category.linkHygiene": "Sláinteachas nasc",
  "backlinks.integrity.partial": "Méadrachtaí páirteacha",
  "backlinks.integrity.source":
    "Foinse dhearbhaithe: innéacs DataForSEO do na fearainn a thaispeántar ar dháta na hanailíse sábháilte, lena n-áirítear fofhearainn. Ní fíorú neamhspleách iad lipéid foinse i sonraí sábháilte an spáis oibre. Ciallaíonn — “níl sé ar fáil”, ní náid riamh. Níl clúdach an innéacs iomlán; ní seiceálacha fíor-ama ar chinn scríbe iad seo.",
  "backlinks.integrity.legacy":
    "Anailís oidhreachta sábháilte. D’fhéadfadh normalú níos luaithe sonraí a bhí ar iarraidh a dhéanamh ina náideanna, mar sin níl a bonn uimhriúil ar fáil. Fanann na moltaí bunaidh mar chomhairle stairiúil.",
  "backlinks.integrity.scores":
    "Is meastacháin IS iad scóir agus moltaí ón bhfianaise atá ar fáil, ní tomhais soláthraí, ráthaíochtaí suímh ná torthaí tomhaiste.",
  "backlinks.integrity.sample":
    "Sampla teoranta de na fearainn is mó. Ní chruthaíonn fearainn fágtha ar lár go bhfuil naisc as láthair nó caillte; ní sholáthraítear monatóireacht leanúnach.",
  "backlinks.integrity.failed":
    "Theip ar an iarratas. Níl an tábla seo ar fáil; ní chiallaíonn sé náid nasc isteach ná easpa bearnaí nasc.",
  "backlinks.integrity.not_requested":
    "Níor iarradh sampla na mbearnaí mar nár soláthraíodh aon fhearainn iomaitheoirí.",
  "backlinks.integrity.unknown": "Níl stádas bhailiú sonraí an tábla seo ar eolas.",
  "backlinks.integrity.empty":
    "Níl aon sraitheanna le taispeáint. Sula ndéanann tú léirmhíniú ar an tábla seo, seiceáil stádas bhailiú na sonraí thuas.",
  "marketplace.title": "Foilseacháin urraithe",
  "marketplace.subtitle":
    "Meaitseáil deiseanna nasc isteach le socrúcháin urraithe trédhearcacha athbhreithnithe go heagarthóireachta.",
  "marketplace.disclosureTitle": "Margadh macánta (white-hat).",
  "marketplace.disclosure":
    'Teastaíonn nochtadh soiléir urraíochta agus rel="sponsored" do gach iarratas. Ní ceannach é iarratas agus ní ráthaíonn sé suíomhanna, trácht ná ioncam riamh.',
  "marketplace.demoNoticeTitle": "Catalóg réamhamhairc.",
  "marketplace.demoNotice":
    "Is sonraí taispeána iad na fearainn, na méadrachtaí agus na praghsanna thíos fad atá rochtain ar Linkhouse API ar feitheamh. Ní shábháiltear iarratais ach le haghaidh athbhreithnithe in Milo; ní chruthaítear aon ordú ná íocaíocht leis an soláthraí.",
  "marketplace.demoBadge": "Taispeántas",
  "marketplace.integrationTitle": "Comhtháthú Linkhouse",
  "marketplace.integrationLive":
    "Tá catalóg an tsoláthraí nasctha. Teastaíonn deimhniú ar an iomlán cruinn fós do gach ordú íoctha.",
  "marketplace.integrationPending":
    "Tá conradh an táirgthe réidh; tá mapáil na gcríochphointí agus na dintiúir ag fanacht le doiciméadú Linkhouse.",
  "marketplace.catalogConnected": "Catalóg bheo",
  "marketplace.catalogDemo": "Catalóg taispeána",
  "marketplace.orderingEnabled": "Ordú ar siúl",
  "marketplace.orderingLocked": "Ordú blocáilte",
  "marketplace.offers": "Tairiscintí",
  "marketplace.orders": "Iarratais",
  "marketplace.search": "Cuardaigh fearainn nó téamaí…",
  "marketplace.noAnalysis":
    "Rith anailís nasc isteach chun comharthaí bearnaí nasc a chur leis an meaitseáil. Tá meaitseáil de réir téama agus margaidh gníomhach cheana.",
  "marketplace.reason.linkGap": "Bearna nasc i gcomparáid le hiomaitheoirí",
  "marketplace.rank": "Rangú fearainn",
  "marketplace.traffic": "Trácht measta",
  "marketplace.turnaround": "Am seachadta",
  "marketplace.days": "{count} lá",
  "marketplace.price": "Praghas táscach",
  "marketplace.request": "Iarr athbhreithniú",
  "marketplace.reviewPrice": "Athbhreithnigh an praghas",
  "marketplace.quoteLocked": "Teastaíonn socrú luachana",
  "marketplace.requested": "Iarrtha",
  "marketplace.quoteTitle": "Athbhreithnigh praghas an fhoilseacháin",
  "marketplace.basePrice": "Praghas an tsoláthraí",
  "marketplace.serviceFee": "Táille seirbhíse Milo ({count}%)",
  "marketplace.totalPrice": "Iomlán cruinn",
  "marketplace.quoteExpires":
    "Tá an luachan seo bailí go dtí {time}. Teastaíonn luachan nua ina dhiaidh sin.",
  "marketplace.confirmSponsored":
    'Éilím nochtadh soiléir urraíochta agus rel="sponsored" nó nofollow don nasc.',
  "marketplace.confirmPaymentLive":
    "Údaraím go follasach ordú soláthraí don iomlán cruinn €{total}.",
  "marketplace.confirmPaymentDemo":
    "Deimhním iarratas athbhreithnithe ar €{total} agus tuigim nach gcruthaíonn an mód taispeána ordú soláthraí ná íocaíocht.",
  "marketplace.confirmPurchase": "Deimhnigh an t-ordú íoctha",
  "marketplace.confirmDemoRequest": "Sábháil an t-iarratas athbhreithnithe",
  "marketplace.confirmedAt": "Deimhnithe",
  "marketplace.ordersEmpty": "Níl iarratais foilseacháin ann fós.",
  "marketplace.toast.exists": "Tá iarratas gníomhach ag an tairiscint seo cheana.",
  "marketplace.toast.requested":
    "Sábháladh an t-iarratas foilseacháin le haghaidh athbhreithnithe.",
  "marketplace.toast.submitted": "Seoladh an t-ordú íoctha chuig an soláthraí.",
  "marketplace.toast.catalogError":
    "Níorbh fhéidir catalóg an tsoláthraí a athnuachan. Tá an chatalóg taispeána shábháilte ar fáil fós.",
  "marketplace.toast.quoteError": "Níorbh fhéidir an luachan a ullmhú. Bain triail eile as.",
  "marketplace.toast.quoteExpired":
    "Chuaigh an luachan in éag. Iarr praghas nua sula ndeimhníonn tú.",
  "marketplace.toast.orderError": "Níor cruthaíodh an t-ordú. Níor gearradh aon íocaíocht.",
  "marketplace.toast.orderReview":
    "Níorbh fhéidir toradh an tsoláthraí a dheimhniú. Shábháil Milo an t-iarratas mar “Faoi athbhreithniú”; ná déan arís é go dtí go réitítear é.",
  "marketplace.status.Requested": "Iarrtha",
  "marketplace.status.In Review": "Faoi athbhreithniú",
  "marketplace.status.Submitted": "Curtha isteach",
  "marketplace.status.Accepted": "Glactha",
  "marketplace.status.Published": "Foilsithe",
  "marketplace.status.Failed": "Theip air",
  "marketplace.status.Cancelled": "Cealaithe",
};
