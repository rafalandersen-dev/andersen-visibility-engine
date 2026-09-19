/** Bulgarian authoring only; not registered in the runtime or language picker. */
export const bgCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Текуща работа по проекта",
  "awareness.help":
    "Само в приложението. Тези проверки не изпращат имейли. Задържаните задачи остават видими до промяна на опашката; отварянето им не одобрява и не рестартира работата.",
  "awareness.project": "Избери проект",
  "awareness.approval": "Конкретната версия изисква одобрение",
  "awareness.resume": "Одобрената версия все още е задържана",
  "awareness.late":
    "Тази дата е минала. Прегледайте черновата и изберете изрично действие за насрочване.",
  "awareness.paused":
    "Автоматизацията е умишлено спряна на пауза. Съществуващите задържания на публикации остават отделни.",
  "awareness.disabled": "Автоматизацията е изключена.",
  "awareness.settings": "Отвори настройките на графика",
  "awareness.history":
    "Последен запазен седмичен резултат — исторически данни, а не нова проверка на капацитета или източниците",
  "awareness.empty": "На тази страница няма задачи, задържани за одобрение.",
  "awareness.page": "Страница {page} от {pages} в опашката",
  "awareness.error": "Текущите записи не бяха проверени. Обновете, преди да предприемете действие.",
  "awareness.checked": "Проверено: {at}",
  "awareness.weekly": "Текущи записи за седмичните позиции",
  "awareness.earlier": "По-ранни сигнали във входящата кутия",
  "notifications.failureInspect": "Прегледай подробностите за публикуването",
  "notifications.failureReadError":
    "Подробностите за публикуването не бяха проверени. Опитайте отново, преди да решите какво да направите.",
  "notifications.failureReason.contentReview":
    "Запазеният опит е бил блокиран от проверките на съдържанието. Отворете черновата, за да прегледате текущата ѝ готовност.",
  "notifications.failureReason.destination":
    "Запазеният опит е отчел грешка във връзката или отговора на дестинацията. Проверете дестинацията, преди да опитате отново.",
  "notifications.failureReason.configuration":
    "Запазеният опит е отчел липсваща или невалидна конфигурация за публикуване. Проверете Настройване на проекта.",
  "notifications.failureReason.unknown":
    "Запазената грешка не бе класифицирана. Прегледайте черновата и дестинацията, преди да опитате отново.",
  "notifications.failureRecorded":
    "Записът е обновен: {at}, в часовата зона на браузъра ви. Записани опити: {attempts}.",
  "notifications.failureDraftChanged":
    "Черновата е променена след този запис. Тези подробности може вече да не описват текущата ѝ готовност.",
  "notifications.failureHttp": "Записан отговор от сайта: HTTP {status}.",
  "notifications.failureCheck.links":
    "Разрешете вътрешните връзки в панела за безопасност на връзките в редактора.",
  "notifications.failureCheck.sourcesReview":
    "Проверете твърденията спрямо източници или с квалифициран автор и завършете човешкия преглед.",
  "notifications.failureCheck.author":
    "Добавете името на реалния автор и биография, квалификация или профил.",
  "notifications.failureHistoryLimit":
    "Това е историческа информация, запазена в Milo. Тя не проверява дестинацията, не одобрява текущата чернова и не рестартира публикуването.",
  "notifications.failureState.absent":
    "Не е намерен съответстващ запис в опашката. Обновете известията и прегледайте черновата.",
  "notifications.failureState.changed":
    "Опашката вече не отбелязва този елемент като неуспешен. Обновете известията; само тази промяна не потвърждава състоянието на целевия сайт.",
  "notifications.recoveryInspect": "Прегледай запазената работа",
  "notifications.recoveryReadError":
    "Запазените записи за автоматизацията не бяха проверени. Опитайте отново, преди да решите дали да рестартирате.",
  "notifications.recoveryState.absent":
    "Не е намерен текущ запис за изпълнение. Обновете известията, за да проверите дали този инцидент е разрешен.",
  "notifications.recoveryState.running": "Последното изпълнение е отбелязано като активно.",
  "notifications.recoveryState.completed":
    "Последното изпълнение е приключило. Обновете известията за текущи проблеми.",
  "notifications.recoveryState.review_required": "Прекъснатото изпълнение все още изисква преглед.",
  "notifications.recoverySnapshot":
    "Записите в Milo са проверени: {at}, в часовата зона на браузъра ви.",
  "notifications.recoveryCounts":
    "План {period}: {saved} запазени чернови. Записи в опашката за тези чернови: {pending} изчакващи, {publishing} в изпълнение, {published} записани като публикувани, {failed} неуспешни и {cancelled} отменени.",
  "notifications.recoveryEvidenceLimit":
    "Това са записи, запазени в Milo. Те не потвърждават последната операция с изкуствен интелект или целевия сайт. Проверете дестинацията, преди да повторите публикуване с несигурен резултат. Този изглед не рестартира работата.",
  "notifications.recoveryMore":
    "Показани са {shown} от {total} запазени чернови. Отворете календара, за да прегледате останалата работа.",
  "notifications.emailAddressUnverified":
    "Текущият имейл адрес на акаунта ви не е потвърден. Завършете потвърждението на имейла, след което проверете отново. Ако адресът е променен от администратор и нямате връзка за потвърждение, свържете се с поддръжката на Milo. Известията в приложението остават достъпни.",
  "notifications.emailAddressUnavailable":
    "Milo не успя да провери текущото потвърждение на имейла ви. Опитайте по-късно. Все още можете да изключите обобщенията и да използвате известията в приложението.",
  "notifications.generation_capacity_low": "Лимитът за подготовка може да не покрие плана",
  "notifications.generation_capacity_unavailable": "Лимитът за подготовка не бе проверен",
  "notifications.capacityLow":
    "За плана {period} все още са нужни {missing} чернови за този проект и {total} за всички активни графици. Акаунтът ви има още {remaining} опита за подготовка през {usagePeriod}. Това е споделен капацитет, а не обещание за завършени статии. Прегледайте графика; запазените чернови остават достъпни за преглед и публикуване.",
  "notifications.capacityUnavailable":
    "Milo не успя да потвърди споделения лимит за подготовка за {usagePeriod}. За плана {period} тук все още са нужни {missing} чернови. Проверете по-късно. Запазените чернови и другите известия остават достъпни.",
  "notifications.scheduler_recovery": "Автоматизацията изисква преглед за възстановяване",
  "notifications.recovery":
    "Подготовката е спряна на пауза след прекъснато изпълнение. Прегледайте запазените чернови и последната операция, преди да рестартирате. Съществуващите одобрения за публикуване остават непроменени.",
  "notifications.emailTitle": "Обобщения по имейл",
  "notifications.emailDescription":
    "Получавайте обобщение на новите сигнали най-много веднъж на час на потвърдения адрес на акаунта си. Всеки инцидент се включва веднъж.",
  "notifications.emailDisabled":
    "Доставянето на имейли все още не е активирано. Известията в приложението са достъпни.",
  "notifications.emailEnable": "Включи обобщенията по имейл",
  "notifications.emailDisable": "Изключи обобщенията по имейл",
  "notifications.emailError": "Настройките за имейл са временно недостъпни.",
  "notifications.emailSaveError": "Предпочитанията за имейл не бяха запазени.",
  "notifications.emailHistory": "Скорошна имейл активност",
  "notifications.emailStatus.pending": "Изчакване",
  "notifications.emailStatus.leased": "Проверка на текущото състояние",
  "notifications.emailStatus.sending": "Изпращане",
  "notifications.emailStatus.accepted": "Прието от доставчика на имейл",
  "notifications.emailStatus.unknown": "Резултатът от доставката изисква проверка",
  "notifications.emailStatus.cancelled": "Отменено",
  "notifications.emailStatus.failed": "Имейлът не бе подготвен",
  "notifications.title": "Известия",
  "notifications.subtitle":
    "Предстоящите ви решения и проблеми с публикуването, проверени спрямо последното състояние на сървъра.",
  "notifications.loading": "Проверка на плана ви…",
  "notifications.empty": "В момента няма действия, които изискват вниманието ви.",
  "notifications.error": "Известията са временно недостъпни.",
  "notifications.stale": "Последната проверка не приключи. Това са последните потвърдени сигнали.",
  "notifications.refresh": "Провери отново",
  "notifications.read": "Отбележи като прочетено",
  "notifications.unread": "Непрочетено",
  "notifications.saved": "Прочетено",
  "notifications.open": "Отвори задачата",
  "notifications.calendar": "Отвори календара",
  "notifications.project": "Проект",
  "notifications.approval_due": "Скоро предстои одобрение",
  "notifications.publication_failed": "Публикуването изисква проверка",
  "notifications.manual_overdue": "Ръчната задача е просрочена",
  "notifications.cadence_gap": "Следващата седмица изисква внимание",
  "notifications.coverage":
    "{missing} от {total} планирани позиции не са готови и добавени в опашката.",
  "notifications.failure":
    "Проверете дестинацията, преди да опитате отново: прекъсната публикация може вече да е достъпна на сайта.",
  "notifications.approval": "Прегледайте текущата версия преди планирания краен срок.",
  "notifications.manual":
    "Завършете тази задача или изберете нова дата. Този срок е за ръчна задача.",
  "notifications.readError": "Известието не бе отбелязано като прочетено. Опитайте отново.",
  "team.title": "Екипът на Milo",
  "team.help":
    "Едно работно пространство със специализирани изгледи на реалната работа и знанията за проекта.",
  "team.selectProject": "Изберете проект, за да видите екипа му.",
  "team.scope":
    "Състоянието на задачите обхваща избраната седмица. Запазените съвети и отчети са датирани доказателства, а не потвърждение за активна задача или подобрени резултати.",
  "team.aiRole": "Специалист с изкуствен интелект",
  "team.records":
    "{count} запазени записа със знания · проверете състоянието на прегледа в знанията за проекта",
  "team.lastDelivery": "Последна доставка в задачите за тази седмица",
  "team.auditFetched": "Запазен одит на сайта",
  "team.auditPartial": "Запазен одит само с контекста на проекта",
  "team.adviceSaved": "Запазени съвети за готовност за изкуствен интелект",
  "team.imports": "{count} запазени импортирания на измервания от GSC",
  "team.measurementMissing": "Няма запазени измервания от GSC",
  "team.authorityPrerequisite":
    "Данните от доставчика и разрешението за свързване с партньори трябва да се проверят в работното пространство за обратни връзки.",
  "team.lesson.title": "Запомни редакционно правило",
  "team.lesson.help":
    "Запишете повтарящо се предпочитание за този проект. Запазването го превръща в изрична инструкция за съответната бъдеща работа по проекта. Обикновените редакции на статии не създават правила. Това не установява фактически доказателства.",
  "team.lesson.rule": "Инструкция за този проект",
  "team.lesson.target": "Прилагане към",
  "team.lesson.text": "Текст",
  "team.lesson.visual": "Визуални материали",
  "team.lesson.both": "Текст и визуални материали",
  "team.lesson.save": "Запази инструкция за проекта",
  "team.lesson.manage": "Прегледай, редактирай или забрави знания",
  "team.lesson.saved":
    "Запазено за този проект. Можете да го редактирате, върнете или отмените в знанията за проекта.",
  "team.lesson.unknown":
    "Запазването не бе потвърдено. Проверете знанията за проекта, преди да въведете инструкцията отново.",
  "team.role.lead": "Milo — ръководител на растежа",
  "team.description.lead": "Координира запазения график, покритието и решенията.",
  "team.open.lead": "Прегледай седмичната подготовка",
  "team.role.brand": "Стратег на марката",
  "team.description.brand":
    "Факти за проекта, предпочитания и отменими правила с история на източниците и прегледите.",
  "team.open.brand": "Прегледай знанията за проекта",
  "team.role.research": "Изследовател на търсенето",
  "team.description.research":
    "Седмични изследователски задания и запазени възможности. Прегледайте източниците и хипотезите, преди да пишете.",
  "team.open.research": "Прегледай възможностите",
  "team.role.content": "Редактор на съдържание",
  "team.description.content":
    "Съхранените статии все още изискват редакционен преглед и одобрение за публикуване на конкретната версия.",
  "team.open.content": "Прегледай статиите",
  "team.role.image": "Създател на визуални материали",
  "team.description.image":
    "Предложените визуални материали използват контекста на проекта. Съхраняването не означава визуално одобрение.",
  "team.open.image": "Прегледай визуалните материали на статиите",
  "team.role.seo": "SEO специалист",
  "team.description.seo":
    "Датирани констатации от одит на страниците, вътрешните връзки и местното присъствие/същностите. Частичните одити запазват ограниченията си.",
  "team.open.seo": "Прегледай SEO констатациите",
  "team.role.authority": "Обратни връзки и авторитет",
  "team.description.authority":
    "Проучването, наблюдението и предложенията зависят от потвърден достъп до доставчика. Изпращането на съобщения и закупуването на разполагания изискват отделно разрешение.",
  "team.open.authority": "Провери работното пространство за обратни връзки",
  "team.role.ai": "Анализатор на видимостта в изкуствения интелект",
  "team.description.ai":
    "Съветите за готовност са отделни от наблюдаваните отговори, споменавания и цитирания. Тук не е установено проследяване на наблюдения.",
  "team.open.ai": "Прегледай съветите за готовност",
  "team.role.performance": "Анализатор на резултатите",
  "team.description.performance":
    "Запазени отчети и датирани измервания. Липсващите данни са неизвестност; промяна преди/след сама по себе си не доказва причинно-следствена връзка.",
  "team.open.performance": "Прегледай измерванията",
  "team.state.unavailable": "Състоянието е недостъпно",
  "team.state.none": "Няма записана работа",
  "team.state.unknown": "Несигурен резултат — прегледайте възстановяването",
  "team.state.running": "Работата се изпълнява",
  "team.state.review": "Промените на собственика изискват преглед",
  "team.state.retained": "Резултатите са съхранени за преглед",
  "team.state.cancelled": "Подготовката е отменена",
  "collaboration.reviewImageLimits":
    "Тези изображения надвишават ограниченията за преглед или не могат да се покажат безопасно. Намалете броя или размера им и използвайте неподвижни PNG, JPEG или WebP изображения.",
  "collaboration.emailInvitation": "Изпрати поканата по имейл",
  "collaboration.invitationEmailHelp":
    "Изпратете покана на показания по-горе имейл адрес за посочената роля. Отварянето на връзката в имейла не предоставя достъп.",
  "collaboration.invitationEmailQueued":
    "Поискано е изпращане на поканата по имейл. Проверете състоянието на доставката тук.",
  "collaboration.notificationHistory": "История на доставката на известия",
  "collaboration.notificationSettings": "Известия за проекта",
  "collaboration.notificationConsentHelp":
    "Необходими са както назначение от собственика, така и вашето съгласие. Промените в ролята ви в проекта изискват повторно настройване.",
  "collaboration.notificationAssigned": "Назначено от собственика",
  "collaboration.notificationNotAssigned": "Не е назначено от собственика",
  "collaboration.notificationOptedIn": "Получателят е дал съгласие",
  "collaboration.notificationOptedOut": "Получателят не е дал съгласие",
  "collaboration.notificationAssign": "Назначи известия",
  "collaboration.notificationUnassign": "Премахни назначението",
  "collaboration.notificationOptIn": "Разреши известията за проекта",
  "collaboration.notificationOptOut": "Изключи известията за проекта",
  "collaboration.decisionRecorded": "Решението от прегледа е записано.",
  "collaboration.decisionUnknown":
    "Решението не бе потвърдено. Обновете миналите решения, преди да опитате отново.",
  "collaboration.reviewNotAllowed":
    "Текущата ви роля или политиката на проекта не допуска решения от преглед.",
  "collaboration.acknowledgeReview":
    "Прегледах тази визуализирана чернова и всичките ѝ изображения.",
  "collaboration.approveVersion": "Одобри тази версия",
  "collaboration.returnForChanges": "Върни за промени",
  "collaboration.reviewDoesNotPublish":
    "Записването на преглед не публикува черновата и не възобновява задържан график.",
  "collaboration.reviewHistory": "Минали решения от прегледи",
  "collaboration.approvalRecorded": "Одобрението е записано",
  "collaboration.changesRequested": "Поискани са промени",
  "collaboration.owner": "Собственик",
  "collaboration.collaborator": "Сътрудник",
  "collaboration.renderedReview": "Преглед на визуализираното съдържание",
  "collaboration.loadingReview": "Зареждане на пълния преглед и изображенията му…",
  "collaboration.incompleteReview":
    "Пълният преглед не бе зареден. Обновете, за да проверите черновата и всичките ѝ изображения.",
  "collaboration.policyTitle": "Политика за одобрение",
  "collaboration.policyHelp":
    "Изберете кой може да одобрява работата по проекта. Промяната на тази политика оттегля съществуващите одобрения на сътрудници; независимите одобрения на собственика остават.",
  "collaboration.policyUnselected": "Не е избрано — одобрението от сътрудници е неактивно",
  "collaboration.policy.disabled": "Само одобрения от собственика",
  "collaboration.policy.separate_reviewers":
    "Отделни проверяващи одобряват; редакторите редактират",
  "collaboration.policy.editors_can_approve": "Редакторите и проверяващите могат да одобряват",
  "collaboration.savePolicy": "Запази политиката за одобрение",
  "collaboration.editDraft": "Редактирай черновата",
  "collaboration.editHelp":
    "Запазването връща тази чернова за преглед и оттегля предишното ѝ одобрение за публикуване.",
  "collaboration.editConflict":
    "Запазената чернова или ролята ви е променена. Копирайте редакциите, които искате да запазите, преди да заредите последната запазена версия.",
  "collaboration.loadLatest": "Зареди последната запазена версия",
  "collaboration.draftSaved": "Черновата е запазена за преглед.",
  "collaboration.editError":
    "Черновата не бе запазена. Редакциите ви все още са тук; проверете текущата версия и достъпа си, преди да опитате отново.",
  "collaboration.saveDraft": "Запази за преглед",
  "collaboration.question": "Въпрос",
  "collaboration.answer": "Отговор",
  "collaboration.removeQuestion": "Премахни въпроса",
  "collaboration.addQuestion": "Добави въпрос",
  "collaboration.field.title": "Заглавие",
  "collaboration.field.h1": "Основно заглавие",
  "collaboration.field.metaTitle": "Заглавие за търсене",
  "collaboration.field.metaDescription": "Описание за търсене",
  "collaboration.field.markdown": "Статия (Markdown)",
  "collaboration.field.cta": "Призив за действие",
  "collaboration.field.outline": "Структура — по едно заглавие на ред",
  "collaboration.field.faq": "Въпроси и отговори",
  "collaboration.comments": "Коментари",
  "collaboration.commentLabel": "Вашият коментар",
  "collaboration.addComment": "Добави коментар",
  "collaboration.you": "Вие",
  "collaboration.commentRoleAtPosting": "Роля при публикуването",
  "collaboration.earlierVersion": "Коментар за по-ранна запазена версия.",
  "collaboration.title": "Сътрудници по проекта",
  "collaboration.subtitle": "Управлявайте достъпа до проекта и отваряйте споделената с вас работа.",
  "collaboration.owned": "Управлявай проекта си",
  "collaboration.shared": "Споделено с вас",
  "collaboration.invitations": "Вашите покани",
  "collaboration.members": "Хора с достъп",
  "collaboration.pending": "Покани за проекта",
  "collaboration.email": "Имейл адрес",
  "collaboration.role": "Роля",
  "collaboration.viewer": "Наблюдател",
  "collaboration.editor": "Редактор",
  "collaboration.reviewer": "Проверяващ",
  "collaboration.invite": "Създай покана",
  "collaboration.inviteHelp":
    "Поканата се появява тук, когато получателят влезе с този потвърден имейл адрес. Изтича след седем дни. Това действие не изпраща имейл.",
  "collaboration.accept": "Приеми поканата",
  "collaboration.revoke": "Отмени поканата",
  "collaboration.remove": "Премахни достъпа",
  "collaboration.saveRole": "Запази ролята",
  "collaboration.refresh": "Обнови",
  "collaboration.open": "Отвори проекта",
  "collaboration.loading": "Зареждане на достъпа до проекта…",
  "collaboration.error": "Достъпът не бе потвърден. Обновете, преди да опитате отново.",
  "collaboration.saved": "Достъпът до проекта е обновен.",
  "collaboration.empty": "Все още няма какво да се покаже.",
  "collaboration.noOwned":
    "Можете да отваряте споделени проекти по-долу, без да създавате собствен проект.",
  "collaboration.drafts": "Чернови на проекта",
  "collaboration.back": "Назад към черновите",
  "collaboration.previous": "Предишна",
  "collaboration.next": "Следваща",
  "collaboration.removed": "Премахнато",
  "collaboration.expires": "Изтича",
  "collaboration.history": "Скорошна активност по достъпа",
  "collaboration.pendingState": "Изчакваща",
  "collaboration.expired": "Изтекла",
  "collaboration.accepted": "Приета",
  "collaboration.revoked": "Отменена",
  "emailSettings.language": "Език на имейлите",
  "emailSettings.note":
    "Изберете езика за оперативните обобщения, месечните отчети и поканите за проекти, които заявявате. Това не променя настройките на приложението, статиите или пазарите. Запазването на езика не включва и не изпраща имейли.",
  "emailSettings.save": "Запази езика на имейлите",
  "emailSettings.saved": "Настройките за имейл са запазени.",
  "emailSettings.uncertain":
    "Запазените настройки не бяха потвърдени. Заредете ги отново преди друга промяна; последната ви промяна може вече да е запазена.",
  "emailSettings.reload": "Зареди отново запазените настройки (отхвърли редакциите)",
  "collaboration.seats":
    "Вашият план {plan} включва {workingSeats} работни места (редактори и рецензенти, включително вие) и {viewerSeats} места за преглед. Използвани: {usedWorkingSeats} работни, {usedViewerSeats} за преглед. Чакащите покани запазват места, докато изтекат.",
  "collaboration.seatLimit":
    "Няма свободно място за тази роля. Вашият план включва {workingSeats} работни места и {viewerSeats} места за преглед. Премахнете или отменете някого, или надградете плана.",
};
