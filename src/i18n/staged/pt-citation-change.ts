/** Portuguese authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const ptCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Alterações em fichas e configuração",
  "citationChange.intro":
    "Registe a alteração pretendida como um artefacto (apenas os campos suportados e não secretos), aprove exatamente essa versão, declare quando foi executada e depois vincule uma melhoria a ela. Uma declaração não é prova do destino.",
  "citationChange.artifact.new": "Novo artefacto de alteração",
  "citationChange.artifact.kind": "Tipo",
  "citationChange.artifact.kind.listing": "Ficha",
  "citationChange.artifact.kind.configuration": "Configuração",
  "citationChange.artifact.reference": "Referência",
  "citationChange.artifact.referenceHint":
    "O identificador da ficha ou da definição (por exemplo, o id do perfil ou o caminho da definição). Sem credenciais.",
  "citationChange.artifact.fields": "Campos",
  "citationChange.artifact.fieldsHint":
    "Só os campos suportados podem ser registados; credenciais, tokens e definições privadas são recusados e não podem ser adicionados aqui.",
  "citationChange.artifact.before": "Antes",
  "citationChange.artifact.after": "Depois",
  "citationChange.artifact.save": "Guardar artefacto",
  "citationChange.artifact.saved":
    "Artefacto guardado (um conteúdo idêntico devolve o artefacto existente).",
  "citationChange.artifact.remove":
    "Eliminar artefacto (o conteúdo é removido; os identificadores mantêm-se para auditoria)",
  "citationChange.artifact.empty": "Ainda não há nenhum artefacto de alteração.",
  "citationChange.artifact.unsupported": "Campo ou valor não suportado; nada foi guardado.",
  "citationChange.approval.title": "Aprovação desta versão exata",
  "citationChange.approval.approve": "Aprovar esta versão",
  "citationChange.approval.revoke": "Revogar aprovação",
  "citationChange.approval.owner": "Aprovado por mim (proprietário)",
  "citationChange.approval.delegate": "Aprovado por um revisor delegado: {email}",
  "citationChange.approval.none": "Atualmente não aprovado.",
  "citationChange.receipt.title": "Declarações de execução",
  "citationChange.receipt.record": "Declarar executado agora",
  "citationChange.receipt.recorded": "Declaração registada.",
  "citationChange.receipt.none": "Ainda não há nenhuma declaração.",
  "citationChange.receipt.note":
    "Uma declaração diz que uma pessoa fez a alteração; nunca prova que o destino a mostra.",
  "citationChange.binding.kind": "Tipo de vínculo",
  "citationChange.binding.public": "Tentativa publicada (URL público)",
  "citationChange.binding.change": "Alteração de ficha / configuração",
  "citationChange.binding.artifact": "Artefacto",
  "citationChange.binding.receipt": "Declaração de execução",
  "citationChange.binding.chooseArtifact": "Escolha um artefacto aprovado",
  "citationChange.binding.chooseReceipt": "Escolha uma declaração",
  "citationChange.issue.artifact_required": "Escolha um artefacto aprovado.",
  "citationChange.issue.artifact_unapproved": "O artefacto escolhido não está atualmente aprovado.",
  "citationChange.issue.receipt_required": "Escolha uma declaração de execução para o artefacto.",
  "citationChange.independent.title": "Inspeção independente",
  "citationChange.independent.none": "sem inspeção independente",
  "citationChange.independent.inconclusive": "inconclusiva (não afirmativa)",
  "citationChange.independent.disputed":
    "contestada (um inspetor atribuído viu a alteração em falta; excluída da prontidão verificada)",
  "citationChange.independent.independently_inspected":
    "inspecionada de forma independente (outra pessoa autenticada viu a alteração aprovada)",
  "citationChange.independent.note":
    "A inspeção independente é uma inspeção humana feita por outra pessoa da equipa; nunca é uma verificação automática nem prova causal, e uma entrega contestada é excluída mesmo quando você a atestou.",
  "citationChange.eligible.yes": "conta como alteração verificada",
  "citationChange.eligible.no": "não conta como verificada",
  "citationChange.assign.title": "Atribuições de inspeção",
  "citationChange.assign.pick": "Escolha um revisor da equipa",
  "citationChange.assign.grant": "Conceder inspeção",
  "citationChange.assign.revoke": "Revogar",
  "citationChange.assign.link": "Copiar a ligação do inspetor",
  "citationChange.assign.linkCopied": "Ligação copiada.",
  "citationChange.assign.none": "Nenhum inspetor atribuído.",
  "citationChange.assign.effective": "em vigor",
  "citationChange.assign.ineffective": "já não em vigor",
  "citationChange.inspect.title": "Inspecionar uma alteração registada",
  "citationChange.inspect.intro":
    "Abra a referência exata, compare-a com o conteúdo aprovado abaixo e depois registe o que viu. Abrir a referência não atesta nada por si só.",
  "citationChange.inspect.reference": "Referência",
  "citationChange.inspect.open": "Abrir referência",
  "citationChange.inspect.approvedVersion": "Versão aprovada",
  "citationChange.inspect.approvedContent": "Conteúdo aprovado",
  "citationChange.inspect.identity": "Identidades do aprovador e do executante",
  "citationChange.inspect.identityUnavailable":
    "O executante ou o aprovador desta alteração é desconhecido (uma publicação mais antiga ou uma aprovação não resolvida); não é possível registar um recibo independente.",
  "citationChange.inspect.result": "O que viu?",
  "citationChange.inspect.shows_approved_content": "Mostra a alteração aprovada",
  "citationChange.inspect.does_not_show": "Não a mostra",
  "citationChange.inspect.inconclusive": "Inconclusivo",
  "citationChange.inspect.record": "Registar inspeção",
  "citationChange.inspect.retry": "Repetir a mesma inspeção",
  "citationChange.inspect.withdraw": "Retirar a minha inspeção atual",
  "citationChange.inspect.recorded": "Inspeção registada como v{version}.",
  "citationChange.inspect.history": "Histórico das minhas inspeções",
  "citationChange.inspect.head": "atual",
  "citationChange.inspect.withdrawn": "retirada",
  "citationChange.inspect.loadError":
    "Não foi possível carregar esta inspeção (não atribuída, revogada ou a linha mudou).",
  "citationChange.readiness.independent": "Inspecionadas de forma independente: {count}",
  "citationChange.readiness.disputed": "Contestadas (excluídas): {count}",
  "citationChange.readiness.receipts":
    "Apenas declarações de execução (não prova de entrega): {count}",
  "citationChange.error.unsupported": "Campo, valor ou tipo não suportado; nada foi guardado.",
  "citationChange.error.unavailable":
    "Não foi possível carregar ou guardar o registo da alteração.",
  "citationChange.error.stale": "O artefacto mudou desde que o viu; volte a abri-lo.",
  "citationChange.error.forbidden": "Não tem permissão para fazer isto neste projeto.",
  "citationChange.error.unapproved": "Esta versão não está atualmente aprovada.",
  "citationChange.error.receiptInvalid":
    "O instante declarado é anterior à aprovação ou está no futuro.",
  "citationChange.error.capacity":
    "A capacidade de artefactos de alteração deste projeto foi atingida.",
  "citationChange.error.inspectionInvalid":
    "A inspeção não é válida (instante, referência ou estado).",
  "citationChange.error.notIndependent":
    "Você executou ou aprovou esta alteração, por isso não pode inspecioná-la de forma independente.",
  "citationChange.error.identityUnavailable":
    "A identidade do executante ou do aprovador não está disponível; a inspeção independente é recusada.",
  "citationChange.error.inspectionConflict":
    "A sua cadeia de inspeções mudou; recarregue e registe novamente.",
  "citationChange.error.generic": "Não foi possível concluir a ação sobre as provas da alteração.",
  "citationChange.artifact.fieldKey": "Campo",
  "citationChange.artifact.addField": "Adicionar campo",
  "citationChange.artifact.removeField": "Remover",
  "citationChange.artifact.removed": "Artefacto eliminado (identificadores de auditoria mantidos).",
  "citationChange.artifact.approvalRevision": "revisão de aprovação {revision}",
  "citationChange.approval.approved": "Aprovação registada.",
  "citationChange.approval.revoked": "Aprovação revogada.",
  "citationChange.approval.retry": "Repetir a mesma decisão",
  "citationChange.approval.replayed":
    "Isto foi uma repetição de um pedido anterior; a decisão atual é mostrada após recarregar.",
  "citationChange.receipt.remove": "Remover declaração",
  "citationChange.receipt.removed": "Declaração removida.",
  "citationChange.binding.deleted":
    "O artefacto vinculado foi eliminado; restam apenas identificadores.",
  "citationChange.detail.changeTitle": "Alteração de ficha / configuração vinculada",
  "citationChange.detail.artifactVersion": "Versão aprovada do artefacto",
  "citationChange.detail.receiptAt": "Declarado executado em",
  "citationChange.assign.candidatesNone":
    "Nenhum revisor da equipa elegível para atribuir (política ou lista).",
  "citationChange.assign.granted": "Inspeção concedida.",
  "citationChange.assign.revoked": "Inspeção revogada.",
  "citationChange.inspect.kindPublic": "Página publicada",
  "citationChange.inspect.fresh":
    "A sua inspeção atual já não tem efeito ({reason}); registe uma nova em relação à sua cabeça de cadeia atual.",
  "citationChange.inspect.reason.superseded": "substituída por um recibo posterior",
  "citationChange.inspect.reason.withdrawn": "retirada",
  "citationChange.inspect.reason.account": "conta indisponível",
  "citationChange.inspect.reason.assignment": "a atribuição foi concedida de novo",
  "citationChange.inspect.reason.authority": "a sua autoridade na equipa mudou",
  "citationChange.inspect.reason.independence": "você é agora o executante ou o aprovador",
  "citationChange.inspect.noContent":
    "O conteúdo aprovado já não está disponível (artefacto eliminado ou publicação em falta).",
  "citationChange.inspect.boundFindings": "Constatações vinculadas",
  "citationChange.inspect.withdrawnDone": "Inspeção retirada.",
  "citationChange.dissent.title": "Discordância ativa sobre esta alteração entregue",
  "citationChange.dissent.row": "{inspector} · linha {row} · {at}",
  "citationChange.status.receipt_recorded":
    "declaração de execução registada (não prova de entrega)",
  "citationChange.artifact.duplicateField":
    "Este campo já é usado por outra linha; escolha um campo diferente ou remova esta linha.",
  "citationChange.artifact.fieldsExhausted": "Cada campo suportado deste tipo já tem uma linha.",
  "citationChange.approval.pendingNote":
    "O pedido anterior não voltou. Repetir envia exatamente a mesma decisão (versão {sha}, {decision}, revisão revista {revision}); nada é recalculado a partir do estado atual.",
  "citationChange.approval.newDecision": "Descartá-la e decidir de novo",
  "citationChange.receipt.retry": "Repetir a mesma declaração",
  "citationChange.receipt.newPerformance": "Declarar uma nova execução",
  "citationChange.receipt.pendingNote":
    "A declaração anterior não voltou. Repetir envia exatamente o mesmo instante declarado ({at}); uma nova execução é uma ação explícita separada.",
  "citationChange.approval.blockedBy":
    "Resolva primeiro a decisão pendente de {reference} (repita-a ou descarte-a); as outras aprovações aguardam.",
  "citationChange.receipt.blockedBy":
    "Resolva primeiro a declaração pendente de {reference} (repita-a ou declare uma nova execução); as outras declarações aguardam.",
  "citationChange.readiness.verified":
    "Alterações distintas verificadas: {count} de {required} exigidas (uma alteração conta quando a sua prova é elegível: a sua própria atestação ou uma inspeção independente de uma alteração entregue; uma alteração contestada ou excluída nunca conta)",
  "citationChange.readiness.sources":
    "Observações registadas sobre as alterações atuais: atestadas pelo proprietário {owner}, inspecionadas de forma independente {independent} (são contagens de observações registadas, não provas elegíveis; as contestações e exclusões decidem a contagem verificada acima)",
  "citationChange.evidence.independentBaseline":
    "a linha de base é resolvida pela prova independente (sem atestação do proprietário nesta linha)",
  "citationChange.inspect.ownerIntro":
    "Abra a ficha ou a definição na referência exata, compare com os campos aprovados abaixo e depois registe o que viu. Abrir não atesta nada por si só.",
  "citationChange.inspect.contentUnavailable":
    "Não foi possível carregar o conteúdo aprovado exato desta alteração (artefacto eliminado, alterado ou indisponível): uma atestação positiva não é possível; um resultado negativo ou inconclusivo ainda pode ser registado.",
  "citationChange.receipt.stale":
    "não válida sob a aprovação atual (registada sob uma decisão anterior, ou a aprovação já não está em vigor) — declare uma nova execução",
  "citationChange.issue.receipt_stale":
    "A declaração escolhida não é válida sob a aprovação atual: foi registada sob uma decisão de aprovação anterior, ou a aprovação já não está em vigor. Declare uma nova execução e escolha essa.",
  "citationChange.error.receiptStale":
    "A declaração foi registada sob uma decisão de aprovação anterior (a aprovação foi desde então revogada ou decidida de novo). Declare uma nova execução sob a aprovação atual e vincule essa.",
  "citationChange.binding.receiptStale":
    "A declaração vinculada foi registada sob uma decisão de aprovação anterior, pelo que esta linha se mantém em vinculada à aprovação e nenhuma inspeção nova pode vincular essa declaração. Declare uma nova execução sob a aprovação atual e registe uma nova versão da melhoria.",
};
