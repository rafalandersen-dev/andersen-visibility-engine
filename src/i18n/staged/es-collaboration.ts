/** Spanish authoring only; not registered in the runtime or language picker. */
export const esCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Trabajo actual del proyecto",
  "awareness.help":
    "Solo dentro de la aplicación. Estas comprobaciones no envían correos electrónicos. Los bloqueos permanecen visibles hasta que cambia la cola; abrirlos no aprueba ni reinicia el trabajo.",
  "awareness.project": "Elegir proyecto",
  "awareness.approval": "La versión exacta necesita aprobación",
  "awareness.resume": "La versión aprobada sigue bloqueada",
  "awareness.late":
    "Esta fecha ya ha pasado. Revisa el borrador y elige una acción explícita de programación.",
  "awareness.paused":
    "La automatización está pausada intencionadamente. Los bloqueos de publicación existentes se mantienen por separado.",
  "awareness.disabled": "La automatización está desactivada.",
  "awareness.settings": "Abrir configuración de programación",
  "awareness.history":
    "Último resultado semanal guardado: histórico, no una nueva comprobación de capacidad ni de fuentes",
  "awareness.empty": "No hay bloqueos de aprobación en esta página.",
  "awareness.page": "Página {page} de {pages} de la cola",
  "awareness.error":
    "No se han podido comprobar los registros actuales. Actualiza antes de actuar.",
  "awareness.checked": "Comprobado: {at}",
  "awareness.weekly": "Registros actuales de los espacios semanales",
  "awareness.earlier": "Alertas anteriores de la bandeja de entrada",
  "notifications.failureInspect": "Examinar detalles de publicación",
  "notifications.failureReadError":
    "No se han podido comprobar los detalles de publicación. Inténtalo de nuevo antes de decidir qué hacer.",
  "notifications.failureReason.contentReview":
    "El intento guardado fue bloqueado por las comprobaciones de contenido. Abre el borrador para revisar su preparación actual.",
  "notifications.failureReason.destination":
    "El intento guardado indicó un error de conexión o respuesta del destino. Comprueba el destino antes de reintentar.",
  "notifications.failureReason.configuration":
    "El intento guardado indicó que la configuración de publicación faltaba o no era válida. Revisa Configuración del proyecto.",
  "notifications.failureReason.unknown":
    "No se ha podido clasificar el error guardado. Revisa el borrador y el destino antes de reintentar.",
  "notifications.failureRecorded":
    "Registro actualizado el {at}, en la zona horaria de tu navegador. Intentos registrados: {attempts}.",
  "notifications.failureDraftChanged":
    "El borrador cambió después de este registro. Puede que estos detalles ya no describan su preparación actual.",
  "notifications.failureHttp": "Respuesta registrada del sitio web: HTTP {status}.",
  "notifications.failureCheck.links":
    "Resuelve los enlaces internos en el panel de seguridad de enlaces del editor.",
  "notifications.failureCheck.sourcesReview":
    "Contrasta las afirmaciones con fuentes o con un autor cualificado y completa la revisión humana.",
  "notifications.failureCheck.author":
    "Añade el nombre del autor real y una biografía, credencial o perfil.",
  "notifications.failureHistoryLimit":
    "Esta es información histórica guardada en Milo. No comprueba el destino, no aprueba el borrador actual ni reinicia la publicación.",
  "notifications.failureState.absent":
    "No se ha encontrado un registro coincidente en la cola. Actualiza las notificaciones y revisa el borrador.",
  "notifications.failureState.changed":
    "La cola ya no marca este elemento como fallido. Actualiza las notificaciones; esto por sí solo no verifica el sitio web de destino.",
  "notifications.recoveryInspect": "Examinar el trabajo guardado",
  "notifications.recoveryReadError":
    "No se han podido comprobar los registros de automatización guardados. Inténtalo de nuevo antes de decidir si reiniciar.",
  "notifications.recoveryState.absent":
    "No se ha encontrado un registro de ejecución actual. Actualiza las notificaciones para comprobar si se ha resuelto esta incidencia.",
  "notifications.recoveryState.running": "La última ejecución está marcada como activa.",
  "notifications.recoveryState.completed":
    "La última ejecución ha terminado. Actualiza las notificaciones para ver los problemas actuales.",
  "notifications.recoveryState.review_required":
    "La ejecución interrumpida sigue necesitando revisión.",
  "notifications.recoverySnapshot":
    "Registros de Milo comprobados el {at}, en la zona horaria de tu navegador.",
  "notifications.recoveryCounts":
    "Plan {period}: {saved} borradores guardados. Registros de cola de esos borradores: {pending} en espera, {publishing} en curso, {published} registrados como publicados, {failed} fallidos y {cancelled} cancelados.",
  "notifications.recoveryEvidenceLimit":
    "Estos son registros guardados en Milo. No verifican la última operación de IA ni el sitio web de destino. Comprueba el destino antes de reintentar una publicación de resultado incierto. Esta vista no reinicia el trabajo.",
  "notifications.recoveryMore":
    "Se muestran {shown} de {total} borradores guardados. Abre el calendario para examinar el trabajo restante.",
  "notifications.emailAddressUnverified":
    "El correo electrónico actual de tu cuenta no está verificado. Completa la confirmación del correo y vuelve a comprobarlo. Si un administrador cambió la dirección y no tienes un enlace de confirmación, contacta con el soporte de Milo. Las notificaciones dentro de la aplicación siguen disponibles.",
  "notifications.emailAddressUnavailable":
    "Milo no ha podido comprobar la verificación de tu correo actual. Inténtalo más tarde. Puedes seguir desactivando los resúmenes y utilizando las notificaciones dentro de la aplicación.",
  "notifications.generation_capacity_low": "Puede que el límite de preparación no cubra el plan",
  "notifications.generation_capacity_unavailable":
    "No se ha podido comprobar el límite de preparación",
  "notifications.capacityLow":
    "El plan {period} aún necesita {missing} borradores para este proyecto y {total} entre todas tus programaciones activas. A tu cuenta le quedan {remaining} intentos de preparación en {usagePeriod}. Es capacidad compartida, no una promesa de artículos completados. Revisa la programación; los borradores guardados siguen disponibles para revisión y publicación.",
  "notifications.capacityUnavailable":
    "Milo no ha podido verificar el límite compartido de preparación de {usagePeriod}. El plan {period} aún necesita {missing} borradores aquí. Vuelve a comprobarlo más tarde. Los borradores guardados y las demás notificaciones siguen disponibles.",
  "notifications.scheduler_recovery": "La automatización necesita una revisión de recuperación",
  "notifications.recovery":
    "La preparación se ha pausado tras una ejecución interrumpida. Revisa los borradores guardados y la última operación antes de reiniciar. Las aprobaciones de publicación existentes no cambian.",
  "notifications.emailTitle": "Resúmenes por correo electrónico",
  "notifications.emailDescription":
    "Recibe un resumen de las alertas nuevas, como máximo una vez por hora, en la dirección confirmada de tu cuenta. Cada incidencia aparece una vez.",
  "notifications.emailDisabled":
    "El envío de correo aún no se ha activado. Las notificaciones dentro de la aplicación están disponibles.",
  "notifications.emailEnable": "Activar resúmenes por correo",
  "notifications.emailDisable": "Desactivar resúmenes por correo",
  "notifications.emailError": "La configuración de correo no está disponible temporalmente.",
  "notifications.emailSaveError": "No se han podido guardar las preferencias de correo.",
  "notifications.emailHistory": "Actividad reciente de correo",
  "notifications.emailStatus.pending": "En espera",
  "notifications.emailStatus.leased": "Comprobando el estado actual",
  "notifications.emailStatus.sending": "Enviando",
  "notifications.emailStatus.accepted": "Aceptado por el proveedor de correo",
  "notifications.emailStatus.unknown": "El resultado del envío necesita verificación",
  "notifications.emailStatus.cancelled": "Cancelado",
  "notifications.emailStatus.failed": "No se ha podido preparar el correo",
  "notifications.title": "Notificaciones",
  "notifications.subtitle":
    "Tus próximas decisiones y problemas de publicación, contrastados con el estado más reciente del servidor.",
  "notifications.loading": "Comprobando tu plan…",
  "notifications.empty": "No hay acciones que requieran tu atención ahora mismo.",
  "notifications.error": "Las notificaciones no están disponibles temporalmente.",
  "notifications.stale":
    "La última comprobación no ha podido terminar. Estas son las últimas alertas confirmadas.",
  "notifications.refresh": "Volver a comprobar",
  "notifications.read": "Marcar como leída",
  "notifications.unread": "Sin leer",
  "notifications.saved": "Leída",
  "notifications.open": "Abrir tarea",
  "notifications.calendar": "Abrir calendario",
  "notifications.project": "Proyecto",
  "notifications.approval_due": "Aprobación próxima a vencer",
  "notifications.publication_failed": "La publicación necesita una comprobación",
  "notifications.manual_overdue": "La tarea manual está vencida",
  "notifications.cadence_gap": "La próxima semana necesita atención",
  "notifications.coverage": "{missing} de {total} espacios planificados no están listos y en cola.",
  "notifications.failure":
    "Comprueba el destino antes de reintentar: una publicación interrumpida puede estar ya en línea.",
  "notifications.approval": "Revisa la versión actual antes de su fecha límite prevista.",
  "notifications.manual":
    "Completa esta tarea o elige una nueva fecha. Este plazo corresponde a una tarea manual.",
  "notifications.readError":
    "No se ha podido marcar esta notificación como leída. Inténtalo de nuevo.",
  "emailSettings.language": "Idioma del correo electrónico",
  "emailSettings.note":
    "Elige el idioma de tus resúmenes operativos, informes mensuales e invitaciones a proyectos que solicites. Esto no cambia la configuración de la aplicación, los artículos ni el mercado. Guardar el idioma no activa ni envía correos.",
  "emailSettings.save": "Guardar idioma del correo",
  "emailSettings.saved": "Configuración de correo guardada.",
  "emailSettings.uncertain":
    "No se ha podido confirmar la configuración guardada. Vuelve a cargarla antes de realizar otro cambio; puede que el último cambio ya se haya guardado.",
  "emailSettings.reload": "Volver a cargar la configuración guardada (descartar cambios)",
  "team.title": "El equipo de Milo",
  "team.help":
    "Un espacio de trabajo con vistas especializadas del trabajo real y del conocimiento del proyecto.",
  "team.selectProject": "Elige un proyecto para ver su equipo.",
  "team.scope":
    "El estado de los trabajos abarca la semana seleccionada. Los consejos e informes guardados son pruebas fechadas, no demuestran que haya un trabajo activo ni mejores resultados.",
  "team.aiRole": "Especialista de IA",
  "team.records":
    "{count} registros de conocimiento guardados · revisa su estado en el conocimiento del proyecto",
  "team.lastDelivery": "Última entrega de los trabajos de esta semana",
  "team.auditFetched": "Auditoría del sitio web guardada",
  "team.auditPartial": "Auditoría guardada que utiliza solo el contexto del proyecto",
  "team.adviceSaved": "Consejos de preparación para la IA guardados",
  "team.imports": "{count} importaciones de mediciones de GSC guardadas",
  "team.measurementMissing": "No hay mediciones de GSC guardadas",
  "team.authorityPrerequisite":
    "Los datos del proveedor y la autorización de contacto deben comprobarse en el espacio de Backlinks.",
  "team.lesson.title": "Recordar una lección editorial",
  "team.lesson.help":
    "Escribe una preferencia recurrente para este proyecto. Al guardarla, se convierte en una instrucción explícita del proyecto para el trabajo futuro pertinente. Las ediciones habituales de artículos no crean lecciones. Esto no constituye una prueba factual.",
  "team.lesson.rule": "Instrucción para este proyecto",
  "team.lesson.target": "Aplicar a",
  "team.lesson.text": "Redacción",
  "team.lesson.visual": "Elementos visuales",
  "team.lesson.both": "Redacción y elementos visuales",
  "team.lesson.save": "Guardar instrucción del proyecto",
  "team.lesson.manage": "Revisar, editar u olvidar conocimiento",
  "team.lesson.saved":
    "Guardado en este proyecto. Puedes editarlo, revertirlo o revocarlo en el conocimiento del proyecto.",
  "team.lesson.unknown":
    "No se ha podido confirmar que se haya guardado. Comprueba el conocimiento del proyecto antes de volver a introducir la instrucción.",
  "team.role.lead": "Milo — Responsable de crecimiento",
  "team.description.lead": "Coordina la programación guardada, la cobertura y las decisiones.",
  "team.open.lead": "Revisar preparación semanal",
  "team.role.brand": "Estratega de marca",
  "team.description.brand":
    "Datos del proyecto, preferencias y lecciones reversibles, con historial de fuentes y revisiones.",
  "team.open.brand": "Revisar conocimiento del proyecto",
  "team.role.research": "Investigador de búsquedas",
  "team.description.research":
    "Informes semanales de investigación y oportunidades guardadas. Revisa las fuentes e hipótesis antes de redactar.",
  "team.open.research": "Revisar oportunidades",
  "team.role.content": "Editor de contenido",
  "team.description.content":
    "Los artículos conservados siguen necesitando revisión editorial y aprobación de publicación de la versión exacta.",
  "team.open.content": "Revisar artículos",
  "team.role.image": "Creador visual",
  "team.description.image":
    "Los elementos visuales propuestos utilizan el contexto del proyecto. Conservarlos no significa aprobarlos visualmente.",
  "team.open.image": "Revisar elementos visuales del artículo",
  "team.role.seo": "Especialista SEO",
  "team.description.seo":
    "Hallazgos fechados de auditorías de página, enlaces internos y presencia local/entidad. Las auditorías parciales mantienen sus limitaciones.",
  "team.open.seo": "Revisar hallazgos SEO",
  "team.role.authority": "Backlinks y autoridad",
  "team.description.authority":
    "La investigación, el seguimiento y las propuestas dependen de un acceso verificado al proveedor. Enviar mensajes y comprar publicaciones requieren autorizaciones independientes.",
  "team.open.authority": "Comprobar el espacio de Backlinks",
  "team.role.ai": "Analista de visibilidad en IA",
  "team.description.ai":
    "Los consejos de preparación son independientes de las respuestas, menciones y citas observadas. Aquí no se acredita el seguimiento observado.",
  "team.open.ai": "Revisar consejos de preparación",
  "team.role.performance": "Analista de rendimiento",
  "team.description.performance":
    "Informes guardados y mediciones fechadas. Los datos ausentes son desconocidos; un cambio entre el antes y el después no demuestra por sí solo causalidad.",
  "team.open.performance": "Revisar mediciones",
  "team.state.unavailable": "Estado no disponible",
  "team.state.none": "No hay trabajo registrado",
  "team.state.unknown": "Resultado incierto: revisar recuperación",
  "team.state.running": "El trabajo está en curso",
  "team.state.review": "Los cambios del propietario necesitan revisión",
  "team.state.retained": "Resultados conservados para revisión",
  "team.state.cancelled": "Preparación cancelada",
  "collaboration.reviewImageLimits":
    "Estas imágenes superan los límites de revisión o no pueden mostrarse de forma segura. Reduce su número o tamaño y utiliza imágenes estáticas PNG, JPEG o WebP.",
  "collaboration.emailInvitation": "Invitación por correo",
  "collaboration.invitationEmailHelp":
    "Envía una invitación a la dirección de correo indicada arriba para el rol mostrado. Abrir el enlace del correo no concede acceso.",
  "collaboration.invitationEmailQueued":
    "Correo de invitación solicitado. Comprueba aquí su estado de envío.",
  "collaboration.notificationHistory": "Historial de envío de notificaciones",
  "collaboration.notificationSettings": "Notificaciones del proyecto",
  "collaboration.notificationConsentHelp":
    "Se requieren tanto la asignación del propietario como tu consentimiento. Los cambios de rol en el proyecto requieren renovar la configuración.",
  "collaboration.notificationAssigned": "Asignado por el propietario",
  "collaboration.notificationNotAssigned": "No asignado por el propietario",
  "collaboration.notificationOptedIn": "El destinatario ha dado su consentimiento",
  "collaboration.notificationOptedOut": "El destinatario no ha dado su consentimiento",
  "collaboration.notificationAssign": "Asignar notificaciones",
  "collaboration.notificationUnassign": "Eliminar asignación",
  "collaboration.notificationOptIn": "Permitir notificaciones del proyecto",
  "collaboration.notificationOptOut": "Desactivar notificaciones del proyecto",
  "collaboration.decisionRecorded": "Decisión de revisión registrada.",
  "collaboration.decisionUnknown":
    "No se ha podido confirmar la decisión. Actualiza las decisiones anteriores antes de reintentar.",
  "collaboration.reviewNotAllowed":
    "Tu rol actual o la política del proyecto no permite tomar decisiones de revisión.",
  "collaboration.acknowledgeReview": "He examinado este borrador renderizado y todas sus imágenes.",
  "collaboration.approveVersion": "Aprobar esta versión",
  "collaboration.returnForChanges": "Devolver para cambios",
  "collaboration.reviewDoesNotPublish":
    "Registrar una revisión no publica el borrador ni reanuda una programación bloqueada.",
  "collaboration.reviewHistory": "Decisiones de revisión anteriores",
  "collaboration.approvalRecorded": "Aprobación registrada",
  "collaboration.changesRequested": "Cambios solicitados",
  "collaboration.owner": "Propietario",
  "collaboration.collaborator": "Colaborador",
  "collaboration.renderedReview": "Revisión renderizada",
  "collaboration.loadingReview": "Cargando la revisión completa y sus imágenes…",
  "collaboration.incompleteReview":
    "No se ha podido cargar la revisión completa. Actualiza para comprobar el borrador y todas sus imágenes.",
  "collaboration.policyTitle": "Política de aprobación",
  "collaboration.policyHelp":
    "Elige quién puede aprobar el trabajo del proyecto. Cambiar esta política retira las aprobaciones existentes de colaboradores; las aprobaciones independientes del propietario se mantienen.",
  "collaboration.policyUnselected": "Sin seleccionar: la aprobación de colaboradores está inactiva",
  "collaboration.policy.disabled": "Solo aprobaciones del propietario",
  "collaboration.policy.separate_reviewers": "Los Revisores aprueban; los Editores editan",
  "collaboration.policy.editors_can_approve": "Los Editores y Revisores pueden aprobar",
  "collaboration.savePolicy": "Guardar política de aprobación",
  "collaboration.editDraft": "Editar borrador",
  "collaboration.editHelp":
    "Guardar devuelve este borrador a revisión y retira su aprobación de publicación anterior.",
  "collaboration.editConflict":
    "El borrador guardado o tu rol ha cambiado. Copia las ediciones que quieras conservar antes de cargar la última versión guardada.",
  "collaboration.loadLatest": "Cargar la última versión guardada",
  "collaboration.draftSaved": "Borrador guardado para revisión.",
  "collaboration.editError":
    "No se ha podido guardar el borrador. Tus ediciones siguen aquí; comprueba la versión actual y tu acceso antes de reintentar.",
  "collaboration.saveDraft": "Guardar para revisión",
  "collaboration.question": "Pregunta",
  "collaboration.answer": "Respuesta",
  "collaboration.removeQuestion": "Eliminar pregunta",
  "collaboration.addQuestion": "Añadir pregunta",
  "collaboration.field.title": "Título",
  "collaboration.field.h1": "Encabezado principal",
  "collaboration.field.metaTitle": "Título para buscadores",
  "collaboration.field.metaDescription": "Descripción para buscadores",
  "collaboration.field.markdown": "Artículo (Markdown)",
  "collaboration.field.cta": "Llamada a la acción",
  "collaboration.field.outline": "Esquema: un encabezado por línea",
  "collaboration.field.faq": "Preguntas y respuestas",
  "collaboration.comments": "Comentarios",
  "collaboration.commentLabel": "Tu comentario",
  "collaboration.addComment": "Añadir comentario",
  "collaboration.you": "Tú",
  "collaboration.commentRoleAtPosting": "Rol al publicar",
  "collaboration.earlierVersion": "Comentario sobre una versión guardada anterior.",
  "collaboration.title": "Colaboradores del proyecto",
  "collaboration.subtitle": "Gestiona el acceso al proyecto y abre el trabajo compartido contigo.",
  "collaboration.owned": "Gestionar tu proyecto",
  "collaboration.shared": "Compartido contigo",
  "collaboration.invitations": "Tus invitaciones",
  "collaboration.members": "Personas con acceso",
  "collaboration.pending": "Invitaciones al proyecto",
  "collaboration.email": "Dirección de correo electrónico",
  "collaboration.role": "Rol",
  "collaboration.viewer": "Lector",
  "collaboration.editor": "Editor",
  "collaboration.reviewer": "Revisor",
  "collaboration.invite": "Crear invitación",
  "collaboration.inviteHelp":
    "La invitación aparece aquí cuando el destinatario inicia sesión con este correo verificado. Caduca a los siete días. Esta acción no envía ningún correo.",
  "collaboration.accept": "Aceptar invitación",
  "collaboration.revoke": "Revocar invitación",
  "collaboration.remove": "Eliminar acceso",
  "collaboration.saveRole": "Guardar rol",
  "collaboration.refresh": "Actualizar",
  "collaboration.open": "Abrir proyecto",
  "collaboration.loading": "Cargando acceso al proyecto…",
  "collaboration.error": "No se ha podido confirmar el acceso. Actualiza antes de reintentar.",
  "collaboration.saved": "Acceso al proyecto actualizado.",
  "collaboration.empty": "Todavía no hay nada que mostrar.",
  "collaboration.noOwned":
    "Puedes abrir los proyectos compartidos de abajo sin crear un proyecto propio.",
  "collaboration.drafts": "Borradores del proyecto",
  "collaboration.back": "Volver a los borradores",
  "collaboration.previous": "Anterior",
  "collaboration.next": "Siguiente",
  "collaboration.removed": "Eliminado",
  "collaboration.expires": "Caduca",
  "collaboration.history": "Actividad reciente de acceso",
  "collaboration.pendingState": "Pendiente",
  "collaboration.expired": "Caducada",
  "collaboration.accepted": "Aceptada",
  "collaboration.revoked": "Revocada",
};
