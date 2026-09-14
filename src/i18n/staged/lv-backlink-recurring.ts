/** Latvian authoring only; not registered in the runtime or language picker.
 * USD amounts keep the source's dot decimals. */
export const lvBacklinkRecurring: Readonly<Record<string, string>> = {
  "backlinkRecurring.title": "Pastāvīga atpakaļsaišu uzraudzība",
  "backlinkRecurring.note":
    "Vāciet šīs saglabātās vietnes jauno un zaudēto atpakaļsaišu skaitus katru dienu vai katru nedēļu. Katra izpilde aptver pilnas UTC dienas no DataForSEO indeksa. Nokavētās izpildes tiek izlaistas; novērojumi nepārbauda atsevišķus izvietojumus vai pilnu tīmekļa saišu sarakstu.",
  "backlinkRecurring.loading": "Notiek saglabāto uzraudzības iestatījumu ielāde…",
  "backlinkRecurring.error":
    "Uzraudzības iestatījumi nav pieejami. Ielādējiet vēlreiz, lai mēģinātu atkārtoti.",
  "backlinkRecurring.enabled":
    "Uzraudzība ieslēgta — katrai datu vākšanai joprojām nepieciešams pieejams piegādātāja finansējums.",
  "backlinkRecurring.paused": "Uzraudzība apturēta. Jauna automātiska datu vākšana nav ieslēgta.",
  "backlinkRecurring.spending":
    "{month} (UTC): šai uzraudzībai rezervēts vai iztērēts {used} no {cap}.",
  "backlinkRecurring.unsettled":
    "Agrākam pieprasījumam ir neatrisināts rezultāts vai izmaksas. Turpmākā automātiskā datu vākšana ir aizturēta. Pārbaudiet vēsturi; saglabātie veiksmīgie rezultāti var piedāvāt uzskaites atjaunošanu. Nosūtīts pieprasījums automātiski netiek atkārtots.",
  "backlinkRecurring.capHeld":
    "Atlikušais mēneša limits ir mazāks par vienu pilnu pieprasījumu. Datu vākšana gaida nākamo UTC mēnesi vai saglabātas limita izmaiņas.",
  "backlinkRecurring.changedWebsite":
    "Vietne ir mainījusies. Saglabājiet uzraudzības iestatījumus pašreizējai saglabātā projekta vietnei vai ielādējiet projektu vēlreiz, ja parādītā vietne ir novecojusi. Esošie izdevumi tiek saglabāti.",
  "backlinkRecurring.next":
    "Nākamais izpildes laiks (UTC): {date}. Datu vākšana sākas vēlākā plānotāja pārbaudē, kad finansējuma un konta pārbaudes ir sekmīgas.",
  "backlinkRecurring.pause": "Apturēt uzraudzību",
  "backlinkRecurring.unavailable":
    "Piegādātāja datu vākšana pašlaik nav pieejama. Varat apturēt uzraudzību un skatīt saglabāto vēsturi. Ieslēgšanai nepieciešams apstiprināts aktīvs piegādātāja konts ar pieejamu atlikumu.",
  "backlinkRecurring.settings": "Uzraudzības iestatījumi",
  "backlinkRecurring.enable": "Ieslēgt automātisku datu vākšanu",
  "backlinkRecurring.cadence": "Biežums",
  "backlinkRecurring.daily": "Katru dienu",
  "backlinkRecurring.weekly": "Katru nedēļu",
  "backlinkRecurring.days": "Pilnas UTC dienas vienā izpildē",
  "backlinkRecurring.cap": "Mēneša piegādātāja limits (USD)",
  "backlinkRecurring.save": "Saglabāt uzraudzības iestatījumus",
  "backlinkRecurring.allowance":
    "Šis limits ierobežo tikai šo uzraudzību; tā saglabāšana nepievieno konta līdzekļus. Ievadiet 0–100 USD ar ne vairāk kā sešām zīmēm aiz komata. Ieslēgšanai nepieciešami vismaz 0.024 USD plus 0.000036 USD par katru loga dienu. Piemēro arī konta un koplietotos piegādātāja limitus. Apturēšana aptur jaunas nosūtīšanas; jau pieņemta datu vākšana joprojām var pabeigties un radīt rezervētās izmaksas.",
  "backlinkRecurring.invalid":
    "Ievadiet 1–92 veselas dienas un derīgu USD limitu. Ieslēgtajam limitam jāsedz vismaz viens pilns pieprasījums.",
  "backlinkRecurring.saved": "Uzraudzības iestatījumi saglabāti.",
  "backlinkRecurring.uncertain":
    "Saglabāšana nav apstiprināta. Pirms nākamās izmaiņas ielādējiet saglabātos iestatījumus vēlreiz; iepriekšējā izmaiņa, iespējams, jau ir saglabāta.",
  "backlinkRecurring.refresh": "Ielādēt saglabātos iestatījumus (atmest labojumus)",
  "backlinkRecurring.history": "Skatīt saglabātos pieprasījumus un uzskaiti zemāk",
  "backlinkRecurring.scheduled": "Ieplānota izpilde",
  "backlinkRecurring.manual": "Manuāls pieprasījums",
  "backlinkRecurring.occurrence": "Ieplānotā reize (UTC)",
  "backlinkRecurring.undispatched":
    "Šis ieplānotais pieprasījums netika nodots piegādātājam. Tā uzraudzības limits ir atbrīvots.",
};
