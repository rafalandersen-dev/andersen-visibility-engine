/** Spanish authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const esCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Cargando…",
  "citationForward.title": "Del hallazgo al cambio verificado",
  "citationForward.intro":
    "Lleva una versión de hallazgo aceptada a una tarea del Plan, redacta el cambio en Studio, publícalo mediante la aprobación existente y registra lo que realmente inspeccionaste en el destino.",
  "citationForward.authority":
    "Aceptar un hallazgo no concede nada: la publicación sigue necesitando la aprobación de Studio y tus permisos habituales de Manual/Review/Autopilot. Una tarea, un borrador, una aprobación o un acuse del conector nunca prueban que la página muestre el cambio.",
  "citationForward.findings.title": "Hallazgos y tareas del Plan",
  "citationForward.findings.empty":
    "Todavía no hay ningún hallazgo vinculable (aceptado o en espera de segunda revisión, versión actual).",
  "citationForward.findings.pick": "Versión del hallazgo",
  "citationForward.findings.pickPlaceholder": "Elige una versión del hallazgo",
  "citationForward.findings.pinned": "Anclado a v{pinned} · actual v{head}",
  "citationForward.findings.state.current": "versión actual",
  "citationForward.findings.state.superseded":
    "sustituida por una versión más reciente (el anclaje permanece en la fila revisada)",
  "citationForward.findings.state.deleted": "fila anclada eliminada",
  "citationForward.findings.state.dismissed": "descartado por ti (no vinculable)",
  "citationForward.findings.state.dissent": "desacuerdo independiente registrado",
  "citationForward.findings.state.second_review": "en espera de segunda revisión",
  "citationForward.task.create": "Crear tarea del Plan desde esta versión",
  "citationForward.task.attach": "Adjuntar a una tarea existente",
  "citationForward.task.attachPlaceholder": "Elige una tarea",
  "citationForward.task.created": "Tarea del Plan creada.",
  "citationForward.task.attached": "Adjuntado a la tarea.",
  "citationForward.task.listTitle": "Tareas vinculadas a esta versión del hallazgo",
  "citationForward.task.listEmpty": "Ninguna tarea está vinculada a esta versión del hallazgo.",
  "citationForward.task.state.active": "activa",
  "citationForward.task.state.archived": "archivada",
  "citationForward.task.state.deleted": "eliminada",
  "citationForward.task.state.missing": "ausente (la tarea ya no está en este espacio de trabajo)",
  "citationForward.task.localNote":
    "La identidad y los vínculos de las tareas viven en el almacén de tu espacio de trabajo; no conceden acceso de revisor ni son evidencia del servidor.",
  "citationForward.studio.manualDraft": "Crear borrador manual en Studio (sin IA)",
  "citationForward.studio.manualNote":
    "Un borrador manual no cuesta nada y empieza vacío; la generación con IA sigue en el Plan y usa tu presupuesto mensual de IA.",
  "citationForward.studio.open": "Abrir borrador en Studio",
  "citationForward.studio.plan": "Abrir en el Plan (generación con IA)",
  "citationForward.improvement.title": "Registro de mejora",
  "citationForward.improvement.intro":
    "Vincula el intento publicado exacto de esta tarea, la versión de aprobación que llevaba y las capturas de referencia tomadas antes. Cada campo de vinculación se deriva del intento elegido.",
  "citationForward.improvement.start": "Registrar mejora para esta tarea",
  "citationForward.improvement.publication": "Intento publicado",
  "citationForward.improvement.publicationNone":
    "Aún no hay registrado ningún intento publicado con URL en vivo para esta tarea. Publica primero mediante Studio; un intento iniciado o rechazado no puede vincularse.",
  "citationForward.improvement.publicationOption": "{finished} · versión {version} · {url}",
  "citationForward.improvement.approvedBy": "Aprobado por",
  "citationForward.improvement.approvedByOwner": "yo (propietario)",
  "citationForward.improvement.description": "Qué cambió (descripción)",
  "citationForward.improvement.baselines": "Capturas de referencia (antes de la publicación)",
  "citationForward.improvement.baselinesNone":
    "Ninguna captura dentro del alcance precede a esta publicación; no será posible un antes/después verificado para este intento.",
  "citationForward.improvement.baselinesHint":
    "Solo se ofrecen capturas tomadas antes de la publicación. El servidor lo comprueba de nuevo.",
  "citationForward.improvement.review": "Revisar el registro exacto",
  "citationForward.improvement.save": "Guardar mejora",
  "citationForward.improvement.retry": "Reintentar el mismo registro",
  "citationForward.improvement.back": "Volver a editar",
  "citationForward.improvement.cancel": "Cancelar",
  "citationForward.improvement.saved": "Guardado como v{version}.",
  "citationForward.improvement.listTitle": "Mejoras",
  "citationForward.improvement.listEmpty":
    "Todavía no hay ninguna mejora registrada para este proyecto.",
  "citationForward.improvement.status.unverified": "sin verificar",
  "citationForward.improvement.status.approval_bound": "vinculada a la aprobación",
  "citationForward.improvement.status.connector_receipt": "acuse del conector (solo confirmación)",
  "citationForward.improvement.status.owner_attested":
    "atestiguada por el propietario (tu observación, no prueba independiente)",
  "citationForward.improvement.evidence.baseline_absent": "sin referencia registrada",
  "citationForward.improvement.evidence.baseline_missing":
    "referencia ausente (se eliminó una captura o salió del alcance)",
  "citationForward.improvement.evidence.baseline_recorded": "referencia registrada",
  "citationForward.improvement.statusNote":
    "Los estados son valores en vivo del servidor. Un acuse del conector prueba que el conector respondió, no que la página muestre el cambio; una certificación del propietario es tu propia observación.",
  "citationForward.improvement.detailRows": "Filas de hallazgo ancladas",
  "citationForward.improvement.detailTask": "Tarea",
  "citationForward.improvement.detailDestination": "Destino",
  "citationForward.improvement.detailNoBinding":
    "Ninguna publicación vinculada (registro borrador).",
  "citationForward.improvement.remove": "Eliminar esta versión",
  "citationForward.improvement.removed": "Eliminado.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Elige al menos una versión del hallazgo.",
  "citationForward.issue.finding_unavailable":
    "Se eliminó una fila de hallazgo seleccionada; elige la versión actual.",
  "citationForward.issue.finding_not_bindable":
    "Un hallazgo descartado o sustituido no puede vincularse; elige su versión aceptada actual.",
  "citationForward.issue.scope_mixed":
    "Todos los hallazgos seleccionados deben pertenecer a la misma versión de panel bloqueada y al mismo cliente.",
  "citationForward.issue.task_invalid": "La identidad de la tarea no es válida.",
  "citationForward.issue.publication_required": "Elige el intento publicado que quieres vincular.",
  "citationForward.issue.publication_task_mismatch":
    "El intento elegido se registró para otra tarea.",
  "citationForward.issue.description_required": "Describe el cambio.",
  "citationForward.issue.baseline_after_publication":
    "Una referencia elegida se capturó después de la publicación.",
  "citationForward.issue.invalid": "El registro no es válido.",
  "citationForward.inspection.title": "Inspección del destino por el propietario",
  "citationForward.inspection.intro":
    "Abre la URL publicada exacta, compárala con la instantánea aprobada y registra lo que viste. Abrir el enlace o recibir una respuesta correcta no certifica nada por sí solo.",
  "citationForward.inspection.open": "Abrir URL publicada",
  "citationForward.inspection.snapshot": "Instantánea aprobada",
  "citationForward.inspection.result": "¿Qué viste?",
  "citationForward.inspection.shows_approved_content": "Muestra el contenido aprobado",
  "citationForward.inspection.does_not_show": "No lo muestra",
  "citationForward.inspection.inconclusive": "No concluyente",
  "citationForward.inspection.record": "Registrar inspección",
  "citationForward.inspection.baselineRequired":
    "Una inspección positiva necesita las capturas de referencia que mejora; edita primero el registro.",
  "citationForward.inspection.bindingRequired":
    "Este registro no tiene ninguna vinculación de publicación que inspeccionar.",
  "citationForward.inspection.negativeNote":
    "Una inspección negativa o no concluyente se guarda, y la mejora sigue sin verificar para la entrega.",
  "citationForward.error.conflict":
    "Alguien guardó una versión más reciente mientras editabas. Tu borrador se conserva; no se escribió nada.",
  "citationForward.error.conflictContinue": "Continuar en la versión actual",
  "citationForward.error.findingUnresolved":
    "Un hallazgo seleccionado ya no se resuelve en este alcance.",
  "citationForward.error.baselineUnresolved":
    "Una captura de referencia ya no se resuelve en este proyecto.",
  "citationForward.error.bindingUnresolved":
    "La vinculación de publicación no coincide con el intento registrado.",
  "citationForward.error.bindingUnapproved": "La versión vinculada no está aprobada actualmente.",
  "citationForward.error.approvalMismatch":
    "La versión de aprobación o el aprobador declarados no coinciden con la aprobación real.",
  "citationForward.error.taskMismatch": "La publicación se registró para otra tarea.",
  "citationForward.error.destinationMismatch": "El destino no coincide con la URL publicada.",
  "citationForward.error.inspectionInvalid":
    "La inspección no es válida para esta publicación (URL, hora o estado).",
  "citationForward.error.verificationUnbacked":
    "Una verificación necesita una inspección positiva del propietario de la URL publicada.",
  "citationForward.error.scopeDrift": "Esta mejora se registró bajo otro alcance.",
  "citationForward.error.capacity": "Se alcanzó la capacidad de mejoras de este proyecto.",
  "citationForward.error.invalid": "El registro se rechazó por no válido.",
  "citationForward.error.unavailable":
    "No se pudo completar el guardado. Actualiza e inténtalo de nuevo.",
  "citationForward.error.loadEvidence": "No se pudo cargar el historial de publicaciones.",
  "citationForward.error.loadImprovements": "No se pudieron cargar las mejoras.",
  "citationForward.readiness.title": "Preparación para la nueva prueba",
  "citationForward.readiness.verified":
    "Cambios distintos atestiguados por el propietario: {count} de {required} requeridos",
  "citationForward.readiness.receipts": "Solo acuses del conector (no prueba de entrega): {count}",
  "citationForward.readiness.approvalBound": "Solo vinculadas a la aprobación: {count}",
  "citationForward.readiness.unverified": "Sin verificar: {count}",
  "citationForward.readiness.baselineMissing": "Referencia ausente: {count}",
  "citationForward.readiness.note":
    "Los recuentos provienen de estados en vivo del servidor; aquí no se calcula ninguna ronda de comparación y una certificación del propietario nunca es prueba independiente.",
  "citationForward.task.pinnedTitle": "Tareas del Plan ancladas a versiones de hallazgo",
  "citationForward.task.pinnedEmpty":
    "Ninguna tarea del Plan está anclada a una versión de hallazgo en este proyecto.",
  "citationForward.task.readFailed": "No se pudo leer el hallazgo; no se creó ninguna tarea.",
  "citationForward.task.notEligible":
    "La versión del hallazgo devuelta por el servidor no es la seleccionada o ya no es elegible; no se creó ninguna tarea.",
  "citationForward.task.stale":
    "El proyecto o la cuenta cambiaron mientras se leía el hallazgo; no se creó ninguna tarea.",
  "citationForward.improvement.rowsPick": "Versiones de hallazgo que vincular",
  "citationForward.improvement.useCurrent":
    "Vincular la versión actual v{head} en lugar de la fila anclada",
  "citationForward.improvement.publicationPartial":
    "Solo se pudieron cargar {loaded} de {total} intentos registrados; los intentos más antiguos no se ofrecen aquí.",
  "citationForward.improvement.historyRow": "versión anterior (historial)",
  "citationForward.inspection.notHead":
    "Existe una versión más reciente de esta mejora. Abre la versión actual e inspecciónala.",
  "citationForward.inspection.retry": "Reintentar la misma inspección",
  "citationForward.error.findingStale":
    "Un hallazgo vinculado cambió desde que revisaste este registro. No se escribió nada; abre la versión actual del hallazgo y revísala de nuevo.",
  "citationForward.readiness.unavailable":
    "No se puede mostrar la preparación: no se pudieron actualizar los estados en vivo.",
  "citationForward.improvement.approvalDelegate": "Aprobado por un revisor delegado: {email}",
  "citationForward.improvement.approvalNone":
    "Esta versión no está aprobada actualmente; el intento no puede vincularse.",
  "citationForward.issue.approval_unknown":
    "No se pudo cargar el estado de aprobación del intento elegido.",
  "citationForward.issue.approval_unavailable":
    "La versión del intento elegido no está aprobada actualmente.",
  "citationForward.task.duplicate":
    "Ya hay una tarea del Plan anclada a esta versión del hallazgo (listada abajo); no se creó una segunda tarea. Úsala o adjunta la versión explícitamente a otra tarea.",
};
