/** German authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const deCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Wird geladen…",
  "citationForward.title": "Vom Befund zur nachgewiesenen Änderung",
  "citationForward.intro":
    "Übernehmen Sie eine akzeptierte Befundversion in eine Plan-Aufgabe, schreiben Sie die Änderung in Studio, veröffentlichen Sie sie über die bestehende Freigabe und halten Sie fest, was Sie am Zielort tatsächlich geprüft haben.",
  "citationForward.authority":
    "Das Akzeptieren eines Befunds gewährt nichts: Die Veröffentlichung braucht weiterhin die Studio-Freigabe und Ihre üblichen Manual/Review/Autopilot-Berechtigungen. Eine Aufgabe, ein Entwurf, eine Freigabe oder eine Konnektor-Bestätigung ist nie ein Beweis dafür, dass die Seite die Änderung zeigt.",
  "citationForward.findings.title": "Befunde und Plan-Aufgaben",
  "citationForward.findings.empty":
    "Noch kein zuordenbarer Befund (akzeptiert oder auf Zweitprüfung wartend, aktuelle Version).",
  "citationForward.findings.pick": "Befundversion",
  "citationForward.findings.pickPlaceholder": "Befundversion wählen",
  "citationForward.findings.pinned": "Angeheftet an v{pinned} · aktuell v{head}",
  "citationForward.findings.state.current": "aktuelle Version",
  "citationForward.findings.state.superseded":
    "durch eine neuere Version ersetzt (die Anheftung bleibt auf der geprüften Zeile)",
  "citationForward.findings.state.deleted": "angeheftete Zeile gelöscht",
  "citationForward.findings.state.dismissed": "von Ihnen verworfen (nicht zuordenbar)",
  "citationForward.findings.state.dissent": "unabhängiger Widerspruch erfasst",
  "citationForward.findings.state.second_review": "wartet auf Zweitprüfung",
  "citationForward.task.create": "Plan-Aufgabe aus dieser Version erstellen",
  "citationForward.task.attach": "An bestehende Aufgabe anhängen",
  "citationForward.task.attachPlaceholder": "Aufgabe wählen",
  "citationForward.task.created": "Plan-Aufgabe erstellt.",
  "citationForward.task.attached": "An die Aufgabe angehängt.",
  "citationForward.task.listTitle": "Mit dieser Befundversion verknüpfte Aufgaben",
  "citationForward.task.listEmpty": "Mit dieser Befundversion ist keine Aufgabe verknüpft.",
  "citationForward.task.state.active": "aktiv",
  "citationForward.task.state.archived": "archiviert",
  "citationForward.task.state.deleted": "gelöscht",
  "citationForward.task.state.missing": "fehlt (Aufgabe nicht mehr in diesem Arbeitsbereich)",
  "citationForward.task.localNote":
    "Aufgabenidentität und Verknüpfungen liegen in Ihrem Arbeitsbereichsspeicher; sie gewähren keinen Prüferzugang und sind kein Servernachweis.",
  "citationForward.studio.manualDraft": "Manuellen Entwurf in Studio erstellen (ohne KI)",
  "citationForward.studio.manualNote":
    "Ein manueller Entwurf kostet nichts und beginnt leer; der KI-Generierungspfad bleibt in Plan und nutzt Ihr monatliches KI-Budget.",
  "citationForward.studio.open": "Entwurf in Studio öffnen",
  "citationForward.studio.plan": "In Plan öffnen (KI-Generierung)",
  "citationForward.improvement.title": "Verbesserungseintrag",
  "citationForward.improvement.intro":
    "Binden Sie den exakten veröffentlichten Versuch für diese Aufgabe, die dabei getragene Freigabeversion und die davor aufgenommenen Basis-Erfassungen. Jedes Bindungsfeld wird aus dem gewählten Versuch abgeleitet.",
  "citationForward.improvement.start": "Verbesserung für diese Aufgabe erfassen",
  "citationForward.improvement.publication": "Veröffentlichter Versuch",
  "citationForward.improvement.publicationNone":
    "Für diese Aufgabe ist noch kein veröffentlichter Versuch mit Live-URL erfasst. Veröffentlichen Sie zuerst über Studio; ein begonnener oder abgelehnter Versuch kann nicht gebunden werden.",
  "citationForward.improvement.publicationOption": "{finished} · Version {version} · {url}",
  "citationForward.improvement.approvedBy": "Freigegeben von",
  "citationForward.improvement.approvedByOwner": "mir (Inhaber)",
  "citationForward.improvement.description": "Was sich geändert hat (Beschreibung)",
  "citationForward.improvement.baselines": "Basis-Erfassungen (vor der Veröffentlichung)",
  "citationForward.improvement.baselinesNone":
    "Keine Erfassung im Geltungsbereich liegt vor dieser Veröffentlichung; ein nachgewiesenes Vorher/Nachher ist für diesen Versuch nicht möglich.",
  "citationForward.improvement.baselinesHint":
    "Es werden nur Erfassungen vor der Veröffentlichung angeboten. Der Server prüft dies erneut.",
  "citationForward.improvement.review": "Den exakten Eintrag prüfen",
  "citationForward.improvement.save": "Verbesserung speichern",
  "citationForward.improvement.retry": "Denselben Eintrag erneut senden",
  "citationForward.improvement.back": "Zurück zur Bearbeitung",
  "citationForward.improvement.cancel": "Abbrechen",
  "citationForward.improvement.saved": "Gespeichert als v{version}.",
  "citationForward.improvement.listTitle": "Verbesserungen",
  "citationForward.improvement.listEmpty":
    "Für dieses Projekt ist noch keine Verbesserung erfasst.",
  "citationForward.improvement.status.unverified": "nicht nachgewiesen",
  "citationForward.improvement.status.approval_bound": "an Freigabe gebunden",
  "citationForward.improvement.status.connector_receipt": "Konnektor-Quittung (nur Bestätigung)",
  "citationForward.improvement.status.owner_attested":
    "vom Inhaber bestätigt (Ihre Beobachtung, kein unabhängiger Beweis)",
  "citationForward.improvement.evidence.baseline_absent": "keine Basis erfasst",
  "citationForward.improvement.evidence.baseline_missing":
    "Basis fehlt (eine Erfassung wurde gelöscht oder hat den Geltungsbereich verlassen)",
  "citationForward.improvement.evidence.baseline_recorded": "Basis erfasst",
  "citationForward.improvement.statusNote":
    "Die Status sind Live-Serverwerte. Eine Konnektor-Quittung beweist, dass der Konnektor geantwortet hat, nicht dass die Seite die Änderung zeigt; eine Inhaberbestätigung ist Ihre eigene Beobachtung.",
  "citationForward.improvement.detailRows": "Angeheftete Befundzeilen",
  "citationForward.improvement.detailTask": "Aufgabe",
  "citationForward.improvement.detailDestination": "Zielort",
  "citationForward.improvement.detailNoBinding":
    "Keine Veröffentlichung gebunden (Entwurfseintrag).",
  "citationForward.improvement.remove": "Diese Version entfernen",
  "citationForward.improvement.removed": "Entfernt.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Wählen Sie mindestens eine Befundversion.",
  "citationForward.issue.finding_unavailable":
    "Eine ausgewählte Befundzeile wurde gelöscht; wählen Sie die aktuelle Version.",
  "citationForward.issue.finding_not_bindable":
    "Ein verworfener oder ersetzter Befund kann nicht gebunden werden; wählen Sie seine aktuelle akzeptierte Version.",
  "citationForward.issue.scope_mixed":
    "Alle ausgewählten Befunde müssen zur selben gesperrten Panel-Version und zum selben Kunden gehören.",
  "citationForward.issue.task_invalid": "Die Aufgabenidentität ist ungültig.",
  "citationForward.issue.publication_required":
    "Wählen Sie den zu bindenden veröffentlichten Versuch.",
  "citationForward.issue.publication_task_mismatch":
    "Der gewählte Versuch wurde für eine andere Aufgabe erfasst.",
  "citationForward.issue.description_required": "Beschreiben Sie die Änderung.",
  "citationForward.issue.baseline_after_publication":
    "Eine gewählte Basis wurde nach der Veröffentlichung erfasst.",
  "citationForward.issue.invalid": "Der Eintrag ist ungültig.",
  "citationForward.inspection.title": "Inhaberprüfung des Zielorts",
  "citationForward.inspection.intro":
    "Öffnen Sie die exakte veröffentlichte URL, vergleichen Sie sie mit dem freigegebenen Schnappschuss und halten Sie fest, was Sie gesehen haben. Das Öffnen des Links oder eine erfolgreiche Antwort belegt für sich nichts.",
  "citationForward.inspection.open": "Veröffentlichte URL öffnen",
  "citationForward.inspection.snapshot": "Freigegebener Schnappschuss",
  "citationForward.inspection.result": "Was haben Sie gesehen?",
  "citationForward.inspection.shows_approved_content": "Zeigt den freigegebenen Inhalt",
  "citationForward.inspection.does_not_show": "Zeigt ihn nicht",
  "citationForward.inspection.inconclusive": "Nicht eindeutig",
  "citationForward.inspection.record": "Prüfung erfassen",
  "citationForward.inspection.baselineRequired":
    "Eine positive Prüfung braucht die Basis-Erfassungen, auf denen sie aufbaut; bearbeiten Sie zuerst den Eintrag.",
  "citationForward.inspection.bindingRequired":
    "Dieser Eintrag hat keine Veröffentlichungsbindung, die geprüft werden könnte.",
  "citationForward.inspection.negativeNote":
    "Eine negative oder nicht eindeutige Prüfung wird gespeichert, und die Verbesserung bleibt für die Auslieferung nicht nachgewiesen.",
  "citationForward.error.conflict":
    "Jemand hat während Ihrer Bearbeitung eine neuere Version gespeichert. Ihr Entwurf bleibt erhalten; nichts wurde geschrieben.",
  "citationForward.error.conflictContinue": "Auf der aktuellen Version fortfahren",
  "citationForward.error.findingUnresolved":
    "Ein ausgewählter Befund lässt sich in diesem Geltungsbereich nicht mehr auflösen.",
  "citationForward.error.baselineUnresolved":
    "Eine Basis-Erfassung lässt sich in diesem Projekt nicht mehr auflösen.",
  "citationForward.error.bindingUnresolved":
    "Die Veröffentlichungsbindung passt nicht zum erfassten Versuch.",
  "citationForward.error.bindingUnapproved": "Die gebundene Version ist derzeit nicht freigegeben.",
  "citationForward.error.approvalMismatch":
    "Die angegebene Freigabeversion oder der Freigebende stimmt nicht mit der tatsächlichen Freigabe überein.",
  "citationForward.error.taskMismatch":
    "Die Veröffentlichung wurde für eine andere Aufgabe erfasst.",
  "citationForward.error.destinationMismatch":
    "Der Zielort stimmt nicht mit der veröffentlichten URL überein.",
  "citationForward.error.inspectionInvalid":
    "Die Prüfung ist für diese Veröffentlichung nicht gültig (URL, Zeit oder Zustand).",
  "citationForward.error.verificationUnbacked":
    "Ein Nachweis braucht eine positive Inhaberprüfung der veröffentlichten URL.",
  "citationForward.error.scopeDrift":
    "Diese Verbesserung wurde unter einem anderen Geltungsbereich erfasst.",
  "citationForward.error.capacity": "Die Verbesserungskapazität für dieses Projekt ist erreicht.",
  "citationForward.error.invalid": "Der Eintrag wurde als ungültig abgelehnt.",
  "citationForward.error.unavailable":
    "Das Speichern konnte nicht abgeschlossen werden. Aktualisieren Sie und versuchen Sie es erneut.",
  "citationForward.error.loadEvidence": "Der Veröffentlichungsverlauf konnte nicht geladen werden.",
  "citationForward.error.loadImprovements": "Verbesserungen konnten nicht geladen werden.",
  "citationForward.readiness.title": "Bereitschaft für den erneuten Test",
  "citationForward.readiness.verified":
    "Vom Inhaber bestätigte unterschiedliche Änderungen: {count} von {required} erforderlich",
  "citationForward.readiness.receipts":
    "Nur Konnektor-Quittungen (kein Auslieferungsbeweis): {count}",
  "citationForward.readiness.approvalBound": "Nur an Freigabe gebunden: {count}",
  "citationForward.readiness.unverified": "Nicht nachgewiesen: {count}",
  "citationForward.readiness.baselineMissing": "Basis fehlt: {count}",
  "citationForward.readiness.note":
    "Die Zahlen stammen aus Live-Serverstatus; hier wird keine Vergleichsrunde berechnet, und eine Inhaberbestätigung ist nie ein unabhängiger Beweis.",
  "citationForward.task.pinnedTitle": "An Befundversionen angeheftete Plan-Aufgaben",
  "citationForward.task.pinnedEmpty":
    "In diesem Projekt ist keine Plan-Aufgabe an eine Befundversion angeheftet.",
  "citationForward.task.readFailed":
    "Der Befund konnte nicht gelesen werden; es wurde keine Aufgabe erstellt.",
  "citationForward.task.notEligible":
    "Die vom Server gelieferte Befundversion ist nicht die ausgewählte oder nicht mehr geeignet; es wurde keine Aufgabe erstellt.",
  "citationForward.task.stale":
    "Das Projekt oder Konto hat sich während des Lesens des Befunds geändert; es wurde keine Aufgabe erstellt.",
  "citationForward.improvement.rowsPick": "Zu bindende Befundversionen",
  "citationForward.improvement.useCurrent":
    "Die aktuelle Version v{head} statt der angehefteten Zeile binden",
  "citationForward.improvement.publicationPartial":
    "Nur {loaded} von {total} erfassten Versuchen konnten geladen werden; ältere Versuche werden hier nicht angeboten.",
  "citationForward.improvement.historyRow": "frühere Version (Verlauf)",
  "citationForward.inspection.notHead":
    "Es gibt eine neuere Version dieser Verbesserung. Öffnen Sie die aktuelle Version und prüfen Sie diese.",
  "citationForward.inspection.retry": "Dieselbe Prüfung erneut senden",
  "citationForward.error.findingStale":
    "Ein gebundener Befund hat sich seit Ihrer Prüfung dieses Eintrags geändert. Nichts wurde geschrieben; öffnen Sie die aktuelle Befundversion und prüfen Sie erneut.",
  "citationForward.readiness.unavailable":
    "Die Bereitschaft kann nicht angezeigt werden: Die Live-Status konnten nicht aktualisiert werden.",
  "citationForward.improvement.approvalDelegate":
    "Freigegeben durch einen delegierten Prüfer: {email}",
  "citationForward.improvement.approvalNone":
    "Diese Version ist derzeit nicht freigegeben; der Versuch kann nicht gebunden werden.",
  "citationForward.issue.approval_unknown":
    "Der Freigabestatus des gewählten Versuchs konnte nicht geladen werden.",
  "citationForward.issue.approval_unavailable":
    "Die Version des gewählten Versuchs ist derzeit nicht freigegeben.",
};
