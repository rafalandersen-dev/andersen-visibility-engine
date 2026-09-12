/** Dutch authoring only; excluded from runtime. */
export const nlCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Huidig projectwerk",
  "awareness.help":
    "Alleen in de app. Deze controles versturen geen e-mail. Blokkeringen blijven zichtbaar totdat de wachtrij verandert; openen keurt werk niet goed en start het niet opnieuw.",
  "awareness.project": "Project kiezen",
  "awareness.approval": "Deze exacte versie vereist goedkeuring",
  "awareness.resume": "Goedgekeurde versie is nog geblokkeerd",
  "awareness.late":
    "Deze datum is verstreken. Beoordeel het concept en kies een expliciete planningsactie.",
  "awareness.paused":
    "Automatisering is bewust gepauzeerd. Bestaande publicatieblokkeringen staan daar los van.",
  "awareness.disabled": "Automatisering is uitgeschakeld.",
  "awareness.settings": "Planningsinstellingen openen",
  "awareness.history":
    "Laatst opgeslagen weekresultaat — historisch, geen nieuwe controle van capaciteit of bronnen",
  "awareness.empty": "Geen goedkeuringsblokkeringen op deze pagina.",
  "awareness.page": "Wachtrijpagina {page} van {pages}",
  "awareness.error":
    "Huidige records konden niet worden gecontroleerd. Vernieuw voordat je handelt.",
  "awareness.checked": "Gecontroleerd op {at}",
  "awareness.weekly": "Huidige records van weekplaatsen",
  "awareness.earlier": "Eerdere meldingen in het postvak",
  "notifications.failureInspect": "Publicatiedetails bekijken",
  "notifications.failureReadError":
    "Publicatiedetails konden niet worden gecontroleerd. Probeer het opnieuw voordat je beslist wat je gaat doen.",
  "notifications.failureReason.contentReview":
    "De opgeslagen poging werd geblokkeerd door contentcontroles. Open het concept om de huidige gereedheid te beoordelen.",
  "notifications.failureReason.destination":
    "De opgeslagen poging meldde een verbindings- of responsfout bij de bestemming. Controleer de bestemming voordat je het opnieuw probeert.",
  "notifications.failureReason.configuration":
    "De opgeslagen poging meldde ontbrekende of ongeldige publicatieconfiguratie. Controleer Projectinstellingen.",
  "notifications.failureReason.unknown":
    "De opgeslagen fout kon niet worden ingedeeld. Beoordeel het concept en de bestemming voordat je het opnieuw probeert.",
  "notifications.failureRecorded":
    "Record bijgewerkt op {at}, in de tijdzone van je browser. Vastgelegde pogingen: {attempts}.",
  "notifications.failureDraftChanged":
    "Het concept is na dit record gewijzigd. Deze details beschrijven mogelijk niet meer de huidige gereedheid.",
  "notifications.failureHttp": "Vastgelegde websiterespons: HTTP {status}.",
  "notifications.failureCheck.links":
    "Los interne links op in het paneel voor linkveiligheid van de editor.",
  "notifications.failureCheck.sourcesReview":
    "Verifieer claims aan de hand van bronnen of een gekwalificeerde auteur en voltooi de menselijke beoordeling.",
  "notifications.failureCheck.author":
    "Voeg de naam van de echte auteur en een biografie, kwalificatie of profiel toe.",
  "notifications.failureHistoryLimit":
    "Dit is historische informatie die in Milo is opgeslagen. Deze controleert de bestemming niet, keurt het huidige concept niet goed en start publicatie niet opnieuw.",
  "notifications.failureState.absent":
    "Geen overeenkomstig wachtrijrecord gevonden. Vernieuw de meldingen en beoordeel het concept.",
  "notifications.failureState.changed":
    "De wachtrij markeert dit item niet meer als mislukt. Vernieuw de meldingen; dit alleen verifieert de bestemmingswebsite niet.",
  "notifications.recoveryInspect": "Opgeslagen werk bekijken",
  "notifications.recoveryReadError":
    "Opgeslagen automatiseringsrecords konden niet worden gecontroleerd. Probeer het opnieuw voordat je beslist om opnieuw te starten.",
  "notifications.recoveryState.absent":
    "Geen huidig uitvoeringsrecord gevonden. Vernieuw de meldingen om te controleren of dit incident is opgelost.",
  "notifications.recoveryState.running": "De laatste uitvoering is gemarkeerd als actief.",
  "notifications.recoveryState.completed":
    "De laatste uitvoering is beëindigd. Vernieuw de meldingen voor huidige problemen.",
  "notifications.recoveryState.review_required":
    "De onderbroken uitvoering moet nog worden beoordeeld.",
  "notifications.recoverySnapshot":
    "Milo-records gecontroleerd op {at}, in de tijdzone van je browser.",
  "notifications.recoveryCounts":
    "Plan {period}: {saved} opgeslagen concepten. Wachtrijrecords voor die concepten: {pending} wachtend, {publishing} in uitvoering, {published} vastgelegd als gepubliceerd, {failed} mislukt en {cancelled} geannuleerd.",
  "notifications.recoveryEvidenceLimit":
    "Dit zijn records die in Milo zijn opgeslagen. Ze verifiëren de laatste AI-bewerking of de bestemmingswebsite niet. Controleer de bestemming voordat je een onzekere publicatie opnieuw probeert. Deze weergave start geen werk opnieuw.",
  "notifications.recoveryMore":
    "{shown} van {total} opgeslagen concepten worden getoond. Open de kalender om het overige werk te bekijken.",
  "notifications.emailAddressUnverified":
    "Je huidige accountadres is niet geverifieerd. Voltooi de e-mailbevestiging en controleer opnieuw. Als een beheerder het adres heeft gewijzigd en je geen bevestigingslink hebt, neem dan contact op met Milo-ondersteuning. Meldingen in de app blijven beschikbaar.",
  "notifications.emailAddressUnavailable":
    "Milo kon je huidige e-mailverificatie niet controleren. Probeer het later opnieuw. Je kunt samenvattingen nog steeds uitschakelen en meldingen in de app gebruiken.",
  "notifications.generation_capacity_low": "Voorbereidingslimiet dekt het plan mogelijk niet",
  "notifications.generation_capacity_unavailable":
    "Voorbereidingslimiet kon niet worden gecontroleerd",
  "notifications.capacityLow":
    "Het plan voor {period} heeft nog {missing} concepten nodig voor dit project en {total} voor al je actieve planningen. Je account heeft nog {remaining} voorbereidingspogingen over in {usagePeriod}. Dit is gedeelde capaciteit, geen belofte van voltooide artikelen. Beoordeel de planning; opgeslagen concepten blijven beschikbaar voor beoordeling en publicatie.",
  "notifications.capacityUnavailable":
    "Milo kon de gedeelde voorbereidingslimiet voor {usagePeriod} niet verifiëren. Het plan voor {period} heeft hier nog {missing} concepten nodig. Controleer later opnieuw. Opgeslagen concepten en andere meldingen blijven beschikbaar.",
  "notifications.scheduler_recovery": "Automatisering vereist herstelbeoordeling",
  "notifications.recovery":
    "Voorbereiding gepauzeerd na een onderbroken uitvoering. Beoordeel opgeslagen concepten en de laatste bewerking voordat je opnieuw start. Bestaande publicatiegoedkeuringen blijven ongewijzigd.",
  "notifications.emailTitle": "E-mailsamenvattingen",
  "notifications.emailDescription":
    "Ontvang één samenvatting van nieuwe meldingen, maximaal één keer per uur, op je bevestigde accountadres. Elk incident verschijnt één keer.",
  "notifications.emailDisabled":
    "E-mailbezorging is nog niet geactiveerd. Meldingen in de app zijn beschikbaar.",
  "notifications.emailEnable": "E-mailsamenvattingen inschakelen",
  "notifications.emailDisable": "E-mailsamenvattingen uitschakelen",
  "notifications.emailError": "E-mailinstellingen zijn tijdelijk niet beschikbaar.",
  "notifications.emailSaveError": "Kan e-mailvoorkeuren niet opslaan.",
  "notifications.emailHistory": "Recente e-mailactiviteit",
  "notifications.emailStatus.pending": "Wachtend",
  "notifications.emailStatus.leased": "Huidige status controleren",
  "notifications.emailStatus.sending": "Versturen",
  "notifications.emailStatus.accepted": "Geaccepteerd door e-mailprovider",
  "notifications.emailStatus.unknown": "Bezorgingsresultaat vereist verificatie",
  "notifications.emailStatus.cancelled": "Geannuleerd",
  "notifications.emailStatus.failed": "Kan e-mail niet voorbereiden",
  "notifications.title": "Meldingen",
  "notifications.subtitle":
    "Je komende beslissingen en publicatieproblemen, gecontroleerd aan de hand van de laatste serverstatus.",
  "notifications.loading": "Je plan controleren…",
  "notifications.empty": "Er zijn nu geen acties die je aandacht vereisen.",
  "notifications.error": "Meldingen zijn tijdelijk niet beschikbaar.",
  "notifications.stale":
    "De laatste controle kon niet worden voltooid. Dit zijn de laatst bevestigde meldingen.",
  "notifications.refresh": "Opnieuw controleren",
  "notifications.read": "Markeren als gelezen",
  "notifications.unread": "Ongelezen",
  "notifications.saved": "Gelezen",
  "notifications.open": "Taak openen",
  "notifications.calendar": "Kalender openen",
  "notifications.project": "Project",
  "notifications.approval_due": "Goedkeuring binnenkort nodig",
  "notifications.publication_failed": "Publicatie moet worden gecontroleerd",
  "notifications.manual_overdue": "Handmatige taak is te laat",
  "notifications.cadence_gap": "Volgende week vereist aandacht",
  "notifications.coverage":
    "{missing} van {total} geplande plaatsen zijn nog niet gereed en in de wachtrij geplaatst.",
  "notifications.failure":
    "Controleer de bestemming voordat je het opnieuw probeert: een onderbroken publicatie kan al live staan.",
  "notifications.approval": "Beoordeel de huidige versie vóór de geplande deadline.",
  "notifications.manual":
    "Voltooi deze taak of kies een nieuwe datum. Deze deadline geldt voor een handmatige taak.",
  "notifications.readError": "Kan deze melding niet als gelezen markeren. Probeer het opnieuw.",
  "team.title": "Het team van Milo",
  "team.help": "Eén werkruimte met specialistische weergaven van echt werk en projectkennis.",
  "team.selectProject": "Kies een project om het team te bekijken.",
  "team.scope":
    "De taakstatus geldt voor de geselecteerde week. Opgeslagen advies en rapporten zijn gedateerde onderbouwing, geen bewijs van een actieve taak of betere resultaten.",
  "team.aiRole": "AI-specialist",
  "team.records": "{count} opgeslagen kennisrecords · beoordeel de status in projectkennis",
  "team.lastDelivery": "Laatste oplevering in de taken van deze week",
  "team.auditFetched": "Opgeslagen website-audit",
  "team.auditPartial": "Opgeslagen audit op basis van alleen projectcontext",
  "team.adviceSaved": "Opgeslagen advies over AI-gereedheid",
  "team.imports": "{count} opgeslagen GSC-meetimports",
  "team.measurementMissing": "Geen opgeslagen GSC-metingen",
  "team.authorityPrerequisite":
    "Providergegevens en toestemming voor outreach moeten in de Backlinks-werkruimte worden gecontroleerd.",
  "team.lesson.title": "Een redactionele les onthouden",
  "team.lesson.help":
    "Schrijf een terugkerende voorkeur voor dit project op. Opslaan maakt er een expliciete projectinstructie voor relevant toekomstig werk van. Gewone artikelbewerkingen maken geen lessen aan. Dit vormt geen feitelijk bewijs.",
  "team.lesson.rule": "Instructie voor dit project",
  "team.lesson.target": "Toepassen op",
  "team.lesson.text": "Tekst",
  "team.lesson.visual": "Beeld",
  "team.lesson.both": "Tekst en beeld",
  "team.lesson.save": "Projectinstructie opslaan",
  "team.lesson.manage": "Kennis beoordelen, bewerken of vergeten",
  "team.lesson.saved":
    "Opgeslagen in dit project. Je kunt dit in projectkennis bewerken, terugdraaien of intrekken.",
  "team.lesson.unknown":
    "Opslaan kon niet worden bevestigd. Controleer projectkennis voordat je de instructie opnieuw invoert.",
  "team.role.lead": "Milo — Groeileider",
  "team.description.lead": "Coördineert de opgeslagen planning, dekking en beslissingen.",
  "team.open.lead": "Weekvoorbereiding beoordelen",
  "team.role.brand": "Merkstrateeg",
  "team.description.brand":
    "Projectfeiten, voorkeuren en terug te draaien lessen, met bron- en beoordelingsgeschiedenis.",
  "team.open.brand": "Projectkennis beoordelen",
  "team.role.research": "Zoekonderzoeker",
  "team.description.research":
    "Wekelijkse onderzoeksbriefings en opgeslagen kansen. Beoordeel bronnen en hypothesen voordat je schrijft.",
  "team.open.research": "Kansen beoordelen",
  "team.role.content": "Contentredacteur",
  "team.description.content":
    "Bewaarde artikelen vereisen nog redactionele beoordeling en publicatiegoedkeuring voor de exacte versie.",
  "team.open.content": "Artikelen beoordelen",
  "team.role.image": "Beeldmaker",
  "team.description.image":
    "Voorgesteld beeld gebruikt projectcontext. Bewaren betekent niet dat het beeld is goedgekeurd.",
  "team.open.image": "Artikelbeelden beoordelen",
  "team.role.seo": "SEO-specialist",
  "team.description.seo":
    "Gedateerde auditbevindingen over pagina's, interne links en lokale aanwezigheid/entiteiten. Gedeeltelijke audits behouden hun beperkingen.",
  "team.open.seo": "SEO-bevindingen beoordelen",
  "team.role.authority": "Backlinks en autoriteit",
  "team.description.authority":
    "Onderzoek, monitoring en voorstellen zijn afhankelijk van geverifieerde providertoegang. Berichten versturen en plaatsingen kopen vereisen aparte toestemming.",
  "team.open.authority": "Backlinks-werkruimte controleren",
  "team.role.ai": "Analist AI-zichtbaarheid",
  "team.description.ai":
    "Gereedheidsadvies staat los van waargenomen antwoorden, vermeldingen en bronverwijzingen. Tracking van waarnemingen is hier niet vastgesteld.",
  "team.open.ai": "Gereedheidsadvies beoordelen",
  "team.role.performance": "Prestatieanalist",
  "team.description.performance":
    "Opgeslagen rapporten en gedateerde metingen. Ontbrekende gegevens zijn onbekend; een verandering tussen vóór en na bewijst op zichzelf geen oorzakelijk verband.",
  "team.open.performance": "Metingen beoordelen",
  "team.state.unavailable": "Status niet beschikbaar",
  "team.state.none": "Geen vastgelegd werk",
  "team.state.unknown": "Resultaat onzeker — herstel beoordelen",
  "team.state.running": "Werk wordt uitgevoerd",
  "team.state.review": "Wijzigingen van de eigenaar vereisen beoordeling",
  "team.state.retained": "Resultaten bewaard ter beoordeling",
  "team.state.cancelled": "Voorbereiding geannuleerd",
  "collaboration.reviewImageLimits":
    "Deze afbeeldingen overschrijden de beoordelingslimieten of kunnen niet veilig worden weergegeven. Verminder hun aantal of grootte en gebruik stilstaande PNG-, JPEG- of WebP-afbeeldingen.",
  "collaboration.emailInvitation": "Uitnodiging e-mailen",
  "collaboration.invitationEmailHelp":
    "Stuur een uitnodiging naar het hierboven getoonde e-mailadres voor de weergegeven rol. De e-maillink openen verleent geen toegang.",
  "collaboration.invitationEmailQueued":
    "Uitnodigingsmail aangevraagd. Controleer hier de bezorgingsstatus.",
  "collaboration.notificationHistory": "Bezorgingsgeschiedenis van meldingen",
  "collaboration.notificationSettings": "Projectmeldingen",
  "collaboration.notificationConsentHelp":
    "Zowel toewijzing door de eigenaar als je eigen toestemming zijn vereist. Wijzigingen in je projectrol vereisen vernieuwde instellingen.",
  "collaboration.notificationAssigned": "Toegewezen door eigenaar",
  "collaboration.notificationNotAssigned": "Niet toegewezen door eigenaar",
  "collaboration.notificationOptedIn": "Ontvanger heeft toestemming gegeven",
  "collaboration.notificationOptedOut": "Ontvanger heeft geen toestemming gegeven",
  "collaboration.notificationAssign": "Meldingen toewijzen",
  "collaboration.notificationUnassign": "Toewijzing verwijderen",
  "collaboration.notificationOptIn": "Projectmeldingen toestaan",
  "collaboration.notificationOptOut": "Projectmeldingen uitschakelen",
  "collaboration.decisionRecorded": "Beoordelingsbeslissing vastgelegd.",
  "collaboration.decisionUnknown":
    "De beslissing kon niet worden bevestigd. Vernieuw eerdere beslissingen voordat je het opnieuw probeert.",
  "collaboration.reviewNotAllowed":
    "Je huidige rol of het projectbeleid staat beoordelingsbeslissingen niet toe.",
  "collaboration.acknowledgeReview": "Ik heb dit weergegeven concept en alle afbeeldingen bekeken.",
  "collaboration.approveVersion": "Deze versie goedkeuren",
  "collaboration.returnForChanges": "Terugsturen voor wijzigingen",
  "collaboration.reviewDoesNotPublish":
    "Een beoordeling vastleggen publiceert het concept niet en hervat geen geblokkeerde planning.",
  "collaboration.reviewHistory": "Eerdere beoordelingsbeslissingen",
  "collaboration.approvalRecorded": "Goedkeuring vastgelegd",
  "collaboration.changesRequested": "Wijzigingen gevraagd",
  "collaboration.owner": "Eigenaar",
  "collaboration.collaborator": "Medewerker",
  "collaboration.renderedReview": "Beoordeling van de weergegeven versie",
  "collaboration.loadingReview": "Volledige beoordeling en afbeeldingen laden…",
  "collaboration.incompleteReview":
    "De volledige beoordeling kon niet worden geladen. Vernieuw om het concept en alle afbeeldingen te controleren.",
  "collaboration.policyTitle": "Goedkeuringsbeleid",
  "collaboration.policyHelp":
    "Kies wie projectwerk kan goedkeuren. Dit beleid wijzigen trekt bestaande goedkeuringen van medewerkers in; onafhankelijke eigenaarsgoedkeuringen blijven behouden.",
  "collaboration.policyUnselected": "Niet geselecteerd — goedkeuring door medewerkers is inactief",
  "collaboration.policy.disabled": "Alleen eigenaarsgoedkeuringen",
  "collaboration.policy.separate_reviewers":
    "Aparte beoordelaars keuren goed; redacteuren bewerken",
  "collaboration.policy.editors_can_approve": "Redacteuren en beoordelaars mogen goedkeuren",
  "collaboration.savePolicy": "Goedkeuringsbeleid opslaan",
  "collaboration.editDraft": "Concept bewerken",
  "collaboration.editHelp":
    "Opslaan stuurt dit concept terug ter beoordeling en trekt de eerdere publicatiegoedkeuring in.",
  "collaboration.editConflict":
    "Het opgeslagen concept of je rol is gewijzigd. Kopieer bewerkingen die je wilt behouden voordat je de laatst opgeslagen versie laadt.",
  "collaboration.loadLatest": "Laatst opgeslagen versie laden",
  "collaboration.draftSaved": "Concept opgeslagen ter beoordeling.",
  "collaboration.editError":
    "Het concept kon niet worden opgeslagen. Je bewerkingen staan er nog; controleer de huidige versie en je toegang voordat je het opnieuw probeert.",
  "collaboration.saveDraft": "Opslaan ter beoordeling",
  "collaboration.question": "Vraag",
  "collaboration.answer": "Antwoord",
  "collaboration.removeQuestion": "Vraag verwijderen",
  "collaboration.addQuestion": "Vraag toevoegen",
  "collaboration.field.title": "Titel",
  "collaboration.field.h1": "Hoofdkop",
  "collaboration.field.metaTitle": "Zoektitel",
  "collaboration.field.metaDescription": "Zoekbeschrijving",
  "collaboration.field.markdown": "Artikel (Markdown)",
  "collaboration.field.cta": "Oproep tot actie",
  "collaboration.field.outline": "Opzet — één kop per regel",
  "collaboration.field.faq": "Vragen en antwoorden",
  "collaboration.comments": "Reacties",
  "collaboration.commentLabel": "Je reactie",
  "collaboration.addComment": "Reactie toevoegen",
  "collaboration.you": "Jij",
  "collaboration.commentRoleAtPosting": "Rol bij plaatsing",
  "collaboration.earlierVersion": "Reactie op een eerdere opgeslagen versie.",
  "collaboration.title": "Projectmedewerkers",
  "collaboration.subtitle": "Beheer projecttoegang en open werk dat met je is gedeeld.",
  "collaboration.owned": "Je project beheren",
  "collaboration.shared": "Gedeeld met jou",
  "collaboration.invitations": "Je uitnodigingen",
  "collaboration.members": "Personen met toegang",
  "collaboration.pending": "Projectuitnodigingen",
  "collaboration.email": "E-mailadres",
  "collaboration.role": "Rol",
  "collaboration.viewer": "Kijker",
  "collaboration.editor": "Redacteur",
  "collaboration.reviewer": "Beoordelaar",
  "collaboration.invite": "Uitnodiging aanmaken",
  "collaboration.inviteHelp":
    "De uitnodiging verschijnt hier wanneer de ontvanger inlogt met dit geverifieerde e-mailadres. Deze verloopt na zeven dagen. Deze actie verstuurt geen e-mail.",
  "collaboration.accept": "Uitnodiging accepteren",
  "collaboration.revoke": "Uitnodiging intrekken",
  "collaboration.remove": "Toegang verwijderen",
  "collaboration.saveRole": "Rol opslaan",
  "collaboration.refresh": "Vernieuwen",
  "collaboration.open": "Project openen",
  "collaboration.loading": "Projecttoegang laden…",
  "collaboration.error":
    "Toegang kon niet worden bevestigd. Vernieuw voordat je het opnieuw probeert.",
  "collaboration.saved": "Projecttoegang bijgewerkt.",
  "collaboration.empty": "Nog niets om te tonen.",
  "collaboration.noOwned":
    "Je kunt hieronder gedeelde projecten openen zonder een eigen project aan te maken.",
  "collaboration.drafts": "Projectconcepten",
  "collaboration.back": "Terug naar concepten",
  "collaboration.previous": "Vorige",
  "collaboration.next": "Volgende",
  "collaboration.removed": "Verwijderd",
  "collaboration.expires": "Verloopt",
  "collaboration.history": "Recente toegangsactiviteit",
  "collaboration.pendingState": "In afwachting",
  "collaboration.expired": "Verlopen",
  "collaboration.accepted": "Geaccepteerd",
  "collaboration.revoked": "Ingetrokken",
  "emailSettings.language": "E-mailtaal",
  "emailSettings.note":
    "Kies de taal voor je operationele samenvattingen, maandrapporten en projectuitnodigingen die je aanvraagt. Dit verandert je app-, artikel- of marktinstellingen niet. De taal opslaan schakelt e-mail niet in en verstuurt geen e-mail.",
  "emailSettings.save": "E-mailtaal opslaan",
  "emailSettings.saved": "E-mailinstellingen opgeslagen.",
  "emailSettings.uncertain":
    "De opgeslagen instellingen konden niet worden bevestigd. Laad ze opnieuw voordat je nog een wijziging maakt; je laatste wijziging kan al zijn opgeslagen.",
  "emailSettings.reload": "Opgeslagen instellingen opnieuw laden (bewerkingen verwerpen)",
};
