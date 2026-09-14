/** Slovak authoring only; not registered in the runtime or language picker. */
export const skCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Aktuálna práca na projekte",
  "awareness.help":
    "Iba v aplikácii. Tieto kontroly neposielajú e-mail. Pozastavenia zostávajú viditeľné, kým sa front nezmení; ich otvorenie prácu neschváli ani nereštartuje.",
  "awareness.project": "Vybrať projekt",
  "awareness.approval": "Presná verzia potrebuje schválenie",
  "awareness.resume": "Schválená verzia je stále pozastavená",
  "awareness.late":
    "Tento dátum už uplynul. Skontrolujte návrh a vyberte výslovnú akciu naplánovania.",
  "awareness.paused":
    "Automatizácia je zámerne pozastavená. Existujúce pozastavenia publikovania zostávajú samostatné.",
  "awareness.disabled": "Automatizácia je vypnutá.",
  "awareness.settings": "Otvoriť nastavenia rozvrhu",
  "awareness.history":
    "Posledný uložený týždenný výsledok — historický, nejde o novú kontrolu kapacity alebo zdrojov",
  "awareness.empty": "Na tejto stránke nie sú žiadne pozastavenia čakajúce na schválenie.",
  "awareness.page": "Stránka frontu {page} z {pages}",
  "awareness.error": "Aktuálne záznamy sa nepodarilo skontrolovať. Pred akciou ich obnovte.",
  "awareness.checked": "Skontrolované {at}",
  "awareness.weekly": "Aktuálne záznamy týždenných slotov",
  "awareness.earlier": "Skoršie upozornenia v schránke",
  "notifications.failureInspect": "Skontrolovať podrobnosti publikovania",
  "notifications.failureReadError":
    "Podrobnosti publikovania sa nepodarilo skontrolovať. Pred rozhodnutím o ďalšom postupe to skúste znova.",
  "notifications.failureReason.contentReview":
    "Uložený pokus zablokovali kontroly obsahu. Otvorte návrh a skontrolujte jeho aktuálnu pripravenosť.",
  "notifications.failureReason.destination":
    "Uložený pokus zaznamenal chybu pripojenia alebo odpovede cieľa. Pred opakovaním skontrolujte cieľ.",
  "notifications.failureReason.configuration":
    "Uložený pokus zaznamenal chýbajúce alebo neplatné nastavenie publikovania. Skontrolujte nastavenie projektu.",
  "notifications.failureReason.unknown":
    "Uloženú chybu sa nepodarilo zaradiť. Pred opakovaním skontrolujte návrh a cieľ.",
  "notifications.failureRecorded":
    "Záznam bol aktualizovaný {at} v časovom pásme vášho prehliadača. Zaznamenané pokusy: {attempts}.",
  "notifications.failureDraftChanged":
    "Návrh sa po tomto zázname zmenil. Tieto podrobnosti už nemusia opisovať jeho aktuálnu pripravenosť.",
  "notifications.failureHttp": "Zaznamenaná odpoveď webu: HTTP {status}.",
  "notifications.failureCheck.links":
    "Vyriešte interné odkazy v paneli bezpečnosti odkazov v editore.",
  "notifications.failureCheck.sourcesReview":
    "Overte tvrdenia podľa zdrojov alebo s kvalifikovaným autorom a dokončite ľudskú kontrolu.",
  "notifications.failureCheck.author":
    "Pridajte meno skutočného autora a životopis, kvalifikáciu alebo profil.",
  "notifications.failureHistoryLimit":
    "Ide o historické informácie uložené v Milo. Nekontrolujú cieľ, neschvaľujú aktuálny návrh ani nereštartujú publikovanie.",
  "notifications.failureState.absent":
    "Nenašiel sa zodpovedajúci záznam frontu. Obnovte oznámenia a skontrolujte návrh.",
  "notifications.failureState.changed":
    "Front už túto položku neoznačuje ako neúspešnú. Obnovte oznámenia; samotná táto zmena neoveruje cieľový web.",
  "notifications.recoveryInspect": "Skontrolovať uloženú prácu",
  "notifications.recoveryReadError":
    "Uložené záznamy automatizácie sa nepodarilo skontrolovať. Pred rozhodnutím o reštarte to skúste znova.",
  "notifications.recoveryState.absent":
    "Nenašiel sa aktuálny záznam behu. Obnovte oznámenia a skontrolujte, či bol tento incident vyriešený.",
  "notifications.recoveryState.running": "Najnovší beh je označený ako aktívny.",
  "notifications.recoveryState.completed":
    "Najnovší beh sa skončil. Obnovte oznámenia a zobrazte aktuálne problémy.",
  "notifications.recoveryState.review_required": "Prerušený beh stále vyžaduje kontrolu.",
  "notifications.recoverySnapshot":
    "Záznamy Milo boli skontrolované {at} v časovom pásme vášho prehliadača.",
  "notifications.recoveryCounts":
    "Plán {period}: uložené návrhy: {saved}. Záznamy frontu pre tieto návrhy: čakajúce {pending}, prebiehajúce {publishing}, evidované ako zverejnené {published}, neúspešné {failed} a zrušené {cancelled}.",
  "notifications.recoveryEvidenceLimit":
    "Ide o záznamy uložené v Milo. Neoverujú poslednú operáciu AI ani cieľový web. Pred opakovaním publikovania s neistým výsledkom skontrolujte cieľ. Toto zobrazenie prácu nereštartuje.",
  "notifications.recoveryMore":
    "Zobrazuje sa {shown} z {total} uložených návrhov. Zvyšnú prácu skontrolujte v kalendári.",
  "notifications.emailAddressUnverified":
    "Aktuálny e-mail vášho účtu nebol overený. Dokončite potvrdenie e-mailu a potom ho znova skontrolujte. Ak adresu zmenil správca a nemáte potvrdzovací odkaz, kontaktujte podporu Milo. Oznámenia v aplikácii zostávajú dostupné.",
  "notifications.emailAddressUnavailable":
    "Milo nemohol skontrolovať aktuálne overenie vášho e-mailu. Skúste to neskôr. Súhrny môžete naďalej vypnúť a používať oznámenia v aplikácii.",
  "notifications.generation_capacity_low": "Limit prípravy nemusí pokryť plán",
  "notifications.generation_capacity_unavailable": "Limit prípravy sa nepodarilo skontrolovať",
  "notifications.capacityLow":
    "Plán {period} stále potrebuje {missing} návrhov pre tento projekt a {total} vo všetkých vašich aktívnych rozvrhoch. Na účte zostáva {remaining} pokusov o prípravu v období {usagePeriod}. Ide o zdieľanú kapacitu, nie prísľub dokončených článkov. Skontrolujte rozvrh; uložené návrhy zostávajú dostupné na kontrolu a publikovanie.",
  "notifications.capacityUnavailable":
    "Milo nemohol overiť zdieľaný limit prípravy pre {usagePeriod}. Plán {period} tu stále potrebuje {missing} návrhov. Skontrolujte to neskôr. Uložené návrhy a ostatné oznámenia zostávajú dostupné.",
  "notifications.scheduler_recovery": "Automatizácia potrebuje kontrolu obnovy",
  "notifications.recovery":
    "Príprava bola po prerušenom behu pozastavená. Pred reštartom skontrolujte uložené návrhy a poslednú operáciu. Existujúce schválenia publikovania zostávajú nezmenené.",
  "notifications.emailTitle": "E-mailové súhrny",
  "notifications.emailDescription":
    "Dostávajte jeden súhrn nových upozornení najviac raz za hodinu na potvrdenú adresu svojho účtu. Každý incident sa objaví raz.",
  "notifications.emailDisabled":
    "Doručovanie e-mailov ešte nebolo aktivované. Oznámenia v aplikácii sú dostupné.",
  "notifications.emailEnable": "Zapnúť e-mailové súhrny",
  "notifications.emailDisable": "Vypnúť e-mailové súhrny",
  "notifications.emailError": "Nastavenia e-mailu sú dočasne nedostupné.",
  "notifications.emailSaveError": "E-mailové preferencie sa nepodarilo uložiť.",
  "notifications.emailHistory": "Nedávna e-mailová aktivita",
  "notifications.emailStatus.pending": "Čaká",
  "notifications.emailStatus.leased": "Kontroluje sa aktuálny stav",
  "notifications.emailStatus.sending": "Odosiela sa",
  "notifications.emailStatus.accepted": "Prijaté poskytovateľom e-mailu",
  "notifications.emailStatus.unknown": "Výsledok doručenia vyžaduje overenie",
  "notifications.emailStatus.cancelled": "Zrušené",
  "notifications.emailStatus.failed": "E-mail sa nepodarilo pripraviť",
  "notifications.title": "Oznámenia",
  "notifications.subtitle":
    "Vaše nadchádzajúce rozhodnutia a problémy s publikovaním, skontrolované podľa najnovšieho stavu servera.",
  "notifications.loading": "Kontrolujeme váš plán…",
  "notifications.empty": "Momentálne si žiadne akcie nevyžadujú vašu pozornosť.",
  "notifications.error": "Oznámenia sú dočasne nedostupné.",
  "notifications.stale":
    "Najnovšia kontrola sa nedokončila. Toto sú posledné potvrdené upozornenia.",
  "notifications.refresh": "Skontrolovať znova",
  "notifications.read": "Označiť ako prečítané",
  "notifications.unread": "Neprečítané",
  "notifications.saved": "Prečítané",
  "notifications.open": "Otvoriť úlohu",
  "notifications.calendar": "Otvoriť kalendár",
  "notifications.project": "Projekt",
  "notifications.approval_due": "Blíži sa termín schválenia",
  "notifications.publication_failed": "Publikovanie vyžaduje kontrolu",
  "notifications.manual_overdue": "Ručná úloha je po termíne",
  "notifications.cadence_gap": "Budúci týždeň vyžaduje pozornosť",
  "notifications.coverage":
    "Počet plánovaných slotov, ktoré nie sú pripravené a zaradené do frontu: {missing} z {total}.",
  "notifications.failure":
    "Pred opakovaním skontrolujte cieľ: prerušené publikovanie už mohlo obsah zverejniť.",
  "notifications.approval": "Skontrolujte aktuálnu verziu pred plánovaným termínom.",
  "notifications.manual":
    "Dokončite túto úlohu alebo vyberte nový dátum. Tento termín sa týka ručnej úlohy.",
  "notifications.readError": "Toto oznámenie sa nepodarilo označiť ako prečítané. Skúste to znova.",
  "team.title": "Tím Milo",
  "team.help":
    "Jeden pracovný priestor s odbornými pohľadmi na skutočnú prácu a znalosti projektu.",
  "team.selectProject": "Vyberte projekt a zobrazte jeho tím.",
  "team.scope":
    "Stav úloh pokrýva vybraný týždeň. Uložené rady a prehľady sú datované dôkazy, nie dôkaz aktívnej úlohy alebo lepších výsledkov.",
  "team.aiRole": "Špecialista AI",
  "team.records": "Uložené znalostné záznamy: {count} · stav skontrolujte v znalostiach projektu",
  "team.lastDelivery": "Posledné dodanie v úlohách tohto týždňa",
  "team.auditFetched": "Uložený audit webu",
  "team.auditPartial": "Uložený audit používajúci iba kontext projektu",
  "team.adviceSaved": "Uložené odporúčania k pripravenosti pre AI",
  "team.imports": "Uložené importy meraní GSC: {count}",
  "team.measurementMissing": "Žiadne uložené merania GSC",
  "team.authorityPrerequisite":
    "Údaje poskytovateľa a oprávnenie na oslovovanie treba skontrolovať v pracovnom priestore Backlinks.",
  "team.lesson.title": "Zapamätať redakčné poučenie",
  "team.lesson.help":
    "Napíšte opakujúcu sa preferenciu tohto projektu. Uložením sa stane výslovným pokynom projektu pre relevantnú budúcu prácu. Bežné úpravy článku nevytvárajú poučenia. Nevzniká tým faktický dôkaz.",
  "team.lesson.rule": "Pokyn pre tento projekt",
  "team.lesson.target": "Použiť pre",
  "team.lesson.text": "Písanie",
  "team.lesson.visual": "Vizuály",
  "team.lesson.both": "Písanie a vizuály",
  "team.lesson.save": "Uložiť pokyn projektu",
  "team.lesson.manage": "Skontrolovať, upraviť alebo zabudnúť znalosti",
  "team.lesson.saved":
    "Uložené do tohto projektu. V znalostiach projektu to môžete upraviť, vrátiť alebo zneplatniť.",
  "team.lesson.unknown":
    "Uloženie sa nepodarilo potvrdiť. Pred opätovným zadaním pokynu skontrolujte znalosti projektu.",
  "team.role.lead": "Milo — vedúci rastu",
  "team.description.lead": "Koordinuje uložený rozvrh, pokrytie a rozhodnutia.",
  "team.open.lead": "Skontrolovať týždennú prípravu",
  "team.role.brand": "Stratég značky",
  "team.description.brand":
    "Fakty projektu, preferencie a odvolateľné poučenia so zdrojom a históriou kontroly.",
  "team.open.brand": "Skontrolovať znalosti projektu",
  "team.role.research": "Výskumník vyhľadávania",
  "team.description.research":
    "Týždenné výskumné zadania a uložené príležitosti. Pred písaním skontrolujte zdroje a hypotézy.",
  "team.open.research": "Skontrolovať príležitosti",
  "team.role.content": "Editor obsahu",
  "team.description.content":
    "Zachované články stále potrebujú redakčnú kontrolu a schválenie publikovania presnej verzie.",
  "team.open.content": "Skontrolovať články",
  "team.role.image": "Tvorca vizuálov",
  "team.description.image":
    "Navrhované vizuály používajú kontext projektu. Zachovanie neznamená schválenie vizuálu.",
  "team.open.image": "Skontrolovať vizuály článku",
  "team.role.seo": "Špecialista SEO",
  "team.description.seo":
    "Datované zistenia auditu stránky, interných odkazov a miestnych údajov/entít. Čiastočné audity si zachovávajú svoje obmedzenia.",
  "team.open.seo": "Skontrolovať zistenia SEO",
  "team.role.authority": "Backlinks a autorita",
  "team.description.authority":
    "Výskum, monitorovanie a návrhy závisia od overeného prístupu k poskytovateľovi. Odosielanie správ a nákup umiestnení vyžadujú samostatné oprávnenie.",
  "team.open.authority": "Skontrolovať pracovný priestor Backlinks",
  "team.role.ai": "Analytik viditeľnosti v AI",
  "team.description.ai":
    "Odporúčania k pripravenosti sú oddelené od pozorovaných odpovedí, zmienok a citácií. Sledovanie skutočných výskytov tu nie je preukázané.",
  "team.open.ai": "Skontrolovať odporúčania k pripravenosti",
  "team.role.performance": "Analytik výkonnosti",
  "team.description.performance":
    "Uložené prehľady a datované merania. Chýbajúce údaje sú neznáme; samotná zmena pred/po nedokazuje príčinnú súvislosť.",
  "team.open.performance": "Skontrolovať merania",
  "team.state.unavailable": "Stav nie je dostupný",
  "team.state.none": "Žiadna zaznamenaná práca",
  "team.state.unknown": "Výsledok je neistý — skontrolujte obnovu",
  "team.state.running": "Práca prebieha",
  "team.state.review": "Zmeny vlastníka vyžadujú kontrolu",
  "team.state.retained": "Výsledky zachované na kontrolu",
  "team.state.cancelled": "Príprava zrušená",
  "collaboration.reviewImageLimits":
    "Tieto obrázky prekračujú limity kontroly alebo ich nemožno bezpečne zobraziť. Znížte ich počet alebo veľkosť a použite statické obrázky PNG, JPEG alebo WebP.",
  "collaboration.emailInvitation": "Odoslať pozvánku e-mailom",
  "collaboration.invitationEmailHelp":
    "Odošlite pozvánku na e-mailovú adresu uvedenú vyššie pre zobrazenú rolu. Otvorenie odkazu v e-maile neudeľuje prístup.",
  "collaboration.invitationEmailQueued":
    "Odoslanie pozvánky e-mailom bolo vyžiadané. Stav doručenia skontrolujte tu.",
  "collaboration.notificationHistory": "História doručovania oznámení",
  "collaboration.notificationSettings": "Oznámenia projektu",
  "collaboration.notificationConsentHelp":
    "Vyžaduje sa priradenie vlastníkom aj váš vlastný súhlas. Zmena vašej roly v projekte vyžaduje obnovenie nastavení.",
  "collaboration.notificationAssigned": "Priradené vlastníkom",
  "collaboration.notificationNotAssigned": "Nepriradené vlastníkom",
  "collaboration.notificationOptedIn": "Príjemca udelil súhlas",
  "collaboration.notificationOptedOut": "Príjemca neudelil súhlas",
  "collaboration.notificationAssign": "Priradiť oznámenia",
  "collaboration.notificationUnassign": "Odstrániť priradenie",
  "collaboration.notificationOptIn": "Povoliť oznámenia projektu",
  "collaboration.notificationOptOut": "Vypnúť oznámenia projektu",
  "collaboration.decisionRecorded": "Rozhodnutie kontroly bolo zaznamenané.",
  "collaboration.decisionUnknown":
    "Rozhodnutie sa nepodarilo potvrdiť. Pred opakovaním obnovte predchádzajúce rozhodnutia.",
  "collaboration.reviewNotAllowed":
    "Vaša aktuálna rola alebo pravidlá projektu nepovoľujú rozhodnutia kontroly.",
  "collaboration.acknowledgeReview":
    "Skontroloval(a) som tento zobrazený návrh a všetky jeho obrázky.",
  "collaboration.approveVersion": "Schváliť túto verziu",
  "collaboration.returnForChanges": "Vrátiť na úpravy",
  "collaboration.reviewDoesNotPublish":
    "Zaznamenanie kontroly nezverejní návrh ani neobnoví pozastavené naplánovanie.",
  "collaboration.reviewHistory": "Predchádzajúce rozhodnutia kontroly",
  "collaboration.approvalRecorded": "Schválenie zaznamenané",
  "collaboration.changesRequested": "Požadované úpravy",
  "collaboration.owner": "Vlastník",
  "collaboration.collaborator": "Spolupracovník",
  "collaboration.renderedReview": "Kontrola zobrazeného obsahu",
  "collaboration.loadingReview": "Načítavame úplný obsah na kontrolu a jeho obrázky…",
  "collaboration.incompleteReview":
    "Úplný obsah na kontrolu sa nepodarilo načítať. Obnovte ho a skontrolujte návrh aj všetky jeho obrázky.",
  "collaboration.policyTitle": "Pravidlá schvaľovania",
  "collaboration.policyHelp":
    "Vyberte, kto môže schvaľovať prácu projektu. Zmena týchto pravidiel odvolá existujúce schválenia spolupracovníkov; nezávislé schválenia vlastníka zostanú.",
  "collaboration.policyUnselected": "Nevybrané — schvaľovanie spolupracovníkmi je neaktívne",
  "collaboration.policy.disabled": "Iba schválenia vlastníka",
  "collaboration.policy.separate_reviewers":
    "Samostatní posudzovatelia schvaľujú; editori upravujú",
  "collaboration.policy.editors_can_approve": "Editori a posudzovatelia môžu schvaľovať",
  "collaboration.savePolicy": "Uložiť pravidlá schvaľovania",
  "collaboration.editDraft": "Upraviť návrh",
  "collaboration.editHelp":
    "Uloženie vráti tento návrh na kontrolu a odvolá jeho predchádzajúce schválenie publikovania.",
  "collaboration.editConflict":
    "Uložený návrh alebo vaša rola sa zmenili. Pred načítaním najnovšej uloženej verzie skopírujte úpravy, ktoré chcete zachovať.",
  "collaboration.loadLatest": "Načítať najnovšiu uloženú verziu",
  "collaboration.draftSaved": "Návrh bol uložený na kontrolu.",
  "collaboration.editError":
    "Návrh sa nepodarilo uložiť. Vaše úpravy sú stále tu; pred opakovaním skontrolujte aktuálnu verziu a svoj prístup.",
  "collaboration.saveDraft": "Uložiť na kontrolu",
  "collaboration.question": "Otázka",
  "collaboration.answer": "Odpoveď",
  "collaboration.removeQuestion": "Odstrániť otázku",
  "collaboration.addQuestion": "Pridať otázku",
  "collaboration.field.title": "Titulok",
  "collaboration.field.h1": "Hlavný nadpis",
  "collaboration.field.metaTitle": "Titulok pre vyhľadávanie",
  "collaboration.field.metaDescription": "Opis pre vyhľadávanie",
  "collaboration.field.markdown": "Článok (Markdown)",
  "collaboration.field.cta": "Výzva na akciu",
  "collaboration.field.outline": "Osnova — jeden nadpis na riadok",
  "collaboration.field.faq": "Otázky a odpovede",
  "collaboration.comments": "Komentáre",
  "collaboration.commentLabel": "Váš komentár",
  "collaboration.addComment": "Pridať komentár",
  "collaboration.you": "Vy",
  "collaboration.commentRoleAtPosting": "Rola v čase pridania",
  "collaboration.earlierVersion": "Komentár k skoršej uloženej verzii.",
  "collaboration.title": "Spolupracovníci projektu",
  "collaboration.subtitle": "Spravujte prístup k projektu a otvorte prácu zdieľanú s vami.",
  "collaboration.owned": "Spravovať svoj projekt",
  "collaboration.shared": "Zdieľané s vami",
  "collaboration.invitations": "Vaše pozvánky",
  "collaboration.members": "Ľudia s prístupom",
  "collaboration.pending": "Pozvánky do projektu",
  "collaboration.email": "E-mailová adresa",
  "collaboration.role": "Rola",
  "collaboration.viewer": "Čitateľ",
  "collaboration.editor": "Editor",
  "collaboration.reviewer": "Posudzovateľ",
  "collaboration.invite": "Vytvoriť pozvánku",
  "collaboration.inviteHelp":
    "Pozvánka sa tu zobrazí, keď sa príjemca prihlási s týmto overeným e-mailom. Jej platnosť uplynie po siedmich dňoch. Táto akcia neposiela e-mail.",
  "collaboration.accept": "Prijať pozvánku",
  "collaboration.revoke": "Zneplatniť pozvánku",
  "collaboration.remove": "Odobrať prístup",
  "collaboration.saveRole": "Uložiť rolu",
  "collaboration.refresh": "Obnoviť",
  "collaboration.open": "Otvoriť projekt",
  "collaboration.loading": "Načítavame prístup k projektu…",
  "collaboration.error": "Prístup sa nepodarilo potvrdiť. Pred opakovaním ho obnovte.",
  "collaboration.saved": "Prístup k projektu bol aktualizovaný.",
  "collaboration.empty": "Zatiaľ nie je čo zobraziť.",
  "collaboration.noOwned":
    "Zdieľané projekty môžete otvoriť nižšie bez vytvorenia vlastného projektu.",
  "collaboration.drafts": "Návrhy projektu",
  "collaboration.back": "Späť na návrhy",
  "collaboration.previous": "Predchádzajúce",
  "collaboration.next": "Ďalšie",
  "collaboration.removed": "Odstránené",
  "collaboration.expires": "Platnosť uplynie",
  "collaboration.history": "Nedávna aktivita prístupu",
  "collaboration.pendingState": "Čaká",
  "collaboration.expired": "Platnosť uplynula",
  "collaboration.accepted": "Prijaté",
  "collaboration.revoked": "Zneplatnené",
  "emailSettings.language": "Jazyk e-mailov",
  "emailSettings.note":
    "Vyberte jazyk prevádzkových súhrnov, mesačných prehľadov a pozvánok do projektov, ktoré vyžiadate. Týmto sa nemenia nastavenia aplikácie, článku ani trhu. Uloženie jazyka nezapína ani neposiela e-mail.",
  "emailSettings.save": "Uložiť jazyk e-mailov",
  "emailSettings.saved": "Nastavenia e-mailu boli uložené.",
  "emailSettings.uncertain":
    "Uložené nastavenia sa nepodarilo potvrdiť. Pred ďalšou zmenou ich znova načítajte; posledná zmena už mohla byť uložená.",
  "emailSettings.reload": "Znova načítať uložené nastavenia (zahodiť úpravy)",
  "collaboration.seats":
    "Váš plán {plan} zahŕňa {workingSeats} pracovných miest (editori a recenzenti vrátane vás) a {viewerSeats} miest na prezeranie. Využité: {usedWorkingSeats} pracovných, {usedViewerSeats} na prezeranie. Čakajúce pozvánky rezervujú miesta, kým nevypršia.",
  "collaboration.seatLimit":
    "Pre túto rolu nie je voľné žiadne miesto. Váš plán zahŕňa {workingSeats} pracovných miest a {viewerSeats} miest na prezeranie. Niekoho odstráňte alebo odvolajte pozvánku, prípadne prejdite na vyšší plán.",
};
