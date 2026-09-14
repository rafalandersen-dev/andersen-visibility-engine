/** European Portuguese authoring only; not registered in the runtime. */
export const ptLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Rede de crescimento de ligações",
  "linknet.subtitle":
    "Encontre sites relevantes na rede Milo, envie uma apresentação pessoal e deixe o Milo verificar se a ligação está realmente online.",
  "linknet.policyNote":
    "A relevância vem primeiro: as correspondências exigem temas comuns, as trocas diretas de ligações são assinaladas e nada é colocado automaticamente. Estas verificações não garantem conformidade com as políticas dos motores de pesquisa.",
  "linknet.topics": "Temas",
  "linknet.topicsPlaceholder": "Temas (separados por vírgulas)",
  "linknet.contact": "E-mail de contacto",
  "linknet.contactPlaceholder": "E-mail de contacto para parceiros",
  "linknet.join": "Aderir à rede",
  "linknet.update": "Atualizar listagem",
  "linknet.pause": "Pausar",
  "linknet.joined": "Listado — os parceiros já podem encontrar este site.",
  "linknet.paused": "Listagem em pausa.",
  "linknet.find": "Encontrar parceiros",
  "linknet.noMatches":
    "Ainda não há parceiros relevantes — a rede cresce com cada site Milo que adere.",
  "linknet.score": "Correspondência",
  "linknet.copyIntro": "Copiar e-mail de apresentação",
  "linknet.introCopied": "Apresentação copiada — cole-a no seu e-mail.",
  "linknet.markContacted": "Marcar contacto efetuado",
  "linknet.markAgreed": "Marcar acordo alcançado",
  "linknet.decline": "Recusar",
  "linknet.targetUrlPlaceholder": "URL da página acordada (onde ficará a ligação)",
  "linknet.verify": "Verificar ligação",
  "linknet.verified": "Ligação encontrada — a colocação está online e verificada.",
  "linknet.notFound": "Ainda não foi encontrada uma ligação nessa página — verificado e registado.",
  "linknet.liveSince": "Online desde",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Última verificação: ligação não encontrada",
  "linknet.reciprocalWarn":
    "Isto criaria uma troca direta de ligações com este site. Reveja a relevância e evite trocas excessivas.",
  "linknet.status.suggested": "Sugerida",
  "linknet.status.contacted": "Contacto efetuado",
  "linknet.status.agreed": "Acordado",
  "linknet.status.live_verified": "Online ✓",
  "linknet.status.declined": "Recusada",
  "backlinks.title": "Backlinks",
  "backlinks.subtitle":
    "Dados reais de backlinks para o seu domínio — força do perfil, lacunas de ligações face aos concorrentes e recomendações seguras para construir ligações.",
  "backlinks.disclaimer":
    "As métricas de backlinks provêm de um índice externo de ligações e são estimativas — nenhum índice vê todas as ligações. As recomendações são apenas sugestões de práticas éticas: o Milo nunca propõe esquemas de ligações nem ligações pagas sem divulgação, e não garante classificações, tráfego ou receitas.",
  "backlinks.run": "Executar análise de backlinks",
  "backlinks.rerun": "Atualizar análise",
  "backlinks.running": "A analisar…",
  "backlinks.empty":
    "Execute uma análise de backlinks para ver o perfil real de ligações do seu domínio, como se compara aos concorrentes e que domínios têm ligações para eles mas não para si.",
  "backlinks.notConfigured.title": "Ligar uma fonte de dados de backlinks",
  "backlinks.notConfigured.body":
    "Este módulo utiliza o índice de backlinks DataForSEO e ainda não está ligado. O proprietário da área de trabalho precisa de criar uma conta DataForSEO (pagamento conforme a utilização) e adicionar DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD como segredos do backend. Até lá, os dados de backlinks estão indisponíveis.",
  "backlinks.status.ready.title": "DataForSEO operacional",
  "backlinks.status.ready.body": "A API Backlinks está ligada e a responder.",
  "backlinks.status.lowBalance.title": "O saldo DataForSEO está a ficar baixo",
  "backlinks.status.lowBalance.body": "Recarregue em breve para evitar interrupções nas análises.",
  "backlinks.status.paused.title": "O acesso DataForSEO está em pausa",
  "backlinks.status.paused.body":
    "Contacte o apoio DataForSEO para reativar a conta antes de executar outra análise.",
  "backlinks.status.error.title": "Estado DataForSEO indisponível",
  "backlinks.status.error.body":
    "Não foi possível verificar a conta ou a API Backlinks. Atualize o estado ou verifique o painel do fornecedor.",
  "backlinks.status.balance": "Saldo: {balance}.",
  "backlinks.status.refresh": "Atualizar estado",
  "backlinks.competitorsUsed": "Concorrentes comparados: {list}",
  "backlinks.competitorsFromAnalysis":
    "A utilizar os concorrentes da última análise de concorrentes: {list}",
  "backlinks.noCompetitors":
    "Este projeto não tem URLs de concorrentes — a análise abrangerá apenas o seu perfil. Adicione concorrentes na configuração do projeto ou no módulo Concorrentes para aceder às lacunas de ligações.",
  "backlinks.lastRun": "Última análise: {date}",
  "backlinks.score.overall": "Posição das ligações",
  "backlinks.score.profile": "Força do perfil",
  "backlinks.score.gap": "Lacuna face aos concorrentes",
  "backlinks.score.quality": "Qualidade das ligações",
  "backlinks.gapHint": "mais alto = maior potencial de ganho",
  "backlinks.summaryHeading": "Resumo",
  "backlinks.topActions": "Principais ações de ligações",
  "backlinks.profileTable": "O seu domínio face aos concorrentes",
  "backlinks.table.domain": "Domínio",
  "backlinks.table.rank": "Classificação do domínio",
  "backlinks.table.backlinks": "Backlinks",
  "backlinks.table.referringDomains": "Domínios de referência",
  "backlinks.table.broken": "Quebradas",
  "backlinks.table.spam": "Pontuação de spam",
  "backlinks.table.notFetched": "Não foi possível obter os dados",
  "backlinks.you": "O seu domínio",
  "backlinks.gapHeading": "Lacunas de ligações — ligam aos concorrentes, não a si",
  "backlinks.gapNote":
    "Amostra do índice do fornecedor solicitada com o seu domínio excluído. Isto não verifica de forma independente que estes sites não têm ligações para si.",
  "backlinks.gap.linksTo": "Liga a",
  "backlinks.gapEmpty":
    "Nenhuma lacuna de ligações encontrada — não foram obtidos concorrentes ou não houve sobreposição.",
  "backlinks.referringHeading": "Principais domínios de referência com ligações para si",
  "backlinks.referringEmpty":
    "Ainda não foram encontrados domínios de referência no índice — um domínio recente começa frequentemente no zero.",
  "backlinks.recommendations": "Recomendações",
  "backlinks.effort": "Esforço",
  "backlinks.target": "Destino / plataforma",
  "backlinks.approach": "Abordagem",
  "backlinks.action.convert": "Criar oportunidade",
  "backlinks.action.converted": "Oportunidade criada",
  "backlinks.action.convertTop": "Converter principais recomendações",
  "backlinks.toast.done": "Análise de backlinks concluída",
  "backlinks.toast.converted": "Oportunidade criada",
  "backlinks.toast.convertedTop": "{count} oportunidades criadas",
  "backlinks.category.linkGapTargets": "Destinos para lacunas de ligações",
  "backlinks.category.contentForLinks": "Conteúdos para ligações",
  "backlinks.category.digitalPr": "Relações públicas digitais",
  "backlinks.category.partnerships": "Parcerias e patrocínios",
  "backlinks.category.directories": "Diretórios e perfis",
  "backlinks.category.linkHygiene": "Manutenção de ligações",
  "marketplace.title": "Publicações patrocinadas",
  "marketplace.subtitle":
    "Associe oportunidades de backlinks a colocações patrocinadas transparentes e revistas editorialmente.",
  "marketplace.disclosureTitle": "Marketplace de práticas éticas.",
  "marketplace.disclosure":
    'Cada pedido exige divulgação clara do patrocínio e rel="sponsored". Um pedido não é uma compra e nunca garante classificações, tráfego ou receitas.',
  "marketplace.demoNoticeTitle": "Catálogo de pré-visualização.",
  "marketplace.demoNotice":
    "Os domínios, métricas e preços abaixo são dados de demonstração enquanto o acesso à API Linkhouse está pendente. Os pedidos são guardados apenas no Milo para revisão; não é criada nenhuma encomenda ao fornecedor nem pagamento.",
  "marketplace.demoBadge": "Demonstração",
  "marketplace.integrationTitle": "Integração Linkhouse",
  "marketplace.integrationLive":
    "O catálogo do fornecedor está ligado. Cada encomenda paga continua a exigir confirmação do total exato.",
  "marketplace.integrationPending":
    "O contrato de produção está pronto; o mapeamento de endpoints e as credenciais aguardam a documentação Linkhouse.",
  "marketplace.catalogConnected": "Catálogo real",
  "marketplace.catalogDemo": "Catálogo de demonstração",
  "marketplace.orderingEnabled": "Encomendas ativadas",
  "marketplace.orderingLocked": "Encomendas bloqueadas",
  "marketplace.offers": "Ofertas",
  "marketplace.orders": "Pedidos",
  "marketplace.search": "Pesquisar domínios ou temas…",
  "marketplace.noAnalysis":
    "Execute a inteligência de backlinks para adicionar sinais de lacunas de ligações às correspondências. A correspondência por tema e mercado já está ativa.",
  "marketplace.reason.linkGap": "Lacuna de ligações dos concorrentes",
  "marketplace.rank": "Classificação do domínio",
  "marketplace.traffic": "Tráfego estimado",
  "marketplace.turnaround": "Prazo de entrega",
  "marketplace.days": "{count} dias",
  "marketplace.price": "Preço indicativo",
  "marketplace.request": "Solicitar revisão",
  "marketplace.reviewPrice": "Rever preço",
  "marketplace.quoteLocked": "Configuração de orçamento necessária",
  "marketplace.requested": "Solicitado",
  "marketplace.quoteTitle": "Rever preço de publicação",
  "marketplace.basePrice": "Preço do fornecedor",
  "marketplace.serviceFee": "Taxa de serviço Milo ({count}%)",
  "marketplace.totalPrice": "Total exato",
  "marketplace.quoteExpires":
    "Este orçamento expira às {time}. Após essa hora é necessário um novo orçamento.",
  "marketplace.confirmSponsored":
    'Exijo divulgação clara do patrocínio e rel="sponsored" ou nofollow na ligação.',
  "marketplace.confirmPaymentLive":
    "Autorizo explicitamente uma encomenda ao fornecedor pelo total exato de €{total}.",
  "marketplace.confirmPaymentDemo":
    "Confirmo o pedido de revisão de €{total} e compreendo que o modo de demonstração não cria nenhuma encomenda ao fornecedor nem pagamento.",
  "marketplace.confirmPurchase": "Confirmar encomenda paga",
  "marketplace.confirmDemoRequest": "Guardar pedido de revisão",
  "marketplace.confirmedAt": "Confirmado",
  "marketplace.ordersEmpty": "Ainda não há pedidos de publicação.",
  "marketplace.toast.exists": "Esta oferta já tem um pedido ativo.",
  "marketplace.toast.requested": "Pedido de publicação guardado para revisão.",
  "marketplace.toast.submitted": "Encomenda paga submetida ao fornecedor.",
  "marketplace.toast.catalogError":
    "Não foi possível atualizar o catálogo do fornecedor. O catálogo seguro de demonstração continua disponível.",
  "marketplace.toast.quoteError": "Não foi possível preparar um orçamento. Tente novamente.",
  "marketplace.toast.quoteExpired":
    "O orçamento expirou. Solicite um novo preço antes de confirmar.",
  "marketplace.toast.orderError": "A encomenda não foi criada. Não foi efetuado nenhum pagamento.",
  "marketplace.toast.orderReview":
    "Não foi possível confirmar o resultado do fornecedor. O Milo guardou o pedido como Em revisão; não repita até o resultado ser reconciliado.",
  "marketplace.status.Requested": "Solicitado",
  "marketplace.status.In Review": "Em revisão",
  "marketplace.status.Submitted": "Submetido",
  "marketplace.status.Accepted": "Aceite",
  "marketplace.status.Published": "Publicado",
  "marketplace.status.Failed": "Falhado",
  "marketplace.status.Cancelled": "Cancelado",
  "backlinks.integrity.partial": "Métricas parciais",
  "backlinks.integrity.source":
    "Origem declarada: índice DataForSEO na data da análise guardada, para os domínios apresentados, incluindo subdomínios. As etiquetas de origem nos dados guardados da área de trabalho não são verificação independente. — significa indisponível, nunca zero. A cobertura do índice é incompleta; estas não são verificações dos destinos em tempo real.",
  "backlinks.integrity.legacy":
    "Análise antiga preservada. A normalização anterior podia transformar dados em falta em zeros, pelo que a base numérica está indisponível. As recomendações originais mantêm-se como conselhos históricos.",
  "backlinks.integrity.scores":
    "As pontuações e recomendações são estimativas de IA a partir das evidências disponíveis, não medições do fornecedor, garantias de classificação nem resultados medidos.",
  "backlinks.integrity.sample":
    "Amostra limitada dos principais domínios. Domínios omitidos não provam ligações ausentes ou perdidas; não está estabelecida monitorização contínua.",
  "backlinks.integrity.failed":
    "Pedido falhado. Esta tabela está indisponível; não significa zero backlinks nem ausência de lacunas de ligações.",
  "backlinks.integrity.not_requested":
    "A amostra de lacunas não foi solicitada porque não foram fornecidos domínios de concorrentes.",
  "backlinks.integrity.unknown": "O estado de recolha desta tabela é desconhecido.",
  "backlinks.integrity.empty":
    "Sem linhas para apresentar. Verifique o estado de recolha acima antes de interpretar esta tabela.",
  "backlinkMonitor.website_changed":
    "O site apresentado não corresponde ao projeto guardado. Guarde ou recarregue o projeto antes de recolher dados. Nenhuma recolha foi iniciada.",
  "backlinkMonitor.unavailable":
    "A recolha está indisponível até o estado do fornecedor confirmar uma conta ativa com saldo disponível. O histórico guardado continua acessível.",
  "backlinkMonitor.yes": "Sim",
  "backlinkMonitor.no": "Não",
  "backlinkMonitor.title": "Histórico de backlinks",
  "backlinkMonitor.note":
    "Contagens diárias do índice DataForSEO para o site guardado. Os dados em falta são apresentados como —, nunca zero. Estas observações não verificam colocações individuais de ligações. Cada pedido utiliza o limite configurado do fornecedor. A recolha recorrente é controlada separadamente acima.",
  "backlinkMonitor.from": "De (UTC)",
  "backlinkMonitor.to": "Até (UTC)",
  "backlinkMonitor.subdomains": "Incluir subdomínios",
  "backlinkMonitor.run": "Solicitar contagens diárias",
  "backlinkMonitor.running": "A recolher…",
  "backlinkMonitor.new": "Iniciar outro pedido",
  "backlinkMonitor.refresh": "Atualizar histórico",
  "backlinkMonitor.loading": "A carregar histórico guardado…",
  "backlinkMonitor.empty": "Ainda não há pedidos guardados.",
  "backlinkMonitor.error": "O histórico está indisponível. Tente atualizar.",
  "backlinkMonitor.uncertain":
    "O resultado não está confirmado. Atualize o histórico guardado antes de iniciar outro pedido; isto não significa que o fornecedor não cobrou nada.",
  "backlinkMonitor.stored": "Observação guardada.",
  "backlinkMonitor.existing": "Este pedido já existe. Verifique o estado guardado abaixo.",
  "backlinkMonitor.held":
    "Pedido bloqueado. Verifique o histórico guardado antes de iniciar outro pedido.",
  "backlinkMonitor.reserved": "Reservado",
  "backlinkMonitor.dispatched": "A recolher",
  "backlinkMonitor.succeeded": "Guardado",
  "backlinkMonitor.unknown": "Não confirmado",
  "backlinkMonitor.pending": "Pendente",
  "backlinkMonitor.settled": "Regularizado",
  "backlinkMonitor.recover": "Recuperar contabilização",
  "backlinkMonitor.recovered":
    "Contabilização recuperada a partir do registo guardado do fornecedor.",
  "backlinkMonitor.recoveryFailed":
    "Não foi possível recuperar a contabilização. A observação guardada continua disponível.",
  "backlinkMonitor.date": "Data (UTC)",
  "backlinkMonitor.newLinks": "Novos backlinks",
  "backlinkMonitor.lostLinks": "Backlinks perdidos",
  "backlinkMonitor.newDomains": "Novos domínios de referência",
  "backlinkMonitor.lostDomains": "Domínios de referência perdidos",
  "backlinkMonitor.newMainDomains": "Novos domínios principais de referência",
  "backlinkMonitor.lostMainDomains": "Domínios principais de referência perdidos",
  "backlinkMonitor.reported": "Indicado",
  "backlinkMonitor.partial": "Parcial",
  "backlinkMonitor.missing": "Em falta",
  "backlinkMonitor.accounting": "Contabilização",
  "backlinkMonitor.observed": "Observado",
  "backlinkMonitor.request": "Pedido",
  "backlinkMonitor.invalid":
    "Escolha um intervalo válido de 1–92 dias, que termine no máximo hoje.",
  "backlinkDetails.title": "Evidências de backlinks individuais",
  "backlinkDetails.note":
    "Ligações representativas do índice DataForSEO, até 100 por pedido. As datas da primeira e última observação descrevem o índice; as datas reais de colocação e remoção são desconhecidas. Não é um inventário completo de ligações. Os pedidos consomem o limite configurado do fornecedor.",
  "backlinkDetails.run": "Recolher detalhes de ligações",
  "backlinkDetails.selection": "Seleção de datas",
  "backlinkDetails.first_seen": "Observada pela primeira vez no período",
  "backlinkDetails.lost_last_seen": "Indicada como perdida, última observação no período",
  "backlinkDetails.limit": "Máximo de resultados",
  "backlinkDetails.counts":
    "A mostrar {retained} de {returned} ligações devolvidas; {total} correspondências do fornecedor.",
  "backlinkDetails.partial":
    "Existem mais resultados do fornecedor ou evidências omitidas. Cada página é uma observação separada, e o índice ativo pode mudar entre páginas.",
  "backlinkDetails.noLinks": "Sem ligações preservadas para este pedido.",
  "backlinkDetails.source": "Página de referência",
  "backlinkDetails.target": "Destino",
  "backlinkDetails.anchor": "Texto da âncora",
  "backlinkDetails.first": "Primeira observação (UTC)",
  "backlinkDetails.last": "Última observação (UTC)",
  "backlinkDetails.rank": "Classificação do fornecedor",
  "backlinkDetails.spam": "Pontuação de spam",
  "backlinkDetails.lost": "Indicada como perdida",
  "backlinkDetails.offset": "Ignorar resultados (0–20 000)",
  "backlinkDetails.page":
    "Página {page} · {count} linhas observadas nesta sequência. As contagens podem incluir ligações repetidas e não estabelecem um inventário completo.",
  "backlinkDetails.next": "Recolher página seguinte (utiliza o limite)",
  "backlinkDetails.nextNote":
    "Continue com o mesmo site e filtros. Isto efetua um novo pedido ao fornecedor e utiliza o limite configurado.",
  "backlinkDetails.child":
    "Pedido da página seguinte já criado; atualize o histórico para verificar o resultado",
  "backlinkDetails.pageLimit":
    "O limite de 10 000 páginas desta sequência foi atingido. Podem existir mais correspondências.",
  "backlinkRecurring.title": "Monitorização contínua de backlinks",
  "backlinkRecurring.note":
    "Recolha contagens de backlinks novos e perdidos para este site guardado, diariamente ou semanalmente. Cada execução abrange dias UTC completos do índice DataForSEO. As execuções não realizadas no momento previsto são ignoradas; as observações não verificam colocações individuais nem um inventário completo da Web.",
  "backlinkRecurring.loading": "A carregar definições de monitorização guardadas…",
  "backlinkRecurring.error":
    "As definições de monitorização estão indisponíveis. Recarregue para tentar novamente.",
  "backlinkRecurring.enabled":
    "Monitorização ativada — cada recolha continua a exigir fundos disponíveis no fornecedor.",
  "backlinkRecurring.paused":
    "Monitorização em pausa. Nenhuma nova recolha automática está ativada.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} reservados ou gastos de um limite de {cap} para esta monitorização.",
  "backlinkRecurring.unsettled":
    "Um pedido anterior tem resultado ou custo por resolver. A recolha automática seguinte está bloqueada. Verifique o histórico; os resultados guardados com sucesso podem permitir recuperar a contabilização. Um pedido enviado não é repetido automaticamente.",
  "backlinkRecurring.capHeld":
    "O limite mensal restante é inferior a um pedido completo. A recolha aguarda o próximo mês UTC ou uma alteração guardada do limite.",
  "backlinkRecurring.changedWebsite":
    "O site mudou. Guarde as definições de monitorização para o site atual do projeto guardado, ou recarregue o projeto se o site apresentado estiver desatualizado. Os gastos existentes são preservados.",
  "backlinkRecurring.next":
    "Próxima hora prevista (UTC): {date}. A recolha começa numa verificação posterior do agendador quando as verificações de fundos e conta forem aprovadas.",
  "backlinkRecurring.pause": "Pausar monitorização",
  "backlinkRecurring.unavailable":
    "A recolha do fornecedor está atualmente indisponível. Pode pausar a monitorização e ver o histórico guardado. A ativação exige uma conta de fornecedor ativa confirmada com saldo disponível.",
  "backlinkRecurring.settings": "Definições de monitorização",
  "backlinkRecurring.enable": "Ativar recolha automática",
  "backlinkRecurring.cadence": "Frequência",
  "backlinkRecurring.daily": "Diária",
  "backlinkRecurring.weekly": "Semanal",
  "backlinkRecurring.days": "Dias UTC completos por execução",
  "backlinkRecurring.cap": "Limite mensal do fornecedor (USD)",
  "backlinkRecurring.save": "Guardar definições de monitorização",
  "backlinkRecurring.allowance":
    "Este limite aplica-se apenas a esta monitorização; guardá-lo não adiciona fundos à conta. Introduza 0–100 USD com até seis casas decimais. A ativação exige pelo menos 0.024 USD mais 0.000036 USD por dia no intervalo. Também se aplicam os limites da conta e os limites partilhados do fornecedor. Pausar impede novos envios; uma recolha já admitida pode ainda terminar e incorrer no custo reservado.",
  "backlinkRecurring.invalid":
    "Introduza 1–92 dias inteiros e um limite USD válido. O limite ativado tem de cobrir pelo menos um pedido completo.",
  "backlinkRecurring.saved": "Definições de monitorização guardadas.",
  "backlinkRecurring.uncertain":
    "A gravação não está confirmada. Recarregue as definições guardadas antes de fazer outra alteração; a alteração anterior pode já ter sido guardada.",
  "backlinkRecurring.refresh": "Recarregar definições guardadas (descartar alterações)",
  "backlinkRecurring.history": "Ver pedidos guardados e contabilização abaixo",
  "backlinkRecurring.scheduled": "Execução agendada",
  "backlinkRecurring.manual": "Pedido manual",
  "backlinkRecurring.occurrence": "Ocorrência agendada (UTC)",
  "backlinkRecurring.undispatched":
    "Este pedido agendado não foi admitido pelo fornecedor. O montante reservado do limite de monitorização é libertado.",
};
