/** Maltese authoring only; not registered in the runtime or language picker.
 * `backlinks.gapNote` and `backlinks.integrity.*` follow `backlink-integrity.ts`;
 * `linknet.policyNote` and `linknet.reciprocalWarn` follow `link-network-copy.ts`. */
export const mtLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Netwerk tat-tkabbir tal-links",
  "linknet.subtitle":
    "Ikseb qbil ma’ siti xierqa fin-netwerk ta’ Milo, ibgħat messaġġ personali ta’ introduzzjoni u ħalli lil Milo jivverifika jekk il-link hijiex verament ippubblikata.",
  "linknet.policyNote":
    "Ir-rilevanza l-ewwel: il-qbil jeħtieġ temi komuni, l-iskambji diretti tal-links jiġu mmarkati, u xejn ma jiġi ppubblikat awtomatikament. Dawn il-verifiki ma jiggarantixxux il-konformità mal-politiki tal-magni tat-tfittxija.",
  "linknet.topics": "Temi",
  "linknet.topicsPlaceholder": "Temi (separati b’virgoli)",
  "linknet.contact": "Email ta’ kuntatt",
  "linknet.contactPlaceholder": "Email ta’ kuntatt għas-sħab",
  "linknet.join": "Ingħaqad man-netwerk",
  "linknet.update": "Aġġorna l-elenkar",
  "linknet.pause": "Issospendi",
  "linknet.joined": "Elenkat — is-sħab issa jistgħu jsibu dan is-sit.",
  "linknet.paused": "L-elenkar ġie sospiż.",
  "linknet.find": "Sib sħab",
  "linknet.noMatches":
    "Għad m’hemmx sħab li jaqblu — in-netwerk jikber ma’ kull sit ta’ Milo li jingħaqad.",
  "linknet.score": "Qbil",
  "linknet.copyIntro": "Ikkopja l-email tal-introduzzjoni",
  "linknet.introCopied": "Il-messaġġ tal-introduzzjoni ġie kkupjat — waħħlu fl-email tiegħek.",
  "linknet.markContacted": "Immarka bħala kkuntattjat",
  "linknet.markAgreed": "Immarka bħala miftiehem",
  "linknet.decline": "Iċħad",
  "linknet.targetUrlPlaceholder": "URL tal-paġna miftiehma (fejn se tkun il-link)",
  "linknet.verify": "Ivverifika l-link",
  "linknet.verified": "Il-link instabet — il-pożizzjonament huwa ppubblikat u vverifikat.",
  "linknet.notFound": "Il-link għadha ma nstabitx f’din il-paġna — iċċekkjat u rreġistrat.",
  "linknet.liveSince": "Ippubblikata minn",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "L-aħħar verifika: il-link ma nstabitx",
  "linknet.reciprocalWarn":
    "Dan joħloq skambju dirett ta’ links ma’ dan is-sit. Irrevedi r-rilevanza tiegħu u evita skambji eċċessivi.",
  "linknet.status.suggested": "Issuġġerit",
  "linknet.status.contacted": "Ikkuntattjat",
  "linknet.status.agreed": "Miftiehem",
  "linknet.status.live_verified": "Ippubblikat ✓",
  "linknet.status.declined": "Miċħud",
  "backlinks.title": "Ħoloq minn siti oħra",
  "backlinks.subtitle":
    "Dejta reali dwar il-ħoloq minn siti oħra għad-dominju tiegħek — is-saħħa tal-profil, in-nuqqasijiet fil-links meta mqabbla mal-kompetituri u rakkomandazzjonijiet sikuri għall-bini tal-links.",
  "backlinks.disclaimer":
    "Il-metriċi tal-ħoloq minn siti oħra ġejjin minn indiċi estern tal-links u huma stimi — l-ebda indiċi ma jara l-links kollha. Ir-rakkomandazzjonijiet huma biss suġġerimenti onesti (white-hat): Milo qatt ma jissuġġerixxi skemi ta’ links jew links imħallsa mhux żvelati u ma jiggarantixxix pożizzjonijiet, traffiku jew dħul.",
  "backlinks.run": "Agħmel analiżi tal-ħoloq minn siti oħra",
  "backlinks.rerun": "Aġġorna l-analiżi",
  "backlinks.running": "Qed issir l-analiżi…",
  "backlinks.empty":
    "Agħmel analiżi tal-ħoloq minn siti oħra biex tara l-profil reali tal-links tad-dominju tiegħek, kif iqabbel mal-kompetituri u d-dominji li jorbtu magħhom iżda mhux miegħek.",
  "backlinks.notConfigured.title": "Qabbad sors tad-dejta tal-ħoloq minn siti oħra",
  "backlinks.notConfigured.body":
    "Dan il-modulu juża l-indiċi tal-ħoloq ta’ DataForSEO, li għadu mhux konness. Is-sid tal-ispazju tax-xogħol irid joħloq kont DataForSEO (tħallas skont l-użu) u jżid DATAFORSEO_LOGIN u DATAFORSEO_PASSWORD bħala sigrieti fuq in-naħa tas-server. Sa dakinhar, id-dejta tal-ħoloq minn siti oħra mhijiex disponibbli.",
  "backlinks.status.ready.title": "DataForSEO qed jaħdem",
  "backlinks.status.ready.body": "Il-Backlinks API huwa konness u qed iwieġeb.",
  "backlinks.status.lowBalance.title": "Il-bilanċ ta’ DataForSEO huwa baxx",
  "backlinks.status.lowBalance.body":
    "Imla l-bilanċ dalwaqt biex l-analiżijiet ma jiġux interrotti.",
  "backlinks.status.paused.title": "L-aċċess għal DataForSEO huwa sospiż",
  "backlinks.status.paused.body":
    "Qabel l-analiżi li jmiss, ikkuntattja l-appoġġ ta’ DataForSEO biex jerġa’ jiġi attivat il-kont.",
  "backlinks.status.error.title": "L-istatus ta’ DataForSEO mhuwiex disponibbli",
  "backlinks.status.error.body":
    "Il-kont jew il-Backlinks API ma setgħux jiġu ċċekkjati. Aġġorna l-istatus jew iċċekkja d-dashboard tal-fornitur.",
  "backlinks.status.balance": "Bilanċ: {balance}.",
  "backlinks.status.refresh": "Aġġorna l-istatus",
  "backlinks.competitorsUsed": "Kompetituri mqabbla: {list}",
  "backlinks.competitorsFromAnalysis":
    "Qed jintużaw il-kompetituri mill-aħħar analiżi tal-kompetituri: {list}",
  "backlinks.noCompetitors":
    "Dan il-proġett m’għandux URLs tal-kompetituri — l-analiżi tkopri biss il-profil tiegħek. Żid kompetituri fil-konfigurazzjoni tal-proġett jew fil-modulu tal-kompetituri biex tara n-nuqqasijiet fil-links.",
  "backlinks.lastRun": "L-aħħar analiżi: {date}",
  "backlinks.score.overall": "Pożizzjoni tal-links",
  "backlinks.score.profile": "Saħħa tal-profil",
  "backlinks.score.gap": "Nuqqas meta mqabbel mal-kompetituri",
  "backlinks.score.quality": "Kwalità tal-links",
  "backlinks.gapHint": "ogħla = aktar x’jista’ jinkiseb",
  "backlinks.summaryHeading": "Sommarju",
  "backlinks.topActions": "Azzjonijiet ewlenin tal-links",
  "backlinks.profileTable": "Id-dominju tiegħek meta mqabbel mal-kompetituri",
  "backlinks.table.domain": "Dominju",
  "backlinks.table.rank": "Klassifikazzjoni tad-dominju",
  "backlinks.table.backlinks": "Ħoloq minn siti oħra",
  "backlinks.table.referringDomains": "Dominji li jirreferu",
  "backlinks.table.broken": "Miksura",
  "backlinks.table.spam": "Punteġġ tal-ispam",
  "backlinks.table.notFetched": "Id-dejta ma setgħetx tinġabar",
  "backlinks.you": "Int",
  "backlinks.gapHeading": "Nuqqas fil-links — jorbtu mal-kompetituri, mhux miegħek",
  "backlinks.gapNote":
    "Kampjun mill-indiċi tal-fornitur mitlub billi jiġi eskluż id-dominju tiegħek. Ma jivverifikax b’mod indipendenti li dawn is-siti ma jorbtux miegħek.",
  "backlinks.gap.linksTo": "Jorbot ma’",
  "backlinks.gapEmpty":
    "Ma nstabu l-ebda nuqqasijiet fil-links — jew id-dejta tal-kompetituri ma nġabritx, jew ma kienx hemm koinċidenza.",
  "backlinks.referringHeading": "L-aqwa dominji li jorbtu miegħek",
  "backlinks.referringEmpty":
    "Għadhom ma nstabux dominji li jirreferu fl-indiċi — dominju ġdid spiss jibda miż-żero.",
  "backlinks.recommendations": "Rakkomandazzjonijiet",
  "backlinks.effort": "Sforz",
  "backlinks.target": "Mira / pjattaforma",
  "backlinks.approach": "Approċċ",
  "backlinks.action.convert": "Oħloq opportunità",
  "backlinks.action.converted": "L-opportunità nħolqot",
  "backlinks.action.convertTop": "Ibdel ir-rakkomandazzjonijiet ewlenin",
  "backlinks.toast.done": "L-analiżi tal-ħoloq minn siti oħra tlestiet",
  "backlinks.toast.converted": "L-opportunità nħolqot",
  "backlinks.toast.convertedTop": "Opportunitajiet maħluqa: {count}",
  "backlinks.category.linkGapTargets": "Miri tan-nuqqasijiet fil-links",
  "backlinks.category.contentForLinks": "Kontenut għal-links",
  "backlinks.category.digitalPr": "PR diġitali",
  "backlinks.category.partnerships": "Sħubijiet u sponsorizzazzjoni",
  "backlinks.category.directories": "Direttorji u profili",
  "backlinks.category.linkHygiene": "Iġjene tal-links",
  "backlinks.integrity.partial": "Metriċi parzjali",
  "backlinks.integrity.source":
    "Sors iddikjarat: l-indiċi ta’ DataForSEO għad-dominji murija fid-data tal-analiżi ssejvjata, inklużi s-sottodominji. It-tikketti tas-sors fid-dejta ssejvjata tal-ispazju tax-xogħol mhumiex verifika indipendenti. — ifisser “mhux disponibbli”, qatt żero. Il-kopertura tal-indiċi mhijiex kompluta; dawn mhumiex verifiki f’ħin reali tad-destinazzjonijiet.",
  "backlinks.integrity.legacy":
    "Analiżi preċedenti ssejvjata. In-normalizzazzjoni ta’ qabel setgħet biddlet dejta nieqsa f’żero, għalhekk il-bażi numerika tagħha mhijiex disponibbli. Ir-rakkomandazzjonijiet oriġinali jibqgħu parir storiku.",
  "backlinks.integrity.scores":
    "Il-punteġġi u r-rakkomandazzjonijiet huma stimi tal-IA mill-evidenza disponibbli, mhux kejl tal-fornitur, garanziji ta’ pożizzjonijiet jew riżultati mkejla.",
  "backlinks.integrity.sample":
    "Kampjun limitat tal-aktar dominji popolari. Dominji mħollija barra ma jagħtux prova ta’ nuqqas jew telf ta’ links; ma jiġix ipprovdut monitoraġġ kontinwu.",
  "backlinks.integrity.failed":
    "It-talba falliet. Din it-tabella mhijiex disponibbli; ma tfissirx żero ħoloq minn siti oħra jew l-ebda nuqqas fil-links.",
  "backlinks.integrity.not_requested":
    "Il-kampjun tan-nuqqasijiet ma ntalabx għax ma ġie pprovdut l-ebda dominju tal-kompetituri.",
  "backlinks.integrity.unknown": "L-istatus tal-ġbir tad-dejta ta’ din it-tabella mhuwiex magħruf.",
  "backlinks.integrity.empty":
    "M’hemm l-ebda ringiela x’turi. Qabel tinterpreta din it-tabella, iċċekkja l-istatus tal-ġbir tad-dejta indikat hawn fuq.",
  "marketplace.title": "Pubblikazzjonijiet sponsorizzati",
  "marketplace.subtitle":
    "Qabbel l-opportunitajiet tal-ħoloq minn siti oħra ma’ pożizzjonamenti sponsorizzati trasparenti u riveduti editorjalment.",
  "marketplace.disclosureTitle": "Suq onest (white-hat).",
  "marketplace.disclosure":
    'Kull talba teħtieġ żvelar ċar tal-isponsorizzazzjoni u rel="sponsored". Talba mhijiex xiri u qatt ma tiggarantixxi pożizzjonijiet, traffiku jew dħul.',
  "marketplace.demoNoticeTitle": "Katalgu ta’ previżjoni.",
  "marketplace.demoNotice":
    "Id-dominji, il-metriċi u l-prezzijiet hawn taħt huma dejta ta’ dimostrazzjoni waqt li qed jistenna l-aċċess għal-Linkhouse API. It-talbiet jinħażnu biss għar-reviżjoni f’Milo; ma tinħoloq l-ebda ordni jew ħlas mal-fornitur.",
  "marketplace.demoBadge": "Demo",
  "marketplace.integrationTitle": "Integrazzjoni ma’ Linkhouse",
  "marketplace.integrationLive":
    "Il-katalgu tal-fornitur huwa konness. Kull ordni mħallsa xorta teħtieġ konferma tat-total eżatt.",
  "marketplace.integrationPending":
    "Il-kuntratt tal-produzzjoni huwa lest; il-mapping tal-endpoints u l-kredenzjali qed jistennew id-dokumentazzjoni ta’ Linkhouse.",
  "marketplace.catalogConnected": "Katalgu attiv",
  "marketplace.catalogDemo": "Katalgu ta’ dimostrazzjoni",
  "marketplace.orderingEnabled": "L-ordnijiet mixgħula",
  "marketplace.orderingLocked": "L-ordnijiet imblukkati",
  "marketplace.offers": "Offerti",
  "marketplace.orders": "Talbiet",
  "marketplace.search": "Fittex dominji jew temi…",
  "marketplace.noAnalysis":
    "Agħmel analiżi tal-ħoloq minn siti oħra biex iżżid sinjali tan-nuqqasijiet fil-links mal-qbil. Il-qbil skont it-tema u s-suq diġà huwa attiv.",
  "marketplace.reason.linkGap": "Nuqqas fil-links meta mqabbel mal-kompetituri",
  "marketplace.rank": "Klassifikazzjoni tad-dominju",
  "marketplace.traffic": "Traffiku stmat",
  "marketplace.turnaround": "Żmien ta’ twassil",
  "marketplace.days": "{count} jum",
  "marketplace.price": "Prezz indikattiv",
  "marketplace.request": "Itlob reviżjoni",
  "marketplace.reviewPrice": "Irrevedi l-prezz",
  "marketplace.quoteLocked": "Meħtieġa konfigurazzjoni tal-kwotazzjoni",
  "marketplace.requested": "Mitlub",
  "marketplace.quoteTitle": "Irrevedi l-prezz tal-pubblikazzjoni",
  "marketplace.basePrice": "Prezz tal-fornitur",
  "marketplace.serviceFee": "Tariffa tas-servizz ta’ Milo ({count}%)",
  "marketplace.totalPrice": "Total eżatt",
  "marketplace.quoteExpires":
    "Din il-kwotazzjoni hija valida sa {time}. Wara dak il-ħin tkun meħtieġa kwotazzjoni ġdida.",
  "marketplace.confirmSponsored":
    'Jiena nitlob żvelar ċar tal-isponsorizzazzjoni u rel="sponsored" jew nofollow għal-link.',
  "marketplace.confirmPaymentLive":
    "Jiena nawtorizza b’mod espliċitu ordni mal-fornitur għat-total eżatt ta’ €{total}.",
  "marketplace.confirmPaymentDemo":
    "Jiena nikkonferma talba ta’ reviżjoni għal €{total} u nifhem li l-modalità ta’ dimostrazzjoni ma toħloqx ordni jew ħlas mal-fornitur.",
  "marketplace.confirmPurchase": "Ikkonferma l-ordni mħallsa",
  "marketplace.confirmDemoRequest": "Issejvja t-talba ta’ reviżjoni",
  "marketplace.confirmedAt": "Ikkonfermat",
  "marketplace.ordersEmpty": "Għad m’hemmx talbiet għal pubblikazzjonijiet.",
  "marketplace.toast.exists": "Din l-offerta diġà għandha talba attiva.",
  "marketplace.toast.requested": "It-talba għall-pubblikazzjoni ġiet issejvjata għar-reviżjoni.",
  "marketplace.toast.submitted": "L-ordni mħallsa ntbagħtet lill-fornitur.",
  "marketplace.toast.catalogError":
    "Il-katalgu tal-fornitur ma setax jiġi aġġornat. Il-katalgu sikur ta’ dimostrazzjoni għadu disponibbli.",
  "marketplace.toast.quoteError": "Il-kwotazzjoni ma setgħetx titħejja. Erġa’ pprova.",
  "marketplace.toast.quoteExpired": "Il-kwotazzjoni skadiet. Qabel tikkonferma, itlob prezz ġdid.",
  "marketplace.toast.orderError": "L-ordni ma nħolqitx. Ma sar l-ebda ħlas.",
  "marketplace.toast.orderReview":
    "Ir-riżultat tal-fornitur ma setax jiġi kkonfermat. Milo ssejvja t-talba bħala “Taħt reviżjoni”; tirrepetix sakemm tiġi rikonċiljata.",
  "marketplace.status.Requested": "Mitlub",
  "marketplace.status.In Review": "Taħt reviżjoni",
  "marketplace.status.Submitted": "Sottomess",
  "marketplace.status.Accepted": "Aċċettat",
  "marketplace.status.Published": "Ippubblikat",
  "marketplace.status.Failed": "Falla",
  "marketplace.status.Cancelled": "Ikkanċellat",
};
