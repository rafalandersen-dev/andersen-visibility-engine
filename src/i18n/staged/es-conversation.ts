import type { ConversationCopy } from "../conversation";
export const esConversation: ConversationCopy = {
  "chat.account.title": "Tus conversaciones",
  "chat.account.description":
    "Todas las conversaciones privadas con Milo que has iniciado, en todos los proyectos. Solo tú puedes ver esta lista.",
  "chat.account.manage": "Gestionar todas las conversaciones",
  "chat.account.error":
    "No se pudieron confirmar tus conversaciones. Los títulos siguen ocultos hasta que se vuelvan a comprobar.",
  "chat.account.retry": "Volver a comprobar",
  "chat.account.empty": "No tienes conversaciones guardadas.",
  "chat.account.more": "Mostrar más conversaciones",
  "chat.account.started": "Iniciada: {date}",
  "chat.account.unavailable":
    "El acceso al proyecto ha terminado, por lo que el título y los mensajes siguen ocultos. Aún puedes eliminar esta conversación.",
  "chat.account.eraseAccess": "Eliminarla no restablece ni cambia tu acceso al proyecto.",
  "chat.export": "Exportar conversación",
  "chat.exportHelp":
    "Descarga mensajes, comprobantes y propuestas históricas en un archivo JSON. Los archivos vinculados son independientes.",
  "chat.exporting": "Preparando la conversación completa…",
  "chat.exportFailed":
    "No se pudo completar la exportación. Espera a que termine el trabajo en curso e inténtalo de nuevo.",
  "chat.erase": "Eliminar conversación",
  "chat.eraseTitle": "¿Eliminar esta conversación permanentemente?",
  "chat.eraseHelp":
    "Elimina mensajes y propuestas permanentemente. Los borradores, resultados y registros de facturación se conservan. El trabajo ya enviado puede completarse y consumir tu cuota. Se conservan los registros que evitan trabajo duplicado.",
  "chat.erasing": "Eliminando conversación…",
  "chat.eraseUnconfirmed":
    "No se pudo confirmar la eliminación. Los mensajes siguen ocultos aquí. Reintenta la eliminación para confirmar el resultado.",
  "chat.eraseRetry": "Reintentar eliminación",
  "chat.erased": "Conversación eliminada.",
  "chat.tool.draft_metadata_proposal": "Propuesta de metadatos del borrador",
  "chat.proposal.review": "Revisar los cambios propuestos",
  "chat.proposal.before": "Antes",
  "chat.proposal.after": "Propuesta",
  "chat.proposal.ready":
    "Al guardar, el borrador vuelve a revisión y se retira su aprobación de publicación anterior.",
  "chat.proposal.waiting":
    "Espera a que termine esta tarea antes de guardar los cambios propuestos.",
  "chat.proposal.unavailable":
    "Esta propuesta ya no se puede guardar. Pide una nueva basada en el borrador actual.",
  "chat.proposal.applied":
    "Estos cambios se guardaron. Las ediciones posteriores pueden haber modificado el contenido.",
  "chat.proposal.unconfirmed":
    "No se pudo confirmar el guardado. Comprueba el estado guardado antes de volver a intentarlo.",
  "chat.proposal.empty": "(vacío)",
  "chat.title": "Habla con Milo",
  "chat.openContext": "Abrir la vista del proyecto",
  "chat.description":
    "Dile a Milo qué quieres mejorar. El especialista de IA adecuado continúa aquí con el contexto guardado de tu proyecto.",
  "chat.chooseProject": "Cliente o proyecto",
  "chat.ownProjects": "Tus proyectos",
  "chat.history": "Conversaciones",
  "chat.new": "Nueva conversación",
  "chat.welcome": "¿En qué vamos a trabajar?",
  "chat.private": "Tu conversación privada en este proyecto.",
  "chat.sharedPrivate":
    "Tu conversación privada en un proyecto compartido. Se aplican tus permisos actuales del equipo.",
  "chat.reviewPrompt": "Revisa la estructura SEO de mis borradores guardados.",
  "chat.knowledgePrompt": "¿Qué puedes decirme a partir del contexto guardado de este proyecto?",
  "chat.messageFor": "Mensaje para {project}",
  "chat.placeholder": "Describe la tarea y el resultado que necesitas…",
  "chat.keyboard": "Ctrl / ⌘ + Intro para enviar. Intro inicia una línea nueva.",
  "chat.tooLong": "Este mensaje es demasiado largo. Acórtalo antes de enviarlo.",
  "chat.full": "Esta conversación ha alcanzado su límite. Inicia una nueva para continuar.",
  "chat.allowGeneration":
    "Permitir un borrador para un tema existente en esta solicitud. Consume la cuota de contenido y guarda el resultado para su revisión.",
  "chat.generationEnabled": "Generación de un borrador permitida para esta solicitud.",
  "chat.usage":
    "Las respuestas consumen la cuota de IA de tu cuenta. La generación de borradores también consume la cuota de contenido. La publicación es un paso independiente.",
  "chat.send": "Enviar mensaje",
  "chat.you": "Tú",
  "chat.messages": "Mensajes de la conversación",
  "chat.page": "Tareas {from}–{to} de {total}",
  "chat.latest": "Últimos mensajes",
  "chat.sending": "Enviando y comprobando el estado guardado…",
  "chat.pending": "Solicitud guardada; pendiente de inicio.",
  "chat.running": "Trabajando en tu solicitud…",
  "chat.completed": "Respuesta guardada.",
  "chat.failed":
    "Este intento se ha detenido. Revisa el trabajo guardado antes de enviar otra solicitud.",
  "chat.unknown":
    "No se ha podido confirmar el resultado final. Comprueba los resultados guardados antes de empezar de nuevo.",
  "chat.cancelled":
    "Se ha cancelado el trabajo posterior. Una operación ya enviada aún puede finalizar.",
  "chat.provider_unavailable":
    "El proveedor de IA no está configurado para esta cuenta. Contacta con tu administrador.",
  "chat.usage_limit":
    "La cuota de IA de tu cuenta no permite otro paso. Comprueba el uso antes de continuar.",
  "chat.budget_unavailable":
    "El gasto en IA no está disponible con la configuración presupuestaria actual. Pide a tu administrador que la revise.",
  "chat.unavailable":
    "No se ha podido confirmar el acceso o el estado guardado de la conversación. Actualiza antes de continuar.",
  "chat.sendUnconfirmed":
    "No se ha podido confirmar esta solicitud. Recupera la solicitud original o consulta el historial antes de enviarla como una tarea nueva.",
  "chat.recover": "Recuperar solicitud original",
  "chat.resume": "Iniciar solicitud guardada",
  "chat.stop": "Detener el trabajo posterior",
  "chat.stopHelp":
    "Detener impide los pasos posteriores. Una solicitud ya enviada aún puede finalizar y consumir tu cuota.",
  "chat.evidenceSaved": "Resultado guardado en esta conversación.",
  "chat.toolUnavailable": "Esta operación no está disponible con el rol o los permisos actuales.",
  "chat.partialHistory":
    "El especialista ha recibido una parte abreviada del historial guardado. Repite cualquier requisito que falte.",
  "chat.tool.project_brief": "Contexto del proyecto",
  "chat.tool.draft_read": "Revisión del borrador guardado",
  "chat.tool.draft_seo_review": "Comprobación de la estructura del borrador guardado",
  "chat.tool.project_knowledge": "Conocimiento del proyecto",
  "chat.tool.weekly_preparation": "Estado de la preparación semanal",
  "chat.tool.saved_audit": "Revisión de la auditoría guardada",
  "chat.tool.draft_generation": "Generación del borrador",
  "chat.tool.technical_evidence": "Comprobaciones técnicas guardadas",
  "chat.tool.visibility_evidence": "Evidencias guardadas de respuestas de IA y registros",
  "chat.tool.authority_evidence": "Seguimiento guardado de enlaces entrantes",
  "chat.tool.google_index_inspection": "Inspección del índice de Google",
  "chat.tool.performance_test": "Prueba de velocidad de la página",
  "chat.tool.site_crawl": "Rastreo del sitio",
  "chat.allowProviderChecks":
    "Permite hasta dos comprobaciones del sitio en esta solicitud (inspección del índice de Google, velocidad de la página o un rastreo del sitio) para el sitio web de este proyecto. Usa los servicios conectados del propietario del proyecto y los límites de comprobación existentes, y guarda los resultados con las comprobaciones técnicas del proyecto.",
  "chat.providerChecksEnabled": "Comprobaciones del sitio permitidas para esta solicitud.",
};
