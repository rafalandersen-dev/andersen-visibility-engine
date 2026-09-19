/** Greek authoring only; not registered in the runtime or language picker. */
export const elCollaboration: Readonly<Record<string, string>> = {
  "awareness.title": "Τρέχουσα εργασία έργου",
  "awareness.help":
    "Μόνο μέσα στην εφαρμογή. Αυτοί οι έλεγχοι δεν στέλνουν email. Οι αναμονές παραμένουν ορατές μέχρι να αλλάξει η ουρά· το άνοιγμά τους δεν εγκρίνει ούτε επανεκκινεί εργασία.",
  "awareness.project": "Επιλογή έργου",
  "awareness.approval": "Η συγκεκριμένη έκδοση χρειάζεται έγκριση",
  "awareness.resume": "Η εγκεκριμένη έκδοση παραμένει σε αναμονή",
  "awareness.late":
    "Αυτή η ημερομηνία έχει περάσει. Έλεγξε το προσχέδιο και επίλεξε ρητή ενέργεια προγραμματισμού.",
  "awareness.paused":
    "Ο αυτοματισμός έχει τεθεί σκόπιμα σε παύση. Οι υφιστάμενες αναμονές δημοσίευσης παραμένουν ξεχωριστές.",
  "awareness.disabled": "Ο αυτοματισμός είναι απενεργοποιημένος.",
  "awareness.settings": "Άνοιγμα ρυθμίσεων προγράμματος",
  "awareness.history":
    "Τελευταίο αποθηκευμένο εβδομαδιαίο αποτέλεσμα — ιστορικό, όχι νέος έλεγχος διαθέσιμου ορίου ή πηγών",
  "awareness.empty": "Δεν υπάρχουν αναμονές έγκρισης σε αυτή τη σελίδα.",
  "awareness.page": "Σελίδα ουράς {page} από {pages}",
  "awareness.error": "Δεν ήταν δυνατός ο έλεγχος των τρεχουσών εγγραφών. Ανανέωσε πριν ενεργήσεις.",
  "awareness.checked": "Ελέγχθηκε: {at}",
  "awareness.weekly": "Τρέχουσες εγγραφές εβδομαδιαίων θέσεων",
  "awareness.earlier": "Παλαιότερες ειδοποιήσεις εισερχομένων",
  "notifications.failureInspect": "Εξέταση στοιχείων δημοσίευσης",
  "notifications.failureReadError":
    "Δεν ήταν δυνατός ο έλεγχος των στοιχείων δημοσίευσης. Δοκίμασε ξανά πριν αποφασίσεις τι να κάνεις.",
  "notifications.failureReason.contentReview":
    "Η αποθηκευμένη προσπάθεια αποκλείστηκε από ελέγχους περιεχομένου. Άνοιξε το προσχέδιο για να ελέγξεις την τρέχουσα ετοιμότητά του.",
  "notifications.failureReason.destination":
    "Η αποθηκευμένη προσπάθεια ανέφερε σφάλμα σύνδεσης ή απόκρισης προορισμού. Έλεγξε τον προορισμό πριν δοκιμάσεις ξανά.",
  "notifications.failureReason.configuration":
    "Η αποθηκευμένη προσπάθεια ανέφερε ελλιπή ή μη έγκυρη ρύθμιση δημοσίευσης. Έλεγξε τη Ρύθμιση έργου.",
  "notifications.failureReason.unknown":
    "Δεν ήταν δυνατή η ταξινόμηση του αποθηκευμένου σφάλματος. Έλεγξε το προσχέδιο και τον προορισμό πριν δοκιμάσεις ξανά.",
  "notifications.failureRecorded":
    "Η εγγραφή ενημερώθηκε: {at}, στη ζώνη ώρας του προγράμματος περιήγησής σου. Καταγεγραμμένες προσπάθειες: {attempts}.",
  "notifications.failureDraftChanged":
    "Το προσχέδιο άλλαξε μετά από αυτή την εγγραφή. Αυτά τα στοιχεία ενδέχεται να μην περιγράφουν πλέον την τρέχουσα ετοιμότητά του.",
  "notifications.failureHttp": "Καταγεγραμμένη απόκριση ιστοτόπου: HTTP {status}.",
  "notifications.failureCheck.links":
    "Επίλυσε τους εσωτερικούς συνδέσμους στον πίνακα ασφάλειας συνδέσμων του επεξεργαστή.",
  "notifications.failureCheck.sourcesReview":
    "Επαλήθευσε τους ισχυρισμούς με πηγές ή κατάλληλα καταρτισμένο συντάκτη και ολοκλήρωσε τον ανθρώπινο έλεγχο.",
  "notifications.failureCheck.author":
    "Πρόσθεσε το όνομα του πραγματικού συντάκτη και βιογραφικό, προσόν ή προφίλ.",
  "notifications.failureHistoryLimit":
    "Αυτές είναι ιστορικές πληροφορίες αποθηκευμένες στο Milo. Δεν ελέγχουν τον προορισμό, δεν εγκρίνουν το τρέχον προσχέδιο και δεν επανεκκινούν τη δημοσίευση.",
  "notifications.failureState.absent":
    "Δεν βρέθηκε αντίστοιχη εγγραφή ουράς. Ανανέωσε τις ειδοποιήσεις και έλεγξε το προσχέδιο.",
  "notifications.failureState.changed":
    "Η ουρά δεν επισημαίνει πλέον αυτό το στοιχείο ως αποτυχημένο. Ανανέωσε τις ειδοποιήσεις· αυτό από μόνο του δεν επαληθεύει τον ιστότοπο προορισμού.",
  "notifications.recoveryInspect": "Εξέταση αποθηκευμένης εργασίας",
  "notifications.recoveryReadError":
    "Δεν ήταν δυνατός ο έλεγχος των αποθηκευμένων εγγραφών αυτοματισμού. Δοκίμασε ξανά πριν αποφασίσεις αν θα επανεκκινήσεις.",
  "notifications.recoveryState.absent":
    "Δεν βρέθηκε τρέχουσα εγγραφή εκτέλεσης. Ανανέωσε τις ειδοποιήσεις για να ελέγξεις αν επιλύθηκε αυτό το περιστατικό.",
  "notifications.recoveryState.running": "Η τελευταία εκτέλεση επισημαίνεται ως ενεργή.",
  "notifications.recoveryState.completed":
    "Η τελευταία εκτέλεση ολοκληρώθηκε. Ανανέωσε τις ειδοποιήσεις για τα τρέχοντα ζητήματα.",
  "notifications.recoveryState.review_required":
    "Η εκτέλεση που διακόπηκε εξακολουθεί να χρειάζεται έλεγχο.",
  "notifications.recoverySnapshot":
    "Οι εγγραφές Milo ελέγχθηκαν: {at}, στη ζώνη ώρας του προγράμματος περιήγησής σου.",
  "notifications.recoveryCounts":
    "Πλάνο {period}: {saved} αποθηκευμένα προσχέδια. Εγγραφές ουράς για αυτά τα προσχέδια: {pending} σε αναμονή, {publishing} σε εξέλιξη, {published} καταγεγραμμένες ως δημοσιευμένες, {failed} αποτυχημένες και {cancelled} ακυρωμένες.",
  "notifications.recoveryEvidenceLimit":
    "Αυτές είναι εγγραφές αποθηκευμένες στο Milo. Δεν επαληθεύουν την τελευταία λειτουργία AI ή τον ιστότοπο προορισμού. Έλεγξε τον προορισμό πριν επαναλάβεις δημοσίευση με αβέβαιο αποτέλεσμα. Αυτή η προβολή δεν επανεκκινεί εργασία.",
  "notifications.recoveryMore":
    "Εμφανίζονται {shown} από {total} αποθηκευμένα προσχέδια. Άνοιξε το ημερολόγιο για να εξετάσεις την υπόλοιπη εργασία.",
  "notifications.emailAddressUnverified":
    "Το τρέχον email του λογαριασμού σου δεν έχει επαληθευτεί. Ολοκλήρωσε την επιβεβαίωση email και έλεγξε ξανά. Αν η διεύθυνση άλλαξε από διαχειριστή και δεν έχεις σύνδεσμο επιβεβαίωσης, επικοινώνησε με την υποστήριξη Milo. Οι ειδοποιήσεις μέσα στην εφαρμογή παραμένουν διαθέσιμες.",
  "notifications.emailAddressUnavailable":
    "Το Milo δεν μπόρεσε να ελέγξει την τρέχουσα επαλήθευση του email σου. Δοκίμασε ξανά αργότερα. Μπορείς ακόμη να απενεργοποιήσεις τις συνόψεις και να χρησιμοποιείς ειδοποιήσεις μέσα στην εφαρμογή.",
  "notifications.generation_capacity_low":
    "Το όριο προετοιμασίας ενδέχεται να μην καλύπτει το πλάνο",
  "notifications.generation_capacity_unavailable":
    "Δεν ήταν δυνατός ο έλεγχος του ορίου προετοιμασίας",
  "notifications.capacityLow":
    "Το πλάνο {period} χρειάζεται ακόμη {missing} προσχέδια για αυτό το έργο και {total} σε όλα τα ενεργά προγράμματά σου. Ο λογαριασμός σου έχει ακόμη {remaining} προσπάθειες προετοιμασίας στην περίοδο {usagePeriod}. Αυτό είναι κοινόχρηστο όριο, όχι υπόσχεση ολοκληρωμένων άρθρων. Έλεγξε το πρόγραμμα· τα αποθηκευμένα προσχέδια παραμένουν διαθέσιμα για έλεγχο και δημοσίευση.",
  "notifications.capacityUnavailable":
    "Το Milo δεν μπόρεσε να επαληθεύσει το κοινόχρηστο όριο προετοιμασίας για την περίοδο {usagePeriod}. Το πλάνο {period} χρειάζεται ακόμη {missing} προσχέδια εδώ. Έλεγξε ξανά αργότερα. Τα αποθηκευμένα προσχέδια και οι άλλες ειδοποιήσεις παραμένουν διαθέσιμα.",
  "notifications.scheduler_recovery": "Ο αυτοματισμός χρειάζεται έλεγχο ανάκτησης",
  "notifications.recovery":
    "Η προετοιμασία τέθηκε σε παύση μετά από διακοπή εκτέλεσης. Έλεγξε τα αποθηκευμένα προσχέδια και την τελευταία λειτουργία πριν επανεκκινήσεις. Οι υφιστάμενες εγκρίσεις δημοσίευσης παραμένουν αμετάβλητες.",
  "notifications.emailTitle": "Συνόψεις email",
  "notifications.emailDescription":
    "Λάβε μία σύνοψη νέων ειδοποιήσεων, το πολύ μία φορά την ώρα, στην επιβεβαιωμένη διεύθυνση του λογαριασμού σου. Κάθε περιστατικό εμφανίζεται μία φορά.",
  "notifications.emailDisabled":
    "Η παράδοση email δεν έχει ενεργοποιηθεί ακόμη. Οι ειδοποιήσεις μέσα στην εφαρμογή είναι διαθέσιμες.",
  "notifications.emailEnable": "Ενεργοποίηση συνόψεων email",
  "notifications.emailDisable": "Απενεργοποίηση συνόψεων email",
  "notifications.emailError": "Οι ρυθμίσεις email δεν είναι προσωρινά διαθέσιμες.",
  "notifications.emailSaveError": "Δεν ήταν δυνατή η αποθήκευση προτιμήσεων email.",
  "notifications.emailHistory": "Πρόσφατη δραστηριότητα email",
  "notifications.emailStatus.pending": "Σε αναμονή",
  "notifications.emailStatus.leased": "Έλεγχος τρέχουσας κατάστασης",
  "notifications.emailStatus.sending": "Αποστολή",
  "notifications.emailStatus.accepted": "Έγινε αποδεκτό από τον πάροχο email",
  "notifications.emailStatus.unknown": "Το αποτέλεσμα παράδοσης χρειάζεται επαλήθευση",
  "notifications.emailStatus.cancelled": "Ακυρώθηκε",
  "notifications.emailStatus.failed": "Δεν ήταν δυνατή η προετοιμασία email",
  "notifications.title": "Ειδοποιήσεις",
  "notifications.subtitle":
    "Οι επερχόμενες αποφάσεις και τα ζητήματα δημοσίευσής σου, ελεγμένα με βάση την πιο πρόσφατη κατάσταση του διακομιστή.",
  "notifications.loading": "Έλεγχος του πλάνου σου…",
  "notifications.empty": "Καμία ενέργεια δεν χρειάζεται την προσοχή σου αυτή τη στιγμή.",
  "notifications.error": "Οι ειδοποιήσεις δεν είναι προσωρινά διαθέσιμες.",
  "notifications.stale":
    "Ο τελευταίος έλεγχος δεν μπόρεσε να ολοκληρωθεί. Αυτές είναι οι τελευταίες επιβεβαιωμένες ειδοποιήσεις.",
  "notifications.refresh": "Νέος έλεγχος",
  "notifications.read": "Σήμανση ως αναγνωσμένη",
  "notifications.unread": "Μη αναγνωσμένη",
  "notifications.saved": "Αναγνωσμένη",
  "notifications.open": "Άνοιγμα εργασίας",
  "notifications.calendar": "Άνοιγμα ημερολογίου",
  "notifications.project": "Έργο",
  "notifications.approval_due": "Πλησιάζει η προθεσμία έγκρισης",
  "notifications.publication_failed": "Η δημοσίευση χρειάζεται έλεγχο",
  "notifications.manual_overdue": "Η χειροκίνητη εργασία έχει καθυστερήσει",
  "notifications.cadence_gap": "Η επόμενη εβδομάδα χρειάζεται προσοχή",
  "notifications.coverage":
    "{missing} από {total} προγραμματισμένες θέσεις δεν είναι έτοιμες και στην ουρά.",
  "notifications.failure":
    "Έλεγξε τον προορισμό πριν δοκιμάσεις ξανά: μια δημοσίευση που διακόπηκε ενδέχεται να είναι ήδη δημόσια.",
  "notifications.approval":
    "Έλεγξε την τρέχουσα έκδοση πριν από την προγραμματισμένη προθεσμία της.",
  "notifications.manual":
    "Ολοκλήρωσε αυτή την εργασία ή επίλεξε νέα ημερομηνία. Αυτή η προθεσμία αφορά χειροκίνητη εργασία.",
  "notifications.readError":
    "Δεν ήταν δυνατή η σήμανση αυτής της ειδοποίησης ως αναγνωσμένης. Δοκίμασε ξανά.",
  "team.title": "Η ομάδα του Milo",
  "team.help":
    "Ένας χώρος εργασίας, με εξειδικευμένες προβολές πραγματικής εργασίας και γνώσης έργου.",
  "team.selectProject": "Επίλεξε έργο για να δεις την ομάδα του.",
  "team.scope":
    "Η κατάσταση εργασιών καλύπτει την επιλεγμένη εβδομάδα. Οι αποθηκευμένες συμβουλές και αναφορές είναι χρονολογημένα τεκμήρια, όχι απόδειξη ενεργής εργασίας ή βελτιωμένων αποτελεσμάτων.",
  "team.aiRole": "Ειδικός AI",
  "team.records": "{count} αποθηκευμένες εγγραφές γνώσης · κατάσταση ελέγχου στη γνώση έργου",
  "team.lastDelivery": "Τελευταία παράδοση στις εργασίες αυτής της εβδομάδας",
  "team.auditFetched": "Αποθηκευμένος έλεγχος ιστοτόπου",
  "team.auditPartial": "Αποθηκευμένος έλεγχος μόνο με το πλαίσιο έργου",
  "team.adviceSaved": "Αποθηκευμένες συμβουλές ετοιμότητας για AI",
  "team.imports": "{count} αποθηκευμένες εισαγωγές μετρήσεων GSC",
  "team.measurementMissing": "Δεν υπάρχουν αποθηκευμένες μετρήσεις GSC",
  "team.authorityPrerequisite":
    "Τα δεδομένα παρόχου και η εξουσιοδότηση προσέγγισης πρέπει να ελεγχθούν στον χώρο εργασίας εισερχόμενων συνδέσμων.",
  "team.lesson.title": "Απομνημόνευση συντακτικού διδάγματος",
  "team.lesson.help":
    "Γράψε μια επαναλαμβανόμενη προτίμηση για αυτό το έργο. Η αποθήκευση την καθιστά ρητή οδηγία έργου για σχετική μελλοντική εργασία. Οι συνηθισμένες αλλαγές άρθρων δεν δημιουργούν διδάγματα. Αυτό δεν τεκμηριώνει πραγματικά γεγονότα.",
  "team.lesson.rule": "Οδηγία για αυτό το έργο",
  "team.lesson.target": "Εφαρμογή σε",
  "team.lesson.text": "Σύνταξη",
  "team.lesson.visual": "Οπτικό υλικό",
  "team.lesson.both": "Σύνταξη και οπτικό υλικό",
  "team.lesson.save": "Αποθήκευση οδηγίας έργου",
  "team.lesson.manage": "Έλεγχος, επεξεργασία ή διαγραφή γνώσης",
  "team.lesson.saved":
    "Αποθηκεύτηκε σε αυτό το έργο. Μπορείς να την επεξεργαστείς, να την επαναφέρεις ή να την ανακαλέσεις στη γνώση έργου.",
  "team.lesson.unknown":
    "Δεν ήταν δυνατή η επιβεβαίωση αποθήκευσης. Έλεγξε τη γνώση έργου πριν καταχωρίσεις ξανά την οδηγία.",
  "team.role.lead": "Milo — Υπεύθυνος ανάπτυξης",
  "team.description.lead": "Συντονίζει το αποθηκευμένο πρόγραμμα, την κάλυψη και τις αποφάσεις.",
  "team.open.lead": "Έλεγχος εβδομαδιαίας προετοιμασίας",
  "team.role.brand": "Σύμβουλος στρατηγικής επωνυμίας",
  "team.description.brand":
    "Στοιχεία έργου, προτιμήσεις και αναστρέψιμα διδάγματα, με πηγή και ιστορικό ελέγχου.",
  "team.open.brand": "Έλεγχος γνώσης έργου",
  "team.role.research": "Ερευνητής αναζήτησης",
  "team.description.research":
    "Εβδομαδιαίες οδηγίες έρευνας και αποθηκευμένες ευκαιρίες. Έλεγξε πηγές και υποθέσεις πριν γράψεις.",
  "team.open.research": "Έλεγχος ευκαιριών",
  "team.role.content": "Επιμελητής περιεχομένου",
  "team.description.content":
    "Τα διατηρημένα άρθρα εξακολουθούν να χρειάζονται συντακτικό έλεγχο και έγκριση δημοσίευσης της συγκεκριμένης έκδοσης.",
  "team.open.content": "Έλεγχος άρθρων",
  "team.role.image": "Δημιουργός οπτικού υλικού",
  "team.description.image":
    "Το προτεινόμενο οπτικό υλικό χρησιμοποιεί το πλαίσιο έργου. Η διατήρηση δεν σημαίνει έγκριση του οπτικού υλικού.",
  "team.open.image": "Έλεγχος οπτικού υλικού άρθρου",
  "team.role.seo": "Ειδικός SEO",
  "team.description.seo":
    "Χρονολογημένα ευρήματα ελέγχου σελίδας, εσωτερικών συνδέσμων και τοπικής παρουσίας/οντοτήτων. Οι μερικοί έλεγχοι διατηρούν τους περιορισμούς τους.",
  "team.open.seo": "Έλεγχος ευρημάτων SEO",
  "team.role.authority": "Εισερχόμενοι σύνδεσμοι και κύρος",
  "team.description.authority":
    "Η έρευνα, η παρακολούθηση και οι προτάσεις εξαρτώνται από επαληθευμένη πρόσβαση παρόχου. Η αποστολή μηνυμάτων και η αγορά τοποθετήσεων απαιτούν ξεχωριστή εξουσιοδότηση.",
  "team.open.authority": "Έλεγχος χώρου εργασίας εισερχόμενων συνδέσμων",
  "team.role.ai": "Αναλυτής προβολής στην AI",
  "team.description.ai":
    "Οι συμβουλές ετοιμότητας είναι ξεχωριστές από παρατηρημένες απαντήσεις, μνείες και παραπομπές σε πηγές. Εδώ δεν τεκμηριώνεται παρακολούθηση πραγματικών παρατηρήσεων.",
  "team.open.ai": "Έλεγχος συμβουλών ετοιμότητας",
  "team.role.performance": "Αναλυτής απόδοσης",
  "team.description.performance":
    "Αποθηκευμένες αναφορές και χρονολογημένες μετρήσεις. Τα δεδομένα που λείπουν είναι άγνωστα· μια αλλαγή πριν/μετά από μόνη της δεν αποδεικνύει αιτιώδη σχέση.",
  "team.open.performance": "Έλεγχος μετρήσεων",
  "team.state.unavailable": "Μη διαθέσιμη κατάσταση",
  "team.state.none": "Δεν υπάρχει καταγεγραμμένη εργασία",
  "team.state.unknown": "Αβέβαιο αποτέλεσμα — έλεγχος ανάκτησης",
  "team.state.running": "Η εργασία εκτελείται",
  "team.state.review": "Οι αλλαγές του ιδιοκτήτη χρειάζονται έλεγχο",
  "team.state.retained": "Τα αποτελέσματα διατηρήθηκαν για έλεγχο",
  "team.state.cancelled": "Η προετοιμασία ακυρώθηκε",
  "collaboration.reviewImageLimits":
    "Αυτές οι εικόνες υπερβαίνουν τα όρια ελέγχου ή δεν μπορούν να εμφανιστούν με ασφάλεια. Μείωσε τον αριθμό ή το μέγεθός τους και χρησιμοποίησε στατικές εικόνες PNG, JPEG ή WebP.",
  "collaboration.emailInvitation": "Αποστολή πρόσκλησης με email",
  "collaboration.invitationEmailHelp":
    "Στείλε πρόσκληση στη διεύθυνση email που εμφανίζεται παραπάνω για τον εμφανιζόμενο ρόλο. Το άνοιγμα του συνδέσμου email δεν παραχωρεί πρόσβαση.",
  "collaboration.invitationEmailQueued":
    "Ζητήθηκε email πρόσκλησης. Έλεγξε εδώ την κατάσταση παράδοσής του.",
  "collaboration.notificationHistory": "Ιστορικό παράδοσης ειδοποιήσεων",
  "collaboration.notificationSettings": "Ειδοποιήσεις έργου",
  "collaboration.notificationConsentHelp":
    "Απαιτούνται τόσο ανάθεση από τον ιδιοκτήτη όσο και δική σου συγκατάθεση. Οι αλλαγές στον ρόλο σου στο έργο απαιτούν ανανέωση των ρυθμίσεων.",
  "collaboration.notificationAssigned": "Ανατέθηκε από τον ιδιοκτήτη",
  "collaboration.notificationNotAssigned": "Δεν ανατέθηκε από τον ιδιοκτήτη",
  "collaboration.notificationOptedIn": "Ο παραλήπτης έχει συναινέσει",
  "collaboration.notificationOptedOut": "Ο παραλήπτης δεν έχει συναινέσει",
  "collaboration.notificationAssign": "Ανάθεση ειδοποιήσεων",
  "collaboration.notificationUnassign": "Αφαίρεση ανάθεσης",
  "collaboration.notificationOptIn": "Αποδοχή ειδοποιήσεων έργου",
  "collaboration.notificationOptOut": "Απενεργοποίηση ειδοποιήσεων έργου",
  "collaboration.decisionRecorded": "Η απόφαση ελέγχου καταγράφηκε.",
  "collaboration.decisionUnknown":
    "Δεν ήταν δυνατή η επιβεβαίωση της απόφασης. Ανανέωσε τις προηγούμενες αποφάσεις πριν δοκιμάσεις ξανά.",
  "collaboration.reviewNotAllowed":
    "Ο τρέχων ρόλος σου ή η πολιτική έργου δεν επιτρέπει αποφάσεις ελέγχου.",
  "collaboration.acknowledgeReview":
    "Εξέτασα αυτό το προσχέδιο όπως εμφανίζεται και όλες τις εικόνες του.",
  "collaboration.approveVersion": "Έγκριση αυτής της έκδοσης",
  "collaboration.returnForChanges": "Επιστροφή για αλλαγές",
  "collaboration.reviewDoesNotPublish":
    "Η καταγραφή ελέγχου δεν δημοσιεύει το προσχέδιο ούτε συνεχίζει πρόγραμμα σε αναμονή.",
  "collaboration.reviewHistory": "Προηγούμενες αποφάσεις ελέγχου",
  "collaboration.approvalRecorded": "Η έγκριση καταγράφηκε",
  "collaboration.changesRequested": "Ζητήθηκαν αλλαγές",
  "collaboration.owner": "Ιδιοκτήτης",
  "collaboration.collaborator": "Συνεργάτης",
  "collaboration.renderedReview": "Έλεγχος τελικής εμφάνισης",
  "collaboration.loadingReview": "Φόρτωση ολόκληρου του υλικού ελέγχου και των εικόνων του…",
  "collaboration.incompleteReview":
    "Δεν ήταν δυνατή η φόρτωση ολόκληρου του υλικού ελέγχου. Ανανέωσε για να ελέγξεις το προσχέδιο και όλες τις εικόνες του.",
  "collaboration.policyTitle": "Πολιτική έγκρισης",
  "collaboration.policyHelp":
    "Επίλεξε ποιος μπορεί να εγκρίνει εργασία έργου. Η αλλαγή αυτής της πολιτικής ανακαλεί υφιστάμενες εγκρίσεις συνεργατών· οι ανεξάρτητες εγκρίσεις ιδιοκτήτη παραμένουν.",
  "collaboration.policyUnselected": "Δεν έχει επιλεγεί — η έγκριση συνεργατών είναι ανενεργή",
  "collaboration.policy.disabled": "Μόνο εγκρίσεις ιδιοκτήτη",
  "collaboration.policy.separate_reviewers":
    "Ξεχωριστοί Ελεγκτές εγκρίνουν· οι Συντάκτες επεξεργάζονται",
  "collaboration.policy.editors_can_approve": "Οι Συντάκτες και οι Ελεγκτές μπορούν να εγκρίνουν",
  "collaboration.savePolicy": "Αποθήκευση πολιτικής έγκρισης",
  "collaboration.editDraft": "Επεξεργασία προσχεδίου",
  "collaboration.editHelp":
    "Η αποθήκευση επιστρέφει αυτό το προσχέδιο σε έλεγχο και ανακαλεί την προηγούμενη έγκριση δημοσίευσής του.",
  "collaboration.editConflict":
    "Το αποθηκευμένο προσχέδιο ή ο ρόλος σου άλλαξε. Αντέγραψε όσες αλλαγές θέλεις να κρατήσεις πριν φορτώσεις την πιο πρόσφατη αποθηκευμένη έκδοση.",
  "collaboration.loadLatest": "Φόρτωση πιο πρόσφατης αποθηκευμένης έκδοσης",
  "collaboration.draftSaved": "Το προσχέδιο αποθηκεύτηκε για έλεγχο.",
  "collaboration.editError":
    "Δεν ήταν δυνατή η αποθήκευση του προσχεδίου. Οι αλλαγές σου παραμένουν εδώ· έλεγξε την τρέχουσα έκδοση και την πρόσβασή σου πριν δοκιμάσεις ξανά.",
  "collaboration.saveDraft": "Αποθήκευση για έλεγχο",
  "collaboration.question": "Ερώτηση",
  "collaboration.answer": "Απάντηση",
  "collaboration.removeQuestion": "Αφαίρεση ερώτησης",
  "collaboration.addQuestion": "Προσθήκη ερώτησης",
  "collaboration.field.title": "Τίτλος",
  "collaboration.field.h1": "Κύρια επικεφαλίδα",
  "collaboration.field.metaTitle": "Τίτλος αναζήτησης",
  "collaboration.field.metaDescription": "Περιγραφή αναζήτησης",
  "collaboration.field.markdown": "Άρθρο (Markdown)",
  "collaboration.field.cta": "Παρότρυνση για ενέργεια",
  "collaboration.field.outline": "Περίγραμμα — μία επικεφαλίδα ανά γραμμή",
  "collaboration.field.faq": "Ερωτήσεις και απαντήσεις",
  "collaboration.comments": "Σχόλια",
  "collaboration.commentLabel": "Το σχόλιό σου",
  "collaboration.addComment": "Προσθήκη σχολίου",
  "collaboration.you": "Εσύ",
  "collaboration.commentRoleAtPosting": "Ρόλος κατά την ανάρτηση",
  "collaboration.earlierVersion": "Σχόλιο σε παλαιότερη αποθηκευμένη έκδοση.",
  "collaboration.title": "Συνεργάτες έργου",
  "collaboration.subtitle":
    "Διαχειρίσου την πρόσβαση στο έργο και άνοιξε εργασία που έχει κοινοποιηθεί σε εσένα.",
  "collaboration.owned": "Διαχείριση του έργου σου",
  "collaboration.shared": "Κοινοποιημένα σε εσένα",
  "collaboration.invitations": "Οι προσκλήσεις σου",
  "collaboration.members": "Άτομα με πρόσβαση",
  "collaboration.pending": "Προσκλήσεις έργου",
  "collaboration.email": "Διεύθυνση email",
  "collaboration.role": "Ρόλος",
  "collaboration.viewer": "Θεατής",
  "collaboration.editor": "Συντάκτης",
  "collaboration.reviewer": "Ελεγκτής",
  "collaboration.invite": "Δημιουργία πρόσκλησης",
  "collaboration.inviteHelp":
    "Η πρόσκληση εμφανίζεται εδώ όταν ο παραλήπτης συνδεθεί με αυτό το επαληθευμένο email. Λήγει μετά από επτά ημέρες. Αυτή η ενέργεια δεν στέλνει email.",
  "collaboration.accept": "Αποδοχή πρόσκλησης",
  "collaboration.revoke": "Ανάκληση πρόσκλησης",
  "collaboration.remove": "Αφαίρεση πρόσβασης",
  "collaboration.saveRole": "Αποθήκευση ρόλου",
  "collaboration.refresh": "Ανανέωση",
  "collaboration.open": "Άνοιγμα έργου",
  "collaboration.loading": "Φόρτωση πρόσβασης έργου…",
  "collaboration.error": "Δεν ήταν δυνατή η επιβεβαίωση πρόσβασης. Ανανέωσε πριν δοκιμάσεις ξανά.",
  "collaboration.saved": "Η πρόσβαση στο έργο ενημερώθηκε.",
  "collaboration.empty": "Δεν υπάρχει ακόμη κάτι για εμφάνιση.",
  "collaboration.noOwned":
    "Μπορείς να ανοίξεις τα κοινοποιημένα έργα παρακάτω χωρίς να δημιουργήσεις δικό σου έργο.",
  "collaboration.drafts": "Προσχέδια έργου",
  "collaboration.back": "Επιστροφή στα προσχέδια",
  "collaboration.previous": "Προηγούμενο",
  "collaboration.next": "Επόμενο",
  "collaboration.removed": "Αφαιρέθηκε",
  "collaboration.expires": "Λήγει",
  "collaboration.history": "Πρόσφατη δραστηριότητα πρόσβασης",
  "collaboration.pendingState": "Σε αναμονή",
  "collaboration.expired": "Έληξε",
  "collaboration.accepted": "Έγινε αποδεκτή",
  "collaboration.revoked": "Ανακλήθηκε",
  "emailSettings.language": "Γλώσσα email",
  "emailSettings.note":
    "Επίλεξε τη γλώσσα για τις λειτουργικές συνόψεις, τις μηνιαίες αναφορές και τις προσκλήσεις έργου που ζητάς. Αυτό δεν αλλάζει τις ρυθμίσεις εφαρμογής, άρθρων ή αγοράς σου. Η αποθήκευση γλώσσας δεν ενεργοποιεί ούτε στέλνει email.",
  "emailSettings.save": "Αποθήκευση γλώσσας email",
  "emailSettings.saved": "Οι ρυθμίσεις email αποθηκεύτηκαν.",
  "emailSettings.uncertain":
    "Δεν ήταν δυνατή η επιβεβαίωση των αποθηκευμένων ρυθμίσεων. Φόρτωσέ τες ξανά πριν από άλλη αλλαγή· η τελευταία αλλαγή σου μπορεί να έχει ήδη αποθηκευτεί.",
  "emailSettings.reload": "Επαναφόρτωση αποθηκευμένων ρυθμίσεων (απόρριψη αλλαγών)",
  "collaboration.seats":
    "Το πρόγραμμά σας {plan} περιλαμβάνει {workingSeats} θέσεις εργασίας (συντάκτες και ελεγκτές, μαζί με εσάς) και {viewerSeats} θέσεις προβολής. Σε χρήση: {usedWorkingSeats} εργασίας, {usedViewerSeats} προβολής. Οι εκκρεμείς προσκλήσεις δεσμεύουν θέσεις μέχρι να λήξουν.",
  "collaboration.seatLimit":
    "Δεν υπάρχει ελεύθερη θέση για αυτόν τον ρόλο. Το πρόγραμμά σας περιλαμβάνει {workingSeats} θέσεις εργασίας και {viewerSeats} θέσεις προβολής. Αφαιρέστε ή ανακαλέστε κάποιον, ή αναβαθμίστε το πρόγραμμα.",
};
