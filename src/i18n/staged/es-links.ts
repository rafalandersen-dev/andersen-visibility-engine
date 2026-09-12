/** Spanish authoring only; not registered in the runtime or language picker. */
export const esLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Red de crecimiento de enlaces",
  "linknet.subtitle":
    "Encuentra sitios relevantes de la red Milo, envía una presentación personal y deja que Milo verifique si el enlace está realmente publicado.",
  "linknet.policyNote":
    "La relevancia es lo primero: las coincidencias requieren temas compartidos, los intercambios directos de enlaces se señalan y no se coloca nada automáticamente. Estas comprobaciones no garantizan el cumplimiento de las políticas de los buscadores.",
  "linknet.topics": "Temas",
  "linknet.topicsPlaceholder": "Temas (separados por comas)",
  "linknet.contact": "Correo de contacto",
  "linknet.contactPlaceholder": "Correo de contacto para socios",
  "linknet.join": "Unirse a la red",
  "linknet.update": "Actualizar ficha",
  "linknet.pause": "Pausar",
  "linknet.joined": "Ficha publicada; los socios ya pueden encontrar este sitio.",
  "linknet.paused": "Ficha pausada.",
  "linknet.find": "Encontrar socios",
  "linknet.noMatches":
    "Todavía no hay socios relevantes; la red crece con cada sitio de Milo que se une.",
  "linknet.score": "Coincidencia",
  "linknet.copyIntro": "Copiar correo de presentación",
  "linknet.introCopied": "Presentación copiada; pégala en tu correo.",
  "linknet.markContacted": "Marcar contacto realizado",
  "linknet.markAgreed": "Marcar acuerdo alcanzado",
  "linknet.decline": "Rechazar",
  "linknet.targetUrlPlaceholder": "URL de la página acordada (donde estará el enlace)",
  "linknet.verify": "Verificar enlace",
  "linknet.verified": "Enlace encontrado; la colocación está publicada y verificada.",
  "linknet.notFound":
    "Todavía no se ha encontrado ningún enlace en esa página; comprobado y registrado.",
  "linknet.liveSince": "Publicado desde",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Última comprobación: enlace no encontrado",
  "linknet.reciprocalWarn":
    "Esto crearía un intercambio directo de enlaces con este sitio. Revisa su relevancia y evita los intercambios excesivos.",
  "linknet.status.suggested": "Sugerido",
  "linknet.status.contacted": "Contacto realizado",
  "linknet.status.agreed": "Acordado",
  "linknet.status.live_verified": "Publicado ✓",
  "linknet.status.declined": "Rechazado",
  "backlinks.title": "Backlinks",
  "backlinks.subtitle":
    "Datos reales de enlaces entrantes de tu dominio: solidez del perfil, carencias de enlaces frente a competidores y recomendaciones seguras para conseguir enlaces.",
  "backlinks.disclaimer":
    "Las métricas de enlaces entrantes proceden de un índice externo y son estimaciones; ningún índice ve todos los enlaces. Las recomendaciones son solo sugerencias de prácticas legítimas: Milo nunca propone esquemas de enlaces ni enlaces pagados sin identificar, y no garantiza posiciones, tráfico ni ingresos.",
  "backlinks.run": "Ejecutar análisis de enlaces entrantes",
  "backlinks.rerun": "Actualizar análisis",
  "backlinks.running": "Analizando…",
  "backlinks.empty":
    "Ejecuta un análisis de enlaces entrantes para ver el perfil real de enlaces de tu dominio, cómo se compara con los competidores y qué dominios los enlazan a ellos pero no a ti.",
  "backlinks.notConfigured.title": "Conectar una fuente de datos de enlaces entrantes",
  "backlinks.notConfigured.body":
    "Este módulo usa el índice de enlaces entrantes de DataForSEO y aún no está conectado. El propietario del espacio de trabajo debe crear una cuenta de DataForSEO (pago por uso) y añadir DATAFORSEO_LOGIN y DATAFORSEO_PASSWORD como secretos del backend. Hasta entonces, los datos de enlaces entrantes no están disponibles.",
  "backlinks.status.ready.title": "DataForSEO operativo",
  "backlinks.status.ready.body": "La API de Backlinks está conectada y responde.",
  "backlinks.status.lowBalance.title": "El saldo de DataForSEO se está agotando",
  "backlinks.status.lowBalance.body": "Recarga pronto para evitar interrupciones en los análisis.",
  "backlinks.status.paused.title": "El acceso a DataForSEO está pausado",
  "backlinks.status.paused.body":
    "Contacta con soporte de DataForSEO para reactivar la cuenta antes de ejecutar otro análisis.",
  "backlinks.status.error.title": "Estado de DataForSEO no disponible",
  "backlinks.status.error.body":
    "No se ha podido verificar la cuenta o la API de Backlinks. Actualiza el estado o consulta el panel del proveedor.",
  "backlinks.status.balance": "Saldo: {balance}.",
  "backlinks.status.refresh": "Actualizar estado",
  "backlinks.competitorsUsed": "Competidores comparados: {list}",
  "backlinks.competitorsFromAnalysis":
    "Se usan los competidores del último análisis de Competidores: {list}",
  "backlinks.noCompetitors":
    "Este proyecto no tiene URL de competidores; el análisis solo cubrirá tu propio perfil. Añade competidores en Configuración del proyecto o en el módulo Competidores para habilitar el análisis de carencias de enlaces.",
  "backlinks.lastRun": "Último análisis: {date}",
  "backlinks.score.overall": "Posición de enlaces",
  "backlinks.score.profile": "Solidez del perfil",
  "backlinks.score.gap": "Carencia frente a competidores",
  "backlinks.score.quality": "Calidad de enlaces",
  "backlinks.gapHint": "más alto = más potencial de mejora",
  "backlinks.summaryHeading": "Resumen",
  "backlinks.topActions": "Principales acciones sobre enlaces",
  "backlinks.profileTable": "Tu dominio frente a competidores",
  "backlinks.table.domain": "Dominio",
  "backlinks.table.rank": "Rango del dominio",
  "backlinks.table.backlinks": "Enlaces entrantes",
  "backlinks.table.referringDomains": "Dominios de referencia",
  "backlinks.table.broken": "Rotos",
  "backlinks.table.spam": "Puntuación de spam",
  "backlinks.table.notFetched": "No se han podido obtener los datos",
  "backlinks.you": "Tú",
  "backlinks.gapHeading": "Carencia de enlaces: enlazan a competidores, no a ti",
  "backlinks.gapNote":
    "Muestra del índice del proveedor solicitada excluyendo tu dominio. Esto no verifica de forma independiente que estos sitios no tengan enlaces hacia ti.",
  "backlinks.gap.linksTo": "Enlaza a",
  "backlinks.gapEmpty":
    "No se han encontrado carencias de enlaces; no se han obtenido competidores o no había coincidencias.",
  "backlinks.referringHeading": "Principales dominios de referencia que te enlazan",
  "backlinks.referringEmpty":
    "Todavía no se han encontrado dominios de referencia en el índice; un dominio nuevo suele empezar en cero.",
  "backlinks.recommendations": "Recomendaciones",
  "backlinks.effort": "Esfuerzo",
  "backlinks.target": "Destino / plataforma",
  "backlinks.approach": "Enfoque",
  "backlinks.action.convert": "Crear oportunidad",
  "backlinks.action.converted": "Oportunidad creada",
  "backlinks.action.convertTop": "Convertir las principales recomendaciones",
  "backlinks.toast.done": "Análisis de enlaces entrantes completado",
  "backlinks.toast.converted": "Oportunidad creada",
  "backlinks.toast.convertedTop": "{count} oportunidades creadas",
  "backlinks.category.linkGapTargets": "Objetivos de carencias de enlaces",
  "backlinks.category.contentForLinks": "Contenido para conseguir enlaces",
  "backlinks.category.digitalPr": "Relaciones públicas digitales",
  "backlinks.category.partnerships": "Colaboraciones y patrocinios",
  "backlinks.category.directories": "Directorios y perfiles",
  "backlinks.category.linkHygiene": "Mantenimiento de enlaces",
  "backlinks.integrity.partial": "Métricas parciales",
  "backlinks.integrity.source":
    "Origen declarado: índice de DataForSEO en la fecha del análisis guardado, para los dominios mostrados, incluidos los subdominios. Las etiquetas de origen en los datos guardados del espacio de trabajo no son una verificación independiente. — significa no disponible, nunca cero. La cobertura del índice es incompleta; no son comprobaciones de destinos en tiempo real.",
  "backlinks.integrity.legacy":
    "Se conserva el análisis anterior. La normalización previa podía convertir datos ausentes en ceros, por lo que su base numérica no está disponible. Las recomendaciones originales se conservan como consejos históricos.",
  "backlinks.integrity.scores":
    "Las puntuaciones y recomendaciones son estimaciones de IA basadas en las pruebas disponibles, no mediciones del proveedor, garantías de posicionamiento ni resultados medidos.",
  "backlinks.integrity.sample":
    "Muestra limitada de dominios principales. Los dominios omitidos no demuestran enlaces ausentes o perdidos; no se acredita un seguimiento continuo.",
  "backlinks.integrity.failed":
    "La solicitud ha fallado. Esta tabla no está disponible; no significa cero enlaces entrantes ni ausencia de carencias de enlaces.",
  "backlinks.integrity.not_requested":
    "No se ha solicitado una muestra de carencias porque no se han proporcionado dominios de competidores.",
  "backlinks.integrity.unknown": "Se desconoce el estado de recopilación de la tabla.",
  "backlinks.integrity.empty":
    "No hay filas que mostrar. Comprueba el estado de recopilación de arriba antes de interpretar esta tabla.",
  "marketplace.title": "Publicaciones patrocinadas",
  "marketplace.subtitle":
    "Relaciona oportunidades de enlaces entrantes con publicaciones patrocinadas transparentes y revisadas editorialmente.",
  "marketplace.disclosureTitle": "Marketplace de prácticas legítimas.",
  "marketplace.disclosure":
    'Cada solicitud requiere identificar claramente el patrocinio y usar rel="sponsored". Una solicitud no es una compra y nunca garantiza posiciones, tráfico ni ingresos.',
  "marketplace.demoNoticeTitle": "Catálogo de vista previa.",
  "marketplace.demoNotice":
    "Los dominios, métricas y precios de abajo son datos de demostración mientras se espera el acceso a la API de Linkhouse. Las solicitudes se guardan solo en Milo para revisión; no se crea ningún pedido al proveedor ni pago.",
  "marketplace.demoBadge": "Demostración",
  "marketplace.integrationTitle": "Integración con Linkhouse",
  "marketplace.integrationLive":
    "El catálogo del proveedor está conectado. Cada pedido de pago sigue requiriendo confirmar el total exacto.",
  "marketplace.integrationPending":
    "El contrato de producción está preparado; la correspondencia de endpoints y las credenciales están pendientes de la documentación de Linkhouse.",
  "marketplace.catalogConnected": "Catálogo real",
  "marketplace.catalogDemo": "Catálogo de demostración",
  "marketplace.orderingEnabled": "Pedidos habilitados",
  "marketplace.orderingLocked": "Pedidos bloqueados",
  "marketplace.offers": "Ofertas",
  "marketplace.orders": "Solicitudes",
  "marketplace.search": "Buscar dominios o temas…",
  "marketplace.noAnalysis":
    "Ejecuta inteligencia de enlaces entrantes para añadir señales de carencias de enlaces a las coincidencias. La coincidencia por tema y mercado ya está activa.",
  "marketplace.reason.linkGap": "Carencia de enlaces frente a competidores",
  "marketplace.rank": "Rango del dominio",
  "marketplace.traffic": "Tráfico estimado",
  "marketplace.turnaround": "Plazo de entrega",
  "marketplace.days": "{count} días",
  "marketplace.price": "Precio orientativo",
  "marketplace.request": "Solicitar revisión",
  "marketplace.reviewPrice": "Revisar precio",
  "marketplace.quoteLocked": "Es necesario configurar los presupuestos",
  "marketplace.requested": "Solicitado",
  "marketplace.quoteTitle": "Revisar precio de publicación",
  "marketplace.basePrice": "Precio del proveedor",
  "marketplace.serviceFee": "Comisión de servicio de Milo ({count}%)",
  "marketplace.totalPrice": "Total exacto",
  "marketplace.quoteExpires":
    "Este presupuesto caduca a las {time}. Después se necesita un nuevo presupuesto.",
  "marketplace.confirmSponsored":
    'Exijo identificar claramente el patrocinio y usar rel="sponsored" o nofollow en el enlace.',
  "marketplace.confirmPaymentLive":
    "Autorizo expresamente un pedido al proveedor por el total exacto de {total} €.",
  "marketplace.confirmPaymentDemo":
    "Confirmo la solicitud de revisión de {total} € y entiendo que el modo de demostración no crea ningún pedido al proveedor ni pago.",
  "marketplace.confirmPurchase": "Confirmar pedido de pago",
  "marketplace.confirmDemoRequest": "Guardar solicitud de revisión",
  "marketplace.confirmedAt": "Confirmado",
  "marketplace.ordersEmpty": "Todavía no hay solicitudes de publicación.",
  "marketplace.toast.exists": "Esta oferta ya tiene una solicitud activa.",
  "marketplace.toast.requested": "Solicitud de publicación guardada para revisión.",
  "marketplace.toast.submitted": "Pedido de pago enviado al proveedor.",
  "marketplace.toast.catalogError":
    "No se ha podido actualizar el catálogo del proveedor. El catálogo seguro de demostración sigue disponible.",
  "marketplace.toast.quoteError": "No se ha podido preparar un presupuesto. Inténtalo de nuevo.",
  "marketplace.toast.quoteExpired":
    "El presupuesto ha caducado. Solicita un nuevo precio antes de confirmar.",
  "marketplace.toast.orderError": "No se ha creado el pedido. No se ha realizado ningún pago.",
  "marketplace.toast.orderReview":
    "No se ha podido confirmar el resultado del proveedor. Milo ha guardado la solicitud como En revisión; no reintentes hasta que se haya conciliado.",
  "marketplace.status.Requested": "Solicitado",
  "marketplace.status.In Review": "En revisión",
  "marketplace.status.Submitted": "Enviado",
  "marketplace.status.Accepted": "Aceptado",
  "marketplace.status.Published": "Publicado",
  "marketplace.status.Failed": "Fallido",
  "marketplace.status.Cancelled": "Cancelado",
  "backlinkMonitor.website_changed":
    "La web mostrada no coincide con el proyecto guardado. Guarda o recarga el proyecto antes de recopilar datos. No se ha iniciado ninguna recopilación.",
  "backlinkMonitor.unavailable":
    "La recopilación no está disponible hasta que el estado del proveedor confirme una cuenta activa con saldo disponible. El historial guardado sigue accesible.",
  "backlinkMonitor.yes": "Sí",
  "backlinkMonitor.no": "No",
  "backlinkMonitor.title": "Historial de enlaces entrantes",
  "backlinkMonitor.note":
    "Recuentos diarios del índice de DataForSEO para la web guardada. Los datos ausentes se muestran como —, nunca como cero. Estas observaciones no verifican colocaciones individuales de enlaces. Cada solicitud usa la asignación configurada del proveedor. La recopilación recurrente se controla por separado arriba.",
  "backlinkMonitor.from": "Desde (UTC)",
  "backlinkMonitor.to": "Hasta (UTC)",
  "backlinkMonitor.subdomains": "Incluir subdominios",
  "backlinkMonitor.run": "Solicitar recuentos diarios",
  "backlinkMonitor.running": "Recopilando…",
  "backlinkMonitor.new": "Iniciar otra solicitud",
  "backlinkMonitor.refresh": "Actualizar historial",
  "backlinkMonitor.loading": "Cargando historial guardado…",
  "backlinkMonitor.empty": "Todavía no hay solicitudes guardadas.",
  "backlinkMonitor.error": "El historial no está disponible. Prueba a actualizarlo.",
  "backlinkMonitor.uncertain":
    "El resultado no está confirmado. Actualiza el historial guardado antes de iniciar otra solicitud; esto no significa que el proveedor no haya cobrado nada.",
  "backlinkMonitor.stored": "Observación guardada.",
  "backlinkMonitor.existing": "Esta solicitud ya existe. Comprueba su estado guardado abajo.",
  "backlinkMonitor.held":
    "Solicitud retenida. Comprueba el historial guardado antes de iniciar otra solicitud.",
  "backlinkMonitor.reserved": "Reservada",
  "backlinkMonitor.dispatched": "Recopilando",
  "backlinkMonitor.succeeded": "Guardada",
  "backlinkMonitor.unknown": "Sin confirmar",
  "backlinkMonitor.pending": "Pendiente",
  "backlinkMonitor.settled": "Liquidada",
  "backlinkMonitor.recover": "Recuperar contabilidad",
  "backlinkMonitor.recovered": "Contabilidad recuperada del registro guardado del proveedor.",
  "backlinkMonitor.recoveryFailed":
    "No se ha podido recuperar la contabilidad. La observación guardada sigue disponible.",
  "backlinkMonitor.date": "Fecha (UTC)",
  "backlinkMonitor.newLinks": "Nuevos enlaces entrantes",
  "backlinkMonitor.lostLinks": "Enlaces entrantes perdidos",
  "backlinkMonitor.newDomains": "Nuevos dominios de referencia",
  "backlinkMonitor.lostDomains": "Dominios de referencia perdidos",
  "backlinkMonitor.newMainDomains": "Nuevos dominios principales de referencia",
  "backlinkMonitor.lostMainDomains": "Dominios principales de referencia perdidos",
  "backlinkMonitor.reported": "Notificado",
  "backlinkMonitor.partial": "Parcial",
  "backlinkMonitor.missing": "Ausente",
  "backlinkMonitor.accounting": "Contabilidad",
  "backlinkMonitor.observed": "Observado",
  "backlinkMonitor.request": "Solicitud",
  "backlinkMonitor.invalid": "Elige un intervalo válido de 1–92 días que termine como máximo hoy.",
  "backlinkDetails.title": "Pruebas de enlaces entrantes individuales",
  "backlinkDetails.note":
    "Enlaces representativos del índice de DataForSEO, hasta 100 por solicitud. Las fechas de primera y última detección describen el índice; las fechas reales de colocación y retirada se desconocen. No es un inventario completo de enlaces. Las solicitudes consumen la asignación configurada del proveedor.",
  "backlinkDetails.run": "Recopilar detalles de enlaces",
  "backlinkDetails.selection": "Selección de fechas",
  "backlinkDetails.first_seen": "Detectado por primera vez en el periodo",
  "backlinkDetails.lost_last_seen":
    "Notificado como perdido y detectado por última vez en el periodo",
  "backlinkDetails.limit": "Máximo de resultados",
  "backlinkDetails.counts":
    "Se muestran {retained} de los {returned} enlaces devueltos; {total} coincidencias del proveedor.",
  "backlinkDetails.partial":
    "Existen más resultados del proveedor o pruebas omitidas. Cada página es una observación independiente y el índice activo puede cambiar entre páginas.",
  "backlinkDetails.noLinks": "No hay enlaces conservados para esta solicitud.",
  "backlinkDetails.source": "Página de referencia",
  "backlinkDetails.target": "Destino",
  "backlinkDetails.anchor": "Texto del enlace",
  "backlinkDetails.first": "Primera detección (UTC)",
  "backlinkDetails.last": "Última detección (UTC)",
  "backlinkDetails.rank": "Rango del proveedor",
  "backlinkDetails.spam": "Puntuación de spam",
  "backlinkDetails.lost": "Notificado como perdido",
  "backlinkDetails.offset": "Omitir resultados (0–20.000)",
  "backlinkDetails.page":
    "Página {page} · {count} filas observadas en esta secuencia. Los recuentos pueden incluir enlaces repetidos y no acreditan un inventario completo.",
  "backlinkDetails.next": "Recopilar página siguiente (usa asignación)",
  "backlinkDetails.nextNote":
    "Continúa con la misma web y los mismos filtros. Esto realiza una nueva solicitud al proveedor y usa la asignación configurada.",
  "backlinkDetails.child":
    "La solicitud de página siguiente ya está creada; actualiza el historial para comprobar su resultado",
  "backlinkDetails.pageLimit":
    "Se ha alcanzado el límite de 10.000 páginas para esta secuencia. Puede haber más coincidencias.",
  "backlinkRecurring.title": "Seguimiento continuo de enlaces entrantes",
  "backlinkRecurring.note":
    "Recopila a diario o semanalmente recuentos de enlaces entrantes nuevos y perdidos para esta web guardada. Cada ejecución cubre días UTC completos del índice de DataForSEO. Se omiten las ejecuciones perdidas; las observaciones no verifican colocaciones individuales ni un inventario completo de la web.",
  "backlinkRecurring.loading": "Cargando ajustes de seguimiento guardados…",
  "backlinkRecurring.error":
    "Los ajustes de seguimiento no están disponibles. Recarga para volver a intentarlo.",
  "backlinkRecurring.enabled":
    "Seguimiento habilitado; cada recopilación sigue necesitando fondos disponibles del proveedor.",
  "backlinkRecurring.paused":
    "Seguimiento pausado. No se habilita ninguna nueva recopilación automática.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} reservados o gastados de {cap} para este seguimiento.",
  "backlinkRecurring.unsettled":
    "Una solicitud anterior tiene un resultado o coste sin resolver. Se retiene la recopilación automática posterior. Comprueba el historial; los resultados correctos guardados pueden ofrecer recuperación contable. Una solicitud enviada no se repite automáticamente.",
  "backlinkRecurring.capHeld":
    "El límite mensual restante es inferior a una solicitud completa. La recopilación espera al próximo mes UTC o a un cambio guardado del límite.",
  "backlinkRecurring.changedWebsite":
    "La web ha cambiado. Guarda los ajustes de seguimiento para la web del proyecto guardado actual o recarga el proyecto si la web mostrada está desactualizada. Se conserva el gasto existente.",
  "backlinkRecurring.next":
    "Próxima fecha prevista (UTC): {date}. La recopilación comienza en una comprobación posterior del programador cuando se superan las comprobaciones de fondos y cuenta.",
  "backlinkRecurring.pause": "Pausar seguimiento",
  "backlinkRecurring.unavailable":
    "La recopilación del proveedor no está disponible actualmente. Puedes pausar el seguimiento y ver el historial guardado. Habilitarlo requiere una cuenta del proveedor confirmada como activa y con saldo disponible.",
  "backlinkRecurring.settings": "Ajustes de seguimiento",
  "backlinkRecurring.enable": "Habilitar recopilación automática",
  "backlinkRecurring.cadence": "Frecuencia",
  "backlinkRecurring.daily": "Diaria",
  "backlinkRecurring.weekly": "Semanal",
  "backlinkRecurring.days": "Días UTC completos por ejecución",
  "backlinkRecurring.cap": "Límite mensual del proveedor (USD)",
  "backlinkRecurring.save": "Guardar ajustes de seguimiento",
  "backlinkRecurring.allowance":
    "Este límite se aplica solo a este seguimiento; guardarlo no añade fondos a la cuenta. Introduce entre 0 y 100 USD con hasta seis decimales. Para habilitarlo se necesitan al menos 0,024 USD más 0,000036 USD por día del intervalo. También se aplican los límites de la cuenta y los límites compartidos del proveedor. Pausar detiene los nuevos envíos; una recopilación ya admitida puede terminar y generar su coste reservado.",
  "backlinkRecurring.invalid":
    "Introduce entre 1 y 92 días enteros y un límite válido en USD. El límite habilitado debe cubrir al menos una solicitud completa.",
  "backlinkRecurring.saved": "Ajustes de seguimiento guardados.",
  "backlinkRecurring.uncertain":
    "No se ha confirmado el guardado. Recarga los ajustes guardados antes de hacer otro cambio; el cambio anterior podría haberse guardado ya.",
  "backlinkRecurring.refresh": "Recargar ajustes guardados (descartar cambios)",
  "backlinkRecurring.history": "Ver solicitudes guardadas y contabilidad abajo",
  "backlinkRecurring.scheduled": "Ejecución programada",
  "backlinkRecurring.manual": "Solicitud manual",
  "backlinkRecurring.occurrence": "Ocurrencia programada (UTC)",
  "backlinkRecurring.undispatched":
    "Esta solicitud programada no se admitió para su envío al proveedor. Se libera su asignación de seguimiento.",
};
