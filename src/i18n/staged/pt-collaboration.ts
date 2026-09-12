/** European Portuguese authoring only; not registered in the runtime. */
export const ptCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Trabalho atual do projeto",
  "awareness.help":
    "Apenas na aplicação. Estas verificações não enviam e-mails. Os bloqueios permanecem visíveis até a fila mudar; abri-los não aprova nem reinicia o trabalho.",
  "awareness.project": "Escolher projeto",
  "awareness.approval": "A versão exata precisa de aprovação",
  "awareness.resume": "A versão aprovada continua bloqueada",
  "awareness.late":
    "Esta data já passou. Reveja o rascunho e escolha uma ação explícita de agendamento.",
  "awareness.paused":
    "A automatização está intencionalmente em pausa. Os bloqueios de publicação existentes mantêm-se separados.",
  "awareness.disabled": "A automatização está desativada.",
  "awareness.settings": "Abrir definições de agendamento",
  "awareness.history":
    "Último resultado semanal guardado — histórico, não uma nova verificação de capacidade ou fontes",
  "awareness.empty": "Não existem bloqueios de aprovação nesta página.",
  "awareness.page": "Página {page} de {pages} da fila",
  "awareness.error": "Não foi possível verificar os registos atuais. Atualize antes de agir.",
  "awareness.checked": "Verificado em {at}",
  "awareness.weekly": "Registos atuais dos períodos semanais",
  "awareness.earlier": "Alertas anteriores da caixa de entrada",
  "notifications.failureInspect": "Inspecionar detalhes de publicação",
  "notifications.failureReadError":
    "Não foi possível verificar os detalhes de publicação. Tente novamente antes de decidir o que fazer.",
  "notifications.failureReason.contentReview":
    "A tentativa guardada foi bloqueada por verificações de conteúdo. Abra o rascunho para rever a sua preparação atual.",
  "notifications.failureReason.destination":
    "A tentativa guardada indicou um erro de ligação ou resposta do destino. Verifique o destino antes de tentar novamente.",
  "notifications.failureReason.configuration":
    "A tentativa guardada indicou configuração de publicação em falta ou inválida. Verifique a configuração do projeto.",
  "notifications.failureReason.unknown":
    "Não foi possível classificar o erro guardado. Reveja o rascunho e o destino antes de tentar novamente.",
  "notifications.failureRecorded":
    "Registo atualizado em {at}, no fuso horário do seu navegador. Tentativas registadas: {attempts}.",
  "notifications.failureDraftChanged":
    "O rascunho mudou após este registo. Estes detalhes podem já não descrever a sua preparação atual.",
  "notifications.failureHttp": "Resposta registada do site: HTTP {status}.",
  "notifications.failureCheck.links":
    "Resolva as ligações internas no painel de segurança de ligações do editor.",
  "notifications.failureCheck.sourcesReview":
    "Verifique as afirmações com fontes ou um autor qualificado e conclua a revisão humana.",
  "notifications.failureCheck.author":
    "Adicione o nome do autor real e uma biografia, qualificação ou perfil.",
  "notifications.failureHistoryLimit":
    "Esta é informação histórica guardada no Milo. Não verifica o destino, não aprova o rascunho atual nem reinicia a publicação.",
  "notifications.failureState.absent":
    "Não foi encontrado um registo correspondente na fila. Atualize as notificações e reveja o rascunho.",
  "notifications.failureState.changed":
    "A fila já não assinala este item como falhado. Atualize as notificações; esta alteração, por si só, não verifica o site de destino.",
  "notifications.recoveryInspect": "Inspecionar trabalho guardado",
  "notifications.recoveryReadError":
    "Não foi possível verificar os registos de automatização guardados. Tente novamente antes de decidir se deve reiniciar.",
  "notifications.recoveryState.absent":
    "Não foi encontrado um registo de execução atual. Atualize as notificações para verificar se este incidente foi resolvido.",
  "notifications.recoveryState.running": "A execução mais recente está assinalada como ativa.",
  "notifications.recoveryState.completed":
    "A execução mais recente terminou. Atualize as notificações para consultar os problemas atuais.",
  "notifications.recoveryState.review_required":
    "A execução interrompida ainda precisa de revisão.",
  "notifications.recoverySnapshot":
    "Registos do Milo verificados em {at}, no fuso horário do seu navegador.",
  "notifications.recoveryCounts":
    "Plano {period}: {saved} rascunhos guardados. Registos na fila para esses rascunhos: {pending} em espera, {publishing} em curso, {published} registados como publicados, {failed} falhados e {cancelled} cancelados.",
  "notifications.recoveryEvidenceLimit":
    "Estes são registos guardados no Milo. Não verificam a última operação de IA nem o site de destino. Verifique o destino antes de repetir uma publicação com resultado incerto. Esta vista não reinicia o trabalho.",
  "notifications.recoveryMore":
    "A mostrar {shown} de {total} rascunhos guardados. Abra o calendário para inspecionar o trabalho restante.",
  "notifications.emailAddressUnverified":
    "O endereço de e-mail atual da sua conta não foi verificado. Conclua a confirmação do e-mail e verifique novamente. Se o endereço foi alterado por um administrador e não tem uma ligação de confirmação, contacte o apoio do Milo. As notificações na aplicação continuam disponíveis.",
  "notifications.emailAddressUnavailable":
    "O Milo não conseguiu verificar a confirmação do seu e-mail atual. Tente mais tarde. Pode continuar a desativar os resumos e a utilizar as notificações na aplicação.",
  "notifications.generation_capacity_low": "O limite de preparação pode não cobrir o plano",
  "notifications.generation_capacity_unavailable":
    "Não foi possível verificar o limite de preparação",
  "notifications.capacityLow":
    "O plano de {period} ainda precisa de {missing} rascunhos neste projeto e de {total} no conjunto dos seus agendamentos ativos. A sua conta tem {remaining} tentativas de preparação restantes em {usagePeriod}. É capacidade partilhada, não uma promessa de artigos concluídos. Reveja o agendamento; os rascunhos guardados continuam disponíveis para revisão e publicação.",
  "notifications.capacityUnavailable":
    "O Milo não conseguiu verificar o limite partilhado de preparação para {usagePeriod}. O plano de {period} ainda precisa de {missing} rascunhos aqui. Verifique mais tarde. Os rascunhos guardados e as outras notificações continuam disponíveis.",
  "notifications.scheduler_recovery": "A automatização precisa de revisão de recuperação",
  "notifications.recovery":
    "Preparação em pausa após uma execução interrompida. Reveja os rascunhos guardados e a última operação antes de reiniciar. As aprovações de publicação existentes mantêm-se inalteradas.",
  "notifications.emailTitle": "Resumos por e-mail",
  "notifications.emailDescription":
    "Receba um resumo dos novos alertas, no máximo uma vez por hora, no endereço confirmado da sua conta. Cada incidente aparece uma vez.",
  "notifications.emailDisabled":
    "O envio de e-mails ainda não foi ativado. As notificações na aplicação estão disponíveis.",
  "notifications.emailEnable": "Ativar resumos por e-mail",
  "notifications.emailDisable": "Desativar resumos por e-mail",
  "notifications.emailError": "As definições de e-mail estão temporariamente indisponíveis.",
  "notifications.emailSaveError": "Não foi possível guardar as preferências de e-mail.",
  "notifications.emailHistory": "Atividade recente de e-mail",
  "notifications.emailStatus.pending": "Em espera",
  "notifications.emailStatus.leased": "A verificar o estado atual",
  "notifications.emailStatus.sending": "A enviar",
  "notifications.emailStatus.accepted": "Aceite pelo fornecedor de e-mail",
  "notifications.emailStatus.unknown": "O resultado da entrega precisa de verificação",
  "notifications.emailStatus.cancelled": "Cancelado",
  "notifications.emailStatus.failed": "Não foi possível preparar o e-mail",
  "notifications.title": "Notificações",
  "notifications.subtitle":
    "As suas próximas decisões e problemas de publicação, verificados face ao estado mais recente do servidor.",
  "notifications.loading": "A verificar o seu plano…",
  "notifications.empty": "Nenhuma ação precisa da sua atenção neste momento.",
  "notifications.error": "As notificações estão temporariamente indisponíveis.",
  "notifications.stale":
    "Não foi possível concluir a última verificação. Estes são os últimos alertas confirmados.",
  "notifications.refresh": "Verificar novamente",
  "notifications.read": "Marcar como lida",
  "notifications.unread": "Por ler",
  "notifications.saved": "Lida",
  "notifications.open": "Abrir tarefa",
  "notifications.calendar": "Abrir calendário",
  "notifications.project": "Projeto",
  "notifications.approval_due": "Prazo de aprovação próximo",
  "notifications.publication_failed": "A publicação precisa de verificação",
  "notifications.manual_overdue": "A tarefa manual está atrasada",
  "notifications.cadence_gap": "A próxima semana precisa de atenção",
  "notifications.coverage": "{missing} de {total} períodos planeados não estão prontos e em fila.",
  "notifications.failure":
    "Verifique o destino antes de tentar novamente: uma publicação interrompida pode já estar online.",
  "notifications.approval": "Reveja a versão atual antes do prazo planeado.",
  "notifications.manual":
    "Conclua esta tarefa ou escolha uma nova data. Este prazo refere-se a uma tarefa manual.",
  "notifications.readError": "Não foi possível marcar esta notificação como lida. Tente novamente.",
  "team.title": "A equipa do Milo",
  "team.help":
    "Uma área de trabalho, com perspetivas especializadas sobre trabalho real e conhecimento do projeto.",
  "team.selectProject": "Escolha um projeto para ver a respetiva equipa.",
  "team.scope":
    "O estado das tarefas abrange a semana selecionada. Os conselhos e relatórios guardados são evidências datadas, não provas de uma tarefa ativa ou de melhores resultados.",
  "team.aiRole": "Especialista de IA",
  "team.records":
    "{count} registos de conhecimento guardados · reveja o estado no conhecimento do projeto",
  "team.lastDelivery": "Última entrega nas tarefas desta semana",
  "team.auditFetched": "Auditoria do site guardada",
  "team.auditPartial": "Auditoria guardada baseada apenas no contexto do projeto",
  "team.adviceSaved": "Conselhos de preparação para IA guardados",
  "team.imports": "{count} importações de medições GSC guardadas",
  "team.measurementMissing": "Sem medições GSC guardadas",
  "team.authorityPrerequisite":
    "Os dados do fornecedor e a autorização para contacto externo têm de ser verificados na área de backlinks.",
  "team.lesson.title": "Memorizar uma lição editorial",
  "team.lesson.help":
    "Escreva uma preferência recorrente para este projeto. Ao guardar, torna-se uma instrução explícita do projeto para trabalho futuro relevante. As edições normais de artigos não criam lições. Isto não constitui prova factual.",
  "team.lesson.rule": "Instrução para este projeto",
  "team.lesson.target": "Aplicar a",
  "team.lesson.text": "Escrita",
  "team.lesson.visual": "Elementos visuais",
  "team.lesson.both": "Escrita e elementos visuais",
  "team.lesson.save": "Guardar instrução do projeto",
  "team.lesson.manage": "Rever, editar ou esquecer conhecimento",
  "team.lesson.saved":
    "Guardada neste projeto. Pode editá-la, revertê-la ou revogá-la no conhecimento do projeto.",
  "team.lesson.unknown":
    "Não foi possível confirmar a gravação. Verifique o conhecimento do projeto antes de introduzir novamente a instrução.",
  "team.role.lead": "Milo — Responsável pelo crescimento",
  "team.description.lead": "Coordena o agendamento guardado, a cobertura e as decisões.",
  "team.open.lead": "Rever preparação semanal",
  "team.role.brand": "Estratega de marca",
  "team.description.brand":
    "Factos do projeto, preferências e lições reversíveis, com origem e histórico de revisão.",
  "team.open.brand": "Rever conhecimento do projeto",
  "team.role.research": "Investigador de pesquisa",
  "team.description.research":
    "Resumos semanais de pesquisa e oportunidades guardadas. Reveja as fontes e hipóteses antes de escrever.",
  "team.open.research": "Rever oportunidades",
  "team.role.content": "Editor de conteúdos",
  "team.description.content":
    "Os artigos preservados continuam a exigir revisão editorial e aprovação da versão exata para publicação.",
  "team.open.content": "Rever artigos",
  "team.role.image": "Criador visual",
  "team.description.image":
    "Os elementos visuais propostos utilizam o contexto do projeto. A preservação não significa aprovação visual.",
  "team.open.image": "Rever elementos visuais dos artigos",
  "team.role.seo": "Especialista de SEO",
  "team.description.seo":
    "Conclusões datadas de auditorias de páginas, ligações internas e entidades locais. As auditorias parciais mantêm as suas limitações.",
  "team.open.seo": "Rever conclusões de SEO",
  "team.role.authority": "Backlinks e autoridade",
  "team.description.authority":
    "A pesquisa, a monitorização e as propostas dependem de acesso verificado ao fornecedor. Enviar mensagens e comprar colocações exige autorização separada.",
  "team.open.authority": "Verificar área de backlinks",
  "team.role.ai": "Analista de visibilidade na IA",
  "team.description.ai":
    "Os conselhos de preparação são separados das respostas, menções e citações observadas. O acompanhamento de resultados observados não está estabelecido aqui.",
  "team.open.ai": "Rever conselhos de preparação",
  "team.role.performance": "Analista de desempenho",
  "team.description.performance":
    "Relatórios guardados e medições datadas. Os dados em falta são desconhecidos; uma mudança antes/depois, por si só, não prova causalidade.",
  "team.open.performance": "Rever medições",
  "team.state.unavailable": "Estado indisponível",
  "team.state.none": "Sem trabalho registado",
  "team.state.unknown": "Resultado incerto — rever recuperação",
  "team.state.running": "Trabalho em curso",
  "team.state.review": "As alterações do proprietário precisam de revisão",
  "team.state.retained": "Resultados preservados para revisão",
  "team.state.cancelled": "Preparação cancelada",
  "collaboration.reviewImageLimits":
    "Estas imagens excedem os limites de revisão ou não podem ser apresentadas em segurança. Reduza a quantidade ou o tamanho e utilize imagens estáticas PNG, JPEG ou WebP.",
  "collaboration.emailInvitation": "Enviar convite por e-mail",
  "collaboration.invitationEmailHelp":
    "Envie um convite para o endereço de e-mail acima com a função apresentada. Abrir a ligação no e-mail não concede acesso.",
  "collaboration.invitationEmailQueued":
    "Envio do convite por e-mail solicitado. Verifique aqui o estado de entrega.",
  "collaboration.notificationHistory": "Histórico de entrega de notificações",
  "collaboration.notificationSettings": "Notificações do projeto",
  "collaboration.notificationConsentHelp":
    "São necessárias tanto a atribuição pelo proprietário como a sua própria autorização. Alterações à sua função no projeto exigem renovar as definições.",
  "collaboration.notificationAssigned": "Atribuídas pelo proprietário",
  "collaboration.notificationNotAssigned": "Não atribuídas pelo proprietário",
  "collaboration.notificationOptedIn": "O destinatário deu consentimento",
  "collaboration.notificationOptedOut": "O destinatário não deu consentimento",
  "collaboration.notificationAssign": "Atribuir notificações",
  "collaboration.notificationUnassign": "Remover atribuição",
  "collaboration.notificationOptIn": "Permitir notificações do projeto",
  "collaboration.notificationOptOut": "Desativar notificações do projeto",
  "collaboration.decisionRecorded": "Decisão de revisão registada.",
  "collaboration.decisionUnknown":
    "Não foi possível confirmar a decisão. Atualize as decisões anteriores antes de tentar novamente.",
  "collaboration.reviewNotAllowed":
    "A sua função atual ou a política do projeto não permite decisões de revisão.",
  "collaboration.acknowledgeReview":
    "Inspecionei este rascunho apresentado e todas as suas imagens.",
  "collaboration.approveVersion": "Aprovar esta versão",
  "collaboration.returnForChanges": "Devolver para alterações",
  "collaboration.reviewDoesNotPublish":
    "Registar uma revisão não publica o rascunho nem retoma um agendamento bloqueado.",
  "collaboration.reviewHistory": "Decisões de revisão anteriores",
  "collaboration.approvalRecorded": "Aprovação registada",
  "collaboration.changesRequested": "Alterações solicitadas",
  "collaboration.owner": "Proprietário",
  "collaboration.collaborator": "Colaborador",
  "collaboration.renderedReview": "Revisão do conteúdo apresentado",
  "collaboration.loadingReview": "A carregar a revisão completa e as respetivas imagens…",
  "collaboration.incompleteReview":
    "Não foi possível carregar a revisão completa. Atualize para verificar o rascunho e todas as imagens.",
  "collaboration.policyTitle": "Política de aprovação",
  "collaboration.policyHelp":
    "Escolha quem pode aprovar trabalho do projeto. Alterar esta política retira as aprovações existentes dos colaboradores; as aprovações independentes do proprietário mantêm-se.",
  "collaboration.policyUnselected": "Não selecionada — a aprovação por colaboradores está inativa",
  "collaboration.policy.disabled": "Apenas aprovações do proprietário",
  "collaboration.policy.separate_reviewers": "Revisores separados aprovam; editores editam",
  "collaboration.policy.editors_can_approve": "Editores e revisores podem aprovar",
  "collaboration.savePolicy": "Guardar política de aprovação",
  "collaboration.editDraft": "Editar rascunho",
  "collaboration.editHelp":
    "Guardar devolve este rascunho à revisão e retira a sua aprovação anterior de publicação.",
  "collaboration.editConflict":
    "O rascunho guardado ou a sua função mudou. Copie as alterações que pretende manter antes de carregar a versão guardada mais recente.",
  "collaboration.loadLatest": "Carregar a versão guardada mais recente",
  "collaboration.draftSaved": "Rascunho guardado para revisão.",
  "collaboration.editError":
    "Não foi possível guardar o rascunho. As suas alterações continuam aqui; verifique a versão atual e o seu acesso antes de tentar novamente.",
  "collaboration.saveDraft": "Guardar para revisão",
  "collaboration.question": "Pergunta",
  "collaboration.answer": "Resposta",
  "collaboration.removeQuestion": "Remover pergunta",
  "collaboration.addQuestion": "Adicionar pergunta",
  "collaboration.field.title": "Título",
  "collaboration.field.h1": "Título principal",
  "collaboration.field.metaTitle": "Título de pesquisa",
  "collaboration.field.metaDescription": "Descrição de pesquisa",
  "collaboration.field.markdown": "Artigo (Markdown)",
  "collaboration.field.cta": "Chamada à ação",
  "collaboration.field.outline": "Estrutura — um título por linha",
  "collaboration.field.faq": "Perguntas e respostas",
  "collaboration.comments": "Comentários",
  "collaboration.commentLabel": "O seu comentário",
  "collaboration.addComment": "Adicionar comentário",
  "collaboration.you": "Você",
  "collaboration.commentRoleAtPosting": "Função no momento da publicação",
  "collaboration.earlierVersion": "Comentário sobre uma versão guardada anterior.",
  "collaboration.title": "Colaboradores do projeto",
  "collaboration.subtitle": "Gira o acesso ao projeto e abra o trabalho partilhado consigo.",
  "collaboration.owned": "Gerir o seu projeto",
  "collaboration.shared": "Partilhado consigo",
  "collaboration.invitations": "Os seus convites",
  "collaboration.members": "Pessoas com acesso",
  "collaboration.pending": "Convites do projeto",
  "collaboration.email": "Endereço de e-mail",
  "collaboration.role": "Função",
  "collaboration.viewer": "Leitor",
  "collaboration.editor": "Editor",
  "collaboration.reviewer": "Revisor",
  "collaboration.invite": "Criar convite",
  "collaboration.inviteHelp":
    "O convite aparece aqui quando o destinatário inicia sessão com este e-mail verificado. Expira após sete dias. Esta ação não envia e-mail.",
  "collaboration.accept": "Aceitar convite",
  "collaboration.revoke": "Revogar convite",
  "collaboration.remove": "Remover acesso",
  "collaboration.saveRole": "Guardar função",
  "collaboration.refresh": "Atualizar",
  "collaboration.open": "Abrir projeto",
  "collaboration.loading": "A carregar o acesso ao projeto…",
  "collaboration.error": "Não foi possível confirmar o acesso. Atualize antes de tentar novamente.",
  "collaboration.saved": "Acesso ao projeto atualizado.",
  "collaboration.empty": "Ainda não há nada para mostrar.",
  "collaboration.noOwned":
    "Pode abrir abaixo os projetos partilhados sem criar o seu próprio projeto.",
  "collaboration.drafts": "Rascunhos do projeto",
  "collaboration.back": "Voltar aos rascunhos",
  "collaboration.previous": "Anterior",
  "collaboration.next": "Seguinte",
  "collaboration.removed": "Removido",
  "collaboration.expires": "Expira",
  "collaboration.history": "Atividade recente de acesso",
  "collaboration.pendingState": "Pendente",
  "collaboration.expired": "Expirado",
  "collaboration.accepted": "Aceite",
  "collaboration.revoked": "Revogado",
  "emailSettings.language": "Idioma dos e-mails",
  "emailSettings.note":
    "Escolha o idioma dos seus resumos operacionais, relatórios mensais e convites de projeto que solicitar. Isto não altera as definições da aplicação, dos artigos ou do mercado. Guardar o idioma não ativa nem envia e-mails.",
  "emailSettings.save": "Guardar idioma dos e-mails",
  "emailSettings.saved": "Definições de e-mail guardadas.",
  "emailSettings.uncertain":
    "Não foi possível confirmar as definições guardadas. Volte a carregá-las antes de outra alteração; a última alteração pode já ter sido guardada.",
  "emailSettings.reload": "Recarregar definições guardadas (descartar alterações)",
};
