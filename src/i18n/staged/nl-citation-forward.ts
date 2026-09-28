/** Dutch authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const nlCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Laden…",
  "citationForward.title": "Van bevinding naar geverifieerde wijziging",
  "citationForward.intro":
    "Neem een geaccepteerde bevindingsversie over in een Plan-taak, schrijf de wijziging in Studio, publiceer die via de bestaande goedkeuring en leg vast wat u werkelijk op de bestemming hebt geïnspecteerd.",
  "citationForward.authority":
    "Het accepteren van een bevinding verleent niets: publicatie vereist nog steeds de Studio-goedkeuring en uw gewone Manual/Review/Autopilot-rechten. Een taak, een concept, een goedkeuring of een bevestiging van de connector is nooit bewijs dat de pagina de wijziging toont.",
  "citationForward.findings.title": "Bevindingen en Plan-taken",
  "citationForward.findings.empty":
    "Nog geen koppelbare bevinding (geaccepteerd of in afwachting van tweede beoordeling, huidige versie).",
  "citationForward.findings.pick": "Bevindingsversie",
  "citationForward.findings.pickPlaceholder": "Kies een bevindingsversie",
  "citationForward.findings.pinned": "Vastgezet op v{pinned} · huidig v{head}",
  "citationForward.findings.state.current": "huidige versie",
  "citationForward.findings.state.superseded":
    "vervangen door een nieuwere versie (de vastzetting blijft op de beoordeelde rij)",
  "citationForward.findings.state.deleted": "vastgezette rij verwijderd",
  "citationForward.findings.state.dismissed": "door u afgewezen (niet koppelbaar)",
  "citationForward.findings.state.dissent": "onafhankelijk bezwaar vastgelegd",
  "citationForward.findings.state.second_review": "in afwachting van tweede beoordeling",
  "citationForward.task.create": "Plan-taak maken vanuit deze versie",
  "citationForward.task.attach": "Aan bestaande taak toevoegen",
  "citationForward.task.attachPlaceholder": "Kies een taak",
  "citationForward.task.created": "Plan-taak gemaakt.",
  "citationForward.task.attached": "Aan de taak toegevoegd.",
  "citationForward.task.listTitle": "Taken gekoppeld aan deze bevindingsversie",
  "citationForward.task.listEmpty": "Er is geen taak aan deze bevindingsversie gekoppeld.",
  "citationForward.task.state.active": "actief",
  "citationForward.task.state.archived": "gearchiveerd",
  "citationForward.task.state.deleted": "verwijderd",
  "citationForward.task.state.missing": "ontbreekt (taak niet meer in deze werkruimte)",
  "citationForward.task.localNote":
    "Taakidentiteit en koppelingen leven in de opslag van uw werkruimte; ze geven geen beoordelaarstoegang en zijn geen serverbewijs.",
  "citationForward.studio.manualDraft": "Handmatig concept maken in Studio (zonder AI)",
  "citationForward.studio.manualNote":
    "Een handmatig concept kost niets en begint leeg; het AI-generatiepad blijft in Plan en gebruikt uw maandelijkse AI-budget.",
  "citationForward.studio.open": "Concept openen in Studio",
  "citationForward.studio.plan": "Openen in Plan (AI-generatie)",
  "citationForward.improvement.title": "Verbeteringsrecord",
  "citationForward.improvement.intro":
    "Koppel de exacte gepubliceerde poging voor deze taak, de goedkeuringsversie die ze droeg en de basislijnopnames die ervoor zijn gemaakt. Elk koppelingsveld wordt afgeleid van de gekozen poging.",
  "citationForward.improvement.start": "Verbetering vastleggen voor deze taak",
  "citationForward.improvement.publication": "Gepubliceerde poging",
  "citationForward.improvement.publicationNone":
    "Voor deze taak is nog geen gepubliceerde poging met een live URL vastgelegd. Publiceer eerst via Studio; een gestarte of afgewezen poging kan niet worden gekoppeld.",
  "citationForward.improvement.publicationOption": "{finished} · versie {version} · {url}",
  "citationForward.improvement.approvedBy": "Goedgekeurd door",
  "citationForward.improvement.approvedByOwner": "mij (eigenaar)",
  "citationForward.improvement.description": "Wat is er veranderd (beschrijving)",
  "citationForward.improvement.baselines": "Basislijnopnames (vóór de publicatie)",
  "citationForward.improvement.baselinesNone":
    "Geen opname binnen het bereik gaat aan deze publicatie vooraf; een geverifieerde voor/na is voor deze poging niet mogelijk.",
  "citationForward.improvement.baselinesHint":
    "Alleen opnames van vóór de publicatie worden aangeboden. De server controleert dit opnieuw.",
  "citationForward.improvement.review": "Het exacte record beoordelen",
  "citationForward.improvement.save": "Verbetering opslaan",
  "citationForward.improvement.retry": "Hetzelfde record opnieuw proberen",
  "citationForward.improvement.back": "Terug naar bewerken",
  "citationForward.improvement.cancel": "Annuleren",
  "citationForward.improvement.saved": "Opgeslagen als v{version}.",
  "citationForward.improvement.listTitle": "Verbeteringen",
  "citationForward.improvement.listEmpty": "Nog geen verbetering vastgelegd voor dit project.",
  "citationForward.improvement.status.unverified": "niet geverifieerd",
  "citationForward.improvement.status.approval_bound": "aan goedkeuring gebonden",
  "citationForward.improvement.status.connector_receipt":
    "connectorbevestiging (alleen ontvangstbevestiging)",
  "citationForward.improvement.status.owner_attested":
    "door eigenaar bevestigd (uw waarneming, geen onafhankelijk bewijs)",
  "citationForward.improvement.evidence.baseline_absent": "geen basislijn vastgelegd",
  "citationForward.improvement.evidence.baseline_missing":
    "basislijn ontbreekt (een opname is verwijderd of viel buiten het bereik)",
  "citationForward.improvement.evidence.baseline_recorded": "basislijn vastgelegd",
  "citationForward.improvement.statusNote":
    "Statussen zijn live serverwaarden. Een connectorbevestiging bewijst dat de connector antwoordde, niet dat de pagina de wijziging toont; een eigenaarsverklaring is uw eigen waarneming.",
  "citationForward.improvement.detailRows": "Vastgezette bevindingsrijen",
  "citationForward.improvement.detailTask": "Taak",
  "citationForward.improvement.detailDestination": "Bestemming",
  "citationForward.improvement.detailNoBinding": "Geen publicatie gekoppeld (conceptrecord).",
  "citationForward.improvement.remove": "Deze versie verwijderen",
  "citationForward.improvement.removed": "Verwijderd.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Kies minstens één bevindingsversie.",
  "citationForward.issue.finding_unavailable":
    "Een geselecteerde bevindingsrij is verwijderd; kies de huidige versie.",
  "citationForward.issue.finding_not_bindable":
    "Een afgewezen of vervangen bevinding kan niet worden gekoppeld; kies de huidige geaccepteerde versie.",
  "citationForward.issue.scope_mixed":
    "Alle geselecteerde bevindingen moeten bij dezelfde vergrendelde panelversie en dezelfde klant horen.",
  "citationForward.issue.task_invalid": "De taakidentiteit is niet geldig.",
  "citationForward.issue.publication_required": "Kies de gepubliceerde poging om te koppelen.",
  "citationForward.issue.publication_task_mismatch":
    "De gekozen poging is voor een andere taak vastgelegd.",
  "citationForward.issue.description_required": "Beschrijf de wijziging.",
  "citationForward.issue.baseline_after_publication":
    "Een gekozen basislijn is na de publicatie opgenomen.",
  "citationForward.issue.invalid": "Het record is niet geldig.",
  "citationForward.inspection.title": "Eigenaarsinspectie van de bestemming",
  "citationForward.inspection.intro":
    "Open de exacte gepubliceerde URL, vergelijk die met de goedgekeurde momentopname en leg vast wat u zag. De link openen of een geslaagd antwoord bevestigt op zichzelf niets.",
  "citationForward.inspection.open": "Gepubliceerde URL openen",
  "citationForward.inspection.snapshot": "Goedgekeurde momentopname",
  "citationForward.inspection.result": "Wat hebt u gezien?",
  "citationForward.inspection.shows_approved_content": "Toont de goedgekeurde inhoud",
  "citationForward.inspection.does_not_show": "Toont die niet",
  "citationForward.inspection.inconclusive": "Niet doorslaggevend",
  "citationForward.inspection.record": "Inspectie vastleggen",
  "citationForward.inspection.baselineRequired":
    "Een positieve inspectie heeft de basislijnopnames nodig waarop ze verbetert; bewerk eerst het record.",
  "citationForward.inspection.bindingRequired":
    "Dit record heeft geen publicatiekoppeling om te inspecteren.",
  "citationForward.inspection.negativeNote":
    "Een negatieve of niet-doorslaggevende inspectie wordt opgeslagen, en de verbetering blijft voor levering niet geverifieerd.",
  "citationForward.error.conflict":
    "Iemand heeft een nieuwere versie opgeslagen terwijl u aan het bewerken was. Uw concept is bewaard; er is niets geschreven.",
  "citationForward.error.conflictContinue": "Doorgaan op de huidige versie",
  "citationForward.error.findingUnresolved":
    "Een geselecteerde bevinding is in dit bereik niet meer te herleiden.",
  "citationForward.error.baselineUnresolved":
    "Een basislijnopname is in dit project niet meer te herleiden.",
  "citationForward.error.bindingUnresolved":
    "De publicatiekoppeling komt niet overeen met de vastgelegde poging.",
  "citationForward.error.bindingUnapproved": "De gekoppelde versie is momenteel niet goedgekeurd.",
  "citationForward.error.approvalMismatch":
    "De opgegeven goedkeuringsversie of goedkeurder komt niet overeen met de werkelijke goedkeuring.",
  "citationForward.error.taskMismatch": "De publicatie is voor een andere taak vastgelegd.",
  "citationForward.error.destinationMismatch":
    "De bestemming komt niet overeen met de gepubliceerde URL.",
  "citationForward.error.inspectionInvalid":
    "De inspectie is niet geldig voor deze publicatie (URL, tijd of toestand).",
  "citationForward.error.verificationUnbacked":
    "Een verificatie vereist een positieve eigenaarsinspectie van de gepubliceerde URL.",
  "citationForward.error.scopeDrift": "Deze verbetering is onder een ander bereik vastgelegd.",
  "citationForward.error.capacity": "De verbeteringscapaciteit voor dit project is bereikt.",
  "citationForward.error.invalid": "Het record is als ongeldig geweigerd.",
  "citationForward.error.unavailable":
    "Het opslaan kon niet worden voltooid. Vernieuw en probeer het opnieuw.",
  "citationForward.error.loadEvidence": "De publicatiegeschiedenis kon niet worden geladen.",
  "citationForward.error.loadImprovements": "De verbeteringen konden niet worden geladen.",
  "citationForward.readiness.title": "Gereedheid voor hertest",
  "citationForward.readiness.verified":
    "Door de eigenaar bevestigde afzonderlijke wijzigingen: {count} van {required} vereist",
  "citationForward.readiness.receipts":
    "Alleen connectorbevestigingen (geen leveringsbewijs): {count}",
  "citationForward.readiness.approvalBound": "Alleen aan goedkeuring gebonden: {count}",
  "citationForward.readiness.unverified": "Niet geverifieerd: {count}",
  "citationForward.readiness.baselineMissing": "Basislijn ontbreekt: {count}",
  "citationForward.readiness.note":
    "De aantallen komen uit live serverstatussen; hier wordt geen vergelijkingsronde berekend en een eigenaarsverklaring is nooit onafhankelijk bewijs.",
  "citationForward.task.pinnedTitle": "Plan-taken vastgezet op bevindingsversies",
  "citationForward.task.pinnedEmpty":
    "Er is in dit project geen Plan-taak op een bevindingsversie vastgezet.",
  "citationForward.task.readFailed":
    "De bevinding kon niet worden gelezen; er is geen taak gemaakt.",
  "citationForward.task.notEligible":
    "De door de server teruggegeven bevindingsversie is niet de geselecteerde of komt niet meer in aanmerking; er is geen taak gemaakt.",
  "citationForward.task.stale":
    "Het project of het account veranderde terwijl de bevinding werd gelezen; er is geen taak gemaakt.",
  "citationForward.improvement.rowsPick": "Te koppelen bevindingsversies",
  "citationForward.improvement.useCurrent":
    "De huidige versie v{head} koppelen in plaats van de vastgezette rij",
  "citationForward.improvement.publicationPartial":
    "Slechts {loaded} van {total} vastgelegde pogingen konden worden geladen; oudere pogingen worden hier niet aangeboden.",
  "citationForward.improvement.historyRow": "eerdere versie (geschiedenis)",
  "citationForward.inspection.notHead":
    "Er bestaat een nieuwere versie van deze verbetering. Open de huidige versie en inspecteer die.",
  "citationForward.inspection.retry": "Dezelfde inspectie opnieuw proberen",
  "citationForward.error.findingStale":
    "Een gekoppelde bevinding is gewijzigd sinds u dit record beoordeelde. Er is niets geschreven; open de huidige bevindingsversie en beoordeel opnieuw.",
  "citationForward.readiness.unavailable":
    "Gereedheid kan niet worden getoond: de live statussen konden niet worden vernieuwd.",
  "citationForward.improvement.approvalDelegate":
    "Goedgekeurd door een gedelegeerde beoordelaar: {email}",
  "citationForward.improvement.approvalNone":
    "Deze versie is momenteel niet goedgekeurd; de poging kan niet worden gekoppeld.",
  "citationForward.issue.approval_unknown":
    "De goedkeuringsstatus van de gekozen poging kon niet worden geladen.",
  "citationForward.issue.approval_unavailable":
    "De versie van de gekozen poging is momenteel niet goedgekeurd.",
  "citationForward.task.duplicate":
    "Er is al een Plan-taak vastgezet op deze bevindingsversie (hieronder vermeld); er is geen tweede taak gemaakt. Gebruik die, of voeg de versie uitdrukkelijk aan een andere taak toe.",
};
