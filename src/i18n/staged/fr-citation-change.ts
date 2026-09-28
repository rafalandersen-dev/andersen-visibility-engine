/** French authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const frCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Modifications des fiches et de la configuration",
  "citationChange.intro":
    "Enregistrez la modification prévue comme un artefact (uniquement les champs pris en charge et non secrets), approuvez exactement cette version, déclarez quand elle a été effectuée, puis liez-y une amélioration. Une déclaration n’est pas une preuve de la destination.",
  "citationChange.artifact.new": "Nouvel artefact de modification",
  "citationChange.artifact.kind": "Type",
  "citationChange.artifact.kind.listing": "Fiche",
  "citationChange.artifact.kind.configuration": "Configuration",
  "citationChange.artifact.reference": "Référence",
  "citationChange.artifact.referenceHint":
    "L’identifiant de la fiche ou du paramètre (par exemple l’id du profil ou le chemin du paramètre). Aucun identifiant de connexion.",
  "citationChange.artifact.fields": "Champs",
  "citationChange.artifact.fieldsHint":
    "Seuls les champs pris en charge peuvent être enregistrés ; les identifiants de connexion, jetons et paramètres privés sont refusés et ne peuvent pas être ajoutés ici.",
  "citationChange.artifact.before": "Avant",
  "citationChange.artifact.after": "Après",
  "citationChange.artifact.save": "Enregistrer l’artefact",
  "citationChange.artifact.saved":
    "Artefact enregistré (un contenu identique renvoie l’artefact existant).",
  "citationChange.artifact.remove":
    "Supprimer l’artefact (le contenu est retiré ; les identifiants restent pour l’audit)",
  "citationChange.artifact.empty": "Aucun artefact de modification pour l’instant.",
  "citationChange.artifact.unsupported":
    "Champ ou valeur non pris en charge ; rien n’a été enregistré.",
  "citationChange.approval.title": "Approbation de cette version exacte",
  "citationChange.approval.approve": "Approuver cette version",
  "citationChange.approval.revoke": "Révoquer l’approbation",
  "citationChange.approval.owner": "Approuvé par moi (propriétaire)",
  "citationChange.approval.delegate": "Approuvé par un relecteur délégué : {email}",
  "citationChange.approval.none": "Non approuvé actuellement.",
  "citationChange.receipt.title": "Déclarations d’exécution",
  "citationChange.receipt.record": "Déclarer exécuté maintenant",
  "citationChange.receipt.recorded": "Déclaration enregistrée.",
  "citationChange.receipt.none": "Aucune déclaration pour l’instant.",
  "citationChange.receipt.note":
    "Une déclaration dit qu’une personne a effectué la modification ; elle ne prouve jamais que la destination l’affiche.",
  "citationChange.binding.kind": "Type de liaison",
  "citationChange.binding.public": "Tentative publiée (URL publique)",
  "citationChange.binding.change": "Modification de fiche / configuration",
  "citationChange.binding.artifact": "Artefact",
  "citationChange.binding.receipt": "Déclaration d’exécution",
  "citationChange.binding.chooseArtifact": "Choisir un artefact approuvé",
  "citationChange.binding.chooseReceipt": "Choisir une déclaration",
  "citationChange.issue.artifact_required": "Choisissez un artefact approuvé.",
  "citationChange.issue.artifact_unapproved": "L’artefact choisi n’est pas approuvé actuellement.",
  "citationChange.issue.receipt_required":
    "Choisissez une déclaration d’exécution pour l’artefact.",
  "citationChange.independent.title": "Inspection indépendante",
  "citationChange.independent.none": "aucune inspection indépendante",
  "citationChange.independent.inconclusive": "non concluante (pas affirmative)",
  "citationChange.independent.disputed":
    "contestée (un inspecteur assigné a constaté l’absence de la modification ; exclue de la préparation vérifiée)",
  "citationChange.independent.independently_inspected":
    "inspectée de façon indépendante (une autre personne authentifiée a vu la modification approuvée)",
  "citationChange.independent.note":
    "L’inspection indépendante est une inspection humaine par une autre personne de l’équipe ; ce n’est jamais une vérification automatique ni une preuve causale, et une livraison contestée est exclue même si vous l’avez attestée.",
  "citationChange.eligible.yes": "compte comme modification vérifiée",
  "citationChange.eligible.no": "ne compte pas comme vérifiée",
  "citationChange.assign.title": "Assignations d’inspection",
  "citationChange.assign.pick": "Choisir un relecteur de l’équipe",
  "citationChange.assign.grant": "Accorder l’inspection",
  "citationChange.assign.revoke": "Révoquer",
  "citationChange.assign.link": "Copier le lien de l’inspecteur",
  "citationChange.assign.linkCopied": "Lien copié.",
  "citationChange.assign.none": "Aucun inspecteur assigné.",
  "citationChange.assign.effective": "effective",
  "citationChange.assign.ineffective": "plus effective",
  "citationChange.inspect.title": "Inspecter une modification enregistrée",
  "citationChange.inspect.intro":
    "Ouvrez la référence exacte, comparez-la au contenu approuvé ci-dessous, puis enregistrez ce que vous avez vu. Ouvrir la référence n’atteste rien en soi.",
  "citationChange.inspect.reference": "Référence",
  "citationChange.inspect.open": "Ouvrir la référence",
  "citationChange.inspect.approvedVersion": "Version approuvée",
  "citationChange.inspect.approvedContent": "Contenu approuvé",
  "citationChange.inspect.identity": "Identités de l’approbateur et de l’exécutant",
  "citationChange.inspect.identityUnavailable":
    "L’exécutant ou l’approbateur de cette modification est inconnu (une publication plus ancienne ou une approbation non résolue) ; un reçu indépendant ne peut pas être enregistré.",
  "citationChange.inspect.result": "Qu’avez-vous vu ?",
  "citationChange.inspect.shows_approved_content": "Affiche la modification approuvée",
  "citationChange.inspect.does_not_show": "Ne l’affiche pas",
  "citationChange.inspect.inconclusive": "Non concluant",
  "citationChange.inspect.record": "Enregistrer l’inspection",
  "citationChange.inspect.retry": "Réessayer la même inspection",
  "citationChange.inspect.withdraw": "Retirer mon inspection actuelle",
  "citationChange.inspect.recorded": "Inspection enregistrée en v{version}.",
  "citationChange.inspect.history": "Historique de mes inspections",
  "citationChange.inspect.head": "actuelle",
  "citationChange.inspect.withdrawn": "retirée",
  "citationChange.inspect.loadError":
    "Cette inspection n’a pas pu être chargée (non assignée, révoquée ou la ligne a changé).",
  "citationChange.readiness.independent": "Inspectées de façon indépendante : {count}",
  "citationChange.readiness.disputed": "Contestées (exclues) : {count}",
  "citationChange.readiness.receipts":
    "Déclarations d’exécution seulement (pas de preuve de livraison) : {count}",
  "citationChange.error.unsupported":
    "Champ, valeur ou type non pris en charge ; rien n’a été enregistré.",
  "citationChange.error.unavailable":
    "L’enregistrement de la modification n’a pas pu être chargé ni sauvegardé.",
  "citationChange.error.stale": "L’artefact a changé depuis que vous l’avez consulté ; rouvrez-le.",
  "citationChange.error.forbidden": "Vous n’êtes pas autorisé à faire cela pour ce projet.",
  "citationChange.error.unapproved": "Cette version n’est pas approuvée actuellement.",
  "citationChange.error.receiptInvalid":
    "L’instant déclaré précède l’approbation ou se situe dans le futur.",
  "citationChange.error.capacity":
    "La capacité d’artefacts de modification de ce projet est atteinte.",
  "citationChange.error.inspectionInvalid":
    "L’inspection n’est pas valide (instant, référence ou état).",
  "citationChange.error.notIndependent":
    "Vous avez exécuté ou approuvé cette modification ; vous ne pouvez donc pas l’inspecter de façon indépendante.",
  "citationChange.error.identityUnavailable":
    "L’identité de l’exécutant ou de l’approbateur n’est pas disponible ; l’inspection indépendante est refusée.",
  "citationChange.error.inspectionConflict":
    "Votre chaîne d’inspections a changé ; rechargez et enregistrez à nouveau.",
  "citationChange.error.generic":
    "L’action sur les preuves de modification n’a pas pu être effectuée.",
  "citationChange.artifact.fieldKey": "Champ",
  "citationChange.artifact.addField": "Ajouter un champ",
  "citationChange.artifact.removeField": "Retirer",
  "citationChange.artifact.removed": "Artefact supprimé (identifiants d’audit conservés).",
  "citationChange.artifact.approvalRevision": "révision d’approbation {revision}",
  "citationChange.approval.approved": "Approbation enregistrée.",
  "citationChange.approval.revoked": "Approbation révoquée.",
  "citationChange.approval.retry": "Réessayer la même décision",
  "citationChange.approval.replayed":
    "Il s’agissait d’une répétition d’une demande antérieure ; la décision actuelle s’affiche après rechargement.",
  "citationChange.receipt.remove": "Retirer la déclaration",
  "citationChange.receipt.removed": "Déclaration retirée.",
  "citationChange.binding.deleted":
    "L’artefact lié a été supprimé ; seuls les identifiants subsistent.",
  "citationChange.detail.changeTitle": "Modification de fiche / configuration liée",
  "citationChange.detail.artifactVersion": "Version approuvée de l’artefact",
  "citationChange.detail.receiptAt": "Déclaré exécuté le",
  "citationChange.assign.candidatesNone":
    "Aucun relecteur de l’équipe éligible à assigner (politique ou liste).",
  "citationChange.assign.granted": "Inspection accordée.",
  "citationChange.assign.revoked": "Inspection révoquée.",
  "citationChange.inspect.kindPublic": "Page publiée",
  "citationChange.inspect.fresh":
    "Votre inspection actuelle n’a plus d’effet ({reason}) ; enregistrez-en une nouvelle par rapport à votre tête de chaîne actuelle.",
  "citationChange.inspect.reason.superseded": "remplacée par un reçu ultérieur",
  "citationChange.inspect.reason.withdrawn": "retirée",
  "citationChange.inspect.reason.account": "compte indisponible",
  "citationChange.inspect.reason.assignment": "l’assignation a été accordée à nouveau",
  "citationChange.inspect.reason.authority": "votre autorité dans l’équipe a changé",
  "citationChange.inspect.reason.independence": "vous êtes désormais l’exécutant ou l’approbateur",
  "citationChange.inspect.noContent":
    "Le contenu approuvé n’est plus disponible (artefact supprimé ou publication manquante).",
  "citationChange.inspect.boundFindings": "Constats liés",
  "citationChange.inspect.withdrawnDone": "Inspection retirée.",
  "citationChange.dissent.title": "Désaccord actif sur cette modification livrée",
  "citationChange.dissent.row": "{inspector} · ligne {row} · {at}",
  "citationChange.status.receipt_recorded":
    "déclaration d’exécution enregistrée (pas de preuve de livraison)",
  "citationChange.artifact.duplicateField":
    "Ce champ est déjà utilisé par une autre ligne ; choisissez un autre champ ou retirez cette ligne.",
  "citationChange.artifact.fieldsExhausted":
    "Chaque champ pris en charge de ce type a déjà une ligne.",
  "citationChange.approval.pendingNote":
    "La demande précédente n’est pas revenue. Réessayer envoie exactement la même décision (version {sha}, {decision}, révision relue {revision}) ; rien n’est recalculé depuis l’état actuel.",
  "citationChange.approval.newDecision": "La rejeter et décider à nouveau",
  "citationChange.receipt.retry": "Réessayer la même déclaration",
  "citationChange.receipt.newPerformance": "Déclarer une nouvelle exécution",
  "citationChange.receipt.pendingNote":
    "La déclaration précédente n’est pas revenue. Réessayer envoie exactement le même instant déclaré ({at}) ; une nouvelle exécution est une action explicite distincte.",
  "citationChange.approval.blockedBy":
    "Résolvez d’abord la décision en attente pour {reference} (réessayez-la ou rejetez-la) ; les autres approbations attendent.",
  "citationChange.receipt.blockedBy":
    "Résolvez d’abord la déclaration en attente pour {reference} (réessayez-la ou déclarez une nouvelle exécution) ; les autres déclarations attendent.",
  "citationChange.readiness.verified":
    "Modifications distinctes vérifiées : {count} sur {required} requises (une modification compte lorsque sa preuve est éligible : votre propre attestation, ou une inspection indépendante d’une modification livrée ; une modification contestée ou exclue ne compte jamais)",
  "citationChange.readiness.sources":
    "Observations enregistrées sur les modifications actuelles : attestées par le propriétaire {owner}, inspectées de façon indépendante {independent} (ce sont des nombres d’observations enregistrées, pas des preuves éligibles ; les contestations et les exclusions décident du nombre vérifié ci-dessus)",
  "citationChange.evidence.independentBaseline":
    "la référence est résolue par la preuve indépendante (aucune attestation du propriétaire sur cette ligne)",
  "citationChange.inspect.ownerIntro":
    "Ouvrez la fiche ou le paramètre à la référence exacte, comparez-le aux champs approuvés ci-dessous, puis enregistrez ce que vous avez vu. L’ouvrir n’atteste rien en soi.",
  "citationChange.inspect.contentUnavailable":
    "Le contenu approuvé exact de cette modification n’a pas pu être chargé (artefact supprimé, modifié ou indisponible) : une attestation positive est impossible ; un résultat négatif ou non concluant peut encore être enregistré.",
  "citationChange.receipt.stale":
    "non valable sous l’approbation actuelle (enregistrée sous une décision antérieure, ou l’approbation n’est plus en vigueur) — déclarez une nouvelle exécution",
  "citationChange.issue.receipt_stale":
    "La déclaration choisie n’est pas valable sous l’approbation actuelle : elle a été enregistrée sous une décision d’approbation antérieure, ou l’approbation n’est plus en vigueur. Déclarez une nouvelle exécution et choisissez-la.",
  "citationChange.error.receiptStale":
    "La déclaration a été enregistrée sous une décision d’approbation antérieure (l’approbation a été révoquée ou décidée de nouveau depuis). Déclarez une nouvelle exécution sous l’approbation actuelle et liez celle-ci.",
  "citationChange.binding.receiptStale":
    "La déclaration liée a été enregistrée sous une décision d’approbation antérieure : cette ligne reste liée à l’approbation et aucune nouvelle inspection ne peut lier cette déclaration. Déclarez une nouvelle exécution sous l’approbation actuelle et enregistrez une nouvelle version de l’amélioration.",
};
