/** French authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-27 from the English forward-workflow namespace; fluent human acceptance pending. */
export const frCitationForward: Readonly<Record<string, string>> = {
  "citationForward.common.loading": "Chargement…",
  "citationForward.title": "Du constat au changement vérifié",
  "citationForward.intro":
    "Transformez une version de constat acceptée en tâche du Plan, rédigez le changement dans Studio, publiez-le via l'approbation existante, puis consignez ce que vous avez réellement inspecté à la destination.",
  "citationForward.authority":
    "Accepter un constat n'accorde rien : la publication exige toujours l'approbation Studio et vos autorisations Manual/Review/Autopilot habituelles. Une tâche, un brouillon, une approbation ou un accusé de réception du connecteur ne prouve jamais que la page affiche le changement.",
  "citationForward.findings.title": "Constats et tâches du Plan",
  "citationForward.findings.empty":
    "Aucun constat liable pour le moment (accepté ou en attente de seconde revue, version courante).",
  "citationForward.findings.pick": "Version du constat",
  "citationForward.findings.pickPlaceholder": "Choisir une version de constat",
  "citationForward.findings.pinned": "Épinglé à v{pinned} · courante v{head}",
  "citationForward.findings.state.current": "version courante",
  "citationForward.findings.state.superseded":
    "remplacée par une version plus récente (l'épingle reste sur la ligne revue)",
  "citationForward.findings.state.deleted": "ligne épinglée supprimée",
  "citationForward.findings.state.dismissed": "rejeté par vous (non liable)",
  "citationForward.findings.state.dissent": "désaccord indépendant consigné",
  "citationForward.findings.state.second_review": "en attente de seconde revue",
  "citationForward.task.create": "Créer une tâche du Plan à partir de cette version",
  "citationForward.task.attach": "Rattacher à une tâche existante",
  "citationForward.task.attachPlaceholder": "Choisir une tâche",
  "citationForward.task.created": "Tâche du Plan créée.",
  "citationForward.task.attached": "Rattaché à la tâche.",
  "citationForward.task.listTitle": "Tâches liées à cette version de constat",
  "citationForward.task.listEmpty": "Aucune tâche n'est liée à cette version de constat.",
  "citationForward.task.state.active": "active",
  "citationForward.task.state.archived": "archivée",
  "citationForward.task.state.deleted": "supprimée",
  "citationForward.task.state.missing": "manquante (tâche absente de cet espace de travail)",
  "citationForward.task.localNote":
    "L'identité des tâches et les liens vivent dans le magasin de votre espace de travail ; ils n'accordent aucun accès de relecteur et ne constituent pas une preuve serveur.",
  "citationForward.studio.manualDraft": "Créer un brouillon manuel dans Studio (sans IA)",
  "citationForward.studio.manualNote":
    "Un brouillon manuel ne coûte rien et commence vide ; la génération par IA reste dans le Plan et consomme votre budget IA mensuel.",
  "citationForward.studio.open": "Ouvrir le brouillon dans Studio",
  "citationForward.studio.plan": "Ouvrir dans le Plan (génération IA)",
  "citationForward.improvement.title": "Fiche d'amélioration",
  "citationForward.improvement.intro":
    "Liez la tentative publiée exacte de cette tâche, la version d'approbation qu'elle portait et les captures de référence prises avant elle. Chaque champ de liaison est dérivé de la tentative choisie.",
  "citationForward.improvement.start": "Consigner une amélioration pour cette tâche",
  "citationForward.improvement.publication": "Tentative publiée",
  "citationForward.improvement.publicationNone":
    "Aucune tentative publiée avec une URL en ligne n'est encore consignée pour cette tâche. Publiez d'abord via Studio ; une tentative démarrée ou rejetée ne peut pas être liée.",
  "citationForward.improvement.publicationOption": "{finished} · version {version} · {url}",
  "citationForward.improvement.approvedBy": "Approuvé par",
  "citationForward.improvement.approvedByOwner": "moi (propriétaire)",
  "citationForward.improvement.description": "Ce qui a changé (description)",
  "citationForward.improvement.baselines": "Captures de référence (avant la publication)",
  "citationForward.improvement.baselinesNone":
    "Aucune capture dans le périmètre ne précède cette publication ; un avant/après vérifié ne sera pas possible pour cette tentative.",
  "citationForward.improvement.baselinesHint":
    "Seules les captures prises avant la publication sont proposées. Le serveur le vérifie à nouveau.",
  "citationForward.improvement.review": "Revoir la fiche exacte",
  "citationForward.improvement.save": "Enregistrer l'amélioration",
  "citationForward.improvement.retry": "Renvoyer la même fiche",
  "citationForward.improvement.back": "Retour à la modification",
  "citationForward.improvement.cancel": "Annuler",
  "citationForward.improvement.saved": "Enregistré en v{version}.",
  "citationForward.improvement.listTitle": "Améliorations",
  "citationForward.improvement.listEmpty":
    "Aucune amélioration consignée pour ce projet pour le moment.",
  "citationForward.improvement.status.unverified": "non vérifiée",
  "citationForward.improvement.status.approval_bound": "liée à l'approbation",
  "citationForward.improvement.status.connector_receipt":
    "reçu du connecteur (accusé de réception seulement)",
  "citationForward.improvement.status.owner_attested":
    "attestée par le propriétaire (votre observation, pas une preuve indépendante)",
  "citationForward.improvement.evidence.baseline_absent": "aucune référence consignée",
  "citationForward.improvement.evidence.baseline_missing":
    "référence manquante (une capture a été supprimée ou a quitté le périmètre)",
  "citationForward.improvement.evidence.baseline_recorded": "référence consignée",
  "citationForward.improvement.statusNote":
    "Les statuts sont des valeurs serveur en direct. Un reçu du connecteur prouve que le connecteur a répondu, pas que la page affiche le changement ; une attestation du propriétaire est votre propre observation.",
  "citationForward.improvement.detailRows": "Lignes de constat épinglées",
  "citationForward.improvement.detailTask": "Tâche",
  "citationForward.improvement.detailDestination": "Destination",
  "citationForward.improvement.detailNoBinding": "Aucune publication liée (fiche brouillon).",
  "citationForward.improvement.remove": "Supprimer cette version",
  "citationForward.improvement.removed": "Supprimé.",
  "citationForward.improvement.version": "v{version}",
  "citationForward.issue.findings_required": "Choisissez au moins une version de constat.",
  "citationForward.issue.finding_unavailable":
    "Une ligne de constat sélectionnée a été supprimée ; choisissez la version courante.",
  "citationForward.issue.finding_not_bindable":
    "Un constat rejeté ou remplacé ne peut pas être lié ; choisissez sa version acceptée courante.",
  "citationForward.issue.scope_mixed":
    "Tous les constats sélectionnés doivent appartenir à la même version de panel verrouillée et au même client.",
  "citationForward.issue.task_invalid": "L'identité de la tâche n'est pas valide.",
  "citationForward.issue.publication_required": "Choisissez la tentative publiée à lier.",
  "citationForward.issue.publication_task_mismatch":
    "La tentative choisie a été consignée pour une autre tâche.",
  "citationForward.issue.description_required": "Décrivez le changement.",
  "citationForward.issue.baseline_after_publication":
    "Une référence choisie a été capturée après la publication.",
  "citationForward.issue.invalid": "La fiche n'est pas valide.",
  "citationForward.inspection.title": "Inspection de la destination par le propriétaire",
  "citationForward.inspection.intro":
    "Ouvrez l'URL publiée exacte, comparez-la à l'instantané approuvé, puis consignez ce que vous avez vu. Ouvrir le lien ou obtenir une réponse réussie n'atteste rien en soi.",
  "citationForward.inspection.open": "Ouvrir l'URL publiée",
  "citationForward.inspection.snapshot": "Instantané approuvé",
  "citationForward.inspection.result": "Qu'avez-vous vu ?",
  "citationForward.inspection.shows_approved_content": "Affiche le contenu approuvé",
  "citationForward.inspection.does_not_show": "Ne l'affiche pas",
  "citationForward.inspection.inconclusive": "Non concluant",
  "citationForward.inspection.record": "Consigner l'inspection",
  "citationForward.inspection.baselineRequired":
    "Une inspection positive a besoin des captures de référence qu'elle améliore ; modifiez d'abord la fiche.",
  "citationForward.inspection.bindingRequired":
    "Cette fiche n'a aucune liaison de publication à inspecter.",
  "citationForward.inspection.negativeNote":
    "Une inspection négative ou non concluante est enregistrée, et l'amélioration reste non vérifiée pour la livraison.",
  "citationForward.error.conflict":
    "Quelqu'un a enregistré une version plus récente pendant votre modification. Votre brouillon est conservé ; rien n'a été écrit.",
  "citationForward.error.conflictContinue": "Continuer sur la version courante",
  "citationForward.error.findingUnresolved":
    "Un constat sélectionné ne se résout plus dans ce périmètre.",
  "citationForward.error.baselineUnresolved":
    "Une capture de référence ne se résout plus dans ce projet.",
  "citationForward.error.bindingUnresolved":
    "La liaison de publication ne correspond pas à la tentative consignée.",
  "citationForward.error.bindingUnapproved": "La version liée n'est pas approuvée actuellement.",
  "citationForward.error.approvalMismatch":
    "La version d'approbation ou l'approbateur déclaré ne correspond pas à l'approbation réelle.",
  "citationForward.error.taskMismatch": "La publication a été consignée pour une autre tâche.",
  "citationForward.error.destinationMismatch": "La destination ne correspond pas à l'URL publiée.",
  "citationForward.error.inspectionInvalid":
    "L'inspection n'est pas valide pour cette publication (URL, heure ou état).",
  "citationForward.error.verificationUnbacked":
    "Une vérification exige une inspection positive de l'URL publiée par le propriétaire.",
  "citationForward.error.scopeDrift": "Cette amélioration a été consignée sous un autre périmètre.",
  "citationForward.error.capacity": "Capacité d'améliorations atteinte pour ce projet.",
  "citationForward.error.invalid": "La fiche a été refusée comme non valide.",
  "citationForward.error.unavailable":
    "L'enregistrement n'a pas pu aboutir. Actualisez et réessayez.",
  "citationForward.error.loadEvidence": "L'historique des publications n'a pas pu être chargé.",
  "citationForward.error.loadImprovements": "Les améliorations n'ont pas pu être chargées.",
  "citationForward.readiness.title": "Prêt pour le nouveau test",
  "citationForward.readiness.verified":
    "Changements distincts attestés par le propriétaire : {count} sur {required} requis",
  "citationForward.readiness.receipts":
    "Reçus du connecteur seulement (pas une preuve de livraison) : {count}",
  "citationForward.readiness.approvalBound": "Liées à l'approbation seulement : {count}",
  "citationForward.readiness.unverified": "Non vérifiées : {count}",
  "citationForward.readiness.baselineMissing": "Référence manquante : {count}",
  "citationForward.readiness.note":
    "Les comptes proviennent des statuts serveur en direct ; aucun tour de comparaison n'est calculé ici et une attestation du propriétaire n'est jamais une preuve indépendante.",
  "citationForward.task.pinnedTitle": "Tâches du Plan épinglées à des versions de constat",
  "citationForward.task.pinnedEmpty":
    "Aucune tâche du Plan n'est épinglée à une version de constat dans ce projet.",
  "citationForward.task.readFailed": "Le constat n'a pas pu être lu ; aucune tâche n'a été créée.",
  "citationForward.task.notEligible":
    "La version de constat renvoyée par le serveur n'est pas celle sélectionnée ou n'est plus éligible ; aucune tâche n'a été créée.",
  "citationForward.task.stale":
    "Le projet ou le compte a changé pendant la lecture du constat ; aucune tâche n'a été créée.",
  "citationForward.improvement.rowsPick": "Versions de constat à lier",
  "citationForward.improvement.useCurrent":
    "Lier la version courante v{head} au lieu de la ligne épinglée",
  "citationForward.improvement.publicationPartial":
    "Seules {loaded} des {total} tentatives consignées ont pu être chargées ; les tentatives plus anciennes ne sont pas proposées ici.",
  "citationForward.improvement.historyRow": "version antérieure (historique)",
  "citationForward.inspection.notHead":
    "Une version plus récente de cette amélioration existe. Ouvrez la version courante et inspectez celle-ci.",
  "citationForward.inspection.retry": "Renvoyer la même inspection",
  "citationForward.error.findingStale":
    "Un constat lié a changé depuis votre revue de cette fiche. Rien n'a été écrit ; ouvrez la version courante du constat et revoyez-la.",
  "citationForward.readiness.unavailable":
    "La préparation ne peut pas être affichée : les statuts en direct n'ont pas pu être actualisés.",
  "citationForward.improvement.approvalDelegate": "Approuvé par un relecteur délégué : {email}",
  "citationForward.improvement.approvalNone":
    "Cette version n'est pas approuvée actuellement ; la tentative ne peut pas être liée.",
  "citationForward.issue.approval_unknown":
    "L'état d'approbation de la tentative choisie n'a pas pu être chargé.",
  "citationForward.issue.approval_unavailable":
    "La version de la tentative choisie n'est pas approuvée actuellement.",
};
