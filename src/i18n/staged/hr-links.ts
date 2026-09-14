/** Croatian authoring only; not registered in the runtime or language picker. */
export const hrLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Mreža za rast poveznica",
  "linknet.subtitle":
    "Pronađite relevantna web-mjesta u Milo mreži, pošaljite osobno predstavljanje i prepustite Milu provjeru je li poveznica doista objavljena.",
  "linknet.policyNote":
    "Relevantnost je na prvom mjestu: podudaranja zahtijevaju zajedničke teme, izravne razmjene poveznica označavaju se i ništa se ne postavlja automatski. Ove provjere ne jamče usklađenost s pravilima tražilica.",
  "linknet.topics": "Teme",
  "linknet.topicsPlaceholder": "Teme (odvojene zarezima)",
  "linknet.contact": "Adresa e-pošte za kontakt",
  "linknet.contactPlaceholder": "Adresa e-pošte za kontakt s partnerima",
  "linknet.join": "Pridruži se mreži",
  "linknet.update": "Ažuriraj unos",
  "linknet.pause": "Pauziraj",
  "linknet.joined": "Unos objavljen — partneri sada mogu pronaći ovo web-mjesto.",
  "linknet.paused": "Unos pauziran.",
  "linknet.find": "Pronađi partnere",
  "linknet.noMatches":
    "Još nema relevantnih partnera — mreža raste sa svakim Milo web-mjestom koje se pridruži.",
  "linknet.score": "Podudaranje",
  "linknet.copyIntro": "Kopiraj e-poruku za predstavljanje",
  "linknet.introCopied": "Predstavljanje kopirano — zalijepite ga u svoju e-poruku.",
  "linknet.markContacted": "Označi kao kontaktirano",
  "linknet.markAgreed": "Označi kao dogovoreno",
  "linknet.decline": "Odbij",
  "linknet.targetUrlPlaceholder": "URL dogovorene stranice (na kojoj će biti poveznica)",
  "linknet.verify": "Provjeri poveznicu",
  "linknet.verified": "Poveznica pronađena — postavljanje je objavljeno i provjereno.",
  "linknet.notFound": "Na toj stranici još nije pronađena poveznica — provjereno i zabilježeno.",
  "linknet.liveSince": "Objavljeno od",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Posljednja provjera: poveznica nije pronađena",
  "linknet.reciprocalWarn":
    "Time bi nastala izravna razmjena poveznica s ovim web-mjestom. Pregledajte relevantnost i izbjegavajte pretjerane razmjene.",
  "linknet.status.suggested": "Predloženo",
  "linknet.status.contacted": "Kontaktirano",
  "linknet.status.agreed": "Dogovoreno",
  "linknet.status.live_verified": "Objavljeno ✓",
  "linknet.status.declined": "Odbijeno",
  "backlinks.title": "Povratne poveznice",
  "backlinks.subtitle":
    "Stvarni podaci o povratnim poveznicama vaše domene — snaga profila, nedostaci u odnosu na konkurentske poveznice i sigurne preporuke za izgradnju poveznica.",
  "backlinks.disclaimer":
    "Metrike povratnih poveznica dolaze iz vanjskog indeksa poveznica i predstavljaju procjene — nijedan indeks ne vidi svaku poveznicu. Preporuke su samo prijedlozi dopuštenih postupaka: Milo nikad ne predlaže sheme poveznica ni neprijavljene plaćene poveznice i ne jamči položaje u rezultatima pretraživanja, promet ni prihod.",
  "backlinks.run": "Pokreni analizu povratnih poveznica",
  "backlinks.rerun": "Osvježi analizu",
  "backlinks.running": "Analiziranje…",
  "backlinks.empty":
    "Pokrenite analizu povratnih poveznica kako biste vidjeli stvarni profil poveznica svoje domene, usporedbu s konkurentima i domene koje povezuju s njima, ali ne s vama.",
  "backlinks.notConfigured.title": "Povežite izvor podataka o povratnim poveznicama",
  "backlinks.notConfigured.body":
    "Ovaj modul upotrebljava DataForSEO indeks povratnih poveznica i još nije povezan. Vlasnik radnog prostora treba izraditi DataForSEO račun (plaćanje prema potrošnji) i dodati DATAFORSEO_LOGIN i DATAFORSEO_PASSWORD kao tajne pozadinskog sustava. Do tada podaci o povratnim poveznicama nisu dostupni.",
  "backlinks.status.ready.title": "DataForSEO radi",
  "backlinks.status.ready.body": "Backlinks API povezan je i odgovara.",
  "backlinks.status.lowBalance.title": "Stanje DataForSEO računa nisko je",
  "backlinks.status.lowBalance.body":
    "Uskoro nadoplatite račun kako biste izbjegli prekide analiza.",
  "backlinks.status.paused.title": "DataForSEO pristup pauziran je",
  "backlinks.status.paused.body":
    "Obratite se DataForSEO podršci za ponovnu aktivaciju računa prije pokretanja nove analize.",
  "backlinks.status.error.title": "DataForSEO status nije dostupan",
  "backlinks.status.error.body":
    "Račun ili Backlinks API nije bilo moguće provjeriti. Osvježite status ili provjerite nadzornu ploču pružatelja usluge.",
  "backlinks.status.balance": "Stanje: {balance}.",
  "backlinks.status.refresh": "Osvježi status",
  "backlinks.competitorsUsed": "Uspoređeni konkurenti: {list}",
  "backlinks.competitorsFromAnalysis":
    "Upotrebljavaju se konkurenti iz posljednje analize konkurenata: {list}",
  "backlinks.noCompetitors":
    "U ovom projektu nema URL-ova konkurenata — analiza će obuhvatiti samo vaš profil. Dodajte konkurente u Postavkama projekta ili modulu Konkurenti kako biste omogućili usporedbu nedostajućih poveznica.",
  "backlinks.lastRun": "Posljednja analiza: {date}",
  "backlinks.score.overall": "Pozicija poveznica",
  "backlinks.score.profile": "Snaga profila",
  "backlinks.score.gap": "Nedostatak u odnosu na konkurente",
  "backlinks.score.quality": "Kvaliteta poveznica",
  "backlinks.gapHint": "više = više prostora za napredak",
  "backlinks.summaryHeading": "Sažetak",
  "backlinks.topActions": "Glavne radnje za poveznice",
  "backlinks.profileTable": "Vaša domena u odnosu na konkurente",
  "backlinks.table.domain": "Domena",
  "backlinks.table.rank": "Rang domene",
  "backlinks.table.backlinks": "Povratne poveznice",
  "backlinks.table.referringDomains": "Domene s poveznicama",
  "backlinks.table.broken": "Neispravne",
  "backlinks.table.spam": "Ocjena neželjenog sadržaja",
  "backlinks.table.notFetched": "Podatke nije bilo moguće dohvatiti",
  "backlinks.you": "Vi",
  "backlinks.gapHeading": "Nedostajuće poveznice — povezuju s konkurentima, a ne s vama",
  "backlinks.gapNote":
    "Uzorak iz indeksa pružatelja zatražen je uz isključenje vaše domene. Time se ne provjerava neovisno da ta web-mjesta nemaju poveznice na vas.",
  "backlinks.gap.linksTo": "Povezuje s",
  "backlinks.gapEmpty":
    "Nisu pronađene nedostajuće poveznice — konkurenti nisu dohvaćeni ili nije bilo preklapanja.",
  "backlinks.referringHeading": "Glavne domene s poveznicama na vas",
  "backlinks.referringEmpty":
    "U indeksu još nisu pronađene domene s poveznicama — nova domena često počinje od nule.",
  "backlinks.recommendations": "Preporuke",
  "backlinks.effort": "Trud",
  "backlinks.target": "Cilj / platforma",
  "backlinks.approach": "Pristup",
  "backlinks.action.convert": "Izradi priliku",
  "backlinks.action.converted": "Prilika izrađena",
  "backlinks.action.convertTop": "Pretvori glavne preporuke u prilike",
  "backlinks.toast.done": "Analiza povratnih poveznica dovršena",
  "backlinks.toast.converted": "Prilika izrađena",
  "backlinks.toast.convertedTop": "Izrađene prilike: {count}",
  "backlinks.category.linkGapTargets": "Ciljevi za nedostajuće poveznice",
  "backlinks.category.contentForLinks": "Sadržaj za poveznice",
  "backlinks.category.digitalPr": "Digitalni PR",
  "backlinks.category.partnerships": "Partnerstva i sponzorstva",
  "backlinks.category.directories": "Imenici i profili",
  "backlinks.category.linkHygiene": "Održavanje poveznica",
  "marketplace.title": "Sponzorirane objave",
  "marketplace.subtitle":
    "Povežite prilike za povratne poveznice s transparentnim, urednički pregledanim sponzoriranim objavama.",
  "marketplace.disclosureTitle": "Tržnica dopuštenih postupaka.",
  "marketplace.disclosure":
    'Svaki zahtjev zahtijeva jasno označeno sponzorstvo i rel="sponsored". Zahtjev nije kupnja i nikad ne jamči položaje u rezultatima pretraživanja, promet ni prihod.',
  "marketplace.demoNoticeTitle": "Katalog za pregled.",
  "marketplace.demoNotice":
    "Domene, metrike i cijene u nastavku demonstracijski su podaci dok se čeka pristup Linkhouse API-ju. Zahtjevi se spremaju samo unutar Mila za pregled; ne izrađuje se narudžba kod pružatelja ni plaćanje.",
  "marketplace.demoBadge": "Demonstracija",
  "marketplace.integrationTitle": "Linkhouse integracija",
  "marketplace.integrationLive":
    "Katalog pružatelja povezan je. Svaka plaćena narudžba i dalje zahtijeva potvrdu točnog ukupnog iznosa.",
  "marketplace.integrationPending":
    "Produkcijski ugovor spreman je; mapiranje krajnjih točaka i vjerodajnice čekaju Linkhouse dokumentaciju.",
  "marketplace.catalogConnected": "Aktivni katalog",
  "marketplace.catalogDemo": "Demonstracijski katalog",
  "marketplace.orderingEnabled": "Naručivanje omogućeno",
  "marketplace.orderingLocked": "Naručivanje zaključano",
  "marketplace.offers": "Ponude",
  "marketplace.orders": "Zahtjevi",
  "marketplace.search": "Pretraži domene ili teme…",
  "marketplace.noAnalysis":
    "Pokrenite analitiku povratnih poveznica kako biste u podudaranje dodali signale nedostajućih poveznica. Podudaranje tema i tržišta već je aktivno.",
  "marketplace.reason.linkGap": "Nedostatak konkurentskih poveznica",
  "marketplace.rank": "Rang domene",
  "marketplace.traffic": "Procijenjeni promet",
  "marketplace.turnaround": "Rok izvršenja",
  "marketplace.days": "{count} dana",
  "marketplace.price": "Okvirna cijena",
  "marketplace.request": "Zatraži pregled",
  "marketplace.reviewPrice": "Pregledaj cijenu",
  "marketplace.quoteLocked": "Potrebno postavljanje izračuna ponude",
  "marketplace.requested": "Zatraženo",
  "marketplace.quoteTitle": "Pregledajte cijenu objave",
  "marketplace.basePrice": "Cijena pružatelja",
  "marketplace.serviceFee": "Naknada za Milo uslugu ({count}%)",
  "marketplace.totalPrice": "Točan ukupni iznos",
  "marketplace.quoteExpires": "Ova ponuda istječe u {time}. Nakon toga potrebna je nova ponuda.",
  "marketplace.confirmSponsored":
    'Zahtijevam jasno označeno sponzorstvo i rel="sponsored" ili nofollow na poveznici.',
  "marketplace.confirmPaymentLive":
    "Izričito odobravam narudžbu kod pružatelja u točnom ukupnom iznosu od €{total}.",
  "marketplace.confirmPaymentDemo":
    "Potvrđujem zahtjev za pregled u iznosu od €{total} i razumijem da demonstracijski način ne izrađuje narudžbu kod pružatelja ni plaćanje.",
  "marketplace.confirmPurchase": "Potvrdi plaćenu narudžbu",
  "marketplace.confirmDemoRequest": "Spremi zahtjev za pregled",
  "marketplace.confirmedAt": "Potvrđeno",
  "marketplace.ordersEmpty": "Još nema zahtjeva za objavu.",
  "marketplace.toast.exists": "Ova ponuda već ima aktivan zahtjev.",
  "marketplace.toast.requested": "Zahtjev za objavu spremljen za pregled.",
  "marketplace.toast.submitted": "Plaćena narudžba predana pružatelju.",
  "marketplace.toast.catalogError":
    "Katalog pružatelja nije bilo moguće osvježiti. Siguran demonstracijski katalog ostaje dostupan.",
  "marketplace.toast.quoteError": "Cjenovnu ponudu nije bilo moguće pripremiti. Pokušajte ponovno.",
  "marketplace.toast.quoteExpired": "Ponuda je istekla. Zatražite novu cijenu prije potvrde.",
  "marketplace.toast.orderError": "Narudžba nije izrađena. Plaćanje nije izvršeno.",
  "marketplace.toast.orderReview":
    "Ishod kod pružatelja nije bilo moguće potvrditi. Milo je spremio zahtjev sa statusom U pregledu; ne pokušavajte ponovno dok se ishod ne razjasni.",
  "marketplace.status.Requested": "Zatraženo",
  "marketplace.status.In Review": "U pregledu",
  "marketplace.status.Submitted": "Predano",
  "marketplace.status.Accepted": "Prihvaćeno",
  "marketplace.status.Published": "Objavljeno",
  "marketplace.status.Failed": "Neuspjelo",
  "marketplace.status.Cancelled": "Otkazano",
  "backlinks.integrity.partial": "Djelomične metrike",
  "backlinks.integrity.source":
    "Navedeni izvor: DataForSEO indeks na datum spremljene analize, za prikazane domene uključujući poddomene. Oznake izvora u spremljenim podacima radnog prostora nisu neovisna provjera. — znači nedostupno, nikad nulu. Pokrivenost indeksa nepotpuna je; ovo nisu provjere trenutačnih odredišnih stranica.",
  "backlinks.integrity.legacy":
    "Prethodna analiza sačuvana je. Ranija normalizacija mogla je pretvoriti nedostajuće podatke u nule pa njezina brojčana osnova nije dostupna. Izvorne preporuke ostaju povijesni savjeti.",
  "backlinks.integrity.scores":
    "Ocjene i preporuke procjene su umjetne inteligencije na temelju dostupnih dokaza, a ne mjerenja pružatelja, jamstva položaja u rezultatima pretraživanja ni izmjereni ishodi.",
  "backlinks.integrity.sample":
    "Ograničeni uzorak glavnih domena. Izostavljene domene ne dokazuju nepostojeće ni izgubljene poveznice; kontinuirano praćenje nije uspostavljeno.",
  "backlinks.integrity.failed":
    "Zahtjev nije uspio. Ova tablica nije dostupna; to ne znači da je broj povratnih poveznica nula ni da nema nedostajućih poveznica.",
  "backlinks.integrity.not_requested":
    "Uzorak nedostajućih poveznica nije zatražen jer nisu navedene domene konkurenata.",
  "backlinks.integrity.unknown": "Status prikupljanja ove tablice nije poznat.",
  "backlinks.integrity.empty":
    "Nema redaka za prikaz. Provjerite prethodno navedeni status prikupljanja prije tumačenja ove tablice.",
  "backlinkMonitor.website_changed":
    "Prikazano web-mjesto ne odgovara spremljenom projektu. Spremite ili ponovno učitajte projekt prije prikupljanja. Prikupljanje nije pokrenuto.",
  "backlinkMonitor.unavailable":
    "Prikupljanje nije dostupno dok status pružatelja ne potvrdi aktivan račun s raspoloživim sredstvima. Spremljena povijest ostaje dostupna.",
  "backlinkMonitor.yes": "Da",
  "backlinkMonitor.no": "Ne",
  "backlinkMonitor.title": "Povijest povratnih poveznica",
  "backlinkMonitor.note":
    "Dnevni brojevi iz DataForSEO indeksa za spremljeno web-mjesto. Nedostajući podaci prikazuju se kao —, nikad kao nula. Ova opažanja ne provjeravaju pojedinačna postavljanja poveznica. Svaki zahtjev troši konfigurirani budžet dobavljača. Ponavljajuće prikupljanje zasebno se kontrolira iznad.",
  "backlinkMonitor.from": "Od (UTC)",
  "backlinkMonitor.to": "Do (UTC)",
  "backlinkMonitor.subdomains": "Uključi poddomene",
  "backlinkMonitor.run": "Zatraži dnevne brojeve",
  "backlinkMonitor.running": "Prikupljanje…",
  "backlinkMonitor.new": "Pokreni novi zahtjev",
  "backlinkMonitor.refresh": "Osvježi povijest",
  "backlinkMonitor.loading": "Učitavanje spremljene povijesti…",
  "backlinkMonitor.empty": "Još nema spremljenih zahtjeva.",
  "backlinkMonitor.error": "Povijest nije dostupna. Pokušajte osvježiti.",
  "backlinkMonitor.uncertain":
    "Ishod nije potvrđen. Osvježite spremljenu povijest prije pokretanja novog zahtjeva; to ne znači da dobavljač nije ništa naplatio.",
  "backlinkMonitor.stored": "Opažanje spremljeno.",
  "backlinkMonitor.existing":
    "Ovaj zahtjev već postoji. Provjerite njegov spremljeni status u nastavku.",
  "backlinkMonitor.held":
    "Zahtjev zadržan. Provjerite spremljenu povijest prije pokretanja novog zahtjeva.",
  "backlinkMonitor.reserved": "Rezervirano",
  "backlinkMonitor.dispatched": "Prikupljanje",
  "backlinkMonitor.succeeded": "Spremljeno",
  "backlinkMonitor.unknown": "Nepotvrđeno",
  "backlinkMonitor.pending": "Na čekanju",
  "backlinkMonitor.settled": "Obračunato",
  "backlinkMonitor.recover": "Obnovi obračun",
  "backlinkMonitor.recovered": "Obračun obnovljen iz spremljenog zapisa dobavljača.",
  "backlinkMonitor.recoveryFailed":
    "Obračun nije bilo moguće obnoviti. Spremljeno opažanje ostaje dostupno.",
  "backlinkMonitor.date": "Datum (UTC)",
  "backlinkMonitor.newLinks": "Nove povratne poveznice",
  "backlinkMonitor.lostLinks": "Izgubljene povratne poveznice",
  "backlinkMonitor.newDomains": "Nove domene s poveznicama",
  "backlinkMonitor.lostDomains": "Izgubljene domene s poveznicama",
  "backlinkMonitor.newMainDomains": "Nove glavne domene s poveznicama",
  "backlinkMonitor.lostMainDomains": "Izgubljene glavne domene s poveznicama",
  "backlinkMonitor.reported": "Prijavljeno",
  "backlinkMonitor.partial": "Djelomično",
  "backlinkMonitor.missing": "Nedostaje",
  "backlinkMonitor.accounting": "Obračun",
  "backlinkMonitor.observed": "Opaženo",
  "backlinkMonitor.request": "Zahtjev",
  "backlinkMonitor.invalid":
    "Odaberite valjano razdoblje od 1–92 dana koje završava najkasnije danas.",
  "backlinkDetails.title": "Dokazi o pojedinačnim povratnim poveznicama",
  "backlinkDetails.note":
    "Reprezentativne poveznice iz DataForSEO indeksa, najviše 100 po zahtjevu. Datumi prvog i posljednjeg opažanja opisuju indeks; stvarni datumi postavljanja i uklanjanja nisu poznati. Ovo nije potpun popis poveznica. Zahtjevi troše konfigurirani budžet dobavljača.",
  "backlinkDetails.run": "Prikupi pojedinosti poveznica",
  "backlinkDetails.selection": "Odabir datuma",
  "backlinkDetails.first_seen": "Prvi put opaženo u razdoblju",
  "backlinkDetails.lost_last_seen":
    "Prijavljeno kao izgubljeno, posljednji put opaženo u razdoblju",
  "backlinkDetails.limit": "Maksimalan broj rezultata",
  "backlinkDetails.counts":
    "Prikazano {retained} od {returned} vraćenih poveznica; {total} podudaranja kod pružatelja.",
  "backlinkDetails.partial":
    "Postoji još rezultata pružatelja ili izostavljenih dokaza. Svaka stranica zasebno je opažanje, a aktivni indeks može se promijeniti između stranica.",
  "backlinkDetails.noLinks": "Za ovaj zahtjev nema sačuvanih poveznica.",
  "backlinkDetails.source": "Stranica s poveznicom",
  "backlinkDetails.target": "Odredište",
  "backlinkDetails.anchor": "Tekst sidra",
  "backlinkDetails.first": "Prvi put opaženo (UTC)",
  "backlinkDetails.last": "Posljednji put opaženo (UTC)",
  "backlinkDetails.rank": "Rang pružatelja",
  "backlinkDetails.spam": "Ocjena neželjenog sadržaja",
  "backlinkDetails.lost": "Prijavljeno kao izgubljeno",
  "backlinkDetails.offset": "Preskoči rezultate (0–20 000)",
  "backlinkDetails.page":
    "Stranica {page} · {count} redaka opaženo u ovom nizu. Brojevi mogu uključivati ponovljene poveznice i ne potvrđuju potpun popis.",
  "backlinkDetails.next": "Prikupi sljedeću stranicu (troši budžet)",
  "backlinkDetails.nextNote":
    "Nastavite s istim web-mjestom i filtrima. Time se šalje jedan novi zahtjev dobavljaču i troši konfigurirani budžet.",
  "backlinkDetails.child":
    "Zahtjev za sljedeću stranicu već je izrađen; osvježite povijest kako biste provjerili rezultat",
  "backlinkDetails.pageLimit":
    "Dosegnuto je ograničenje od 10 000 stranica za ovaj niz. Možda postoje dodatna podudaranja.",
  "backlinkRecurring.title": "Kontinuirano praćenje povratnih poveznica",
  "backlinkRecurring.note":
    "Prikupljajte brojeve novih i izgubljenih povratnih poveznica za ovo spremljeno web-mjesto dnevno ili tjedno. Svako pokretanje obuhvaća potpune UTC dane iz DataForSEO indeksa. Propuštena pokretanja preskaču se; opažanja ne provjeravaju pojedinačna postavljanja ni potpun popis cijelog weba.",
  "backlinkRecurring.loading": "Učitavanje spremljenih postavki praćenja…",
  "backlinkRecurring.error": "Postavke praćenja nisu dostupne. Ponovno učitajte za novi pokušaj.",
  "backlinkRecurring.enabled":
    "Praćenje omogućeno — svako prikupljanje i dalje zahtijeva raspoloživa sredstva kod dobavljača.",
  "backlinkRecurring.paused": "Praćenje pauzirano. Novo automatsko prikupljanje nije omogućeno.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} rezervirano ili potrošeno od {cap} za ovo praćenje.",
  "backlinkRecurring.unsettled":
    "Raniji zahtjev ima nerazjašnjen ishod ili trošak. Daljnje automatsko prikupljanje zadržano je. Provjerite povijest; spremljeni uspješni rezultati mogu nuditi obnovu obračuna. Poslani zahtjev ne ponavlja se automatski.",
  "backlinkRecurring.capHeld":
    "Preostali mjesečni limit manji je od jednog potpunog zahtjeva. Prikupljanje čeka sljedeći UTC mjesec ili spremljenu promjenu limita.",
  "backlinkRecurring.changedWebsite":
    "Web-mjesto se promijenilo. Spremite postavke praćenja za trenutačno spremljeno web-mjesto projekta ili ponovno učitajte projekt ako je prikazano web-mjesto zastarjelo. Postojeća potrošnja ostaje sačuvana.",
  "backlinkRecurring.next":
    "Sljedeće predviđeno vrijeme (UTC): {date}. Prikupljanje započinje pri kasnijoj provjeri raspoređivača kada provjere sredstava i računa uspiju.",
  "backlinkRecurring.pause": "Pauziraj praćenje",
  "backlinkRecurring.unavailable":
    "Prikupljanje kod dobavljača trenutačno nije dostupno. Možete pauzirati praćenje i pregledati spremljenu povijest. Omogućivanje zahtijeva potvrđen aktivan račun dobavljača s raspoloživim sredstvima.",
  "backlinkRecurring.settings": "Postavke praćenja",
  "backlinkRecurring.enable": "Omogući automatsko prikupljanje",
  "backlinkRecurring.cadence": "Učestalost",
  "backlinkRecurring.daily": "Dnevno",
  "backlinkRecurring.weekly": "Tjedno",
  "backlinkRecurring.days": "Potpuni UTC dani po pokretanju",
  "backlinkRecurring.cap": "Mjesečni limit dobavljača (USD)",
  "backlinkRecurring.save": "Spremi postavke praćenja",
  "backlinkRecurring.allowance":
    "Ovaj limit ograničava samo ovo praćenje; spremanje ne dodaje sredstva na račun. Unesite 0–100 USD s najviše šest decimalnih mjesta. Omogućivanje zahtijeva najmanje 0.024 USD plus 0.000036 USD po danu u razdoblju. Primjenjuju se i ograničenja računa te zajednička ograničenja dobavljača. Pauziranje zaustavlja nova slanja; već odobreno prikupljanje ipak se može dovršiti i uzrokovati rezervirani trošak.",
  "backlinkRecurring.invalid":
    "Unesite 1–92 cijela dana i valjan USD limit. Omogućeni limit mora pokriti barem jedan potpuni zahtjev.",
  "backlinkRecurring.saved": "Postavke praćenja spremljene.",
  "backlinkRecurring.uncertain":
    "Spremanje nije potvrđeno. Ponovno učitajte spremljene postavke prije nove promjene; prethodna promjena možda je već spremljena.",
  "backlinkRecurring.refresh": "Ponovno učitaj spremljene postavke (odbaci izmjene)",
  "backlinkRecurring.history": "Pregledajte spremljene zahtjeve i obračun u nastavku",
  "backlinkRecurring.scheduled": "Zakazano pokretanje",
  "backlinkRecurring.manual": "Ručni zahtjev",
  "backlinkRecurring.occurrence": "Zakazani termin (UTC)",
  "backlinkRecurring.undispatched":
    "Ovaj zakazani zahtjev nije odobren za slanje dobavljaču. Njegov budžet za praćenje oslobođen je.",
};
