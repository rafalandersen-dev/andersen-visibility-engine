/** French backlink and placement copy, staged outside the live interface. */
export const frLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Réseau de développement de liens",
  "linknet.subtitle":
    "Trouvez des sites pertinents dans le réseau Milo, envoyez une présentation personnelle et laissez Milo vérifier la présence du lien en ligne.",
  "linknet.policyNote":
    "La pertinence est prioritaire : les correspondances exigent des sujets communs, les échanges directs de liens sont signalés et rien n’est placé automatiquement. Ces contrôles ne garantissent pas le respect des règles des moteurs de recherche.",
  "linknet.topics": "Sujets",
  "linknet.topicsPlaceholder": "Sujets (séparés par des virgules)",
  "linknet.contact": "E-mail de contact",
  "linknet.contactPlaceholder": "E-mail de contact pour les partenaires",
  "linknet.join": "Rejoindre le réseau",
  "linknet.update": "Mettre à jour la fiche",
  "linknet.pause": "Mettre en pause",
  "linknet.joined": "Fiche publiée ; les partenaires peuvent maintenant trouver ce site.",
  "linknet.paused": "Fiche mise en pause.",
  "linknet.find": "Trouver des partenaires",
  "linknet.noMatches":
    "Aucun partenaire pertinent pour le moment ; le réseau grandit avec chaque site Milo qui le rejoint.",
  "linknet.score": "Correspondance",
  "linknet.copyIntro": "Copier l’e-mail de présentation",
  "linknet.introCopied": "Présentation copiée ; collez-la dans votre e-mail.",
  "linknet.markContacted": "Marquer comme contacté",
  "linknet.markAgreed": "Marquer comme convenu",
  "linknet.decline": "Refuser",
  "linknet.targetUrlPlaceholder": "URL de la page convenue (où le lien apparaîtra)",
  "linknet.verify": "Vérifier le lien",
  "linknet.verified": "Lien trouvé ; son emplacement est en ligne et vérifié.",
  "linknet.notFound": "Aucun lien trouvé sur cette page pour le moment ; vérification enregistrée.",
  "linknet.liveSince": "En ligne depuis",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Dernière vérification : lien introuvable",
  "linknet.reciprocalWarn":
    "Attention : cela créerait un échange direct de liens avec ce site. Examinez sa pertinence et évitez les échanges excessifs.",
  "linknet.status.suggested": "Suggéré",
  "linknet.status.contacted": "Contacté",
  "linknet.status.agreed": "Convenu",
  "linknet.status.live_verified": "En ligne ✓",
  "linknet.status.declined": "Refusé",
  "backlinks.title": "Liens entrants",
  "backlinks.subtitle":
    "Données de liens entrants pour votre domaine : force du profil, écarts avec les concurrents et recommandations prudentes de création de liens.",
  "backlinks.disclaimer":
    "Les mesures proviennent d’un index externe de liens et sont des estimations ; aucun index ne voit tous les liens. Les recommandations sont uniquement des suggestions de pratiques loyales : Milo ne propose jamais de systèmes de liens ni de liens payants non déclarés, et ne garantit ni classements, ni trafic, ni revenus.",
  "backlinks.run": "Lancer l’analyse des liens entrants",
  "backlinks.rerun": "Actualiser l’analyse",
  "backlinks.running": "Analyse…",
  "backlinks.empty":
    "Lancez une analyse pour consulter le profil de liens de votre domaine, le comparer à ceux de vos concurrents et repérer les domaines qui pointent vers eux plutôt que vers vous.",
  "backlinks.notConfigured.title": "Connecter une source de données de liens entrants",
  "backlinks.notConfigured.body":
    "Ce module utilise l’index de liens DataForSEO et n’est pas encore connecté. Le propriétaire de l’espace doit créer un compte DataForSEO avec paiement à l’usage et ajouter DATAFORSEO_LOGIN et DATAFORSEO_PASSWORD comme secrets côté serveur. Les données de liens entrants restent indisponibles jusque-là.",
  "backlinks.status.ready.title": "DataForSEO opérationnel",
  "backlinks.status.ready.body": "L’API Backlinks est connectée et répond.",
  "backlinks.status.lowBalance.title": "Le solde DataForSEO est faible",
  "backlinks.status.lowBalance.body":
    "Rechargez prochainement le compte pour éviter l’interruption des analyses.",
  "backlinks.status.paused.title": "L’accès à DataForSEO est suspendu",
  "backlinks.status.paused.body":
    "Contactez l’assistance DataForSEO pour réactiver le compte avant de lancer une autre analyse.",
  "backlinks.status.error.title": "État de DataForSEO indisponible",
  "backlinks.status.error.body":
    "Le compte ou l’API Backlinks n’a pas pu être vérifié. Actualisez l’état ou consultez le tableau de bord du fournisseur.",
  "backlinks.status.balance": "Solde : {balance}.",
  "backlinks.status.refresh": "Actualiser l’état",
  "backlinks.competitorsUsed": "Concurrents comparés : {list}",
  "backlinks.competitorsFromAnalysis":
    "Concurrents de la dernière analyse Concurrents utilisés : {list}",
  "backlinks.noCompetitors":
    "Aucune URL de concurrent dans ce projet ; l’analyse couvrira uniquement votre profil. Ajoutez des concurrents dans la configuration du projet ou le module Concurrents pour comparer les écarts de liens.",
  "backlinks.lastRun": "Dernière analyse : {date}",
  "backlinks.score.overall": "Position en matière de liens",
  "backlinks.score.profile": "Force du profil",
  "backlinks.score.gap": "Écart avec les concurrents",
  "backlinks.score.quality": "Qualité des liens",
  "backlinks.gapHint": "plus élevé = davantage de potentiel",
  "backlinks.summaryHeading": "Synthèse",
  "backlinks.topActions": "Actions prioritaires sur les liens",
  "backlinks.profileTable": "Votre domaine et vos concurrents",
  "backlinks.table.domain": "Domaine",
  "backlinks.table.rank": "Rang du domaine",
  "backlinks.table.backlinks": "Liens entrants",
  "backlinks.table.referringDomains": "Domaines référents",
  "backlinks.table.broken": "Liens cassés",
  "backlinks.table.spam": "Score de spam",
  "backlinks.table.notFetched": "Les données n’ont pas pu être récupérées",
  "backlinks.you": "Vous",
  "backlinks.gapHeading": "Écart de liens : ils pointent vers les concurrents, pas vers vous",
  "backlinks.gapNote":
    "Échantillon demandé à l’index du fournisseur en excluant votre domaine. Cela ne vérifie pas indépendamment que ces sites n’ont aucun lien vers vous.",
  "backlinks.gap.linksTo": "Pointe vers",
  "backlinks.gapEmpty":
    "Aucun écart de liens trouvé ; soit aucun concurrent n’a été récupéré, soit aucun recoupement n’a été trouvé.",
  "backlinks.referringHeading": "Principaux domaines référents pointant vers vous",
  "backlinks.referringEmpty":
    "Aucun domaine référent trouvé dans l’index pour le moment ; un domaine récent commence souvent à zéro.",
  "backlinks.recommendations": "Recommandations",
  "backlinks.effort": "Effort",
  "backlinks.target": "Cible / plateforme",
  "backlinks.approach": "Approche",
  "backlinks.action.convert": "Créer une opportunité",
  "backlinks.action.converted": "Opportunité créée",
  "backlinks.action.convertTop": "Convertir les principales recommandations",
  "backlinks.toast.done": "Analyse des liens entrants terminée",
  "backlinks.toast.converted": "Opportunité créée",
  "backlinks.toast.convertedTop": "{count} opportunités créées",
  "backlinks.category.linkGapTargets": "Cibles pour combler les écarts de liens",
  "backlinks.category.contentForLinks": "Contenu pour obtenir des liens",
  "backlinks.category.digitalPr": "Relations presse numériques",
  "backlinks.category.partnerships": "Partenariats et parrainages",
  "backlinks.category.directories": "Annuaires et profils",
  "backlinks.category.linkHygiene": "Entretien des liens",
  "backlinks.integrity.partial": "Mesures partielles",
  "backlinks.integrity.source":
    "Source déclarée : index DataForSEO à la date de l’analyse enregistrée, pour les domaines affichés, sous-domaines compris. Les libellés de source des données enregistrées ne constituent pas une vérification indépendante. — signifie indisponible, jamais zéro. La couverture de l’index est incomplète ; il ne s’agit pas de vérifications des destinations en direct.",
  "backlinks.integrity.legacy":
    "Ancienne analyse conservée. La normalisation antérieure pouvait transformer des données manquantes en zéros ; sa base chiffrée est donc indisponible. Les recommandations d’origine restent des conseils historiques.",
  "backlinks.integrity.scores":
    "Les scores et recommandations sont des estimations de l’IA fondées sur les preuves disponibles, et non des mesures du fournisseur, des garanties de classement ou des résultats mesurés.",
  "backlinks.integrity.sample":
    "Échantillon limité des principaux domaines. Les domaines absents ne prouvent pas l’absence ou la perte de liens ; aucun suivi continu n’est établi.",
  "backlinks.integrity.failed":
    "Échec de la requête. Ce tableau est indisponible ; cela ne signifie pas qu’il n’y a aucun lien entrant ou aucun écart de liens.",
  "backlinks.integrity.not_requested":
    "Aucun échantillon d’écarts demandé, car aucun domaine concurrent n’a été fourni.",
  "backlinks.integrity.unknown": "L’état de collecte de ce tableau est inconnu.",
  "backlinks.integrity.empty":
    "Aucune ligne à afficher. Vérifiez l’état de collecte ci-dessus avant d’interpréter ce tableau.",
  "marketplace.title": "Publications sponsorisées",
  "marketplace.subtitle":
    "Associez les opportunités de liens entrants à des placements sponsorisés transparents et examinés sur le plan éditorial.",
  "marketplace.disclosureTitle": "Place de marché de pratiques loyales.",
  "marketplace.disclosure":
    'Chaque demande exige une mention claire du parrainage et rel="sponsored". Une demande n’est pas un achat et ne garantit jamais de classement, de trafic ou de revenus.',
  "marketplace.demoNoticeTitle": "Catalogue d’aperçu.",
  "marketplace.demoNotice":
    "Les domaines, mesures et prix ci-dessous sont des données de démonstration en attendant l’accès à l’API Linkhouse. Les demandes sont uniquement enregistrées dans Milo pour examen ; aucune commande fournisseur ni aucun paiement n’est créé.",
  "marketplace.demoBadge": "Démo",
  "marketplace.integrationTitle": "Intégration Linkhouse",
  "marketplace.integrationLive":
    "Le catalogue du fournisseur est connecté. Chaque commande payante nécessite toujours la confirmation du montant total exact.",
  "marketplace.integrationPending":
    "Le contrat d’interface de production est préparé ; la correspondance des points de terminaison et les identifiants restent en attente de la documentation Linkhouse.",
  "marketplace.catalogConnected": "Catalogue en direct",
  "marketplace.catalogDemo": "Catalogue de démonstration",
  "marketplace.orderingEnabled": "Commandes activées",
  "marketplace.orderingLocked": "Commandes verrouillées",
  "marketplace.offers": "Offres",
  "marketplace.orders": "Demandes",
  "marketplace.search": "Rechercher des domaines ou sujets…",
  "marketplace.noAnalysis":
    "Lancez l’analyse des liens entrants pour ajouter les écarts de liens aux critères de correspondance. La correspondance par sujet et marché est déjà active.",
  "marketplace.reason.linkGap": "Écart de liens avec les concurrents",
  "marketplace.rank": "Rang du domaine",
  "marketplace.traffic": "Trafic estimé",
  "marketplace.turnaround": "Délai",
  "marketplace.days": "{count} jours",
  "marketplace.price": "Prix indicatif",
  "marketplace.request": "Demander un examen",
  "marketplace.reviewPrice": "Examiner le prix",
  "marketplace.quoteLocked": "Configuration des devis requise",
  "marketplace.requested": "Demandé",
  "marketplace.quoteTitle": "Examiner le prix de publication",
  "marketplace.basePrice": "Prix du fournisseur",
  "marketplace.serviceFee": "Frais de service Milo ({count} %)",
  "marketplace.totalPrice": "Total exact",
  "marketplace.quoteExpires":
    "Ce devis expire à {time}. Un nouveau devis sera nécessaire après cette heure.",
  "marketplace.confirmSponsored":
    'J’exige une mention claire du parrainage et rel="sponsored" ou nofollow sur le lien.',
  "marketplace.confirmPaymentLive":
    "J’autorise explicitement une commande fournisseur pour le montant total exact de {total} €.",
  "marketplace.confirmPaymentDemo":
    "Je confirme la demande d’examen de {total} € et comprends que le mode démonstration ne crée aucune commande fournisseur ni aucun paiement.",
  "marketplace.confirmPurchase": "Confirmer la commande payante",
  "marketplace.confirmDemoRequest": "Enregistrer la demande d’examen",
  "marketplace.confirmedAt": "Confirmation",
  "marketplace.ordersEmpty": "Aucune demande de publication pour le moment.",
  "marketplace.toast.exists": "Cette offre a déjà une demande active.",
  "marketplace.toast.requested": "Demande de publication enregistrée pour examen.",
  "marketplace.toast.submitted": "Commande payante transmise au fournisseur.",
  "marketplace.toast.catalogError":
    "Impossible d’actualiser le catalogue du fournisseur. Le catalogue de démonstration reste disponible sans risque de commande.",
  "marketplace.toast.quoteError": "Impossible de préparer un devis. Veuillez réessayer.",
  "marketplace.toast.quoteExpired":
    "Le devis a expiré. Demandez un nouveau prix avant de confirmer.",
  "marketplace.toast.orderError": "La commande n’a pas été créée. Aucun paiement n’a été effectué.",
  "marketplace.toast.orderReview":
    "Le résultat du fournisseur n’a pas pu être confirmé. Milo a enregistré la demande avec le statut En cours d’examen ; ne réessayez pas avant sa régularisation.",
  "marketplace.status.Requested": "Demandée",
  "marketplace.status.In Review": "En cours d’examen",
  "marketplace.status.Submitted": "Transmise",
  "marketplace.status.Accepted": "Acceptée",
  "marketplace.status.Published": "Publiée",
  "marketplace.status.Failed": "Échec",
  "marketplace.status.Cancelled": "Annulée",
  "backlinkMonitor.website_changed":
    "Le site affiché ne correspond pas au projet enregistré. Enregistrez ou rechargez le projet avant la collecte. Aucune collecte n’a été lancée.",
  "backlinkMonitor.unavailable":
    "La collecte est indisponible tant que l’état du fournisseur ne confirme pas un compte actif avec un solde disponible. L’historique enregistré reste accessible.",
  "backlinkMonitor.yes": "Oui",
  "backlinkMonitor.no": "Non",
  "backlinkMonitor.title": "Historique des liens entrants",
  "backlinkMonitor.note":
    "Décomptes quotidiens issus de l’index DataForSEO pour le site enregistré. Les données manquantes sont indiquées par —, jamais par zéro. Ces observations ne vérifient pas les placements individuels de liens. Chaque requête utilise l’enveloppe fournisseur configurée. La collecte récurrente se règle séparément ci-dessus.",
  "backlinkMonitor.from": "Du (UTC)",
  "backlinkMonitor.to": "Au (UTC)",
  "backlinkMonitor.subdomains": "Inclure les sous-domaines",
  "backlinkMonitor.run": "Demander les décomptes quotidiens",
  "backlinkMonitor.running": "Collecte…",
  "backlinkMonitor.new": "Lancer une autre requête",
  "backlinkMonitor.refresh": "Actualiser l’historique",
  "backlinkMonitor.loading": "Chargement de l’historique enregistré…",
  "backlinkMonitor.empty": "Aucune requête enregistrée pour le moment.",
  "backlinkMonitor.error": "L’historique est indisponible. Essayez de l’actualiser.",
  "backlinkMonitor.uncertain":
    "Le résultat n’est pas confirmé. Actualisez l’historique enregistré avant de lancer une autre requête ; cela ne signifie pas que le fournisseur n’a rien facturé.",
  "backlinkMonitor.stored": "Observation enregistrée.",
  "backlinkMonitor.existing": "Cette requête existe déjà. Vérifiez son état enregistré ci-dessous.",
  "backlinkMonitor.held":
    "Requête suspendue. Vérifiez l’historique enregistré avant de lancer une autre requête.",
  "backlinkMonitor.reserved": "Réservée",
  "backlinkMonitor.dispatched": "Collecte en cours",
  "backlinkMonitor.succeeded": "Enregistrée",
  "backlinkMonitor.unknown": "Non confirmée",
  "backlinkMonitor.pending": "En attente",
  "backlinkMonitor.settled": "Régularisée",
  "backlinkMonitor.recover": "Rétablir la comptabilisation",
  "backlinkMonitor.recovered":
    "Comptabilisation rétablie à partir de l’enregistrement fournisseur conservé.",
  "backlinkMonitor.recoveryFailed":
    "La comptabilisation n’a pas pu être rétablie. L’observation enregistrée reste disponible.",
  "backlinkMonitor.date": "Date (UTC)",
  "backlinkMonitor.newLinks": "Nouveaux liens entrants",
  "backlinkMonitor.lostLinks": "Liens entrants perdus",
  "backlinkMonitor.newDomains": "Nouveaux domaines référents",
  "backlinkMonitor.lostDomains": "Domaines référents perdus",
  "backlinkMonitor.newMainDomains": "Nouveaux domaines principaux référents",
  "backlinkMonitor.lostMainDomains": "Domaines principaux référents perdus",
  "backlinkMonitor.reported": "Déclaré",
  "backlinkMonitor.partial": "Partiel",
  "backlinkMonitor.missing": "Manquant",
  "backlinkMonitor.accounting": "Comptabilisation",
  "backlinkMonitor.observed": "Observé",
  "backlinkMonitor.request": "Requête",
  "backlinkMonitor.invalid":
    "Choisissez une période valide de 1 à 92 jours, se terminant au plus tard aujourd’hui.",
  "backlinkDetails.title": "Preuves de liens entrants individuels",
  "backlinkDetails.note":
    "Liens représentatifs issus de l’index DataForSEO, jusqu’à 100 par requête. Les dates de première et dernière observation décrivent l’index ; les dates réelles de placement et de suppression sont inconnues. Il ne s’agit pas d’un inventaire complet des liens. Les requêtes consomment l’enveloppe fournisseur configurée.",
  "backlinkDetails.run": "Collecter les détails des liens",
  "backlinkDetails.selection": "Sélection des dates",
  "backlinkDetails.first_seen": "Première observation pendant la période",
  "backlinkDetails.lost_last_seen": "Signalé perdu, dernière observation pendant la période",
  "backlinkDetails.limit": "Nombre maximal de résultats",
  "backlinkDetails.counts":
    "{retained} liens affichés sur {returned} reçus ; {total} correspondances chez le fournisseur.",
  "backlinkDetails.partial":
    "D’autres résultats du fournisseur ou preuves omises existent. Chaque page est une observation distincte et l’index en direct peut changer entre les pages.",
  "backlinkDetails.noLinks": "Aucun lien conservé pour cette requête.",
  "backlinkDetails.source": "Page référente",
  "backlinkDetails.target": "Destination",
  "backlinkDetails.anchor": "Texte d’ancrage",
  "backlinkDetails.first": "Première observation (UTC)",
  "backlinkDetails.last": "Dernière observation (UTC)",
  "backlinkDetails.rank": "Rang du fournisseur",
  "backlinkDetails.spam": "Score de spam",
  "backlinkDetails.lost": "Signalé perdu",
  "backlinkDetails.offset": "Résultats à ignorer (0–20 000)",
  "backlinkDetails.page":
    "Page {page} · {count} lignes observées dans cette séquence. Les décomptes peuvent inclure des liens répétés et ne constituent pas un inventaire complet.",
  "backlinkDetails.next": "Collecter la page suivante (consomme l’enveloppe)",
  "backlinkDetails.nextNote":
    "Continuez avec le même site et les mêmes filtres. Cela effectue une nouvelle requête fournisseur et utilise l’enveloppe configurée.",
  "backlinkDetails.child":
    "La requête de page suivante existe déjà ; actualisez l’historique pour vérifier son résultat",
  "backlinkDetails.pageLimit":
    "La limite de 10 000 pages pour cette séquence est atteinte. D’autres correspondances peuvent subsister.",
  "backlinkRecurring.title": "Suivi continu des liens entrants",
  "backlinkRecurring.note":
    "Collectez chaque jour ou chaque semaine les décomptes de nouveaux liens entrants et de liens perdus pour ce site enregistré. Chaque exécution couvre des journées UTC complètes de l’index DataForSEO. Les exécutions manquées sont ignorées ; les observations ne vérifient ni les placements individuels ni un inventaire complet du Web.",
  "backlinkRecurring.loading": "Chargement des paramètres de suivi enregistrés…",
  "backlinkRecurring.error":
    "Les paramètres de suivi sont indisponibles. Rechargez pour réessayer.",
  "backlinkRecurring.enabled":
    "Suivi activé ; chaque collecte nécessite toujours des fonds disponibles chez le fournisseur.",
  "backlinkRecurring.paused": "Suivi en pause. Aucune nouvelle collecte automatique n’est activée.",
  "backlinkRecurring.spending":
    "{month} (UTC) : {used} réservés ou dépensés sur {cap} pour ce suivi.",
  "backlinkRecurring.unsettled":
    "Une requête antérieure a un résultat ou un coût non résolu. La collecte automatique suivante est suspendue. Vérifiez l’historique ; les résultats réussis enregistrés peuvent permettre de rétablir la comptabilisation. Une requête envoyée n’est pas répétée automatiquement.",
  "backlinkRecurring.capHeld":
    "Le plafond mensuel restant ne couvre pas une requête complète. La collecte attend le prochain mois UTC ou une modification enregistrée du plafond.",
  "backlinkRecurring.changedWebsite":
    "Le site a changé. Enregistrez les paramètres de suivi pour le site actuel du projet enregistré, ou rechargez le projet si le site affiché est obsolète. Les dépenses existantes sont conservées.",
  "backlinkRecurring.next":
    "Prochaine échéance (UTC) : {date}. La collecte démarre lors d’un contrôle ultérieur du planificateur, lorsque les vérifications des fonds et du compte sont satisfaites.",
  "backlinkRecurring.pause": "Mettre le suivi en pause",
  "backlinkRecurring.unavailable":
    "La collecte fournisseur est actuellement indisponible. Vous pouvez mettre le suivi en pause et consulter l’historique enregistré. L’activation nécessite un compte fournisseur confirmé actif avec un solde disponible.",
  "backlinkRecurring.settings": "Paramètres du suivi",
  "backlinkRecurring.enable": "Activer la collecte automatique",
  "backlinkRecurring.cadence": "Fréquence",
  "backlinkRecurring.daily": "Quotidienne",
  "backlinkRecurring.weekly": "Hebdomadaire",
  "backlinkRecurring.days": "Journées UTC complètes par exécution",
  "backlinkRecurring.cap": "Plafond fournisseur mensuel (USD)",
  "backlinkRecurring.save": "Enregistrer les paramètres du suivi",
  "backlinkRecurring.allowance":
    "Ce plafond limite uniquement ce suivi ; l’enregistrer n’ajoute pas de fonds au compte. Saisissez de 0 à 100 USD avec six décimales au maximum. L’activation nécessite au moins 0,024 USD plus 0,000036 USD par jour de la période. Les limites du compte et les limites fournisseur partagées s’appliquent aussi. La pause arrête les nouveaux envois ; une collecte déjà admise peut encore se terminer et entraîner le coût réservé.",
  "backlinkRecurring.invalid":
    "Saisissez de 1 à 92 jours entiers et un plafond valide en USD. Le plafond activé doit couvrir au moins une requête complète.",
  "backlinkRecurring.saved": "Paramètres du suivi enregistrés.",
  "backlinkRecurring.uncertain":
    "L’enregistrement n’est pas confirmé. Rechargez les paramètres enregistrés avant une autre modification ; la précédente a peut-être déjà été enregistrée.",
  "backlinkRecurring.refresh":
    "Recharger les paramètres enregistrés (abandonner les modifications)",
  "backlinkRecurring.history":
    "Consulter les requêtes et la comptabilisation enregistrées ci-dessous",
  "backlinkRecurring.scheduled": "Exécution programmée",
  "backlinkRecurring.manual": "Requête manuelle",
  "backlinkRecurring.occurrence": "Occurrence programmée (UTC)",
  "backlinkRecurring.undispatched":
    "Cette requête programmée n’a pas été admise auprès du fournisseur. L’enveloppe réservée pour ce suivi est libérée.",
};
