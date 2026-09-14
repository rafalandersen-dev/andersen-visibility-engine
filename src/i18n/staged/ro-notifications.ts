/** Romanian authoring only; not registered in the runtime or language picker. */
export const roNotifications: Readonly<Record<string, string>> = {
  "awareness.title": "Lucrări curente ale proiectului",
  "awareness.help":
    "Doar în aplicație. Aceste verificări nu trimit e-mailuri. Suspendările rămân vizibile până când coada se schimbă; deschiderea lor nu aprobă și nu repornește lucrările.",
  "awareness.project": "Alegeți proiectul",
  "awareness.approval": "Versiunea exactă necesită aprobare",
  "awareness.resume": "Versiunea aprobată este încă suspendată",
  "awareness.late":
    "Această dată a trecut. Verificați ciorna și alegeți o acțiune explicită de programare.",
  "awareness.paused":
    "Automatizarea este oprită intenționat. Suspendările existente ale publicării rămân separate.",
  "awareness.disabled": "Automatizarea este dezactivată.",
  "awareness.settings": "Deschideți setările de programare",
  "awareness.history":
    "Ultimul rezultat săptămânal salvat — istoric, nu o nouă verificare a capacității sau a surselor",
  "awareness.empty": "Nu există suspendări pentru aprobare pe această pagină.",
  "awareness.page": "Pagina de coadă {page} din {pages}",
  "awareness.error":
    "Înregistrările curente nu au putut fi verificate. Reîmprospătați înainte de a acționa.",
  "awareness.checked": "Verificat la {at}",
  "awareness.weekly": "Înregistrările curente ale intervalelor săptămânale",
  "awareness.earlier": "Alerte anterioare din inbox",
  "notifications.failureInspect": "Inspectați detaliile publicării",
  "notifications.failureReadError":
    "Detaliile publicării nu au putut fi verificate. Încercați din nou înainte de a decide ce faceți.",
  "notifications.failureReason.contentReview":
    "Încercarea salvată a fost blocată de verificările de conținut. Deschideți ciorna pentru a-i verifica pregătirea actuală.",
  "notifications.failureReason.destination":
    "Încercarea salvată a raportat o eroare de conexiune sau de răspuns a destinației. Verificați destinația înainte de a reîncerca.",
  "notifications.failureReason.configuration":
    "Încercarea salvată a raportat o configurare de publicare lipsă sau invalidă. Verificați Configurarea proiectului.",
  "notifications.failureReason.unknown":
    "Eroarea salvată nu a putut fi clasificată. Verificați ciorna și destinația înainte de a reîncerca.",
  "notifications.failureRecorded":
    "Înregistrare actualizată la {at}, în fusul orar al browserului dvs. Încercări înregistrate: {attempts}.",
  "notifications.failureDraftChanged":
    "Ciorna s-a schimbat după această înregistrare. Este posibil ca aceste detalii să nu mai descrie pregătirea ei actuală.",
  "notifications.failureHttp": "Răspunsul înregistrat al site-ului: HTTP {status}.",
  "notifications.failureCheck.links":
    "Rezolvați linkurile interne în panoul de siguranță a linkurilor din editor.",
  "notifications.failureCheck.sourcesReview":
    "Verificați afirmațiile față de surse sau de un autor calificat și finalizați verificarea umană.",
  "notifications.failureCheck.author":
    "Adăugați numele real al autorului și o biografie, o calificare sau un profil.",
  "notifications.failureHistoryLimit":
    "Acestea sunt informații istorice salvate în Milo. Nu verifică destinația, nu aprobă ciorna actuală și nu repornesc publicarea.",
  "notifications.failureState.absent":
    "Nu a fost găsită nicio înregistrare de coadă corespunzătoare. Reîmprospătați notificările și verificați ciorna.",
  "notifications.failureState.changed":
    "Coada nu mai marchează acest element ca eșuat. Reîmprospătați notificările; doar acest lucru nu verifică site-ul de destinație.",
  "notifications.recoveryInspect": "Inspectați lucrările salvate",
  "notifications.recoveryReadError":
    "Înregistrările salvate ale automatizării nu au putut fi verificate. Încercați din nou înainte de a decide dacă reporniți.",
  "notifications.recoveryState.absent":
    "Nu a fost găsită nicio înregistrare a rulării curente. Reîmprospătați notificările pentru a verifica dacă incidentul a fost rezolvat.",
  "notifications.recoveryState.running": "Cea mai recentă rulare este marcată ca activă.",
  "notifications.recoveryState.completed":
    "Cea mai recentă rulare s-a încheiat. Reîmprospătați notificările pentru problemele curente.",
  "notifications.recoveryState.review_required": "Rularea întreruptă necesită încă verificare.",
  "notifications.recoverySnapshot":
    "Înregistrările Milo au fost verificate la {at}, în fusul orar al browserului dvs.",
  "notifications.recoveryCounts":
    "Plan {period}: {saved} ciorne salvate. Înregistrări de coadă pentru aceste ciorne: {pending} în așteptare, {publishing} în curs, {published} înregistrate ca publicate, {failed} eșuate și {cancelled} anulate.",
  "notifications.recoveryEvidenceLimit":
    "Acestea sunt înregistrări salvate în Milo. Nu verifică ultima operațiune AI sau site-ul de destinație. Verificați destinația înainte de a reîncerca o publicare incertă. Această vedere nu repornește lucrările.",
  "notifications.recoveryMore":
    "Se afișează {shown} din {total} ciorne salvate. Deschideți calendarul pentru a inspecta restul lucrărilor.",
  "notifications.emailAddressUnverified":
    "Adresa de e-mail actuală a contului nu a fost verificată. Finalizați confirmarea e-mailului, apoi verificați din nou. Dacă adresa a fost schimbată de un administrator și nu aveți un link de confirmare, contactați asistența Milo. Notificările din aplicație rămân disponibile.",
  "notifications.emailAddressUnavailable":
    "Milo nu a putut verifica confirmarea actuală a adresei de e-mail. Încercați din nou mai târziu. Puteți în continuare să dezactivați rezumatele și să folosiți notificările din aplicație.",
  "notifications.generation_capacity_low": "Cota de pregătire poate fi insuficientă pentru plan",
  "notifications.generation_capacity_unavailable": "Cota de pregătire nu a putut fi verificată",
  "notifications.capacityLow":
    "Planul {period} mai are nevoie de {missing} ciorne pentru acest proiect și de {total} în toate programările active. Contul dvs. mai are {remaining} încercări de pregătire în {usagePeriod}. Aceasta este o capacitate comună, nu o promisiune de articole finalizate. Verificați programarea; ciornele salvate rămân disponibile pentru verificare și publicare.",
  "notifications.capacityUnavailable":
    "Milo nu a putut verifica cota comună de pregătire pentru {usagePeriod}. Planul {period} mai are nevoie aici de {missing} ciorne. Verificați din nou mai târziu. Ciornele salvate și celelalte notificări rămân disponibile.",
  "notifications.scheduler_recovery": "Automatizarea trebuie verificată înainte de recuperare",
  "notifications.recovery":
    "Pregătirea a fost oprită după o rulare întreruptă. Verificați ciornele salvate și ultima operațiune înainte de repornire. Aprobările existente pentru publicare rămân neschimbate.",
  "notifications.emailTitle": "Rezumate prin e-mail",
  "notifications.emailDescription":
    "Primiți un rezumat al alertelor noi, cel mult o dată pe oră, la adresa confirmată a contului. Fiecare incident apare o singură dată.",
  "notifications.emailDisabled":
    "Livrarea prin e-mail nu a fost încă activată. Notificările din aplicație sunt disponibile.",
  "notifications.emailEnable": "Activați rezumatele prin e-mail",
  "notifications.emailDisable": "Dezactivați rezumatele prin e-mail",
  "notifications.emailError": "Setările de e-mail sunt temporar indisponibile.",
  "notifications.emailSaveError": "Preferințele de e-mail nu au putut fi salvate.",
  "notifications.emailHistory": "Activitate recentă prin e-mail",
  "notifications.emailStatus.pending": "În așteptare",
  "notifications.emailStatus.leased": "Se verifică starea curentă",
  "notifications.emailStatus.sending": "Se trimite",
  "notifications.emailStatus.accepted": "Acceptat de furnizorul de e-mail",
  "notifications.emailStatus.unknown": "Rezultatul livrării trebuie verificat",
  "notifications.emailStatus.cancelled": "Anulat",
  "notifications.emailStatus.failed": "E-mailul nu a putut fi pregătit",
  "notifications.title": "Notificări",
  "notifications.subtitle":
    "Deciziile și problemele de publicare care urmează, verificate față de cea mai recentă stare a serverului.",
  "notifications.loading": "Se verifică planul…",
  "notifications.empty": "Nicio acțiune nu necesită atenția dvs. acum.",
  "notifications.error": "Notificările sunt temporar indisponibile.",
  "notifications.stale":
    "Cea mai recentă verificare nu s-a putut finaliza. Acestea sunt ultimele alerte confirmate.",
  "notifications.refresh": "Verificați din nou",
  "notifications.read": "Marcați ca citită",
  "notifications.unread": "Necitită",
  "notifications.saved": "Citită",
  "notifications.open": "Deschideți sarcina",
  "notifications.calendar": "Deschideți calendarul",
  "notifications.project": "Proiect",
  "notifications.approval_due": "Aprobarea va fi necesară în curând",
  "notifications.publication_failed": "Publicarea trebuie verificată",
  "notifications.manual_overdue": "Sarcina manuală este întârziată",
  "notifications.cadence_gap": "Săptămâna viitoare necesită atenție",
  "notifications.coverage": "{missing} din {total} intervale planificate nu sunt gata și în coadă.",
  "notifications.failure":
    "Verificați destinația înainte de a reîncerca: o publicare întreruptă poate fi deja publică.",
  "notifications.approval": "Verificați versiunea curentă înainte de termenul planificat.",
  "notifications.manual":
    "Finalizați această sarcină sau alegeți o dată nouă. Acest termen este pentru o sarcină manuală.",
  "notifications.readError": "Notificarea nu a putut fi marcată ca citită. Încercați din nou.",
};
