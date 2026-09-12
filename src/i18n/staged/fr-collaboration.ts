/** French collaboration and notification copy, staged and unavailable in the UI. */
export const frCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Travail actuel du projet",
  "awareness.help":
    "Dans l’application uniquement. Ces contrôles n’envoient aucun e-mail. Les blocages restent visibles jusqu’à la modification de la file d’attente ; les ouvrir n’approuve ni ne relance le travail.",
  "awareness.project": "Choisir un projet",
  "awareness.approval": "Cette version exacte doit être approuvée",
  "awareness.resume": "La version approuvée est toujours suspendue",
  "awareness.late":
    "Cette date est passée. Vérifiez le brouillon et choisissez explicitement une action de programmation.",
  "awareness.paused":
    "L’automatisation est volontairement en pause. Les blocages de publication existants restent distincts.",
  "awareness.disabled": "L’automatisation est désactivée.",
  "awareness.settings": "Ouvrir les paramètres de planification",
  "awareness.history":
    "Dernier résultat hebdomadaire enregistré — historique, sans nouvelle vérification du quota ou des sources",
  "awareness.empty": "Aucun blocage d’approbation sur cette page.",
  "awareness.page": "Page {page} sur {pages} de la file d’attente",
  "awareness.error": "Impossible de vérifier les enregistrements actuels. Actualisez avant d’agir.",
  "awareness.checked": "Vérifié {at}",
  "awareness.weekly": "Enregistrements des créneaux hebdomadaires actuels",
  "awareness.earlier": "Alertes précédentes",
  "notifications.failureInspect": "Examiner les détails de publication",
  "notifications.failureReadError":
    "Impossible de vérifier les détails de publication. Réessayez avant de décider de la suite.",
  "notifications.failureReason.contentReview":
    "La tentative enregistrée a été bloquée par les contrôles du contenu. Ouvrez le brouillon pour vérifier s’il est actuellement prêt.",
  "notifications.failureReason.destination":
    "La tentative enregistrée indique une erreur de connexion ou de réponse de la destination. Vérifiez la destination avant de réessayer.",
  "notifications.failureReason.configuration":
    "La tentative enregistrée indique une configuration de publication absente ou non valide. Vérifiez la configuration du projet.",
  "notifications.failureReason.unknown":
    "L’erreur enregistrée n’a pas pu être classée. Vérifiez le brouillon et la destination avant de réessayer.",
  "notifications.failureRecorded":
    "Enregistrement mis à jour {at}, dans le fuseau horaire de votre navigateur. Tentatives enregistrées : {attempts}.",
  "notifications.failureDraftChanged":
    "Le brouillon a changé depuis cet enregistrement. Ces détails peuvent ne plus refléter son état de préparation actuel.",
  "notifications.failureHttp": "Réponse du site enregistrée : HTTP {status}.",
  "notifications.failureCheck.links":
    "Résolvez les liens internes dans le panneau de sécurité des liens de l’éditeur.",
  "notifications.failureCheck.sourcesReview":
    "Vérifiez les affirmations à l’aide de sources ou d’un auteur qualifié, puis terminez la révision humaine.",
  "notifications.failureCheck.author":
    "Ajoutez le nom de l’auteur réel et une biographie, une qualification ou un profil.",
  "notifications.failureHistoryLimit":
    "Il s’agit d’informations historiques enregistrées dans Milo. Cette vue ne vérifie pas la destination, n’approuve pas le brouillon actuel et ne relance pas la publication.",
  "notifications.failureState.absent":
    "Aucun enregistrement correspondant dans la file d’attente. Actualisez les notifications et vérifiez le brouillon.",
  "notifications.failureState.changed":
    "Cet élément n’est plus indiqué comme ayant échoué dans la file d’attente. Actualisez les notifications ; cela ne vérifie pas à lui seul le site de destination.",
  "notifications.recoveryInspect": "Examiner le travail enregistré",
  "notifications.recoveryReadError":
    "Impossible de vérifier les enregistrements d’automatisation. Réessayez avant de décider de relancer le travail.",
  "notifications.recoveryState.absent":
    "Aucun enregistrement d’exécution actuel. Actualisez les notifications pour vérifier si cet incident a été résolu.",
  "notifications.recoveryState.running": "La dernière exécution est indiquée comme active.",
  "notifications.recoveryState.completed":
    "La dernière exécution est terminée. Actualisez les notifications pour consulter les problèmes actuels.",
  "notifications.recoveryState.review_required":
    "L’exécution interrompue doit encore être examinée.",
  "notifications.recoverySnapshot":
    "Enregistrements Milo vérifiés {at}, dans le fuseau horaire de votre navigateur.",
  "notifications.recoveryCounts":
    "Plan {period} : {saved} brouillons enregistrés. Enregistrements de leur file d’attente : {pending} en attente, {publishing} en cours, {published} indiqués comme publiés, {failed} en échec et {cancelled} annulés.",
  "notifications.recoveryEvidenceLimit":
    "Ces enregistrements sont conservés dans Milo. Ils ne vérifient ni la dernière opération d’IA ni le site de destination. Vérifiez la destination avant de réessayer une publication dont le résultat est incertain. Cette vue ne relance pas le travail.",
  "notifications.recoveryMore":
    "Affichage de {shown} brouillons enregistrés sur {total}. Ouvrez le calendrier pour examiner le travail restant.",
  "notifications.emailAddressUnverified":
    "L’adresse e-mail actuelle de votre compte n’est pas vérifiée. Confirmez votre adresse, puis vérifiez à nouveau. Si un administrateur a modifié l’adresse et que vous n’avez pas de lien de confirmation, contactez l’assistance Milo. Les notifications dans l’application restent disponibles.",
  "notifications.emailAddressUnavailable":
    "Milo n’a pas pu vérifier la confirmation de votre adresse e-mail actuelle. Réessayez plus tard. Vous pouvez toujours désactiver les récapitulatifs et utiliser les notifications dans l’application.",
  "notifications.generation_capacity_low":
    "Le quota de préparation pourrait ne pas couvrir le plan",
  "notifications.generation_capacity_unavailable":
    "Le quota de préparation n’a pas pu être vérifié",
  "notifications.capacityLow":
    "Le plan {period} nécessite encore {missing} brouillons pour ce projet et {total} pour l’ensemble de vos planifications actives. Il reste {remaining} tentatives de préparation sur votre compte pour {usagePeriod}. Ce quota est partagé et ne garantit pas des articles terminés. Vérifiez la planification ; les brouillons enregistrés restent disponibles pour révision et publication.",
  "notifications.capacityUnavailable":
    "Milo n’a pas pu vérifier le quota partagé de préparation pour {usagePeriod}. Le plan {period} nécessite encore {missing} brouillons ici. Vérifiez à nouveau plus tard. Les brouillons enregistrés et les autres notifications restent disponibles.",
  "notifications.scheduler_recovery": "L’automatisation nécessite une vérification avant reprise",
  "notifications.recovery":
    "La préparation est en pause après une exécution interrompue. Vérifiez les brouillons enregistrés et la dernière opération avant de relancer. Les approbations de publication existantes sont inchangées.",
  "notifications.emailTitle": "Récapitulatifs par e-mail",
  "notifications.emailDescription":
    "Recevez un récapitulatif des nouvelles alertes, au maximum une fois par heure, à l’adresse confirmée de votre compte. Chaque incident apparaît une seule fois.",
  "notifications.emailDisabled":
    "L’envoi d’e-mails n’est pas encore activé. Les notifications dans l’application sont disponibles.",
  "notifications.emailEnable": "Activer les récapitulatifs par e-mail",
  "notifications.emailDisable": "Désactiver les récapitulatifs par e-mail",
  "notifications.emailError": "Les paramètres d’e-mail sont temporairement indisponibles.",
  "notifications.emailSaveError": "Impossible d’enregistrer les préférences d’e-mail.",
  "notifications.emailHistory": "Activité e-mail récente",
  "notifications.emailStatus.pending": "En attente",
  "notifications.emailStatus.leased": "Vérification de l’état actuel",
  "notifications.emailStatus.sending": "Envoi en cours",
  "notifications.emailStatus.accepted": "Accepté par le prestataire d’e-mail",
  "notifications.emailStatus.unknown": "Le résultat de l’envoi doit être vérifié",
  "notifications.emailStatus.cancelled": "Annulé",
  "notifications.emailStatus.failed": "Impossible de préparer l’e-mail",
  "notifications.title": "Notifications",
  "notifications.subtitle":
    "Vos prochaines décisions et les problèmes de publication, vérifiés selon le dernier état du serveur.",
  "notifications.loading": "Vérification de votre plan…",
  "notifications.empty": "Aucune action ne nécessite votre attention pour le moment.",
  "notifications.error": "Les notifications sont temporairement indisponibles.",
  "notifications.stale":
    "La dernière vérification n’a pas abouti. Voici les dernières alertes confirmées.",
  "notifications.refresh": "Vérifier à nouveau",
  "notifications.read": "Marquer comme lue",
  "notifications.unread": "Non lue",
  "notifications.saved": "Lue",
  "notifications.open": "Ouvrir la tâche",
  "notifications.calendar": "Ouvrir le calendrier",
  "notifications.project": "Projet",
  "notifications.approval_due": "Approbation requise prochainement",
  "notifications.publication_failed": "La publication doit être vérifiée",
  "notifications.manual_overdue": "La tâche manuelle est en retard",
  "notifications.cadence_gap": "La semaine prochaine nécessite votre attention",
  "notifications.coverage":
    "{missing} créneaux prévus sur {total} ne sont pas prêts et en file d’attente.",
  "notifications.failure":
    "Vérifiez la destination avant de réessayer : une publication interrompue pourrait déjà être en ligne.",
  "notifications.approval": "Vérifiez la version actuelle avant l’échéance prévue.",
  "notifications.manual":
    "Terminez cette tâche ou choisissez une nouvelle date. Cette échéance concerne une tâche manuelle.",
  "notifications.readError":
    "Impossible de marquer cette notification comme lue. Veuillez réessayer.",
  "emailSettings.language": "Langue des e-mails",
  "emailSettings.note":
    "Choisissez la langue de vos récapitulatifs opérationnels, des rapports mensuels et des invitations de projet dont vous demandez l’envoi. Cela ne modifie pas les paramètres de l’application, des articles ou du marché. Enregistrer la langue n’active ni n’envoie aucun e-mail.",
  "emailSettings.save": "Enregistrer la langue des e-mails",
  "emailSettings.saved": "Paramètres d’e-mail enregistrés.",
  "emailSettings.uncertain":
    "Les paramètres enregistrés n’ont pas pu être confirmés. Rechargez-les avant toute autre modification ; votre dernière modification pourrait déjà être enregistrée.",
  "emailSettings.reload": "Recharger les paramètres enregistrés (abandonner les modifications)",
  "team.title": "L’équipe de Milo",
  "team.help":
    "Un espace de travail unique, avec des vues spécialisées sur le travail réel et les connaissances du projet.",
  "team.selectProject": "Choisissez un projet pour voir son équipe.",
  "team.scope":
    "Le statut des tâches couvre la semaine sélectionnée. Les conseils et rapports enregistrés sont des éléments datés, pas la preuve d’une tâche active ou de résultats améliorés.",
  "team.aiRole": "Spécialiste IA",
  "team.records":
    "{count} connaissances enregistrées · consultez leur statut de révision dans les connaissances du projet",
  "team.lastDelivery": "Dernière livraison parmi les tâches de cette semaine",
  "team.auditFetched": "Audit du site enregistré",
  "team.auditPartial": "Audit enregistré fondé uniquement sur le contexte du projet",
  "team.adviceSaved": "Conseils de préparation à l’IA enregistrés",
  "team.imports": "{count} imports de mesures GSC enregistrés",
  "team.measurementMissing": "Aucune mesure GSC enregistrée",
  "team.authorityPrerequisite":
    "Les données du prestataire et l’autorisation de prospection doivent être vérifiées dans l’espace des liens entrants.",
  "team.lesson.title": "Mémoriser une consigne éditoriale",
  "team.lesson.help":
    "Décrivez une préférence récurrente pour ce projet. L’enregistrer en fait une instruction explicite pour les futurs travaux concernés. Les modifications ordinaires d’articles ne créent pas de consignes. Cela ne constitue pas une preuve factuelle.",
  "team.lesson.rule": "Instruction pour ce projet",
  "team.lesson.target": "Appliquer à",
  "team.lesson.text": "Rédaction",
  "team.lesson.visual": "Visuels",
  "team.lesson.both": "Rédaction et visuels",
  "team.lesson.save": "Enregistrer l’instruction du projet",
  "team.lesson.manage": "Vérifier, modifier ou oublier des connaissances",
  "team.lesson.saved":
    "Enregistré dans ce projet. Vous pouvez modifier, annuler ou révoquer cette instruction dans les connaissances du projet.",
  "team.lesson.unknown":
    "L’enregistrement n’a pas pu être confirmé. Consultez les connaissances du projet avant de saisir à nouveau l’instruction.",
  "team.role.lead": "Milo — Responsable de la croissance",
  "team.description.lead":
    "Coordonne la planification enregistrée, la couverture et les décisions.",
  "team.open.lead": "Examiner la préparation hebdomadaire",
  "team.role.brand": "Stratège de marque",
  "team.description.brand":
    "Faits du projet, préférences et consignes réversibles, avec les sources et l’historique des vérifications.",
  "team.open.brand": "Examiner les connaissances du projet",
  "team.role.research": "Spécialiste de la recherche",
  "team.description.research":
    "Briefs de recherche hebdomadaires et opportunités enregistrées. Vérifiez les sources et les hypothèses avant de rédiger.",
  "team.open.research": "Examiner les opportunités",
  "team.role.content": "Responsable éditorial",
  "team.description.content":
    "Les articles conservés nécessitent encore une révision éditoriale et l’approbation de leur version exacte avant publication.",
  "team.open.content": "Examiner les articles",
  "team.role.image": "Créateur visuel",
  "team.description.image":
    "Les visuels proposés utilisent le contexte du projet. Leur conservation ne signifie pas qu’ils sont approuvés.",
  "team.open.image": "Examiner les visuels des articles",
  "team.role.seo": "Spécialiste SEO",
  "team.description.seo":
    "Résultats datés d’audits des pages, des liens internes et des aspects locaux ou des entités. Les audits partiels conservent leurs limites.",
  "team.open.seo": "Examiner les résultats SEO",
  "team.role.authority": "Liens entrants et autorité",
  "team.description.authority":
    "La recherche, le suivi et les propositions dépendent d’un accès vérifié au prestataire. L’envoi de messages et l’achat de placements nécessitent des autorisations distinctes.",
  "team.open.authority": "Consulter l’espace des liens entrants",
  "team.role.ai": "Analyste de la visibilité dans l’IA",
  "team.description.ai":
    "Les conseils de préparation sont distincts des réponses, mentions et citations observées. Cette vue ne met pas en place un suivi des observations.",
  "team.open.ai": "Examiner les conseils de préparation",
  "team.role.performance": "Analyste de performance",
  "team.description.performance":
    "Rapports enregistrés et mesures datées. Les données manquantes sont inconnues ; une variation avant/après ne prouve pas à elle seule un lien de causalité.",
  "team.open.performance": "Examiner les mesures",
  "team.state.unavailable": "Statut indisponible",
  "team.state.none": "Aucun travail enregistré",
  "team.state.unknown": "Résultat incertain — examiner la récupération",
  "team.state.running": "Travail en cours",
  "team.state.review": "Les modifications du propriétaire doivent être examinées",
  "team.state.retained": "Résultats conservés pour vérification",
  "team.state.cancelled": "Préparation annulée",
  "collaboration.reviewImageLimits":
    "Ces images dépassent les limites de vérification ou ne peuvent pas être affichées en toute sécurité. Réduisez leur nombre ou leur taille et utilisez des images fixes PNG, JPEG ou WebP.",
  "collaboration.emailInvitation": "Envoyer l’invitation par e-mail",
  "collaboration.invitationEmailHelp":
    "Envoyez une invitation à l’adresse e-mail indiquée ci-dessus pour le rôle affiché. Ouvrir le lien de l’e-mail n’accorde aucun accès.",
  "collaboration.invitationEmailQueued":
    "L’envoi de l’invitation par e-mail a été demandé. Consultez son statut d’envoi ici.",
  "collaboration.notificationHistory": "Historique d’envoi des notifications",
  "collaboration.notificationSettings": "Notifications du projet",
  "collaboration.notificationConsentHelp":
    "L’attribution par le propriétaire et votre propre consentement sont tous deux nécessaires. Une modification de votre rôle dans le projet exige de renouveler ces paramètres.",
  "collaboration.notificationAssigned": "Attribuées par le propriétaire",
  "collaboration.notificationNotAssigned": "Non attribuées par le propriétaire",
  "collaboration.notificationOptedIn": "Consentement du destinataire donné",
  "collaboration.notificationOptedOut": "Consentement du destinataire non donné",
  "collaboration.notificationAssign": "Attribuer les notifications",
  "collaboration.notificationUnassign": "Retirer l’attribution",
  "collaboration.notificationOptIn": "Autoriser les notifications du projet",
  "collaboration.notificationOptOut": "Désactiver les notifications du projet",
  "collaboration.decisionRecorded": "Décision de révision enregistrée.",
  "collaboration.decisionUnknown":
    "La décision n’a pas pu être confirmée. Actualisez les décisions précédentes avant de réessayer.",
  "collaboration.reviewNotAllowed":
    "Votre rôle actuel ou la politique du projet ne permet pas de prendre des décisions de révision.",
  "collaboration.acknowledgeReview": "J’ai examiné ce brouillon rendu et toutes ses images.",
  "collaboration.approveVersion": "Approuver cette version",
  "collaboration.returnForChanges": "Demander des modifications",
  "collaboration.reviewDoesNotPublish":
    "Enregistrer une révision ne publie pas le brouillon et ne reprend pas une programmation suspendue.",
  "collaboration.reviewHistory": "Décisions de révision précédentes",
  "collaboration.approvalRecorded": "Approbation enregistrée",
  "collaboration.changesRequested": "Modifications demandées",
  "collaboration.owner": "Propriétaire",
  "collaboration.collaborator": "Collaborateur",
  "collaboration.renderedReview": "Vérification du rendu",
  "collaboration.loadingReview": "Chargement de la version complète à vérifier et de ses images…",
  "collaboration.incompleteReview":
    "La version complète à vérifier n’a pas pu être chargée. Actualisez pour examiner le brouillon et toutes ses images.",
  "collaboration.policyTitle": "Politique d’approbation",
  "collaboration.policyHelp":
    "Choisissez qui peut approuver le travail du projet. Modifier cette politique retire les approbations existantes des collaborateurs ; les approbations indépendantes du propriétaire sont conservées.",
  "collaboration.policyUnselected":
    "Non sélectionnée — l’approbation par les collaborateurs est inactive",
  "collaboration.policy.disabled": "Approbations du propriétaire uniquement",
  "collaboration.policy.separate_reviewers":
    "Des réviseurs distincts approuvent ; les éditeurs modifient",
  "collaboration.policy.editors_can_approve": "Les éditeurs et les réviseurs peuvent approuver",
  "collaboration.savePolicy": "Enregistrer la politique d’approbation",
  "collaboration.editDraft": "Modifier le brouillon",
  "collaboration.editHelp":
    "L’enregistrement remet ce brouillon en révision et retire son approbation de publication précédente.",
  "collaboration.editConflict":
    "Le brouillon enregistré ou votre rôle a changé. Copiez les modifications à conserver avant de charger la dernière version enregistrée.",
  "collaboration.loadLatest": "Charger la dernière version enregistrée",
  "collaboration.draftSaved": "Brouillon enregistré pour révision.",
  "collaboration.editError":
    "Le brouillon n’a pas pu être enregistré. Vos modifications sont toujours présentes ; vérifiez la version actuelle et vos droits d’accès avant de réessayer.",
  "collaboration.saveDraft": "Enregistrer pour révision",
  "collaboration.question": "Question",
  "collaboration.answer": "Réponse",
  "collaboration.removeQuestion": "Supprimer la question",
  "collaboration.addQuestion": "Ajouter une question",
  "collaboration.field.title": "Titre",
  "collaboration.field.h1": "Titre principal",
  "collaboration.field.metaTitle": "Titre pour la recherche",
  "collaboration.field.metaDescription": "Description pour la recherche",
  "collaboration.field.markdown": "Article (Markdown)",
  "collaboration.field.cta": "Appel à l’action",
  "collaboration.field.outline": "Plan — un titre par ligne",
  "collaboration.field.faq": "Questions et réponses",
  "collaboration.comments": "Commentaires",
  "collaboration.commentLabel": "Votre commentaire",
  "collaboration.addComment": "Ajouter un commentaire",
  "collaboration.you": "Vous",
  "collaboration.commentRoleAtPosting": "Rôle lors de l’envoi",
  "collaboration.earlierVersion": "Commentaire sur une version enregistrée précédente.",
  "collaboration.title": "Collaborateurs du projet",
  "collaboration.subtitle": "Gérez les accès au projet et ouvrez le travail partagé avec vous.",
  "collaboration.owned": "Gérer votre projet",
  "collaboration.shared": "Partagés avec vous",
  "collaboration.invitations": "Vos invitations",
  "collaboration.members": "Personnes disposant d’un accès",
  "collaboration.pending": "Invitations au projet",
  "collaboration.email": "Adresse e-mail",
  "collaboration.role": "Rôle",
  "collaboration.viewer": "Lecteur",
  "collaboration.editor": "Éditeur",
  "collaboration.reviewer": "Réviseur",
  "collaboration.invite": "Créer une invitation",
  "collaboration.inviteHelp":
    "L’invitation apparaît ici lorsque le destinataire se connecte avec cette adresse e-mail vérifiée. Elle expire après sept jours. Cette action n’envoie aucun e-mail.",
  "collaboration.accept": "Accepter l’invitation",
  "collaboration.revoke": "Révoquer l’invitation",
  "collaboration.remove": "Retirer l’accès",
  "collaboration.saveRole": "Enregistrer le rôle",
  "collaboration.refresh": "Actualiser",
  "collaboration.open": "Ouvrir le projet",
  "collaboration.loading": "Chargement des accès au projet…",
  "collaboration.error": "L’accès n’a pas pu être confirmé. Actualisez avant de réessayer.",
  "collaboration.saved": "Accès au projet mis à jour.",
  "collaboration.empty": "Rien à afficher pour le moment.",
  "collaboration.noOwned":
    "Vous pouvez ouvrir les projets partagés ci-dessous sans créer votre propre projet.",
  "collaboration.drafts": "Brouillons du projet",
  "collaboration.back": "Retour aux brouillons",
  "collaboration.previous": "Précédent",
  "collaboration.next": "Suivant",
  "collaboration.removed": "Retiré",
  "collaboration.expires": "Expiration",
  "collaboration.history": "Activité récente des accès",
  "collaboration.pendingState": "En attente",
  "collaboration.expired": "Expirée",
  "collaboration.accepted": "Acceptée",
  "collaboration.revoked": "Révoquée",
};
