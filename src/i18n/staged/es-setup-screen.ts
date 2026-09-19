/** Spanish authoring only; not registered in the runtime or language picker. */
export const esSetupScreen: Readonly<Record<string, string>> = {
  "setupScreen.invalidUrl": "{field} debe empezar por http:// o https://",
  "setupScreen.missing": "Completa los campos obligatorios: {fields}",
  "setupScreen.additional": "Idiomas adicionales del contenido",
  "setupScreen.sellingPoints": "Propuestas de valor únicas",
  "setupScreen.publishing": "Publicación",
  "setupScreen.mode": "Modo de publicación",
  "setupScreen.mode.draft": "Solo borrador",
  "setupScreen.mode.manual": "Publicación manual en el sitio",
  "setupScreen.endpoint": "Endpoint de entrega de borradores",
  "setupScreen.liveEndpoint": "Endpoint de publicación en el sitio",
  "setupScreen.liveHelp":
    "Un endpoint independiente para publicar un borrador revisado. Utiliza el mismo secreto de publicación.",
  "setupScreen.secret": "Secreto de publicación",
  "setupScreen.secretHelp":
    "El servidor guarda los nuevos secretos y los envía al destino configurado en una cabecera de la solicitud. Configura el mismo secreto en ese destino.",
  "setupScreen.destination": "Destino predeterminado",
  "setupScreen.faq": "Sección de preguntas frecuentes",
  "setupScreen.approvalHelp":
    "Aprobar un artículo lo marca como listo. Publicarlo requiere otra acción: publicarlo ahora o programar una hora de publicación. Revisa el contenido y las afirmaciones antes de publicarlo.",
  "setupScreen.disclaimer": "Aviso sobre contenido de IA",
  "setupScreen.retiredTitle": "Se ha eliminado la publicación automática al aprobar.",
  "setupScreen.retiredHelp":
    "Este proyecto ahora utiliza {mode}. La aprobación marca un artículo como listo; la publicación sigue requiriendo una acción o programación aparte. Los artículos aprobados anteriormente pueden seguir siendo borradores. Comprueba su estado antes de programar nuevos trabajos.",
  "setupScreen.saving": "Guardando…",
  "setupScreen.save": "Guardar configuración de publicación",
  "setupScreen.saved": "Configuración de publicación guardada",
  "setupScreen.failed": "No se ha podido guardar la configuración de publicación",
  "setupScreen.tagsExample": "seo, crecimiento",
};
