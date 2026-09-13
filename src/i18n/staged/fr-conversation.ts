import type { ConversationCopy } from "../conversation";
export const frConversation: ConversationCopy = {
  "chat.export": "Exporter la conversation",
  "chat.exportHelp":
    "Télécharge les messages, reçus et propositions historiques dans un fichier JSON. Les fichiers liés sont séparés.",
  "chat.exporting": "Préparation de la conversation complète…",
  "chat.exportFailed": "L’export a échoué. Attendez la fin du travail en cours, puis réessayez.",
  "chat.erase": "Supprimer la conversation",
  "chat.eraseTitle": "Supprimer définitivement cette conversation ?",
  "chat.eraseHelp":
    "Supprime définitivement les messages et propositions. Les brouillons, résultats et données de facturation sont conservés. Le travail déjà envoyé peut se terminer et consommer votre quota. Les enregistrements évitant les doublons sont conservés.",
  "chat.erasing": "Suppression de la conversation…",
  "chat.eraseUnconfirmed":
    "La suppression n’a pas pu être confirmée. Les messages restent masqués ici. Réessayez la suppression pour confirmer le résultat.",
  "chat.eraseRetry": "Réessayer la suppression",
  "chat.erased": "Conversation supprimée.",
  "chat.tool.draft_metadata_proposal": "Proposition de métadonnées du brouillon",
  "chat.proposal.review": "Examiner les modifications proposées",
  "chat.proposal.before": "Avant",
  "chat.proposal.after": "Proposition",
  "chat.proposal.ready":
    "L’enregistrement remet le brouillon en révision et retire son autorisation de publication précédente.",
  "chat.proposal.waiting":
    "Attendez la fin de cette tâche avant d’enregistrer les modifications proposées.",
  "chat.proposal.unavailable":
    "Cette proposition ne peut plus être enregistrée. Demandez une nouvelle proposition basée sur le brouillon actuel.",
  "chat.proposal.applied":
    "Ces modifications ont été enregistrées. Des modifications ultérieures peuvent avoir changé le contenu.",
  "chat.proposal.unconfirmed":
    "L’enregistrement n’a pas pu être confirmé. Vérifiez l’état enregistré avant de réessayer.",
  "chat.proposal.empty": "(vide)",
  "chat.title": "Parler à Milo",
  "chat.openContext": "Ouvrir la vue du projet",
  "chat.description":
    "Dites à Milo ce que vous souhaitez améliorer. Le spécialiste IA adapté poursuit ici avec le contexte enregistré de votre projet.",
  "chat.chooseProject": "Client ou projet",
  "chat.ownProjects": "Vos projets",
  "chat.history": "Conversations",
  "chat.new": "Nouvelle conversation",
  "chat.welcome": "Sur quoi allons-nous travailler ?",
  "chat.private": "Votre conversation privée dans ce projet.",
  "chat.sharedPrivate":
    "Votre conversation privée dans un projet partagé. Vos droits actuels dans l’équipe s’appliquent.",
  "chat.reviewPrompt": "Examinez la structure SEO de mes brouillons enregistrés.",
  "chat.knowledgePrompt": "Que pouvez-vous me dire à partir du contexte enregistré de ce projet ?",
  "chat.messageFor": "Message pour {project}",
  "chat.placeholder": "Décrivez la tâche et le résultat souhaité…",
  "chat.keyboard": "Ctrl / ⌘ + Entrée pour envoyer. Entrée commence une nouvelle ligne.",
  "chat.tooLong": "Ce message est trop long. Raccourcissez-le avant de l’envoyer.",
  "chat.full":
    "Cette conversation a atteint sa limite. Commencez une nouvelle conversation pour continuer.",
  "chat.allowGeneration":
    "Autoriser un brouillon pour un sujet existant dans cette demande. Utilise le quota de contenu et enregistre le résultat pour examen.",
  "chat.generationEnabled": "Génération d’un brouillon autorisée pour cette demande.",
  "chat.usage":
    "Les réponses utilisent le quota IA de votre compte. La génération de brouillons utilise aussi le quota de contenu. La publication est une étape distincte.",
  "chat.send": "Envoyer le message",
  "chat.you": "Vous",
  "chat.messages": "Messages de la conversation",
  "chat.page": "Tâches {from}–{to} sur {total}",
  "chat.latest": "Derniers messages",
  "chat.sending": "Envoi et vérification du statut enregistré…",
  "chat.pending": "Demande enregistrée ; en attente de démarrage.",
  "chat.running": "Traitement de votre demande…",
  "chat.completed": "Réponse enregistrée.",
  "chat.failed":
    "Cette tentative s’est arrêtée. Examinez le travail enregistré avant d’envoyer une autre demande.",
  "chat.unknown":
    "Le résultat final n’a pas pu être confirmé. Vérifiez les résultats enregistrés avant de recommencer.",
  "chat.cancelled":
    "La suite du travail est annulée. Une opération déjà envoyée peut encore se terminer.",
  "chat.provider_unavailable":
    "Le fournisseur IA n’est pas configuré pour ce compte. Contactez votre administrateur.",
  "chat.usage_limit":
    "Le quota IA de votre compte ne permet pas une étape supplémentaire. Vérifiez l’utilisation avant de continuer.",
  "chat.budget_unavailable":
    "Les dépenses IA sont indisponibles avec les paramètres budgétaires actuels. Demandez à votre administrateur de les vérifier.",
  "chat.unavailable":
    "L’accès ou le statut enregistré de la conversation n’a pas pu être confirmé. Actualisez avant de continuer.",
  "chat.sendUnconfirmed":
    "Cette demande n’a pas pu être confirmée. Récupérez la demande d’origine ou vérifiez l’historique avant de l’envoyer comme nouvelle tâche.",
  "chat.recover": "Récupérer la demande d’origine",
  "chat.resume": "Démarrer la demande enregistrée",
  "chat.stop": "Arrêter la suite du travail",
  "chat.stopHelp":
    "L’arrêt empêche les étapes suivantes. Une demande déjà envoyée peut encore se terminer et utiliser votre quota.",
  "chat.evidenceSaved": "Résultat enregistré dans cette conversation.",
  "chat.toolUnavailable": "Cette opération est indisponible avec le rôle ou les droits actuels.",
  "chat.partialHistory":
    "Le spécialiste a reçu une partie abrégée de l’historique enregistré. Reformulez toute exigence manquante.",
  "chat.tool.project_brief": "Contexte du projet",
  "chat.tool.draft_read": "Examen du brouillon enregistré",
  "chat.tool.draft_seo_review": "Vérification de la structure du brouillon enregistré",
  "chat.tool.project_knowledge": "Connaissances du projet",
  "chat.tool.weekly_preparation": "Statut de la préparation hebdomadaire",
  "chat.tool.saved_audit": "Examen de l’audit enregistré",
  "chat.tool.draft_generation": "Génération du brouillon",
};
