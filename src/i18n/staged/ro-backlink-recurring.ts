/** Romanian authoring only; not registered in the runtime or language picker.
 * USD amounts keep dot decimals to match the source and entry format. */
export const roBacklinkRecurring: Readonly<Record<string, string>> = {
  "backlinkRecurring.title": "Monitorizare continuă a backlinkurilor",
  "backlinkRecurring.note":
    "Colectați zilnic sau săptămânal numărul de backlinkuri noi și pierdute pentru acest site salvat. Fiecare rulare acoperă zile UTC complete din indexul DataForSEO. Rulările ratate sunt omise; observațiile nu verifică plasările individuale sau un inventar complet al webului.",
  "backlinkRecurring.loading": "Se încarcă setările de monitorizare salvate…",
  "backlinkRecurring.error":
    "Setările de monitorizare nu sunt disponibile. Reîncărcați pentru a încerca din nou.",
  "backlinkRecurring.enabled":
    "Monitorizare activată — fiecare colectare necesită în continuare fonduri disponibile la furnizor.",
  "backlinkRecurring.paused":
    "Monitorizare întreruptă. Nu este activată nicio colectare automată nouă.",
  "backlinkRecurring.spending":
    "{month} (UTC): {used} rezervat sau cheltuit din {cap} pentru acest monitor.",
  "backlinkRecurring.unsettled":
    "O solicitare anterioară are un rezultat sau un cost nerezolvat. Colectarea automată ulterioară este suspendată. Verificați istoricul; rezultatele reușite salvate pot permite recuperarea evidenței costurilor. O solicitare trimisă nu este repetată automat.",
  "backlinkRecurring.capHeld":
    "Plafonul lunar rămas este sub o solicitare completă. Colectarea așteaptă următoarea lună UTC sau o modificare salvată a plafonului.",
  "backlinkRecurring.changedWebsite":
    "Site-ul s-a schimbat. Salvați setările de monitorizare pentru site-ul actual al proiectului salvat sau reîncărcați proiectul dacă site-ul afișat este învechit. Cheltuielile existente sunt păstrate.",
  "backlinkRecurring.next":
    "Următorul termen (UTC): {date}. Colectarea începe la o verificare ulterioară a planificatorului, când trec verificările de finanțare și de cont.",
  "backlinkRecurring.pause": "Întrerupeți monitorizarea",
  "backlinkRecurring.unavailable":
    "Colectarea de la furnizor nu este disponibilă momentan. Puteți întrerupe monitorizarea și vedea istoricul salvat. Activarea necesită un cont de furnizor activ confirmat, cu sold disponibil.",
  "backlinkRecurring.settings": "Setările monitorului",
  "backlinkRecurring.enable": "Activați colectarea automată",
  "backlinkRecurring.cadence": "Frecvență",
  "backlinkRecurring.daily": "Zilnic",
  "backlinkRecurring.weekly": "Săptămânal",
  "backlinkRecurring.days": "Zile UTC complete per rulare",
  "backlinkRecurring.cap": "Plafon lunar la furnizor (USD)",
  "backlinkRecurring.save": "Salvați setările de monitorizare",
  "backlinkRecurring.allowance":
    "Acest plafon limitează doar acest monitor; salvarea lui nu adaugă fonduri în cont. Introduceți 0–100 USD cu cel mult șase zecimale. Activarea necesită cel puțin 0.024 USD plus 0.000036 USD pe zi din interval. Se aplică și limitele contului și cele comune ale furnizorului. Întreruperea oprește trimiterile noi; o colectare deja admisă se poate încă finaliza și poate genera costul rezervat.",
  "backlinkRecurring.invalid":
    "Introduceți 1–92 de zile întregi și un plafon USD valid. Plafonul activat trebuie să acopere cel puțin o solicitare completă.",
  "backlinkRecurring.saved": "Setările de monitorizare au fost salvate.",
  "backlinkRecurring.uncertain":
    "Salvarea nu este confirmată. Reîncărcați setările salvate înainte de o altă modificare; este posibil ca modificarea anterioară să fi fost deja salvată.",
  "backlinkRecurring.refresh": "Reîncărcați setările salvate (renunțați la modificări)",
  "backlinkRecurring.history": "Vedeți mai jos solicitările salvate și evidența costurilor",
  "backlinkRecurring.scheduled": "Rulare programată",
  "backlinkRecurring.manual": "Solicitare manuală",
  "backlinkRecurring.occurrence": "Apariție programată (UTC)",
  "backlinkRecurring.undispatched":
    "Această solicitare programată nu a fost admisă la furnizor. Cota monitorului pentru ea este eliberată.",
};
