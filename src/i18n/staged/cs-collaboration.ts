/** Czech authoring only; not registered in the runtime or language picker. */
export const csCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Aktuální práce na projektu",
  "awareness.help":
    "Pouze v aplikaci. Tyto kontroly neodesílají e-maily. Pozastavené položky zůstávají viditelné, dokud se fronta nezmění; jejich otevření neschvaluje ani znovu nespouští práci.",
  "awareness.project": "Vybrat projekt",
  "awareness.approval": "Přesná verze vyžaduje schválení",
  "awareness.resume": "Schválená verze je stále pozastavená",
  "awareness.late":
    "Toto datum již uplynulo. Zkontrolujte návrh a výslovně vyberte akci pro plánování zveřejnění.",
  "awareness.paused":
    "Automatizace je záměrně pozastavená. Stávající pozastavení zveřejnění zůstávají samostatná.",
  "awareness.disabled": "Automatizace je vypnutá.",
  "awareness.settings": "Otevřít nastavení plánování",
  "awareness.history":
    "Poslední uložený týdenní výsledek — historický záznam, nikoli nová kontrola kapacity nebo zdrojů",
  "awareness.empty": "Na této stránce nejsou žádné položky pozastavené kvůli schválení.",
  "awareness.page": "Stránka fronty {page} z {pages}",
  "awareness.error": "Aktuální záznamy se nepodařilo zkontrolovat. Před další akcí obnovte údaje.",
  "awareness.checked": "Zkontrolováno {at}",
  "awareness.weekly": "Aktuální záznamy týdenních termínů",
  "awareness.earlier": "Dřívější upozornění v doručené poště",
  "notifications.failureInspect": "Zkontrolovat podrobnosti zveřejnění",
  "notifications.failureReadError":
    "Podrobnosti zveřejnění se nepodařilo zkontrolovat. Než rozhodnete o dalším postupu, zkuste to znovu.",
  "notifications.failureReason.contentReview":
    "Uložený pokus zablokovaly kontroly obsahu. Otevřete návrh a zkontrolujte jeho aktuální připravenost.",
  "notifications.failureReason.destination":
    "Uložený pokus zaznamenal chybu připojení k cíli nebo jeho odpovědi. Před opakováním zkontrolujte cíl.",
  "notifications.failureReason.configuration":
    "Uložený pokus zaznamenal chybějící nebo neplatné nastavení zveřejňování. Zkontrolujte nastavení projektu.",
  "notifications.failureReason.unknown":
    "Uloženou chybu se nepodařilo zařadit. Před opakováním zkontrolujte návrh a cíl.",
  "notifications.failureRecorded":
    "Záznam aktualizován {at}, v časovém pásmu vašeho prohlížeče. Počet zaznamenaných pokusů: {attempts}.",
  "notifications.failureDraftChanged":
    "Návrh se po tomto záznamu změnil. Tyto podrobnosti již nemusí odpovídat jeho aktuální připravenosti.",
  "notifications.failureHttp": "Zaznamenaná odpověď webu: HTTP {status}.",
  "notifications.failureCheck.links":
    "Vyřešte interní odkazy v panelu bezpečnosti odkazů v editoru.",
  "notifications.failureCheck.sourcesReview":
    "Ověřte tvrzení podle zdrojů nebo s kvalifikovaným autorem a dokončete lidskou kontrolu.",
  "notifications.failureCheck.author":
    "Přidejte jméno skutečného autora a životopis, údaj o kvalifikaci nebo profil.",
  "notifications.failureHistoryLimit":
    "Jde o historické informace uložené v Milo. Nekontrolují cíl, neschvalují aktuální návrh ani znovu nespouštějí zveřejnění.",
  "notifications.failureState.absent":
    "Nebyl nalezen odpovídající záznam ve frontě. Obnovte oznámení a zkontrolujte návrh.",
  "notifications.failureState.changed":
    "Fronta již tuto položku neoznačuje jako neúspěšnou. Obnovte oznámení; tato změna sama o sobě neověřuje cílový web.",
  "notifications.recoveryInspect": "Zkontrolovat uloženou práci",
  "notifications.recoveryReadError":
    "Uložené záznamy automatizace se nepodařilo zkontrolovat. Než rozhodnete o opětovném spuštění, zkuste to znovu.",
  "notifications.recoveryState.absent":
    "Nebyl nalezen záznam aktuálního běhu. Obnovte oznámení a zjistěte, zda byl tento incident vyřešen.",
  "notifications.recoveryState.running": "Poslední běh je označen jako aktivní.",
  "notifications.recoveryState.completed":
    "Poslední běh skončil. Obnovte oznámení pro aktuální problémy.",
  "notifications.recoveryState.review_required": "Přerušený běh stále vyžaduje kontrolu.",
  "notifications.recoverySnapshot":
    "Záznamy Milo zkontrolovány v {at}, v časovém pásmu vašeho prohlížeče.",
  "notifications.recoveryCounts":
    "Plán {period}: uložených návrhů: {saved}. Záznamy fronty pro tyto návrhy: čeká {pending}, probíhá {publishing}, zaznamenáno jako zveřejněné {published}, neúspěšné {failed} a zrušené {cancelled}.",
  "notifications.recoveryEvidenceLimit":
    "Jde o záznamy uložené v Milo. Neověřují poslední operaci AI ani cílový web. Před opakováním zveřejnění s nejistým výsledkem zkontrolujte cíl. Toto zobrazení znovu nespouští práci.",
  "notifications.recoveryMore":
    "Zobrazeno {shown} z {total} uložených návrhů. Otevřete kalendář a zkontrolujte zbývající práci.",
  "notifications.emailAddressUnverified":
    "Vaše aktuální e-mailová adresa účtu není ověřená. Dokončete potvrzení e-mailu a poté kontrolu zopakujte. Pokud adresu změnil správce a nemáte potvrzovací odkaz, kontaktujte podporu Milo. Oznámení v aplikaci zůstávají dostupná.",
  "notifications.emailAddressUnavailable":
    "Milo nemohlo zkontrolovat aktuální ověření vašeho e-mailu. Zkuste to později. Souhrny můžete stále vypnout a používat oznámení v aplikaci.",
  "notifications.generation_capacity_low": "Limit přípravy nemusí pokrýt plán",
  "notifications.generation_capacity_unavailable": "Limit přípravy se nepodařilo zkontrolovat",
  "notifications.capacityLow":
    "Plán {period} stále potřebuje {missing} návrhů pro tento projekt a {total} ve všech vašich aktivních plánech. Vašemu účtu zbývá {remaining} pokusů o přípravu v období {usagePeriod}. Jde o sdílenou kapacitu, nikoli příslib dokončených článků. Zkontrolujte plán; uložené návrhy zůstávají dostupné ke kontrole a zveřejnění.",
  "notifications.capacityUnavailable":
    "Milo nemohlo ověřit sdílený limit přípravy pro období {usagePeriod}. Plán {period} zde stále potřebuje {missing} návrhů. Kontrolu zopakujte později. Uložené návrhy a ostatní oznámení zůstávají dostupné.",
  "notifications.scheduler_recovery": "Automatizace vyžaduje kontrolu před obnovením",
  "notifications.recovery":
    "Příprava byla po přerušeném běhu pozastavena. Před opětovným spuštěním zkontrolujte uložené návrhy a poslední operaci. Stávající schválení zveřejnění se nemění.",
  "notifications.emailTitle": "E-mailové souhrny",
  "notifications.emailDescription":
    "Dostávejte jeden souhrn nových upozornění, nejvýše jednou za hodinu, na potvrzenou adresu účtu. Každý incident se objeví jednou.",
  "notifications.emailDisabled":
    "Doručování e-mailů zatím nebylo aktivováno. Oznámení v aplikaci jsou dostupná.",
  "notifications.emailEnable": "Zapnout e-mailové souhrny",
  "notifications.emailDisable": "Vypnout e-mailové souhrny",
  "notifications.emailError": "Nastavení e-mailu je dočasně nedostupné.",
  "notifications.emailSaveError": "Předvolby e-mailu se nepodařilo uložit.",
  "notifications.emailHistory": "Nedávná e-mailová aktivita",
  "notifications.emailStatus.pending": "Čeká",
  "notifications.emailStatus.leased": "Kontrola aktuálního stavu",
  "notifications.emailStatus.sending": "Odesílání",
  "notifications.emailStatus.accepted": "Přijato poskytovatelem e-mailu",
  "notifications.emailStatus.unknown": "Výsledek doručení vyžaduje ověření",
  "notifications.emailStatus.cancelled": "Zrušeno",
  "notifications.emailStatus.failed": "E-mail se nepodařilo připravit",
  "notifications.title": "Oznámení",
  "notifications.subtitle":
    "Vaše nadcházející rozhodnutí a problémy se zveřejňováním, zkontrolované podle nejnovějšího stavu serveru.",
  "notifications.loading": "Kontrola vašeho plánu…",
  "notifications.empty": "Právě teď žádné akce nevyžadují vaši pozornost.",
  "notifications.error": "Oznámení jsou dočasně nedostupná.",
  "notifications.stale":
    "Poslední kontrola se nedokončila. Toto jsou poslední potvrzená upozornění.",
  "notifications.refresh": "Zkontrolovat znovu",
  "notifications.read": "Označit jako přečtené",
  "notifications.unread": "Nepřečtené",
  "notifications.saved": "Přečtené",
  "notifications.open": "Otevřít úkol",
  "notifications.calendar": "Otevřít kalendář",
  "notifications.project": "Projekt",
  "notifications.approval_due": "Blíží se termín schválení",
  "notifications.publication_failed": "Zveřejnění vyžaduje kontrolu",
  "notifications.manual_overdue": "Ruční úkol je po termínu",
  "notifications.cadence_gap": "Příští týden vyžaduje pozornost",
  "notifications.coverage":
    "{missing} z {total} plánovaných termínů není připraveno a zařazeno do fronty.",
  "notifications.failure":
    "Před opakováním zkontrolujte cíl: přerušené zveřejnění již mohlo být dokončeno na webu.",
  "notifications.approval": "Zkontrolujte aktuální verzi před jejím plánovaným termínem.",
  "notifications.manual":
    "Dokončete tento úkol nebo vyberte nové datum. Tento termín se týká ručního úkolu.",
  "notifications.readError": "Oznámení se nepodařilo označit jako přečtené. Zkuste to znovu.",
  "team.title": "Tým Milo",
  "team.help":
    "Jeden pracovní prostor s odbornými pohledy na skutečnou práci a projektové znalosti.",
  "team.selectProject": "Vyberte projekt a zobrazte jeho tým.",
  "team.scope":
    "Stav úloh se týká vybraného týdne. Uložené rady a zprávy jsou datované podklady, nikoli důkaz aktivní úlohy nebo lepších výsledků.",
  "team.aiRole": "Specialista AI",
  "team.records": "Uložené záznamy znalostí: {count} · stav kontroly v projektových znalostech",
  "team.lastDelivery": "Poslední výstup v úlohách tohoto týdne",
  "team.auditFetched": "Uložený audit webu",
  "team.auditPartial": "Uložený audit pouze z kontextu projektu",
  "team.adviceSaved": "Uložená doporučení k připravenosti pro AI",
  "team.imports": "Uložené importy měření GSC: {count}",
  "team.measurementMissing": "Žádná uložená měření GSC",
  "team.authorityPrerequisite":
    "Údaje poskytovatele a oprávnění k oslovování je nutné zkontrolovat v pracovním prostoru zpětných odkazů.",
  "team.lesson.title": "Zapamatovat redakční pravidlo",
  "team.lesson.help":
    "Zapište opakovanou preferenci pro tento projekt. Uložením se z ní stane výslovný pokyn projektu pro příslušnou budoucí práci. Běžné úpravy článků nevytvářejí pravidla. Nejde o doložení faktů.",
  "team.lesson.rule": "Pokyn pro tento projekt",
  "team.lesson.target": "Použít pro",
  "team.lesson.text": "Psaní",
  "team.lesson.visual": "Vizuály",
  "team.lesson.both": "Psaní a vizuály",
  "team.lesson.save": "Uložit pokyn projektu",
  "team.lesson.manage": "Zkontrolovat, upravit nebo zapomenout znalosti",
  "team.lesson.saved":
    "Uloženo do tohoto projektu. V projektových znalostech můžete pokyn upravit, vrátit změnu nebo odvolat.",
  "team.lesson.unknown":
    "Uložení se nepodařilo potvrdit. Než pokyn zadáte znovu, zkontrolujte projektové znalosti.",
  "team.role.lead": "Milo — Vedoucí růstu",
  "team.description.lead": "Koordinuje uložený plán, pokrytí a rozhodnutí.",
  "team.open.lead": "Zkontrolovat týdenní přípravu",
  "team.role.brand": "Stratég značky",
  "team.description.brand":
    "Fakta o projektu, preference a odvolatelná pravidla se zdrojem a historií kontrol.",
  "team.open.brand": "Zkontrolovat projektové znalosti",
  "team.role.research": "Průzkumník vyhledávání",
  "team.description.research":
    "Týdenní rešeršní zadání a uložené příležitosti. Před psaním zkontrolujte zdroje a hypotézy.",
  "team.open.research": "Zkontrolovat příležitosti",
  "team.role.content": "Editor obsahu",
  "team.description.content":
    "Uchované články stále vyžadují redakční kontrolu a schválení přesné verze ke zveřejnění.",
  "team.open.content": "Zkontrolovat články",
  "team.role.image": "Tvůrce vizuálů",
  "team.description.image":
    "Navržené vizuály využívají kontext projektu. Uchování neznamená schválení vizuálu.",
  "team.open.image": "Zkontrolovat vizuály článků",
  "team.role.seo": "Specialista SEO",
  "team.description.seo":
    "Datované nálezy z auditu stránek, interních odkazů a místních údajů či entit. Omezení částečných auditů zůstávají v platnosti.",
  "team.open.seo": "Zkontrolovat nálezy SEO",
  "team.role.authority": "Zpětné odkazy a autorita",
  "team.description.authority":
    "Průzkum, sledování a návrhy závisí na ověřeném přístupu k poskytovateli. Odesílání zpráv a nákup umístění vyžadují samostatné oprávnění.",
  "team.open.authority": "Zkontrolovat pracovní prostor zpětných odkazů",
  "team.role.ai": "Analytik viditelnosti v AI",
  "team.description.ai":
    "Doporučení k připravenosti jsou oddělená od pozorovaných odpovědí, zmínek a citací. Sledování skutečných výskytů zde není doloženo.",
  "team.open.ai": "Zkontrolovat doporučení k připravenosti",
  "team.role.performance": "Analytik výkonu",
  "team.description.performance":
    "Uložené zprávy a datovaná měření. Chybějící data znamenají neznámý stav; samotná změna před a po neprokazuje příčinnou souvislost.",
  "team.open.performance": "Zkontrolovat měření",
  "team.state.unavailable": "Stav není dostupný",
  "team.state.none": "Žádná zaznamenaná práce",
  "team.state.unknown": "Nejistý výsledek — zkontrolujte obnovení",
  "team.state.running": "Práce probíhá",
  "team.state.review": "Změny vlastníka vyžadují kontrolu",
  "team.state.retained": "Výsledky uchovány ke kontrole",
  "team.state.cancelled": "Příprava zrušena",
  "collaboration.reviewImageLimits":
    "Tyto obrázky překračují limity kontroly nebo je nelze bezpečně zobrazit. Snižte jejich počet nebo velikost a použijte statické obrázky PNG, JPEG nebo WebP.",
  "collaboration.emailInvitation": "Odeslat pozvánku e-mailem",
  "collaboration.invitationEmailHelp":
    "Odešlete pozvánku na výše uvedenou e-mailovou adresu pro zobrazenou roli. Otevření odkazu v e-mailu neuděluje přístup.",
  "collaboration.invitationEmailQueued":
    "O odeslání pozvánky e-mailem bylo požádáno. Zde zkontrolujte stav doručení.",
  "collaboration.notificationHistory": "Historie doručování oznámení",
  "collaboration.notificationSettings": "Oznámení projektu",
  "collaboration.notificationConsentHelp":
    "Je vyžadováno přiřazení vlastníkem i váš vlastní souhlas. Změny vaší role v projektu vyžadují nové nastavení.",
  "collaboration.notificationAssigned": "Přiřazeno vlastníkem",
  "collaboration.notificationNotAssigned": "Nepřiřazeno vlastníkem",
  "collaboration.notificationOptedIn": "Příjemce udělil souhlas",
  "collaboration.notificationOptedOut": "Příjemce neudělil souhlas",
  "collaboration.notificationAssign": "Přiřadit oznámení",
  "collaboration.notificationUnassign": "Zrušit přiřazení",
  "collaboration.notificationOptIn": "Povolit oznámení projektu",
  "collaboration.notificationOptOut": "Vypnout oznámení projektu",
  "collaboration.decisionRecorded": "Rozhodnutí o kontrole zaznamenáno.",
  "collaboration.decisionUnknown":
    "Rozhodnutí se nepodařilo potvrdit. Před dalším pokusem obnovte předchozí rozhodnutí.",
  "collaboration.reviewNotAllowed":
    "Vaše aktuální role nebo pravidla projektu neumožňují rozhodovat o kontrole.",
  "collaboration.acknowledgeReview":
    "Prohlédl(a) jsem si tento vykreslený návrh a všechny jeho obrázky.",
  "collaboration.approveVersion": "Schválit tuto verzi",
  "collaboration.returnForChanges": "Vrátit k úpravám",
  "collaboration.reviewDoesNotPublish":
    "Zaznamenání kontroly nezveřejňuje návrh ani neobnovuje pozastavené plánování.",
  "collaboration.reviewHistory": "Předchozí rozhodnutí o kontrole",
  "collaboration.approvalRecorded": "Schválení zaznamenáno",
  "collaboration.changesRequested": "Požadovány úpravy",
  "collaboration.owner": "Vlastník",
  "collaboration.collaborator": "Spolupracovník",
  "collaboration.renderedReview": "Kontrola vykresleného návrhu",
  "collaboration.loadingReview": "Načítání úplného náhledu ke kontrole a jeho obrázků…",
  "collaboration.incompleteReview":
    "Úplný náhled ke kontrole se nepodařilo načíst. Obnovte jej a zkontrolujte návrh i všechny jeho obrázky.",
  "collaboration.policyTitle": "Pravidla schvalování",
  "collaboration.policyHelp":
    "Vyberte, kdo může schvalovat práci na projektu. Změna těchto pravidel odvolá stávající schválení spolupracovníků; nezávislá schválení vlastníka zůstávají v platnosti.",
  "collaboration.policyUnselected": "Nevybráno — schvalování spolupracovníky není aktivní",
  "collaboration.policy.disabled": "Schvaluje pouze vlastník",
  "collaboration.policy.separate_reviewers": "Samostatní posuzovatelé schvalují; editoři upravují",
  "collaboration.policy.editors_can_approve": "Editoři a posuzovatelé mohou schvalovat",
  "collaboration.savePolicy": "Uložit pravidla schvalování",
  "collaboration.editDraft": "Upravit návrh",
  "collaboration.editHelp":
    "Uložení vrátí tento návrh ke kontrole a odvolá jeho předchozí schválení ke zveřejnění.",
  "collaboration.editConflict":
    "Uložený návrh nebo vaše role se změnily. Před načtením nejnovější uložené verze zkopírujte úpravy, které chcete zachovat.",
  "collaboration.loadLatest": "Načíst nejnovější uloženou verzi",
  "collaboration.draftSaved": "Návrh uložen ke kontrole.",
  "collaboration.editError":
    "Návrh se nepodařilo uložit. Vaše úpravy zde zůstávají; před opakováním zkontrolujte aktuální verzi a svůj přístup.",
  "collaboration.saveDraft": "Uložit ke kontrole",
  "collaboration.question": "Otázka",
  "collaboration.answer": "Odpověď",
  "collaboration.removeQuestion": "Odstranit otázku",
  "collaboration.addQuestion": "Přidat otázku",
  "collaboration.field.title": "Název",
  "collaboration.field.h1": "Hlavní nadpis",
  "collaboration.field.metaTitle": "Titulek pro vyhledávání",
  "collaboration.field.metaDescription": "Popis pro vyhledávání",
  "collaboration.field.markdown": "Článek (Markdown)",
  "collaboration.field.cta": "Výzva k akci",
  "collaboration.field.outline": "Osnova — jeden nadpis na řádek",
  "collaboration.field.faq": "Otázky a odpovědi",
  "collaboration.comments": "Komentáře",
  "collaboration.commentLabel": "Váš komentář",
  "collaboration.addComment": "Přidat komentář",
  "collaboration.you": "Vy",
  "collaboration.commentRoleAtPosting": "Role v době zveřejnění",
  "collaboration.earlierVersion": "Komentář k dřívější uložené verzi.",
  "collaboration.title": "Spolupracovníci projektu",
  "collaboration.subtitle": "Spravujte přístup k projektu a otevřete práci sdílenou s vámi.",
  "collaboration.owned": "Spravovat vlastní projekt",
  "collaboration.shared": "Sdíleno s vámi",
  "collaboration.invitations": "Vaše pozvánky",
  "collaboration.members": "Lidé s přístupem",
  "collaboration.pending": "Pozvánky do projektu",
  "collaboration.email": "E-mailová adresa",
  "collaboration.role": "Role",
  "collaboration.viewer": "Čtenář",
  "collaboration.editor": "Editor",
  "collaboration.reviewer": "Posuzovatel",
  "collaboration.invite": "Vytvořit pozvánku",
  "collaboration.inviteHelp":
    "Pozvánka se zde zobrazí, když se příjemce přihlásí s tímto ověřeným e-mailem. Platnost vyprší po sedmi dnech. Tato akce neodesílá e-mail.",
  "collaboration.accept": "Přijmout pozvánku",
  "collaboration.revoke": "Odvolat pozvánku",
  "collaboration.remove": "Odebrat přístup",
  "collaboration.saveRole": "Uložit roli",
  "collaboration.refresh": "Obnovit",
  "collaboration.open": "Otevřít projekt",
  "collaboration.loading": "Načítání přístupu k projektu…",
  "collaboration.error": "Přístup se nepodařilo potvrdit. Před dalším pokusem obnovte údaje.",
  "collaboration.saved": "Přístup k projektu aktualizován.",
  "collaboration.empty": "Zatím není co zobrazit.",
  "collaboration.noOwned":
    "Níže můžete otevřít sdílené projekty, aniž byste vytvářeli vlastní projekt.",
  "collaboration.drafts": "Návrhy projektu",
  "collaboration.back": "Zpět na návrhy",
  "collaboration.previous": "Předchozí",
  "collaboration.next": "Další",
  "collaboration.removed": "Odebráno",
  "collaboration.expires": "Platnost do",
  "collaboration.history": "Nedávné změny přístupu",
  "collaboration.pendingState": "Čeká",
  "collaboration.expired": "Platnost vypršela",
  "collaboration.accepted": "Přijato",
  "collaboration.revoked": "Odvoláno",
  "emailSettings.language": "Jazyk e-mailů",
  "emailSettings.note":
    "Vyberte jazyk provozních souhrnů, měsíčních zpráv a pozvánek do projektu, o jejichž odeslání požádáte. Tím se nemění nastavení aplikace, článků ani trhu. Uložení jazyka nezapíná ani neodesílá e-maily.",
  "emailSettings.save": "Uložit jazyk e-mailů",
  "emailSettings.saved": "Nastavení e-mailu uloženo.",
  "emailSettings.uncertain":
    "Uložené nastavení se nepodařilo potvrdit. Před další změnou je znovu načtěte; poslední změna již mohla být uložena.",
  "emailSettings.reload": "Znovu načíst uložené nastavení (zahodit úpravy)",
};
