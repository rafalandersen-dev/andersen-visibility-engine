import type { EmailLanguage } from "@/lib/email-languages";
import type { EmailCopy } from "./email-copy-types";

/** New EU translations; existing en/pl/sv/da copy is retained separately. */
export const euEmailCopy: Record<Exclude<EmailLanguage, "en" | "pl" | "sv" | "da">, EmailCopy> = {
  bg: {
    digest: {
      subject: "Задачите ви в Milo Growth се нуждаят от внимание",
      intro:
        "При последната проверка тези задачи все още се нуждаеха от внимание. Отворете Milo, за да видите текущото им състояние.",
      open: "Преглед на известията",
      footer:
        "Управлявайте предпочитанията си за служебни имейли в Milo. Отварянето на тази връзка никога не одобрява и не публикува съдържание.",
      kinds: {
        approval_due: "Скоро е необходимо одобрение",
        publication_failed: "Публикацията трябва да се провери",
        manual_overdue: "Ръчната задача е просрочена",
        cadence_gap: "Следващата седмица се нуждае от внимание",
        scheduler_recovery: "Автоматизацията се нуждае от преглед за възстановяване",
        generation_capacity_low: "Лимитът за подготовка може да не покрива плана",
        generation_capacity_unavailable: "Лимитът за подготовка не можа да бъде проверен",
      },
    },
    invitation: {
      subject: "Имате покана за проект в Milo Growth",
      intro: "Поканени сте да работите съвместно по проект в Milo Growth.",
      instruction:
        "Влезте или създайте акаунт с имейл адреса, на който получихте поканата. След това прегледайте поканата и ролята в раздела за сътрудници.",
      open: "Преглед на поканата",
      footer:
        "Поканата изтича седем дни след създаването ѝ и може да бъде оттеглена от собственика. Отварянето на тази връзка не приема поканата, не одобрява съдържание и не публикува нищо.",
      roles: { viewer: "Читател", editor: "Редактор", reviewer: "Проверяващ" },
    },
  },
  hr: {
    digest: {
      subject: "Vaši zadaci u Milo Growthu zahtijevaju pozornost",
      intro:
        "Ovi su zadaci pri posljednjoj provjeri još zahtijevali pozornost. Otvorite Milo kako biste provjerili njihovo trenutačno stanje.",
      open: "Pregledaj obavijesti",
      footer:
        "Postavkama e-pošte o zadacima upravljajte u Milu. Otvaranje ove poveznice nikada ne odobrava niti objavljuje sadržaj.",
      kinds: {
        approval_due: "Uskoro je potrebno odobrenje",
        publication_failed: "Objavu treba provjeriti",
        manual_overdue: "Ručnom zadatku istekao je rok",
        cadence_gap: "Plan za sljedeći tjedan zahtijeva pozornost",
        scheduler_recovery: "Automatizaciju treba pregledati radi oporavka",
        generation_capacity_low: "Kvota za pripremu možda nije dovoljna za plan",
        generation_capacity_unavailable: "Kvotu za pripremu nije moguće provjeriti",
      },
    },
    invitation: {
      subject: "Imate pozivnicu za projekt u Milo Growthu",
      intro: "Pozvani ste na suradnju na projektu u Milo Growthu.",
      instruction:
        "Prijavite se ili izradite račun s adresom e-pošte na koju ste primili ovu pozivnicu, a zatim pregledajte pozivnicu i ulogu u odjeljku za suradnike.",
      open: "Pregledaj pozivnicu",
      footer:
        "Pozivnica istječe sedam dana nakon izrade, a vlasnik je može opozvati. Otvaranje ove poveznice ne prihvaća pozivnicu, ne odobrava sadržaj i ništa ne objavljuje.",
      roles: { viewer: "Čitatelj", editor: "Urednik", reviewer: "Pregledavatelj" },
    },
  },
  cs: {
    digest: {
      subject: "Vaše úkoly v Milo Growth vyžadují pozornost",
      intro:
        "Tyto úkoly při poslední kontrole stále vyžadovaly pozornost. Otevřete Milo a zkontrolujte jejich aktuální stav.",
      open: "Zobrazit oznámení",
      footer:
        "Nastavení provozních e-mailů spravujte v Milo. Otevření tohoto odkazu nikdy neschvaluje ani nezveřejňuje obsah.",
      kinds: {
        approval_due: "Brzy bude potřeba schválení",
        publication_failed: "Zveřejnění je potřeba zkontrolovat",
        manual_overdue: "Ruční úkol je po termínu",
        cadence_gap: "Plán na příští týden vyžaduje pozornost",
        scheduler_recovery: "Automatizace vyžaduje kontrolu před obnovením",
        generation_capacity_low: "Limit přípravy nemusí stačit na plán",
        generation_capacity_unavailable: "Limit přípravy se nepodařilo ověřit",
      },
    },
    invitation: {
      subject: "Máte pozvánku k projektu v Milo Growth",
      intro: "Byli jste pozváni ke spolupráci na projektu v Milo Growth.",
      instruction:
        "Přihlaste se nebo vytvořte účet s e-mailovou adresou, na kterou byla tato pozvánka doručena. Poté si v sekci spolupracovníků prohlédněte pozvánku a roli.",
      open: "Zobrazit pozvánku",
      footer:
        "Pozvánka vyprší sedm dní po vytvoření a její vlastník ji může odvolat. Otevření tohoto odkazu nepřijímá pozvánku, neschvaluje obsah ani nic nezveřejňuje.",
      roles: { viewer: "Čtenář", editor: "Editor", reviewer: "Posuzovatel" },
    },
  },
  nl: {
    digest: {
      subject: "Je taken in Milo Growth hebben aandacht nodig",
      intro:
        "Deze taken hadden bij de laatste controle nog aandacht nodig. Open Milo om hun huidige status te bekijken.",
      open: "Meldingen bekijken",
      footer:
        "Beheer je voorkeuren voor operationele e-mails in Milo. Het openen van deze link keurt nooit inhoud goed en publiceert niets.",
      kinds: {
        approval_due: "Binnenkort goedkeuring nodig",
        publication_failed: "Publicatie moet worden gecontroleerd",
        manual_overdue: "Handmatige taak is te laat",
        cadence_gap: "Volgende week heeft aandacht nodig",
        scheduler_recovery: "Automatisering moet worden gecontroleerd voor herstel",
        generation_capacity_low: "Het voorbereidingstegoed is mogelijk niet genoeg voor het plan",
        generation_capacity_unavailable: "Het voorbereidingstegoed kon niet worden gecontroleerd",
      },
    },
    invitation: {
      subject: "Je hebt een projectuitnodiging in Milo Growth",
      intro: "Je bent uitgenodigd om samen te werken aan een project in Milo Growth.",
      instruction:
        "Meld je aan of maak een account met het e-mailadres waarop je deze uitnodiging hebt ontvangen. Bekijk daarna de uitnodiging en je rol bij de samenwerkingspartners.",
      open: "Uitnodiging bekijken",
      footer:
        "De uitnodiging vervalt zeven dagen na aanmaak en kan door de eigenaar worden ingetrokken. Het openen van deze link accepteert de uitnodiging niet, keurt geen inhoud goed en publiceert niets.",
      roles: { viewer: "Lezer", editor: "Bewerker", reviewer: "Beoordelaar" },
    },
  },
  et: {
    digest: {
      subject: "Teie Milo Growthi ülesanded vajavad tähelepanu",
      intro:
        "Need ülesanded vajasid viimase kontrolli ajal endiselt tähelepanu. Avage Milo, et vaadata nende praegust olekut.",
      open: "Vaata teavitusi",
      footer:
        "Tööülesannete e-kirjade eelistusi saate hallata Milos. Selle lingi avamine ei kinnita ega avalda kunagi sisu.",
      kinds: {
        approval_due: "Peagi on vaja kinnitust",
        publication_failed: "Avaldamist tuleb kontrollida",
        manual_overdue: "Käsitsi tehtava ülesande tähtaeg on möödunud",
        cadence_gap: "Järgmise nädala plaan vajab tähelepanu",
        scheduler_recovery: "Automatiseerimine vajab taastamiseks ülevaatust",
        generation_capacity_low: "Ettevalmistamise limiidist ei pruugi plaani jaoks piisata",
        generation_capacity_unavailable: "Ettevalmistamise limiiti ei saanud kontrollida",
      },
    },
    invitation: {
      subject: "Teile on Milo Growthis projektikutse",
      intro: "Teid on kutsutud tegema koostööd Milo Growthi projektis.",
      instruction:
        "Logige sisse või looge konto selle e-posti aadressiga, kuhu kutse saabus. Seejärel vaadake kutse ja roll koostööpartnerite jaotises üle.",
      open: "Vaata kutset",
      footer:
        "Kutse aegub seitse päeva pärast loomist ja omanik võib selle tühistada. Selle lingi avamine ei võta kutset vastu, ei kinnita sisu ega avalda midagi.",
      roles: { viewer: "Vaataja", editor: "Toimetaja", reviewer: "Ülevaataja" },
    },
  },
  fi: {
    digest: {
      subject: "Milo Growthin tehtäväsi vaativat huomiota",
      intro:
        "Nämä tehtävät vaativat edelleen huomiota viimeisimmässä tarkistuksessa. Avaa Milo ja tarkista niiden nykyinen tila.",
      open: "Näytä ilmoitukset",
      footer:
        "Hallitse tehtäviin liittyvien sähköpostien asetuksia Milossa. Tämän linkin avaaminen ei koskaan hyväksy eikä julkaise sisältöä.",
      kinds: {
        approval_due: "Hyväksyntä tarvitaan pian",
        publication_failed: "Julkaisu on tarkistettava",
        manual_overdue: "Manuaalisen tehtävän määräaika on ylittynyt",
        cadence_gap: "Ensi viikon suunnitelma vaatii huomiota",
        scheduler_recovery: "Automaatio vaatii tarkistuksen ennen palautusta",
        generation_capacity_low: "Valmistelukiintiö ei ehkä riitä suunnitelmaan",
        generation_capacity_unavailable: "Valmistelukiintiötä ei voitu tarkistaa",
      },
    },
    invitation: {
      subject: "Sinulla on projektikutsu Milo Growthissa",
      intro: "Sinut on kutsuttu tekemään yhteistyötä Milo Growthin projektissa.",
      instruction:
        "Kirjaudu sisään tai luo tili sillä sähköpostiosoitteella, johon sait tämän kutsun. Tarkista sitten kutsu ja rooli yhteistyökumppanien osiossa.",
      open: "Tarkista kutsu",
      footer:
        "Kutsu vanhenee seitsemän päivää luomisen jälkeen, ja omistaja voi peruuttaa sen. Tämän linkin avaaminen ei hyväksy kutsua tai sisältöä eikä julkaise mitään.",
      roles: { viewer: "Lukija", editor: "Muokkaaja", reviewer: "Tarkistaja" },
    },
  },
  fr: {
    digest: {
      subject: "Vos tâches Milo Growth nécessitent votre attention",
      intro:
        "Ces tâches nécessitaient encore votre attention lors de la dernière vérification. Ouvrez Milo pour consulter leur état actuel.",
      open: "Consulter les notifications",
      footer:
        "Gérez vos préférences d’e-mails opérationnels dans Milo. L’ouverture de ce lien n’approuve ni ne publie jamais de contenu.",
      kinds: {
        approval_due: "Approbation bientôt nécessaire",
        publication_failed: "Publication à vérifier",
        manual_overdue: "Tâche manuelle en retard",
        cadence_gap: "La semaine prochaine nécessite votre attention",
        scheduler_recovery: "L’automatisation doit être vérifiée avant sa reprise",
        generation_capacity_low: "Le quota de préparation pourrait ne pas suffire au plan",
        generation_capacity_unavailable: "Le quota de préparation n’a pas pu être vérifié",
      },
    },
    invitation: {
      subject: "Vous avez une invitation à un projet Milo Growth",
      intro: "Vous avez été invité à collaborer à un projet dans Milo Growth.",
      instruction:
        "Connectez-vous ou créez un compte avec l’adresse e-mail qui a reçu cette invitation, puis consultez l’invitation et le rôle dans la section des collaborateurs.",
      open: "Consulter l’invitation",
      footer:
        "L’invitation expire sept jours après sa création et peut être révoquée par son propriétaire. L’ouverture de ce lien n’accepte pas l’invitation, n’approuve aucun contenu et ne publie rien.",
      roles: { viewer: "Lecteur", editor: "Éditeur", reviewer: "Réviseur" },
    },
  },
  de: {
    digest: {
      subject: "Ihre Aufgaben in Milo Growth benötigen Aufmerksamkeit",
      intro:
        "Diese Aufgaben benötigten bei der letzten Prüfung weiterhin Aufmerksamkeit. Öffnen Sie Milo, um ihren aktuellen Status zu prüfen.",
      open: "Benachrichtigungen ansehen",
      footer:
        "Verwalten Sie Ihre Einstellungen für betriebliche E-Mails in Milo. Das Öffnen dieses Links genehmigt oder veröffentlicht niemals Inhalte.",
      kinds: {
        approval_due: "Genehmigung bald erforderlich",
        publication_failed: "Veröffentlichung muss geprüft werden",
        manual_overdue: "Manuelle Aufgabe ist überfällig",
        cadence_gap: "Die nächste Woche benötigt Aufmerksamkeit",
        scheduler_recovery: "Automatisierung muss vor der Wiederherstellung geprüft werden",
        generation_capacity_low:
          "Das Vorbereitungskontingent reicht möglicherweise nicht für den Plan",
        generation_capacity_unavailable: "Das Vorbereitungskontingent konnte nicht geprüft werden",
      },
    },
    invitation: {
      subject: "Sie haben eine Projekteinladung in Milo Growth",
      intro: "Sie wurden zur Zusammenarbeit an einem Projekt in Milo Growth eingeladen.",
      instruction:
        "Melden Sie sich mit der E-Mail-Adresse an, die diese Einladung erhalten hat, oder erstellen Sie damit ein Konto. Prüfen Sie anschließend die Einladung und die Rolle im Bereich für Mitwirkende.",
      open: "Einladung prüfen",
      footer:
        "Die Einladung läuft sieben Tage nach ihrer Erstellung ab und kann vom Eigentümer widerrufen werden. Das Öffnen dieses Links nimmt die Einladung nicht an, genehmigt keine Inhalte und veröffentlicht nichts.",
      roles: { viewer: "Leser", editor: "Bearbeiter", reviewer: "Prüfer" },
    },
  },
  el: {
    digest: {
      subject: "Οι εργασίες σας στο Milo Growth χρειάζονται προσοχή",
      intro:
        "Αυτές οι εργασίες εξακολουθούσαν να χρειάζονται προσοχή στον τελευταίο έλεγχο. Ανοίξτε το Milo για να δείτε την τρέχουσα κατάστασή τους.",
      open: "Προβολή ειδοποιήσεων",
      footer:
        "Διαχειριστείτε τις προτιμήσεις σας για λειτουργικά email στο Milo. Το άνοιγμα αυτού του συνδέσμου δεν εγκρίνει ούτε δημοσιεύει ποτέ περιεχόμενο.",
      kinds: {
        approval_due: "Σύντομα απαιτείται έγκριση",
        publication_failed: "Η δημοσίευση χρειάζεται έλεγχο",
        manual_overdue: "Η χειροκίνητη εργασία έχει καθυστερήσει",
        cadence_gap: "Η επόμενη εβδομάδα χρειάζεται προσοχή",
        scheduler_recovery: "Ο αυτοματισμός χρειάζεται έλεγχο πριν από την αποκατάσταση",
        generation_capacity_low: "Το όριο προετοιμασίας ενδέχεται να μην καλύπτει το πλάνο",
        generation_capacity_unavailable: "Δεν ήταν δυνατός ο έλεγχος του ορίου προετοιμασίας",
      },
    },
    invitation: {
      subject: "Έχετε πρόσκληση για έργο στο Milo Growth",
      intro: "Έχετε προσκληθεί να συνεργαστείτε σε ένα έργο στο Milo Growth.",
      instruction:
        "Συνδεθείτε ή δημιουργήστε λογαριασμό με τη διεύθυνση email που έλαβε αυτή την πρόσκληση. Στη συνέχεια, ελέγξτε την πρόσκληση και τον ρόλο στην ενότητα συνεργατών.",
      open: "Προβολή πρόσκλησης",
      footer:
        "Η πρόσκληση λήγει επτά ημέρες μετά τη δημιουργία της και μπορεί να ανακληθεί από τον κάτοχο. Το άνοιγμα αυτού του συνδέσμου δεν αποδέχεται την πρόσκληση, δεν εγκρίνει περιεχόμενο και δεν δημοσιεύει τίποτα.",
      roles: { viewer: "Αναγνώστης", editor: "Συντάκτης", reviewer: "Ελεγκτής" },
    },
  },
  hu: {
    digest: {
      subject: "A Milo Growth-feladatai figyelmet igényelnek",
      intro:
        "Ezek a feladatok a legutóbbi ellenőrzéskor még figyelmet igényeltek. Nyissa meg a Milót az aktuális állapotuk áttekintéséhez.",
      open: "Értesítések megtekintése",
      footer:
        "A működéssel kapcsolatos e-mailek beállításait a Milóban kezelheti. A hivatkozás megnyitása soha nem hagy jóvá és nem tesz közzé tartalmat.",
      kinds: {
        approval_due: "Hamarosan jóváhagyás szükséges",
        publication_failed: "A közzétételt ellenőrizni kell",
        manual_overdue: "A kézi feladat határideje lejárt",
        cadence_gap: "A következő hét figyelmet igényel",
        scheduler_recovery: "Az automatizálást a helyreállítás előtt ellenőrizni kell",
        generation_capacity_low: "Az előkészítési keret esetleg nem fedezi a tervet",
        generation_capacity_unavailable: "Az előkészítési keretet nem sikerült ellenőrizni",
      },
    },
    invitation: {
      subject: "Projektmeghívója érkezett a Milo Growthban",
      intro: "Meghívták egy Milo Growth-projekten való együttműködésre.",
      instruction:
        "Jelentkezzen be, vagy hozzon létre fiókot azzal az e-mail-címmel, amelyre ezt a meghívót kapta. Ezután tekintse át a meghívót és a szerepkört az együttműködők részében.",
      open: "Meghívó áttekintése",
      footer:
        "A meghívó a létrehozásától számított hét nap után lejár, és a tulajdonos visszavonhatja. A hivatkozás megnyitása nem fogadja el a meghívót, nem hagy jóvá tartalmat és nem tesz közzé semmit.",
      roles: { viewer: "Olvasó", editor: "Szerkesztő", reviewer: "Ellenőrző" },
    },
  },
  ga: {
    digest: {
      subject: "Tá aird de dhíth ar do thascanna in Milo Growth",
      intro:
        "Bhí aird fós de dhíth ar na tascanna seo ag an tseiceáil is déanaí. Oscail Milo chun a stádas reatha a fheiceáil.",
      open: "Féach ar na fógraí",
      footer:
        "Bainistigh do roghanna ríomhphoist oibríochtúil in Milo. Ní cheadaítear ná ní fhoilsítear ábhar riamh tríd an nasc seo a oscailt.",
      kinds: {
        approval_due: "Beidh ceadú de dhíth go luath",
        publication_failed: "Ní mór an foilsiú a sheiceáil",
        manual_overdue: "Tá an tasc láimhe thar téarma",
        cadence_gap: "Tá aird de dhíth ar an tseachtain seo chugainn",
        scheduler_recovery: "Ní mór an t-uathoibriú a athbhreithniú sula n-athshlánaítear é",
        generation_capacity_low: "Seans nach leor an cuóta ullmhúcháin don phlean",
        generation_capacity_unavailable: "Níorbh fhéidir an cuóta ullmhúcháin a sheiceáil",
      },
    },
    invitation: {
      subject: "Tá cuireadh chuig tionscadal in Milo Growth agat",
      intro: "Tugadh cuireadh duit comhoibriú ar thionscadal in Milo Growth.",
      instruction:
        "Sínigh isteach nó cruthaigh cuntas leis an seoladh ríomhphoist a fuair an cuireadh seo. Ansin féach ar an gcuireadh agus ar an ról sa rannán do chomhoibrithe.",
      open: "Féach ar an gcuireadh",
      footer:
        "Téann an cuireadh in éag seacht lá tar éis a chruthaithe agus is féidir leis an úinéir é a chúlghairm. Ní ghlactar leis an gcuireadh, ní cheadaítear ábhar agus ní fhoilsítear aon rud tríd an nasc seo a oscailt.",
      roles: { viewer: "Léitheoir", editor: "Eagarthóir", reviewer: "Athbhreithneoir" },
    },
  },
  it: {
    digest: {
      subject: "Le tue attività in Milo Growth richiedono attenzione",
      intro:
        "Queste attività richiedevano ancora attenzione all’ultimo controllo. Apri Milo per verificarne lo stato attuale.",
      open: "Visualizza le notifiche",
      footer:
        "Gestisci le preferenze per le email operative in Milo. L’apertura di questo link non approva né pubblica mai contenuti.",
      kinds: {
        approval_due: "Approvazione necessaria a breve",
        publication_failed: "La pubblicazione richiede un controllo",
        manual_overdue: "L’attività manuale è in ritardo",
        cadence_gap: "La prossima settimana richiede attenzione",
        scheduler_recovery: "L’automazione richiede una verifica prima del ripristino",
        generation_capacity_low: "La quota di preparazione potrebbe non coprire il piano",
        generation_capacity_unavailable:
          "Non è stato possibile verificare la quota di preparazione",
      },
    },
    invitation: {
      subject: "Hai un invito a un progetto in Milo Growth",
      intro: "Hai ricevuto un invito a collaborare a un progetto in Milo Growth.",
      instruction:
        "Accedi o crea un account con l’indirizzo email che ha ricevuto questo invito, quindi controlla l’invito e il ruolo nella sezione dei collaboratori.",
      open: "Visualizza l’invito",
      footer:
        "L’invito scade sette giorni dopo la creazione e può essere revocato dal proprietario. L’apertura di questo link non accetta l’invito, non approva contenuti e non pubblica nulla.",
      roles: { viewer: "Lettore", editor: "Redattore", reviewer: "Revisore" },
    },
  },
  lv: {
    digest: {
      subject: "Jūsu Milo Growth uzdevumiem jāpievērš uzmanība",
      intro:
        "Pēdējās pārbaudes laikā šiem uzdevumiem joprojām bija jāpievērš uzmanība. Atveriet Milo, lai apskatītu to pašreizējo statusu.",
      open: "Skatīt paziņojumus",
      footer:
        "Pārvaldiet darba e-pasta iestatījumus Milo. Šīs saites atvēršana nekad neapstiprina un nepublicē saturu.",
      kinds: {
        approval_due: "Drīzumā nepieciešams apstiprinājums",
        publication_failed: "Publicēšana jāpārbauda",
        manual_overdue: "Manuālā uzdevuma termiņš ir nokavēts",
        cadence_gap: "Nākamajai nedēļai jāpievērš uzmanība",
        scheduler_recovery: "Automatizācija jāpārskata pirms atjaunošanas",
        generation_capacity_low: "Sagatavošanas limits var nebūt pietiekams plānam",
        generation_capacity_unavailable: "Sagatavošanas limitu neizdevās pārbaudīt",
      },
    },
    invitation: {
      subject: "Jums ir uzaicinājums uz projektu Milo Growth",
      intro: "Jūs esat uzaicināts sadarboties Milo Growth projektā.",
      instruction:
        "Pierakstieties vai izveidojiet kontu ar e-pasta adresi, uz kuru saņēmāt šo uzaicinājumu. Pēc tam apskatiet uzaicinājumu un lomu sadaļā sadarbības partneriem.",
      open: "Skatīt uzaicinājumu",
      footer:
        "Uzaicinājums beidzas septiņas dienas pēc izveides, un īpašnieks to var atsaukt. Šīs saites atvēršana nepieņem uzaicinājumu, neapstiprina saturu un neko nepublicē.",
      roles: { viewer: "Lasītājs", editor: "Redaktors", reviewer: "Pārskatītājs" },
    },
  },
  lt: {
    digest: {
      subject: "Jūsų Milo Growth užduotims reikia dėmesio",
      intro:
        "Per paskutinę patikrą šioms užduotims vis dar reikėjo dėmesio. Atidarykite Milo ir peržiūrėkite dabartinę jų būseną.",
      open: "Peržiūrėti pranešimus",
      footer:
        "Darbinių el. laiškų nuostatas tvarkykite Milo. Atidarius šią nuorodą turinys niekada nepatvirtinamas ir nepaskelbiamas.",
      kinds: {
        approval_due: "Netrukus reikės patvirtinimo",
        publication_failed: "Paskelbimą reikia patikrinti",
        manual_overdue: "Rankinės užduoties terminas praleistas",
        cadence_gap: "Kitai savaitei reikia dėmesio",
        scheduler_recovery: "Prieš atkuriant automatizavimą reikia jį peržiūrėti",
        generation_capacity_low: "Parengimo limito gali nepakakti planui",
        generation_capacity_unavailable: "Nepavyko patikrinti parengimo limito",
      },
    },
    invitation: {
      subject: "Gavote kvietimą į Milo Growth projektą",
      intro: "Esate pakviesti bendradarbiauti Milo Growth projekte.",
      instruction:
        "Prisijunkite arba sukurkite paskyrą naudodami el. pašto adresą, kuriuo gavote šį kvietimą. Tada bendradarbių skiltyje peržiūrėkite kvietimą ir vaidmenį.",
      open: "Peržiūrėti kvietimą",
      footer:
        "Kvietimas nustoja galioti praėjus septynioms dienoms nuo sukūrimo, o savininkas gali jį atšaukti. Atidarius šią nuorodą kvietimas nepriimamas, turinys nepatvirtinamas ir niekas nepaskelbiama.",
      roles: { viewer: "Skaitytojas", editor: "Redaktorius", reviewer: "Tikrintojas" },
    },
  },
  mt: {
    digest: {
      subject: "Il-kompiti tiegħek f’Milo Growth jeħtieġu attenzjoni",
      intro:
        "Dawn il-kompiti kienu għadhom jeħtieġu attenzjoni fl-aħħar verifika. Iftaħ Milo biex tara l-istatus attwali tagħhom.",
      open: "Ara n-notifiki",
      footer:
        "Immaniġġja l-preferenzi tiegħek għall-emails operattivi f’Milo. Il-ftuħ ta’ din il-link qatt ma japprova jew jippubblika kontenut.",
      kinds: {
        approval_due: "Approvazzjoni meħtieġa dalwaqt",
        publication_failed: "Il-pubblikazzjoni trid tiġi vverifikata",
        manual_overdue: "Il-kompitu manwali qabeż l-iskadenza",
        cadence_gap: "Il-ġimgħa d-dieħla teħtieġ attenzjoni",
        scheduler_recovery: "L-awtomazzjoni teħtieġ reviżjoni qabel ir-restawr",
        generation_capacity_low: "Il-kwota ta’ preparazzjoni tista’ ma tkunx biżżejjed għall-pjan",
        generation_capacity_unavailable: "Il-kwota ta’ preparazzjoni ma setgħetx tiġi vverifikata",
      },
    },
    invitation: {
      subject: "Għandek stedina għal proġett f’Milo Growth",
      intro: "Ġejt mistieden tikkollabora fuq proġett f’Milo Growth.",
      instruction:
        "Idħol jew oħloq kont bl-indirizz tal-email li rċieva din l-istedina. Imbagħad irrevedi l-istedina u r-rwol fit-taqsima tal-kollaboraturi.",
      open: "Irrevedi l-istedina",
      footer:
        "L-istedina tiskadi sebat ijiem wara li tinħoloq u tista’ tiġi revokata mis-sid tagħha. Il-ftuħ ta’ din il-link ma jaċċettax l-istedina, ma japprovax kontenut u ma jippubblika xejn.",
      roles: { viewer: "Qarrej", editor: "Editur", reviewer: "Reviżur" },
    },
  },
  pt: {
    digest: {
      subject: "As suas tarefas no Milo Growth precisam de atenção",
      intro:
        "Estas tarefas ainda precisavam de atenção na última verificação. Abra o Milo para consultar o estado atual.",
      open: "Ver notificações",
      footer:
        "Gira as preferências de emails operacionais no Milo. Abrir esta ligação nunca aprova nem publica conteúdos.",
      kinds: {
        approval_due: "Aprovação necessária em breve",
        publication_failed: "A publicação precisa de ser verificada",
        manual_overdue: "A tarefa manual está atrasada",
        cadence_gap: "A próxima semana precisa de atenção",
        scheduler_recovery: "A automatização precisa de revisão antes da recuperação",
        generation_capacity_low: "A quota de preparação pode não ser suficiente para o plano",
        generation_capacity_unavailable: "Não foi possível verificar a quota de preparação",
      },
    },
    invitation: {
      subject: "Tem um convite para um projeto no Milo Growth",
      intro: "Recebeu um convite para colaborar num projeto no Milo Growth.",
      instruction:
        "Inicie sessão ou crie uma conta com o endereço de email que recebeu este convite. Depois, reveja o convite e a função na secção dos colaboradores.",
      open: "Rever convite",
      footer:
        "O convite expira sete dias após a criação e pode ser revogado pelo proprietário. Abrir esta ligação não aceita o convite, não aprova conteúdos nem publica nada.",
      roles: { viewer: "Leitor", editor: "Editor", reviewer: "Revisor" },
    },
  },
  ro: {
    digest: {
      subject: "Sarcinile dvs. din Milo Growth necesită atenție",
      intro:
        "Aceste sarcini încă necesitau atenție la ultima verificare. Deschideți Milo pentru a vedea starea lor actuală.",
      open: "Vedeți notificările",
      footer:
        "Gestionați preferințele pentru e-mailurile operaționale în Milo. Deschiderea acestui link nu aprobă și nu publică niciodată conținut.",
      kinds: {
        approval_due: "Aprobarea va fi necesară în curând",
        publication_failed: "Publicarea trebuie verificată",
        manual_overdue: "Sarcina manuală este întârziată",
        cadence_gap: "Săptămâna viitoare necesită atenție",
        scheduler_recovery: "Automatizarea trebuie verificată înainte de recuperare",
        generation_capacity_low: "Cota de pregătire poate fi insuficientă pentru plan",
        generation_capacity_unavailable: "Cota de pregătire nu a putut fi verificată",
      },
    },
    invitation: {
      subject: "Aveți o invitație la un proiect în Milo Growth",
      intro: "Ați primit o invitație de a colabora la un proiect în Milo Growth.",
      instruction:
        "Conectați-vă sau creați un cont cu adresa de e-mail care a primit această invitație. Apoi verificați invitația și rolul în secțiunea colaboratorilor.",
      open: "Verificați invitația",
      footer:
        "Invitația expiră la șapte zile de la creare și poate fi revocată de proprietar. Deschiderea acestui link nu acceptă invitația, nu aprobă conținut și nu publică nimic.",
      roles: { viewer: "Cititor", editor: "Editor", reviewer: "Revizor" },
    },
  },
  sk: {
    digest: {
      subject: "Vaše úlohy v Milo Growth vyžadujú pozornosť",
      intro:
        "Tieto úlohy pri poslednej kontrole stále vyžadovali pozornosť. Otvorte Milo a skontrolujte ich aktuálny stav.",
      open: "Zobraziť oznámenia",
      footer:
        "Nastavenia prevádzkových e-mailov spravujte v Milo. Otvorenie tohto odkazu nikdy neschvaľuje ani nezverejňuje obsah.",
      kinds: {
        approval_due: "Čoskoro bude potrebné schválenie",
        publication_failed: "Zverejnenie treba skontrolovať",
        manual_overdue: "Ručná úloha je po termíne",
        cadence_gap: "Budúci týždeň vyžaduje pozornosť",
        scheduler_recovery: "Automatizáciu treba pred obnovením skontrolovať",
        generation_capacity_low: "Limit prípravy nemusí stačiť na plán",
        generation_capacity_unavailable: "Limit prípravy sa nepodarilo overiť",
      },
    },
    invitation: {
      subject: "Máte pozvánku do projektu v Milo Growth",
      intro: "Dostali ste pozvánku na spoluprácu na projekte v Milo Growth.",
      instruction:
        "Prihláste sa alebo si vytvorte účet s e-mailovou adresou, na ktorú prišla táto pozvánka. Potom si v sekcii spolupracovníkov prezrite pozvánku a rolu.",
      open: "Zobraziť pozvánku",
      footer:
        "Pozvánka vyprší sedem dní po vytvorení a jej vlastník ju môže odvolať. Otvorenie tohto odkazu neprijíma pozvánku, neschvaľuje obsah ani nič nezverejňuje.",
      roles: { viewer: "Čitateľ", editor: "Editor", reviewer: "Posudzovateľ" },
    },
  },
  sl: {
    digest: {
      subject: "Vaše naloge v Milo Growth potrebujejo pozornost",
      intro:
        "Te naloge so ob zadnjem preverjanju še vedno potrebovale pozornost. Odprite Milo in preverite njihovo trenutno stanje.",
      open: "Ogled obvestil",
      footer:
        "Nastavitve e-pošte o delovanju upravljajte v Milu. Odpiranje te povezave nikoli ne odobri ali objavi vsebine.",
      kinds: {
        approval_due: "Kmalu bo potrebna odobritev",
        publication_failed: "Objavo je treba preveriti",
        manual_overdue: "Ročna naloga zamuja",
        cadence_gap: "Naslednji teden potrebuje pozornost",
        scheduler_recovery: "Avtomatizacijo je treba pred obnovitvijo pregledati",
        generation_capacity_low: "Kvota za pripravo morda ne zadostuje za načrt",
        generation_capacity_unavailable: "Kvote za pripravo ni bilo mogoče preveriti",
      },
    },
    invitation: {
      subject: "Imate povabilo k projektu v Milo Growth",
      intro: "Prejeli ste povabilo k sodelovanju pri projektu v Milo Growth.",
      instruction:
        "Prijavite se ali ustvarite račun z e-poštnim naslovom, na katerega ste prejeli to povabilo. Nato preglejte povabilo in vlogo v razdelku za sodelavce.",
      open: "Pregled povabila",
      footer:
        "Povabilo poteče sedem dni po nastanku in lastnik ga lahko prekliče. Odpiranje te povezave ne sprejme povabila, ne odobri vsebine in ničesar ne objavi.",
      roles: { viewer: "Bralec", editor: "Urednik", reviewer: "Pregledovalec" },
    },
  },
  es: {
    digest: {
      subject: "Tus tareas de Milo Growth necesitan atención",
      intro:
        "Estas tareas seguían necesitando atención en la última comprobación. Abre Milo para consultar su estado actual.",
      open: "Ver notificaciones",
      footer:
        "Gestiona tus preferencias de correos operativos en Milo. Abrir este enlace nunca aprueba ni publica contenido.",
      kinds: {
        approval_due: "Pronto se necesita aprobación",
        publication_failed: "La publicación necesita una comprobación",
        manual_overdue: "La tarea manual está atrasada",
        cadence_gap: "La próxima semana necesita atención",
        scheduler_recovery: "La automatización necesita una revisión antes de recuperarse",
        generation_capacity_low: "La cuota de preparación podría no cubrir el plan",
        generation_capacity_unavailable: "No se pudo comprobar la cuota de preparación",
      },
    },
    invitation: {
      subject: "Tienes una invitación a un proyecto de Milo Growth",
      intro: "Has recibido una invitación para colaborar en un proyecto de Milo Growth.",
      instruction:
        "Inicia sesión o crea una cuenta con la dirección de correo que recibió esta invitación. Después, revisa la invitación y el rol en la sección de colaboradores.",
      open: "Revisar invitación",
      footer:
        "La invitación caduca siete días después de su creación y su propietario puede revocarla. Abrir este enlace no acepta la invitación, no aprueba contenido ni publica nada.",
      roles: { viewer: "Lector", editor: "Editor", reviewer: "Revisor" },
    },
  },
};
