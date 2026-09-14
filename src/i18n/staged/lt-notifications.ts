/** Lithuanian authoring only; not registered in the runtime or language picker.
 * Covers `awareness.*` and `notifications.*` from `notifications.ts`. */
export const ltNotifications: Readonly<Record<string, string>> = {
  "awareness.title": "Dabartinis projekto darbas",
  "awareness.help":
    "Tik programoje. Šios patikros nesiunčia el. laiškų. Sulaikymai lieka matomi, kol pasikeičia eilė; juos atidarius darbas nepatvirtinamas ir nepaleidžiamas iš naujo.",
  "awareness.project": "Pasirinkite projektą",
  "awareness.approval": "Konkrečiai versijai reikia patvirtinimo",
  "awareness.resume": "Patvirtinta versija vis dar sulaikyta",
  "awareness.late":
    "Ši data praėjo. Peržiūrėkite juodraštį ir pasirinkite aiškų planavimo veiksmą.",
  "awareness.paused":
    "Automatizavimas sąmoningai pristabdytas. Esami paskelbimo sulaikymai lieka atskiri.",
  "awareness.disabled": "Automatizavimas išjungtas.",
  "awareness.settings": "Atidaryti grafiko nustatymus",
  "awareness.history":
    "Paskutinis išsaugotas savaitės rezultatas — istorinis, o ne nauja pajėgumo ar šaltinių patikra",
  "awareness.empty": "Šiame puslapyje patvirtinimo sulaikymų nėra.",
  "awareness.page": "Eilės puslapis {page} iš {pages}",
  "awareness.error": "Nepavyko patikrinti dabartinių įrašų. Prieš veikdami atnaujinkite.",
  "awareness.checked": "Patikrinta {at}",
  "awareness.weekly": "Dabartiniai savaitės laiko tarpų įrašai",
  "awareness.earlier": "Ankstesni pašto dėžutės įspėjimai",
  "notifications.failureInspect": "Peržiūrėti paskelbimo informaciją",
  "notifications.failureReadError":
    "Nepavyko patikrinti paskelbimo informacijos. Prieš nuspręsdami, ką daryti, bandykite dar kartą.",
  "notifications.failureReason.contentReview":
    "Išsaugotą bandymą užblokavo turinio patikros. Atidarykite juodraštį, kad peržiūrėtumėte jo dabartinį pasirengimą.",
  "notifications.failureReason.destination":
    "Išsaugotas bandymas pranešė apie paskirties vietos ryšio ar atsako klaidą. Prieš bandydami dar kartą patikrinkite paskirties vietą.",
  "notifications.failureReason.configuration":
    "Išsaugotas bandymas pranešė apie trūkstamą arba netinkamą publikavimo konfigūraciją. Patikrinkite projekto nustatymus.",
  "notifications.failureReason.unknown":
    "Nepavyko klasifikuoti išsaugotos klaidos. Prieš bandydami dar kartą peržiūrėkite juodraštį ir paskirties vietą.",
  "notifications.failureRecorded":
    "Įrašas atnaujintas {at} jūsų naršyklės laiko juostoje. Užfiksuoti bandymai: {attempts}.",
  "notifications.failureDraftChanged":
    "Juodraštis pasikeitė po šio įrašo. Ši informacija gali nebeatitikti jo dabartinio pasirengimo.",
  "notifications.failureHttp": "Užfiksuotas svetainės atsakas: HTTP {status}.",
  "notifications.failureCheck.links":
    "Išspręskite vidines nuorodas redaktoriaus nuorodų saugos skydelyje.",
  "notifications.failureCheck.sourcesReview":
    "Patikrinkite teiginius pagal šaltinius arba su kvalifikuotu autoriumi ir užbaikite žmogaus peržiūrą.",
  "notifications.failureCheck.author":
    "Pridėkite tikro autoriaus vardą ir biografiją, kvalifikaciją arba profilį.",
  "notifications.failureHistoryLimit":
    "Tai Milo išsaugota istorinė informacija. Ji netikrina paskirties vietos, nepatvirtina dabartinio juodraščio ir nepaleidžia paskelbimo iš naujo.",
  "notifications.failureState.absent":
    "Atitinkamo eilės įrašo nerasta. Atnaujinkite pranešimus ir peržiūrėkite juodraštį.",
  "notifications.failureState.changed":
    "Eilė nebežymi šio elemento kaip nepavykusio. Atnaujinkite pranešimus; vien tai nepatikrina paskirties svetainės.",
  "notifications.recoveryInspect": "Peržiūrėti išsaugotą darbą",
  "notifications.recoveryReadError":
    "Nepavyko patikrinti išsaugotų automatizavimo įrašų. Prieš nuspręsdami, ar paleisti iš naujo, bandykite dar kartą.",
  "notifications.recoveryState.absent":
    "Dabartinio vykdymo įrašo nerasta. Atnaujinkite pranešimus, kad patikrintumėte, ar šis incidentas išspręstas.",
  "notifications.recoveryState.running": "Naujausias vykdymas pažymėtas kaip aktyvus.",
  "notifications.recoveryState.completed":
    "Naujausias vykdymas baigtas. Atnaujinkite pranešimus, kad pamatytumėte dabartines problemas.",
  "notifications.recoveryState.review_required": "Nutrauktą vykdymą vis dar reikia peržiūrėti.",
  "notifications.recoverySnapshot": "Milo įrašai patikrinti {at} jūsų naršyklės laiko juostoje.",
  "notifications.recoveryCounts":
    "Planas {period}: išsaugoti juodraščiai — {saved}. Šių juodraščių eilės įrašai: laukia — {pending}, vykdoma — {publishing}, užfiksuota kaip paskelbta — {published}, nepavyko — {failed}, atšaukta — {cancelled}.",
  "notifications.recoveryEvidenceLimit":
    "Tai Milo išsaugoti įrašai. Jie netikrina paskutinės DI operacijos ar paskirties svetainės. Prieš kartodami neaiškų paskelbimą patikrinkite paskirties vietą. Šis vaizdas darbo iš naujo nepaleidžia.",
  "notifications.recoveryMore":
    "Rodoma {shown} iš {total} išsaugotų juodraščių. Atidarykite kalendorių, kad peržiūrėtumėte likusį darbą.",
  "notifications.emailAddressUnverified":
    "Jūsų dabartinis paskyros el. pašto adresas nepatvirtintas. Užbaikite el. pašto patvirtinimą ir patikrinkite dar kartą. Jei adresą pakeitė administratorius ir patvirtinimo nuorodos neturite, susisiekite su Milo pagalbos tarnyba. Pranešimai programoje lieka prieinami.",
  "notifications.emailAddressUnavailable":
    "Milo nepavyko patikrinti jūsų dabartinio el. pašto patvirtinimo. Bandykite vėliau. Vis tiek galite išjungti santraukas ir naudoti pranešimus programoje.",
  "notifications.generation_capacity_low": "Pasirengimo limito gali nepakakti planui",
  "notifications.generation_capacity_unavailable": "Nepavyko patikrinti pasirengimo limito",
  "notifications.capacityLow":
    "Plane {period} šiam projektui dar reikia {missing} juodraščių, o visuose jūsų aktyviuose grafikuose — {total}. Jūsų paskyrai laikotarpiu {usagePeriod} liko {remaining} pasirengimo bandymų. Tai bendras pajėgumas, o ne užbaigtų straipsnių pažadas. Peržiūrėkite grafiką; išsaugoti juodraščiai lieka prieinami peržiūrai ir paskelbimui.",
  "notifications.capacityUnavailable":
    "Milo nepavyko patikrinti bendro pasirengimo limito laikotarpiui {usagePeriod}. Plane {period} čia dar reikia {missing} juodraščių. Patikrinkite vėliau. Išsaugoti juodraščiai ir kiti pranešimai lieka prieinami.",
  "notifications.scheduler_recovery": "Automatizavimui reikia atkūrimo peržiūros",
  "notifications.recovery":
    "Pasirengimas pristabdytas po nutraukto vykdymo. Prieš paleisdami iš naujo peržiūrėkite išsaugotus juodraščius ir paskutinę operaciją. Esami paskelbimo patvirtinimai lieka nepakitę.",
  "notifications.emailTitle": "El. pašto santraukos",
  "notifications.emailDescription":
    "Gaukite vieną naujų įspėjimų santrauką ne dažniau kaip kartą per valandą patvirtintu paskyros adresu. Kiekvienas incidentas rodomas vieną kartą.",
  "notifications.emailDisabled":
    "El. pašto pristatymas dar neaktyvuotas. Pranešimai programoje yra prieinami.",
  "notifications.emailEnable": "Įjungti el. pašto santraukas",
  "notifications.emailDisable": "Išjungti el. pašto santraukas",
  "notifications.emailError": "El. pašto nustatymai laikinai nepasiekiami.",
  "notifications.emailSaveError": "Nepavyko išsaugoti el. pašto nuostatų.",
  "notifications.emailHistory": "Naujausia el. pašto veikla",
  "notifications.emailStatus.pending": "Laukiama",
  "notifications.emailStatus.leased": "Tikrinama dabartinė būsena",
  "notifications.emailStatus.sending": "Siunčiama",
  "notifications.emailStatus.accepted": "Priimta el. pašto paslaugų teikėjo",
  "notifications.emailStatus.unknown": "Pristatymo rezultatą reikia patikrinti",
  "notifications.emailStatus.cancelled": "Atšaukta",
  "notifications.emailStatus.failed": "Nepavyko parengti el. laiško",
  "notifications.title": "Pranešimai",
  "notifications.subtitle":
    "Jūsų artėjantys sprendimai ir publikavimo problemos, patikrintos pagal naujausią serverio būseną.",
  "notifications.loading": "Tikrinamas jūsų planas…",
  "notifications.empty": "Šiuo metu jūsų dėmesio nereikalauja jokie veiksmai.",
  "notifications.error": "Pranešimai laikinai nepasiekiami.",
  "notifications.stale":
    "Nepavyko užbaigti naujausios patikros. Tai paskutiniai patvirtinti įspėjimai.",
  "notifications.refresh": "Patikrinti dar kartą",
  "notifications.read": "Pažymėti kaip perskaitytą",
  "notifications.unread": "Neperskaityta",
  "notifications.saved": "Perskaityta",
  "notifications.open": "Atidaryti užduotį",
  "notifications.calendar": "Atidaryti kalendorių",
  "notifications.project": "Projektas",
  "notifications.approval_due": "Netrukus reikia patvirtinti",
  "notifications.publication_failed": "Paskelbimą reikia patikrinti",
  "notifications.manual_overdue": "Rankinės užduoties terminas praėjo",
  "notifications.cadence_gap": "Kitai savaitei reikia dėmesio",
  "notifications.coverage":
    "{missing} iš {total} suplanuotų laiko tarpų nėra paruošti ir įtraukti į eilę.",
  "notifications.failure":
    "Prieš bandydami dar kartą patikrinkite paskirties vietą: nutrauktas paskelbimas jau gali būti tiesiogiai matomas.",
  "notifications.approval": "Peržiūrėkite dabartinę versiją iki jai suplanuoto termino.",
  "notifications.manual":
    "Užbaikite šią užduotį arba pasirinkite naują datą. Šis terminas taikomas rankinei užduočiai.",
  "notifications.readError":
    "Nepavyko pažymėti šio pranešimo kaip perskaityto. Bandykite dar kartą.",
};
