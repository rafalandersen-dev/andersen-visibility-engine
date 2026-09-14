/** Maltese authoring only; not registered in the runtime or language picker.
 * `gsc.sourceApi`, `gsc.sourceCsv`, `gsc.rec.waitOrPromote` and `gsc.helper` follow
 * the `gsc-integrity` override. External admin paths stay in English. */
export const mtMeasurements: Readonly<Record<string, string>> = {
  "report.branding.title": "Branding tar-rapport (Agency)",
  "report.branding.note":
    "L-isem u l-logo tal-aġenzija tiegħek jidhru fil-PDF stampat u fl-email tar-rapport — il-brand ta’ Milo jibqa’ fl-isfond.",
  "report.branding.name": "Isem l-aġenzija",
  "report.branding.logoUrl": "URL tal-logo",
  "report.branding.save": "Issejvja l-branding",
  "report.branding.saved": "Il-branding ġie ssejvjat",
  "report.branding.saveFailed": "Il-branding ma setax jiġi ssejvjat",
  "report.footer.agency":
    "{agency}. Ibbażat fuq ir-riżultati tal-pubblikazzjoni ssejvjati. Dan ir-rapport ma jiċċekkjax mill-ġdid jekk il-paġni humiex ippubblikati bħalissa.",
  "report.title": "Rapport mensili tal-evidenza",
  "report.subtitle": "X’għamel Milo għalik dan ix-xahar — u x’jiġi wara.",
  "report.noProject": "Agħżel proġett biex tara r-rapport mensili tiegħu.",
  "report.downloadPdf": "Niżżel il-PDF",
  "report.emailMe": "Ibgħatli dan ir-rapport bl-email",
  "report.toast.emailed":
    "Ir-rapport ġie aċċettat għall-bgħit. Il-kunsinna għadha mhijiex ikkonfermata.",
  "report.toast.emailFailed": "L-email tar-rapport ma setgħetx tintbagħat",
  "report.toast.notConfigured": "Il-bgħit tal-emails għadu mhuwiex ikkonfigurat",
  "report.published.title": "Pubblikazzjonijiet irreġistrati ({count})",
  "report.published.note":
    "Ibbażat fuq ir-riżultati tal-pubblikazzjoni ssejvjati. Dan ir-rapport ma jiċċekkjax mill-ġdid jekk il-paġni humiex ippubblikati bħalissa.",
  "report.published.empty": "M’hemm l-ebda pubblikazzjoni rreġistrata għal dan ix-xahar.",
  "report.stat.drafted": "Abbozzi miktuba",
  "report.stat.scheduled": "Skedati",
  "report.stat.linksLive": "Links tas-sħab ippubblikati ✓",
  "report.stat.gscClicks": "Klikks ta’ GSC",
  "report.gsc.title": "Stampa tal-mument tat-tfittxija",
  "report.gsc.line":
    "Klikks: {clicks} · impressjonijiet: {impressions} · pożizzjoni medja: {position}",
  "report.gsc.importedAt": "Id-dejta ġiet importata {date}",
  "report.gsc.empty":
    "Qabbad Google Search Console fil-konfigurazzjonijiet biex tinkludi l-metriċi tat-tfittxija.",
  "report.plan.title": "Il-pjan tax-xahar id-dieħel ({count})",
  "report.plan.empty":
    "Għadu ma ġie skedat xejn — iftaħ il-paġna tal-pjan biex tippjana x-xahar id-dieħel.",
  "report.footer":
    "Milo Growth. Ibbażat fuq ir-riżultati tal-pubblikazzjoni ssejvjati. Dan ir-rapport ma jiċċekkjax mill-ġdid jekk il-paġni humiex ippubblikati bħalissa.",
  "analytics.title": "Analitika",
  "analytics.subtitle":
    "Traċċar tat-tkabbir tas-sit tal-ewwel parti — żjarat anonimi, l-aqwa paġni, prestazzjoni tal-kontenut ippubblikat u sinjali relatati mal-IA.",
  "analytics.refresh": "Aġġorna",
  "analytics.loading": "Qed titgħabba l-analitika…",
  "analytics.errorTitle": "L-analitika ma setgħetx titgħabba",
  "analytics.emptyTitle": "Għad m’hemmx dejta tal-analitika",
  "analytics.emptyDesc":
    "Żid is-snippet tal-kodiċi tat-traċċar fis-sit tiegħek u Milo jibda juri ż-żjarat, l-aqwa paġni, il-prestazzjoni tal-kontenut ippubblikat u s-sinjali relatati mal-IA.",
  "analytics.stat.visits30": "Żjarat (30 jum)",
  "analytics.stat.prev30": "It-30 jum ta’ qabel",
  "analytics.stat.growth": "Tkabbir",
  "analytics.stat.topPage": "L-aqwa paġna",
  "analytics.stat.aiSignals": "Sinjali relatati mal-IA",
  "analytics.stat.ctaBooking": "CTA / prenotazzjoni",
  "analytics.trend.label": "L-aħħar 30 jum",
  "analytics.trend.heading": "Żjarat kuljum",
  "analytics.topPages.heading": "L-aqwa paġni (30 jum)",
  "analytics.topPages.path": "Mogħdija",
  "analytics.topPages.views": "Viżwalizzazzjonijiet",
  "analytics.topPages.source": "Sors ewlieni",
  "analytics.topPages.aiSignals": "Sinjali tal-IA",
  "analytics.published.heading": "Prestazzjoni tal-kontenut ippubblikat",
  "analytics.published.content": "Kontenut",
  "analytics.published.cta": "CTA",
  "analytics.published.booking": "Prenotazzjoni",
  "analytics.published.livePage": "Paġna ppubblikata",
  "analytics.published.none":
    "Għadu ma ġie mqabbel l-ebda oġġett tal-kontenut ippubblikat. Ippubblika kontenut mill-editur u ż-żjarat fl-URL ippubblikat tiegħu jidhru hawn.",
  "analytics.ai.heading": "Traffiku riferut mill-IA",
  "analytics.ai.copy":
    "Żjarat fejn ir-referrer juri li l-viżitatur wasal minn għodda tal-IA (eż., ChatGPT, Perplexity) — dan huwa traffiku riferut mill-IA, mhux referenzi jew ċitazzjonijiet fl-IA. Jingħadd b’mod mhux komplut għax ħafna għodod tal-IA jaħbu r-referrer, u ma jfissirx li n-negozju tiegħek jissemma, jiġi kkwotat jew ikklassifikat f’dawn l-għodod. Ir-ringieli tal-crawlers/bots hawn taħt huma sinjali ta’ attività separati, mhux żjarat.",
  "analytics.ai.none": "Fl-aħħar 30 jum ma nstabu l-ebda żjarat riferuti mill-IA.",
  "analytics.ai.referral": "Żjara riferuta mill-IA",
  "analytics.ai.crawler": "Attività ta’ crawler tal-IA",
  "analytics.ai.searchBot": "Sinjal ta’ bot tal-IA/tat-tfittxija",
  "analytics.setup.label": "Konfigurazzjoni",
  "analytics.setup.heading": "Snippet tal-kodiċi tat-traċċar",
  "analytics.setup.addOnce":
    "Żidu darba fil-parti head/body tas-sit tiegħek biex tibda tittraċċa ż-żjarat.",
  "analytics.privacy":
    "Milo Analytics juża traċċar anonimu taż-żjarat u tal-avvenimenti. Ma jaħżinx ismijiet, indirizzi tal-email jew indirizzi IP sħaħ.",
  "analytics.setupFirst": "L-ewwel issettja proġett",
  "analytics.v2.growthProof": "Evidenza tat-tkabbir",
  "analytics.v2.whatChanged": "X’inbidel",
  "analytics.v2.nextAction": "L-azzjoni li jmiss",
  "analytics.v2.publishedByMilo": "Ippubblikat minn Milo",
  "analytics.v2.publishedByMiloDesc":
    "Kif qed imur il-kontenut ippubblikat b’Milo minn meta ġie ppubblikat.",
  "analytics.v2.publishedByMiloEmpty":
    "Għad m’hemmx paġni ppubblikati minn Milo. Ippubblika oġġett tal-kontenut biex tibda tkejjel il-prestazzjoni.",
  "analytics.v2.topGrowing": "Il-paġni li qed jikbru l-aktar malajr",
  "analytics.v2.needsAttention": "Jeħtieġ attenzjoni",
  "analytics.v2.needsAttentionEmpty": "Bħalissa xejn ma jeħtieġ attenzjoni.",
  "analytics.v2.stat.conversion": "Rata ta’ konverżjoni",
  "analytics.v2.stat.miloViews": "Viżwalizzazzjonijiet tal-paġni ta’ Milo",
  "analytics.v2.stat.bestPage": "L-aħjar paġna",
  "analytics.v2.stat.published": "Paġni ppubblikati",
  "analytics.v2.col.published": "Ippubblikat",
  "analytics.v2.col.viewsSince": "Viżwalizzazzjonijiet mill-pubblikazzjoni",
  "analytics.v2.col.conversion": "Konverżjoni",
  "analytics.v2.col.score": "Milo Score",
  "analytics.v2.col.recommendation": "Rakkomandazzjoni",
  "analytics.v2.col.page": "Paġna",
  "analytics.v2.col.growth": "Tkabbir",
  "analytics.v2.col.clicks": "Klikks",
  "analytics.v2.notEvaluated": "Mhux ivvalutat",
  "analytics.v2.daysAgo": "{days} jum ilu",
  "analytics.rec.keepMonitoring": "Kompli ssegwi",
  "analytics.rec.improveCta": "Ittejjeb is-CTA",
  "analytics.rec.addInternalLinks": "Żid links interni",
  "analytics.rec.createSupportingContent": "Oħloq kontenut ta’ appoġġ",
  "analytics.rec.sharePromote": "Aqsam / ippromwovi",
  "analytics.rec.reviewQuality": "Irrevedi l-Milo Score",
  "analytics.issue.noViews": "Għad m’hemmx viżwalizzazzjonijiet",
  "analytics.issue.noClicks": "Viżwalizzazzjonijiet, iżda l-ebda klikk",
  "analytics.issue.lowConversion": "Konverżjoni baxxa",
  "analytics.issue.lowQuality": "Milo Score baxx",
  "analytics.next.installSnippet":
    "Installa s-snippet tal-kodiċi ta’ Milo Analytics u żur is-sit tiegħek biex tiċċekkja t-traċċar.",
  "analytics.next.addInternalLinks":
    "Żid links interni lejn il-kontenut il-ġdid u aqsam il-paġna mill-paġni ewlenin tas-servizzi.",
  "analytics.next.improveCta": "Ittejjeb is-CTA u agħmel il-pass li jmiss aktar viżibbli.",
  "analytics.next.keepMonitoring":
    "Il-kontenut tiegħek qed jattira involviment. Kompli ssegwi u kkunsidra li toħloq artiklu ta’ appoġġ.",
  "analytics.next.aiClarity":
    "Għandek sinjali relatati mal-IA. Kompli ttejjeb it-tweġibiet ċari, il-kopertura tal-mistoqsijiet frekwenti u ċ-ċarezza tal-brand/tal-entità.",
  "gsc.title": "Search Console Lite",
  "gsc.subtitle":
    "Importa esportazzjoni CSV minn Google Search Console biex tgħaqqad l-impressjonijiet u l-klikks tat-tfittxija mal-kontenut ippubblikat minn Milo.",
  "gsc.file": "Fajl CSV",
  "gsc.label": "Tikketta / perjodu tad-dati",
  "gsc.labelPlaceholder": "eż., Mejju 2026",
  "gsc.import": "Importa",
  "gsc.importing": "Qed jiġi importat…",
  "gsc.helper":
    "Tabella waħda f’kull CSV, sa 1 000 ringiela u 2 MB. Uża deċimali mingħajr separaturi tal-eluf; is-CTR juża frazzjonijiet 0–1 jew suffiss % espliċitu. Qabel tissejvja, irrevedi l-proprjetà, id-dati u l-previżjoni.",
  "gsc.privacy":
    "Id-dejta importata tinħażen fl-ispazju tax-xogħol tiegħek f’Milo u tintuża biss biex turi l-prestazzjoni tas-SEO f’dan il-proġett.",
  "gsc.empty":
    "Id-dejta ta’ Search Console għadha mhijiex disponibbli. Qabbad Google Search Console hawn fuq jew esporta CSV u tellgħu hawn biex iżżid evidenza tas-SEO.",
  "gsc.sourceApi": "Sors API ddikjarat",
  "gsc.sourceCsv": "CSV ipprovdut mis-sid",
  "gsc.csvHeading": "Importazzjoni manwali ta’ CSV",
  "gsc.csvFallbackNote":
    "L-importazzjoni manwali ta’ CSV hija dejjem disponibbli. Is-sinkronizzazzjoni OAuth tħalli lil Milo jikseb direttament id-dejta tal-prestazzjoni ta’ Search Console wara li tqabbad proprjetà vverifikata.",
  "gsc.oauth.title": "Sinkronizzazzjoni ta’ Google Search Console",
  "gsc.oauth.notConfigured":
    "Is-sinkronizzazzjoni ta’ Google Search Console għadha mhijiex ikkonfigurata. Xorta tista’ tuża l-importazzjoni manwali ta’ CSV.",
  "gsc.oauth.ownerSetup.title": "Konfigurazzjoni ta’ darba mis-sid",
  "gsc.oauth.ownerSetup.intro":
    "Il-buttuna tal-konnessjoni tidher għall-utenti kollha meta dawn is-sigrieti tal-produzzjoni jiġu ssettjati f’Lovable Cloud (Settings → Secrets):",
  "gsc.oauth.ownerSetup.docs": "Gwida sħiħa: docs/GSC-OAUTH-SETUP.md fir-repożitorju.",
  "gsc.oauth.consent":
    "Milo jitlob biss aċċess għall-qari ta’ Search Console. Tista’ tiskonnettjah fi kwalunkwe ħin. Nużaw din id-dejta biex nuru l-prestazzjoni tat-tfittxija u l-opportunitajiet tal-kontenut fl-ispazju tax-xogħol tiegħek f’Milo.",
  "gsc.oauth.connect": "Qabbad Google Search Console",
  "gsc.oauth.disconnect": "Skonnettja Google Search Console",
  "gsc.oauth.reconnect": "Erġa’ qabbad",
  "gsc.oauth.account": "Kont",
  "gsc.oauth.chooseProperty":
    "Agħżel il-proprjetà ta’ Search Console li taqbel ma’ dan il-proġett.",
  "gsc.oauth.loadSites": "Tella’ s-siti",
  "gsc.oauth.selectProperty": "Agħżel proprjetà",
  "gsc.oauth.selectedProperty": "Proprjetà magħżula",
  "gsc.oauth.changeProperty": "Ibdel il-proprjetà",
  "gsc.oauth.selected": "Il-proprjetà ntgħażlet.",
  "gsc.oauth.selectError": "Din il-proprjetà ma setgħetx tintgħażel. Erġa’ pprova.",
  "gsc.oauth.sync28": "Issinkronizza l-aħħar 28 jum",
  "gsc.oauth.sync90": "Issinkronizza l-aħħar 90 jum",
  "gsc.oauth.lastSync": "L-aħħar sinkronizzazzjoni",
  "gsc.oauth.rows": "ringieli",
  "gsc.oauth.readOnlyNote":
    "Aċċess għall-qari biss. Milo qatt ma jbiddel is-settings ta’ Search Console tiegħek u ma jaċċessax servizzi oħra ta’ Google.",
  "gsc.oauth.expired":
    "Il-konnessjoni tiegħek ma’ Google skadiet. Biex tkompli, erġa’ qabbadha. L-importazzjoni manwali ta’ CSV għadha disponibbli.",
  "gsc.oauth.errorState":
    "Kien hemm problema bil-konnessjoni ma’ Google. Biex tkompli, erġa’ qabbadha. L-importazzjoni manwali ta’ CSV għadha disponibbli.",
  "gsc.oauth.connectedToast": "Google Search Console ġie mqabbad.",
  "gsc.oauth.deniedToast": "Id-dħul f’Google ġie kkanċellat.",
  "gsc.oauth.errorToast": "Google Search Console ma setax jiġi mqabbad.",
  "gsc.oauth.syncToast": "Ringieli sinkronizzati minn Search Console: {rows}.",
  "gsc.oauth.syncError":
    "Id-dejta ta’ Search Console ma setgħetx tiġi sinkronizzata. Erġa’ pprova.",
  "gsc.oauth.sitesError":
    "Il-proprjetajiet ta’ Search Console ma setgħux jitgħabbew. Erġa’ pprova.",
  "gsc.oauth.noSites":
    "Ma nstabu l-ebda proprjetajiet ivverifikati ta’ Search Console f’dan il-kont.",
  "gsc.oauth.disconnected": "Google Search Console ġie skonnettjat.",
  "gsc.oauth.status.connected": "Imqabbad",
  "gsc.oauth.status.disconnected": "Skonnettjat",
  "gsc.oauth.status.expired": "Skadut",
  "gsc.oauth.status.error": "Żball",
  "gsc.oauth.status.notConfigured": "Mhux ikkonfigurat",
  "gsc.caution":
    "Id-dejta ta’ Search Console tirrifletti l-prestazzjoni f’Google Search fil-perjodu tad-dati importat. Ma tiggarantixxix pożizzjonijiet jew traffiku fil-futur.",
  "gsc.stat.clicks": "Klikks f’Google",
  "gsc.stat.impressions": "Impressjonijiet f’Google",
  "gsc.stat.ctr": "CTR medju",
  "gsc.stat.position": "Pożizzjoni medja",
  "gsc.stat.topQuery": "L-aqwa mistoqsija",
  "gsc.stat.topPage": "L-aqwa paġna",
  "gsc.matched.heading": "Paġni ppubblikati minn Milo f’Search Console",
  "gsc.matched.queryOnly":
    "Din l-importazzjoni fiha biss dejta fil-livell tal-mistoqsijiet, għalhekk Milo ma jistax iqabbilha ma’ paġni ppubblikati speċifiċi.",
  "gsc.col.page": "Paġna",
  "gsc.col.query": "Mistoqsija",
  "gsc.col.ctr": "CTR",
  "gsc.col.position": "Pożizzjoni medja",
  "gsc.col.onsite": "Fis-sit",
  "gsc.col.recommendation": "Rakkomandazzjoni",
  "gsc.topQueries": "L-aqwa mistoqsijiet",
  "gsc.noQueries": "M’hemm l-ebda ringiela ta’ mistoqsijiet f’din l-importazzjoni.",
  "gsc.topPages": "L-aqwa paġni",
  "gsc.noPages": "M’hemm l-ebda ringiela ta’ paġni f’din l-importazzjoni.",
  "gsc.history": "Storja tal-importazzjonijiet",
  "gsc.delete": "Ħassar l-importazzjoni",
  "gsc.toast.imported": "Ringieli importati: {rows}",
  "gsc.toast.deleted": "L-importazzjoni tħassret",
  "gsc.warn.truncated":
    "Ġew importati 1000 ringiela. Xi ringieli nqabżu biex l-ispazju tax-xogħol jibqa’ jaħdem malajr.",
  "gsc.warn.queryOnly":
    "Din l-importazzjoni fiha biss dejta fil-livell tal-mistoqsijiet, għalhekk it-tqabbil tal-paġni mhuwiex disponibbli.",
  "gsc.error.noFile": "L-ewwel agħżel fajl CSV.",
  "gsc.error.notCsv": "Agħżel fajl .csv.",
  "gsc.error.generic": "Dan is-CSV ma setax jiġi importat. Erġa’ pprova.",
  "gsc.rec.improveTitleMeta": "Ittejjeb it-titlu/il-meta",
  "gsc.rec.improveCtr": "Ittejjeb is-CTR",
  "gsc.rec.addSupportingContent": "Żid kontenut ta’ appoġġ",
  "gsc.rec.improveContentDepth": "Approfondixxi l-kontenut",
  "gsc.rec.keepMonitoring": "Kompli ssegwi",
  "gsc.rec.waitOrPromote": "Il-kejl mhuwiex disponibbli",
  "gsc.integrity.property": "Proprjetà ddikjarata ta’ Search Console",
  "gsc.integrity.start": "Data tal-bidu (inkluża)",
  "gsc.integrity.end": "Data tat-tmiem (inkluża)",
  "gsc.integrity.preview": "Previżjoni tas-CSV",
  "gsc.integrity.save": "Issejvja l-importazzjoni riveduta",
  "gsc.integrity.previewInfo":
    "Ringieli vvalidati lokalment: {rows}. L-ewwel ħamsa jidhru hawn taħt; xejn ma jiġi ssejvjat qabel ma tikkonferma.",
  "gsc.integrity.capacity":
    "Diġà qed jinħażnu ħames importazzjonijiet. Qabel iżżid oħra, neħħi b’mod espliċitu importazzjoni qadima.",
  "gsc.integrity.disclaimer":
    "Is-sors u l-proprjetà ssejvjati huma dikjarazzjonijiet, mhux verifika indipendenti. — ifisser “mhux disponibbli”, qatt żero. It-tabelli jistgħu ma jinkludux parti mit-traffiku. Dawn id-dati huma separati mix-xahar tar-rapport u mid-data tal-pubblikazzjoni. L-osservazzjonijiet tat-tfittxija ma jagħtux prova ta’ kawżalità jew konverżjonijiet.",
  "gsc.integrity.legacy":
    "Importazzjoni preċedenti: id-dejta oriġinali nżammet. Il-bażi numerika ma tistax tiġi rkuprata b’mod sikur; biex tuża dawn il-metriċi, agħmel previżjoni ta’ esportazzjoni ġdida.",
  "gsc.integrity.aggregate":
    "Total tal-proprjetà API ddikjarata. It-tabelli tal-mistoqsijiet u tal-paġni huma kampjuni separati tal-aqwa ringieli u ma jingħaddux flimkien. Tfittxija fuq il-web, dejta finali, ġranet kalendarji fil-ħin tal-Paċifiku.",
  "gsc.integrity.rows":
    "Subtotal ta’ din it-tabella CSV biss. Mhuwiex it-total sħiħ tal-proprjetà; l-anonimizzazzjoni tal-mistoqsijiet, il-filtri u r-ringieli li nqabżu jistgħu jaffettwaw il-kopertura.",
  "gsc.integrity.unknown":
    "It-total mhuwiex disponibbli. Ringieli li jikkoinċidu jew ambigwi ma jistgħux jiddeterminaw total.",
  "gsc.integrity.separate": "Ara l-analitika tas-sit separatament",
  "gsc.integrity.invalid":
    "Is-CSV ma setax jiġi vvalidat. Uża tabella waħda Query, Page jew Date, mhux aktar minn 1 000 ringiela / 2 MB, ringieli u kolonni uniċi, valuri numeriċi sempliċi mingħajr separaturi tal-eluf u ċelloli vojta għal metriċi mhux disponibbli. Indika proprjetà u perjodu tad-dati validi. L-URLs tal-paġni għandhom jappartjenu għal din il-proprjetà u ma jistgħux jinkludu kredenzjali, strings ta’ mistoqsijiet jew frammenti.",
};
