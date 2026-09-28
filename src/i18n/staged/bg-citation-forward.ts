/** Bulgarian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const bgCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Зареждане…",
  "citationForward.title": "От констатация до проверена промяна",
  "citationForward.intro":
    "Прехвърлете приета версия на констатация в задача в Плана, напишете промяната в Studio, публикувайте я през съществуващото одобрение и след това запишете какво реално сте проверили на местоназначението.",
  "citationForward.authority":
    "Приемането на констатация не дава нищо: публикуването все още изисква одобрението в Studio и обичайните ви права Manual/Review/Autopilot. Задача, чернова, одобрение или потвърждение от конектор никога не са доказателство, че страницата показва промяната.",
  "citationForward.findings.title": "Констатации и задачи в Плана",
  "citationForward.findings.empty":
    "Все още няма констатация за обвързване (приета или чакаща втора проверка, текуща версия).",
  "citationForward.findings.pick": "Версия на констатацията",
  "citationForward.findings.pickPlaceholder": "Изберете версия на констатацията",
  "citationForward.findings.pinned": "Закачено към в{pinned} · текуща в{head}",
  "citationForward.findings.state.current": "текуща версия",
  "citationForward.findings.state.superseded":
    "заменена от по-нова версия (закачането остава на прегледания ред)",
  "citationForward.findings.state.deleted": "закаченият ред е изтрит",
  "citationForward.findings.state.dismissed": "отхвърлена от вас (не може да се обвърже)",
  "citationForward.findings.state.dissent": "записано независимо несъгласие",
  "citationForward.findings.state.second_review": "чака втора проверка",
  "citationForward.task.create": "Създаване на задача в Плана от тази версия",
  "citationForward.task.attach": "Прикачване към съществуваща задача",
  "citationForward.task.attachPlaceholder": "Изберете задача",
  "citationForward.task.created": "Задачата в Плана е създадена.",
  "citationForward.task.attached": "Прикачено към задачата.",
  "citationForward.task.listTitle": "Задачи, свързани с тази версия на констатацията",
  "citationForward.task.listEmpty": "Никоя задача не е свързана с тази версия на констатацията.",
  "citationForward.task.state.active": "активна",
  "citationForward.task.state.archived": "архивирана",
  "citationForward.task.state.deleted": "изтрита",
  "citationForward.task.state.missing": "липсва (задачата вече не е в това работно пространство)",
  "citationForward.task.localNote":
    "Идентичността на задачите и връзките живеят в хранилището на работното ви пространство; те не дават достъп за проверяващи и не са доказателство от сървъра.",
  "citationForward.studio.manualDraft": "Създаване на ръчна чернова в Studio (без ИИ)",
  "citationForward.studio.manualNote":
    "Ръчната чернова не струва нищо и започва празна; пътят на генериране с ИИ остава в Плана и използва месечния ви бюджет за ИИ.",
  "citationForward.studio.open": "Отваряне на черновата в Studio",
  "citationForward.studio.plan": "Отваряне в Плана (генериране с ИИ)",
  "citationForward.improvement.title": "Запис на подобрение",
  "citationForward.improvement.intro":
    "Обвържете точния публикуван опит за тази задача, версията на одобрението, която е носел, и референтните заснемания, направени преди него. Всяко поле на обвързването се извежда от избрания опит.",
  "citationForward.improvement.start": "Записване на подобрение за тази задача",
  "citationForward.improvement.publication": "Публикуван опит",
  "citationForward.improvement.publicationNone":
    "За тази задача все още няма записан публикуван опит с активен URL. Първо публикувайте през Studio; започнат или отхвърлен опит не може да се обвърже.",
  "citationForward.improvement.publicationOption": "{finished} · версия {version} · {url}",
  "citationForward.improvement.approvedBy": "Одобрено от",
  "citationForward.improvement.approvedByOwner": "мен (собственик)",
  "citationForward.improvement.description": "Какво се промени (описание)",
  "citationForward.improvement.baselines": "Референтни заснемания (преди публикуването)",
  "citationForward.improvement.baselinesNone":
    "Никое заснемане в обхвата не предхожда това публикуване; проверено преди/след няма да е възможно за този опит.",
  "citationForward.improvement.baselinesHint":
    "Предлагат се само заснемания, направени преди публикуването. Сървърът проверява това отново.",
  "citationForward.improvement.review": "Преглед на точния запис",
  "citationForward.improvement.save": "Запазване на подобрението",
  "citationForward.improvement.retry": "Повторен опит със същия запис",
  "citationForward.improvement.back": "Обратно към редактиране",
  "citationForward.improvement.cancel": "Отказ",
  "citationForward.improvement.saved": "Запазено като в{version}.",
  "citationForward.improvement.listTitle": "Подобрения",
  "citationForward.improvement.listEmpty": "За този проект все още няма записано подобрение.",
  "citationForward.improvement.status.unverified": "непроверено",
  "citationForward.improvement.status.approval_bound": "обвързано с одобрение",
  "citationForward.improvement.status.connector_receipt":
    "потвърждение от конектор (само потвърждение за получаване)",
  "citationForward.improvement.status.owner_attested":
    "удостоверено от собственика (вашето наблюдение, не независимо доказателство)",
  "citationForward.improvement.evidence.baseline_absent": "няма записана референция",
  "citationForward.improvement.evidence.baseline_missing":
    "референцията липсва (заснемане е изтрито или е напуснало обхвата)",
  "citationForward.improvement.evidence.baseline_recorded": "референцията е записана",
  "citationForward.improvement.statusNote":
    "Статусите са живи стойности от сървъра. Потвърждението от конектор доказва, че конекторът е отговорил, а не че страницата показва промяната; удостоверението от собственика е вашето собствено наблюдение.",
  "citationForward.improvement.detailRows": "Закачени редове с констатации",
  "citationForward.improvement.detailTask": "Задача",
  "citationForward.improvement.detailDestination": "Местоназначение",
  "citationForward.improvement.detailNoBinding": "Няма обвързано публикуване (чернови запис).",
  "citationForward.improvement.remove": "Премахване на тази версия",
  "citationForward.improvement.removed": "Премахнато.",
  "citationForward.improvement.version": "в{version}",
  "citationForward.issue.findings_required": "Изберете поне една версия на констатация.",
  "citationForward.issue.finding_unavailable":
    "Избран ред с констатация беше изтрит; изберете текущата версия.",
  "citationForward.issue.finding_not_bindable":
    "Отхвърлена или заменена констатация не може да се обвърже; изберете текущата ѝ приета версия.",
  "citationForward.issue.scope_mixed":
    "Всички избрани констатации трябва да принадлежат към една и съща заключена версия на панела и един и същ клиент.",
  "citationForward.issue.task_invalid": "Идентичността на задачата не е валидна.",
  "citationForward.issue.publication_required": "Изберете публикувания опит за обвързване.",
  "citationForward.issue.publication_task_mismatch": "Избраният опит е записан за друга задача.",
  "citationForward.issue.description_required": "Опишете промяната.",
  "citationForward.issue.baseline_after_publication":
    "Избрана референция е заснета след публикуването.",
  "citationForward.issue.invalid": "Записът не е валиден.",
  "citationForward.inspection.title": "Проверка на местоназначението от собственика",
  "citationForward.inspection.intro":
    "Отворете точния публикуван URL, сравнете го с одобрената снимка и след това запишете какво сте видели. Отварянето на връзката или успешен отговор сами по себе си не удостоверяват нищо.",
  "citationForward.inspection.open": "Отваряне на публикувания URL",
  "citationForward.inspection.snapshot": "Одобрена снимка",
  "citationForward.inspection.result": "Какво видяхте?",
  "citationForward.inspection.shows_approved_content": "Показва одобреното съдържание",
  "citationForward.inspection.does_not_show": "Не го показва",
  "citationForward.inspection.inconclusive": "Неубедително",
  "citationForward.inspection.record": "Записване на проверката",
  "citationForward.inspection.baselineRequired":
    "Положителната проверка се нуждае от референтните заснемания, които подобрява; първо редактирайте записа.",
  "citationForward.inspection.bindingRequired":
    "Този запис няма обвързване с публикуване, което да се провери.",
  "citationForward.inspection.negativeNote":
    "Отрицателна или неубедителна проверка се съхранява, а подобрението остава непроверено за доставка.",
  "citationForward.error.conflict":
    "Някой запази по-нова версия, докато редактирахте. Черновата ви е запазена; нищо не е записано.",
  "citationForward.error.conflictContinue": "Продължаване с текущата версия",
  "citationForward.error.findingUnresolved":
    "Избрана констатация вече не се открива в този обхват.",
  "citationForward.error.baselineUnresolved":
    "Референтно заснемане вече не се открива в този проект.",
  "citationForward.error.bindingUnresolved":
    "Обвързването с публикуване не съответства на записания опит.",
  "citationForward.error.bindingUnapproved": "Обвързаната версия в момента не е одобрена.",
  "citationForward.error.approvalMismatch":
    "Декларираната версия на одобрение или одобряващият не съответства на действителното одобрение.",
  "citationForward.error.taskMismatch": "Публикуването е записано за друга задача.",
  "citationForward.error.destinationMismatch":
    "Местоназначението не съответства на публикувания URL.",
  "citationForward.error.inspectionInvalid":
    "Проверката не е валидна за това публикуване (URL, време или състояние).",
  "citationForward.error.verificationUnbacked":
    "Верификацията изисква положителна проверка от собственика на публикувания URL.",
  "citationForward.error.scopeDrift": "Това подобрение е записано в друг обхват.",
  "citationForward.error.capacity": "Достигнат е капацитетът за подобрения на този проект.",
  "citationForward.error.invalid": "Записът беше отказан като невалиден.",
  "citationForward.error.unavailable":
    "Запазването не можа да бъде завършено. Опреснете и опитайте отново.",
  "citationForward.error.loadEvidence": "Историята на публикуванията не можа да бъде заредена.",
  "citationForward.error.loadImprovements": "Подобренията не можаха да бъдат заредени.",
  "citationForward.readiness.title": "Готовност за повторен тест",
  "citationForward.readiness.verified":
    "Удостоверени от собственика различни промени: {count} от {required} необходими",
  "citationForward.readiness.receipts":
    "Само потвърждения от конектор (не доказателство за доставка): {count}",
  "citationForward.readiness.approvalBound": "Само обвързани с одобрение: {count}",
  "citationForward.readiness.unverified": "Непроверени: {count}",
  "citationForward.readiness.baselineMissing": "Липсваща референция: {count}",
  "citationForward.readiness.note":
    "Броевете идват от живите статуси на сървъра; тук не се изчислява кръг за сравнение и удостоверението от собственика никога не е независимо доказателство.",
  "citationForward.task.pinnedTitle": "Задачи в Плана, закачени към версии на констатации",
  "citationForward.task.pinnedEmpty":
    "В този проект никоя задача в Плана не е закачена към версия на констатация.",
  "citationForward.task.readFailed":
    "Констатацията не можа да бъде прочетена; не е създадена задача.",
  "citationForward.task.notEligible":
    "Върнатата от сървъра версия на констатацията не е избраната или вече не е допустима; не е създадена задача.",
  "citationForward.task.stale":
    "Проектът или акаунтът се промениха, докато констатацията се четеше; не е създадена задача.",
  "citationForward.improvement.rowsPick": "Версии на констатации за обвързване",
  "citationForward.improvement.useCurrent":
    "Обвързване на текущата версия в{head} вместо закачения ред",
  "citationForward.improvement.publicationPartial":
    "Само {loaded} от {total} записани опита можаха да бъдат заредени; по-старите опити не се предлагат тук.",
  "citationForward.improvement.historyRow": "по-ранна версия (история)",
  "citationForward.inspection.notHead":
    "Съществува по-нова версия на това подобрение. Отворете текущата версия и проверете нея.",
  "citationForward.inspection.retry": "Повторение на същата проверка",
  "citationForward.error.findingStale":
    "Обвързана констатация се промени, откакто прегледахте този запис. Нищо не е записано; отворете текущата версия на констатацията и прегледайте отново.",
  "citationForward.readiness.unavailable":
    "Готовността не може да се покаже: живите статуси не можаха да бъдат опреснени.",
  "citationForward.improvement.approvalDelegate": "Одобрено от делегиран проверяващ: {email}",
  "citationForward.improvement.approvalNone":
    "Тази версия в момента не е одобрена; опитът не може да се обвърже.",
  "citationForward.issue.approval_unknown":
    "Състоянието на одобрение на избрания опит не можа да бъде заредено.",
  "citationForward.issue.approval_unavailable":
    "Версията на избрания опит в момента не е одобрена.",
  "citationForward.task.duplicate":
    "Задача в Плана вече е закачена към тази версия на констатацията (показана по-долу); втора задача не е създадена. Използвайте я или изрично прикачете версията към друга задача.",
};
