/** Dutch authoring only; excluded from runtime. */
export const nlLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Link Growth Network",
  "linknet.subtitle":
    "Vind relevante websites in het Milo-netwerk, stuur een persoonlijke introductie en laat Milo verifiëren of de link daadwerkelijk live staat.",
  "linknet.policyNote":
    "Relevantie staat voorop: matches vereisen gedeelde onderwerpen, directe linkruil wordt gemarkeerd en niets wordt automatisch geplaatst. Deze controles garanderen geen naleving van zoekmachinebeleid.",
  "linknet.topics": "Onderwerpen",
  "linknet.topicsPlaceholder": "Onderwerpen (gescheiden door komma's)",
  "linknet.contact": "E-mailadres contactpersoon",
  "linknet.contactPlaceholder": "E-mailadres voor partners",
  "linknet.join": "Deelnemen aan het netwerk",
  "linknet.update": "Vermelding bijwerken",
  "linknet.pause": "Pauzeren",
  "linknet.joined": "Vermeld — partners kunnen deze website nu vinden.",
  "linknet.paused": "Vermelding gepauzeerd.",
  "linknet.find": "Partners vinden",
  "linknet.noMatches":
    "Nog geen relevante partners — het netwerk groeit met elke Milo-website die deelneemt.",
  "linknet.score": "Match",
  "linknet.copyIntro": "Introductiemail kopiëren",
  "linknet.introCopied": "Introductie gekopieerd — plak deze in je e-mail.",
  "linknet.markContacted": "Markeren als contact opgenomen",
  "linknet.markAgreed": "Markeren als overeengekomen",
  "linknet.decline": "Afwijzen",
  "linknet.targetUrlPlaceholder": "Afgesproken pagina-URL (waar de link komt)",
  "linknet.verify": "Link verifiëren",
  "linknet.verified": "Link gevonden — plaatsing is live en geverifieerd.",
  "linknet.notFound": "Nog geen link gevonden op die pagina — gecontroleerd en vastgelegd.",
  "linknet.liveSince": "Live sinds",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Laatste controle: link niet gevonden",
  "linknet.reciprocalWarn":
    "Dit zou een directe linkruil met deze website opleveren. Beoordeel de relevantie en vermijd overmatige uitwisselingen.",
  "linknet.status.suggested": "Voorgesteld",
  "linknet.status.contacted": "Contact opgenomen",
  "linknet.status.agreed": "Overeengekomen",
  "linknet.status.live_verified": "Live ✓",
  "linknet.status.declined": "Afgewezen",
  "backlinks.title": "Backlinks",
  "backlinks.subtitle":
    "Echte backlinkgegevens voor je domein — profielsterkte, linkhiaten ten opzichte van concurrenten en veilige aanbevelingen voor linkbuilding.",
  "backlinks.disclaimer":
    "Backlinkstatistieken komen uit een externe linkindex en zijn schattingen — geen enkele index ziet elke link. Aanbevelingen zijn uitsluitend toegestane suggesties: Milo stelt nooit linkschema's of niet-vermelde betaalde links voor en garandeert geen posities, verkeer of omzet.",
  "backlinks.run": "Backlinkanalyse uitvoeren",
  "backlinks.rerun": "Analyse vernieuwen",
  "backlinks.running": "Analyseren…",
  "backlinks.empty":
    "Voer een backlinkanalyse uit om het echte linkprofiel van je domein te zien, hoe het zich verhoudt tot concurrenten en welke domeinen naar hen linken maar niet naar jou.",
  "backlinks.notConfigured.title": "Een backlinkgegevensbron koppelen",
  "backlinks.notConfigured.body":
    "Deze module gebruikt de DataForSEO-backlinkindex en is nog niet gekoppeld. De werkruimte-eigenaar moet een DataForSEO-account aanmaken (betalen naar gebruik) en DATAFORSEO_LOGIN en DATAFORSEO_PASSWORD als backendsecrets toevoegen. Tot die tijd zijn backlinkgegevens niet beschikbaar.",
  "backlinks.status.ready.title": "DataForSEO operationeel",
  "backlinks.status.ready.body": "De Backlinks API is verbonden en reageert.",
  "backlinks.status.lowBalance.title": "DataForSEO-tegoed raakt op",
  "backlinks.status.lowBalance.body": "Vul binnenkort aan om onderbroken analyses te voorkomen.",
  "backlinks.status.paused.title": "DataForSEO-toegang is gepauzeerd",
  "backlinks.status.paused.body":
    "Neem contact op met DataForSEO-ondersteuning om het account opnieuw te activeren voordat je een nieuwe analyse uitvoert.",
  "backlinks.status.error.title": "DataForSEO-status niet beschikbaar",
  "backlinks.status.error.body":
    "Het account of de Backlinks API kon niet worden geverifieerd. Vernieuw de status of controleer het providerdashboard.",
  "backlinks.status.balance": "Tegoed: {balance}.",
  "backlinks.status.refresh": "Status vernieuwen",
  "backlinks.competitorsUsed": "Vergeleken concurrenten: {list}",
  "backlinks.competitorsFromAnalysis":
    "Gebruikt concurrenten uit de laatste concurrentieanalyse: {list}",
  "backlinks.noCompetitors":
    "Geen concurrent-URL's in dit project — de analyse omvat alleen je eigen profiel. Voeg concurrenten toe in Projectinstellingen of de module Concurrenten om linkhiaten te onderzoeken.",
  "backlinks.lastRun": "Laatst geanalyseerd: {date}",
  "backlinks.score.overall": "Linkpositie",
  "backlinks.score.profile": "Profielsterkte",
  "backlinks.score.gap": "Verschil met concurrenten",
  "backlinks.score.quality": "Linkkwaliteit",
  "backlinks.gapHint": "hoger = meer te winnen",
  "backlinks.summaryHeading": "Samenvatting",
  "backlinks.topActions": "Belangrijkste linkacties",
  "backlinks.profileTable": "Je domein tegenover concurrenten",
  "backlinks.table.domain": "Domein",
  "backlinks.table.rank": "Domeinrang",
  "backlinks.table.backlinks": "Backlinks",
  "backlinks.table.referringDomains": "Verwijzende domeinen",
  "backlinks.table.broken": "Defect",
  "backlinks.table.spam": "Spamscore",
  "backlinks.table.notFetched": "Gegevens konden niet worden opgehaald",
  "backlinks.you": "Jij",
  "backlinks.gapHeading": "Linkhiaat — zij linken naar concurrenten, niet naar jou",
  "backlinks.gapNote":
    "Steekproef uit de providerindex aangevraagd met uitsluiting van je domein. Dit verifieert niet onafhankelijk dat deze websites geen links naar jou hebben.",
  "backlinks.gap.linksTo": "Linkt naar",
  "backlinks.gapEmpty":
    "Geen linkhiaat gevonden — er zijn geen concurrenten opgehaald of er was geen overlap.",
  "backlinks.referringHeading": "Belangrijkste verwijzende domeinen die naar jou linken",
  "backlinks.referringEmpty":
    "Nog geen verwijzende domeinen gevonden in de index — een jong domein begint vaak bij nul.",
  "backlinks.recommendations": "Aanbevelingen",
  "backlinks.effort": "Inspanning",
  "backlinks.target": "Doel / platform",
  "backlinks.approach": "Aanpak",
  "backlinks.action.convert": "Kans aanmaken",
  "backlinks.action.converted": "Kans aangemaakt",
  "backlinks.action.convertTop": "Belangrijkste aanbevelingen omzetten",
  "backlinks.toast.done": "Backlinkanalyse voltooid",
  "backlinks.toast.converted": "Kans aangemaakt",
  "backlinks.toast.convertedTop": "{count} kansen aangemaakt",
  "backlinks.category.linkGapTargets": "Doelen voor linkhiaten",
  "backlinks.category.contentForLinks": "Content voor links",
  "backlinks.category.digitalPr": "Digitale PR",
  "backlinks.category.partnerships": "Partnerschappen en sponsoring",
  "backlinks.category.directories": "Bedrijvengidsen en profielen",
  "backlinks.category.linkHygiene": "Linkonderhoud",
  "marketplace.title": "Gesponsorde publicaties",
  "marketplace.subtitle":
    "Koppel backlinkkansen aan transparante, redactioneel beoordeelde gesponsorde plaatsingen.",
  "marketplace.disclosureTitle": "Marktplaats voor toegestane linkbuilding.",
  "marketplace.disclosure":
    'Elk verzoek vereist duidelijke vermelding van sponsoring en rel="sponsored". Een verzoek is geen aankoop en garandeert nooit posities, verkeer of omzet.',
  "marketplace.demoNoticeTitle": "Voorbeeldcatalogus.",
  "marketplace.demoNotice":
    "De domeinen, statistieken en prijzen hieronder zijn demonstratiegegevens zolang Linkhouse API-toegang nog in afwachting is. Verzoeken worden alleen binnen Milo opgeslagen ter beoordeling; er wordt geen providerbestelling of betaling aangemaakt.",
  "marketplace.demoBadge": "Demo",
  "marketplace.integrationTitle": "Linkhouse-integratie",
  "marketplace.integrationLive":
    "De providercatalogus is verbonden. Elke betaalde bestelling vereist nog bevestiging van het exacte totaal.",
  "marketplace.integrationPending":
    "Het productiecontract is gereed; koppeling van eindpunten en inloggegevens wachten op Linkhouse-documentatie.",
  "marketplace.catalogConnected": "Live catalogus",
  "marketplace.catalogDemo": "Democatalogus",
  "marketplace.orderingEnabled": "Bestellen ingeschakeld",
  "marketplace.orderingLocked": "Bestellen geblokkeerd",
  "marketplace.offers": "Aanbiedingen",
  "marketplace.orders": "Verzoeken",
  "marketplace.search": "Domeinen of onderwerpen zoeken…",
  "marketplace.noAnalysis":
    "Voer Backlink Intelligence uit om linkhiaatsignalen aan de matching toe te voegen. Matching op onderwerp en markt is al actief.",
  "marketplace.reason.linkGap": "Linkhiaat ten opzichte van concurrenten",
  "marketplace.rank": "Domeinrang",
  "marketplace.traffic": "Geschat verkeer",
  "marketplace.turnaround": "Doorlooptijd",
  "marketplace.days": "{count} dagen",
  "marketplace.price": "Indicatieve prijs",
  "marketplace.request": "Beoordeling aanvragen",
  "marketplace.reviewPrice": "Prijs beoordelen",
  "marketplace.quoteLocked": "Offerteconfiguratie vereist",
  "marketplace.requested": "Aangevraagd",
  "marketplace.quoteTitle": "Publicatieprijs beoordelen",
  "marketplace.basePrice": "Providerprijs",
  "marketplace.serviceFee": "Milo-servicekosten ({count}%)",
  "marketplace.totalPrice": "Exact totaal",
  "marketplace.quoteExpires":
    "Deze offerte verloopt om {time}. Daarna is een nieuwe offerte vereist.",
  "marketplace.confirmSponsored":
    'Ik vereis duidelijke vermelding van sponsoring en rel="sponsored" of nofollow op de link.',
  "marketplace.confirmPaymentLive":
    "Ik geef expliciet toestemming voor een providerbestelling van het exacte totaal van €{total}.",
  "marketplace.confirmPaymentDemo":
    "Ik bevestig het beoordelingsverzoek van €{total} en begrijp dat de demomodus geen providerbestelling of betaling aanmaakt.",
  "marketplace.confirmPurchase": "Betaalde bestelling bevestigen",
  "marketplace.confirmDemoRequest": "Beoordelingsverzoek opslaan",
  "marketplace.confirmedAt": "Bevestigd",
  "marketplace.ordersEmpty": "Nog geen publicatieverzoeken.",
  "marketplace.toast.exists": "Deze aanbieding heeft al een actief verzoek.",
  "marketplace.toast.requested": "Publicatieverzoek opgeslagen ter beoordeling.",
  "marketplace.toast.submitted": "Betaalde providerbestelling ingediend.",
  "marketplace.toast.catalogError":
    "Kan de providercatalogus niet vernieuwen. De veilige democatalogus blijft beschikbaar.",
  "marketplace.toast.quoteError": "Kan geen prijsofferte voorbereiden. Probeer het opnieuw.",
  "marketplace.toast.quoteExpired":
    "De offerte is verlopen. Vraag een nieuwe prijs aan voordat je bevestigt.",
  "marketplace.toast.orderError": "De bestelling is niet aangemaakt. Er is geen betaling gedaan.",
  "marketplace.toast.orderReview":
    "Het providerresultaat kon niet worden bevestigd. Milo heeft het verzoek opgeslagen als In beoordeling; probeer niet opnieuw totdat het resultaat is opgehelderd.",
  "marketplace.status.Requested": "Aangevraagd",
  "marketplace.status.In Review": "In beoordeling",
  "marketplace.status.Submitted": "Ingediend",
  "marketplace.status.Accepted": "Geaccepteerd",
  "marketplace.status.Published": "Gepubliceerd",
  "marketplace.status.Failed": "Mislukt",
  "marketplace.status.Cancelled": "Geannuleerd",
  "backlinks.integrity.partial": "Gedeeltelijke statistieken",
  "backlinks.integrity.source":
    "Opgegeven bron: DataForSEO-index op de opgeslagen analysedatum, voor de getoonde domeinen inclusief subdomeinen. Bronlabels in opgeslagen werkruimtegegevens zijn geen onafhankelijke verificatie. — betekent niet beschikbaar, nooit nul. Indexdekking is onvolledig; dit zijn geen live bestemmingscontroles.",
  "backlinks.integrity.legacy":
    "Oude analyse bewaard. Eerdere normalisatie kon ontbrekende gegevens in nullen veranderen, dus de numerieke basis is niet beschikbaar. Oorspronkelijke aanbevelingen blijven historisch advies.",
  "backlinks.integrity.scores":
    "Scores en aanbevelingen zijn AI-schattingen op basis van beschikbare onderbouwing, geen providermetingen, positiegaranties of gemeten resultaten.",
  "backlinks.integrity.sample":
    "Begrensde steekproef van de belangrijkste domeinen. Weggelaten domeinen bewijzen geen afwezige of verloren links; er is geen doorlopende monitoring vastgesteld.",
  "backlinks.integrity.failed":
    "Verzoek mislukt. Deze tabel is niet beschikbaar; dit betekent niet nul backlinks of geen linkhiaat.",
  "backlinks.integrity.not_requested":
    "Linkhiaatsteekproef niet aangevraagd omdat geen concurrentdomeinen zijn opgegeven.",
  "backlinks.integrity.unknown": "De verzamelstatus van de tabel is onbekend.",
  "backlinks.integrity.empty":
    "Geen rijen om te tonen. Controleer de verzamelstatus hierboven voordat je deze tabel interpreteert.",
  "backlinkMonitor.website_changed":
    "De getoonde website komt niet overeen met het opgeslagen project. Sla het project op of laad het opnieuw voordat je gegevens verzamelt. Er is geen verzameling gestart.",
  "backlinkMonitor.unavailable":
    "Verzameling is niet beschikbaar totdat de providerstatus een actief account met beschikbaar tegoed bevestigt. Opgeslagen geschiedenis blijft toegankelijk.",
  "backlinkMonitor.yes": "Ja",
  "backlinkMonitor.no": "Nee",
  "backlinkMonitor.title": "Backlinkgeschiedenis",
  "backlinkMonitor.note":
    "Dagelijkse aantallen uit de DataForSEO-index voor de opgeslagen website. Ontbrekende gegevens worden als — getoond, nooit als nul. Deze observaties verifiëren geen afzonderlijke linkplaatsingen. Elk verzoek gebruikt de geconfigureerde leverancierslimiet. Terugkerende verzameling wordt hierboven apart beheerd.",
  "backlinkMonitor.from": "Van (UTC)",
  "backlinkMonitor.to": "Tot (UTC)",
  "backlinkMonitor.subdomains": "Subdomeinen opnemen",
  "backlinkMonitor.run": "Dagelijkse aantallen aanvragen",
  "backlinkMonitor.running": "Verzamelen…",
  "backlinkMonitor.new": "Nog een verzoek starten",
  "backlinkMonitor.refresh": "Geschiedenis vernieuwen",
  "backlinkMonitor.loading": "Opgeslagen geschiedenis laden…",
  "backlinkMonitor.empty": "Nog geen opgeslagen verzoeken.",
  "backlinkMonitor.error": "Geschiedenis is niet beschikbaar. Probeer te vernieuwen.",
  "backlinkMonitor.uncertain":
    "Het resultaat is niet bevestigd. Vernieuw de opgeslagen geschiedenis voordat je nog een verzoek start; dit betekent niet dat de leverancier niets heeft berekend.",
  "backlinkMonitor.stored": "Observatie opgeslagen.",
  "backlinkMonitor.existing": "Dit verzoek bestaat al. Controleer hieronder de opgeslagen status.",
  "backlinkMonitor.held":
    "Verzoek geblokkeerd. Controleer de opgeslagen geschiedenis voordat je nog een verzoek start.",
  "backlinkMonitor.reserved": "Gereserveerd",
  "backlinkMonitor.dispatched": "Verzamelen",
  "backlinkMonitor.succeeded": "Opgeslagen",
  "backlinkMonitor.unknown": "Niet bevestigd",
  "backlinkMonitor.pending": "In afwachting",
  "backlinkMonitor.settled": "Verrekend",
  "backlinkMonitor.recover": "Kostenregistratie herstellen",
  "backlinkMonitor.recovered":
    "Kostenregistratie hersteld vanuit het opgeslagen leveranciersrecord.",
  "backlinkMonitor.recoveryFailed":
    "Kostenregistratie kon niet worden hersteld. De opgeslagen observatie blijft beschikbaar.",
  "backlinkMonitor.date": "Datum (UTC)",
  "backlinkMonitor.newLinks": "Nieuwe backlinks",
  "backlinkMonitor.lostLinks": "Verloren backlinks",
  "backlinkMonitor.newDomains": "Nieuwe verwijzende domeinen",
  "backlinkMonitor.lostDomains": "Verloren verwijzende domeinen",
  "backlinkMonitor.newMainDomains": "Nieuwe verwijzende hoofddomeinen",
  "backlinkMonitor.lostMainDomains": "Verloren verwijzende hoofddomeinen",
  "backlinkMonitor.reported": "Gerapporteerd",
  "backlinkMonitor.partial": "Gedeeltelijk",
  "backlinkMonitor.missing": "Ontbreekt",
  "backlinkMonitor.accounting": "Kostenregistratie",
  "backlinkMonitor.observed": "Waargenomen",
  "backlinkMonitor.request": "Verzoek",
  "backlinkMonitor.invalid":
    "Kies een geldige periode van 1–92 dagen die uiterlijk vandaag eindigt.",
  "backlinkDetails.title": "Onderbouwing van afzonderlijke backlinks",
  "backlinkDetails.note":
    "Representatieve links uit de DataForSEO-index, maximaal 100 per verzoek. Datums waarop links voor het eerst en laatst zijn gezien beschrijven de index; echte plaatsings- en verwijderingsdatums zijn onbekend. Dit is geen volledige linkinventaris. Verzoeken verbruiken de geconfigureerde leverancierslimiet.",
  "backlinkDetails.run": "Linkdetails verzamelen",
  "backlinkDetails.selection": "Datumselectie",
  "backlinkDetails.first_seen": "Voor het eerst gezien in periode",
  "backlinkDetails.lost_last_seen": "Als verloren gemeld, laatst gezien in periode",
  "backlinkDetails.limit": "Maximumaantal resultaten",
  "backlinkDetails.counts":
    "{retained} van {returned} teruggegeven links getoond; {total} providermatches.",
  "backlinkDetails.partial":
    "Er zijn meer providerresultaten of weggelaten gegevens. Elke pagina is een aparte observatie en de live index kan tussen pagina's veranderen.",
  "backlinkDetails.noLinks": "Geen bewaarde links voor dit verzoek.",
  "backlinkDetails.source": "Verwijzende pagina",
  "backlinkDetails.target": "Bestemming",
  "backlinkDetails.anchor": "Ankertekst",
  "backlinkDetails.first": "Eerst gezien (UTC)",
  "backlinkDetails.last": "Laatst gezien (UTC)",
  "backlinkDetails.rank": "Providerrang",
  "backlinkDetails.spam": "Spamscore",
  "backlinkDetails.lost": "Als verloren gemeld",
  "backlinkDetails.offset": "Resultaten overslaan (0–20 000)",
  "backlinkDetails.page":
    "Pagina {page} · {count} rijen waargenomen in deze reeks. Aantallen kunnen herhaalde links bevatten en vormen geen volledige inventaris.",
  "backlinkDetails.next": "Volgende pagina verzamelen (verbruikt limiet)",
  "backlinkDetails.nextNote":
    "Ga verder met dezelfde website en filters. Dit maakt één nieuw leveranciersverzoek en gebruikt de geconfigureerde limiet.",
  "backlinkDetails.child":
    "Verzoek voor volgende pagina al aangemaakt; vernieuw de geschiedenis om het resultaat te controleren",
  "backlinkDetails.pageLimit":
    "De limiet van 10 000 pagina's voor deze reeks is bereikt. Er kunnen nog meer matches zijn.",
  "backlinkRecurring.title": "Doorlopende backlinkmonitoring",
  "backlinkRecurring.note":
    "Verzamel dagelijks of wekelijks aantallen nieuwe en verloren backlinks voor deze opgeslagen website. Elke uitvoering omvat volledige UTC-dagen uit de DataForSEO-index. Gemiste uitvoeringen worden overgeslagen; observaties verifiëren geen afzonderlijke plaatsingen of volledige inventaris van het web.",
  "backlinkRecurring.loading": "Opgeslagen monitoringinstellingen laden…",
  "backlinkRecurring.error":
    "Monitoringinstellingen zijn niet beschikbaar. Laad opnieuw om het nogmaals te proberen.",
  "backlinkRecurring.enabled":
    "Monitoring ingeschakeld — elke verzameling vereist nog beschikbaar leverancierstegoed.",
  "backlinkRecurring.paused":
    "Monitoring gepauzeerd. Geen nieuwe automatische verzameling ingeschakeld.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} gereserveerd of uitgegeven van {cap} voor deze monitor.",
  "backlinkRecurring.unsettled":
    "Een eerder verzoek heeft een onopgelost resultaat of onduidelijke kosten. Verdere automatische verzameling is geblokkeerd. Controleer de geschiedenis; opgeslagen geslaagde resultaten kunnen herstel van kostenregistratie bieden. Een verstuurd verzoek wordt niet automatisch herhaald.",
  "backlinkRecurring.capHeld":
    "De resterende maandlimiet is lager dan één volledig verzoek. Verzameling wacht op de volgende UTC-maand of een opgeslagen limietwijziging.",
  "backlinkRecurring.changedWebsite":
    "De website is gewijzigd. Sla monitoringinstellingen op voor de huidige opgeslagen projectwebsite of laad het project opnieuw als je getoonde website verouderd is. Bestaande uitgaven blijven behouden.",
  "backlinkRecurring.next":
    "Volgend gepland tijdstip (UTC): {date}. Verzameling start bij een latere plannercontrole wanneer tegoed- en accountcontroles slagen.",
  "backlinkRecurring.pause": "Monitoring pauzeren",
  "backlinkRecurring.unavailable":
    "Verzameling door de leverancier is momenteel niet beschikbaar. Je kunt monitoring pauzeren en opgeslagen geschiedenis bekijken. Inschakelen vereist een bevestigd actief leveranciersaccount met beschikbaar tegoed.",
  "backlinkRecurring.settings": "Monitorinstellingen",
  "backlinkRecurring.enable": "Automatische verzameling inschakelen",
  "backlinkRecurring.cadence": "Frequentie",
  "backlinkRecurring.daily": "Dagelijks",
  "backlinkRecurring.weekly": "Wekelijks",
  "backlinkRecurring.days": "Volledige UTC-dagen per uitvoering",
  "backlinkRecurring.cap": "Maandelijkse leverancierslimiet (USD)",
  "backlinkRecurring.save": "Monitoringinstellingen opslaan",
  "backlinkRecurring.allowance":
    "Deze limiet geldt alleen voor deze monitor; opslaan voegt geen accounttegoed toe. Voer 0–100 USD in met maximaal zes decimalen. Inschakelen vereist minimaal 0.024 USD plus 0.000036 USD per dag in het venster. Accountlimieten en gedeelde leverancierslimieten gelden ook. Pauzeren stopt nieuwe verzendingen; een al toegelaten verzameling kan nog voltooien en de gereserveerde kosten veroorzaken.",
  "backlinkRecurring.invalid":
    "Voer 1–92 hele dagen en een geldige USD-limiet in. De ingeschakelde limiet moet minstens één volledig verzoek dekken.",
  "backlinkRecurring.saved": "Monitoringinstellingen opgeslagen.",
  "backlinkRecurring.uncertain":
    "Opslaan is niet bevestigd. Laad opgeslagen instellingen opnieuw voordat je nog een wijziging maakt; de eerdere wijziging kan al zijn opgeslagen.",
  "backlinkRecurring.refresh": "Opgeslagen instellingen opnieuw laden (bewerkingen verwerpen)",
  "backlinkRecurring.history": "Bekijk opgeslagen verzoeken en kostenregistratie hieronder",
  "backlinkRecurring.scheduled": "Geplande uitvoering",
  "backlinkRecurring.manual": "Handmatig verzoek",
  "backlinkRecurring.occurrence": "Gepland moment (UTC)",
  "backlinkRecurring.undispatched":
    "Dit geplande verzoek is niet toegelaten tot de leverancier. De monitorlimiet ervoor is vrijgegeven.",
};
