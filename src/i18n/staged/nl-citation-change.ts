/** Dutch authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const nlCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Wijzigingen aan vermeldingen en configuratie",
  "citationChange.intro":
    "Leg de bedoelde wijziging vast als artefact (alleen de ondersteunde, niet-geheime velden), keur precies die versie goed, verklaar wanneer ze is uitgevoerd en koppel er daarna een verbetering aan. Een verklaring is geen bewijs van de bestemming.",
  "citationChange.artifact.new": "Nieuw wijzigingsartefact",
  "citationChange.artifact.kind": "Soort",
  "citationChange.artifact.kind.listing": "Vermelding",
  "citationChange.artifact.kind.configuration": "Configuratie",
  "citationChange.artifact.reference": "Referentie",
  "citationChange.artifact.referenceHint":
    "De identificatie van de vermelding of instelling (bijvoorbeeld het profiel-id of het instellingspad). Geen inloggegevens.",
  "citationChange.artifact.fields": "Velden",
  "citationChange.artifact.fieldsHint":
    "Alleen de ondersteunde velden kunnen worden vastgelegd; inloggegevens, tokens en privé-instellingen worden geweigerd en kunnen hier niet worden toegevoegd.",
  "citationChange.artifact.before": "Voor",
  "citationChange.artifact.after": "Na",
  "citationChange.artifact.save": "Artefact opslaan",
  "citationChange.artifact.saved":
    "Artefact opgeslagen (identieke inhoud levert het bestaande artefact op).",
  "citationChange.artifact.remove":
    "Artefact verwijderen (de inhoud wordt verwijderd; identificaties blijven voor audit)",
  "citationChange.artifact.empty": "Nog geen wijzigingsartefact.",
  "citationChange.artifact.unsupported":
    "Niet-ondersteund veld of niet-ondersteunde waarde; er is niets opgeslagen.",
  "citationChange.approval.title": "Goedkeuring van precies deze versie",
  "citationChange.approval.approve": "Deze versie goedkeuren",
  "citationChange.approval.revoke": "Goedkeuring intrekken",
  "citationChange.approval.owner": "Door mij goedgekeurd (eigenaar)",
  "citationChange.approval.delegate": "Goedgekeurd door een gedelegeerde reviewer: {email}",
  "citationChange.approval.none": "Momenteel niet goedgekeurd.",
  "citationChange.receipt.title": "Uitvoeringsverklaringen",
  "citationChange.receipt.record": "Nu als uitgevoerd verklaren",
  "citationChange.receipt.recorded": "Verklaring vastgelegd.",
  "citationChange.receipt.none": "Nog geen verklaring.",
  "citationChange.receipt.note":
    "Een verklaring zegt dat een persoon de wijziging heeft gedaan; ze bewijst nooit dat de bestemming die toont.",
  "citationChange.binding.kind": "Soort koppeling",
  "citationChange.binding.public": "Gepubliceerde poging (openbare URL)",
  "citationChange.binding.change": "Wijziging aan vermelding / configuratie",
  "citationChange.binding.artifact": "Artefact",
  "citationChange.binding.receipt": "Uitvoeringsverklaring",
  "citationChange.binding.chooseArtifact": "Kies een goedgekeurd artefact",
  "citationChange.binding.chooseReceipt": "Kies een verklaring",
  "citationChange.issue.artifact_required": "Kies een goedgekeurd artefact.",
  "citationChange.issue.artifact_unapproved": "Het gekozen artefact is momenteel niet goedgekeurd.",
  "citationChange.issue.receipt_required": "Kies een uitvoeringsverklaring voor het artefact.",
  "citationChange.independent.title": "Onafhankelijke inspectie",
  "citationChange.independent.none": "geen onafhankelijke inspectie",
  "citationChange.independent.inconclusive": "onbeslist (niet bevestigend)",
  "citationChange.independent.disputed":
    "betwist (een toegewezen inspecteur zag de wijziging ontbreken; uitgesloten van de geverifieerde gereedheid)",
  "citationChange.independent.independently_inspected":
    "onafhankelijk geïnspecteerd (een andere geauthenticeerde persoon zag de goedgekeurde wijziging)",
  "citationChange.independent.note":
    "Onafhankelijke inspectie is menselijke inspectie door een andere persoon in het team; het is nooit automatische verificatie of causaal bewijs, en een betwiste levering wordt uitgesloten, ook als u die hebt bevestigd.",
  "citationChange.eligible.yes": "telt als geverifieerde wijziging",
  "citationChange.eligible.no": "telt niet als geverifieerd",
  "citationChange.assign.title": "Inspectietoewijzingen",
  "citationChange.assign.pick": "Kies een teamreviewer",
  "citationChange.assign.grant": "Inspectie toekennen",
  "citationChange.assign.revoke": "Intrekken",
  "citationChange.assign.link": "Link van de inspecteur kopiëren",
  "citationChange.assign.linkCopied": "Link gekopieerd.",
  "citationChange.assign.none": "Geen inspecteur toegewezen.",
  "citationChange.assign.effective": "geldig",
  "citationChange.assign.ineffective": "niet langer geldig",
  "citationChange.inspect.title": "Een vastgelegde wijziging inspecteren",
  "citationChange.inspect.intro":
    "Open de exacte referentie, vergelijk ze met de goedgekeurde inhoud hieronder en leg daarna vast wat u zag. Het openen van de referentie bevestigt op zichzelf niets.",
  "citationChange.inspect.reference": "Referentie",
  "citationChange.inspect.open": "Referentie openen",
  "citationChange.inspect.approvedVersion": "Goedgekeurde versie",
  "citationChange.inspect.approvedContent": "Goedgekeurde inhoud",
  "citationChange.inspect.identity": "Identiteiten van goedkeurder en uitvoerder",
  "citationChange.inspect.identityUnavailable":
    "De uitvoerder of goedkeurder van deze wijziging is onbekend (een oudere publicatie of een onopgeloste goedkeuring); een onafhankelijk bewijs kan niet worden vastgelegd.",
  "citationChange.inspect.result": "Wat hebt u gezien?",
  "citationChange.inspect.shows_approved_content": "Toont de goedgekeurde wijziging",
  "citationChange.inspect.does_not_show": "Toont ze niet",
  "citationChange.inspect.inconclusive": "Onbeslist",
  "citationChange.inspect.record": "Inspectie vastleggen",
  "citationChange.inspect.retry": "Dezelfde inspectie opnieuw proberen",
  "citationChange.inspect.withdraw": "Mijn huidige inspectie intrekken",
  "citationChange.inspect.recorded": "Inspectie vastgelegd als v{version}.",
  "citationChange.inspect.history": "Mijn inspectiegeschiedenis",
  "citationChange.inspect.head": "huidig",
  "citationChange.inspect.withdrawn": "ingetrokken",
  "citationChange.inspect.loadError":
    "Deze inspectie kon niet worden geladen (niet toegewezen, ingetrokken of de rij is gewijzigd).",
  "citationChange.readiness.independent": "Onafhankelijk geïnspecteerd: {count}",
  "citationChange.readiness.disputed": "Betwist (uitgesloten): {count}",
  "citationChange.readiness.receipts":
    "Alleen uitvoeringsverklaringen (geen leveringsbewijs): {count}",
  "citationChange.error.unsupported":
    "Niet-ondersteund veld, niet-ondersteunde waarde of soort; er is niets opgeslagen.",
  "citationChange.error.unavailable": "Het wijzigingsrecord kon niet worden geladen of opgeslagen.",
  "citationChange.error.stale": "Het artefact is gewijzigd sinds u het bekeek; open het opnieuw.",
  "citationChange.error.forbidden": "U mag dit niet doen voor dit project.",
  "citationChange.error.unapproved": "Deze versie is momenteel niet goedgekeurd.",
  "citationChange.error.receiptInvalid":
    "Het verklaarde moment ligt vóór de goedkeuring of in de toekomst.",
  "citationChange.error.capacity":
    "De capaciteit voor wijzigingsartefacten van dit project is bereikt.",
  "citationChange.error.inspectionInvalid":
    "De inspectie is niet geldig (moment, referentie of toestand).",
  "citationChange.error.notIndependent":
    "U hebt deze wijziging uitgevoerd of goedgekeurd, dus u kunt ze niet onafhankelijk inspecteren.",
  "citationChange.error.identityUnavailable":
    "De identiteit van de uitvoerder of goedkeurder is niet beschikbaar; de onafhankelijke inspectie wordt geweigerd.",
  "citationChange.error.inspectionConflict":
    "Uw inspectieketen is gewijzigd; herlaad en leg opnieuw vast.",
  "citationChange.error.generic": "De actie op het wijzigingsbewijs kon niet worden voltooid.",
  "citationChange.artifact.fieldKey": "Veld",
  "citationChange.artifact.addField": "Veld toevoegen",
  "citationChange.artifact.removeField": "Verwijderen",
  "citationChange.artifact.removed": "Artefact verwijderd (audit-identificaties bewaard).",
  "citationChange.artifact.approvalRevision": "goedkeuringsrevisie {revision}",
  "citationChange.approval.approved": "Goedkeuring vastgelegd.",
  "citationChange.approval.revoked": "Goedkeuring ingetrokken.",
  "citationChange.approval.retry": "Dezelfde beslissing opnieuw proberen",
  "citationChange.approval.replayed":
    "Dit was een herhaling van een eerder verzoek; de huidige beslissing wordt na herladen getoond.",
  "citationChange.receipt.remove": "Verklaring verwijderen",
  "citationChange.receipt.removed": "Verklaring verwijderd.",
  "citationChange.binding.deleted":
    "Het gekoppelde artefact is verwijderd; alleen identificaties blijven over.",
  "citationChange.detail.changeTitle": "Gekoppelde wijziging aan vermelding / configuratie",
  "citationChange.detail.artifactVersion": "Goedgekeurde artefactversie",
  "citationChange.detail.receiptAt": "Als uitgevoerd verklaard op",
  "citationChange.assign.candidatesNone":
    "Geen in aanmerking komende teamreviewer om toe te wijzen (beleid of lijst).",
  "citationChange.assign.granted": "Inspectie toegekend.",
  "citationChange.assign.revoked": "Inspectie ingetrokken.",
  "citationChange.inspect.kindPublic": "Gepubliceerde pagina",
  "citationChange.inspect.fresh":
    "Uw huidige inspectie heeft geen effect meer ({reason}); leg een nieuwe vast ten opzichte van uw huidige ketenkop.",
  "citationChange.inspect.reason.superseded": "vervangen door een later bewijs",
  "citationChange.inspect.reason.withdrawn": "ingetrokken",
  "citationChange.inspect.reason.account": "account niet beschikbaar",
  "citationChange.inspect.reason.assignment": "de toewijzing is opnieuw toegekend",
  "citationChange.inspect.reason.authority": "uw teambevoegdheid is gewijzigd",
  "citationChange.inspect.reason.independence": "u bent nu de uitvoerder of goedkeurder",
  "citationChange.inspect.noContent":
    "De goedgekeurde inhoud is niet langer beschikbaar (artefact verwijderd of publicatie ontbreekt).",
  "citationChange.inspect.boundFindings": "Gekoppelde bevindingen",
  "citationChange.inspect.withdrawnDone": "Inspectie ingetrokken.",
  "citationChange.dissent.title": "Actief bezwaar tegen deze geleverde wijziging",
  "citationChange.dissent.row": "{inspector} · rij {row} · {at}",
  "citationChange.status.receipt_recorded":
    "uitvoeringsverklaring vastgelegd (geen leveringsbewijs)",
  "citationChange.artifact.duplicateField":
    "Dit veld wordt al door een andere rij gebruikt; kies een ander veld of verwijder deze rij.",
  "citationChange.artifact.fieldsExhausted":
    "Elk ondersteund veld van deze soort heeft al een rij.",
  "citationChange.approval.pendingNote":
    "Het vorige verzoek kwam niet terug. Opnieuw proberen verzendt exact dezelfde beslissing (versie {sha}, {decision}, beoordeelde revisie {revision}); niets wordt herberekend uit de huidige toestand.",
  "citationChange.approval.newDecision": "Verwerpen en opnieuw beslissen",
  "citationChange.receipt.retry": "Dezelfde verklaring opnieuw proberen",
  "citationChange.receipt.newPerformance": "Een nieuwe uitvoering verklaren",
  "citationChange.receipt.pendingNote":
    "De vorige verklaring kwam niet terug. Opnieuw proberen verzendt exact hetzelfde verklaarde moment ({at}); een nieuwe uitvoering is een aparte expliciete handeling.",
  "citationChange.approval.blockedBy":
    "Handel eerst de openstaande beslissing voor {reference} af (opnieuw proberen of verwerpen); andere goedkeuringen wachten.",
  "citationChange.receipt.blockedBy":
    "Handel eerst de openstaande verklaring voor {reference} af (opnieuw proberen of een nieuwe uitvoering verklaren); andere verklaringen wachten.",
  "citationChange.readiness.verified":
    "Geverifieerde afzonderlijke wijzigingen: {count} van {required} vereist (een wijziging telt zodra het bewijs geldig is: uw eigen attest, of een onafhankelijke inspectie van een geleverde wijziging; een betwiste of uitgesloten wijziging telt nooit)",
  "citationChange.readiness.sources":
    "Vastgelegde waarnemingen bij de huidige wijzigingen: door de eigenaar geattesteerd {owner}, onafhankelijk geïnspecteerd {independent} (dit zijn aantallen vastgelegde waarnemingen, geen geldig bewijs; betwistingen en uitsluitingen bepalen het geverifieerde aantal hierboven)",
  "citationChange.evidence.independentBaseline":
    "de basislijn wordt opgelost door het onafhankelijke bewijs (geen eigenaarsattest op deze rij)",
  "citationChange.inspect.ownerIntro":
    "Open de vermelding of instelling bij de exacte referentie, vergelijk met de goedgekeurde velden hieronder en leg daarna vast wat u zag. Openen alleen bevestigt niets.",
  "citationChange.inspect.contentUnavailable":
    "De exacte goedgekeurde inhoud van deze wijziging kon niet worden geladen (artefact verwijderd, gewijzigd of niet beschikbaar): een positief attest is niet mogelijk; een negatief of onbeslist resultaat kan nog worden vastgelegd.",
};
