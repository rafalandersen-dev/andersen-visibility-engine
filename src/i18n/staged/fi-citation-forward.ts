/** Finnish authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const fiCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Ladataan…",
  "citationForward.title": "Havainnosta varmennettuun muutokseen",
  "citationForward.intro":
    "Vie hyväksytty havaintoversio Plan-tehtäväksi, kirjoita muutos Studiossa, julkaise se olemassa olevan hyväksynnän kautta ja kirjaa sitten, mitä todella tarkastit kohteessa.",
  "citationForward.authority":
    "Havainnon hyväksyminen ei myönnä mitään: julkaisu vaatii yhä Studion hyväksynnän ja tavalliset Manual/Review/Autopilot-oikeutesi. Tehtävä, luonnos, hyväksyntä tai liittimen kuittaus ei koskaan todista, että sivu näyttää muutoksen.",
  "citationForward.findings.title": "Havainnot ja Plan-tehtävät",
  "citationForward.findings.empty":
    "Ei vielä sidottavaa havaintoa (hyväksytty tai toista tarkistusta odottava, nykyinen versio).",
  "citationForward.findings.pick": "Havainnon versio",
  "citationForward.findings.pickPlaceholder": "Valitse havainnon versio",
  "citationForward.findings.pinned": "Kiinnitetty versioon v{pinned} · nykyinen v{head}",
  "citationForward.findings.state.current": "nykyinen versio",
  "citationForward.findings.state.superseded":
    "korvattu uudemmalla versiolla (kiinnitys pysyy tarkistetulla rivillä)",
  "citationForward.findings.state.deleted": "kiinnitetty rivi poistettu",
  "citationForward.findings.state.dismissed": "hylkäämäsi (ei sidottavissa)",
  "citationForward.findings.state.dissent": "riippumaton eriävä mielipide kirjattu",
  "citationForward.findings.state.second_review": "odottaa toista tarkistusta",
  "citationForward.task.create": "Luo Plan-tehtävä tästä versiosta",
  "citationForward.task.attach": "Liitä olemassa olevaan tehtävään",
  "citationForward.task.attachPlaceholder": "Valitse tehtävä",
  "citationForward.task.created": "Plan-tehtävä luotu.",
  "citationForward.task.attached": "Liitetty tehtävään.",
  "citationForward.task.listTitle": "Tähän havaintoversioon linkitetyt tehtävät",
  "citationForward.task.listEmpty": "Tähän havaintoversioon ei ole linkitetty tehtävää.",
  "citationForward.task.state.active": "aktiivinen",
  "citationForward.task.state.archived": "arkistoitu",
  "citationForward.task.state.deleted": "poistettu",
  "citationForward.task.state.missing": "puuttuu (tehtävä ei ole enää tässä työtilassa)",
  "citationForward.task.localNote":
    "Tehtävien identiteetti ja linkit elävät työtilasi varastossa; ne eivät anna tarkistajan pääsyä eivätkä ole palvelintodisteita.",
  "citationForward.studio.manualDraft": "Luo manuaalinen luonnos Studiossa (ilman tekoälyä)",
  "citationForward.studio.manualNote":
    "Manuaalinen luonnos ei maksa mitään ja alkaa tyhjänä; tekoälygenerointi pysyy Planissa ja käyttää kuukausittaista tekoälybudjettiasi.",
  "citationForward.studio.open": "Avaa luonnos Studiossa",
  "citationForward.studio.plan": "Avaa Planissa (tekoälygenerointi)",
  "citationForward.improvement.title": "Parannusmerkintä",
  "citationForward.improvement.intro":
    "Sido tämän tehtävän täsmällinen julkaistu yritys, sen kantama hyväksyntäversio ja sitä ennen tehdyt lähtötasokaappaukset. Jokainen sidontakenttä johdetaan valitusta yrityksestä.",
  "citationForward.improvement.start": "Kirjaa parannus tälle tehtävälle",
  "citationForward.improvement.publication": "Julkaistu yritys",
  "citationForward.improvement.publicationNone":
    "Tälle tehtävälle ei ole vielä kirjattu julkaistua yritystä, jolla on toimiva URL. Julkaise ensin Studion kautta; aloitettua tai hylättyä yritystä ei voi sitoa.",
  "citationForward.improvement.publicationOption": "{finished} · versio {version} · {url}",
  "citationForward.improvement.approvedBy": "Hyväksyjä",
  "citationForward.improvement.approvedByOwner": "minä (omistaja)",
  "citationForward.improvement.description": "Mikä muuttui (kuvaus)",
  "citationForward.improvement.baselines": "Lähtötasokaappaukset (ennen julkaisua)",
  "citationForward.improvement.baselinesNone":
    "Mikään laajuuden kaappaus ei edellä tätä julkaisua; varmennettu ennen/jälkeen ei ole mahdollinen tälle yritykselle.",
  "citationForward.improvement.baselinesHint":
    "Vain ennen julkaisua tehtyjä kaappauksia tarjotaan. Palvelin tarkistaa tämän uudelleen.",
  "citationForward.improvement.review": "Tarkista täsmällinen merkintä",
  "citationForward.improvement.save": "Tallenna parannus",
  "citationForward.improvement.retry": "Yritä samaa merkintää uudelleen",
  "citationForward.improvement.back": "Takaisin muokkaukseen",
  "citationForward.improvement.cancel": "Peruuta",
  "citationForward.improvement.saved": "Tallennettu versiona v{version}.",
  "citationForward.improvement.listTitle": "Parannukset",
  "citationForward.improvement.listEmpty": "Tälle projektille ei ole vielä kirjattu parannusta.",
  "citationForward.improvement.status.unverified": "varmentamaton",
  "citationForward.improvement.status.approval_bound": "hyväksyntään sidottu",
  "citationForward.improvement.status.connector_receipt":
    "liittimen kuittaus (vain vastaanottokuittaus)",
  "citationForward.improvement.status.owner_attested":
    "omistajan todistama (oma havaintosi, ei riippumaton todiste)",
  "citationForward.improvement.evidence.baseline_absent": "lähtötasoa ei kirjattu",
  "citationForward.improvement.evidence.baseline_missing":
    "lähtötaso puuttuu (kaappaus poistettiin tai poistui laajuudesta)",
  "citationForward.improvement.evidence.baseline_recorded": "lähtötaso kirjattu",
  "citationForward.improvement.statusNote":
    "Tilat ovat palvelimen reaaliaikaisia arvoja. Liittimen kuittaus todistaa, että liitin vastasi, ei että sivu näyttää muutoksen; omistajan todistus on oma havaintosi.",
  "citationForward.improvement.detailRows": "Kiinnitetyt havaintorivit",
  "citationForward.improvement.detailTask": "Tehtävä",
  "citationForward.improvement.detailDestination": "Kohde",
  "citationForward.improvement.detailNoBinding": "Julkaisua ei ole sidottu (luonnosmerkintä).",
  "citationForward.improvement.remove": "Poista tämä versio",
  "citationForward.improvement.removed": "Poistettu.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Valitse vähintään yksi havainnon versio.",
  "citationForward.issue.finding_unavailable":
    "Valittu havaintorivi poistettiin; valitse nykyinen versio.",
  "citationForward.issue.finding_not_bindable":
    "Hylättyä tai korvattua havaintoa ei voi sitoa; valitse sen nykyinen hyväksytty versio.",
  "citationForward.issue.scope_mixed":
    "Kaikkien valittujen havaintojen on kuuluttava samaan lukittuun paneeliversioon ja samaan asiakkaaseen.",
  "citationForward.issue.task_invalid": "Tehtävän identiteetti ei ole kelvollinen.",
  "citationForward.issue.publication_required": "Valitse sidottava julkaistu yritys.",
  "citationForward.issue.publication_task_mismatch":
    "Valittu yritys kirjattiin toiselle tehtävälle.",
  "citationForward.issue.description_required": "Kuvaa muutos.",
  "citationForward.issue.baseline_after_publication":
    "Valittu lähtötaso kaapattiin julkaisun jälkeen.",
  "citationForward.issue.invalid": "Merkintä ei ole kelvollinen.",
  "citationForward.inspection.title": "Omistajan tarkastus kohteessa",
  "citationForward.inspection.intro":
    "Avaa täsmällinen julkaistu URL, vertaa sitä hyväksyttyyn tilannekuvaan ja kirjaa sitten, mitä näit. Linkin avaaminen tai onnistunut vastaus ei itsessään todista mitään.",
  "citationForward.inspection.open": "Avaa julkaistu URL",
  "citationForward.inspection.snapshot": "Hyväksytty tilannekuva",
  "citationForward.inspection.result": "Mitä näit?",
  "citationForward.inspection.shows_approved_content": "Näyttää hyväksytyn sisällön",
  "citationForward.inspection.does_not_show": "Ei näytä sitä",
  "citationForward.inspection.inconclusive": "Epäselvä",
  "citationForward.inspection.record": "Kirjaa tarkastus",
  "citationForward.inspection.baselineRequired":
    "Myönteinen tarkastus tarvitsee lähtötasokaappaukset, joita se parantaa; muokkaa ensin merkintää.",
  "citationForward.inspection.bindingRequired":
    "Tällä merkinnällä ei ole tarkastettavaa julkaisusidontaa.",
  "citationForward.inspection.negativeNote":
    "Kielteinen tai epäselvä tarkastus tallennetaan, ja parannus pysyy toimituksen osalta varmentamattomana.",
  "citationForward.error.conflict":
    "Joku tallensi uudemman version muokatessasi. Luonnoksesi on tallessa; mitään ei kirjoitettu.",
  "citationForward.error.conflictContinue": "Jatka nykyisellä versiolla",
  "citationForward.error.findingUnresolved": "Valittu havainto ei enää ratkea tässä laajuudessa.",
  "citationForward.error.baselineUnresolved": "Lähtötasokaappaus ei enää ratkea tässä projektissa.",
  "citationForward.error.bindingUnresolved": "Julkaisusidonta ei vastaa kirjattua yritystä.",
  "citationForward.error.bindingUnapproved": "Sidottu versio ei ole tällä hetkellä hyväksytty.",
  "citationForward.error.approvalMismatch":
    "Ilmoitettu hyväksyntäversio tai hyväksyjä ei vastaa todellista hyväksyntää.",
  "citationForward.error.taskMismatch": "Julkaisu kirjattiin toiselle tehtävälle.",
  "citationForward.error.destinationMismatch": "Kohde ei vastaa julkaistua URL-osoitetta.",
  "citationForward.error.inspectionInvalid":
    "Tarkastus ei kelpaa tälle julkaisulle (URL, aika tai tila).",
  "citationForward.error.verificationUnbacked":
    "Varmennus vaatii omistajan myönteisen tarkastuksen julkaistusta URL-osoitteesta.",
  "citationForward.error.scopeDrift": "Tämä parannus kirjattiin toisessa laajuudessa.",
  "citationForward.error.capacity": "Projektin parannuskapasiteetti on täynnä.",
  "citationForward.error.invalid": "Merkintä hylättiin virheellisenä.",
  "citationForward.error.unavailable":
    "Tallennusta ei voitu suorittaa loppuun. Päivitä ja yritä uudelleen.",
  "citationForward.error.loadEvidence": "Julkaisuhistoriaa ei voitu ladata.",
  "citationForward.error.loadImprovements": "Parannuksia ei voitu ladata.",
  "citationForward.readiness.title": "Uusintatestin valmius",
  "citationForward.readiness.verified":
    "Omistajan todistamat erilliset muutokset: {count} / {required} vaadittua",
  "citationForward.readiness.receipts": "Vain liittimen kuittauksia (ei toimitustodiste): {count}",
  "citationForward.readiness.approvalBound": "Vain hyväksyntään sidottuja: {count}",
  "citationForward.readiness.unverified": "Varmentamattomia: {count}",
  "citationForward.readiness.baselineMissing": "Lähtötaso puuttuu: {count}",
  "citationForward.readiness.note":
    "Luvut tulevat palvelimen reaaliaikaisista tiloista; tässä ei lasketa vertailukierrosta, eikä omistajan todistus ole koskaan riippumaton todiste.",
  "citationForward.task.pinnedTitle": "Havaintoversioihin kiinnitetyt Plan-tehtävät",
  "citationForward.task.pinnedEmpty":
    "Tässä projektissa yhtäkään Plan-tehtävää ei ole kiinnitetty havaintoversioon.",
  "citationForward.task.readFailed": "Havaintoa ei voitu lukea; tehtävää ei luotu.",
  "citationForward.task.notEligible":
    "Palvelimen palauttama havaintoversio ei ole valittu tai ei ole enää kelvollinen; tehtävää ei luotu.",
  "citationForward.task.stale":
    "Projekti tai tili vaihtui havaintoa luettaessa; tehtävää ei luotu.",
  "citationForward.improvement.rowsPick": "Sidottavat havaintoversiot",
  "citationForward.improvement.useCurrent": "Sido nykyinen versio v{head} kiinnitetyn rivin sijaan",
  "citationForward.improvement.publicationPartial":
    "Vain {loaded} / {total} kirjatusta yrityksestä voitiin ladata; vanhempia yrityksiä ei tarjota tässä.",
  "citationForward.improvement.historyRow": "aiempi versio (historia)",
  "citationForward.inspection.notHead":
    "Tästä parannuksesta on uudempi versio. Avaa nykyinen versio ja tarkasta se.",
  "citationForward.inspection.retry": "Yritä samaa tarkastusta uudelleen",
  "citationForward.error.findingStale":
    "Sidottu havainto muuttui sen jälkeen, kun tarkistit tämän merkinnän. Mitään ei kirjoitettu; avaa havainnon nykyinen versio ja tarkista uudelleen.",
  "citationForward.readiness.unavailable":
    "Valmiutta ei voida näyttää: reaaliaikaisia tiloja ei voitu päivittää.",
  "citationForward.improvement.approvalDelegate": "Hyväksynyt valtuutettu tarkistaja: {email}",
  "citationForward.improvement.approvalNone":
    "Tämä versio ei ole tällä hetkellä hyväksytty; yritystä ei voi sitoa.",
  "citationForward.issue.approval_unknown": "Valitun yrityksen hyväksyntätilaa ei voitu ladata.",
  "citationForward.issue.approval_unavailable":
    "Valitun yrityksen versio ei ole tällä hetkellä hyväksytty.",
  "citationForward.task.duplicate":
    "Tähän havaintoversioon on jo kiinnitetty Plan-tehtävä (listattu alla); toista tehtävää ei luotu. Käytä sitä tai liitä versio nimenomaisesti toiseen tehtävään.",
};
