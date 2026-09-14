import type { ConversationCopy } from "../conversation";
export const ptConversation: ConversationCopy = {
  "chat.account.title": "As tuas conversas",
  "chat.account.description":
    "Todas as conversas privadas com o Milo que iniciaste, em todos os projetos. Só tu vês esta lista.",
  "chat.account.manage": "Gerir todas as conversas",
  "chat.account.error":
    "Não foi possível confirmar as tuas conversas. Os títulos continuam ocultos até serem verificados novamente.",
  "chat.account.retry": "Verificar novamente",
  "chat.account.empty": "Não tens conversas guardadas.",
  "chat.account.more": "Mostrar mais conversas",
  "chat.account.started": "Iniciada: {date}",
  "chat.account.unavailable":
    "O acesso ao projeto terminou, pelo que o título e as mensagens continuam ocultos. Ainda podes eliminar esta conversa.",
  "chat.account.eraseAccess": "A eliminação não restaura nem altera o teu acesso ao projeto.",
  "chat.export": "Exportar conversa",
  "chat.exportHelp":
    "Transfere mensagens, comprovativos e propostas históricas num ficheiro JSON. Os ficheiros associados são separados.",
  "chat.exporting": "A preparar a conversa completa…",
  "chat.exportFailed":
    "Não foi possível concluir a exportação. Aguarde que o trabalho em curso termine e tente novamente.",
  "chat.erase": "Eliminar conversa",
  "chat.eraseTitle": "Eliminar esta conversa permanentemente?",
  "chat.eraseHelp":
    "Elimina mensagens e propostas permanentemente. Os rascunhos, resultados e registos de faturação mantêm-se. O trabalho já enviado pode terminar e consumir a sua quota. Mantêm-se os registos que impedem trabalho duplicado.",
  "chat.erasing": "A eliminar a conversa…",
  "chat.eraseUnconfirmed":
    "Não foi possível confirmar a eliminação. As mensagens continuam ocultas aqui. Repita a eliminação para confirmar o resultado.",
  "chat.eraseRetry": "Repetir eliminação",
  "chat.erased": "Conversa eliminada.",
  "chat.tool.draft_metadata_proposal": "Proposta de metadados do rascunho",
  "chat.proposal.review": "Rever as alterações propostas",
  "chat.proposal.before": "Antes",
  "chat.proposal.after": "Proposta",
  "chat.proposal.ready":
    "Ao guardar, o rascunho volta à revisão e a aprovação de publicação anterior é retirada.",
  "chat.proposal.waiting":
    "Aguarde a conclusão desta tarefa antes de guardar as alterações propostas.",
  "chat.proposal.unavailable":
    "Esta proposta já não pode ser guardada. Peça uma nova com base no rascunho atual.",
  "chat.proposal.applied":
    "Estas alterações foram guardadas. Edições posteriores podem ter alterado o conteúdo.",
  "chat.proposal.unconfirmed":
    "Não foi possível confirmar a gravação. Verifique o estado guardado antes de tentar novamente.",
  "chat.proposal.empty": "(vazio)",
  "chat.title": "Fala com o Milo",
  "chat.openContext": "Abrir a vista do projeto",
  "chat.description":
    "Diz ao Milo o que queres melhorar. O especialista de IA adequado continua aqui com o contexto guardado do teu projeto.",
  "chat.chooseProject": "Cliente ou projeto",
  "chat.ownProjects": "Os teus projetos",
  "chat.history": "Conversas",
  "chat.new": "Nova conversa",
  "chat.welcome": "Em que vamos trabalhar?",
  "chat.private": "A tua conversa privada neste projeto.",
  "chat.sharedPrivate":
    "A tua conversa privada num projeto partilhado. Aplicam-se as tuas permissões atuais na equipa.",
  "chat.reviewPrompt": "Revê a estrutura SEO dos meus rascunhos guardados.",
  "chat.knowledgePrompt": "O que podes dizer-me com base no contexto guardado deste projeto?",
  "chat.messageFor": "Mensagem para {project}",
  "chat.placeholder": "Descreve a tarefa e o resultado de que precisas…",
  "chat.keyboard": "Ctrl / ⌘ + Enter para enviar. Enter inicia uma nova linha.",
  "chat.tooLong": "Esta mensagem é demasiado longa. Encurta-a antes de enviar.",
  "chat.full": "Esta conversa atingiu o limite. Inicia uma nova conversa para continuar.",
  "chat.allowGeneration":
    "Permitir um rascunho para um tema existente neste pedido. Consome a quota de conteúdo e guarda o resultado para revisão.",
  "chat.generationEnabled": "Geração de um rascunho permitida para este pedido.",
  "chat.usage":
    "As respostas consomem a quota de IA da tua conta. A geração de rascunhos também consome a quota de conteúdo. A publicação é um passo separado.",
  "chat.send": "Enviar mensagem",
  "chat.you": "Tu",
  "chat.messages": "Mensagens da conversa",
  "chat.page": "Tarefas {from}–{to} de {total}",
  "chat.latest": "Mensagens mais recentes",
  "chat.sending": "A enviar e a verificar o estado guardado…",
  "chat.pending": "Pedido guardado; à espera de início.",
  "chat.running": "A trabalhar no teu pedido…",
  "chat.completed": "Resposta guardada.",
  "chat.failed":
    "Esta tentativa foi interrompida. Revê o trabalho guardado antes de enviar outro pedido.",
  "chat.unknown":
    "Não foi possível confirmar o resultado final. Verifica os resultados guardados antes de recomeçar.",
  "chat.cancelled":
    "O trabalho seguinte foi cancelado. Uma operação já enviada pode ainda terminar.",
  "chat.provider_unavailable":
    "O fornecedor de IA não está configurado para esta conta. Contacta o administrador.",
  "chat.usage_limit":
    "A quota de IA da tua conta não permite outro passo. Verifica a utilização antes de continuar.",
  "chat.budget_unavailable":
    "As despesas de IA estão indisponíveis com as definições atuais do orçamento. Pede ao administrador que as verifique.",
  "chat.unavailable":
    "Não foi possível confirmar o acesso ou o estado guardado da conversa. Atualiza antes de continuar.",
  "chat.sendUnconfirmed":
    "Não foi possível confirmar este pedido. Recupera o pedido original ou verifica o histórico antes de o enviar como uma nova tarefa.",
  "chat.recover": "Recuperar pedido original",
  "chat.resume": "Iniciar pedido guardado",
  "chat.stop": "Parar o trabalho seguinte",
  "chat.stopHelp":
    "Parar impede os passos seguintes. Um pedido já enviado pode ainda terminar e consumir a tua quota.",
  "chat.evidenceSaved": "Resultado guardado nesta conversa.",
  "chat.toolUnavailable": "Esta operação está indisponível com a função ou as permissões atuais.",
  "chat.partialHistory":
    "O especialista recebeu uma parte abreviada do histórico guardado. Repete os requisitos que faltarem.",
  "chat.tool.project_brief": "Contexto do projeto",
  "chat.tool.draft_read": "Revisão do rascunho guardado",
  "chat.tool.draft_seo_review": "Verificação da estrutura do rascunho guardado",
  "chat.tool.project_knowledge": "Conhecimento do projeto",
  "chat.tool.weekly_preparation": "Estado da preparação semanal",
  "chat.tool.saved_audit": "Revisão da auditoria guardada",
  "chat.tool.draft_generation": "Geração do rascunho",
  "chat.tool.technical_evidence": "Verificações técnicas guardadas",
  "chat.tool.visibility_evidence": "Evidências guardadas de respostas de IA e registos",
  "chat.tool.authority_evidence": "Monitorização guardada de ligações externas",
  "chat.tool.google_index_inspection": "Inspeção do índice Google",
  "chat.tool.performance_test": "Teste de velocidade da página",
  "chat.tool.site_crawl": "Rastreio do site",
  "chat.allowProviderChecks":
    "Permitir até duas verificações do site neste pedido (inspeção do índice Google, velocidade da página ou um rastreio do site) para o website deste projeto. Utiliza os serviços ligados do proprietário do projeto e os limites de verificação existentes, e guarda os resultados com as verificações técnicas do projeto.",
  "chat.providerChecksEnabled": "Verificações do site permitidas para este pedido.",
};
