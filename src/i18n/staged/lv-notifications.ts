/** Latvian authoring only; not registered in the runtime or language picker.
 * Covers `awareness.*` and `notifications.*` from `notifications.ts`. */
export const lvNotifications: Readonly<Record<string, string>> = {
  "awareness.title": "Pašreizējais projekta darbs",
  "awareness.help":
    "Tikai lietotnē. Šīs pārbaudes nesūta e-pastu. Aizturējumi paliek redzami, līdz mainās rinda; to atvēršana neapstiprina un neatsāk darbu.",
  "awareness.project": "Izvēlieties projektu",
  "awareness.approval": "Konkrētajai versijai nepieciešams apstiprinājums",
  "awareness.resume": "Apstiprinātā versija joprojām ir aizturēta",
  "awareness.late":
    "Šis datums ir pagājis. Pārskatiet melnrakstu un izvēlieties konkrētu plānošanas darbību.",
  "awareness.paused":
    "Automatizācija ir apzināti apturēta. Esošie publicēšanas aizturējumi paliek atsevišķi.",
  "awareness.disabled": "Automatizācija ir atspējota.",
  "awareness.settings": "Atvērt grafika iestatījumus",
  "awareness.history":
    "Pēdējais saglabātais nedēļas rezultāts — vēsturisks, nevis jauna jaudas vai avotu pārbaude",
  "awareness.empty": "Šajā lapā nav apstiprinājuma aizturējumu.",
  "awareness.page": "Rindas lapa {page} no {pages}",
  "awareness.error": "Pašreizējos ierakstus neizdevās pārbaudīt. Pirms rīkoties, atsvaidziniet.",
  "awareness.checked": "Pārbaudīts {at}",
  "awareness.weekly": "Pašreizējie nedēļas laika posmu ieraksti",
  "awareness.earlier": "Agrākie iesūtnes brīdinājumi",
  "notifications.failureInspect": "Pārbaudīt publicēšanas informāciju",
  "notifications.failureReadError":
    "Publicēšanas informāciju neizdevās pārbaudīt. Mēģiniet vēlreiz, pirms izlemjat, ko darīt.",
  "notifications.failureReason.contentReview":
    "Saglabāto mēģinājumu bloķēja satura pārbaudes. Atveriet melnrakstu, lai pārskatītu tā pašreizējo gatavību.",
  "notifications.failureReason.destination":
    "Saglabātais mēģinājums ziņoja par galamērķa savienojuma vai atbildes kļūdu. Pirms mēģināt vēlreiz, pārbaudiet galamērķi.",
  "notifications.failureReason.configuration":
    "Saglabātais mēģinājums ziņoja par trūkstošu vai nederīgu publicēšanas konfigurāciju. Pārbaudiet projekta iestatīšanu.",
  "notifications.failureReason.unknown":
    "Saglabāto kļūdu neizdevās klasificēt. Pirms mēģināt vēlreiz, pārskatiet melnrakstu un galamērķi.",
  "notifications.failureRecorded":
    "Ieraksts atjaunināts {at} jūsu pārlūkprogrammas laika joslā. Reģistrētie mēģinājumi: {attempts}.",
  "notifications.failureDraftChanged":
    "Melnraksts mainījās pēc šī ieraksta. Šī informācija, iespējams, vairs neapraksta tā pašreizējo gatavību.",
  "notifications.failureHttp": "Reģistrētā vietnes atbilde: HTTP {status}.",
  "notifications.failureCheck.links": "Atrisiniet iekšējās saites redaktora saišu drošības panelī.",
  "notifications.failureCheck.sourcesReview":
    "Pārbaudiet apgalvojumus pēc avotiem vai ar kvalificēta autora palīdzību un pabeidziet cilvēka pārskatīšanu.",
  "notifications.failureCheck.author":
    "Pievienojiet reālā autora vārdu un biogrāfiju, kvalifikāciju vai profilu.",
  "notifications.failureHistoryLimit":
    "Šī ir Milo saglabāta vēsturiska informācija. Tā nepārbauda galamērķi, neapstiprina pašreizējo melnrakstu un neatsāk publicēšanu.",
  "notifications.failureState.absent":
    "Atbilstošs rindas ieraksts netika atrasts. Atsvaidziniet paziņojumus un pārskatiet melnrakstu.",
  "notifications.failureState.changed":
    "Rinda vairs neatzīmē šo vienumu kā neizdevušos. Atsvaidziniet paziņojumus; tas vien nepārbauda galamērķa vietni.",
  "notifications.recoveryInspect": "Pārbaudīt saglabāto darbu",
  "notifications.recoveryReadError":
    "Saglabātos automatizācijas ierakstus neizdevās pārbaudīt. Mēģiniet vēlreiz, pirms izlemjat, vai atsākt.",
  "notifications.recoveryState.absent":
    "Pašreizējās izpildes ieraksts netika atrasts. Atsvaidziniet paziņojumus, lai pārbaudītu, vai šis incidents ir atrisināts.",
  "notifications.recoveryState.running": "Jaunākā izpilde ir atzīmēta kā aktīva.",
  "notifications.recoveryState.completed":
    "Jaunākā izpilde ir beigusies. Atsvaidziniet paziņojumus, lai redzētu pašreizējās problēmas.",
  "notifications.recoveryState.review_required": "Pārtrauktā izpilde joprojām jāpārskata.",
  "notifications.recoverySnapshot":
    "Milo ieraksti pārbaudīti {at} jūsu pārlūkprogrammas laika joslā.",
  "notifications.recoveryCounts":
    "Plāns {period}: saglabāti melnraksti — {saved}. Šo melnrakstu rindas ieraksti: gaida — {pending}, procesā — {publishing}, reģistrēti kā publicēti — {published}, neizdevušies — {failed}, atcelti — {cancelled}.",
  "notifications.recoveryEvidenceLimit":
    "Šie ir Milo saglabāti ieraksti. Tie nepārbauda pēdējo AI darbību vai galamērķa vietni. Pirms nenoteiktas publicēšanas atkārtošanas pārbaudiet galamērķi. Šis skats neatsāk darbu.",
  "notifications.recoveryMore":
    "Parādīti {shown} no {total} saglabātajiem melnrakstiem. Atveriet kalendāru, lai pārbaudītu atlikušo darbu.",
  "notifications.emailAddressUnverified":
    "Jūsu pašreizējā konta e-pasta adrese nav verificēta. Pabeidziet e-pasta apstiprināšanu un pēc tam pārbaudiet vēlreiz. Ja adresi mainīja administrators un jums nav apstiprinājuma saites, sazinieties ar Milo atbalsta dienestu. Paziņojumi lietotnē joprojām ir pieejami.",
  "notifications.emailAddressUnavailable":
    "Milo neizdevās pārbaudīt jūsu pašreizējā e-pasta verifikāciju. Mēģiniet vēlreiz vēlāk. Joprojām varat izslēgt kopsavilkumus un izmantot paziņojumus lietotnē.",
  "notifications.generation_capacity_low": "Sagatavošanas limits var nesegt plānu",
  "notifications.generation_capacity_unavailable": "Sagatavošanas limitu neizdevās pārbaudīt",
  "notifications.capacityLow":
    "Plānam {period} šim projektam vēl nepieciešami {missing} melnraksti, bet visos jūsu aktīvajos grafikos — {total}. Jūsu kontam periodā {usagePeriod} atlikuši {remaining} sagatavošanas mēģinājumi. Tā ir koplietota jauda, nevis pabeigtu rakstu solījums. Pārskatiet grafiku; saglabātie melnraksti joprojām ir pieejami pārskatīšanai un publicēšanai.",
  "notifications.capacityUnavailable":
    "Milo neizdevās pārbaudīt koplietoto sagatavošanas limitu periodam {usagePeriod}. Plānam {period} šeit vēl nepieciešami {missing} melnraksti. Pārbaudiet vēlreiz vēlāk. Saglabātie melnraksti un citi paziņojumi joprojām ir pieejami.",
  "notifications.scheduler_recovery": "Automatizācijai nepieciešama atkopšanas pārskatīšana",
  "notifications.recovery":
    "Sagatavošana apturēta pēc pārtrauktas izpildes. Pirms atsākšanas pārskatiet saglabātos melnrakstus un pēdējo darbību. Esošie publicēšanas apstiprinājumi paliek nemainīti.",
  "notifications.emailTitle": "E-pasta kopsavilkumi",
  "notifications.emailDescription":
    "Saņemiet vienu jauno brīdinājumu kopsavilkumu ne biežāk kā reizi stundā uz jūsu apstiprināto konta adresi. Katrs incidents parādās vienu reizi.",
  "notifications.emailDisabled":
    "E-pasta piegāde vēl nav aktivizēta. Paziņojumi lietotnē ir pieejami.",
  "notifications.emailEnable": "Ieslēgt e-pasta kopsavilkumus",
  "notifications.emailDisable": "Izslēgt e-pasta kopsavilkumus",
  "notifications.emailError": "E-pasta iestatījumi īslaicīgi nav pieejami.",
  "notifications.emailSaveError": "E-pasta preferences neizdevās saglabāt.",
  "notifications.emailHistory": "Nesenā e-pasta aktivitāte",
  "notifications.emailStatus.pending": "Gaida",
  "notifications.emailStatus.leased": "Notiek pašreizējā statusa pārbaude",
  "notifications.emailStatus.sending": "Notiek sūtīšana",
  "notifications.emailStatus.accepted": "E-pasta pakalpojumu sniedzējs pieņēma",
  "notifications.emailStatus.unknown": "Piegādes rezultāts jāpārbauda",
  "notifications.emailStatus.cancelled": "Atcelts",
  "notifications.emailStatus.failed": "E-pastu neizdevās sagatavot",
  "notifications.title": "Paziņojumi",
  "notifications.subtitle":
    "Jūsu gaidāmie lēmumi un publicēšanas problēmas, pārbaudītas pēc jaunākā servera stāvokļa.",
  "notifications.loading": "Notiek jūsu plāna pārbaude…",
  "notifications.empty": "Pašlaik nekas nav jāpievērš jūsu uzmanībai.",
  "notifications.error": "Paziņojumi īslaicīgi nav pieejami.",
  "notifications.stale":
    "Jaunāko pārbaudi neizdevās pabeigt. Šie ir pēdējie apstiprinātie brīdinājumi.",
  "notifications.refresh": "Pārbaudīt vēlreiz",
  "notifications.read": "Atzīmēt kā izlasītu",
  "notifications.unread": "Neizlasīts",
  "notifications.saved": "Izlasīts",
  "notifications.open": "Atvērt uzdevumu",
  "notifications.calendar": "Atvērt kalendāru",
  "notifications.project": "Projekts",
  "notifications.approval_due": "Drīzumā jāapstiprina",
  "notifications.publication_failed": "Publicēšana jāpārbauda",
  "notifications.manual_overdue": "Manuālā uzdevuma termiņš ir nokavēts",
  "notifications.cadence_gap": "Nākamajai nedēļai jāpievērš uzmanība",
  "notifications.coverage":
    "{missing} no {total} plānotajiem laika posmiem nav gatavi un nav ievietoti rindā.",
  "notifications.failure":
    "Pirms mēģināt vēlreiz, pārbaudiet galamērķi: pārtraukta publicēšana, iespējams, jau ir tiešsaistē.",
  "notifications.approval": "Pārskatiet pašreizējo versiju pirms tās plānotā termiņa.",
  "notifications.manual":
    "Pabeidziet šo uzdevumu vai izvēlieties jaunu datumu. Šis termiņš attiecas uz manuālu uzdevumu.",
  "notifications.readError":
    "Šo paziņojumu neizdevās atzīmēt kā izlasītu. Lūdzu, mēģiniet vēlreiz.",
};
