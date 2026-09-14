/** Bulgarian authoring only; not registered in the runtime or language picker. */
export const bgLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Link Growth Network",
  "linknet.subtitle":
    "Намерете подходящи сайтове в мрежата на Milo, изпратете лично представяне и позволете на Milo да провери дали връзката действително е публикувана.",
  "linknet.policyNote":
    "Уместността е на първо място: съвпаденията изискват общи теми, директните размени на връзки се отбелязват и нищо не се разполага автоматично. Тези проверки не гарантират съответствие с политиките на търсачките.",
  "linknet.topics": "Теми",
  "linknet.topicsPlaceholder": "Теми (разделени със запетаи)",
  "linknet.contact": "Имейл за контакт",
  "linknet.contactPlaceholder": "Имейл за контакт с партньори",
  "linknet.join": "Присъедини се към мрежата",
  "linknet.update": "Обнови записа",
  "linknet.pause": "Пауза",
  "linknet.joined": "Добавено в списъка — партньорите вече могат да намират този сайт.",
  "linknet.paused": "Записът е на пауза.",
  "linknet.find": "Намери партньори",
  "linknet.noMatches":
    "Все още няма подходящи партньори — мрежата расте с всеки присъединен сайт на Milo.",
  "linknet.score": "Съвпадение",
  "linknet.copyIntro": "Копирай имейла за представяне",
  "linknet.introCopied": "Представянето е копирано — поставете го в имейла си.",
  "linknet.markContacted": "Отбележи осъществен контакт",
  "linknet.markAgreed": "Отбележи договорено",
  "linknet.decline": "Откажи",
  "linknet.targetUrlPlaceholder": "URL на договорената страница (където ще бъде връзката)",
  "linknet.verify": "Провери връзката",
  "linknet.verified": "Връзката е намерена — разполагането е публикувано и проверено.",
  "linknet.notFound": "Все още няма намерена връзка на тази страница — проверено и записано.",
  "linknet.liveSince": "Публикувано от",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Последна проверка: връзката не е намерена",
  "linknet.reciprocalWarn":
    "Това би създало директна размяна на връзки с този сайт. Прегледайте уместността и избягвайте прекомерни размени.",
  "linknet.status.suggested": "Предложено",
  "linknet.status.contacted": "Осъществен контакт",
  "linknet.status.agreed": "Договорено",
  "linknet.status.live_verified": "Публикувано ✓",
  "linknet.status.declined": "Отказано",
  "backlinks.title": "Обратни връзки",
  "backlinks.subtitle":
    "Реални данни за обратните връзки на домейна ви — сила на профила, пропуски спрямо конкурентите и безопасни препоръки за изграждане на връзки.",
  "backlinks.disclaimer":
    "Показателите за обратни връзки идват от външен индекс и са приблизителни — никой индекс не вижда всяка връзка. Препоръките са само предложения за добросъвестни практики: Milo никога не предлага схеми за връзки или необявени платени връзки и не гарантира класиране, трафик или приходи.",
  "backlinks.run": "Стартирай анализ на обратните връзки",
  "backlinks.rerun": "Обнови анализа",
  "backlinks.running": "Анализиране…",
  "backlinks.empty":
    "Стартирайте анализ на обратните връзки, за да видите реалния профил на връзките на домейна си, сравнението с конкурентите и кои домейни сочат към тях, но не към вас.",
  "backlinks.notConfigured.title": "Свържи източник на данни за обратни връзки",
  "backlinks.notConfigured.body":
    "Този модул използва индекса за обратни връзки на DataForSEO и все още не е свързан. Собственикът на работното пространство трябва да създаде акаунт в DataForSEO (плащане според използването) и да добави DATAFORSEO_LOGIN и DATAFORSEO_PASSWORD като тайни на сървъра. Дотогава данните за обратни връзки са недостъпни.",
  "backlinks.status.ready.title": "DataForSEO работи",
  "backlinks.status.ready.body": "Backlinks API е свързан и отговаря.",
  "backlinks.status.lowBalance.title": "Балансът в DataForSEO намалява",
  "backlinks.status.lowBalance.body": "Заредете скоро, за да избегнете прекъснати анализи.",
  "backlinks.status.paused.title": "Достъпът до DataForSEO е на пауза",
  "backlinks.status.paused.body":
    "Свържете се с поддръжката на DataForSEO, за да активирате отново акаунта, преди да стартирате друг анализ.",
  "backlinks.status.error.title": "Състоянието на DataForSEO е недостъпно",
  "backlinks.status.error.body":
    "Акаунтът или Backlinks API не бе проверен. Обновете състоянието или проверете таблото на доставчика.",
  "backlinks.status.balance": "Баланс: {balance}.",
  "backlinks.status.refresh": "Обнови състоянието",
  "backlinks.competitorsUsed": "Сравнени конкуренти: {list}",
  "backlinks.competitorsFromAnalysis":
    "Използват се конкуренти от последния анализ на конкурентите: {list}",
  "backlinks.noCompetitors":
    "В този проект няма URL адреси на конкуренти — анализът ще обхване само собствения ви профил. Добавете конкуренти в Настройване на проекта или в модула Конкуренти, за да получите пропуските във връзките.",
  "backlinks.lastRun": "Последен анализ: {date}",
  "backlinks.score.overall": "Позиция по връзки",
  "backlinks.score.profile": "Сила на профила",
  "backlinks.score.gap": "Пропуск спрямо конкурентите",
  "backlinks.score.quality": "Качество на връзките",
  "backlinks.gapHint": "по-високо = повече възможности за подобрение",
  "backlinks.summaryHeading": "Обобщение",
  "backlinks.topActions": "Основни действия за връзки",
  "backlinks.profileTable": "Вашият домейн спрямо конкурентите",
  "backlinks.table.domain": "Домейн",
  "backlinks.table.rank": "Ранг на домейна",
  "backlinks.table.backlinks": "Обратни връзки",
  "backlinks.table.referringDomains": "Препращащи домейни",
  "backlinks.table.broken": "Неработещи",
  "backlinks.table.spam": "Спам оценка",
  "backlinks.table.notFetched": "Данните не бяха извлечени",
  "backlinks.you": "Вие",
  "backlinks.gapHeading": "Пропуск във връзките — сочат към конкуренти, но не към вас",
  "backlinks.gapNote":
    "Заявена е извадка от индекса на доставчика с изключен ваш домейн. Това не потвърждава независимо, че тези сайтове нямат връзки към вас.",
  "backlinks.gap.linksTo": "Сочи към",
  "backlinks.gapEmpty":
    "Не е намерен пропуск във връзките — или не са извлечени конкуренти, или няма припокриване.",
  "backlinks.referringHeading": "Водещи препращащи домейни с връзки към вас",
  "backlinks.referringEmpty":
    "Все още няма намерени препращащи домейни в индекса — нов домейн често започва от нула.",
  "backlinks.recommendations": "Препоръки",
  "backlinks.effort": "Усилие",
  "backlinks.target": "Цел / платформа",
  "backlinks.approach": "Подход",
  "backlinks.action.convert": "Създай възможност",
  "backlinks.action.converted": "Възможността е създадена",
  "backlinks.action.convertTop": "Преобразувай водещите препоръки",
  "backlinks.toast.done": "Анализът на обратните връзки е завършен",
  "backlinks.toast.converted": "Възможността е създадена",
  "backlinks.toast.convertedTop": "Създадени са {count} възможности",
  "backlinks.category.linkGapTargets": "Цели за пропуски във връзките",
  "backlinks.category.contentForLinks": "Съдържание за привличане на връзки",
  "backlinks.category.digitalPr": "Дигитален PR",
  "backlinks.category.partnerships": "Партньорства и спонсорства",
  "backlinks.category.directories": "Указатели и профили",
  "backlinks.category.linkHygiene": "Поддръжка на връзките",
  "marketplace.title": "Спонсорирани публикации",
  "marketplace.subtitle":
    "Съпоставяйте възможности за обратни връзки с прозрачни, редакционно прегледани спонсорирани разполагания.",
  "marketplace.disclosureTitle": "Пазар с добросъвестни практики.",
  "marketplace.disclosure":
    'Всяка заявка изисква ясно обозначаване на спонсорството и rel="sponsored". Заявката не е покупка и никога не гарантира класиране, трафик или приходи.',
  "marketplace.demoNoticeTitle": "Каталог за предварителен преглед.",
  "marketplace.demoNotice":
    "Домейните, показателите и цените по-долу са демонстрационни данни, докато се очаква достъп до Linkhouse API. Заявките се запазват само в Milo за преглед; не се създава поръчка към доставчик или плащане.",
  "marketplace.demoBadge": "Демо",
  "marketplace.integrationTitle": "Интеграция с Linkhouse",
  "marketplace.integrationLive":
    "Каталогът на доставчика е свързан. Всяка платена поръчка все още изисква потвърждение на точната обща сума.",
  "marketplace.integrationPending":
    "Договорът за производствената интеграция е готов; съпоставянето на крайните точки и данните за достъп очакват документацията на Linkhouse.",
  "marketplace.catalogConnected": "Реален каталог",
  "marketplace.catalogDemo": "Демонстрационен каталог",
  "marketplace.orderingEnabled": "Поръчването е включено",
  "marketplace.orderingLocked": "Поръчването е заключено",
  "marketplace.offers": "Предложения",
  "marketplace.orders": "Заявки",
  "marketplace.search": "Търсене на домейни или теми…",
  "marketplace.noAnalysis":
    "Стартирайте анализа на обратните връзки, за да добавите сигнали за пропуски в съпоставянето. Съпоставянето по теми и пазари вече е активно.",
  "marketplace.reason.linkGap": "Пропуск във връзките спрямо конкуренти",
  "marketplace.rank": "Ранг на домейна",
  "marketplace.traffic": "Прогнозен трафик",
  "marketplace.turnaround": "Срок за изпълнение",
  "marketplace.days": "{count} дни",
  "marketplace.price": "Ориентировъчна цена",
  "marketplace.request": "Поискай преглед",
  "marketplace.reviewPrice": "Прегледай цената",
  "marketplace.quoteLocked": "Изисква се настройване на ценовите оферти",
  "marketplace.requested": "Заявено",
  "marketplace.quoteTitle": "Прегледай цената за публикацията",
  "marketplace.basePrice": "Цена на доставчика",
  "marketplace.serviceFee": "Такса за услугата на Milo ({count}%)",
  "marketplace.totalPrice": "Точна обща сума",
  "marketplace.quoteExpires":
    "Тази оферта изтича в {time}. След този час е необходима нова оферта.",
  "marketplace.confirmSponsored":
    'Изисквам ясно обозначаване на спонсорството и rel="sponsored" или nofollow за връзката.',
  "marketplace.confirmPaymentLive":
    "Изрично разрешавам поръчка към доставчика за точната обща сума от €{total}.",
  "marketplace.confirmPaymentDemo":
    "Потвърждавам заявката за преглед за €{total} и разбирам, че демонстрационният режим не създава поръчка към доставчик или плащане.",
  "marketplace.confirmPurchase": "Потвърди платената поръчка",
  "marketplace.confirmDemoRequest": "Запази заявката за преглед",
  "marketplace.confirmedAt": "Потвърдено",
  "marketplace.ordersEmpty": "Все още няма заявки за публикации.",
  "marketplace.toast.exists": "Това предложение вече има активна заявка.",
  "marketplace.toast.requested": "Заявката за публикация е запазена за преглед.",
  "marketplace.toast.submitted": "Платената поръчка към доставчика е подадена.",
  "marketplace.toast.catalogError":
    "Каталогът на доставчика не бе обновен. Безопасният демонстрационен каталог остава достъпен.",
  "marketplace.toast.quoteError": "Ценовата оферта не бе подготвена. Опитайте отново.",
  "marketplace.toast.quoteExpired": "Офертата е изтекла. Поискайте нова цена, преди да потвърдите.",
  "marketplace.toast.orderError": "Поръчката не е създадена. Не е извършено плащане.",
  "marketplace.toast.orderReview":
    "Резултатът от доставчика не бе потвърден. Milo запази заявката като В преглед; не опитвайте отново, докато резултатът не бъде изяснен.",
  "marketplace.status.Requested": "Заявено",
  "marketplace.status.In Review": "В преглед",
  "marketplace.status.Submitted": "Подадено",
  "marketplace.status.Accepted": "Прието",
  "marketplace.status.Published": "Публикувано",
  "marketplace.status.Failed": "Неуспешно",
  "marketplace.status.Cancelled": "Отменено",
  "backlinks.integrity.partial": "Частични показатели",
  "backlinks.integrity.source":
    "Деклариран източник: индексът на DataForSEO към датата на запазения анализ за показаните домейни, включително поддомейните. Етикетите за източник в запазените данни на работното пространство не са независима проверка. — означава недостъпно, никога нула. Покритието на индекса е непълно; това не са проверки на реалните дестинации.",
  "backlinks.integrity.legacy":
    "Старият анализ е съхранен. Предишната нормализация е могла да превърне липсващи данни в нули, затова числовата му основа е недостъпна. Оригиналните препоръки остават исторически съвети.",
  "backlinks.integrity.scores":
    "Оценките и препоръките са прогнози на изкуствен интелект от наличните доказателства, а не измервания от доставчика, гаранции за класиране или измерени резултати.",
  "backlinks.integrity.sample":
    "Ограничена извадка от водещи домейни. Пропуснатите домейни не доказват липсващи или изгубени връзки; не е установено постоянно наблюдение.",
  "backlinks.integrity.failed":
    "Заявката е неуспешна. Тази таблица е недостъпна; това не означава нула обратни връзки или липса на пропуски във връзките.",
  "backlinks.integrity.not_requested":
    "Извадка за пропуските не е заявена, защото не са предоставени домейни на конкуренти.",
  "backlinks.integrity.unknown": "Състоянието на събиране на таблицата е неизвестно.",
  "backlinks.integrity.empty":
    "Няма редове за показване. Проверете състоянието на събиране по-горе, преди да тълкувате тази таблица.",
  "backlinkMonitor.website_changed":
    "Показаният сайт не съответства на запазения проект. Запазете или заредете отново проекта преди събиране. Не е започнато събиране.",
  "backlinkMonitor.unavailable":
    "Събирането е недостъпно, докато състоянието на доставчика не потвърди активен акаунт с наличен баланс. Запазената история остава достъпна.",
  "backlinkMonitor.yes": "Да",
  "backlinkMonitor.no": "Не",
  "backlinkMonitor.title": "История на обратните връзки",
  "backlinkMonitor.note":
    "Дневни бройки от индекса на DataForSEO за запазения сайт. Липсващите данни се показват като —, никога нула. Тези наблюдения не потвърждават отделни разполагания на връзки. Всяка заявка използва конфигурирания лимит за доставчика. Периодичното събиране се управлява отделно по-горе.",
  "backlinkMonitor.from": "От (UTC)",
  "backlinkMonitor.to": "До (UTC)",
  "backlinkMonitor.subdomains": "Включи поддомейни",
  "backlinkMonitor.run": "Заяви дневни бройки",
  "backlinkMonitor.running": "Събиране…",
  "backlinkMonitor.new": "Започни друга заявка",
  "backlinkMonitor.refresh": "Обнови историята",
  "backlinkMonitor.loading": "Зареждане на запазената история…",
  "backlinkMonitor.empty": "Все още няма запазени заявки.",
  "backlinkMonitor.error": "Историята е недостъпна. Опитайте да обновите.",
  "backlinkMonitor.uncertain":
    "Резултатът не е потвърден. Обновете запазената история, преди да започнете друга заявка; това не означава, че доставчикът не е начислил сума.",
  "backlinkMonitor.stored": "Наблюдението е запазено.",
  "backlinkMonitor.existing":
    "Тази заявка вече съществува. Проверете запазеното ѝ състояние по-долу.",
  "backlinkMonitor.held":
    "Заявката е задържана. Проверете запазената история, преди да започнете друга заявка.",
  "backlinkMonitor.reserved": "Резервирано",
  "backlinkMonitor.dispatched": "Събиране",
  "backlinkMonitor.succeeded": "Запазено",
  "backlinkMonitor.unknown": "Непотвърдено",
  "backlinkMonitor.pending": "Изчакващо",
  "backlinkMonitor.settled": "Уредено",
  "backlinkMonitor.recover": "Възстанови отчитането",
  "backlinkMonitor.recovered": "Отчитането е възстановено от запазения запис на доставчика.",
  "backlinkMonitor.recoveryFailed":
    "Отчитането не бе възстановено. Запазеното наблюдение остава достъпно.",
  "backlinkMonitor.date": "Дата (UTC)",
  "backlinkMonitor.newLinks": "Нови обратни връзки",
  "backlinkMonitor.lostLinks": "Изгубени обратни връзки",
  "backlinkMonitor.newDomains": "Нови препращащи домейни",
  "backlinkMonitor.lostDomains": "Изгубени препращащи домейни",
  "backlinkMonitor.newMainDomains": "Нови препращащи основни домейни",
  "backlinkMonitor.lostMainDomains": "Изгубени препращащи основни домейни",
  "backlinkMonitor.reported": "Посочено",
  "backlinkMonitor.partial": "Частично",
  "backlinkMonitor.missing": "Липсва",
  "backlinkMonitor.accounting": "Отчитане",
  "backlinkMonitor.observed": "Наблюдавано",
  "backlinkMonitor.request": "Заявка",
  "backlinkMonitor.invalid":
    "Изберете валиден период от 1–92 дни, който завършва не по-късно от днес.",
  "backlinkDetails.title": "Доказателства за отделни обратни връзки",
  "backlinkDetails.note":
    "Представителни връзки от индекса на DataForSEO, до 100 на заявка. Датите на първо и последно наблюдение описват индекса; действителните дати на разполагане и премахване са неизвестни. Това не е пълен списък с връзки. Заявките изразходват конфигурирания лимит за доставчика.",
  "backlinkDetails.run": "Събери подробности за връзките",
  "backlinkDetails.selection": "Избор по дата",
  "backlinkDetails.first_seen": "За първи път наблюдавани в периода",
  "backlinkDetails.lost_last_seen": "Посочени като изгубени, последно наблюдавани в периода",
  "backlinkDetails.limit": "Максимален брой резултати",
  "backlinkDetails.counts":
    "Показани са {retained} от {returned} върнати връзки; {total} съвпадения при доставчика.",
  "backlinkDetails.partial":
    "Има още резултати от доставчика или пропуснати доказателства. Всяка страница е отделно наблюдение и текущият индекс може да се променя между страниците.",
  "backlinkDetails.noLinks": "Няма съхранени връзки за тази заявка.",
  "backlinkDetails.source": "Препращаща страница",
  "backlinkDetails.target": "Дестинация",
  "backlinkDetails.anchor": "Текст на връзката",
  "backlinkDetails.first": "Първо наблюдение (UTC)",
  "backlinkDetails.last": "Последно наблюдение (UTC)",
  "backlinkDetails.rank": "Ранг от доставчика",
  "backlinkDetails.spam": "Спам оценка",
  "backlinkDetails.lost": "Посочено като изгубено",
  "backlinkDetails.offset": "Пропусни резултати (0–20 000)",
  "backlinkDetails.page":
    "Страница {page} · {count} реда са наблюдавани в тази последователност. Бройките може да включват повтарящи се връзки и не установяват пълен списък.",
  "backlinkDetails.next": "Събери следващата страница (използва лимита)",
  "backlinkDetails.nextNote":
    "Продължете със същия сайт и филтри. Това прави една нова заявка към доставчика и използва конфигурирания лимит.",
  "backlinkDetails.child":
    "Заявката за следващата страница вече е създадена; обновете историята, за да проверите резултата ѝ",
  "backlinkDetails.pageLimit":
    "Достигнат е лимитът от 10 000 страници за тази последователност. Може да остават още съвпадения.",
  "backlinkRecurring.title": "Постоянно наблюдение на обратните връзки",
  "backlinkRecurring.note":
    "Събирайте бройки на новите и изгубените обратни връзки за този запазен сайт ежедневно или седмично. Всяко изпълнение обхваща пълни UTC дни от индекса на DataForSEO. Пропуснатите изпълнения се прескачат; наблюденията не потвърждават отделни разполагания или пълен опис на уеб пространството.",
  "backlinkRecurring.loading": "Зареждане на запазените настройки за наблюдение…",
  "backlinkRecurring.error":
    "Настройките за наблюдение са недостъпни. Заредете отново, за да опитате пак.",
  "backlinkRecurring.enabled":
    "Наблюдението е включено — всяко събиране все още изисква налични средства за доставчика.",
  "backlinkRecurring.paused": "Наблюдението е на пауза. Не е включено ново автоматично събиране.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} резервирани или изразходвани от {cap} за това наблюдение.",
  "backlinkRecurring.unsettled":
    "По-ранна заявка има неразрешен резултат или разход. По-нататъшното автоматично събиране е задържано. Проверете историята; запазените успешни резултати може да позволяват възстановяване на отчитането. Изпратена заявка не се повтаря автоматично.",
  "backlinkRecurring.capHeld":
    "Оставащият месечен лимит е под една пълна заявка. Събирането изчаква следващия UTC месец или запазена промяна на лимита.",
  "backlinkRecurring.changedWebsite":
    "Сайтът е променен. Запазете настройките за наблюдение за текущия запазен сайт на проекта или заредете проекта отново, ако показаният сайт е остарял. Съществуващите разходи се запазват.",
  "backlinkRecurring.next":
    "Следващ насрочен час (UTC): {date}. Събирането започва при по-късна проверка на планировчика, когато проверките на средствата и акаунта преминат.",
  "backlinkRecurring.pause": "Спри наблюдението на пауза",
  "backlinkRecurring.unavailable":
    "Събирането от доставчика в момента е недостъпно. Можете да спрете наблюдението на пауза и да прегледате запазената история. Включването изисква потвърден активен акаунт при доставчика с наличен баланс.",
  "backlinkRecurring.settings": "Настройки за наблюдение",
  "backlinkRecurring.enable": "Включи автоматичното събиране",
  "backlinkRecurring.cadence": "Честота",
  "backlinkRecurring.daily": "Ежедневно",
  "backlinkRecurring.weekly": "Седмично",
  "backlinkRecurring.days": "Пълни UTC дни на изпълнение",
  "backlinkRecurring.cap": "Месечен лимит за доставчика (USD)",
  "backlinkRecurring.save": "Запази настройките за наблюдение",
  "backlinkRecurring.allowance":
    "Този лимит ограничава само това наблюдение; запазването му не добавя средства в акаунта. Въведете 0–100 USD с до шест знака след десетичната запетая. Включването изисква поне 0.024 USD плюс 0.000036 USD на ден в периода. Прилагат се и ограниченията на акаунта и споделените лимити за доставчика. Паузата спира новите изпращания; вече допуснато събиране може все още да приключи и да начисли резервирания си разход.",
  "backlinkRecurring.invalid":
    "Въведете 1–92 цели дни и валиден лимит в USD. Включеният лимит трябва да покрива поне една пълна заявка.",
  "backlinkRecurring.saved": "Настройките за наблюдение са запазени.",
  "backlinkRecurring.uncertain":
    "Запазването не е потвърдено. Заредете запазените настройки отново преди друга промяна; по-ранната промяна може вече да е запазена.",
  "backlinkRecurring.refresh": "Зареди отново запазените настройки (отхвърли редакциите)",
  "backlinkRecurring.history": "Виж запазените заявки и отчитането по-долу",
  "backlinkRecurring.scheduled": "Насрочено изпълнение",
  "backlinkRecurring.manual": "Ръчна заявка",
  "backlinkRecurring.occurrence": "Насрочено изпълнение (UTC)",
  "backlinkRecurring.undispatched":
    "Тази насрочена заявка не е допусната до доставчика. Лимитът ѝ за наблюдение е освободен.",
};
