/** Lithuanian authoring only; not registered in the runtime or language picker.
 * USD amounts keep the source's dot decimals. */
export const ltBacklinkRecurring: Readonly<Record<string, string>> = {
  "backlinkRecurring.title": "Nuolatinė atgalinių nuorodų stebėsena",
  "backlinkRecurring.note":
    "Rinkite šios išsaugotos svetainės naujų ir prarastų atgalinių nuorodų skaičius kasdien arba kas savaitę. Kiekvienas vykdymas apima pilnas UTC dienas iš DataForSEO indekso. Praleisti vykdymai nepaleidžiami; stebėjimai nepatikrina atskirų išdėstymų ar išsamaus žiniatinklio nuorodų sąrašo.",
  "backlinkRecurring.loading": "Įkeliami išsaugoti stebėsenos nustatymai…",
  "backlinkRecurring.error":
    "Stebėsenos nustatymai nepasiekiami. Įkelkite iš naujo, kad bandytumėte dar kartą.",
  "backlinkRecurring.enabled":
    "Stebėsena įjungta — kiekvienam duomenų rinkimui vis tiek reikia turimo tiekėjo finansavimo.",
  "backlinkRecurring.paused":
    "Stebėsena pristabdyta. Naujas automatinis duomenų rinkimas neįjungtas.",
  "backlinkRecurring.spending":
    "{month} (UTC): šiai stebėsenai rezervuota arba išleista {used} iš {cap}.",
  "backlinkRecurring.unsettled":
    "Ankstesnės užklausos rezultatas arba išlaidos neišspręsti. Tolesnis automatinis duomenų rinkimas sulaikytas. Patikrinkite istoriją; išsaugoti sėkmingi rezultatai gali pasiūlyti apskaitos atkūrimą. Išsiųsta užklausa automatiškai nekartojama.",
  "backlinkRecurring.capHeld":
    "Likęs mėnesio limitas mažesnis nei viena pilna užklausa. Duomenų rinkimas laukia kito UTC mėnesio arba išsaugoto limito pakeitimo.",
  "backlinkRecurring.changedWebsite":
    "Svetainė pasikeitė. Išsaugokite stebėsenos nustatymus dabartinei išsaugoto projekto svetainei arba iš naujo įkelkite projektą, jei rodoma svetainė pasenusi. Esamos išlaidos išsaugomos.",
  "backlinkRecurring.next":
    "Kitas vykdymo laikas (UTC): {date}. Duomenų rinkimas pradedamas per vėlesnę planuoklio patikrą, kai finansavimo ir paskyros patikros sėkmingos.",
  "backlinkRecurring.pause": "Pristabdyti stebėseną",
  "backlinkRecurring.unavailable":
    "Tiekėjo duomenų rinkimas šiuo metu nepasiekiamas. Galite pristabdyti stebėseną ir peržiūrėti išsaugotą istoriją. Norint įjungti, reikia patvirtintos aktyvios tiekėjo paskyros su turimu likučiu.",
  "backlinkRecurring.settings": "Stebėsenos nustatymai",
  "backlinkRecurring.enable": "Įjungti automatinį duomenų rinkimą",
  "backlinkRecurring.cadence": "Dažnumas",
  "backlinkRecurring.daily": "Kasdien",
  "backlinkRecurring.weekly": "Kas savaitę",
  "backlinkRecurring.days": "Pilnos UTC dienos per vykdymą",
  "backlinkRecurring.cap": "Mėnesio tiekėjo limitas (USD)",
  "backlinkRecurring.save": "Išsaugoti stebėsenos nustatymus",
  "backlinkRecurring.allowance":
    "Šis limitas riboja tik šią stebėseną; jo išsaugojimas neprideda lėšų į paskyrą. Įveskite 0–100 USD, ne daugiau kaip šešis skaitmenis po kablelio. Norint įjungti, reikia bent 0.024 USD plius 0.000036 USD už kiekvieną lango dieną. Taip pat taikomi paskyros ir bendri tiekėjo limitai. Pristabdymas sustabdo naujus išsiuntimus; jau priimtas duomenų rinkimas vis tiek gali būti užbaigtas ir sukelti rezervuotų išlaidų.",
  "backlinkRecurring.invalid":
    "Įveskite 1–92 sveikas dienas ir tinkamą USD limitą. Įjungtas limitas turi padengti bent vieną pilną užklausą.",
  "backlinkRecurring.saved": "Stebėsenos nustatymai išsaugoti.",
  "backlinkRecurring.uncertain":
    "Išsaugojimas nepatvirtintas. Prieš kitą pakeitimą iš naujo įkelkite išsaugotus nustatymus; ankstesnis pakeitimas galbūt jau išsaugotas.",
  "backlinkRecurring.refresh": "Įkelti išsaugotus nustatymus (atmesti pakeitimus)",
  "backlinkRecurring.history": "Peržiūrėti išsaugotas užklausas ir apskaitą žemiau",
  "backlinkRecurring.scheduled": "Suplanuotas vykdymas",
  "backlinkRecurring.manual": "Rankinė užklausa",
  "backlinkRecurring.occurrence": "Suplanuotas kartas (UTC)",
  "backlinkRecurring.undispatched":
    "Ši suplanuota užklausa nebuvo perduota tiekėjui. Jos stebėsenos limitas atlaisvintas.",
};
