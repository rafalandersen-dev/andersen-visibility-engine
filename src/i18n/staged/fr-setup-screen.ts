/** Authoring only; unavailable in the runtime and picker. */
export const frSetupScreen: Readonly<Record<string, string>> = {
  "setupScreen.invalidUrl": "Le champ « {field} » doit commencer par http:// ou https://",
  "setupScreen.missing": "Renseignez les champs obligatoires : {fields}",
  "setupScreen.additional": "Langues de contenu supplémentaires",
  "setupScreen.sellingPoints": "Arguments de vente distinctifs",
  "setupScreen.publishing": "Publication",
  "setupScreen.mode": "Mode de publication",
  "setupScreen.mode.draft": "Brouillon uniquement",
  "setupScreen.mode.manual": "Publication manuelle en ligne",
  "setupScreen.endpoint": "Point de terminaison d’envoi des brouillons",
  "setupScreen.liveEndpoint": "Point de terminaison de publication en ligne",
  "setupScreen.liveHelp":
    "Un point de terminaison distinct pour publier un brouillon relu. Il utilise le même secret de publication.",
  "setupScreen.secret": "Secret de publication",
  "setupScreen.secretHelp":
    "Les nouveaux secrets sont enregistrés par le serveur et envoyés à la destination configurée dans un en-tête de requête. Configurez le même secret sur cette destination.",
  "setupScreen.destination": "Destination par défaut",
  "setupScreen.faq": "Section FAQ",
  "setupScreen.approvalHelp":
    "L’approbation marque un article comme prêt. La publication nécessite une action distincte : publier maintenant ou programmer une date. Vérifiez le contenu et les affirmations avant de publier.",
  "setupScreen.disclaimer": "Avertissement relatif au contenu généré par l’IA",
  "setupScreen.retiredTitle": "La publication automatique à l’approbation a été supprimée.",
  "setupScreen.retiredHelp":
    "Ce projet utilise désormais {mode}. L’approbation marque un article comme prêt ; la publication nécessite toujours une action distincte ou une programmation. Des articles déjà approuvés peuvent encore être des brouillons. Vérifiez leur état avant de programmer de nouveaux travaux.",
  "setupScreen.saving": "Enregistrement…",
  "setupScreen.save": "Enregistrer les paramètres de publication",
  "setupScreen.saved": "Paramètres de publication enregistrés",
  "setupScreen.failed": "Impossible d’enregistrer les paramètres de publication",
  "setupScreen.tagsExample": "seo, croissance",
};
