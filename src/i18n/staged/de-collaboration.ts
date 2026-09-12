/** German authoring only. */
export const deCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Aktuelle Projektarbeit",
  "awareness.help":
    "Nur in der App. Diese Prüfungen senden keine E-Mails. Zurückgehaltene Arbeit bleibt sichtbar, bis sich die Warteschlange ändert; durch das Öffnen wird sie weder freigegeben noch neu gestartet.",
  "awareness.project": "Projekt auswählen",
  "awareness.approval": "Genau diese Version benötigt eine Freigabe",
  "awareness.resume": "Die freigegebene Version wird weiterhin zurückgehalten",
  "awareness.late":
    "Dieses Datum ist verstrichen. Prüfe den Entwurf und wähle ausdrücklich eine Terminierungsaktion.",
  "awareness.paused":
    "Die Automatisierung ist absichtlich pausiert. Bestehende Veröffentlichungssperren bleiben davon unabhängig.",
  "awareness.disabled": "Die Automatisierung ist deaktiviert.",
  "awareness.settings": "Zeitplaneinstellungen öffnen",
  "awareness.history":
    "Letztes gespeichertes Wochenergebnis — historisch, keine neue Prüfung von Kapazität oder Quellen",
  "awareness.empty": "Auf dieser Seite wartet keine zurückgehaltene Arbeit auf Freigabe.",
  "awareness.page": "Warteschlangenseite {page} von {pages}",
  "awareness.error":
    "Aktuelle Datensätze konnten nicht geprüft werden. Aktualisiere die Ansicht, bevor du handelst.",
  "awareness.checked": "Geprüft am {at}",
  "awareness.weekly": "Aktuelle Datensätze der Wochentermine",
  "awareness.earlier": "Frühere Hinweise im Posteingang",
  "notifications.failureInspect": "Veröffentlichungsdetails prüfen",
  "notifications.failureReadError":
    "Veröffentlichungsdetails konnten nicht geprüft werden. Versuche es erneut, bevor du über das weitere Vorgehen entscheidest.",
  "notifications.failureReason.contentReview":
    "Der gespeicherte Versuch wurde durch Inhaltsprüfungen gesperrt. Öffne den Entwurf, um seine aktuelle Bereitschaft zu prüfen.",
  "notifications.failureReason.destination":
    "Beim gespeicherten Versuch wurde ein Verbindungs- oder Antwortfehler des Ziels gemeldet. Prüfe das Ziel vor einem erneuten Versuch.",
  "notifications.failureReason.configuration":
    "Beim gespeicherten Versuch wurde eine fehlende oder ungültige Veröffentlichungskonfiguration gemeldet. Prüfe die Projekteinrichtung.",
  "notifications.failureReason.unknown":
    "Der gespeicherte Fehler konnte nicht zugeordnet werden. Prüfe Entwurf und Ziel vor einem erneuten Versuch.",
  "notifications.failureRecorded":
    "Datensatz aktualisiert am {at}, in der Zeitzone deines Browsers. Erfasste Versuche: {attempts}.",
  "notifications.failureDraftChanged":
    "Der Entwurf wurde nach diesem Datensatz geändert. Diese Details beschreiben möglicherweise nicht mehr seine aktuelle Bereitschaft.",
  "notifications.failureHttp": "Erfasste Website-Antwort: HTTP {status}.",
  "notifications.failureCheck.links":
    "Kläre interne Links im Bereich zur Linksicherheit des Editors.",
  "notifications.failureCheck.sourcesReview":
    "Prüfe die Aussagen anhand von Quellen oder mit einem qualifizierten Autor und schließe die menschliche Prüfung ab.",
  "notifications.failureCheck.author":
    "Füge den Namen des tatsächlichen Autors sowie eine Biografie, Qualifikation oder ein Profil hinzu.",
  "notifications.failureHistoryLimit":
    "Dies sind in Milo gespeicherte historische Informationen. Sie prüfen weder das Ziel noch geben sie den aktuellen Entwurf frei oder starten die Veröffentlichung neu.",
  "notifications.failureState.absent":
    "Kein passender Warteschlangeneintrag gefunden. Aktualisiere die Benachrichtigungen und prüfe den Entwurf.",
  "notifications.failureState.changed":
    "Die Warteschlange kennzeichnet diesen Eintrag nicht mehr als fehlgeschlagen. Aktualisiere die Benachrichtigungen; allein dadurch wird die Zielwebsite nicht verifiziert.",
  "notifications.recoveryInspect": "Gespeicherte Arbeit prüfen",
  "notifications.recoveryReadError":
    "Gespeicherte Automatisierungsdatensätze konnten nicht geprüft werden. Versuche es erneut, bevor du über einen Neustart entscheidest.",
  "notifications.recoveryState.absent":
    "Kein aktueller Ausführungsdatensatz gefunden. Aktualisiere die Benachrichtigungen, um zu prüfen, ob dieser Vorfall behoben wurde.",
  "notifications.recoveryState.running": "Die letzte Ausführung ist als aktiv markiert.",
  "notifications.recoveryState.completed":
    "Die letzte Ausführung ist beendet. Aktualisiere die Benachrichtigungen für aktuelle Probleme.",
  "notifications.recoveryState.review_required":
    "Die unterbrochene Ausführung muss weiterhin geprüft werden.",
  "notifications.recoverySnapshot":
    "Milo-Datensätze geprüft am {at}, in der Zeitzone deines Browsers.",
  "notifications.recoveryCounts":
    "Plan {period}: {saved} gespeicherte Entwürfe. Warteschlangeneinträge für diese Entwürfe: {pending} wartend, {publishing} in Bearbeitung, {published} als veröffentlicht erfasst, {failed} fehlgeschlagen und {cancelled} abgesagt.",
  "notifications.recoveryEvidenceLimit":
    "Dies sind in Milo gespeicherte Datensätze. Sie verifizieren weder den letzten KI-Vorgang noch die Zielwebsite. Prüfe das Ziel, bevor du eine Veröffentlichung mit unklarem Ausgang erneut versuchst. Diese Ansicht startet keine Arbeit neu.",
  "notifications.recoveryMore":
    "{shown} von {total} gespeicherten Entwürfen werden angezeigt. Öffne den Kalender, um die übrige Arbeit zu prüfen.",
  "notifications.emailAddressUnverified":
    "Deine aktuelle Konto-E-Mail-Adresse ist nicht bestätigt. Bestätige die Adresse und prüfe dann erneut. Wurde die Adresse von einem Administrator geändert und hast du keinen Bestätigungslink, kontaktiere den Milo-Support. Benachrichtigungen in der App bleiben verfügbar.",
  "notifications.emailAddressUnavailable":
    "Milo konnte die aktuelle Bestätigung deiner E-Mail-Adresse nicht prüfen. Versuche es später erneut. Du kannst Zusammenfassungen weiterhin ausschalten und Benachrichtigungen in der App nutzen.",
  "notifications.generation_capacity_low":
    "Das Vorbereitungskontingent reicht möglicherweise nicht für den Plan",
  "notifications.generation_capacity_unavailable":
    "Das Vorbereitungskontingent konnte nicht geprüft werden",
  "notifications.capacityLow":
    "Für den Plan {period} fehlen noch {missing} Entwürfe in diesem Projekt und {total} in deinen aktiven Zeitplänen insgesamt. Dein Konto hat in {usagePeriod} noch {remaining} Vorbereitungsversuche. Dies ist gemeinsame Kapazität, keine Zusage fertiger Artikel. Prüfe den Zeitplan; gespeicherte Entwürfe bleiben zur Prüfung und Veröffentlichung verfügbar.",
  "notifications.capacityUnavailable":
    "Milo konnte das gemeinsame Vorbereitungskontingent für {usagePeriod} nicht verifizieren. Für den Plan {period} fehlen hier noch {missing} Entwürfe. Prüfe später erneut. Gespeicherte Entwürfe und andere Benachrichtigungen bleiben verfügbar.",
  "notifications.scheduler_recovery": "Die Automatisierung benötigt eine Wiederherstellungsprüfung",
  "notifications.recovery":
    "Die Vorbereitung wurde nach einer unterbrochenen Ausführung pausiert. Prüfe gespeicherte Entwürfe und den letzten Vorgang vor einem Neustart. Bestehende Veröffentlichungsfreigaben bleiben unverändert.",
  "notifications.emailTitle": "E-Mail-Zusammenfassungen",
  "notifications.emailDescription":
    "Erhalte eine Zusammenfassung neuer Hinweise, höchstens einmal pro Stunde, an deine bestätigte Kontoadresse. Jeder Vorfall erscheint einmal.",
  "notifications.emailDisabled":
    "Der E-Mail-Versand ist noch nicht aktiviert. Benachrichtigungen in der App sind verfügbar.",
  "notifications.emailEnable": "E-Mail-Zusammenfassungen aktivieren",
  "notifications.emailDisable": "E-Mail-Zusammenfassungen ausschalten",
  "notifications.emailError": "E-Mail-Einstellungen sind vorübergehend nicht verfügbar.",
  "notifications.emailSaveError": "E-Mail-Einstellungen konnten nicht gespeichert werden.",
  "notifications.emailHistory": "Letzte E-Mail-Aktivität",
  "notifications.emailStatus.pending": "Wartend",
  "notifications.emailStatus.leased": "Aktueller Status wird geprüft",
  "notifications.emailStatus.sending": "Wird gesendet",
  "notifications.emailStatus.accepted": "Vom E-Mail-Anbieter angenommen",
  "notifications.emailStatus.unknown": "Das Zustellergebnis muss verifiziert werden",
  "notifications.emailStatus.cancelled": "Abgebrochen",
  "notifications.emailStatus.failed": "E-Mail konnte nicht vorbereitet werden",
  "notifications.title": "Benachrichtigungen",
  "notifications.subtitle":
    "Deine anstehenden Entscheidungen und Veröffentlichungsprobleme, mit dem neuesten Serverstand abgeglichen.",
  "notifications.loading": "Dein Plan wird geprüft…",
  "notifications.empty": "Derzeit benötigt keine Aktion deine Aufmerksamkeit.",
  "notifications.error": "Benachrichtigungen sind vorübergehend nicht verfügbar.",
  "notifications.stale":
    "Die letzte Prüfung konnte nicht abgeschlossen werden. Dies sind die zuletzt bestätigten Hinweise.",
  "notifications.refresh": "Erneut prüfen",
  "notifications.read": "Als gelesen markieren",
  "notifications.unread": "Ungelesen",
  "notifications.saved": "Gelesen",
  "notifications.open": "Aufgabe öffnen",
  "notifications.calendar": "Kalender öffnen",
  "notifications.project": "Projekt",
  "notifications.approval_due": "Freigabe bald fällig",
  "notifications.publication_failed": "Veröffentlichung muss geprüft werden",
  "notifications.manual_overdue": "Manuelle Aufgabe ist überfällig",
  "notifications.cadence_gap": "Nächste Woche benötigt Aufmerksamkeit",
  "notifications.coverage":
    "{missing} von {total} geplanten Terminen sind noch nicht sowohl bereit als auch in die Warteschlange aufgenommen.",
  "notifications.failure":
    "Prüfe das Ziel vor einem erneuten Versuch: Eine unterbrochene Veröffentlichung kann bereits live sein.",
  "notifications.approval": "Prüfe die aktuelle Version vor ihrer geplanten Frist.",
  "notifications.manual":
    "Schließe diese Aufgabe ab oder wähle ein neues Datum. Diese Frist gilt für eine manuelle Aufgabe.",
  "notifications.readError":
    "Diese Benachrichtigung konnte nicht als gelesen markiert werden. Bitte versuche es erneut.",
  "emailSettings.language": "E-Mail-Sprache",
  "emailSettings.note":
    "Wähle die Sprache für deine betrieblichen Zusammenfassungen, Monatsberichte und von dir angeforderten Projekteinladungen. Dies ändert keine App-, Artikel- oder Markteinstellungen. Das Speichern der Sprache aktiviert oder versendet keine E-Mails.",
  "emailSettings.save": "E-Mail-Sprache speichern",
  "emailSettings.saved": "E-Mail-Einstellungen gespeichert.",
  "emailSettings.uncertain":
    "Die gespeicherten Einstellungen konnten nicht bestätigt werden. Lade sie vor einer weiteren Änderung neu; deine letzte Änderung kann bereits gespeichert sein.",
  "emailSettings.reload": "Gespeicherte Einstellungen neu laden (Änderungen verwerfen)",
  "team.title": "Milos Team",
  "team.help":
    "Ein Arbeitsbereich mit spezialisierten Ansichten tatsächlicher Arbeit und des Projektwissens.",
  "team.selectProject": "Wähle ein Projekt aus, um sein Team zu sehen.",
  "team.scope":
    "Der Auftragsstatus bezieht sich auf die ausgewählte Woche. Gespeicherte Empfehlungen und Berichte sind datierte Nachweise, kein Beleg für einen aktiven Auftrag oder verbesserte Ergebnisse.",
  "team.aiRole": "KI-Spezialist",
  "team.records": "{count} gespeicherte Wissenseinträge · Prüfstatus im Projektwissen ansehen",
  "team.lastDelivery": "Letzte Lieferung in den Aufträgen dieser Woche",
  "team.auditFetched": "Gespeichertes Website-Audit",
  "team.auditPartial": "Gespeichertes Audit nur anhand des Projektkontexts",
  "team.adviceSaved": "Gespeicherte Empfehlungen zur KI-Bereitschaft",
  "team.imports": "{count} gespeicherte GSC-Messdatenimporte",
  "team.measurementMissing": "Keine gespeicherten GSC-Messdaten",
  "team.authorityPrerequisite":
    "Anbieterdaten und die Befugnis zur Kontaktaufnahme müssen im Backlinks-Bereich geprüft werden.",
  "team.lesson.title": "Eine redaktionelle Lektion merken",
  "team.lesson.help":
    "Formuliere eine wiederkehrende Präferenz für dieses Projekt. Durch das Speichern wird sie zu einer ausdrücklichen Projektanweisung für relevante künftige Arbeit. Gewöhnliche Artikeländerungen erzeugen keine Lektionen. Dies begründet keinen Faktennachweis.",
  "team.lesson.rule": "Anweisung für dieses Projekt",
  "team.lesson.target": "Anwenden auf",
  "team.lesson.text": "Texte",
  "team.lesson.visual": "Bildmaterial",
  "team.lesson.both": "Texte und Bildmaterial",
  "team.lesson.save": "Projektanweisung speichern",
  "team.lesson.manage": "Wissen prüfen, bearbeiten oder vergessen",
  "team.lesson.saved":
    "In diesem Projekt gespeichert. Du kannst die Anweisung im Projektwissen bearbeiten, zurücksetzen oder widerrufen.",
  "team.lesson.unknown":
    "Das Speichern konnte nicht bestätigt werden. Prüfe das Projektwissen, bevor du die Anweisung erneut eingibst.",
  "team.role.lead": "Milo — Wachstumsleiter",
  "team.description.lead":
    "Koordiniert den gespeicherten Zeitplan, die Abdeckung und Entscheidungen.",
  "team.open.lead": "Wöchentliche Vorbereitung prüfen",
  "team.role.brand": "Markenstratege",
  "team.description.brand":
    "Projektfakten, Präferenzen und widerrufbare Lektionen mit Quellen- und Prüfverlauf.",
  "team.open.brand": "Projektwissen prüfen",
  "team.role.research": "Suchrechercheur",
  "team.description.research":
    "Wöchentliche Recherchebriefings und gespeicherte Chancen. Prüfe Quellen und Hypothesen vor dem Schreiben.",
  "team.open.research": "Chancen prüfen",
  "team.role.content": "Redakteur",
  "team.description.content":
    "Gespeicherte Artikel benötigen weiterhin eine redaktionelle Prüfung und eine Veröffentlichungsfreigabe für genau ihre Version.",
  "team.open.content": "Artikel prüfen",
  "team.role.image": "Bildgestalter",
  "team.description.image":
    "Vorgeschlagenes Bildmaterial nutzt den Projektkontext. Die Speicherung bedeutet keine visuelle Freigabe.",
  "team.open.image": "Artikelbilder prüfen",
  "team.role.seo": "SEO-Spezialist",
  "team.description.seo":
    "Datierte Audit-Ergebnisse zu Onpage-SEO, internen Links und lokalen Aspekten/Entitäten. Die Grenzen unvollständiger Audits gelten weiterhin.",
  "team.open.seo": "SEO-Ergebnisse prüfen",
  "team.role.authority": "Backlinks und Autorität",
  "team.description.authority":
    "Recherche, Überwachung und Vorschläge hängen von verifiziertem Anbieterzugang ab. Das Senden von Nachrichten und Kaufen von Platzierungen erfordern eine gesonderte Befugnis.",
  "team.open.authority": "Backlinks-Bereich prüfen",
  "team.role.ai": "Analyst für KI-Sichtbarkeit",
  "team.description.ai":
    "Empfehlungen zur Bereitschaft sind von beobachteten Antworten, Erwähnungen und Zitierungen getrennt. Eine Beobachtungsmessung ist hier nicht belegt.",
  "team.open.ai": "Empfehlungen zur Bereitschaft prüfen",
  "team.role.performance": "Leistungsanalyst",
  "team.description.performance":
    "Gespeicherte Berichte und datierte Messungen. Fehlende Daten sind unbekannt; allein eine Vorher-nachher-Änderung belegt keine Kausalität.",
  "team.open.performance": "Messungen prüfen",
  "team.state.unavailable": "Status nicht verfügbar",
  "team.state.none": "Keine erfasste Arbeit",
  "team.state.unknown": "Ergebnis ungewiss — Wiederherstellung prüfen",
  "team.state.running": "Arbeit läuft",
  "team.state.review": "Änderungen des Inhabers müssen geprüft werden",
  "team.state.retained": "Ergebnisse zur Prüfung gespeichert",
  "team.state.cancelled": "Vorbereitung abgebrochen",
  "collaboration.reviewImageLimits":
    "Diese Bilder überschreiten die Prüfgrenzen oder können nicht sicher angezeigt werden. Reduziere ihre Anzahl oder Größe und verwende unbewegte PNG-, JPEG- oder WebP-Bilder.",
  "collaboration.emailInvitation": "Einladung per E-Mail senden",
  "collaboration.invitationEmailHelp":
    "Sende eine Einladung für die angezeigte Rolle an die oben angegebene E-Mail-Adresse. Das Öffnen des E-Mail-Links gewährt keinen Zugriff.",
  "collaboration.invitationEmailQueued":
    "Einladungs-E-Mail angefordert. Prüfe hier ihren Zustellstatus.",
  "collaboration.notificationHistory": "Verlauf der Benachrichtigungszustellung",
  "collaboration.notificationSettings": "Projektbenachrichtigungen",
  "collaboration.notificationConsentHelp":
    "Sowohl die Zuweisung durch den Inhaber als auch deine eigene Zustimmung sind erforderlich. Bei Änderungen deiner Projektrolle müssen die Einstellungen erneuert werden.",
  "collaboration.notificationAssigned": "Vom Inhaber zugewiesen",
  "collaboration.notificationNotAssigned": "Nicht vom Inhaber zugewiesen",
  "collaboration.notificationOptedIn": "Empfänger hat zugestimmt",
  "collaboration.notificationOptedOut": "Empfänger hat nicht zugestimmt",
  "collaboration.notificationAssign": "Benachrichtigungen zuweisen",
  "collaboration.notificationUnassign": "Zuweisung entfernen",
  "collaboration.notificationOptIn": "Projektbenachrichtigungen erlauben",
  "collaboration.notificationOptOut": "Projektbenachrichtigungen ausschalten",
  "collaboration.decisionRecorded": "Prüfentscheidung erfasst.",
  "collaboration.decisionUnknown":
    "Die Entscheidung konnte nicht bestätigt werden. Aktualisiere frühere Entscheidungen vor einem erneuten Versuch.",
  "collaboration.reviewNotAllowed":
    "Deine aktuelle Rolle oder die Projektrichtlinie erlaubt keine Prüfentscheidungen.",
  "collaboration.acknowledgeReview":
    "Ich habe diesen gerenderten Entwurf und alle seine Bilder geprüft.",
  "collaboration.approveVersion": "Diese Version freigeben",
  "collaboration.returnForChanges": "Zur Überarbeitung zurückgeben",
  "collaboration.reviewDoesNotPublish":
    "Das Erfassen einer Prüfung veröffentlicht den Entwurf nicht und setzt keinen zurückgehaltenen Zeitplan fort.",
  "collaboration.reviewHistory": "Frühere Prüfentscheidungen",
  "collaboration.approvalRecorded": "Freigabe erfasst",
  "collaboration.changesRequested": "Änderungen angefordert",
  "collaboration.owner": "Inhaber",
  "collaboration.collaborator": "Mitwirkender",
  "collaboration.renderedReview": "Gerenderte Prüfansicht",
  "collaboration.loadingReview": "Vollständige Prüfansicht und ihre Bilder werden geladen…",
  "collaboration.incompleteReview":
    "Die vollständige Prüfansicht konnte nicht geladen werden. Aktualisiere die Ansicht, um den Entwurf und alle seine Bilder zu prüfen.",
  "collaboration.policyTitle": "Freigaberichtlinie",
  "collaboration.policyHelp":
    "Wähle, wer Projektarbeit freigeben darf. Eine Änderung dieser Richtlinie zieht bestehende Freigaben von Mitwirkenden zurück; unabhängige Freigaben des Inhabers bleiben erhalten.",
  "collaboration.policyUnselected": "Nicht ausgewählt — Freigaben durch Mitwirkende sind inaktiv",
  "collaboration.policy.disabled": "Nur Freigaben des Inhabers",
  "collaboration.policy.separate_reviewers": "Separate Prüfer geben frei; Redakteure bearbeiten",
  "collaboration.policy.editors_can_approve": "Redakteure und Prüfer dürfen freigeben",
  "collaboration.savePolicy": "Freigaberichtlinie speichern",
  "collaboration.editDraft": "Entwurf bearbeiten",
  "collaboration.editHelp":
    "Das Speichern gibt diesen Entwurf erneut zur Prüfung und zieht seine vorherige Veröffentlichungsfreigabe zurück.",
  "collaboration.editConflict":
    "Der gespeicherte Entwurf oder deine Rolle hat sich geändert. Kopiere alle Änderungen, die du behalten möchtest, bevor du die neueste gespeicherte Version lädst.",
  "collaboration.loadLatest": "Neueste gespeicherte Version laden",
  "collaboration.draftSaved": "Entwurf zur Prüfung gespeichert.",
  "collaboration.editError":
    "Der Entwurf konnte nicht gespeichert werden. Deine Änderungen sind noch hier; prüfe die aktuelle Version und deinen Zugriff vor einem erneuten Versuch.",
  "collaboration.saveDraft": "Zur Prüfung speichern",
  "collaboration.question": "Frage",
  "collaboration.answer": "Antwort",
  "collaboration.removeQuestion": "Frage entfernen",
  "collaboration.addQuestion": "Frage hinzufügen",
  "collaboration.field.title": "Titel",
  "collaboration.field.h1": "Hauptüberschrift",
  "collaboration.field.metaTitle": "Suchtitel",
  "collaboration.field.metaDescription": "Suchbeschreibung",
  "collaboration.field.markdown": "Artikel (Markdown)",
  "collaboration.field.cta": "Handlungsaufforderung",
  "collaboration.field.outline": "Gliederung — eine Überschrift pro Zeile",
  "collaboration.field.faq": "Fragen und Antworten",
  "collaboration.comments": "Kommentare",
  "collaboration.commentLabel": "Dein Kommentar",
  "collaboration.addComment": "Kommentar hinzufügen",
  "collaboration.you": "Du",
  "collaboration.commentRoleAtPosting": "Rolle beim Verfassen",
  "collaboration.earlierVersion": "Kommentar zu einer früheren gespeicherten Version.",
  "collaboration.title": "Projektmitwirkende",
  "collaboration.subtitle": "Verwalte Projektzugriffe und öffne mit dir geteilte Arbeit.",
  "collaboration.owned": "Dein Projekt verwalten",
  "collaboration.shared": "Mit dir geteilt",
  "collaboration.invitations": "Deine Einladungen",
  "collaboration.members": "Personen mit Zugriff",
  "collaboration.pending": "Projekteinladungen",
  "collaboration.email": "E-Mail-Adresse",
  "collaboration.role": "Rolle",
  "collaboration.viewer": "Betrachter",
  "collaboration.editor": "Redakteur",
  "collaboration.reviewer": "Prüfer",
  "collaboration.invite": "Einladung erstellen",
  "collaboration.inviteHelp":
    "Die Einladung erscheint hier, wenn sich der Empfänger mit dieser bestätigten E-Mail-Adresse anmeldet. Sie läuft nach sieben Tagen ab. Diese Aktion sendet keine E-Mail.",
  "collaboration.accept": "Einladung annehmen",
  "collaboration.revoke": "Einladung widerrufen",
  "collaboration.remove": "Zugriff entfernen",
  "collaboration.saveRole": "Rolle speichern",
  "collaboration.refresh": "Aktualisieren",
  "collaboration.open": "Projekt öffnen",
  "collaboration.loading": "Projektzugriff wird geladen…",
  "collaboration.error":
    "Der Zugriff konnte nicht bestätigt werden. Aktualisiere die Ansicht vor einem erneuten Versuch.",
  "collaboration.saved": "Projektzugriff aktualisiert.",
  "collaboration.empty": "Noch nichts anzuzeigen.",
  "collaboration.noOwned":
    "Du kannst unten geteilte Projekte öffnen, ohne ein eigenes Projekt zu erstellen.",
  "collaboration.drafts": "Projektentwürfe",
  "collaboration.back": "Zurück zu den Entwürfen",
  "collaboration.previous": "Zurück",
  "collaboration.next": "Weiter",
  "collaboration.removed": "Entfernt",
  "collaboration.expires": "Läuft ab",
  "collaboration.history": "Letzte Zugriffsaktivität",
  "collaboration.pendingState": "Ausstehend",
  "collaboration.expired": "Abgelaufen",
  "collaboration.accepted": "Angenommen",
  "collaboration.revoked": "Widerrufen",
};
