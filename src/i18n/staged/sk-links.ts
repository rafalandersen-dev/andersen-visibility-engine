/** Slovak authoring only; not registered in the runtime or language picker. */
export const skLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Sieť na získavanie odkazov",
  "linknet.subtitle":
    "Nájdite relevantné weby v sieti Milo, pošlite osobné predstavenie a nechajte Milo overiť, či je odkaz skutočne zverejnený.",
  "linknet.policyNote":
    "Relevancia je prvoradá: zhody vyžadujú spoločné témy, priame výmeny odkazov sa označujú a nič sa neumiestňuje automaticky. Tieto kontroly nezaručujú súlad s pravidlami vyhľadávačov.",
  "linknet.topics": "Témy",
  "linknet.topicsPlaceholder": "Témy (oddelené čiarkami)",
  "linknet.contact": "Kontaktný e-mail",
  "linknet.contactPlaceholder": "Kontaktný e-mail pre partnerov",
  "linknet.join": "Pridať sa do siete",
  "linknet.update": "Aktualizovať zápis",
  "linknet.pause": "Pozastaviť",
  "linknet.joined": "Zapísané — partneri teraz môžu nájsť tento web.",
  "linknet.paused": "Zápis pozastavený.",
  "linknet.find": "Nájsť partnerov",
  "linknet.noMatches":
    "Zatiaľ žiadni relevantní partneri — sieť rastie s každým webom Milo, ktorý sa pridá.",
  "linknet.score": "Zhoda",
  "linknet.copyIntro": "Skopírovať úvodný e-mail",
  "linknet.introCopied": "Predstavenie skopírované — vložte ho do e-mailu.",
  "linknet.markContacted": "Označiť ako kontaktované",
  "linknet.markAgreed": "Označiť ako dohodnuté",
  "linknet.decline": "Odmietnuť",
  "linknet.targetUrlPlaceholder": "Dohodnutá URL stránky (kde bude odkaz)",
  "linknet.verify": "Overiť odkaz",
  "linknet.verified": "Odkaz nájdený — umiestnenie je zverejnené a overené.",
  "linknet.notFound": "Na tejto stránke sa zatiaľ nenašiel odkaz — kontrola bola zaznamenaná.",
  "linknet.liveSince": "Zverejnené od",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Posledná kontrola: odkaz nenájdený",
  "linknet.reciprocalWarn":
    "Vznikla by priama výmena odkazov s týmto webom. Skontrolujte jej relevanciu a vyhnite sa nadmerným výmenám.",
  "linknet.status.suggested": "Navrhnuté",
  "linknet.status.contacted": "Kontaktované",
  "linknet.status.agreed": "Dohodnuté",
  "linknet.status.live_verified": "Zverejnené ✓",
  "linknet.status.declined": "Odmietnuté",
  "backlinks.title": "Backlinks",
  "backlinks.subtitle":
    "Skutočné údaje o spätných odkazoch vašej domény — sila profilu, rozdiel oproti konkurencii a bezpečné odporúčania na získavanie odkazov.",
  "backlinks.disclaimer":
    "Metriky spätných odkazov pochádzajú z externého indexu odkazov a sú odhadmi — žiadny index nevidí všetky odkazy. Odporúčania sú iba návrhy etických postupov: Milo nikdy nenavrhuje manipulatívne schémy odkazov ani nepriznané platené odkazy a nezaručuje pozície, návštevnosť ani príjmy.",
  "backlinks.run": "Spustiť analýzu spätných odkazov",
  "backlinks.rerun": "Obnoviť analýzu",
  "backlinks.running": "Analyzujeme…",
  "backlinks.empty":
    "Spustite analýzu spätných odkazov a zobrazte skutočný profil odkazov domény, porovnanie s konkurenciou a domény, ktoré odkazujú na konkurenciu, ale nie na vás.",
  "backlinks.notConfigured.title": "Pripojte zdroj údajov o spätných odkazoch",
  "backlinks.notConfigured.body":
    "Tento modul používa index spätných odkazov DataForSEO a zatiaľ nie je pripojený. Vlastník pracovného priestoru musí vytvoriť účet DataForSEO (platba podľa spotreby) a pridať DATAFORSEO_LOGIN a DATAFORSEO_PASSWORD ako tajné údaje serverovej časti. Dovtedy sú údaje o spätných odkazoch nedostupné.",
  "backlinks.status.ready.title": "DataForSEO je funkčné",
  "backlinks.status.ready.body": "Backlinks API je pripojené a odpovedá.",
  "backlinks.status.lowBalance.title": "Zostatok DataForSEO sa míňa",
  "backlinks.status.lowBalance.body": "Čoskoro doplňte kredit, aby sa analýzy neprerušili.",
  "backlinks.status.paused.title": "Prístup k DataForSEO je pozastavený",
  "backlinks.status.paused.body":
    "Pred ďalšou analýzou kontaktujte podporu DataForSEO a obnovte účet.",
  "backlinks.status.error.title": "Stav DataForSEO je nedostupný",
  "backlinks.status.error.body":
    "Účet alebo Backlinks API sa nepodarilo overiť. Obnovte stav alebo skontrolujte panel poskytovateľa.",
  "backlinks.status.balance": "Zostatok: {balance}.",
  "backlinks.status.refresh": "Obnoviť stav",
  "backlinks.competitorsUsed": "Porovnaní konkurenti: {list}",
  "backlinks.competitorsFromAnalysis":
    "Používame konkurentov z poslednej analýzy konkurencie: {list}",
  "backlinks.noCompetitors":
    "Projekt nemá URL konkurentov — analýza pokryje iba váš profil. Pridajte konkurentov v nastavení projektu alebo module Konkurenti, aby bolo možné porovnať chýbajúce odkazy.",
  "backlinks.lastRun": "Posledná analýza: {date}",
  "backlinks.score.overall": "Pozícia v odkazoch",
  "backlinks.score.profile": "Sila profilu",
  "backlinks.score.gap": "Rozdiel oproti konkurencii",
  "backlinks.score.quality": "Kvalita odkazov",
  "backlinks.gapHint": "vyššie = väčší potenciál zisku",
  "backlinks.summaryHeading": "Súhrn",
  "backlinks.topActions": "Najdôležitejšie kroky pre odkazy",
  "backlinks.profileTable": "Vaša doména oproti konkurencii",
  "backlinks.table.domain": "Doména",
  "backlinks.table.rank": "Hodnotenie domény",
  "backlinks.table.backlinks": "Spätné odkazy",
  "backlinks.table.referringDomains": "Odkazujúce domény",
  "backlinks.table.broken": "Nefunkčné",
  "backlinks.table.spam": "Skóre spamu",
  "backlinks.table.notFetched": "Údaje sa nepodarilo načítať",
  "backlinks.you": "Vy",
  "backlinks.gapHeading": "Chýbajúce odkazy — odkazujú na konkurenciu, nie na vás",
  "backlinks.gapNote":
    "Vzorka z indexu poskytovateľa bola vyžiadaná s vylúčením vašej domény. Nezávisle to neoveruje, že tieto weby na vás neodkazujú.",
  "backlinks.gap.linksTo": "Odkazuje na",
  "backlinks.gapEmpty":
    "Rozdiel v odkazoch sa nenašiel — buď sa nenačítali konkurenti, alebo neexistoval prienik.",
  "backlinks.referringHeading": "Najvýznamnejšie domény odkazujúce na vás",
  "backlinks.referringEmpty":
    "V indexe sa zatiaľ nenašli odkazujúce domény — nová doména často začína na nule.",
  "backlinks.recommendations": "Odporúčania",
  "backlinks.effort": "Náročnosť",
  "backlinks.target": "Cieľ / platforma",
  "backlinks.approach": "Postup",
  "backlinks.action.convert": "Vytvoriť príležitosť",
  "backlinks.action.converted": "Príležitosť vytvorená",
  "backlinks.action.convertTop": "Previesť najlepšie odporúčania",
  "backlinks.toast.done": "Analýza spätných odkazov dokončená",
  "backlinks.toast.converted": "Príležitosť vytvorená",
  "backlinks.toast.convertedTop": "Vytvorené príležitosti: {count}",
  "backlinks.category.linkGapTargets": "Ciele pre chýbajúce odkazy",
  "backlinks.category.contentForLinks": "Obsah na získavanie odkazov",
  "backlinks.category.digitalPr": "Digitálne PR",
  "backlinks.category.partnerships": "Partnerstvá a sponzorstvo",
  "backlinks.category.directories": "Katalógy a profily",
  "backlinks.category.linkHygiene": "Údržba odkazov",
  "marketplace.title": "Sponzorované publikácie",
  "marketplace.subtitle":
    "Prepojte príležitosti na spätné odkazy s transparentnými, redakčne skontrolovanými sponzorovanými umiestneniami.",
  "marketplace.disclosureTitle": "Trhovisko s etickými postupmi.",
  "marketplace.disclosure":
    'Každá žiadosť vyžaduje jasné označenie sponzorstva a rel="sponsored". Žiadosť nie je nákup a nikdy nezaručuje pozície, návštevnosť ani príjmy.',
  "marketplace.demoNoticeTitle": "Ukážkový katalóg.",
  "marketplace.demoNotice":
    "Domény, metriky a ceny nižšie sú ukážkové údaje, kým sa čaká na prístup k Linkhouse API. Žiadosti sa ukladajú iba v Milo na kontrolu; nevytvára sa objednávka u poskytovateľa ani platba.",
  "marketplace.demoBadge": "Ukážka",
  "marketplace.integrationTitle": "Integrácia Linkhouse",
  "marketplace.integrationLive":
    "Katalóg poskytovateľa je pripojený. Každá platená objednávka stále vyžaduje potvrdenie presnej celkovej sumy.",
  "marketplace.integrationPending":
    "Kontrakt pre produkčné rozhranie je pripravený; mapovanie koncových bodov a prihlasovacie údaje čakajú na dokumentáciu Linkhouse.",
  "marketplace.catalogConnected": "Živý katalóg",
  "marketplace.catalogDemo": "Ukážkový katalóg",
  "marketplace.orderingEnabled": "Objednávanie povolené",
  "marketplace.orderingLocked": "Objednávanie uzamknuté",
  "marketplace.offers": "Ponuky",
  "marketplace.orders": "Žiadosti",
  "marketplace.search": "Hľadať domény alebo témy…",
  "marketplace.noAnalysis":
    "Spustite Backlink Intelligence a doplňte do párovania signály chýbajúcich odkazov. Párovanie podľa tém a trhu je už aktívne.",
  "marketplace.reason.linkGap": "Chýbajúce odkazy oproti konkurencii",
  "marketplace.rank": "Hodnotenie domény",
  "marketplace.traffic": "Odhad návštevnosti",
  "marketplace.turnaround": "Čas realizácie",
  "marketplace.days": "Počet dní: {count}",
  "marketplace.price": "Orientačná cena",
  "marketplace.request": "Požiadať o kontrolu",
  "marketplace.reviewPrice": "Skontrolovať cenu",
  "marketplace.quoteLocked": "Vyžaduje sa nastavenie cenových ponúk",
  "marketplace.requested": "Vyžiadané",
  "marketplace.quoteTitle": "Skontrolovať cenu publikácie",
  "marketplace.basePrice": "Cena poskytovateľa",
  "marketplace.serviceFee": "Poplatok za službu Milo ({count}%)",
  "marketplace.totalPrice": "Presná celková suma",
  "marketplace.quoteExpires": "Táto cenová ponuka vyprší o {time}. Potom je potrebná nová ponuka.",
  "marketplace.confirmSponsored":
    'Vyžadujem jasné označenie sponzorstva a rel="sponsored" alebo nofollow na odkaze.',
  "marketplace.confirmPaymentLive":
    "Výslovne povoľujem objednávku u poskytovateľa v presnej celkovej sume €{total}.",
  "marketplace.confirmPaymentDemo":
    "Potvrdzujem žiadosť o kontrolu za €{total} a rozumiem, že ukážkový režim nevytvára objednávku u poskytovateľa ani platbu.",
  "marketplace.confirmPurchase": "Potvrdiť platenú objednávku",
  "marketplace.confirmDemoRequest": "Uložiť žiadosť o kontrolu",
  "marketplace.confirmedAt": "Potvrdené",
  "marketplace.ordersEmpty": "Zatiaľ žiadne žiadosti o publikáciu.",
  "marketplace.toast.exists": "Táto ponuka už má aktívnu žiadosť.",
  "marketplace.toast.requested": "Žiadosť o publikáciu uložená na kontrolu.",
  "marketplace.toast.submitted": "Platená objednávka odoslaná poskytovateľovi.",
  "marketplace.toast.catalogError":
    "Katalóg poskytovateľa sa nepodarilo obnoviť. Bezpečný ukážkový katalóg zostáva dostupný.",
  "marketplace.toast.quoteError": "Cenovú ponuku sa nepodarilo pripraviť. Skúste to znova.",
  "marketplace.toast.quoteExpired":
    "Cenová ponuka vypršala. Pred potvrdením požiadajte o novú cenu.",
  "marketplace.toast.orderError": "Objednávka nebola vytvorená. Platba neprebehla.",
  "marketplace.toast.orderReview":
    "Výsledok u poskytovateľa sa nepodarilo potvrdiť. Milo uložil žiadosť ako Na kontrole; neopakujte pokus, kým sa stav neobjasní.",
  "marketplace.status.Requested": "Vyžiadané",
  "marketplace.status.In Review": "Na kontrole",
  "marketplace.status.Submitted": "Odoslané",
  "marketplace.status.Accepted": "Prijaté",
  "marketplace.status.Published": "Zverejnené",
  "marketplace.status.Failed": "Zlyhalo",
  "marketplace.status.Cancelled": "Zrušené",
  "backlinks.integrity.partial": "Čiastočné metriky",
  "backlinks.integrity.source":
    "Deklarovaný zdroj: index DataForSEO k dátumu uloženej analýzy pre zobrazené domény vrátane subdomén. Označenia zdroja v uložených údajoch pracovného priestoru nie sú nezávislým overením. — znamená nedostupné, nikdy nulu. Pokrytie indexu je neúplné; nejde o aktuálne kontroly cieľových stránok.",
  "backlinks.integrity.legacy":
    "Staršia analýza zachovaná. Predchádzajúca normalizácia mohla zmeniť chýbajúce údaje na nuly, preto jej číselný základ nie je dostupný. Pôvodné odporúčania zostávajú historickými radami.",
  "backlinks.integrity.scores":
    "Skóre a odporúčania sú odhady AI z dostupných dôkazov, nie merania poskytovateľa, záruky pozícií ani namerané výsledky.",
  "backlinks.integrity.sample":
    "Obmedzená vzorka najvýznamnejších domén. Vynechané domény nepreukazujú neprítomné alebo stratené odkazy; priebežné monitorovanie nie je zavedené.",
  "backlinks.integrity.failed":
    "Požiadavka zlyhala. Táto tabuľka je nedostupná; neznamená to nulu spätných odkazov ani žiadne chýbajúce odkazy.",
  "backlinks.integrity.not_requested":
    "Vzorka chýbajúcich odkazov nebola vyžiadaná, pretože neboli zadané domény konkurentov.",
  "backlinks.integrity.unknown": "Stav získavania údajov tabuľky je neznámy.",
  "backlinks.integrity.empty":
    "Žiadne riadky na zobrazenie. Pred interpretáciou tabuľky skontrolujte stav získavania údajov vyššie.",
  "backlinkMonitor.website_changed":
    "Zobrazený web nezodpovedá uloženému projektu. Pred získavaním údajov projekt uložte alebo znova načítajte. Získavanie údajov sa nespustilo.",
  "backlinkMonitor.unavailable":
    "Získavanie údajov je nedostupné, kým stav poskytovateľa nepotvrdí aktívny účet s dostupným zostatkom. Uložená história zostáva prístupná.",
  "backlinkMonitor.yes": "Áno",
  "backlinkMonitor.no": "Nie",
  "backlinkMonitor.title": "História spätných odkazov",
  "backlinkMonitor.note":
    "Denné počty z indexu DataForSEO pre uložený web. Chýbajúce údaje sa zobrazujú ako —, nikdy ako nula. Tieto pozorovania neoverujú jednotlivé umiestnenia odkazov. Každá požiadavka využíva nastavený limit dodávateľa. Opakované získavanie údajov sa ovláda samostatne vyššie.",
  "backlinkMonitor.from": "Od (UTC)",
  "backlinkMonitor.to": "Do (UTC)",
  "backlinkMonitor.subdomains": "Zahrnúť subdomény",
  "backlinkMonitor.run": "Vyžiadať denné počty",
  "backlinkMonitor.running": "Získavame údaje…",
  "backlinkMonitor.new": "Začať ďalšiu požiadavku",
  "backlinkMonitor.refresh": "Obnoviť históriu",
  "backlinkMonitor.loading": "Načítavame uloženú históriu…",
  "backlinkMonitor.empty": "Zatiaľ žiadne uložené požiadavky.",
  "backlinkMonitor.error": "História je nedostupná. Skúste ju obnoviť.",
  "backlinkMonitor.uncertain":
    "Výsledok nie je potvrdený. Pred ďalšou požiadavkou obnovte uloženú históriu; neznamená to, že dodávateľ nič neúčtoval.",
  "backlinkMonitor.stored": "Pozorovanie uložené.",
  "backlinkMonitor.existing": "Táto požiadavka už existuje. Skontrolujte jej uložený stav nižšie.",
  "backlinkMonitor.held":
    "Požiadavka pozastavená. Pred ďalšou požiadavkou skontrolujte uloženú históriu.",
  "backlinkMonitor.reserved": "Rezervované",
  "backlinkMonitor.dispatched": "Získavanie údajov",
  "backlinkMonitor.succeeded": "Uložené",
  "backlinkMonitor.unknown": "Nepotvrdené",
  "backlinkMonitor.pending": "Čaká",
  "backlinkMonitor.settled": "Vyúčtované",
  "backlinkMonitor.recover": "Obnoviť účtovanie",
  "backlinkMonitor.recovered": "Účtovanie obnovené z uloženého záznamu dodávateľa.",
  "backlinkMonitor.recoveryFailed":
    "Účtovanie sa nepodarilo obnoviť. Uložené pozorovanie zostáva dostupné.",
  "backlinkMonitor.date": "Dátum (UTC)",
  "backlinkMonitor.newLinks": "Nové spätné odkazy",
  "backlinkMonitor.lostLinks": "Stratené spätné odkazy",
  "backlinkMonitor.newDomains": "Nové odkazujúce domény",
  "backlinkMonitor.lostDomains": "Stratené odkazujúce domény",
  "backlinkMonitor.newMainDomains": "Nové odkazujúce hlavné domény",
  "backlinkMonitor.lostMainDomains": "Stratené odkazujúce hlavné domény",
  "backlinkMonitor.reported": "Nahlásené",
  "backlinkMonitor.partial": "Čiastočné",
  "backlinkMonitor.missing": "Chýba",
  "backlinkMonitor.accounting": "Účtovanie",
  "backlinkMonitor.observed": "Pozorované",
  "backlinkMonitor.request": "Požiadavka",
  "backlinkMonitor.invalid": "Vyberte platný interval 1–92 dní s koncom najneskôr dnes.",
  "backlinkDetails.title": "Dôkazy o jednotlivých spätných odkazoch",
  "backlinkDetails.note":
    "Reprezentatívne odkazy z indexu DataForSEO, najviac 100 na požiadavku. Dátumy prvého a posledného zaznamenania opisujú index; skutočné dátumy umiestnenia a odstránenia nie sú známe. Nejde o úplný zoznam odkazov. Požiadavky čerpajú nastavený limit dodávateľa.",
  "backlinkDetails.run": "Získať podrobnosti odkazov",
  "backlinkDetails.selection": "Výber dátumu",
  "backlinkDetails.first_seen": "Prvýkrát zaznamenané v období",
  "backlinkDetails.lost_last_seen": "Nahlásené ako stratené, naposledy zaznamenané v období",
  "backlinkDetails.limit": "Maximum výsledkov",
  "backlinkDetails.counts":
    "Zobrazené odkazy: {retained} z {returned} vrátených; zhody u poskytovateľa: {total}.",
  "backlinkDetails.partial":
    "Existujú ďalšie výsledky poskytovateľa alebo vynechané dôkazy. Každá stránka je samostatné pozorovanie a živý index sa medzi stránkami môže meniť.",
  "backlinkDetails.noLinks": "Pre túto požiadavku nie sú zachované odkazy.",
  "backlinkDetails.source": "Odkazujúca stránka",
  "backlinkDetails.target": "Cieľ",
  "backlinkDetails.anchor": "Text odkazu",
  "backlinkDetails.first": "Prvýkrát zaznamenané (UTC)",
  "backlinkDetails.last": "Naposledy zaznamenané (UTC)",
  "backlinkDetails.rank": "Hodnotenie poskytovateľa",
  "backlinkDetails.spam": "Skóre spamu",
  "backlinkDetails.lost": "Nahlásené ako stratené",
  "backlinkDetails.offset": "Preskočiť výsledky (0–20 000)",
  "backlinkDetails.page":
    "Stránka {page} · Počet riadkov pozorovaných v tejto sekvencii: {count}. Počty môžu zahŕňať opakované odkazy a nepreukazujú úplný zoznam.",
  "backlinkDetails.next": "Získať ďalšiu stránku (čerpá limit)",
  "backlinkDetails.nextNote":
    "Pokračujte s rovnakým webom a filtrami. Vytvorí sa jedna nová požiadavka dodávateľovi a čerpá nastavený limit.",
  "backlinkDetails.child":
    "Požiadavka na ďalšiu stránku už bola vytvorená; obnovte históriu a skontrolujte výsledok",
  "backlinkDetails.pageLimit":
    "Bol dosiahnutý limit 10 000 stránok tejto sekvencie. Ďalšie zhody môžu zostať.",
  "backlinkRecurring.title": "Priebežné monitorovanie spätných odkazov",
  "backlinkRecurring.note":
    "Získavajte počty nových a stratených spätných odkazov pre tento uložený web denne alebo týždenne. Každé spustenie pokrýva celé dni UTC z indexu DataForSEO. Zmeškané spustenia sa preskočia; pozorovania neoverujú jednotlivé umiestnenia ani úplný zoznam webových odkazov.",
  "backlinkRecurring.loading": "Načítavame uložené nastavenia monitorovania…",
  "backlinkRecurring.error": "Nastavenia monitorovania sú nedostupné. Skúste ich znova načítať.",
  "backlinkRecurring.enabled":
    "Monitorovanie povolené — každé získavanie údajov stále potrebuje dostupné prostriedky u dodávateľa.",
  "backlinkRecurring.paused":
    "Monitorovanie pozastavené. Nové automatické získavanie údajov nie je povolené.",
  "backlinkRecurring.spending":
    "{month} (UTC): rezervované alebo minuté {used} z {cap} pre toto monitorovanie.",
  "backlinkRecurring.unsettled":
    "Predchádzajúca požiadavka má neobjasnený výsledok alebo náklad. Ďalšie automatické získavanie údajov je pozastavené. Skontrolujte históriu; uložené úspešné výsledky môžu umožniť obnovu účtovania. Odoslaná požiadavka sa automaticky neopakuje.",
  "backlinkRecurring.capHeld":
    "Zostávajúci mesačný limit nestačí na jednu celú požiadavku. Získavanie údajov čaká na ďalší mesiac UTC alebo uloženú zmenu limitu.",
  "backlinkRecurring.changedWebsite":
    "Web sa zmenil. Uložte nastavenia monitorovania pre aktuálny uložený web projektu alebo projekt znova načítajte, ak je zobrazený web zastaraný. Existujúce výdavky sa zachovajú.",
  "backlinkRecurring.next":
    "Ďalší plánovaný čas (UTC): {date}. Získavanie údajov sa začne pri neskoršej kontrole plánovača po úspešnej kontrole prostriedkov a účtu.",
  "backlinkRecurring.pause": "Pozastaviť monitorovanie",
  "backlinkRecurring.unavailable":
    "Získavanie údajov od dodávateľa je momentálne nedostupné. Môžete pozastaviť monitorovanie a zobraziť uloženú históriu. Povolenie vyžaduje potvrdený aktívny účet dodávateľa s dostupným zostatkom.",
  "backlinkRecurring.settings": "Nastavenia monitorovania",
  "backlinkRecurring.enable": "Povoliť automatické získavanie údajov",
  "backlinkRecurring.cadence": "Frekvencia",
  "backlinkRecurring.daily": "Denne",
  "backlinkRecurring.weekly": "Týždenne",
  "backlinkRecurring.days": "Celé dni UTC na spustenie",
  "backlinkRecurring.cap": "Mesačný limit dodávateľa (USD)",
  "backlinkRecurring.save": "Uložiť nastavenia monitorovania",
  "backlinkRecurring.allowance":
    "Tento limit obmedzuje iba toto monitorovanie; jeho uloženie nepridáva prostriedky na účet. Zadajte 0–100 USD s najviac šiestimi desatinnými miestami. Povolenie vyžaduje aspoň 0.024 USD plus 0.000036 USD za každý deň obdobia. Platia aj limity účtu a spoločné limity dodávateľa. Pozastavenie zastaví nové odoslania; už prijaté získavanie údajov sa môže dokončiť a účtovať rezervovaný náklad.",
  "backlinkRecurring.invalid":
    "Zadajte 1–92 celých dní a platný limit v USD. Povolený limit musí pokrývať aspoň jednu celú požiadavku.",
  "backlinkRecurring.saved": "Nastavenia monitorovania uložené.",
  "backlinkRecurring.uncertain":
    "Uloženie nie je potvrdené. Pred ďalšou zmenou znova načítajte uložené nastavenia; predchádzajúca zmena už mohla byť uložená.",
  "backlinkRecurring.refresh": "Znova načítať uložené nastavenia (zahodiť úpravy)",
  "backlinkRecurring.history": "Nižšie zobrazte uložené požiadavky a účtovanie",
  "backlinkRecurring.scheduled": "Plánované spustenie",
  "backlinkRecurring.manual": "Ručná požiadavka",
  "backlinkRecurring.occurrence": "Plánovaný výskyt (UTC)",
  "backlinkRecurring.undispatched":
    "Táto plánovaná požiadavka nebola pripustená na odoslanie dodávateľovi. Rezervovaná suma pre toto monitorovanie je uvoľnená.",
};
