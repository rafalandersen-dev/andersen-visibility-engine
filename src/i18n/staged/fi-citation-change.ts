/** Finnish authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const fiCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Listaus- ja määritysmuutokset",
  "citationChange.intro":
    "Kirjaa aiottu muutos artefaktina (vain tuetut, ei-salaiset kentät), hyväksy täsmälleen tuo versio, ilmoita milloin se tehtiin ja sido siihen sitten parannus. Ilmoitus ei ole todiste kohteesta.",
  "citationChange.artifact.new": "Uusi muutosartefakti",
  "citationChange.artifact.kind": "Laji",
  "citationChange.artifact.kind.listing": "Listaus",
  "citationChange.artifact.kind.configuration": "Määritys",
  "citationChange.artifact.reference": "Viite",
  "citationChange.artifact.referenceHint":
    "Listauksen tai asetuksen tunniste (esimerkiksi profiilin id tai asetuksen polku). Ei tunnistetietoja.",
  "citationChange.artifact.fields": "Kentät",
  "citationChange.artifact.fieldsHint":
    "Vain tuetut kentät voidaan kirjata; tunnistetiedot, tunnukset ja yksityiset asetukset hylätään, eikä niitä voi lisätä tähän.",
  "citationChange.artifact.before": "Ennen",
  "citationChange.artifact.after": "Jälkeen",
  "citationChange.artifact.save": "Tallenna artefakti",
  "citationChange.artifact.saved":
    "Artefakti tallennettu (identtinen sisältö palauttaa olemassa olevan artefaktin).",
  "citationChange.artifact.remove":
    "Poista artefakti (sisältö poistetaan; tunnisteet säilyvät auditointia varten)",
  "citationChange.artifact.empty": "Ei vielä muutosartefaktia.",
  "citationChange.artifact.unsupported": "Kenttää tai arvoa ei tueta; mitään ei tallennettu.",
  "citationChange.approval.title": "Täsmälleen tämän version hyväksyntä",
  "citationChange.approval.approve": "Hyväksy tämä versio",
  "citationChange.approval.revoke": "Peruuta hyväksyntä",
  "citationChange.approval.owner": "Hyväksynyt minä (omistaja)",
  "citationChange.approval.delegate": "Hyväksynyt valtuutettu tarkastaja: {email}",
  "citationChange.approval.none": "Ei tällä hetkellä hyväksytty.",
  "citationChange.receipt.title": "Suoritusilmoitukset",
  "citationChange.receipt.record": "Ilmoita suoritetuksi nyt",
  "citationChange.receipt.recorded": "Ilmoitus kirjattu.",
  "citationChange.receipt.none": "Ei vielä ilmoitusta.",
  "citationChange.receipt.note":
    "Ilmoitus kertoo, että henkilö teki muutoksen; se ei koskaan todista, että kohde näyttää sen.",
  "citationChange.binding.kind": "Sidonnan laji",
  "citationChange.binding.public": "Julkaistu yritys (julkinen URL)",
  "citationChange.binding.change": "Listaus- / määritysmuutos",
  "citationChange.binding.artifact": "Artefakti",
  "citationChange.binding.receipt": "Suoritusilmoitus",
  "citationChange.binding.chooseArtifact": "Valitse hyväksytty artefakti",
  "citationChange.binding.chooseReceipt": "Valitse ilmoitus",
  "citationChange.issue.artifact_required": "Valitse hyväksytty artefakti.",
  "citationChange.issue.artifact_unapproved": "Valittu artefakti ei ole tällä hetkellä hyväksytty.",
  "citationChange.issue.receipt_required": "Valitse artefaktille suoritusilmoitus.",
  "citationChange.independent.title": "Riippumaton tarkastus",
  "citationChange.independent.none": "ei riippumatonta tarkastusta",
  "citationChange.independent.inconclusive": "epäselvä (ei vahvista)",
  "citationChange.independent.disputed":
    "kiistetty (määrätty tarkastaja näki muutoksen puuttuvan; suljettu pois vahvistetusta valmiudesta)",
  "citationChange.independent.independently_inspected":
    "riippumattomasti tarkastettu (toinen todennettu henkilö näki hyväksytyn muutoksen)",
  "citationChange.independent.note":
    "Riippumaton tarkastus on tiimin toisen henkilön tekemä inhimillinen tarkastus; se ei ole koskaan automaattinen varmennus tai syy-yhteyden todiste, ja kiistetty toimitus suljetaan pois, vaikka olisit itse vahvistanut sen.",
  "citationChange.eligible.yes": "lasketaan vahvistetuksi muutokseksi",
  "citationChange.eligible.no": "ei lasketa vahvistetuksi",
  "citationChange.assign.title": "Tarkastusmääräykset",
  "citationChange.assign.pick": "Valitse tiimin tarkastaja",
  "citationChange.assign.grant": "Myönnä tarkastus",
  "citationChange.assign.revoke": "Peruuta",
  "citationChange.assign.link": "Kopioi tarkastajan linkki",
  "citationChange.assign.linkCopied": "Linkki kopioitu.",
  "citationChange.assign.none": "Tarkastajaa ei ole määrätty.",
  "citationChange.assign.effective": "voimassa",
  "citationChange.assign.ineffective": "ei enää voimassa",
  "citationChange.inspect.title": "Tarkasta kirjattu muutos",
  "citationChange.inspect.intro":
    "Avaa tarkka viite, vertaa sitä alla olevaan hyväksyttyyn sisältöön ja kirjaa sitten, mitä näit. Viitteen avaaminen ei itsessään todista mitään.",
  "citationChange.inspect.reference": "Viite",
  "citationChange.inspect.open": "Avaa viite",
  "citationChange.inspect.approvedVersion": "Hyväksytty versio",
  "citationChange.inspect.approvedContent": "Hyväksytty sisältö",
  "citationChange.inspect.identity": "Hyväksyjän ja suorittajan henkilöllisyydet",
  "citationChange.inspect.identityUnavailable":
    "Tämän muutoksen suorittaja tai hyväksyjä on tuntematon (vanhempi julkaisu tai ratkaisematon hyväksyntä); riippumatonta kuittia ei voi kirjata.",
  "citationChange.inspect.result": "Mitä näit?",
  "citationChange.inspect.shows_approved_content": "Näyttää hyväksytyn muutoksen",
  "citationChange.inspect.does_not_show": "Ei näytä sitä",
  "citationChange.inspect.inconclusive": "Epäselvä",
  "citationChange.inspect.record": "Kirjaa tarkastus",
  "citationChange.inspect.retry": "Yritä samaa tarkastusta uudelleen",
  "citationChange.inspect.withdraw": "Peru nykyinen tarkastukseni",
  "citationChange.inspect.recorded": "Tarkastus kirjattu versiona v{version}.",
  "citationChange.inspect.history": "Tarkastushistoriani",
  "citationChange.inspect.head": "nykyinen",
  "citationChange.inspect.withdrawn": "peruttu",
  "citationChange.inspect.loadError":
    "Tätä tarkastusta ei voitu ladata (ei määrätty, peruutettu tai rivi muuttui).",
  "citationChange.readiness.independent": "Riippumattomasti tarkastettuja: {count}",
  "citationChange.readiness.disputed": "Kiistettyjä (poissuljettuja): {count}",
  "citationChange.readiness.receipts": "Vain suoritusilmoituksia (ei toimitustodistetta): {count}",
  "citationChange.error.unsupported": "Kenttää, arvoa tai lajia ei tueta; mitään ei tallennettu.",
  "citationChange.error.unavailable": "Muutostietuetta ei voitu ladata tai tallentaa.",
  "citationChange.error.stale":
    "Artefakti on muuttunut sen jälkeen, kun katsoit sitä; avaa se uudelleen.",
  "citationChange.error.forbidden": "Sinulla ei ole lupaa tehdä tätä tässä projektissa.",
  "citationChange.error.unapproved": "Tämä versio ei ole tällä hetkellä hyväksytty.",
  "citationChange.error.receiptInvalid":
    "Ilmoitettu hetki on ennen hyväksyntää tai tulevaisuudessa.",
  "citationChange.error.capacity": "Tämän projektin muutosartefaktien kapasiteetti on täynnä.",
  "citationChange.error.inspectionInvalid": "Tarkastus ei ole kelvollinen (hetki, viite tai tila).",
  "citationChange.error.notIndependent":
    "Suoritit tai hyväksyit tämän muutoksen, joten et voi tarkastaa sitä riippumattomasti.",
  "citationChange.error.identityUnavailable":
    "Suorittajan tai hyväksyjän henkilöllisyys ei ole saatavilla; riippumaton tarkastus hylätään.",
  "citationChange.error.inspectionConflict":
    "Tarkastusketjusi muuttui; lataa uudelleen ja kirjaa uudelleen.",
  "citationChange.error.generic": "Muutostodisteisiin liittyvää toimintoa ei voitu suorittaa.",
  "citationChange.artifact.fieldKey": "Kenttä",
  "citationChange.artifact.addField": "Lisää kenttä",
  "citationChange.artifact.removeField": "Poista",
  "citationChange.artifact.removed": "Artefakti poistettu (auditointitunnisteet säilytetty).",
  "citationChange.artifact.approvalRevision": "hyväksynnän versio {revision}",
  "citationChange.approval.approved": "Hyväksyntä kirjattu.",
  "citationChange.approval.revoked": "Hyväksyntä peruutettu.",
  "citationChange.approval.retry": "Yritä samaa päätöstä uudelleen",
  "citationChange.approval.replayed":
    "Tämä oli aiemman pyynnön toisto; nykyinen päätös näkyy uudelleenlatauksen jälkeen.",
  "citationChange.receipt.remove": "Poista ilmoitus",
  "citationChange.receipt.removed": "Ilmoitus poistettu.",
  "citationChange.binding.deleted": "Sidottu artefakti poistettiin; vain tunnisteet jäivät.",
  "citationChange.detail.changeTitle": "Sidottu listaus- / määritysmuutos",
  "citationChange.detail.artifactVersion": "Artefaktin hyväksytty versio",
  "citationChange.detail.receiptAt": "Ilmoitettu suoritetuksi",
  "citationChange.assign.candidatesNone":
    "Ei sopivaa tiimin tarkastajaa määrättäväksi (käytäntö tai luettelo).",
  "citationChange.assign.granted": "Tarkastus myönnetty.",
  "citationChange.assign.revoked": "Tarkastus peruutettu.",
  "citationChange.inspect.kindPublic": "Julkaistu sivu",
  "citationChange.inspect.fresh":
    "Nykyisellä tarkastuksellasi ei ole enää vaikutusta ({reason}); kirjaa uusi nykyistä ketjun kärkeäsi vasten.",
  "citationChange.inspect.reason.superseded": "korvattu myöhemmällä kuitilla",
  "citationChange.inspect.reason.withdrawn": "peruttu",
  "citationChange.inspect.reason.account": "tili ei ole käytettävissä",
  "citationChange.inspect.reason.assignment": "määräys myönnettiin uudelleen",
  "citationChange.inspect.reason.authority": "tiimivaltuutesi muuttui",
  "citationChange.inspect.reason.independence": "olet nyt suorittaja tai hyväksyjä",
  "citationChange.inspect.noContent":
    "Hyväksytty sisältö ei ole enää saatavilla (artefakti poistettu tai julkaisu puuttuu).",
  "citationChange.inspect.boundFindings": "Sidotut havainnot",
  "citationChange.inspect.withdrawnDone": "Tarkastus peruttu.",
  "citationChange.dissent.title": "Aktiivinen erimielisyys tästä toimitetusta muutoksesta",
  "citationChange.dissent.row": "{inspector} · rivi {row} · {at}",
  "citationChange.status.receipt_recorded": "suoritusilmoitus kirjattu (ei toimitustodiste)",
  "citationChange.artifact.duplicateField":
    "Tämä kenttä on jo käytössä toisella rivillä; valitse toinen kenttä tai poista tämä rivi.",
  "citationChange.artifact.fieldsExhausted": "Jokaisella tämän lajin tuetulla kentällä on jo rivi.",
  "citationChange.approval.pendingNote":
    "Edellinen pyyntö ei palannut. Uudelleenyritys lähettää täsmälleen saman päätöksen (versio {sha}, {decision}, tarkastettu versio {revision}); mitään ei lasketa uudelleen nykytilasta.",
  "citationChange.approval.newDecision": "Hylkää se ja päätä uudelleen",
  "citationChange.receipt.retry": "Yritä samaa ilmoitusta uudelleen",
  "citationChange.receipt.newPerformance": "Ilmoita uusi suoritus",
  "citationChange.receipt.pendingNote":
    "Edellinen ilmoitus ei palannut. Uudelleenyritys lähettää täsmälleen saman ilmoitetun hetken ({at}); uusi suoritus on erillinen nimenomainen toimi.",
  "citationChange.approval.blockedBy":
    "Ratkaise ensin kohteen {reference} odottava päätös (yritä uudelleen tai hylkää); muut hyväksynnät odottavat.",
  "citationChange.receipt.blockedBy":
    "Ratkaise ensin kohteen {reference} odottava ilmoitus (yritä uudelleen tai ilmoita uusi suoritus); muut ilmoitukset odottavat.",
  "citationChange.readiness.verified":
    "Vahvistetut erilliset muutokset: {count} / {required} vaadittua (muutos lasketaan, kun sen todiste on kelvollinen: oma vahvistuksesi tai toimitetun muutoksen riippumaton tarkastus; kiistetty tai poissuljettu muutos ei koskaan lasketa)",
  "citationChange.readiness.sources":
    "Kirjatut havainnot nykyisistä muutoksista: omistajan vahvistamat {owner}, riippumattomasti tarkastetut {independent} (nämä ovat kirjattujen havaintojen lukumääriä, eivät kelvollisia todisteita; kiistat ja poissulkemiset ratkaisevat yllä olevan vahvistetun määrän)",
  "citationChange.evidence.independentBaseline":
    "perustaso ratkeaa riippumattomalla todisteella (tällä rivillä ei omistajan vahvistusta)",
  "citationChange.inspect.ownerIntro":
    "Avaa listaus tai asetus tarkassa viitteessä, vertaa alla oleviin hyväksyttyihin kenttiin ja kirjaa sitten, mitä näit. Avaaminen ei itsessään todista mitään.",
  "citationChange.inspect.contentUnavailable":
    "Tämän muutoksen tarkkaa hyväksyttyä sisältöä ei voitu ladata (artefakti poistettu, muuttunut tai ei saatavilla): myönteinen vahvistus ei ole mahdollinen; kielteinen tai epäselvä tulos voidaan silti kirjata.",
};
