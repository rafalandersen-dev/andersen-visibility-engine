/** Spanish authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const esCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Cambios en fichas y configuración",
  "citationChange.intro":
    "Registre el cambio previsto como un artefacto (solo los campos admitidos y no secretos), apruebe exactamente esa versión, declare cuándo se realizó y luego vincule una mejora a él. Una declaración no es prueba del destino.",
  "citationChange.artifact.new": "Nuevo artefacto de cambio",
  "citationChange.artifact.kind": "Tipo",
  "citationChange.artifact.kind.listing": "Ficha",
  "citationChange.artifact.kind.configuration": "Configuración",
  "citationChange.artifact.reference": "Referencia",
  "citationChange.artifact.referenceHint":
    "El identificador de la ficha o del ajuste (por ejemplo, el id del perfil o la ruta del ajuste). Sin credenciales.",
  "citationChange.artifact.fields": "Campos",
  "citationChange.artifact.fieldsHint":
    "Solo se pueden registrar los campos admitidos; las credenciales, los tokens y los ajustes privados se rechazan y no se pueden añadir aquí.",
  "citationChange.artifact.before": "Antes",
  "citationChange.artifact.after": "Después",
  "citationChange.artifact.save": "Guardar artefacto",
  "citationChange.artifact.saved":
    "Artefacto guardado (un contenido idéntico devuelve el artefacto existente).",
  "citationChange.artifact.remove":
    "Eliminar artefacto (el contenido se elimina; los identificadores se conservan para auditoría)",
  "citationChange.artifact.empty": "Todavía no hay ningún artefacto de cambio.",
  "citationChange.artifact.unsupported": "Campo o valor no admitido; no se guardó nada.",
  "citationChange.approval.title": "Aprobación de esta versión exacta",
  "citationChange.approval.approve": "Aprobar esta versión",
  "citationChange.approval.revoke": "Revocar aprobación",
  "citationChange.approval.owner": "Aprobado por mí (propietario)",
  "citationChange.approval.delegate": "Aprobado por un revisor delegado: {email}",
  "citationChange.approval.none": "No está aprobado actualmente.",
  "citationChange.receipt.title": "Declaraciones de ejecución",
  "citationChange.receipt.record": "Declarar ejecutado ahora",
  "citationChange.receipt.recorded": "Declaración registrada.",
  "citationChange.receipt.none": "Todavía no hay ninguna declaración.",
  "citationChange.receipt.note":
    "Una declaración dice que una persona hizo el cambio; nunca demuestra que el destino lo muestre.",
  "citationChange.binding.kind": "Tipo de vinculación",
  "citationChange.binding.public": "Intento publicado (URL pública)",
  "citationChange.binding.change": "Cambio en ficha / configuración",
  "citationChange.binding.artifact": "Artefacto",
  "citationChange.binding.receipt": "Declaración de ejecución",
  "citationChange.binding.chooseArtifact": "Elija un artefacto aprobado",
  "citationChange.binding.chooseReceipt": "Elija una declaración",
  "citationChange.issue.artifact_required": "Elija un artefacto aprobado.",
  "citationChange.issue.artifact_unapproved": "El artefacto elegido no está aprobado actualmente.",
  "citationChange.issue.receipt_required": "Elija una declaración de ejecución para el artefacto.",
  "citationChange.independent.title": "Inspección independiente",
  "citationChange.independent.none": "sin inspección independiente",
  "citationChange.independent.inconclusive": "no concluyente (no afirmativa)",
  "citationChange.independent.disputed":
    "disputada (un inspector asignado vio que faltaba el cambio; excluida de la preparación verificada)",
  "citationChange.independent.independently_inspected":
    "inspeccionada de forma independiente (otra persona autenticada vio el cambio aprobado)",
  "citationChange.independent.note":
    "La inspección independiente es una inspección humana hecha por otra persona del equipo; nunca es una verificación automática ni una prueba causal, y una entrega disputada queda excluida aunque usted la haya atestiguado.",
  "citationChange.eligible.yes": "cuenta como cambio verificado",
  "citationChange.eligible.no": "no cuenta como verificado",
  "citationChange.assign.title": "Asignaciones de inspección",
  "citationChange.assign.pick": "Elija un revisor del equipo",
  "citationChange.assign.grant": "Conceder inspección",
  "citationChange.assign.revoke": "Revocar",
  "citationChange.assign.link": "Copiar el enlace del inspector",
  "citationChange.assign.linkCopied": "Enlace copiado.",
  "citationChange.assign.none": "Ningún inspector asignado.",
  "citationChange.assign.effective": "vigente",
  "citationChange.assign.ineffective": "ya no vigente",
  "citationChange.inspect.title": "Inspeccionar un cambio registrado",
  "citationChange.inspect.intro":
    "Abra la referencia exacta, compárela con el contenido aprobado de abajo y luego registre lo que vio. Abrir la referencia no atestigua nada por sí mismo.",
  "citationChange.inspect.reference": "Referencia",
  "citationChange.inspect.open": "Abrir referencia",
  "citationChange.inspect.approvedVersion": "Versión aprobada",
  "citationChange.inspect.approvedContent": "Contenido aprobado",
  "citationChange.inspect.identity": "Identidades del aprobador y del ejecutor",
  "citationChange.inspect.identityUnavailable":
    "El ejecutor o el aprobador de este cambio es desconocido (una publicación anterior o una aprobación sin resolver); no se puede registrar un recibo independiente.",
  "citationChange.inspect.result": "¿Qué vio?",
  "citationChange.inspect.shows_approved_content": "Muestra el cambio aprobado",
  "citationChange.inspect.does_not_show": "No lo muestra",
  "citationChange.inspect.inconclusive": "No concluyente",
  "citationChange.inspect.record": "Registrar inspección",
  "citationChange.inspect.retry": "Reintentar la misma inspección",
  "citationChange.inspect.withdraw": "Retirar mi inspección actual",
  "citationChange.inspect.recorded": "Inspección registrada como v{version}.",
  "citationChange.inspect.history": "Historial de mis inspecciones",
  "citationChange.inspect.head": "actual",
  "citationChange.inspect.withdrawn": "retirada",
  "citationChange.inspect.loadError":
    "No se pudo cargar esta inspección (no asignada, revocada o la fila cambió).",
  "citationChange.readiness.independent": "Inspeccionados de forma independiente: {count}",
  "citationChange.readiness.disputed": "Disputados (excluidos): {count}",
  "citationChange.readiness.receipts":
    "Solo declaraciones de ejecución (no prueba de entrega): {count}",
  "citationChange.error.unsupported": "Campo, valor o tipo no admitido; no se guardó nada.",
  "citationChange.error.unavailable": "No se pudo cargar ni guardar el registro del cambio.",
  "citationChange.error.stale": "El artefacto cambió desde que lo vio; vuelva a abrirlo.",
  "citationChange.error.forbidden": "No tiene permiso para hacer esto en este proyecto.",
  "citationChange.error.unapproved": "Esta versión no está aprobada actualmente.",
  "citationChange.error.receiptInvalid":
    "El instante declarado es anterior a la aprobación o está en el futuro.",
  "citationChange.error.capacity":
    "Se alcanzó la capacidad de artefactos de cambio de este proyecto.",
  "citationChange.error.inspectionInvalid":
    "La inspección no es válida (instante, referencia o estado).",
  "citationChange.error.notIndependent":
    "Usted ejecutó o aprobó este cambio, así que no puede inspeccionarlo de forma independiente.",
  "citationChange.error.identityUnavailable":
    "La identidad del ejecutor o del aprobador no está disponible; se rechaza la inspección independiente.",
  "citationChange.error.inspectionConflict":
    "Su cadena de inspecciones cambió; recargue y registre de nuevo.",
  "citationChange.error.generic": "No se pudo completar la acción sobre las evidencias del cambio.",
  "citationChange.artifact.fieldKey": "Campo",
  "citationChange.artifact.addField": "Añadir campo",
  "citationChange.artifact.removeField": "Quitar",
  "citationChange.artifact.removed":
    "Artefacto eliminado (identificadores de auditoría conservados).",
  "citationChange.artifact.approvalRevision": "revisión de aprobación {revision}",
  "citationChange.approval.approved": "Aprobación registrada.",
  "citationChange.approval.revoked": "Aprobación revocada.",
  "citationChange.approval.retry": "Reintentar la misma decisión",
  "citationChange.approval.replayed":
    "Esto fue una repetición de una solicitud anterior; la decisión actual se muestra tras recargar.",
  "citationChange.receipt.remove": "Quitar declaración",
  "citationChange.receipt.removed": "Declaración quitada.",
  "citationChange.binding.deleted":
    "El artefacto vinculado fue eliminado; solo quedan identificadores.",
  "citationChange.detail.changeTitle": "Cambio vinculado en ficha / configuración",
  "citationChange.detail.artifactVersion": "Versión aprobada del artefacto",
  "citationChange.detail.receiptAt": "Declarado ejecutado el",
  "citationChange.assign.candidatesNone":
    "No hay ningún revisor del equipo elegible para asignar (política o lista).",
  "citationChange.assign.granted": "Inspección concedida.",
  "citationChange.assign.revoked": "Inspección revocada.",
  "citationChange.inspect.kindPublic": "Página publicada",
  "citationChange.inspect.fresh":
    "Su inspección actual ya no tiene efecto ({reason}); registre una nueva contra su cabecera actual.",
  "citationChange.inspect.reason.superseded": "sustituida por un recibo posterior",
  "citationChange.inspect.reason.withdrawn": "retirada",
  "citationChange.inspect.reason.account": "cuenta no disponible",
  "citationChange.inspect.reason.assignment": "la asignación se concedió de nuevo",
  "citationChange.inspect.reason.authority": "su autoridad en el equipo cambió",
  "citationChange.inspect.reason.independence": "ahora usted es el ejecutor o el aprobador",
  "citationChange.inspect.noContent":
    "El contenido aprobado ya no está disponible (artefacto eliminado o publicación ausente).",
  "citationChange.inspect.boundFindings": "Hallazgos vinculados",
  "citationChange.inspect.withdrawnDone": "Inspección retirada.",
  "citationChange.dissent.title": "Disenso activo sobre este cambio entregado",
  "citationChange.dissent.row": "{inspector} · fila {row} · {at}",
  "citationChange.status.receipt_recorded":
    "declaración de ejecución registrada (no prueba de entrega)",
  "citationChange.artifact.duplicateField":
    "Este campo ya lo usa otra fila; elija un campo distinto o quite esta fila.",
  "citationChange.artifact.fieldsExhausted": "Cada campo admitido de este tipo ya tiene una fila.",
  "citationChange.approval.pendingNote":
    "La solicitud anterior no volvió. Reintentar envía exactamente la misma decisión (versión {sha}, {decision}, revisión revisada {revision}); nada se recalcula a partir del estado actual.",
  "citationChange.approval.newDecision": "Descartarla y decidir de nuevo",
  "citationChange.receipt.retry": "Reintentar la misma declaración",
  "citationChange.receipt.newPerformance": "Declarar una nueva ejecución",
  "citationChange.receipt.pendingNote":
    "La declaración anterior no volvió. Reintentar envía exactamente el mismo instante declarado ({at}); una nueva ejecución es una acción explícita aparte.",
  "citationChange.approval.blockedBy":
    "Resuelva primero la decisión pendiente de {reference} (reinténtela o descártela); las demás aprobaciones esperan.",
  "citationChange.receipt.blockedBy":
    "Resuelva primero la declaración pendiente de {reference} (reinténtela o declare una nueva ejecución); las demás declaraciones esperan.",
  "citationChange.readiness.verified":
    "Cambios distintos verificados: {count} de {required} requeridos (un cambio cuenta cuando su prueba es elegible: su propia atestación o una inspección independiente de un cambio entregado; un cambio disputado o excluido nunca cuenta)",
  "citationChange.readiness.sources":
    "Observaciones registradas sobre los cambios actuales: atestadas por el propietario {owner}, inspeccionadas de forma independiente {independent} (son recuentos de observaciones registradas, no pruebas elegibles; las disputas y exclusiones deciden el recuento verificado de arriba)",
  "citationChange.evidence.independentBaseline":
    "la línea base se resuelve por la prueba independiente (sin atestación del propietario en esta fila)",
  "citationChange.inspect.ownerIntro":
    "Abra la ficha o el ajuste en la referencia exacta, compárelo con los campos aprobados de abajo y luego registre lo que vio. Abrirlo no atestigua nada por sí mismo.",
  "citationChange.inspect.contentUnavailable":
    "No se pudo cargar el contenido aprobado exacto de este cambio (artefacto eliminado, modificado o no disponible): no es posible una atestación positiva; aún puede registrarse un resultado negativo o no concluyente.",
  "citationChange.receipt.stale":
    "no válida bajo la aprobación actual (registrada bajo una decisión anterior, o la aprobación ya no es vigente) — declare una nueva ejecución",
  "citationChange.issue.receipt_stale":
    "La declaración elegida no es válida bajo la aprobación actual: se registró bajo una decisión de aprobación anterior, o la aprobación ya no es vigente. Declare una nueva ejecución y elíjala.",
  "citationChange.error.receiptStale":
    "La declaración se registró bajo una decisión de aprobación anterior (desde entonces la aprobación se revocó o se decidió de nuevo). Declare una nueva ejecución bajo la aprobación actual y vincule esa.",
  "citationChange.binding.receiptStale":
    "La declaración vinculada se registró bajo una decisión de aprobación anterior, por lo que esta fila se mantiene en vinculada a aprobación y ninguna inspección nueva puede vincular esa declaración. Declare una nueva ejecución bajo la aprobación actual y registre una nueva versión de la mejora.",
};
