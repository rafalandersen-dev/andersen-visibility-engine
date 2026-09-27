/** Portuguese authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const ptCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "A carregar…",
  "citationForward.title": "Da constatação à alteração verificada",
  "citationForward.intro":
    "Leve uma versão de constatação aceite para uma tarefa do Plan, escreva a alteração no Studio, publique-a através da aprovação existente e registe o que realmente inspecionou no destino.",
  "citationForward.authority":
    "Aceitar uma constatação não concede nada: a publicação continua a precisar da aprovação do Studio e das suas permissões normais de Manual/Review/Autopilot. Uma tarefa, um rascunho, uma aprovação ou uma confirmação do conector nunca são prova de que a página mostra a alteração.",
  "citationForward.findings.title": "Constatações e tarefas do Plan",
  "citationForward.findings.empty":
    "Ainda não há constatação vinculável (aceite ou a aguardar segunda revisão, versão atual).",
  "citationForward.findings.pick": "Versão da constatação",
  "citationForward.findings.pickPlaceholder": "Escolha uma versão da constatação",
  "citationForward.findings.pinned": "Fixada a v{pinned} · atual v{head}",
  "citationForward.findings.state.current": "versão atual",
  "citationForward.findings.state.superseded":
    "substituída por uma versão mais recente (a fixação mantém-se na linha revista)",
  "citationForward.findings.state.deleted": "linha fixada eliminada",
  "citationForward.findings.state.dismissed": "rejeitada por si (não vinculável)",
  "citationForward.findings.state.dissent": "discordância independente registada",
  "citationForward.findings.state.second_review": "a aguardar segunda revisão",
  "citationForward.task.create": "Criar tarefa do Plan a partir desta versão",
  "citationForward.task.attach": "Anexar a tarefa existente",
  "citationForward.task.attachPlaceholder": "Escolha uma tarefa",
  "citationForward.task.created": "Tarefa do Plan criada.",
  "citationForward.task.attached": "Anexada à tarefa.",
  "citationForward.task.listTitle": "Tarefas ligadas a esta versão da constatação",
  "citationForward.task.listEmpty": "Nenhuma tarefa está ligada a esta versão da constatação.",
  "citationForward.task.state.active": "ativa",
  "citationForward.task.state.archived": "arquivada",
  "citationForward.task.state.deleted": "eliminada",
  "citationForward.task.state.missing": "em falta (a tarefa já não está neste espaço de trabalho)",
  "citationForward.task.localNote":
    "A identidade e as ligações das tarefas vivem no armazenamento do seu espaço de trabalho; não concedem acesso de revisor nem são prova do servidor.",
  "citationForward.studio.manualDraft": "Criar rascunho manual no Studio (sem IA)",
  "citationForward.studio.manualNote":
    "Um rascunho manual não custa nada e começa vazio; o caminho de geração por IA fica no Plan e usa o seu orçamento mensal de IA.",
  "citationForward.studio.open": "Abrir rascunho no Studio",
  "citationForward.studio.plan": "Abrir no Plan (geração por IA)",
  "citationForward.improvement.title": "Registo de melhoria",
  "citationForward.improvement.intro":
    "Ligue a tentativa publicada exata desta tarefa, a versão de aprovação que ela transportou e as capturas de referência feitas antes. Cada campo da ligação deriva da tentativa escolhida.",
  "citationForward.improvement.start": "Registar melhoria para esta tarefa",
  "citationForward.improvement.publication": "Tentativa publicada",
  "citationForward.improvement.publicationNone":
    "Ainda não há nenhuma tentativa publicada com URL ativo registada para esta tarefa. Publique primeiro através do Studio; uma tentativa iniciada ou rejeitada não pode ser ligada.",
  "citationForward.improvement.publicationOption": "{finished} · versão {version} · {url}",
  "citationForward.improvement.approvedBy": "Aprovado por",
  "citationForward.improvement.approvedByOwner": "mim (proprietário)",
  "citationForward.improvement.description": "O que mudou (descrição)",
  "citationForward.improvement.baselines": "Capturas de referência (antes da publicação)",
  "citationForward.improvement.baselinesNone":
    "Nenhuma captura no âmbito precede esta publicação; um antes/depois verificado não será possível para esta tentativa.",
  "citationForward.improvement.baselinesHint":
    "Só são oferecidas capturas feitas antes da publicação. O servidor volta a verificar isto.",
  "citationForward.improvement.review": "Rever o registo exato",
  "citationForward.improvement.save": "Guardar melhoria",
  "citationForward.improvement.retry": "Repetir o mesmo registo",
  "citationForward.improvement.back": "Voltar à edição",
  "citationForward.improvement.cancel": "Cancelar",
  "citationForward.improvement.saved": "Guardado como v{version}.",
  "citationForward.improvement.listTitle": "Melhorias",
  "citationForward.improvement.listEmpty":
    "Ainda não há nenhuma melhoria registada para este projeto.",
  "citationForward.improvement.status.unverified": "não verificada",
  "citationForward.improvement.status.approval_bound": "ligada à aprovação",
  "citationForward.improvement.status.connector_receipt": "recibo do conector (apenas confirmação)",
  "citationForward.improvement.status.owner_attested":
    "atestada pelo proprietário (a sua observação, não prova independente)",
  "citationForward.improvement.evidence.baseline_absent": "nenhuma referência registada",
  "citationForward.improvement.evidence.baseline_missing":
    "referência em falta (uma captura foi eliminada ou saiu do âmbito)",
  "citationForward.improvement.evidence.baseline_recorded": "referência registada",
  "citationForward.improvement.statusNote":
    "Os estados são valores do servidor em direto. Um recibo do conector prova que o conector respondeu, não que a página mostra a alteração; uma atestação do proprietário é a sua própria observação.",
  "citationForward.improvement.detailRows": "Linhas de constatação fixadas",
  "citationForward.improvement.detailTask": "Tarefa",
  "citationForward.improvement.detailDestination": "Destino",
  "citationForward.improvement.detailNoBinding": "Nenhuma publicação ligada (registo rascunho).",
  "citationForward.improvement.remove": "Remover esta versão",
  "citationForward.improvement.removed": "Removida.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Escolha pelo menos uma versão da constatação.",
  "citationForward.issue.finding_unavailable":
    "Uma linha de constatação selecionada foi eliminada; escolha a versão atual.",
  "citationForward.issue.finding_not_bindable":
    "Uma constatação rejeitada ou substituída não pode ser ligada; escolha a sua versão aceite atual.",
  "citationForward.issue.scope_mixed":
    "Todas as constatações selecionadas têm de pertencer à mesma versão de painel bloqueada e ao mesmo cliente.",
  "citationForward.issue.task_invalid": "A identidade da tarefa não é válida.",
  "citationForward.issue.publication_required": "Escolha a tentativa publicada a ligar.",
  "citationForward.issue.publication_task_mismatch":
    "A tentativa escolhida foi registada para outra tarefa.",
  "citationForward.issue.description_required": "Descreva a alteração.",
  "citationForward.issue.baseline_after_publication":
    "Uma referência escolhida foi capturada depois da publicação.",
  "citationForward.issue.invalid": "O registo não é válido.",
  "citationForward.inspection.title": "Inspeção do destino pelo proprietário",
  "citationForward.inspection.intro":
    "Abra o URL publicado exato, compare-o com a captura aprovada e registe o que viu. Abrir a ligação ou obter uma resposta bem-sucedida não atesta nada por si só.",
  "citationForward.inspection.open": "Abrir URL publicado",
  "citationForward.inspection.snapshot": "Captura aprovada",
  "citationForward.inspection.result": "O que viu?",
  "citationForward.inspection.shows_approved_content": "Mostra o conteúdo aprovado",
  "citationForward.inspection.does_not_show": "Não o mostra",
  "citationForward.inspection.inconclusive": "Inconclusivo",
  "citationForward.inspection.record": "Registar inspeção",
  "citationForward.inspection.baselineRequired":
    "Uma inspeção positiva precisa das capturas de referência que melhora; edite primeiro o registo.",
  "citationForward.inspection.bindingRequired":
    "Este registo não tem ligação de publicação para inspecionar.",
  "citationForward.inspection.negativeNote":
    "Uma inspeção negativa ou inconclusiva é guardada, e a melhoria continua não verificada para entrega.",
  "citationForward.error.conflict":
    "Alguém guardou uma versão mais recente enquanto editava. O seu rascunho foi mantido; nada foi escrito.",
  "citationForward.error.conflictContinue": "Continuar na versão atual",
  "citationForward.error.findingUnresolved":
    "Uma constatação selecionada já não se resolve neste âmbito.",
  "citationForward.error.baselineUnresolved":
    "Uma captura de referência já não se resolve neste projeto.",
  "citationForward.error.bindingUnresolved":
    "A ligação de publicação não corresponde à tentativa registada.",
  "citationForward.error.bindingUnapproved": "A versão ligada não está aprovada atualmente.",
  "citationForward.error.approvalMismatch":
    "A versão de aprovação ou o aprovador declarados não correspondem à aprovação real.",
  "citationForward.error.taskMismatch": "A publicação foi registada para outra tarefa.",
  "citationForward.error.destinationMismatch": "O destino não corresponde ao URL publicado.",
  "citationForward.error.inspectionInvalid":
    "A inspeção não é válida para esta publicação (URL, hora ou estado).",
  "citationForward.error.verificationUnbacked":
    "Uma verificação precisa de uma inspeção positiva do proprietário ao URL publicado.",
  "citationForward.error.scopeDrift": "Esta melhoria foi registada noutro âmbito.",
  "citationForward.error.capacity": "A capacidade de melhorias deste projeto foi atingida.",
  "citationForward.error.invalid": "O registo foi recusado por ser inválido.",
  "citationForward.error.unavailable":
    "Não foi possível concluir a gravação. Atualize e tente novamente.",
  "citationForward.error.loadEvidence": "Não foi possível carregar o histórico de publicações.",
  "citationForward.error.loadImprovements": "Não foi possível carregar as melhorias.",
  "citationForward.readiness.title": "Prontidão para novo teste",
  "citationForward.readiness.verified":
    "Alterações distintas atestadas pelo proprietário: {count} de {required} necessárias",
  "citationForward.readiness.receipts":
    "Apenas recibos do conector (não prova de entrega): {count}",
  "citationForward.readiness.approvalBound": "Apenas ligadas à aprovação: {count}",
  "citationForward.readiness.unverified": "Não verificadas: {count}",
  "citationForward.readiness.baselineMissing": "Referência em falta: {count}",
  "citationForward.readiness.note":
    "As contagens provêm de estados do servidor em direto; aqui não é calculada nenhuma ronda de comparação e uma atestação do proprietário nunca é prova independente.",
  "citationForward.task.pinnedTitle": "Tarefas do Plan fixadas a versões de constatação",
  "citationForward.task.pinnedEmpty":
    "Nenhuma tarefa do Plan está fixada a uma versão de constatação neste projeto.",
  "citationForward.task.readFailed":
    "Não foi possível ler a constatação; nenhuma tarefa foi criada.",
  "citationForward.task.notEligible":
    "A versão da constatação devolvida pelo servidor não é a selecionada ou já não é elegível; nenhuma tarefa foi criada.",
  "citationForward.task.stale":
    "O projeto ou a conta mudou enquanto a constatação era lida; nenhuma tarefa foi criada.",
  "citationForward.improvement.rowsPick": "Versões de constatação a ligar",
  "citationForward.improvement.useCurrent": "Ligar a versão atual v{head} em vez da linha fixada",
  "citationForward.improvement.publicationPartial":
    "Só foi possível carregar {loaded} de {total} tentativas registadas; as tentativas mais antigas não são oferecidas aqui.",
  "citationForward.improvement.historyRow": "versão anterior (histórico)",
  "citationForward.inspection.notHead":
    "Existe uma versão mais recente desta melhoria. Abra a versão atual e inspecione essa.",
  "citationForward.inspection.retry": "Repetir a mesma inspeção",
  "citationForward.error.findingStale":
    "Uma constatação ligada mudou desde que reviu este registo. Nada foi escrito; abra a versão atual da constatação e reveja novamente.",
  "citationForward.readiness.unavailable":
    "Não é possível mostrar a prontidão: os estados em direto não puderam ser atualizados.",
  "citationForward.improvement.approvalDelegate": "Aprovado por um revisor delegado: {email}",
  "citationForward.improvement.approvalNone":
    "Esta versão não está aprovada atualmente; a tentativa não pode ser ligada.",
  "citationForward.issue.approval_unknown":
    "Não foi possível carregar o estado de aprovação da tentativa escolhida.",
  "citationForward.issue.approval_unavailable":
    "A versão da tentativa escolhida não está aprovada atualmente.",
};
