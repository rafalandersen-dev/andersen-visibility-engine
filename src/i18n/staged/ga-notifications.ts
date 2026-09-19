/** Irish authoring only; not registered in the runtime or language picker.
 * Covers `awareness.*` and `notifications.*` from `notifications.ts`. */
export const gaNotifications: Readonly<Record<string, string>> = {
  "awareness.title": "Obair reatha an tionscadail",
  "awareness.help":
    "San aip amháin. Ní sheolann na seiceálacha seo ríomhphost. Fanann coinneálacha le feiceáil go dtí go n-athraíonn an scuaine; ní cheadaíonn ná ní atosaíonn a n-oscailt obair.",
  "awareness.project": "Roghnaigh tionscadal",
  "awareness.approval": "Teastaíonn ceadú don leagan ar leith",
  "awareness.resume": "Tá an leagan ceadaithe fós coinnithe siar",
  "awareness.late":
    "Tá an dáta seo imithe thart. Athbhreithnigh an dréacht agus roghnaigh gníomh pleanála ar leith.",
  "awareness.paused":
    "Cuireadh an t-uathoibriú ar sos d’aon ghnó. Fanann coinneálacha foilsithe atá ann cheana ar leith.",
  "awareness.disabled": "Tá an t-uathoibriú díchumasaithe.",
  "awareness.settings": "Oscail socruithe an sceidil",
  "awareness.history":
    "An toradh seachtaine sábháilte is déanaí — stairiúil, ní seiceáil nua ar acmhainn ná ar fhoinsí",
  "awareness.empty": "Níl aon choinneáil cheadaithe ar an leathanach seo.",
  "awareness.page": "Leathanach scuaine {page} as {pages}",
  "awareness.error": "Níorbh fhéidir na taifid reatha a sheiceáil. Athnuaigh sula ngníomhaíonn tú.",
  "awareness.checked": "Seiceáilte {at}",
  "awareness.weekly": "Taifid reatha tréimhsí na seachtaine",
  "awareness.earlier": "Rabhaidh bhosca isteach níos luaithe",
  "notifications.failureInspect": "Seiceáil sonraí an fhoilsithe",
  "notifications.failureReadError":
    "Níorbh fhéidir sonraí an fhoilsithe a sheiceáil. Bain triail eile as sula gcinneann tú cad atá le déanamh.",
  "notifications.failureReason.contentReview":
    "Bhlocáil seiceálacha ábhair an iarracht shábháilte. Oscail an dréacht chun a ullmhacht reatha a athbhreithniú.",
  "notifications.failureReason.destination":
    "Thuairiscigh an iarracht shábháilte earráid nasctha nó freagra ón gceann scríbe. Seiceáil an ceann scríbe sula mbaineann tú triail eile as.",
  "notifications.failureReason.configuration":
    "Thuairiscigh an iarracht shábháilte cumraíocht foilsithe atá ar iarraidh nó neamhbhailí. Seiceáil socrú an tionscadail.",
  "notifications.failureReason.unknown":
    "Níorbh fhéidir an earráid shábháilte a aicmiú. Athbhreithnigh an dréacht agus an ceann scríbe sula mbaineann tú triail eile as.",
  "notifications.failureRecorded":
    "Nuashonraíodh an taifead {at} i gcrios ama do bhrabhsálaí. Iarrachtaí taifeadta: {attempts}.",
  "notifications.failureDraftChanged":
    "D’athraigh an dréacht tar éis an taifid seo. D’fhéadfadh nach ndéanann an fhaisnéis seo cur síos ar a ullmhacht reatha a thuilleadh.",
  "notifications.failureHttp": "Freagra taifeadta an tsuímh: HTTP {status}.",
  "notifications.failureCheck.links":
    "Réitigh naisc inmheánacha i bpainéal sábháilteachta nasc an eagarthóra.",
  "notifications.failureCheck.sourcesReview":
    "Seiceáil éilimh i gcoinne foinsí nó le húdar cáilithe agus críochnaigh an t-athbhreithniú daonna.",
  "notifications.failureCheck.author":
    "Cuir ainm an údair fhíor leis agus beathaisnéis, cáilíochtaí nó próifíl.",
  "notifications.failureHistoryLimit":
    "Is faisnéis stairiúil í seo a shábháil Milo. Ní sheiceálann sí an ceann scríbe, ní cheadaíonn sí an dréacht reatha agus ní atosaíonn sí an foilsiú.",
  "notifications.failureState.absent":
    "Níor aimsíodh taifead scuaine comhfhreagrach. Athnuaigh na fógraí agus athbhreithnigh an dréacht.",
  "notifications.failureState.changed":
    "Ní mharcálann an scuaine an mhír seo mar mhír theipthe a thuilleadh. Athnuaigh na fógraí; ní sheiceálann sé seo leis féin an suíomh ceann scríbe.",
  "notifications.recoveryInspect": "Seiceáil an obair shábháilte",
  "notifications.recoveryReadError":
    "Níorbh fhéidir taifid shábháilte an uathoibrithe a sheiceáil. Bain triail eile as sula gcinneann tú ar cheart atosú.",
  "notifications.recoveryState.absent":
    "Níor aimsíodh taifead an rite reatha. Athnuaigh na fógraí chun a sheiceáil ar réitíodh an teagmhas seo.",
  "notifications.recoveryState.running": "Tá an rith is déanaí marcáilte mar ghníomhach.",
  "notifications.recoveryState.completed":
    "Tá an rith is déanaí críochnaithe. Athnuaigh na fógraí chun na fadhbanna reatha a fheiceáil.",
  "notifications.recoveryState.review_required":
    "Teastaíonn athbhreithniú fós ar an rith a briseadh.",
  "notifications.recoverySnapshot": "Seiceáladh taifid Milo {at} i gcrios ama do bhrabhsálaí.",
  "notifications.recoveryCounts":
    "Plean {period}: dréachtaí sábháilte — {saved}. Taifid scuaine do na dréachtaí seo: ar feitheamh — {pending}, ar siúl — {publishing}, taifeadta mar fhoilsithe — {published}, teipthe — {failed}, cealaithe — {cancelled}.",
  "notifications.recoveryEvidenceLimit":
    "Is taifid iad seo a shábháil Milo. Ní sheiceálann siad an gníomh IS deireanach ná an suíomh ceann scríbe. Sula ndéanann tú foilsiú éiginnte arís, seiceáil an ceann scríbe. Ní atosaíonn an radharc seo obair.",
  "notifications.recoveryMore":
    "Ag taispeáint {shown} as {total} dréacht shábháilte. Oscail an féilire chun an obair atá fágtha a sheiceáil.",
  "notifications.emailAddressUnverified":
    "Níl seoladh ríomhphoist reatha do chuntais fíoraithe. Críochnaigh deimhniú an ríomhphoist agus ansin seiceáil arís. Má d’athraigh riarthóir an seoladh agus mura bhfuil nasc deimhnithe agat, déan teagmháil le tacaíocht Milo. Tá fógraí san aip ar fáil fós.",
  "notifications.emailAddressUnavailable":
    "Níorbh fhéidir le Milo fíorú do ríomhphoist reatha a sheiceáil. Bain triail eile as níos déanaí. Is féidir leat achoimrí a mhúchadh agus fógraí san aip a úsáid fós.",
  "notifications.generation_capacity_low": "Seans nach leor an cuóta ullmhúcháin don phlean",
  "notifications.generation_capacity_unavailable":
    "Níorbh fhéidir an cuóta ullmhúcháin a sheiceáil",
  "notifications.capacityLow":
    "Teastaíonn {missing} dréacht fós ón bplean {period} don tionscadal seo, ach teastaíonn {total} ó do sceidil ghníomhacha go léir. Tá {remaining} iarracht ullmhúcháin fágtha ag do chuntas sa tréimhse {usagePeriod}. Is acmhainn roinnte í seo, ní gealltanas ailt chríochnaithe. Athbhreithnigh an sceideal; tá dréachtaí sábháilte ar fáil fós le haghaidh athbhreithnithe agus foilsithe.",
  "notifications.capacityUnavailable":
    "Níorbh fhéidir le Milo an cuóta ullmhúcháin roinnte a sheiceáil don tréimhse {usagePeriod}. Teastaíonn {missing} dréacht fós ón bplean {period} anseo. Seiceáil arís níos déanaí. Tá dréachtaí sábháilte agus fógraí eile ar fáil fós.",
  "notifications.scheduler_recovery": "Teastaíonn athbhreithniú aisghabhála ar an uathoibriú",
  "notifications.recovery":
    "Cuireadh an t-ullmhúchán ar sos tar éis rith a briseadh. Sula n-atosaíonn tú, athbhreithnigh na dréachtaí sábháilte agus an gníomh deireanach. Fanann ceaduithe foilsithe atá ann cheana gan athrú.",
  "notifications.emailTitle": "Achoimrí ríomhphoist",
  "notifications.emailDescription":
    "Faigh achoimre amháin ar rabhaidh nua uair san uair ar a mhéad chuig seoladh deimhnithe do chuntais. Taispeántar gach teagmhas uair amháin.",
  "notifications.emailDisabled":
    "Níl seachadadh ríomhphoist gníomhachtaithe fós. Tá fógraí san aip ar fáil.",
  "notifications.emailEnable": "Cas achoimrí ríomhphoist air",
  "notifications.emailDisable": "Múch achoimrí ríomhphoist",
  "notifications.emailError": "Níl socruithe ríomhphoist ar fáil faoi láthair.",
  "notifications.emailSaveError": "Níorbh fhéidir roghanna ríomhphoist a shábháil.",
  "notifications.emailHistory": "Gníomhaíocht ríomhphoist le déanaí",
  "notifications.emailStatus.pending": "Ar feitheamh",
  "notifications.emailStatus.leased": "An stádas reatha á sheiceáil",
  "notifications.emailStatus.sending": "Á sheoladh",
  "notifications.emailStatus.accepted": "Ghlac soláthraí an ríomhphoist leis",
  "notifications.emailStatus.unknown": "Teastaíonn seiceáil ar thoradh an tseachadta",
  "notifications.emailStatus.cancelled": "Cealaithe",
  "notifications.emailStatus.failed": "Níorbh fhéidir an ríomhphost a ullmhú",
  "notifications.title": "Fógraí",
  "notifications.subtitle":
    "Do chinntí atá ar feitheamh agus fadhbanna foilsithe, seiceáilte i gcoinne staid is déanaí an fhreastalaí.",
  "notifications.loading": "Do phlean á sheiceáil…",
  "notifications.empty": "Níl aon rud a dteastaíonn d’aird uaidh faoi láthair.",
  "notifications.error": "Níl fógraí ar fáil faoi láthair.",
  "notifications.stale":
    "Níorbh fhéidir an tseiceáil is déanaí a chríochnú. Seo iad na rabhaidh dheimhnithe is déanaí.",
  "notifications.refresh": "Seiceáil arís",
  "notifications.read": "Marcáil mar léite",
  "notifications.unread": "Gan léamh",
  "notifications.saved": "Léite",
  "notifications.open": "Oscail an tasc",
  "notifications.calendar": "Oscail an féilire",
  "notifications.project": "Tionscadal",
  "notifications.approval_due": "Beidh ceadú de dhíth go luath",
  "notifications.publication_failed": "Ní mór an foilsiú a sheiceáil",
  "notifications.manual_overdue": "Tá an tasc láimhe thar téarma",
  "notifications.cadence_gap": "Tá aird de dhíth ar an tseachtain seo chugainn",
  "notifications.coverage":
    "Níl {missing} as {total} tréimhse phleanáilte réidh agus níl siad sa scuaine.",
  "notifications.failure":
    "Sula mbaineann tú triail eile as, seiceáil an ceann scríbe: d’fhéadfadh foilsiú a briseadh a bheith ar líne cheana.",
  "notifications.approval": "Athbhreithnigh an leagan reatha roimh a spriocdháta pleanáilte.",
  "notifications.manual":
    "Críochnaigh an tasc seo nó roghnaigh dáta nua. Baineann an spriocdháta seo le tasc láimhe.",
  "notifications.readError":
    "Níorbh fhéidir an fógra seo a mharcáil mar léite. Bain triail eile as.",
};
