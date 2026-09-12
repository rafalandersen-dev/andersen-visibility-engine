/** European Portuguese authoring only; not registered in the runtime. */
export const ptSetupScreen: Readonly<Record<string, string>> = {
  "setupScreen.invalidUrl": "O campo {field} tem de começar por http:// ou https://",
  "setupScreen.missing": "Preencha os campos obrigatórios: {fields}",
  "setupScreen.additional": "Idiomas adicionais dos conteúdos",
  "setupScreen.sellingPoints": "Argumentos de venda diferenciadores",
  "setupScreen.publishing": "Publicação",
  "setupScreen.mode": "Modo de publicação",
  "setupScreen.mode.draft": "Apenas rascunhos",
  "setupScreen.mode.manual": "Publicação manual no site",
  "setupScreen.endpoint": "Endpoint de entrega de rascunhos",
  "setupScreen.liveEndpoint": "Endpoint de publicação no site",
  "setupScreen.liveHelp":
    "Um endpoint separado para publicar um rascunho revisto. Utiliza o mesmo segredo de publicação.",
  "setupScreen.secret": "Segredo de publicação",
  "setupScreen.secretHelp":
    "Os novos segredos são guardados pelo servidor e enviados ao destino configurado num cabeçalho do pedido. Configure o mesmo segredo nesse destino.",
  "setupScreen.destination": "Destino predefinido",
  "setupScreen.faq": "Secção de perguntas frequentes",
  "setupScreen.approvalHelp":
    "Aprovar um artigo marca-o como pronto. A publicação exige uma ação separada: publicar agora ou agendar a hora de publicação. Reveja o conteúdo e as afirmações antes de publicar.",
  "setupScreen.disclaimer": "Aviso sobre conteúdos de IA",
  "setupScreen.retiredTitle": "A publicação automática após aprovação foi removida.",
  "setupScreen.retiredHelp":
    "Este projeto utiliza agora o modo {mode}. A aprovação marca um artigo como pronto; a publicação continua a exigir uma ação separada ou um agendamento. Os artigos aprovados anteriormente podem ainda ser rascunhos. Verifique o respetivo estado antes de agendar novo trabalho.",
  "setupScreen.saving": "A guardar…",
  "setupScreen.save": "Guardar definições de publicação",
  "setupScreen.saved": "Definições de publicação guardadas",
  "setupScreen.failed": "Não foi possível guardar as definições de publicação",
  "setupScreen.tagsExample": "seo, crescimento",
};
