/** Finnish authoring only; not registered in the runtime or language picker. */
export const fiLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Link Growth Network",
  "linknet.subtitle":
    "Löydä sopivia sivustoja Milon verkostosta, lähetä henkilökohtainen esittely ja anna Milon varmistaa, että linkki on todella julkaistu.",
  "linknet.policyNote":
    "Olennaisuus on etusijalla: osumat edellyttävät yhteisiä aiheita, suorat linkinvaihdot merkitään ja mitään ei sijoiteta automaattisesti. Nämä tarkistukset eivät takaa hakukoneiden käytäntöjen noudattamista.",
  "linknet.topics": "Aiheet",
  "linknet.topicsPlaceholder": "Aiheet (pilkuilla erotettuna)",
  "linknet.contact": "Yhteyssähköposti",
  "linknet.contactPlaceholder": "Yhteyssähköposti kumppaneille",
  "linknet.join": "Liity verkostoon",
  "linknet.update": "Päivitä listaus",
  "linknet.pause": "Keskeytä",
  "linknet.joined": "Listattu — kumppanit voivat nyt löytää tämän sivuston.",
  "linknet.paused": "Listaus keskeytetty.",
  "linknet.find": "Etsi kumppaneita",
  "linknet.noMatches":
    "Ei vielä sopivia kumppaneita — verkosto kasvaa jokaisen liittyvän Milo-sivuston myötä.",
  "linknet.score": "Osuma",
  "linknet.copyIntro": "Kopioi esittelysähköposti",
  "linknet.introCopied": "Esittely kopioitu — liitä se sähköpostiisi.",
  "linknet.markContacted": "Merkitse yhteydenotto tehdyksi",
  "linknet.markAgreed": "Merkitse sovituksi",
  "linknet.decline": "Hylkää",
  "linknet.targetUrlPlaceholder": "Sovitun sivun URL (jolle linkki tulee)",
  "linknet.verify": "Varmenna linkki",
  "linknet.verified": "Linkki löytyi — sijoitus on julkaistu ja varmennettu.",
  "linknet.notFound": "Sivulta ei vielä löytynyt linkkiä — tarkistettu ja kirjattu.",
  "linknet.liveSince": "Julkaistu alkaen",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Viimeisin tarkistus: linkkiä ei löytynyt",
  "linknet.reciprocalWarn":
    "Tämä loisi suoran linkinvaihdon tämän sivuston kanssa. Tarkista sen olennaisuus ja vältä liiallisia vaihtoja.",
  "linknet.status.suggested": "Ehdotettu",
  "linknet.status.contacted": "Otettu yhteyttä",
  "linknet.status.agreed": "Sovittu",
  "linknet.status.live_verified": "Julkaistu ✓",
  "linknet.status.declined": "Hylätty",
  "backlinks.title": "Backlinks",
  "backlinks.subtitle":
    "Todellisia ulkoisten linkkien tietoja verkkotunnuksellesi — profiilin vahvuus, erot kilpailijoiden linkkeihin ja turvalliset linkkien hankintasuositukset.",
  "backlinks.disclaimer":
    "Linkkimittarit tulevat ulkoisesta linkki-indeksistä ja ovat arvioita — mikään indeksi ei näe kaikkia linkkejä. Suositukset ovat vain hyväksyttävien käytäntöjen mukaisia ehdotuksia: Milo ei koskaan ehdota linkkijärjestelyjä tai ilmoittamattomia maksullisia linkkejä eikä takaa hakusijoituksia, liikennettä tai tuloja.",
  "backlinks.run": "Suorita linkkianalyysi",
  "backlinks.rerun": "Päivitä analyysi",
  "backlinks.running": "Analysoidaan…",
  "backlinks.empty":
    "Suorita linkkianalyysi nähdäksesi verkkotunnuksesi todellisen linkkiprofiilin, vertailun kilpailijoihin ja verkkotunnukset, jotka linkittävät kilpailijoihin mutta eivät sinuun.",
  "backlinks.notConfigured.title": "Yhdistä ulkoisten linkkien tietolähde",
  "backlinks.notConfigured.body":
    "Tämä moduuli käyttää DataForSEO-linkki-indeksiä, eikä sitä ole vielä yhdistetty. Työtilan omistajan on luotava käytön mukaan laskutettava DataForSEO-tili ja lisättävä DATAFORSEO_LOGIN ja DATAFORSEO_PASSWORD taustapalvelun salaisuuksiksi. Siihen asti linkkitiedot eivät ole saatavilla.",
  "backlinks.status.ready.title": "DataForSEO toiminnassa",
  "backlinks.status.ready.body": "Backlinks API on yhdistetty ja vastaa.",
  "backlinks.status.lowBalance.title": "DataForSEO-saldo on vähissä",
  "backlinks.status.lowBalance.body": "Lisää saldoa pian välttääksesi analyysien keskeytymisen.",
  "backlinks.status.paused.title": "DataForSEO-käyttö on keskeytetty",
  "backlinks.status.paused.body":
    "Ota yhteyttä DataForSEO-tukeen tilin aktivoimiseksi ennen uuden analyysin suorittamista.",
  "backlinks.status.error.title": "DataForSEO-tila ei ole saatavilla",
  "backlinks.status.error.body":
    "Tiliä tai Backlinks API:a ei voitu varmentaa. Päivitä tila tai tarkista palveluntarjoajan hallintanäkymä.",
  "backlinks.status.balance": "Saldo: {balance}.",
  "backlinks.status.refresh": "Päivitä tila",
  "backlinks.competitorsUsed": "Verratut kilpailijat: {list}",
  "backlinks.competitorsFromAnalysis":
    "Käytetään viimeisimmän Kilpailijat-analyysin kilpailijoita: {list}",
  "backlinks.noCompetitors":
    "Projektilla ei ole kilpailijoiden URL-osoitteita — analyysi kattaa vain oman profiilisi. Lisää kilpailijoita projektin asetuksissa tai Kilpailijat-moduulissa saadaksesi linkkierot näkyviin.",
  "backlinks.lastRun": "Viimeksi analysoitu: {date}",
  "backlinks.score.overall": "Linkkiasema",
  "backlinks.score.profile": "Profiilin vahvuus",
  "backlinks.score.gap": "Ero kilpailijoihin",
  "backlinks.score.quality": "Linkkien laatu",
  "backlinks.gapHint": "suurempi = enemmän saavutettavaa",
  "backlinks.summaryHeading": "Yhteenveto",
  "backlinks.topActions": "Tärkeimmät linkkitoimet",
  "backlinks.profileTable": "Verkkotunnuksesi suhteessa kilpailijoihin",
  "backlinks.table.domain": "Verkkotunnus",
  "backlinks.table.rank": "Verkkotunnuksen luokitus",
  "backlinks.table.backlinks": "Ulkoiset linkit",
  "backlinks.table.referringDomains": "Viittaavat verkkotunnukset",
  "backlinks.table.broken": "Rikkinäiset",
  "backlinks.table.spam": "Roskapostipisteet",
  "backlinks.table.notFetched": "Tietoja ei voitu hakea",
  "backlinks.you": "Sinä",
  "backlinks.gapHeading": "Linkkiero — ne linkittävät kilpailijoihin, eivät sinuun",
  "backlinks.gapNote":
    "Palveluntarjoajan indeksistä pyydetty otos, josta verkkotunnuksesi on suljettu pois. Tämä ei riippumattomasti varmista, ettei näillä sivustoilla ole linkkejä sinuun.",
  "backlinks.gap.linksTo": "Linkittää kohteeseen",
  "backlinks.gapEmpty":
    "Linkkieroa ei löytynyt — kilpailijoita ei joko haettu tai päällekkäisyyttä ei ollut.",
  "backlinks.referringHeading": "Tärkeimmät sinuun linkittävät verkkotunnukset",
  "backlinks.referringEmpty":
    "Indeksistä ei vielä löytynyt viittaavia verkkotunnuksia — uusi verkkotunnus aloittaa usein nollasta.",
  "backlinks.recommendations": "Suositukset",
  "backlinks.effort": "Työmäärä",
  "backlinks.target": "Kohde / alusta",
  "backlinks.approach": "Lähestymistapa",
  "backlinks.action.convert": "Luo mahdollisuus",
  "backlinks.action.converted": "Mahdollisuus luotu",
  "backlinks.action.convertTop": "Muuta tärkeimmät suositukset mahdollisuuksiksi",
  "backlinks.toast.done": "Linkkianalyysi valmis",
  "backlinks.toast.converted": "Mahdollisuus luotu",
  "backlinks.toast.convertedTop": "{count} mahdollisuutta luotu",
  "backlinks.category.linkGapTargets": "Linkkierojen kohteet",
  "backlinks.category.contentForLinks": "Sisältöä linkkien hankintaan",
  "backlinks.category.digitalPr": "Digitaalinen PR",
  "backlinks.category.partnerships": "Kumppanuudet ja sponsorointi",
  "backlinks.category.directories": "Hakemistot ja profiilit",
  "backlinks.category.linkHygiene": "Linkkien ylläpito",
  "marketplace.title": "Sponsoroidut julkaisut",
  "marketplace.subtitle":
    "Yhdistä linkkimahdollisuudet läpinäkyviin, toimituksellisesti tarkistettuihin sponsoroituihin julkaisupaikkoihin.",
  "marketplace.disclosureTitle": "Hyväksyttäviä käytäntöjä noudattava markkinapaikka.",
  "marketplace.disclosure":
    'Jokainen pyyntö edellyttää selkeää sponsorointimerkintää ja rel="sponsored"-määritettä. Pyyntö ei ole ostos eikä koskaan takaa hakusijoituksia, liikennettä tai tuloja.',
  "marketplace.demoNoticeTitle": "Esikatseluluettelo.",
  "marketplace.demoNotice":
    "Alla olevat verkkotunnukset, mittarit ja hinnat ovat demotietoja Linkhouse API -pääsyä odotettaessa. Pyynnöt tallennetaan vain Miloon tarkistettaviksi; palveluntarjoajan tilausta tai maksua ei luoda.",
  "marketplace.demoBadge": "Demo",
  "marketplace.integrationTitle": "Linkhouse-integraatio",
  "marketplace.integrationLive":
    "Palveluntarjoajan luettelo on yhdistetty. Jokainen maksullinen tilaus edellyttää silti täsmällisen loppusumman vahvistamista.",
  "marketplace.integrationPending":
    "Tuotannon rajapintasopimus on valmis; rajapintaosoitteiden määritys ja tunnistetiedot odottavat Linkhousen dokumentaatiota.",
  "marketplace.catalogConnected": "Todellinen luettelo",
  "marketplace.catalogDemo": "Demoluettelo",
  "marketplace.orderingEnabled": "Tilaaminen käytössä",
  "marketplace.orderingLocked": "Tilaaminen lukittu",
  "marketplace.offers": "Tarjoukset",
  "marketplace.orders": "Pyynnöt",
  "marketplace.search": "Hae verkkotunnuksia tai aiheita…",
  "marketplace.noAnalysis":
    "Suorita Backlink Intelligence lisätäksesi linkkierosignaalit kohdistukseen. Aihe- ja markkinakohdistus on jo käytössä.",
  "marketplace.reason.linkGap": "Kilpailijan linkkiero",
  "marketplace.rank": "Verkkotunnuksen luokitus",
  "marketplace.traffic": "Arvioitu liikenne",
  "marketplace.turnaround": "Toimitusaika",
  "marketplace.days": "{count} päivää",
  "marketplace.price": "Ohjeellinen hinta",
  "marketplace.request": "Pyydä tarkistusta",
  "marketplace.reviewPrice": "Tarkista hinta",
  "marketplace.quoteLocked": "Hintatarjouksen määritys tarvitaan",
  "marketplace.requested": "Pyydetty",
  "marketplace.quoteTitle": "Tarkista julkaisun hinta",
  "marketplace.basePrice": "Palveluntarjoajan hinta",
  "marketplace.serviceFee": "Milon palvelumaksu ({count}%)",
  "marketplace.totalPrice": "Täsmällinen loppusumma",
  "marketplace.quoteExpires":
    "Tämä hintatarjous vanhenee {time}. Sen jälkeen tarvitaan uusi tarjous.",
  "marketplace.confirmSponsored":
    'Edellytän selkeää sponsorointimerkintää ja linkille rel="sponsored"- tai nofollow-määritettä.',
  "marketplace.confirmPaymentLive":
    "Valtuutan nimenomaisesti palveluntarjoajan tilauksen täsmällisellä loppusummalla €{total}.",
  "marketplace.confirmPaymentDemo":
    "Vahvistan €{total} tarkistuspyynnön ja ymmärrän, ettei demotila luo palveluntarjoajan tilausta tai maksua.",
  "marketplace.confirmPurchase": "Vahvista maksullinen tilaus",
  "marketplace.confirmDemoRequest": "Tallenna tarkistuspyyntö",
  "marketplace.confirmedAt": "Vahvistettu",
  "marketplace.ordersEmpty": "Ei vielä julkaisupyyntöjä.",
  "marketplace.toast.exists": "Tällä tarjouksella on jo aktiivinen pyyntö.",
  "marketplace.toast.requested": "Julkaisupyyntö tallennettu tarkistettavaksi.",
  "marketplace.toast.submitted": "Maksullinen tilaus lähetetty palveluntarjoajalle.",
  "marketplace.toast.catalogError":
    "Palveluntarjoajan luetteloa ei voitu päivittää. Turvallinen demoluettelo on edelleen käytettävissä.",
  "marketplace.toast.quoteError": "Hintatarjousta ei voitu valmistella. Yritä uudelleen.",
  "marketplace.toast.quoteExpired": "Hintatarjous vanhentui. Pyydä uusi hinta ennen vahvistamista.",
  "marketplace.toast.orderError": "Tilausta ei luotu. Maksua ei tehty.",
  "marketplace.toast.orderReview":
    "Palveluntarjoajan tulosta ei voitu vahvistaa. Milo tallensi pyynnön tarkistettavaksi; älä yritä uudelleen ennen tilanteen selvittämistä.",
  "marketplace.status.Requested": "Pyydetty",
  "marketplace.status.In Review": "Tarkistuksessa",
  "marketplace.status.Submitted": "Lähetetty",
  "marketplace.status.Accepted": "Hyväksytty",
  "marketplace.status.Published": "Julkaistu",
  "marketplace.status.Failed": "Epäonnistui",
  "marketplace.status.Cancelled": "Peruutettu",
  "backlinks.integrity.partial": "Osittaiset mittarit",
  "backlinks.integrity.source":
    "Ilmoitettu lähde: DataForSEO-indeksi tallennettuna analyysipäivänä näytetyille verkkotunnuksille aliverkkotunnuksineen. Tallennettujen työtilatietojen lähdemerkinnät eivät ole riippumaton varmennus. — tarkoittaa puuttuvaa tietoa, ei koskaan nollaa. Indeksin kattavuus on puutteellinen; nämä eivät ole kohteiden ajantasaisia tarkistuksia.",
  "backlinks.integrity.legacy":
    "Vanha analyysi säilytetty. Aiempi normalisointi saattoi muuttaa puuttuvat tiedot nolliksi, joten numeerinen perusta ei ole saatavilla. Alkuperäiset suositukset säilyvät historiallisina neuvoina.",
  "backlinks.integrity.scores":
    "Pisteet ja suositukset ovat tekoälyn arvioita saatavilla olevasta näytöstä, eivät palveluntarjoajan mittauksia, hakusijoitustakuita tai mitattuja tuloksia.",
  "backlinks.integrity.sample":
    "Rajattu tärkeimpien verkkotunnusten otos. Pois jätetyt verkkotunnukset eivät todista puuttuvia tai menetettyjä linkkejä; jatkuvaa seurantaa ei vahvisteta.",
  "backlinks.integrity.failed":
    "Pyyntö epäonnistui. Tämä taulukko ei ole saatavilla; se ei tarkoita nollaa ulkoista linkkiä tai linkkieron puuttumista.",
  "backlinks.integrity.not_requested":
    "Linkkiero-otosta ei pyydetty, koska kilpailijoiden verkkotunnuksia ei annettu.",
  "backlinks.integrity.unknown": "Taulukon keruutila on tuntematon.",
  "backlinks.integrity.empty":
    "Ei näytettäviä rivejä. Tarkista keruutila yllä ennen taulukon tulkitsemista.",
  "backlinkMonitor.website_changed":
    "Näytetty sivusto ei vastaa tallennettua projektia. Tallenna tai lataa projekti uudelleen ennen keruuta. Keruuta ei aloitettu.",
  "backlinkMonitor.unavailable":
    "Keruu ei ole käytettävissä, ennen kuin palveluntarjoajan tila vahvistaa aktiivisen tilin ja käytettävissä olevan saldon. Tallennettu historia säilyy saatavilla.",
  "backlinkMonitor.yes": "Kyllä",
  "backlinkMonitor.no": "Ei",
  "backlinkMonitor.title": "Ulkoisten linkkien historia",
  "backlinkMonitor.note":
    "Päivittäiset määrät DataForSEO-indeksistä tallennetulle sivustolle. Puuttuva tieto näytetään merkkinä —, ei koskaan nollana. Nämä havainnot eivät varmista yksittäisiä linkkisijoituksia. Jokainen pyyntö käyttää määritettyä toimittajakiintiötä. Toistuvaa keruuta hallitaan erikseen yllä.",
  "backlinkMonitor.from": "Alkaen (UTC)",
  "backlinkMonitor.to": "Asti (UTC)",
  "backlinkMonitor.subdomains": "Sisällytä aliverkkotunnukset",
  "backlinkMonitor.run": "Pyydä päivittäiset määrät",
  "backlinkMonitor.running": "Kerätään…",
  "backlinkMonitor.new": "Aloita toinen pyyntö",
  "backlinkMonitor.refresh": "Päivitä historia",
  "backlinkMonitor.loading": "Ladataan tallennettua historiaa…",
  "backlinkMonitor.empty": "Ei vielä tallennettuja pyyntöjä.",
  "backlinkMonitor.error": "Historia ei ole saatavilla. Yritä päivittää.",
  "backlinkMonitor.uncertain":
    "Tulosta ei ole vahvistettu. Päivitä tallennettu historia ennen uuden pyynnön aloittamista; tämä ei tarkoita, ettei toimittaja veloittanut mitään.",
  "backlinkMonitor.stored": "Havainto tallennettu.",
  "backlinkMonitor.existing": "Tämä pyyntö on jo olemassa. Tarkista sen tallennettu tila alta.",
  "backlinkMonitor.held":
    "Pyyntö pidossa. Tarkista tallennettu historia ennen uuden pyynnön aloittamista.",
  "backlinkMonitor.reserved": "Varattu",
  "backlinkMonitor.dispatched": "Kerätään",
  "backlinkMonitor.succeeded": "Tallennettu",
  "backlinkMonitor.unknown": "Vahvistamatta",
  "backlinkMonitor.pending": "Odottaa",
  "backlinkMonitor.settled": "Täsmäytetty",
  "backlinkMonitor.recover": "Palauta kulukirjaus",
  "backlinkMonitor.recovered": "Kulukirjaus palautettu tallennetusta toimittajatietueesta.",
  "backlinkMonitor.recoveryFailed":
    "Kulukirjausta ei voitu palauttaa. Tallennettu havainto on edelleen saatavilla.",
  "backlinkMonitor.date": "Päivämäärä (UTC)",
  "backlinkMonitor.newLinks": "Uudet ulkoiset linkit",
  "backlinkMonitor.lostLinks": "Menetetyt ulkoiset linkit",
  "backlinkMonitor.newDomains": "Uudet viittaavat verkkotunnukset",
  "backlinkMonitor.lostDomains": "Menetetyt viittaavat verkkotunnukset",
  "backlinkMonitor.newMainDomains": "Uudet viittaavat pääverkkotunnukset",
  "backlinkMonitor.lostMainDomains": "Menetetyt viittaavat pääverkkotunnukset",
  "backlinkMonitor.reported": "Ilmoitettu",
  "backlinkMonitor.partial": "Osittainen",
  "backlinkMonitor.missing": "Puuttuu",
  "backlinkMonitor.accounting": "Kulukirjaus",
  "backlinkMonitor.observed": "Havaittu",
  "backlinkMonitor.request": "Pyyntö",
  "backlinkMonitor.invalid":
    "Valitse kelvollinen 1–92 päivän jakso, joka päättyy viimeistään tänään.",
  "backlinkDetails.title": "Yksittäisten ulkoisten linkkien näyttö",
  "backlinkDetails.note":
    "Edustavia linkkejä DataForSEO-indeksistä, enintään 100 per pyyntö. Ensimmäisen ja viimeisen havainnon päivämäärät kuvaavat indeksiä; todelliset sijoitus- ja poistopäivät ovat tuntemattomia. Tämä ei ole täydellinen linkkiluettelo. Pyynnöt kuluttavat määritettyä toimittajakiintiötä.",
  "backlinkDetails.run": "Kerää linkkitiedot",
  "backlinkDetails.selection": "Päivämäärävalinta",
  "backlinkDetails.first_seen": "Havaittu ensimmäisen kerran jaksolla",
  "backlinkDetails.lost_last_seen": "Ilmoitettu menetetyksi, viimeksi havaittu jaksolla",
  "backlinkDetails.limit": "Tulosten enimmäismäärä",
  "backlinkDetails.counts":
    "Näytetään {retained}/{returned} palautettua linkkiä; {total} palveluntarjoajan osumaa.",
  "backlinkDetails.partial":
    "Palveluntarjoajalla on lisää tuloksia tai näyttöä on jätetty pois. Kukin sivu on erillinen havainto, ja ajantasainen indeksi voi muuttua sivujen välillä.",
  "backlinkDetails.noLinks": "Tälle pyynnölle ei ole säilytettyjä linkkejä.",
  "backlinkDetails.source": "Viittaava sivu",
  "backlinkDetails.target": "Kohde",
  "backlinkDetails.anchor": "Ankkuriteksti",
  "backlinkDetails.first": "Ensimmäinen havainto (UTC)",
  "backlinkDetails.last": "Viimeisin havainto (UTC)",
  "backlinkDetails.rank": "Palveluntarjoajan luokitus",
  "backlinkDetails.spam": "Roskapostipisteet",
  "backlinkDetails.lost": "Ilmoitettu menetetyksi",
  "backlinkDetails.offset": "Ohita tuloksia (0–20 000)",
  "backlinkDetails.page":
    "Sivu {page} · {count} riviä havaittu tässä sarjassa. Määrät voivat sisältää toistuvia linkkejä eivätkä osoita täydellistä luetteloa.",
  "backlinkDetails.next": "Kerää seuraava sivu (käyttää kiintiötä)",
  "backlinkDetails.nextNote":
    "Jatka samalla sivustolla ja samoilla suodattimilla. Tämä tekee yhden uuden toimittajapyynnön ja käyttää määritettyä kiintiötä.",
  "backlinkDetails.child":
    "Seuraavan sivun pyyntö on jo luotu; päivitä historia tarkistaaksesi sen tuloksen",
  "backlinkDetails.pageLimit":
    "Tämän sarjan 10 000 sivun raja on saavutettu. Lisää osumia voi olla jäljellä.",
  "backlinkRecurring.title": "Jatkuva ulkoisten linkkien seuranta",
  "backlinkRecurring.note":
    "Kerää uusien ja menetettyjen ulkoisten linkkien määrät tälle tallennetulle sivustolle päivittäin tai viikoittain. Kukin ajo kattaa kokonaisia UTC-päiviä DataForSEO-indeksistä. Väliin jääneet ajot ohitetaan; havainnot eivät varmista yksittäisiä sijoituksia tai täydellistä verkkoluetteloa.",
  "backlinkRecurring.loading": "Ladataan tallennettuja seuranta-asetuksia…",
  "backlinkRecurring.error":
    "Seuranta-asetukset eivät ole saatavilla. Lataa uudelleen yrittääksesi uudelleen.",
  "backlinkRecurring.enabled":
    "Seuranta käytössä — jokainen keruu tarvitsee silti käytettävissä olevaa toimittajarahoitusta.",
  "backlinkRecurring.paused": "Seuranta tauolla. Uutta automaattista keruuta ei ole käytössä.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} varattu tai käytetty tämän seurannan {cap} rajasta.",
  "backlinkRecurring.unsettled":
    "Aiemman pyynnön tulos tai kustannus on selvittämättä. Uusi automaattinen keruu on pidossa. Tarkista historia; tallennetut onnistuneet tulokset voivat tarjota kulukirjauksen palautuksen. Lähetettyä pyyntöä ei toisteta automaattisesti.",
  "backlinkRecurring.capHeld":
    "Jäljellä oleva kuukausiraja ei riitä yhteen kokonaiseen pyyntöön. Keruu odottaa seuraavaa UTC-kuukautta tai tallennettua rajamuutosta.",
  "backlinkRecurring.changedWebsite":
    "Sivusto on muuttunut. Tallenna seuranta-asetukset projektin nykyiselle tallennetulle sivustolle tai lataa projekti uudelleen, jos näytetty sivusto on vanhentunut. Nykyiset kulut säilyvät.",
  "backlinkRecurring.next":
    "Seuraava määräaika (UTC): {date}. Keruu alkaa myöhemmässä ajastimen tarkistuksessa, kun rahoitus- ja tilitarkistukset läpäistään.",
  "backlinkRecurring.pause": "Keskeytä seuranta",
  "backlinkRecurring.unavailable":
    "Toimittajakeruu ei ole nyt käytettävissä. Voit keskeyttää seurannan ja tarkastella tallennettua historiaa. Käyttöönotto edellyttää vahvistettua aktiivista toimittajatiliä, jolla on käytettävissä saldoa.",
  "backlinkRecurring.settings": "Seuranta-asetukset",
  "backlinkRecurring.enable": "Ota automaattinen keruu käyttöön",
  "backlinkRecurring.cadence": "Toistuvuus",
  "backlinkRecurring.daily": "Päivittäin",
  "backlinkRecurring.weekly": "Viikoittain",
  "backlinkRecurring.days": "Kokonaiset UTC-päivät ajoa kohti",
  "backlinkRecurring.cap": "Toimittajan kuukausiraja (USD)",
  "backlinkRecurring.save": "Tallenna seuranta-asetukset",
  "backlinkRecurring.allowance":
    "Tämä raja koskee vain tätä seurantaa; sen tallentaminen ei lisää tilin varoja. Anna 0–100 USD enintään kuudella desimaalilla. Käyttöönotto tarvitsee vähintään 0.024 USD sekä 0.000036 USD jakson päivää kohti. Myös tilin ja jaetut toimittajarajat pätevät. Keskeyttäminen estää uudet lähetykset; jo hyväksytty keruu voi silti valmistua ja aiheuttaa varatun kustannuksen.",
  "backlinkRecurring.invalid":
    "Anna 1–92 kokonaista päivää ja kelvollinen USD-raja. Käytössä olevan rajan on katettava vähintään yksi kokonainen pyyntö.",
  "backlinkRecurring.saved": "Seuranta-asetukset tallennettu.",
  "backlinkRecurring.uncertain":
    "Tallennusta ei ole vahvistettu. Lataa tallennetut asetukset uudelleen ennen seuraavaa muutosta; aiempi muutos on ehkä jo tallennettu.",
  "backlinkRecurring.refresh": "Lataa tallennetut asetukset uudelleen (hylkää muokkaukset)",
  "backlinkRecurring.history": "Katso tallennetut pyynnöt ja kulukirjaukset alta",
  "backlinkRecurring.scheduled": "Ajastettu ajo",
  "backlinkRecurring.manual": "Manuaalinen pyyntö",
  "backlinkRecurring.occurrence": "Ajastettu ajankohta (UTC)",
  "backlinkRecurring.undispatched":
    "Tätä ajastettua pyyntöä ei hyväksytty lähetettäväksi toimittajalle. Sen seurantakiintiö vapautetaan.",
};
