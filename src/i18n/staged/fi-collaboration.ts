/** Finnish authoring only; not registered in the runtime or language picker. */
export const fiCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Projektin nykyinen työ",
  "awareness.help":
    "Vain sovelluksessa. Nämä tarkistukset eivät lähetä sähköpostia. Pidot näkyvät, kunnes jono muuttuu; niiden avaaminen ei hyväksy eikä käynnistä työtä uudelleen.",
  "awareness.project": "Valitse projekti",
  "awareness.approval": "Tämä nimenomainen versio tarvitsee hyväksynnän",
  "awareness.resume": "Hyväksytty versio on yhä pidossa",
  "awareness.late":
    "Tämä päivämäärä on mennyt. Tarkista luonnos ja valitse nimenomainen ajastustoiminto.",
  "awareness.paused":
    "Automaatio on tarkoituksella tauolla. Nykyiset julkaisun pidot ovat erillisiä.",
  "awareness.disabled": "Automaatio on poistettu käytöstä.",
  "awareness.settings": "Avaa ajastusasetukset",
  "awareness.history":
    "Viimeksi tallennettu viikkotulos — historiallinen tieto, ei uusi kapasiteetin tai lähteiden tarkistus",
  "awareness.empty": "Tällä sivulla ei ole hyväksyntää odottavia pitoja.",
  "awareness.page": "Jonon sivu {page}/{pages}",
  "awareness.error": "Nykyisiä tietueita ei voitu tarkistaa. Päivitä ennen toimimista.",
  "awareness.checked": "Tarkistettu {at}",
  "awareness.weekly": "Nykyiset viikoittaisten paikkojen tietueet",
  "awareness.earlier": "Aiemmat saapuneet ilmoitukset",
  "notifications.failureInspect": "Tarkastele julkaisutietoja",
  "notifications.failureReadError":
    "Julkaisutietoja ei voitu tarkistaa. Yritä uudelleen ennen jatkotoimien päättämistä.",
  "notifications.failureReason.contentReview":
    "Tallennettu yritys estettiin sisältötarkistuksissa. Avaa luonnos tarkistaaksesi sen nykyisen valmiuden.",
  "notifications.failureReason.destination":
    "Tallennettu yritys ilmoitti julkaisukohteen yhteys- tai vastausvirheestä. Tarkista kohde ennen uudelleenyritystä.",
  "notifications.failureReason.configuration":
    "Tallennettu yritys ilmoitti puuttuvista tai virheellisistä julkaisuasetuksista. Tarkista projektin asetukset.",
  "notifications.failureReason.unknown":
    "Tallennettua virhettä ei voitu luokitella. Tarkista luonnos ja julkaisukohde ennen uudelleenyritystä.",
  "notifications.failureRecorded":
    "Tietue päivitetty {at} selaimesi aikavyöhykkeellä. Tallennettuja yrityksiä: {attempts}.",
  "notifications.failureDraftChanged":
    "Luonnos muuttui tämän tietueen jälkeen. Nämä tiedot eivät ehkä enää kuvaa sen nykyistä valmiutta.",
  "notifications.failureHttp": "Tallennettu sivuston vastaus: HTTP {status}.",
  "notifications.failureCheck.links":
    "Ratkaise sisäiset linkit editorin linkkiturvallisuuspaneelissa.",
  "notifications.failureCheck.sourcesReview":
    "Varmista väitteet lähteistä tai pätevältä tekijältä ja suorita ihmisen tekemä tarkistus.",
  "notifications.failureCheck.author":
    "Lisää todellisen tekijän nimi ja esittely, pätevyys tai profiili.",
  "notifications.failureHistoryLimit":
    "Tämä on Miloon tallennettua historiatietoa. Se ei tarkista julkaisukohdetta, hyväksy nykyistä luonnosta eikä käynnistä julkaisemista uudelleen.",
  "notifications.failureState.absent":
    "Vastaavaa jonotietuetta ei löytynyt. Päivitä ilmoitukset ja tarkista luonnos.",
  "notifications.failureState.changed":
    "Jono ei enää merkitse tätä kohdetta epäonnistuneeksi. Päivitä ilmoitukset; tämä ei yksin varmista kohdesivuston tilaa.",
  "notifications.recoveryInspect": "Tarkastele tallennettua työtä",
  "notifications.recoveryReadError":
    "Tallennettuja automaatiotietueita ei voitu tarkistaa. Yritä uudelleen ennen uudelleenkäynnistyksestä päättämistä.",
  "notifications.recoveryState.absent":
    "Nykyistä ajotietuetta ei löytynyt. Päivitä ilmoitukset tarkistaaksesi, onko tämä tilanne ratkaistu.",
  "notifications.recoveryState.running": "Viimeisin ajo on merkitty aktiiviseksi.",
  "notifications.recoveryState.completed":
    "Viimeisin ajo on päättynyt. Päivitä ilmoitukset nähdäksesi nykyiset ongelmat.",
  "notifications.recoveryState.review_required": "Keskeytynyt ajo tarvitsee yhä tarkistuksen.",
  "notifications.recoverySnapshot": "Milon tietueet tarkistettu {at} selaimesi aikavyöhykkeellä.",
  "notifications.recoveryCounts":
    "Suunnitelma {period}: {saved} tallennettua luonnosta. Näiden luonnosten jonotietueet: {pending} odottaa, {publishing} käynnissä, {published} merkitty julkaistuksi, {failed} epäonnistunut ja {cancelled} peruutettu.",
  "notifications.recoveryEvidenceLimit":
    "Nämä ovat Miloon tallennettuja tietueita. Ne eivät varmista viimeisintä tekoälytoimintoa tai kohdesivustoa. Tarkista kohde ennen epävarman julkaisun uudelleenyritystä. Tämä näkymä ei käynnistä työtä uudelleen.",
  "notifications.recoveryMore":
    "Näytetään {shown}/{total} tallennettua luonnosta. Avaa kalenteri tarkastellaksesi jäljellä olevaa työtä.",
  "notifications.emailAddressUnverified":
    "Tilisi nykyistä sähköpostiosoitetta ei ole vahvistettu. Vahvista osoite ja tarkista sitten uudelleen. Jos ylläpitäjä vaihtoi osoitteen eikä sinulla ole vahvistuslinkkiä, ota yhteyttä Milon tukeen. Sovelluksen ilmoitukset ovat edelleen käytettävissä.",
  "notifications.emailAddressUnavailable":
    "Milo ei voinut tarkistaa sähköpostiosoitteesi nykyistä vahvistusta. Yritä myöhemmin uudelleen. Voit silti poistaa yhteenvedot käytöstä ja käyttää sovelluksen ilmoituksia.",
  "notifications.generation_capacity_low": "Valmistelukiintiö ei ehkä riitä suunnitelmaan",
  "notifications.generation_capacity_unavailable": "Valmistelukiintiötä ei voitu tarkistaa",
  "notifications.capacityLow":
    "Jakson {period} suunnitelmasta puuttuu vielä {missing} luonnosta tässä projektissa ja {total} kaikissa aktiivisissa ajastuksissasi. Tililläsi on jäljellä {remaining} valmisteluyritystä jaksolla {usagePeriod}. Tämä on jaettua kapasiteettia, ei lupaus valmiista artikkeleista. Tarkista ajastus; tallennetut luonnokset säilyvät tarkistettavina ja julkaistavina.",
  "notifications.capacityUnavailable":
    "Milo ei voinut varmistaa jakson {usagePeriod} jaettua valmistelukiintiötä. Jakson {period} suunnitelmasta puuttuu täällä vielä {missing} luonnosta. Tarkista myöhemmin uudelleen. Tallennetut luonnokset ja muut ilmoitukset ovat edelleen käytettävissä.",
  "notifications.scheduler_recovery": "Automaatio tarvitsee palautumistarkistuksen",
  "notifications.recovery":
    "Valmistelu on tauolla keskeytyneen ajon jälkeen. Tarkista tallennetut luonnokset ja viimeisin toiminto ennen uudelleenkäynnistystä. Nykyiset julkaisuhyväksynnät säilyvät ennallaan.",
  "notifications.emailTitle": "Sähköpostiyhteenvedot",
  "notifications.emailDescription":
    "Saat uusista ilmoituksista yhden yhteenvedon enintään kerran tunnissa vahvistettuun tiliosoitteeseesi. Kukin tapahtuma esiintyy kerran.",
  "notifications.emailDisabled":
    "Sähköpostitoimitusta ei ole vielä aktivoitu. Sovelluksen ilmoitukset ovat käytettävissä.",
  "notifications.emailEnable": "Ota sähköpostiyhteenvedot käyttöön",
  "notifications.emailDisable": "Poista sähköpostiyhteenvedot käytöstä",
  "notifications.emailError": "Sähköpostiasetukset ovat tilapäisesti poissa käytöstä.",
  "notifications.emailSaveError": "Sähköpostiasetuksia ei voitu tallentaa.",
  "notifications.emailHistory": "Viimeaikainen sähköpostitoiminta",
  "notifications.emailStatus.pending": "Odottaa",
  "notifications.emailStatus.leased": "Tarkistetaan nykyistä tilaa",
  "notifications.emailStatus.sending": "Lähetetään",
  "notifications.emailStatus.accepted": "Sähköpostipalvelu hyväksyi lähetyksen",
  "notifications.emailStatus.unknown": "Toimituksen tulos on varmistettava",
  "notifications.emailStatus.cancelled": "Peruutettu",
  "notifications.emailStatus.failed": "Sähköpostia ei voitu valmistella",
  "notifications.title": "Ilmoitukset",
  "notifications.subtitle":
    "Tulevat päätöksesi ja julkaisuongelmat, tarkistettu palvelimen viimeisimmän tilan perusteella.",
  "notifications.loading": "Tarkistetaan suunnitelmaasi…",
  "notifications.empty": "Mikään toiminto ei tarvitse huomiotasi juuri nyt.",
  "notifications.error": "Ilmoitukset ovat tilapäisesti poissa käytöstä.",
  "notifications.stale":
    "Viimeisin tarkistus ei valmistunut. Nämä ovat viimeksi vahvistetut ilmoitukset.",
  "notifications.refresh": "Tarkista uudelleen",
  "notifications.read": "Merkitse luetuksi",
  "notifications.unread": "Lukematon",
  "notifications.saved": "Luettu",
  "notifications.open": "Avaa tehtävä",
  "notifications.calendar": "Avaa kalenteri",
  "notifications.project": "Projekti",
  "notifications.approval_due": "Hyväksynnän määräaika lähestyy",
  "notifications.publication_failed": "Julkaisu tarvitsee tarkistuksen",
  "notifications.manual_overdue": "Manuaalinen tehtävä on myöhässä",
  "notifications.cadence_gap": "Ensi viikko tarvitsee huomiota",
  "notifications.coverage": "{missing}/{total} suunnitellusta paikasta ei ole valmiina ja jonossa.",
  "notifications.failure":
    "Tarkista kohde ennen uudelleenyritystä: keskeytynyt julkaisu saattaa jo olla sivustolla.",
  "notifications.approval": "Tarkista nykyinen versio ennen sen suunniteltua määräaikaa.",
  "notifications.manual":
    "Suorita tämä tehtävä tai valitse uusi päivämäärä. Tämä määräaika koskee manuaalista tehtävää.",
  "notifications.readError": "Ilmoitusta ei voitu merkitä luetuksi. Yritä uudelleen.",
  "team.title": "Milon tiimi",
  "team.help": "Yksi työtila, jossa asiantuntijanäkymät todelliseen työhön ja projektin tietoihin.",
  "team.selectProject": "Valitse projekti nähdäksesi sen tiimin.",
  "team.scope":
    "Töiden tila kattaa valitun viikon. Tallennetut neuvot ja raportit ovat päivättyä näyttöä, eivät todiste aktiivisesta työstä tai parantuneista tuloksista.",
  "team.aiRole": "Tekoälyasiantuntija",
  "team.records": "{count} tallennettua tietotietuetta · tarkista tila projektin tiedoista",
  "team.lastDelivery": "Viimeisin toimitus tämän viikon töissä",
  "team.auditFetched": "Tallennettu sivustoauditointi",
  "team.auditPartial": "Tallennettu auditointi vain projektikontekstin perusteella",
  "team.adviceSaved": "Tallennetut tekoälyvalmiuden neuvot",
  "team.imports": "{count} tallennettua GSC-mittaustuontia",
  "team.measurementMissing": "Ei tallennettuja GSC-mittauksia",
  "team.authorityPrerequisite":
    "Palveluntarjoajan tiedot ja yhteydenottovaltuutus on tarkistettava Backlinks-työtilassa.",
  "team.lesson.title": "Muista toimituksellinen oppi",
  "team.lesson.help":
    "Kirjoita tämän projektin toistuva mieltymys. Tallentaminen tekee siitä nimenomaisen projektiohjeen soveltuvaan tulevaan työhön. Tavalliset artikkelimuokkaukset eivät luo oppeja. Tämä ei muodosta faktanäyttöä.",
  "team.lesson.rule": "Ohje tälle projektille",
  "team.lesson.target": "Sovella kohteeseen",
  "team.lesson.text": "Kirjoittaminen",
  "team.lesson.visual": "Visuaalinen sisältö",
  "team.lesson.both": "Kirjoittaminen ja visuaalinen sisältö",
  "team.lesson.save": "Tallenna projektiohje",
  "team.lesson.manage": "Tarkista, muokkaa tai poista tietoja",
  "team.lesson.saved":
    "Tallennettu tähän projektiin. Voit muokata, palauttaa tai peruuttaa sen projektin tiedoissa.",
  "team.lesson.unknown":
    "Tallennusta ei voitu vahvistaa. Tarkista projektin tiedot ennen ohjeen syöttämistä uudelleen.",
  "team.role.lead": "Milo — kasvun vetäjä",
  "team.description.lead": "Koordinoi tallennettua aikataulua, kattavuutta ja päätöksiä.",
  "team.open.lead": "Tarkista viikoittainen valmistelu",
  "team.role.brand": "Brändistrategi",
  "team.description.brand":
    "Projektin faktat, mieltymykset ja peruutettavat opit sekä lähde- ja tarkistushistoria.",
  "team.open.brand": "Tarkista projektin tiedot",
  "team.role.research": "Hakututkija",
  "team.description.research":
    "Viikoittaiset tutkimuskoosteet ja tallennetut mahdollisuudet. Tarkista lähteet ja oletukset ennen kirjoittamista.",
  "team.open.research": "Tarkista mahdollisuudet",
  "team.role.content": "Sisältöeditori",
  "team.description.content":
    "Säilytetyt artikkelit tarvitsevat edelleen toimituksellisen tarkistuksen ja täsmälleen kyseisen version julkaisuhyväksynnän.",
  "team.open.content": "Tarkista artikkelit",
  "team.role.image": "Visuaalisen sisällön tekijä",
  "team.description.image":
    "Visuaaliset ehdotukset käyttävät projektikontekstia. Säilyttäminen ei tarkoita kuvan hyväksyntää.",
  "team.open.image": "Tarkista artikkelin kuvat",
  "team.role.seo": "Hakukoneoptimoinnin asiantuntija",
  "team.description.seo":
    "Päivätyt sivukohtaiset, sisäisten linkkien ja paikallisten/kohdetietojen auditointihavainnot. Osittaiset auditoinnit säilyttävät rajoituksensa.",
  "team.open.seo": "Tarkista hakukoneoptimoinnin havainnot",
  "team.role.authority": "Ulkoiset linkit ja asiantuntija-asema",
  "team.description.authority":
    "Tutkimus, seuranta ja ehdotukset riippuvat varmennetusta palveluntarjoajapääsystä. Viestien lähettäminen ja julkaisupaikkojen ostaminen edellyttävät erillistä valtuutusta.",
  "team.open.authority": "Tarkista Backlinks-työtila",
  "team.role.ai": "Tekoälynäkyvyyden analyytikko",
  "team.description.ai":
    "Valmiusneuvot ovat erillisiä havaituista vastauksista, maininnoista ja viittauksista. Havaintoihin perustuvaa seurantaa ei vahvisteta tässä.",
  "team.open.ai": "Tarkista valmiusneuvot",
  "team.role.performance": "Tulosten analyytikko",
  "team.description.performance":
    "Tallennetut raportit ja päivätyt mittaukset. Puuttuva tieto on tuntematon; pelkkä ennen/jälkeen-muutos ei todista syy-yhteyttä.",
  "team.open.performance": "Tarkista mittaukset",
  "team.state.unavailable": "Tila ei ole saatavilla",
  "team.state.none": "Ei kirjattua työtä",
  "team.state.unknown": "Tulos epävarma — tarkista palautuminen",
  "team.state.running": "Työ on käynnissä",
  "team.state.review": "Omistajan muutokset tarvitsevat tarkistuksen",
  "team.state.retained": "Tulokset säilytetty tarkistettaviksi",
  "team.state.cancelled": "Valmistelu peruutettu",
  "collaboration.reviewImageLimits":
    "Nämä kuvat ylittävät tarkistusrajat tai niitä ei voi näyttää turvallisesti. Vähennä niiden määrää tai kokoa ja käytä staattisia PNG-, JPEG- tai WebP-kuvia.",
  "collaboration.emailInvitation": "Lähetä kutsu sähköpostitse",
  "collaboration.invitationEmailHelp":
    "Lähetä kutsu yllä näkyvään sähköpostiosoitteeseen näytetyllä roolilla. Sähköpostilinkin avaaminen ei anna käyttöoikeutta.",
  "collaboration.invitationEmailQueued":
    "Kutsusähköpostia pyydetty. Tarkista sen toimitustila täältä.",
  "collaboration.notificationHistory": "Ilmoitusten toimitushistoria",
  "collaboration.notificationSettings": "Projektin ilmoitukset",
  "collaboration.notificationConsentHelp":
    "Sekä omistajan määritys että oma suostumuksesi vaaditaan. Projektisi roolin muutokset edellyttävät asetusten uusimista.",
  "collaboration.notificationAssigned": "Omistaja on määrittänyt",
  "collaboration.notificationNotAssigned": "Omistaja ei ole määrittänyt",
  "collaboration.notificationOptedIn": "Vastaanottaja on antanut suostumuksen",
  "collaboration.notificationOptedOut": "Vastaanottaja ei ole antanut suostumusta",
  "collaboration.notificationAssign": "Määritä ilmoitukset",
  "collaboration.notificationUnassign": "Poista määritys",
  "collaboration.notificationOptIn": "Salli projektin ilmoitukset",
  "collaboration.notificationOptOut": "Poista projektin ilmoitukset käytöstä",
  "collaboration.decisionRecorded": "Tarkistuspäätös kirjattu.",
  "collaboration.decisionUnknown":
    "Päätöstä ei voitu vahvistaa. Päivitä aiemmat päätökset ennen uudelleenyritystä.",
  "collaboration.reviewNotAllowed":
    "Nykyinen roolisi tai projektin käytäntö ei salli tarkistuspäätöksiä.",
  "collaboration.acknowledgeReview":
    "Olen tarkistanut tämän esikatsellun luonnoksen ja kaikki sen kuvat.",
  "collaboration.approveVersion": "Hyväksy tämä versio",
  "collaboration.returnForChanges": "Palauta muutoksia varten",
  "collaboration.reviewDoesNotPublish":
    "Tarkistuksen kirjaaminen ei julkaise luonnosta eikä jatka pidossa olevaa ajastusta.",
  "collaboration.reviewHistory": "Aiemmat tarkistuspäätökset",
  "collaboration.approvalRecorded": "Hyväksyntä kirjattu",
  "collaboration.changesRequested": "Muutoksia pyydetty",
  "collaboration.owner": "Omistaja",
  "collaboration.collaborator": "Yhteistyökumppani",
  "collaboration.renderedReview": "Tarkistus esikatselussa",
  "collaboration.loadingReview": "Ladataan koko tarkistusta ja sen kuvia…",
  "collaboration.incompleteReview":
    "Koko tarkistusta ei voitu ladata. Päivitä tarkistaaksesi luonnoksen ja kaikki sen kuvat.",
  "collaboration.policyTitle": "Hyväksyntäkäytäntö",
  "collaboration.policyHelp":
    "Valitse, kuka voi hyväksyä projektin työtä. Tämän käytännön muuttaminen peruuttaa nykyiset yhteistyökumppanien hyväksynnät; erilliset omistajan hyväksynnät säilyvät.",
  "collaboration.policyUnselected": "Ei valittu — yhteistyökumppanien hyväksyntä ei ole käytössä",
  "collaboration.policy.disabled": "Vain omistajan hyväksynnät",
  "collaboration.policy.separate_reviewers":
    "Erilliset tarkistajat hyväksyvät; muokkaajat muokkaavat",
  "collaboration.policy.editors_can_approve": "Muokkaajat ja tarkistajat voivat hyväksyä",
  "collaboration.savePolicy": "Tallenna hyväksyntäkäytäntö",
  "collaboration.editDraft": "Muokkaa luonnosta",
  "collaboration.editHelp":
    "Tallentaminen palauttaa tämän luonnoksen tarkistukseen ja peruuttaa sen aiemman julkaisuhyväksynnän.",
  "collaboration.editConflict":
    "Tallennettu luonnos tai roolisi muuttui. Kopioi säilytettävät muokkaukset ennen uusimman tallennetun version lataamista.",
  "collaboration.loadLatest": "Lataa uusin tallennettu versio",
  "collaboration.draftSaved": "Luonnos tallennettu tarkistettavaksi.",
  "collaboration.editError":
    "Luonnosta ei voitu tallentaa. Muokkauksesi ovat yhä täällä; tarkista nykyinen versio ja käyttöoikeutesi ennen uudelleenyritystä.",
  "collaboration.saveDraft": "Tallenna tarkistettavaksi",
  "collaboration.question": "Kysymys",
  "collaboration.answer": "Vastaus",
  "collaboration.removeQuestion": "Poista kysymys",
  "collaboration.addQuestion": "Lisää kysymys",
  "collaboration.field.title": "Otsikko",
  "collaboration.field.h1": "Pääotsikko",
  "collaboration.field.metaTitle": "Hakutuloksen otsikko",
  "collaboration.field.metaDescription": "Hakutuloksen kuvaus",
  "collaboration.field.markdown": "Artikkeli (Markdown)",
  "collaboration.field.cta": "Toimintakehote",
  "collaboration.field.outline": "Runko — yksi otsikko per rivi",
  "collaboration.field.faq": "Kysymykset ja vastaukset",
  "collaboration.comments": "Kommentit",
  "collaboration.commentLabel": "Kommenttisi",
  "collaboration.addComment": "Lisää kommentti",
  "collaboration.you": "Sinä",
  "collaboration.commentRoleAtPosting": "Rooli kommentointihetkellä",
  "collaboration.earlierVersion": "Kommentti aiempaan tallennettuun versioon.",
  "collaboration.title": "Projektin yhteistyökumppanit",
  "collaboration.subtitle": "Hallinnoi projektin käyttöoikeuksia ja avaa kanssasi jaettua työtä.",
  "collaboration.owned": "Hallinnoi projektiasi",
  "collaboration.shared": "Jaettu kanssasi",
  "collaboration.invitations": "Kutsusi",
  "collaboration.members": "Henkilöt, joilla on käyttöoikeus",
  "collaboration.pending": "Projektin kutsut",
  "collaboration.email": "Sähköpostiosoite",
  "collaboration.role": "Rooli",
  "collaboration.viewer": "Katselija",
  "collaboration.editor": "Muokkaaja",
  "collaboration.reviewer": "Tarkistaja",
  "collaboration.invite": "Luo kutsu",
  "collaboration.inviteHelp":
    "Kutsu näkyy täällä, kun vastaanottaja kirjautuu tällä vahvistetulla sähköpostiosoitteella. Se vanhenee seitsemän päivän kuluttua. Tämä toiminto ei lähetä sähköpostia.",
  "collaboration.accept": "Hyväksy kutsu",
  "collaboration.revoke": "Peruuta kutsu",
  "collaboration.remove": "Poista käyttöoikeus",
  "collaboration.saveRole": "Tallenna rooli",
  "collaboration.refresh": "Päivitä",
  "collaboration.open": "Avaa projekti",
  "collaboration.loading": "Ladataan projektin käyttöoikeuksia…",
  "collaboration.error": "Käyttöoikeutta ei voitu vahvistaa. Päivitä ennen uudelleenyritystä.",
  "collaboration.saved": "Projektin käyttöoikeudet päivitetty.",
  "collaboration.empty": "Ei vielä näytettävää.",
  "collaboration.noOwned": "Voit avata alta jaettuja projekteja luomatta omaa projektia.",
  "collaboration.drafts": "Projektin luonnokset",
  "collaboration.back": "Takaisin luonnoksiin",
  "collaboration.previous": "Edellinen",
  "collaboration.next": "Seuraava",
  "collaboration.removed": "Poistettu",
  "collaboration.expires": "Vanhenee",
  "collaboration.history": "Viimeaikaiset käyttöoikeustapahtumat",
  "collaboration.pendingState": "Odottaa",
  "collaboration.expired": "Vanhentunut",
  "collaboration.accepted": "Hyväksytty",
  "collaboration.revoked": "Peruutettu",
  "emailSettings.language": "Sähköpostin kieli",
  "emailSettings.note":
    "Valitse operatiivisten yhteenvetojen, kuukausiraporttien ja pyytämiesi projektikutsujen kieli. Tämä ei muuta sovelluksen, artikkelien tai markkina-alueen asetuksia. Kielen tallentaminen ei ota sähköpostia käyttöön eikä lähetä sitä.",
  "emailSettings.save": "Tallenna sähköpostin kieli",
  "emailSettings.saved": "Sähköpostiasetukset tallennettu.",
  "emailSettings.uncertain":
    "Tallennettuja asetuksia ei voitu vahvistaa. Lataa ne uudelleen ennen seuraavaa muutosta; viimeisin muutoksesi on ehkä jo tallennettu.",
  "emailSettings.reload": "Lataa tallennetut asetukset uudelleen (hylkää muokkaukset)",
};
