/** Maltese authoring only; not registered in the runtime or language picker.
 * Covers `awareness.*` and `notifications.*` from `notifications.ts`. */
export const mtNotifications: Readonly<Record<string, string>> = {
  "awareness.title": "Xogħol attwali tal-proġett",
  "awareness.help":
    "Fl-app biss. Dawn il-verifiki ma jibagħtux email. Iż-żammiet jibqgħu viżibbli sakemm tinbidel il-kju; il-ftuħ tagħhom ma japprovax u ma jerġax jibda x-xogħol.",
  "awareness.project": "Agħżel proġett",
  "awareness.approval": "Il-verżjoni speċifika teħtieġ approvazzjoni",
  "awareness.resume": "Il-verżjoni approvata għadha miżmuma",
  "awareness.late":
    "Din id-data għaddiet. Irrevedi l-abbozz u agħżel azzjoni speċifika tal-ippjanar.",
  "awareness.paused":
    "L-awtomazzjoni ġiet sospiża apposta. Iż-żammiet eżistenti fuq il-pubblikazzjoni jibqgħu separati.",
  "awareness.disabled": "L-awtomazzjoni hija diżattivata.",
  "awareness.settings": "Iftaħ il-konfigurazzjoni tal-iskeda",
  "awareness.history":
    "L-aħħar riżultat tal-ġimgħa ssejvjat — storiku, mhux verifika ġdida tal-kapaċità jew tas-sorsi",
  "awareness.empty": "M’hemm l-ebda żamma tal-approvazzjoni f’din il-paġna.",
  "awareness.page": "Paġna tal-kju {page} minn {pages}",
  "awareness.error": "Ir-rekords attwali ma setgħux jiġu vverifikati. Aġġorna qabel ma taġixxi.",
  "awareness.checked": "Iċċekkjat {at}",
  "awareness.weekly": "Rekords attwali tal-perjodi tal-ġimgħa",
  "awareness.earlier": "Twissijiet preċedenti fl-inbox",
  "notifications.failureInspect": "Iċċekkja d-dettalji tal-pubblikazzjoni",
  "notifications.failureReadError":
    "Id-dettalji tal-pubblikazzjoni ma setgħux jiġu vverifikati. Erġa’ pprova qabel tiddeċiedi x’se tagħmel.",
  "notifications.failureReason.contentReview":
    "It-tentattiv issejvjat ġie mblukkat mill-verifiki tal-kontenut. Iftaħ l-abbozz biex tirrevedi t-tħejjija attwali tiegħu.",
  "notifications.failureReason.destination":
    "It-tentattiv issejvjat irrapporta żball fil-konnessjoni jew fir-rispons tad-destinazzjoni. Iċċekkja d-destinazzjoni qabel ma terġa’ tipprova.",
  "notifications.failureReason.configuration":
    "It-tentattiv issejvjat irrapporta konfigurazzjoni tal-pubblikazzjoni nieqsa jew invalida. Iċċekkja l-konfigurazzjoni tal-proġett.",
  "notifications.failureReason.unknown":
    "L-iżball issejvjat ma setax jiġi kklassifikat. Qabel ma terġa’ tipprova, irrevedi l-abbozz u d-destinazzjoni.",
  "notifications.failureRecorded":
    "Ir-rekord ġie aġġornat {at} fiż-żona tal-ħin tal-browser tiegħek. Tentattivi rreġistrati: {attempts}.",
  "notifications.failureDraftChanged":
    "L-abbozz inbidel wara dan ir-rekord. Din l-informazzjoni tista’ ma tibqax tiddeskrivi t-tħejjija attwali tiegħu.",
  "notifications.failureHttp": "Rispons irreġistrat tas-sit: HTTP {status}.",
  "notifications.failureCheck.links":
    "Solvi l-links interni fil-pannell tas-sigurtà tal-links tal-editur.",
  "notifications.failureCheck.sourcesReview":
    "Iċċekkja l-istqarrijiet mas-sorsi jew ma’ awtur kwalifikat u lesti r-reviżjoni umana.",
  "notifications.failureCheck.author":
    "Żid l-isem tal-awtur reali u bijografija, kwalifiki jew profil.",
  "notifications.failureHistoryLimit":
    "Din hija informazzjoni storika ssejvjata minn Milo. Ma tiċċekkjax id-destinazzjoni, ma tapprovax l-abbozz attwali u ma terġax tibda l-pubblikazzjoni.",
  "notifications.failureState.absent":
    "Ma nstab l-ebda rekord korrispondenti fil-kju. Aġġorna n-notifiki u rrevedi l-abbozz.",
  "notifications.failureState.changed":
    "Il-kju ma għadhiex timmarka dan l-oġġett bħala fallut. Aġġorna n-notifiki; dan waħdu ma jiċċekkjax is-sit tad-destinazzjoni.",
  "notifications.recoveryInspect": "Iċċekkja x-xogħol issejvjat",
  "notifications.recoveryReadError":
    "Ir-rekords tal-awtomazzjoni ssejvjati ma setgħux jiġu vverifikati. Erġa’ pprova qabel tiddeċiedi jekk terġax tibda.",
  "notifications.recoveryState.absent":
    "Ir-rekord tat-tħaddim attwali ma nstabx. Aġġorna n-notifiki biex tiċċekkja jekk dan l-inċident ġiex solvut.",
  "notifications.recoveryState.running": "L-aħħar tħaddim huwa mmarkat bħala attiv.",
  "notifications.recoveryState.completed":
    "L-aħħar tħaddim intemm. Aġġorna n-notifiki biex tara l-problemi attwali.",
  "notifications.recoveryState.review_required": "It-tħaddim interrott għadu jeħtieġ reviżjoni.",
  "notifications.recoverySnapshot":
    "Ir-rekords ta’ Milo ġew iċċekkjati {at} fiż-żona tal-ħin tal-browser tiegħek.",
  "notifications.recoveryCounts":
    "Pjan {period}: abbozzi ssejvjati — {saved}. Rekords tal-kju għal dawn l-abbozzi: pendenti — {pending}, għaddejjin — {publishing}, irreġistrati bħala ppubblikati — {published}, falluti — {failed}, ikkanċellati — {cancelled}.",
  "notifications.recoveryEvidenceLimit":
    "Dawn huma rekords issejvjati minn Milo. Ma jiċċekkjawx l-aħħar azzjoni tal-IA jew is-sit tad-destinazzjoni. Qabel ma tirrepeti pubblikazzjoni inċerta, iċċekkja d-destinazzjoni. Din il-veduta ma terġax tibda x-xogħol.",
  "notifications.recoveryMore":
    "Qed jintwerew {shown} minn {total} abbozz issejvjat. Iftaħ il-kalendarju biex tiċċekkja x-xogħol li fadal.",
  "notifications.emailAddressUnverified":
    "L-indirizz tal-email attwali tal-kont tiegħek mhuwiex ivverifikat. Lesti l-konferma tal-email u mbagħad iċċekkja mill-ġdid. Jekk l-indirizz inbidel minn amministratur u m’għandekx link ta’ konferma, ikkuntattja l-appoġġ ta’ Milo. In-notifiki fl-app għadhom disponibbli.",
  "notifications.emailAddressUnavailable":
    "Milo ma setax jiċċekkja l-verifika tal-email attwali tiegħek. Erġa’ pprova aktar tard. Xorta tista’ titfi s-sommarji u tuża n-notifiki fl-app.",
  "notifications.generation_capacity_low": "Il-kwota tal-preparazzjoni tista’ ma tkoprix il-pjan",
  "notifications.generation_capacity_unavailable":
    "Il-kwota tal-preparazzjoni ma setgħetx tiġi vverifikata",
  "notifications.capacityLow":
    "Il-pjan {period} għal dan il-proġett għadu jeħtieġ {missing} abbozz, iżda l-iskedi attivi kollha tiegħek jeħtieġu {total}. Il-kont tiegħek għandu {remaining} tentattiv ta’ preparazzjoni fadal fil-perjodu {usagePeriod}. Din hija kapaċità kondiviża, mhux wegħda ta’ artikli lesti. Irrevedi l-iskeda; l-abbozzi ssejvjati għadhom disponibbli għar-reviżjoni u l-pubblikazzjoni.",
  "notifications.capacityUnavailable":
    "Milo ma setax jiċċekkja l-kwota kondiviża tal-preparazzjoni għall-perjodu {usagePeriod}. Il-pjan {period} hawn għadu jeħtieġ {missing} abbozz. Iċċekkja mill-ġdid aktar tard. L-abbozzi ssejvjati u notifiki oħra għadhom disponibbli.",
  "notifications.scheduler_recovery": "L-awtomazzjoni teħtieġ reviżjoni tal-irkupru",
  "notifications.recovery":
    "It-tħejjija ġiet sospiża wara tħaddim interrott. Qabel ma terġa’ tibda, irrevedi l-abbozzi ssejvjati u l-aħħar azzjoni. L-approvazzjonijiet eżistenti għall-pubblikazzjoni jibqgħu l-istess.",
  "notifications.emailTitle": "Sommarji bl-email",
  "notifications.emailDescription":
    "Irċievi sommarju wieħed tat-twissijiet ġodda mhux aktar minn darba fis-siegħa fuq l-indirizz ikkonfermat tal-kont tiegħek. Kull inċident jidher darba biss.",
  "notifications.emailDisabled":
    "Il-kunsinna bl-email għadha mhijiex attivata. In-notifiki fl-app huma disponibbli.",
  "notifications.emailEnable": "Ixgħel is-sommarji bl-email",
  "notifications.emailDisable": "Itfi s-sommarji bl-email",
  "notifications.emailError": "Il-konfigurazzjoni tal-email mhijiex disponibbli temporanjament.",
  "notifications.emailSaveError": "Il-preferenzi tal-email ma setgħux jiġu ssejvjati.",
  "notifications.emailHistory": "Attività reċenti tal-email",
  "notifications.emailStatus.pending": "Pendenti",
  "notifications.emailStatus.leased": "Qed jiġi ċċekkjat l-istatus attwali",
  "notifications.emailStatus.sending": "Qed jintbagħat",
  "notifications.emailStatus.accepted": "Il-fornitur tal-email aċċettah",
  "notifications.emailStatus.unknown": "Ir-riżultat tal-kunsinna jeħtieġ verifika",
  "notifications.emailStatus.cancelled": "Ikkanċellat",
  "notifications.emailStatus.failed": "L-email ma setgħetx titħejja",
  "notifications.title": "Notifiki",
  "notifications.subtitle":
    "Id-deċiżjonijiet pendenti u l-problemi tal-pubblikazzjoni tiegħek, iċċekkjati mal-aħħar stat tas-server.",
  "notifications.loading": "Qed jiġi ċċekkjat il-pjan tiegħek…",
  "notifications.empty": "Bħalissa xejn ma jeħtieġ l-attenzjoni tiegħek.",
  "notifications.error": "In-notifiki mhumiex disponibbli temporanjament.",
  "notifications.stale":
    "L-aħħar verifika ma setgħetx titlesta. Dawn huma l-aħħar twissijiet ikkonfermati.",
  "notifications.refresh": "Iċċekkja mill-ġdid",
  "notifications.read": "Immarka bħala moqri",
  "notifications.unread": "Mhux moqri",
  "notifications.saved": "Moqri",
  "notifications.open": "Iftaħ il-kompitu",
  "notifications.calendar": "Iftaħ il-kalendarju",
  "notifications.project": "Proġett",
  "notifications.approval_due": "Approvazzjoni meħtieġa dalwaqt",
  "notifications.publication_failed": "Il-pubblikazzjoni trid tiġi vverifikata",
  "notifications.manual_overdue": "Il-kompitu manwali qabeż l-iskadenza",
  "notifications.cadence_gap": "Il-ġimgħa d-dieħla teħtieġ attenzjoni",
  "notifications.coverage":
    "{missing} minn {total} perjodu ppjanat mhumiex lesti u mhumiex fil-kju.",
  "notifications.failure":
    "Qabel ma terġa’ tipprova, iċċekkja d-destinazzjoni: pubblikazzjoni interrotta tista’ tkun diġà online.",
  "notifications.approval": "Irrevedi l-verżjoni attwali qabel l-iskadenza ppjanata tagħha.",
  "notifications.manual":
    "Lesti dan il-kompitu jew agħżel data ġdida. Din l-iskadenza tapplika għal kompitu manwali.",
  "notifications.readError":
    "Din in-notifika ma setgħetx tiġi mmarkata bħala moqrija. Erġa’ pprova.",
};
