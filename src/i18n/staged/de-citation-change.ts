/** German authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const deCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Änderungen an Einträgen und Konfiguration",
  "citationChange.intro":
    "Erfassen Sie die beabsichtigte Änderung als Artefakt (nur die unterstützten, nicht geheimen Felder), genehmigen Sie genau diese Version, erklären Sie, wann sie durchgeführt wurde, und binden Sie dann eine Verbesserung daran. Eine Erklärung ist kein Nachweis vom Zielort.",
  "citationChange.artifact.new": "Neues Änderungsartefakt",
  "citationChange.artifact.kind": "Art",
  "citationChange.artifact.kind.listing": "Eintrag",
  "citationChange.artifact.kind.configuration": "Konfiguration",
  "citationChange.artifact.reference": "Referenz",
  "citationChange.artifact.referenceHint":
    "Die Kennung des Eintrags oder der Einstellung (z. B. die Profil-ID oder der Einstellungspfad). Keine Zugangsdaten.",
  "citationChange.artifact.fields": "Felder",
  "citationChange.artifact.fieldsHint":
    "Nur die unterstützten Felder können erfasst werden; Zugangsdaten, Token und private Einstellungen werden abgelehnt und können hier nicht hinzugefügt werden.",
  "citationChange.artifact.before": "Vorher",
  "citationChange.artifact.after": "Nachher",
  "citationChange.artifact.save": "Artefakt speichern",
  "citationChange.artifact.saved":
    "Artefakt gespeichert (identischer Inhalt liefert das vorhandene Artefakt).",
  "citationChange.artifact.remove":
    "Artefakt löschen (Inhalt wird entfernt; Kennungen bleiben für die Prüfung)",
  "citationChange.artifact.empty": "Noch kein Änderungsartefakt.",
  "citationChange.artifact.unsupported":
    "Nicht unterstütztes Feld oder nicht unterstützter Wert; nichts wurde gespeichert.",
  "citationChange.approval.title": "Genehmigung genau dieser Version",
  "citationChange.approval.approve": "Diese Version genehmigen",
  "citationChange.approval.revoke": "Genehmigung widerrufen",
  "citationChange.approval.owner": "Von mir genehmigt (Inhaber)",
  "citationChange.approval.delegate": "Von einem beauftragten Prüfer genehmigt: {email}",
  "citationChange.approval.none": "Derzeit nicht genehmigt.",
  "citationChange.receipt.title": "Durchführungserklärungen",
  "citationChange.receipt.record": "Jetzt als durchgeführt erklären",
  "citationChange.receipt.recorded": "Erklärung erfasst.",
  "citationChange.receipt.none": "Noch keine Erklärung.",
  "citationChange.receipt.note":
    "Eine Erklärung besagt, dass eine Person die Änderung vorgenommen hat; sie beweist nie, dass der Zielort sie anzeigt.",
  "citationChange.binding.kind": "Bindungsart",
  "citationChange.binding.public": "Veröffentlichter Versuch (öffentliche URL)",
  "citationChange.binding.change": "Änderung an Eintrag / Konfiguration",
  "citationChange.binding.artifact": "Artefakt",
  "citationChange.binding.receipt": "Durchführungserklärung",
  "citationChange.binding.chooseArtifact": "Genehmigtes Artefakt wählen",
  "citationChange.binding.chooseReceipt": "Erklärung wählen",
  "citationChange.issue.artifact_required": "Wählen Sie ein genehmigtes Artefakt.",
  "citationChange.issue.artifact_unapproved": "Das gewählte Artefakt ist derzeit nicht genehmigt.",
  "citationChange.issue.receipt_required":
    "Wählen Sie eine Durchführungserklärung für das Artefakt.",
  "citationChange.independent.title": "Unabhängige Prüfung",
  "citationChange.independent.none": "keine unabhängige Prüfung",
  "citationChange.independent.inconclusive": "nicht eindeutig (keine Bestätigung)",
  "citationChange.independent.disputed":
    "bestritten (ein zugewiesener Prüfer sah die Änderung fehlen; von der geprüften Bereitschaft ausgeschlossen)",
  "citationChange.independent.independently_inspected":
    "unabhängig geprüft (eine andere authentifizierte Person sah die genehmigte Änderung)",
  "citationChange.independent.note":
    "Unabhängige Prüfung ist eine menschliche Prüfung durch eine andere Person im Team; sie ist nie eine automatische Verifizierung oder ein Kausalnachweis, und eine bestrittene Auslieferung wird ausgeschlossen, selbst wenn Sie sie bestätigt haben.",
  "citationChange.eligible.yes": "zählt als geprüfte Änderung",
  "citationChange.eligible.no": "zählt nicht als geprüft",
  "citationChange.assign.title": "Prüfungszuweisungen",
  "citationChange.assign.pick": "Team-Prüfer wählen",
  "citationChange.assign.grant": "Prüfung erteilen",
  "citationChange.assign.revoke": "Widerrufen",
  "citationChange.assign.link": "Link des Prüfers kopieren",
  "citationChange.assign.linkCopied": "Link kopiert.",
  "citationChange.assign.none": "Kein Prüfer zugewiesen.",
  "citationChange.assign.effective": "wirksam",
  "citationChange.assign.ineffective": "nicht mehr wirksam",
  "citationChange.inspect.title": "Eine erfasste Änderung prüfen",
  "citationChange.inspect.intro":
    "Öffnen Sie die genaue Referenz, vergleichen Sie sie mit dem genehmigten Inhalt unten und erfassen Sie dann, was Sie gesehen haben. Das Öffnen der Referenz bestätigt für sich allein nichts.",
  "citationChange.inspect.reference": "Referenz",
  "citationChange.inspect.open": "Referenz öffnen",
  "citationChange.inspect.approvedVersion": "Genehmigte Version",
  "citationChange.inspect.approvedContent": "Genehmigter Inhalt",
  "citationChange.inspect.identity": "Identitäten von Genehmiger und Ausführendem",
  "citationChange.inspect.identityUnavailable":
    "Der Ausführende oder Genehmiger dieser Änderung ist unbekannt (eine ältere Veröffentlichung oder eine ungeklärte Genehmigung); eine unabhängige Quittung kann nicht erfasst werden.",
  "citationChange.inspect.result": "Was haben Sie gesehen?",
  "citationChange.inspect.shows_approved_content": "Zeigt die genehmigte Änderung",
  "citationChange.inspect.does_not_show": "Zeigt sie nicht",
  "citationChange.inspect.inconclusive": "Nicht eindeutig",
  "citationChange.inspect.record": "Prüfung erfassen",
  "citationChange.inspect.retry": "Dieselbe Prüfung erneut versuchen",
  "citationChange.inspect.withdraw": "Meine aktuelle Prüfung zurückziehen",
  "citationChange.inspect.recorded": "Prüfung als v{version} erfasst.",
  "citationChange.inspect.history": "Verlauf meiner Prüfungen",
  "citationChange.inspect.head": "aktuell",
  "citationChange.inspect.withdrawn": "zurückgezogen",
  "citationChange.inspect.loadError":
    "Diese Prüfung konnte nicht geladen werden (nicht zugewiesen, widerrufen oder die Zeile hat sich geändert).",
  "citationChange.readiness.independent": "Unabhängig geprüft: {count}",
  "citationChange.readiness.disputed": "Bestritten (ausgeschlossen): {count}",
  "citationChange.readiness.receipts":
    "Nur Durchführungserklärungen (kein Auslieferungsnachweis): {count}",
  "citationChange.error.unsupported":
    "Nicht unterstütztes Feld, nicht unterstützter Wert oder nicht unterstützte Art; nichts wurde gespeichert.",
  "citationChange.error.unavailable":
    "Der Änderungsdatensatz konnte nicht geladen oder gespeichert werden.",
  "citationChange.error.stale":
    "Das Artefakt hat sich geändert, seit Sie es angesehen haben; öffnen Sie es erneut.",
  "citationChange.error.forbidden": "Sie dürfen dies für dieses Projekt nicht tun.",
  "citationChange.error.unapproved": "Diese Version ist derzeit nicht genehmigt.",
  "citationChange.error.receiptInvalid":
    "Der erklärte Zeitpunkt liegt vor der Genehmigung oder in der Zukunft.",
  "citationChange.error.capacity":
    "Die Kapazität für Änderungsartefakte dieses Projekts ist erreicht.",
  "citationChange.error.receiptCapacity":
    "Die Kapazität für Erklärungen dieses Artefakts ist erreicht; entfernen Sie eine nicht mehr benötigte Erklärung, um eine weitere zu erfassen.",
  "citationChange.error.inspectionInvalid":
    "Die Prüfung ist nicht gültig (Zeitpunkt, Referenz oder Zustand).",
  "citationChange.error.notIndependent":
    "Sie haben diese Änderung durchgeführt oder genehmigt und können sie daher nicht unabhängig prüfen.",
  "citationChange.error.identityUnavailable":
    "Die Identität des Ausführenden oder Genehmigers ist nicht verfügbar; die unabhängige Prüfung wird abgelehnt.",
  "citationChange.error.inspectionConflict":
    "Ihre Prüfungskette hat sich geändert; laden Sie neu und erfassen Sie erneut.",
  "citationChange.error.inspectionQuota":
    "In der letzten Stunde wurden für dieses Projekt zu viele Prüfungen erfasst; nichts wurde erfasst — warten Sie und erfassen Sie erneut.",
  "citationChange.error.inspectionCapacity":
    "Der Prüfungsverlauf dieser Verbesserung oder dieses Projekts ist voll; die Beobachtung wurde nicht erfasst, vorhandene Nachweise bleiben erhalten.",
  "citationChange.error.generic":
    "Die Aktion zu den Änderungsnachweisen konnte nicht abgeschlossen werden.",
  "citationChange.artifact.fieldKey": "Feld",
  "citationChange.artifact.addField": "Feld hinzufügen",
  "citationChange.artifact.removeField": "Entfernen",
  "citationChange.artifact.removed": "Artefakt gelöscht (Prüfkennungen bleiben erhalten).",
  "citationChange.artifact.approvalRevision": "Genehmigungsrevision {revision}",
  "citationChange.approval.approved": "Genehmigung erfasst.",
  "citationChange.approval.revoked": "Genehmigung widerrufen.",
  "citationChange.approval.retry": "Dieselbe Entscheidung erneut versuchen",
  "citationChange.approval.replayed":
    "Dies war eine Wiederholung einer früheren Anfrage; die aktuelle Entscheidung wird nach dem Neuladen angezeigt.",
  "citationChange.receipt.remove": "Erklärung entfernen",
  "citationChange.receipt.removed": "Erklärung entfernt.",
  "citationChange.binding.deleted": "Das gebundene Artefakt wurde gelöscht; nur Kennungen bleiben.",
  "citationChange.detail.changeTitle": "Gebundene Änderung an Eintrag / Konfiguration",
  "citationChange.detail.artifactVersion": "Genehmigte Artefaktversion",
  "citationChange.detail.receiptAt": "Als durchgeführt erklärt am",
  "citationChange.assign.candidatesNone":
    "Kein berechtigter Team-Prüfer zum Zuweisen (Richtlinie oder Liste).",
  "citationChange.assign.granted": "Prüfung erteilt.",
  "citationChange.assign.revoked": "Prüfung widerrufen.",
  "citationChange.inspect.kindPublic": "Veröffentlichte Seite",
  "citationChange.inspect.fresh":
    "Ihre aktuelle Prüfung hat keine Wirkung mehr ({reason}); erfassen Sie eine neue gegen Ihren aktuellen Kettenkopf.",
  "citationChange.inspect.reason.superseded": "durch eine spätere Quittung ersetzt",
  "citationChange.inspect.reason.withdrawn": "zurückgezogen",
  "citationChange.inspect.reason.account": "Konto nicht verfügbar",
  "citationChange.inspect.reason.assignment": "die Zuweisung wurde erneut erteilt",
  "citationChange.inspect.reason.authority": "Ihre Teamberechtigung hat sich geändert",
  "citationChange.inspect.reason.independence": "Sie sind jetzt Ausführender oder Genehmiger",
  "citationChange.inspect.noContent":
    "Der genehmigte Inhalt ist nicht mehr verfügbar (Artefakt gelöscht oder Veröffentlichung fehlt).",
  "citationChange.inspect.boundFindings": "Gebundene Befunde",
  "citationChange.inspect.withdrawnDone": "Prüfung zurückgezogen.",
  "citationChange.dissent.title": "Aktiver Widerspruch zu dieser ausgelieferten Änderung",
  "citationChange.dissent.row": "{inspector} · Zeile {row} · {at}",
  "citationChange.status.receipt_recorded":
    "Durchführungserklärung erfasst (kein Auslieferungsnachweis)",
  "citationChange.artifact.duplicateField":
    "Dieses Feld wird bereits von einer anderen Zeile verwendet; wählen Sie ein anderes Feld oder entfernen Sie die Zeile.",
  "citationChange.artifact.fieldsExhausted":
    "Jedes unterstützte Feld dieser Art hat bereits eine Zeile.",
  "citationChange.approval.pendingNote":
    "Die vorherige Anfrage kam nicht zurück. Erneut versuchen sendet exakt dieselbe Entscheidung (Version {sha}, {decision}, geprüfte Revision {revision}); nichts wird aus dem aktuellen Zustand neu berechnet.",
  "citationChange.approval.newDecision": "Verwerfen und neu entscheiden",
  "citationChange.receipt.retry": "Dieselbe Erklärung erneut versuchen",
  "citationChange.receipt.newPerformance": "Eine neue Durchführung erklären",
  "citationChange.receipt.pendingNote":
    "Die vorherige Erklärung kam nicht zurück. Erneut versuchen sendet exakt denselben erklärten Zeitpunkt ({at}); eine neue Durchführung ist eine separate ausdrückliche Aktion.",
  "citationChange.approval.blockedBy":
    "Klären Sie zuerst die ausstehende Entscheidung für {reference} (erneut versuchen oder verwerfen); andere Genehmigungen warten.",
  "citationChange.receipt.blockedBy":
    "Klären Sie zuerst die ausstehende Erklärung für {reference} (erneut versuchen oder eine neue Durchführung erklären); andere Erklärungen warten.",
  "citationChange.readiness.verified":
    "Geprüfte unterschiedliche Änderungen: {count} von {required} erforderlich (eine Änderung zählt, sobald ihr Nachweis zulässig ist: Ihre eigene Bestätigung oder eine unabhängige Prüfung einer ausgelieferten Änderung; eine bestrittene oder ausgeschlossene Änderung zählt nie)",
  "citationChange.readiness.sources":
    "Erfasste Beobachtungen zu aktuellen Änderungen: vom Inhaber bestätigt {owner}, unabhängig geprüft {independent} (dies sind Zahlen erfasster Beobachtungen, keine zulässigen Nachweise; Einsprüche und Ausschlüsse bestimmen die geprüfte Zahl oben)",
  "citationChange.evidence.independentBaseline":
    "die Basislinie wird durch den unabhängigen Nachweis aufgelöst (keine Inhaberbestätigung in dieser Zeile)",
  "citationChange.inspect.ownerIntro":
    "Öffnen Sie den Eintrag oder die Einstellung an der genauen Referenz, vergleichen Sie mit den genehmigten Feldern unten und erfassen Sie dann, was Sie gesehen haben. Das Öffnen allein bestätigt nichts.",
  "citationChange.inspect.contentUnavailable":
    "Der genaue genehmigte Inhalt dieser Änderung konnte nicht geladen werden (Artefakt gelöscht, geändert oder nicht verfügbar): eine positive Bestätigung ist nicht möglich; ein negatives oder nicht eindeutiges Ergebnis kann weiterhin erfasst werden.",
  "citationChange.receipt.stale":
    "unter der aktuellen Freigabe nicht gültig (unter einer früheren Entscheidung erfasst, oder die Freigabe ist nicht mehr aktuell) — erklären Sie eine neue Ausführung",
  "citationChange.issue.receipt_stale":
    "Die gewählte Erklärung ist unter der aktuellen Freigabe nicht gültig: Sie wurde unter einer früheren Freigabeentscheidung erfasst, oder die Freigabe ist nicht mehr aktuell. Erklären Sie eine neue Ausführung und wählen Sie diese.",
  "citationChange.error.receiptStale":
    "Die Erklärung wurde unter einer früheren Freigabeentscheidung erfasst (die Freigabe wurde seitdem widerrufen oder erneut entschieden). Erklären Sie eine neue Ausführung unter der aktuellen Freigabe und binden Sie stattdessen diese.",
  "citationChange.binding.receiptStale":
    "Die gebundene Erklärung wurde unter einer früheren Freigabeentscheidung erfasst, daher bleibt diese Zeile bei freigabegebunden und keine neue Prüfung kann diese Erklärung binden. Erklären Sie eine neue Ausführung unter der aktuellen Freigabe und erfassen Sie eine neue Verbesserungsversion.",
};
