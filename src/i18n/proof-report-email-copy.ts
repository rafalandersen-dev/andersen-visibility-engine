import { UI_CATALOGS } from "./catalogs";
import type { EmailLanguage } from "@/lib/email-languages";

// Email-only catalogs. This does not register any additional interface language.
export const PROOF_REPORT_EMAIL_KEYS = [
  "report.title",
  "report.published.title",
  "report.published.empty",
  "report.stat.drafted",
  "report.stat.scheduled",
  "report.stat.linksLive",
  "report.gsc.title",
  "report.gsc.line",
  "report.gsc.empty",
  "report.plan.title",
  "report.plan.empty",
  "report.footer",
  "report.footer.agency",
  "gsc.integrity.disclaimer",
  "gsc.integrity.legacy",
  "gsc.integrity.aggregate",
  "gsc.integrity.rows",
  "gsc.integrity.unknown",
] as const;
export type ProofReportEmailKey = (typeof PROOF_REPORT_EMAIL_KEYS)[number];
type Copy = Readonly<Record<ProofReportEmailKey, string>>;
const existing = (language: "en" | "pl" | "sv" | "da"): Copy =>
  Object.fromEntries(
    PROOF_REPORT_EMAIL_KEYS.map((key) => [key, UI_CATALOGS[language][key]]),
  ) as Copy;
export const proofReportEmailCopy: Readonly<Record<EmailLanguage, Copy>> = {
  en: existing("en"),
  pl: existing("pl"),
  sv: existing("sv"),
  da: existing("da"),

  fr: {
    "report.title": "Rapport mensuel de résultats",
    "report.published.title": "Publications enregistrées ({count})",
    "report.published.empty": "Aucune publication enregistrée pour ce mois.",
    "report.stat.drafted": "Brouillons rédigés",
    "report.stat.scheduled": "Planifiés",
    "report.stat.linksLive": "Liens partenaires en ligne ✓",
    "report.gsc.title": "Aperçu des recherches",
    "report.gsc.line": "{clicks} clics · {impressions} impressions · position moyenne {position}",
    "report.gsc.empty":
      "Connectez Google Search Console dans les paramètres pour inclure les données de recherche.",
    "report.plan.title": "Plan du mois prochain ({count})",
    "report.plan.empty":
      "Rien n’est encore prévu — ouvrez la page Plan pour préparer le mois prochain.",
    "report.footer":
      "Milo Growth. D’après les résultats de publication enregistrés. Ce rapport ne vérifie pas à nouveau si les pages sont actuellement en ligne.",
    "report.footer.agency":
      "{agency}. D’après les résultats de publication enregistrés. Ce rapport ne vérifie pas à nouveau si les pages sont actuellement en ligne.",
    "gsc.integrity.disclaimer":
      "La source et la propriété enregistrées sont des déclarations, sans vérification indépendante. — signifie indisponible, jamais zéro. Les tableaux peuvent omettre du trafic. Ces dates sont distinctes du mois du rapport et de la date de publication. Les observations de recherche ne prouvent ni causalité ni conversions.",
    "gsc.integrity.legacy":
      "Import ancien : données d’origine conservées. La base numérique ne peut pas être reconstituée de façon fiable ; prévisualisez un nouvel export pour utiliser ces mesures.",
    "gsc.integrity.aggregate":
      "Agrégat de propriété déclaré comme provenant de l’API. Les tableaux de requêtes et de pages sont des échantillons distincts des premières lignes ; ils ne sont pas additionnés. Recherche web, données finalisées, jours calendaires du Pacifique.",
    "gsc.integrity.rows":
      "Sous-total de ce tableau CSV uniquement. Ce n’est pas le total complet de la propriété ; l’anonymisation des requêtes, les filtres et les lignes omises peuvent réduire la couverture.",
    "gsc.integrity.unknown":
      "Agrégat indisponible. Des lignes qui se chevauchent ou sont ambiguës ne permettent pas d’établir un total.",
  },
  de: {
    "report.title": "Monatlicher Ergebnisbericht",
    "report.published.title": "Erfasste Veröffentlichungen ({count})",
    "report.published.empty": "Für diesen Monat sind keine Veröffentlichungen erfasst.",
    "report.stat.drafted": "Erstellte Entwürfe",
    "report.stat.scheduled": "Geplant",
    "report.stat.linksLive": "Partnerlinks live ✓",
    "report.gsc.title": "Suchübersicht",
    "report.gsc.line":
      "{clicks} Klicks · {impressions} Impressionen · durchschnittliche Position {position}",
    "report.gsc.empty":
      "Verbinden Sie Google Search Console in den Einstellungen, um Suchdaten einzubeziehen.",
    "report.plan.title": "Plan für nächsten Monat ({count})",
    "report.plan.empty":
      "Noch nichts geplant — öffnen Sie die Seite Plan, um den nächsten Monat vorzubereiten.",
    "report.footer":
      "Milo Growth. Basiert auf gespeicherten Veröffentlichungsergebnissen. Dieser Bericht prüft nicht erneut, ob die Seiten derzeit online sind.",
    "report.footer.agency":
      "{agency}. Basiert auf gespeicherten Veröffentlichungsergebnissen. Dieser Bericht prüft nicht erneut, ob die Seiten derzeit online sind.",
    "gsc.integrity.disclaimer":
      "Gespeicherte Quelle und Property sind Angaben, keine unabhängige Bestätigung. — bedeutet nicht verfügbar, niemals null. Tabellen können Zugriffe auslassen. Diese Daten sind vom Berichtsmonat und Veröffentlichungsdatum getrennt. Suchbeobachtungen belegen weder Kausalität noch Conversions.",
    "gsc.integrity.legacy":
      "Alter Import: Originaldaten bleiben erhalten. Die Zahlenbasis lässt sich nicht zuverlässig wiederherstellen; prüfen Sie einen neuen Export, um diese Messwerte zu nutzen.",
    "gsc.integrity.aggregate":
      "Als API-Property-Aggregat angegeben. Abfrage- und Seitentabellen sind getrennte Stichproben der obersten Zeilen und werden nicht addiert. Websuche, endgültige Daten, Kalendertage in pazifischer Zeit.",
    "gsc.integrity.rows":
      "Nur die Zwischensumme dieser CSV-Tabelle. Kein vollständiger Property-Gesamtwert; anonymisierte Abfragen, Filter und ausgelassene Zeilen können die Abdeckung beeinflussen.",
    "gsc.integrity.unknown":
      "Aggregat nicht verfügbar. Überlappende oder mehrdeutige Zeilen ergeben keinen verlässlichen Gesamtwert.",
  },
  es: {
    "report.title": "Informe mensual de resultados",
    "report.published.title": "Publicaciones registradas ({count})",
    "report.published.empty": "No hay publicaciones registradas para este mes.",
    "report.stat.drafted": "Borradores creados",
    "report.stat.scheduled": "Programados",
    "report.stat.linksLive": "Enlaces de socios en línea ✓",
    "report.gsc.title": "Resumen de búsquedas",
    "report.gsc.line": "{clicks} clics · {impressions} impresiones · posición media {position}",
    "report.gsc.empty":
      "Conecta Google Search Console en Configuración para incluir las métricas de búsqueda.",
    "report.plan.title": "Plan del próximo mes ({count})",
    "report.plan.empty":
      "Todavía no hay nada previsto — abre la página Plan para preparar el próximo mes.",
    "report.footer":
      "Milo Growth. Basado en los resultados de publicación guardados. Este informe no vuelve a comprobar si las páginas siguen publicadas.",
    "report.footer.agency":
      "{agency}. Basado en los resultados de publicación guardados. Este informe no vuelve a comprobar si las páginas siguen publicadas.",
    "gsc.integrity.disclaimer":
      "La fuente y la propiedad guardadas son declaraciones, no verificaciones independientes. — significa no disponible, nunca cero. Las tablas pueden omitir tráfico. Estas fechas son distintas del mes del informe y de la fecha de publicación. Las observaciones de búsqueda no demuestran causalidad ni conversiones.",
    "gsc.integrity.legacy":
      "Importación antigua: se conservan los datos originales. No se puede recuperar de forma fiable la base numérica; revisa una nueva exportación para usar estas métricas.",
    "gsc.integrity.aggregate":
      "Agregado de propiedad declarado como procedente de la API. Las tablas de consultas y páginas son muestras separadas de las primeras filas y no se suman. Búsqueda web, datos finalizados, días naturales del Pacífico.",
    "gsc.integrity.rows":
      "Solo el subtotal de esta tabla CSV. No es el total completo de la propiedad; la anonimización de consultas, los filtros y las filas omitidas pueden afectar a la cobertura.",
    "gsc.integrity.unknown":
      "Agregado no disponible. Las filas solapadas o ambiguas no permiten establecer un total.",
  },
  it: {
    "report.title": "Rapporto mensile dei risultati",
    "report.published.title": "Pubblicazioni registrate ({count})",
    "report.published.empty": "Nessuna pubblicazione registrata per questo mese.",
    "report.stat.drafted": "Bozze create",
    "report.stat.scheduled": "Programmati",
    "report.stat.linksLive": "Link dei partner online ✓",
    "report.gsc.title": "Panoramica delle ricerche",
    "report.gsc.line": "{clicks} clic · {impressions} impressioni · posizione media {position}",
    "report.gsc.empty":
      "Collega Google Search Console nelle Impostazioni per includere le metriche di ricerca.",
    "report.plan.title": "Piano del prossimo mese ({count})",
    "report.plan.empty":
      "Non è ancora previsto nulla — apri la pagina Piano per preparare il prossimo mese.",
    "report.footer":
      "Milo Growth. Basato sui risultati di pubblicazione salvati. Questo report non ricontrolla se le pagine sono attualmente online.",
    "report.footer.agency":
      "{agency}. Basato sui risultati di pubblicazione salvati. Questo report non ricontrolla se le pagine sono attualmente online.",
    "gsc.integrity.disclaimer":
      "La fonte e la proprietà salvate sono dichiarazioni, non verifiche indipendenti. — significa non disponibile, mai zero. Le tabelle possono omettere traffico. Queste date sono distinte dal mese del rapporto e dalla data di pubblicazione. Le osservazioni di ricerca non dimostrano causalità o conversioni.",
    "gsc.integrity.legacy":
      "Importazione precedente: dati originali conservati. La base numerica non è recuperabile in modo affidabile; visualizza l’anteprima di una nuova esportazione per usare queste metriche.",
    "gsc.integrity.aggregate":
      "Aggregato della proprietà dichiarato come proveniente dall’API. Le tabelle di query e pagine sono campioni separati delle prime righe e non vengono sommati. Ricerca web, dati definitivi, giorni di calendario del Pacifico.",
    "gsc.integrity.rows":
      "Solo il subtotale di questa tabella CSV. Non è il totale completo della proprietà; anonimizzazione delle query, filtri e righe omesse possono influire sulla copertura.",
    "gsc.integrity.unknown":
      "Aggregato non disponibile. Righe sovrapposte o ambigue non consentono di stabilire un totale.",
  },
  pt: {
    "report.title": "Relatório mensal de resultados",
    "report.published.title": "Publicações registadas ({count})",
    "report.published.empty": "Nenhuma publicação registada para este mês.",
    "report.stat.drafted": "Rascunhos criados",
    "report.stat.scheduled": "Agendados",
    "report.stat.linksLive": "Ligações de parceiros online ✓",
    "report.gsc.title": "Resumo das pesquisas",
    "report.gsc.line": "{clicks} cliques · {impressions} impressões · posição média {position}",
    "report.gsc.empty":
      "Ligue o Google Search Console nas Definições para incluir métricas de pesquisa.",
    "report.plan.title": "Plano do próximo mês ({count})",
    "report.plan.empty":
      "Ainda não há nada planeado — abra a página Plano para preparar o próximo mês.",
    "report.footer":
      "Milo Growth. Com base nos resultados de publicação guardados. Este relatório não volta a verificar se as páginas estão atualmente online.",
    "report.footer.agency":
      "{agency}. Com base nos resultados de publicação guardados. Este relatório não volta a verificar se as páginas estão atualmente online.",
    "gsc.integrity.disclaimer":
      "A fonte e a propriedade guardadas são declarações, não verificações independentes. — significa indisponível, nunca zero. As tabelas podem omitir tráfego. Estas datas são distintas do mês do relatório e da data de publicação. As observações de pesquisa não comprovam causalidade nem conversões.",
    "gsc.integrity.legacy":
      "Importação antiga: dados originais preservados. A base numérica não pode ser recuperada com fiabilidade; pré-visualize uma nova exportação para utilizar estas métricas.",
    "gsc.integrity.aggregate":
      "Agregado da propriedade declarado como proveniente da API. As tabelas de consultas e páginas são amostras separadas das primeiras linhas e não são somadas. Pesquisa web, dados finais, dias de calendário do Pacífico.",
    "gsc.integrity.rows":
      "Apenas o subtotal desta tabela CSV. Não é o total completo da propriedade; a anonimização de consultas, os filtros e as linhas omitidas podem afetar a cobertura.",
    "gsc.integrity.unknown":
      "Agregado indisponível. Linhas sobrepostas ou ambíguas não permitem estabelecer um total.",
  },
  nl: {
    "report.title": "Maandelijks resultatenrapport",
    "report.published.title": "Geregistreerde publicaties ({count})",
    "report.published.empty": "Geen publicaties geregistreerd voor deze maand.",
    "report.stat.drafted": "Geschreven concepten",
    "report.stat.scheduled": "Ingepland",
    "report.stat.linksLive": "Partnerlinks live ✓",
    "report.gsc.title": "Zoekoverzicht",
    "report.gsc.line":
      "{clicks} klikken · {impressions} vertoningen · gemiddelde positie {position}",
    "report.gsc.empty": "Koppel Google Search Console in Instellingen om zoekgegevens op te nemen.",
    "report.plan.title": "Plan voor volgende maand ({count})",
    "report.plan.empty":
      "Nog niets gepland — open de pagina Plan om volgende maand voor te bereiden.",
    "report.footer":
      "Milo Growth. Gebaseerd op opgeslagen publicatieresultaten. Dit rapport controleert niet opnieuw of de pagina’s momenteel online staan.",
    "report.footer.agency":
      "{agency}. Gebaseerd op opgeslagen publicatieresultaten. Dit rapport controleert niet opnieuw of de pagina’s momenteel online staan.",
    "gsc.integrity.disclaimer":
      "De opgeslagen bron en property zijn verklaringen, geen onafhankelijke verificatie. — betekent niet beschikbaar, nooit nul. Tabellen kunnen verkeer weglaten. Deze datums staan los van de rapportmaand en publicatiedatum. Zoekwaarnemingen bewijzen geen causaliteit of conversies.",
    "gsc.integrity.legacy":
      "Oude import: oorspronkelijke gegevens bewaard. De cijferbasis kan niet betrouwbaar worden hersteld; bekijk een nieuwe export om deze statistieken te gebruiken.",
    "gsc.integrity.aggregate":
      "Opgegeven API-propertytotaal. Zoekopdracht- en paginatabellen zijn afzonderlijke steekproeven van de bovenste rijen en worden niet opgeteld. Zoeken op internet, definitieve gegevens, kalenderdagen in Pacific-tijd.",
    "gsc.integrity.rows":
      "Alleen het subtotaal van deze CSV-tabel. Geen volledig propertytotaal; geanonimiseerde zoekopdrachten, filters en weggelaten rijen kunnen de dekking beïnvloeden.",
    "gsc.integrity.unknown":
      "Totaal niet beschikbaar. Overlappende of onduidelijke rijen leveren geen betrouwbaar totaal op.",
  },
  fi: {
    "report.title": "Kuukausittainen tulosraportti",
    "report.published.title": "Tallennetut julkaisut ({count})",
    "report.published.empty": "Tälle kuukaudelle ei ole tallennettu julkaisuja.",
    "report.stat.drafted": "Kirjoitetut luonnokset",
    "report.stat.scheduled": "Ajastetut",
    "report.stat.linksLive": "Kumppanilinkit verkossa ✓",
    "report.gsc.title": "Hakujen tilannekuva",
    "report.gsc.line":
      "{clicks} klikkausta · {impressions} näyttökertaa · keskimääräinen sijainti {position}",
    "report.gsc.empty":
      "Yhdistä Google Search Console asetuksissa, jotta hakumittarit sisällytetään raporttiin.",
    "report.plan.title": "Ensi kuun suunnitelma ({count})",
    "report.plan.empty":
      "Mitään ei ole vielä suunniteltu — avaa Suunnitelma-sivu valmistellaksesi ensi kuuta.",
    "report.footer":
      "Milo Growth. Perustuu tallennettuihin julkaisutuloksiin. Raportti ei tarkista uudelleen, ovatko sivut tällä hetkellä verkossa.",
    "report.footer.agency":
      "{agency}. Perustuu tallennettuihin julkaisutuloksiin. Raportti ei tarkista uudelleen, ovatko sivut tällä hetkellä verkossa.",
    "gsc.integrity.disclaimer":
      "Tallennettu lähde ja sivustokokonaisuus ovat ilmoitettuja tietoja, eivät riippumattomasti varmennettuja. — tarkoittaa, ettei tietoa ole saatavilla, ei nollaa. Taulukoista voi puuttua liikennettä. Nämä päivämäärät ovat erillisiä raporttikuukaudesta ja julkaisupäivästä. Hakuhavainnot eivät osoita syy-yhteyttä tai konversioita.",
    "gsc.integrity.legacy":
      "Vanha tuonti: alkuperäiset tiedot säilytetty. Numeerista perustaa ei voida palauttaa luotettavasti; esikatsele uusi vienti käyttääksesi näitä mittareita.",
    "gsc.integrity.aggregate":
      "Ilmoitettu API:n sivustokokonaisuuden kooste. Haku- ja sivutaulukot ovat erillisiä otoksia ensimmäisistä riveistä, eikä niitä lasketa yhteen. Verkkohaku, lopulliset tiedot, Tyynenmeren aikavyöhykkeen kalenteripäivät.",
    "gsc.integrity.rows":
      "Vain tämän CSV-taulukon välisumma. Se ei ole sivustokokonaisuuden täydellinen kokonaismäärä; hakujen anonymisointi, suodattimet ja puuttuvat rivit voivat vaikuttaa kattavuuteen.",
    "gsc.integrity.unknown":
      "Kooste ei ole saatavilla. Päällekkäisistä tai epäselvistä riveistä ei voida määrittää kokonaismäärää.",
  },
  et: {
    "report.title": "Igakuine tulemuste aruanne",
    "report.published.title": "Salvestatud avaldamised ({count})",
    "report.published.empty": "Selle kuu kohta pole avaldamisi salvestatud.",
    "report.stat.drafted": "Kirjutatud mustandid",
    "report.stat.scheduled": "Ajastatud",
    "report.stat.linksLive": "Partnerilingid veebis ✓",
    "report.gsc.title": "Otsingu ülevaade",
    "report.gsc.line": "{clicks} klikki · {impressions} näitamist · keskmine positsioon {position}",
    "report.gsc.empty": "Otsingumõõdikute lisamiseks ühenda seadetes Google Search Console.",
    "report.plan.title": "Järgmise kuu plaan ({count})",
    "report.plan.empty":
      "Midagi pole veel planeeritud — järgmise kuu ettevalmistamiseks ava leht Plaan.",
    "report.footer":
      "Milo Growth. Põhineb salvestatud avaldamistulemustel. See aruanne ei kontrolli uuesti, kas lehed on praegu veebis kättesaadavad.",
    "report.footer.agency":
      "{agency}. Põhineb salvestatud avaldamistulemustel. See aruanne ei kontrolli uuesti, kas lehed on praegu veebis kättesaadavad.",
    "gsc.integrity.disclaimer":
      "Salvestatud allikas ja atribuut on esitatud väited, mitte sõltumatu kinnitus. — tähendab kättesaamatut teavet, mitte nulli. Tabelid võivad osa liiklusest välja jätta. Need kuupäevad on eraldi aruandekuust ja avaldamiskuupäevast. Otsinguvaatlused ei tõenda põhjuslikkust ega konversioone.",
    "gsc.integrity.legacy":
      "Vana import: algandmed on säilitatud. Arvulist alust ei saa usaldusväärselt taastada; nende mõõdikute kasutamiseks vaata uue ekspordi eelvaadet.",
    "gsc.integrity.aggregate":
      "Deklareeritud API atribuudi koondandmed. Päringu- ja lehetabelid on eraldi valimid esimestest ridadest ning neid ei liideta. Veebiotsing, lõplikud andmed, Vaikse ookeani ajavööndi kalendripäevad.",
    "gsc.integrity.rows":
      "Ainult selle CSV-tabeli vahesumma. See ei ole atribuudi täielik kogusumma; päringute anonüümimine, filtrid ja puuduvad read võivad katvust mõjutada.",
    "gsc.integrity.unknown":
      "Koondandmed pole saadaval. Kattuvad või mitmetähenduslikud read ei võimalda kogusummat määrata.",
  },
  lv: {
    "report.title": "Ikmēneša rezultātu pārskats",
    "report.published.title": "Reģistrētās publikācijas ({count})",
    "report.published.empty": "Šajā mēnesī nav reģistrētu publikāciju.",
    "report.stat.drafted": "Uzrakstītie melnraksti",
    "report.stat.scheduled": "Ieplānotie",
    "report.stat.linksLive": "Partneru saites tiešsaistē ✓",
    "report.gsc.title": "Meklēšanas pārskats",
    "report.gsc.line": "{clicks} klikšķi · {impressions} seansi · vidējā pozīcija {position}",
    "report.gsc.empty":
      "Savienojiet Google Search Console iestatījumos, lai iekļautu meklēšanas rādītājus.",
    "report.plan.title": "Nākamā mēneša plāns ({count})",
    "report.plan.empty":
      "Vēl nekas nav ieplānots — atveriet lapu Plāns, lai sagatavotu nākamo mēnesi.",
    "report.footer":
      "Milo Growth. Pamatojoties uz saglabātajiem publicēšanas rezultātiem. Šis pārskats atkārtoti nepārbauda, vai lapas pašlaik ir pieejamas tiešsaistē.",
    "report.footer.agency":
      "{agency}. Pamatojoties uz saglabātajiem publicēšanas rezultātiem. Šis pārskats atkārtoti nepārbauda, vai lapas pašlaik ir pieejamas tiešsaistē.",
    "gsc.integrity.disclaimer":
      "Saglabātais avots un īpašums ir norādīta informācija, nevis neatkarīgs apstiprinājums. — nozīmē, ka dati nav pieejami, nevis nulli. Tabulās var nebūt visas datplūsmas. Šie datumi ir atsevišķi no pārskata mēneša un publicēšanas datuma. Meklēšanas novērojumi nepierāda cēloņsakarību vai reklāmguvumus.",
    "gsc.integrity.legacy":
      "Vecs imports: sākotnējie dati saglabāti. Skaitlisko pamatu nevar droši atjaunot; priekšskatiet jaunu eksportu, lai izmantotu šos rādītājus.",
    "gsc.integrity.aggregate":
      "Deklarēts API īpašuma kopsavilkums. Vaicājumu un lapu tabulas ir atsevišķas pirmo rindu izlases, un tās netiek summētas. Meklēšana tīmeklī, galīgie dati, Klusā okeāna laika joslas kalendārās dienas.",
    "gsc.integrity.rows":
      "Tikai šīs CSV tabulas starpsumma. Tas nav pilns īpašuma kopskaits; vaicājumu anonimizācija, filtri un izlaistās rindas var ietekmēt aptvērumu.",
    "gsc.integrity.unknown":
      "Kopsavilkums nav pieejams. Pārklājošas vai neskaidras rindas neļauj noteikt kopskaitu.",
  },
  lt: {
    "report.title": "Mėnesinė rezultatų ataskaita",
    "report.published.title": "Užregistruotos publikacijos ({count})",
    "report.published.empty": "Šį mėnesį publikacijų neužregistruota.",
    "report.stat.drafted": "Parašyti juodraščiai",
    "report.stat.scheduled": "Suplanuota",
    "report.stat.linksLive": "Partnerių nuorodos internete ✓",
    "report.gsc.title": "Paieškos apžvalga",
    "report.gsc.line":
      "{clicks} paspaudimų · {impressions} parodymų · vidutinė pozicija {position}",
    "report.gsc.empty":
      "Nustatymuose prijunkite Google Search Console, kad įtrauktumėte paieškos rodiklius.",
    "report.plan.title": "Kito mėnesio planas ({count})",
    "report.plan.empty":
      "Dar nieko nesuplanuota — atidarykite puslapį Planas ir pasiruoškite kitam mėnesiui.",
    "report.footer":
      "Milo Growth. Remiantis išsaugotais publikavimo rezultatais. Ši ataskaita iš naujo netikrina, ar puslapiai šiuo metu pasiekiami internete.",
    "report.footer.agency":
      "{agency}. Remiantis išsaugotais publikavimo rezultatais. Ši ataskaita iš naujo netikrina, ar puslapiai šiuo metu pasiekiami internete.",
    "gsc.integrity.disclaimer":
      "Išsaugotas šaltinis ir nuosavybė yra pateikti teiginiai, o ne nepriklausomas patvirtinimas. — reiškia, kad duomenų nėra, o ne nulį. Lentelėse gali trūkti dalies srauto. Šios datos yra atskiros nuo ataskaitos mėnesio ir paskelbimo datos. Paieškos stebėjimai neįrodo priežastinio ryšio ar konversijų.",
    "gsc.integrity.legacy":
      "Senas importas: pradiniai duomenys išsaugoti. Skaitinio pagrindo patikimai atkurti negalima; norėdami naudoti šiuos rodiklius, peržiūrėkite naują eksportą.",
    "gsc.integrity.aggregate":
      "Deklaruota API nuosavybės suvestinė. Užklausų ir puslapių lentelės yra atskiros pirmųjų eilučių imtys ir nėra sudedamos. Žiniatinklio paieška, galutiniai duomenys, Ramiojo vandenyno laiko juostos kalendorinės dienos.",
    "gsc.integrity.rows":
      "Tik šios CSV lentelės tarpinė suma. Tai nėra visa nuosavybės suma; užklausų anonimizavimas, filtrai ir praleistos eilutės gali paveikti aprėptį.",
    "gsc.integrity.unknown":
      "Suvestinė nepasiekiama. Persidengiančios ar neaiškios eilutės neleidžia nustatyti bendros sumos.",
  },
  cs: {
    "report.title": "Měsíční přehled výsledků",
    "report.published.title": "Zaznamenané publikace ({count})",
    "report.published.empty": "Pro tento měsíc nejsou zaznamenány žádné publikace.",
    "report.stat.drafted": "Napsané koncepty",
    "report.stat.scheduled": "Naplánováno",
    "report.stat.linksLive": "Partnerské odkazy online ✓",
    "report.gsc.title": "Přehled vyhledávání",
    "report.gsc.line": "{clicks} kliknutí · {impressions} zobrazení · průměrná pozice {position}",
    "report.gsc.empty":
      "Pro zahrnutí metrik vyhledávání připojte Google Search Console v Nastavení.",
    "report.plan.title": "Plán na příští měsíc ({count})",
    "report.plan.empty":
      "Zatím není nic naplánováno — otevřete stránku Plán a připravte příští měsíc.",
    "report.footer":
      "Milo Growth. Na základě uložených výsledků publikování. Tento přehled znovu nekontroluje, zda jsou stránky nyní online.",
    "report.footer.agency":
      "{agency}. Na základě uložených výsledků publikování. Tento přehled znovu nekontroluje, zda jsou stránky nyní online.",
    "gsc.integrity.disclaimer":
      "Uložený zdroj a služba jsou deklarované údaje, nikoli nezávislé ověření. — znamená nedostupné, nikdy nulu. Tabulky mohou vynechat část návštěvnosti. Tato data jsou oddělena od měsíce přehledu a data publikace. Pozorování vyhledávání neprokazují příčinnou souvislost ani konverze.",
    "gsc.integrity.legacy":
      "Starší import: původní data zachována. Číselný základ nelze spolehlivě obnovit; pro použití těchto metrik zobrazte náhled nového exportu.",
    "gsc.integrity.aggregate":
      "Deklarovaný souhrn služby z API. Tabulky dotazů a stránek jsou samostatné vzorky prvních řádků a nesčítají se. Webové vyhledávání, konečná data, kalendářní dny pacifického časového pásma.",
    "gsc.integrity.rows":
      "Pouze mezisoučet této CSV tabulky. Nejde o úplný součet služby; anonymizace dotazů, filtry a vynechané řádky mohou ovlivnit pokrytí.",
    "gsc.integrity.unknown":
      "Souhrn není dostupný. Překrývající se nebo nejednoznačné řádky neumožňují určit celkovou hodnotu.",
  },
  sk: {
    "report.title": "Mesačný prehľad výsledkov",
    "report.published.title": "Zaznamenané publikácie ({count})",
    "report.published.empty": "Pre tento mesiac nie sú zaznamenané žiadne publikácie.",
    "report.stat.drafted": "Napísané koncepty",
    "report.stat.scheduled": "Naplánované",
    "report.stat.linksLive": "Partnerské odkazy online ✓",
    "report.gsc.title": "Prehľad vyhľadávania",
    "report.gsc.line": "{clicks} kliknutí · {impressions} zobrazení · priemerná pozícia {position}",
    "report.gsc.empty":
      "Na zahrnutie metrík vyhľadávania pripojte Google Search Console v Nastaveniach.",
    "report.plan.title": "Plán na budúci mesiac ({count})",
    "report.plan.empty":
      "Zatiaľ nie je nič naplánované — otvorte stránku Plán a pripravte budúci mesiac.",
    "report.footer":
      "Milo Growth. Na základe uložených výsledkov publikovania. Tento prehľad znovu nekontroluje, či sú stránky aktuálne online.",
    "report.footer.agency":
      "{agency}. Na základe uložených výsledkov publikovania. Tento prehľad znovu nekontroluje, či sú stránky aktuálne online.",
    "gsc.integrity.disclaimer":
      "Uložený zdroj a vlastníctvo sú deklarované údaje, nie nezávislé overenie. — znamená nedostupné, nikdy nulu. Tabuľky môžu vynechať časť návštevnosti. Tieto dátumy sú oddelené od mesiaca prehľadu a dátumu publikovania. Pozorovania vyhľadávania nepreukazujú príčinnú súvislosť ani konverzie.",
    "gsc.integrity.legacy":
      "Starší import: pôvodné údaje zachované. Číselný základ sa nedá spoľahlivo obnoviť; na použitie týchto metrík zobrazte náhľad nového exportu.",
    "gsc.integrity.aggregate":
      "Deklarovaný súhrn vlastníctva z API. Tabuľky dopytov a stránok sú samostatné vzorky prvých riadkov a nesčítavajú sa. Webové vyhľadávanie, konečné údaje, kalendárne dni tichomorského časového pásma.",
    "gsc.integrity.rows":
      "Iba medzisúčet tejto CSV tabuľky. Nejde o úplný súčet vlastníctva; anonymizácia dopytov, filtre a vynechané riadky môžu ovplyvniť pokrytie.",
    "gsc.integrity.unknown":
      "Súhrn nie je dostupný. Prekrývajúce sa alebo nejednoznačné riadky neumožňujú určiť celkovú hodnotu.",
  },
  sl: {
    "report.title": "Mesečno poročilo o rezultatih",
    "report.published.title": "Zabeležene objave ({count})",
    "report.published.empty": "Za ta mesec ni zabeleženih objav.",
    "report.stat.drafted": "Napisani osnutki",
    "report.stat.scheduled": "Načrtovano",
    "report.stat.linksLive": "Partnerske povezave na spletu ✓",
    "report.gsc.title": "Pregled iskanja",
    "report.gsc.line": "{clicks} klikov · {impressions} prikazov · povprečni položaj {position}",
    "report.gsc.empty":
      "Za vključitev meritev iskanja povežite Google Search Console v nastavitvah.",
    "report.plan.title": "Načrt za naslednji mesec ({count})",
    "report.plan.empty":
      "Nič še ni načrtovano — odprite stran Načrt in pripravite naslednji mesec.",
    "report.footer":
      "Milo Growth. Na podlagi shranjenih rezultatov objavljanja. To poročilo ne preverja znova, ali so strani trenutno na spletu.",
    "report.footer.agency":
      "{agency}. Na podlagi shranjenih rezultatov objavljanja. To poročilo ne preverja znova, ali so strani trenutno na spletu.",
    "gsc.integrity.disclaimer":
      "Shranjena vir in lastnost sta navedbi, ne neodvisno preverjena podatka. — pomeni, da podatek ni na voljo, nikoli ničle. Tabele lahko izpustijo del prometa. Ti datumi so ločeni od meseca poročila in datuma objave. Opažanja iskanja ne dokazujejo vzročnosti ali konverzij.",
    "gsc.integrity.legacy":
      "Starejši uvoz: izvirni podatki so ohranjeni. Številčne osnove ni mogoče zanesljivo obnoviti; za uporabo teh meritev si oglejte predogled novega izvoza.",
    "gsc.integrity.aggregate":
      "Deklarirani agregat lastnosti iz API-ja. Tabele poizvedb in strani so ločeni vzorci prvih vrstic in se ne seštevajo. Spletno iskanje, dokončni podatki, koledarski dnevi pacifiškega časovnega pasu.",
    "gsc.integrity.rows":
      "Samo vmesna vsota te tabele CSV. To ni celotna vsota lastnosti; anonimizacija poizvedb, filtri in izpuščene vrstice lahko vplivajo na pokritost.",
    "gsc.integrity.unknown":
      "Agregat ni na voljo. Prekrivajoče se ali dvoumne vrstice ne omogočajo določitve skupne vrednosti.",
  },
  hr: {
    "report.title": "Mjesečno izvješće o rezultatima",
    "report.published.title": "Zabilježene objave ({count})",
    "report.published.empty": "Nema zabilježenih objava za ovaj mjesec.",
    "report.stat.drafted": "Napisani nacrti",
    "report.stat.scheduled": "Zakazano",
    "report.stat.linksLive": "Partnerske poveznice na mreži ✓",
    "report.gsc.title": "Pregled pretraživanja",
    "report.gsc.line":
      "{clicks} klikova · {impressions} pojavljivanja · prosječna pozicija {position}",
    "report.gsc.empty":
      "Povežite Google Search Console u postavkama kako biste uključili mjerne podatke pretraživanja.",
    "report.plan.title": "Plan za sljedeći mjesec ({count})",
    "report.plan.empty":
      "Još ništa nije planirano — otvorite stranicu Plan i pripremite sljedeći mjesec.",
    "report.footer":
      "Milo Growth. Na temelju spremljenih rezultata objavljivanja. Ovo izvješće ne provjerava ponovno jesu li stranice trenutačno dostupne na internetu.",
    "report.footer.agency":
      "{agency}. Na temelju spremljenih rezultata objavljivanja. Ovo izvješće ne provjerava ponovno jesu li stranice trenutačno dostupne na internetu.",
    "gsc.integrity.disclaimer":
      "Spremljeni izvor i entitet su navedeni podaci, a ne neovisna provjera. — znači nedostupno, nikada nulu. Tablice mogu izostaviti dio prometa. Ovi datumi odvojeni su od mjeseca izvješća i datuma objave. Opažanja pretraživanja ne dokazuju uzročnost ni konverzije.",
    "gsc.integrity.legacy":
      "Stariji uvoz: izvorni podaci su sačuvani. Brojčana osnova ne može se pouzdano obnoviti; za korištenje ovih mjernih podataka pregledajte novi izvoz.",
    "gsc.integrity.aggregate":
      "Deklarirani zbirni podaci entiteta iz API-ja. Tablice upita i stranica zasebni su uzorci prvih redaka i ne zbrajaju se. Web-pretraživanje, konačni podaci, kalendarski dani pacifičke vremenske zone.",
    "gsc.integrity.rows":
      "Samo podzbroj ove CSV tablice. To nije potpuni zbroj entiteta; anonimizacija upita, filtri i izostavljeni redci mogu utjecati na pokrivenost.",
    "gsc.integrity.unknown":
      "Zbirni podaci nisu dostupni. Preklapajući ili dvosmisleni redci ne omogućuju utvrđivanje ukupne vrijednosti.",
  },
  ro: {
    "report.title": "Raport lunar de rezultate",
    "report.published.title": "Publicări înregistrate ({count})",
    "report.published.empty": "Nu există publicări înregistrate pentru această lună.",
    "report.stat.drafted": "Ciorne redactate",
    "report.stat.scheduled": "Programate",
    "report.stat.linksLive": "Linkuri de parteneri online ✓",
    "report.gsc.title": "Rezumatul căutărilor",
    "report.gsc.line": "{clicks} clicuri · {impressions} afișări · poziție medie {position}",
    "report.gsc.empty":
      "Conectează Google Search Console în Setări pentru a include valorile căutărilor.",
    "report.plan.title": "Planul lunii viitoare ({count})",
    "report.plan.empty":
      "Nu este încă nimic planificat — deschide pagina Plan pentru a pregăti luna viitoare.",
    "report.footer":
      "Milo Growth. Pe baza rezultatelor de publicare salvate. Acest raport nu verifică din nou dacă paginile sunt disponibile online în prezent.",
    "report.footer.agency":
      "{agency}. Pe baza rezultatelor de publicare salvate. Acest raport nu verifică din nou dacă paginile sunt disponibile online în prezent.",
    "gsc.integrity.disclaimer":
      "Sursa și proprietatea salvate sunt declarații, nu verificări independente. — înseamnă indisponibil, niciodată zero. Tabelele pot omite trafic. Aceste date sunt separate de luna raportului și de data publicării. Observațiile căutărilor nu demonstrează cauzalitate sau conversii.",
    "gsc.integrity.legacy":
      "Import vechi: datele originale sunt păstrate. Baza numerică nu poate fi recuperată în mod fiabil; previzualizează un export nou pentru a folosi aceste valori.",
    "gsc.integrity.aggregate":
      "Agregat de proprietate declarat ca provenind din API. Tabelele de interogări și pagini sunt eșantioane separate ale primelor rânduri și nu se adună. Căutare web, date finale, zile calendaristice ale fusului orar Pacific.",
    "gsc.integrity.rows":
      "Doar subtotalul acestui tabel CSV. Nu este totalul complet al proprietății; anonimizarea interogărilor, filtrele și rândurile omise pot afecta acoperirea.",
    "gsc.integrity.unknown":
      "Agregatul nu este disponibil. Rândurile suprapuse sau ambigue nu permit stabilirea unui total.",
  },
  bg: {
    "report.title": "Месечен отчет за резултатите",
    "report.published.title": "Записани публикации ({count})",
    "report.published.empty": "Няма записани публикации за този месец.",
    "report.stat.drafted": "Написани чернови",
    "report.stat.scheduled": "Насрочени",
    "report.stat.linksLive": "Партньорски връзки онлайн ✓",
    "report.gsc.title": "Преглед на търсенето",
    "report.gsc.line": "{clicks} кликвания · {impressions} импресии · средна позиция {position}",
    "report.gsc.empty":
      "Свържете Google Search Console в Настройки, за да включите показателите за търсене.",
    "report.plan.title": "План за следващия месец ({count})",
    "report.plan.empty":
      "Все още нищо не е планирано — отворете страницата План, за да подготвите следващия месец.",
    "report.footer":
      "Milo Growth. Въз основа на запазените резултати от публикуването. Този отчет не проверява повторно дали страниците са достъпни онлайн в момента.",
    "report.footer.agency":
      "{agency}. Въз основа на запазените резултати от публикуването. Този отчет не проверява повторно дали страниците са достъпни онлайн в момента.",
    "gsc.integrity.disclaimer":
      "Запазените източник и собственост са декларирани данни, а не независима проверка. — означава недостъпно, никога нула. Таблиците може да пропускат трафик. Тези дати са отделни от месеца на отчета и датата на публикуване. Наблюденията върху търсенето не доказват причинност или реализации.",
    "gsc.integrity.legacy":
      "Стар импорт: оригиналните данни са запазени. Числовата основа не може да бъде възстановена надеждно; прегледайте нов експорт, за да използвате тези показатели.",
    "gsc.integrity.aggregate":
      "Деклариран обобщен резултат за собствеността от API. Таблиците със заявки и страници са отделни извадки от първите редове и не се събират. Уеб търсене, окончателни данни, календарни дни в тихоокеанската часова зона.",
    "gsc.integrity.rows":
      "Само междинният сбор на тази CSV таблица. Това не е пълният сбор за собствеността; анонимизирането на заявки, филтрите и пропуснатите редове може да повлияят на обхвата.",
    "gsc.integrity.unknown":
      "Обобщен резултат не е наличен. Припокриващи се или неясни редове не позволяват определяне на общ сбор.",
  },
  el: {
    "report.title": "Μηνιαία αναφορά αποτελεσμάτων",
    "report.published.title": "Καταγεγραμμένες δημοσιεύσεις ({count})",
    "report.published.empty": "Δεν έχουν καταγραφεί δημοσιεύσεις για αυτόν τον μήνα.",
    "report.stat.drafted": "Πρόχειρα που γράφτηκαν",
    "report.stat.scheduled": "Προγραμματισμένα",
    "report.stat.linksLive": "Σύνδεσμοι συνεργατών online ✓",
    "report.gsc.title": "Σύνοψη αναζήτησης",
    "report.gsc.line": "{clicks} κλικ · {impressions} εμφανίσεις · μέση θέση {position}",
    "report.gsc.empty":
      "Συνδέστε το Google Search Console στις Ρυθμίσεις για να συμπεριλάβετε μετρήσεις αναζήτησης.",
    "report.plan.title": "Πλάνο επόμενου μήνα ({count})",
    "report.plan.empty":
      "Δεν έχει προγραμματιστεί ακόμη τίποτα — ανοίξτε τη σελίδα Πλάνο για να προετοιμάσετε τον επόμενο μήνα.",
    "report.footer":
      "Milo Growth. Με βάση τα αποθηκευμένα αποτελέσματα δημοσίευσης. Η αναφορά δεν ελέγχει ξανά αν οι σελίδες είναι τώρα διαθέσιμες στο διαδίκτυο.",
    "report.footer.agency":
      "{agency}. Με βάση τα αποθηκευμένα αποτελέσματα δημοσίευσης. Η αναφορά δεν ελέγχει ξανά αν οι σελίδες είναι τώρα διαθέσιμες στο διαδίκτυο.",
    "gsc.integrity.disclaimer":
      "Η αποθηκευμένη πηγή και ιδιοκτησία είναι δηλώσεις, όχι ανεξάρτητη επαλήθευση. — σημαίνει μη διαθέσιμο, ποτέ μηδέν. Οι πίνακες μπορεί να παραλείπουν επισκεψιμότητα. Αυτές οι ημερομηνίες είναι χωριστές από τον μήνα αναφοράς και την ημερομηνία δημοσίευσης. Οι παρατηρήσεις αναζήτησης δεν αποδεικνύουν αιτιότητα ή μετατροπές.",
    "gsc.integrity.legacy":
      "Παλαιά εισαγωγή: τα αρχικά δεδομένα διατηρούνται. Η αριθμητική βάση δεν μπορεί να ανακτηθεί αξιόπιστα· προεπισκοπήστε μια νέα εξαγωγή για να χρησιμοποιήσετε αυτές τις μετρήσεις.",
    "gsc.integrity.aggregate":
      "Δηλωμένο συγκεντρωτικό αποτέλεσμα ιδιοκτησίας από API. Οι πίνακες ερωτημάτων και σελίδων είναι χωριστά δείγματα των πρώτων γραμμών και δεν αθροίζονται. Αναζήτηση ιστού, οριστικά δεδομένα, ημερολογιακές ημέρες ζώνης ώρας Ειρηνικού.",
    "gsc.integrity.rows":
      "Μόνο το υποσύνολο αυτού του πίνακα CSV. Δεν είναι το πλήρες σύνολο της ιδιοκτησίας· η ανωνυμοποίηση ερωτημάτων, τα φίλτρα και οι παραλειπόμενες γραμμές μπορεί να επηρεάζουν την κάλυψη.",
    "gsc.integrity.unknown":
      "Δεν υπάρχει διαθέσιμο συγκεντρωτικό αποτέλεσμα. Οι επικαλυπτόμενες ή αμφίσημες γραμμές δεν επιτρέπουν τον υπολογισμό συνόλου.",
  },
  hu: {
    "report.title": "Havi eredményjelentés",
    "report.published.title": "Rögzített közzétételek ({count})",
    "report.published.empty": "Erre a hónapra nincs rögzített közzététel.",
    "report.stat.drafted": "Elkészült piszkozatok",
    "report.stat.scheduled": "Ütemezett",
    "report.stat.linksLive": "Élő partnerlinkek ✓",
    "report.gsc.title": "Keresési áttekintés",
    "report.gsc.line": "{clicks} kattintás · {impressions} megjelenés · átlagos pozíció {position}",
    "report.gsc.empty":
      "A keresési mutatókhoz csatlakoztassa a Google Search Console-t a Beállításokban.",
    "report.plan.title": "Következő havi terv ({count})",
    "report.plan.empty":
      "Még nincs semmi betervezve — nyissa meg a Terv oldalt a következő hónap előkészítéséhez.",
    "report.footer":
      "Milo Growth. A mentett közzétételi eredmények alapján. Ez a jelentés nem ellenőrzi újra, hogy az oldalak jelenleg elérhetők-e.",
    "report.footer.agency":
      "{agency}. A mentett közzétételi eredmények alapján. Ez a jelentés nem ellenőrzi újra, hogy az oldalak jelenleg elérhetők-e.",
    "gsc.integrity.disclaimer":
      "A mentett forrás és tulajdon megadott adat, nem független ellenőrzés. — jelentése: nem elérhető, soha nem nulla. A táblázatokból forgalom maradhat ki. Ezek a dátumok elkülönülnek a jelentés hónapjától és a közzététel dátumától. A keresési megfigyelések nem bizonyítanak okozati összefüggést vagy konverziókat.",
    "gsc.integrity.legacy":
      "Régi import: az eredeti adatok megmaradtak. A számszerű alap nem állítható helyre megbízhatóan; e mutatók használatához tekintsen meg egy új exportot.",
    "gsc.integrity.aggregate":
      "API-ból származóként megadott tulajdonösszesítés. A lekérdezés- és oldaltáblák a legfelső sorok külön mintái, és nem adódnak össze. Webes keresés, végleges adatok, csendes-óceáni időzóna szerinti naptári napok.",
    "gsc.integrity.rows":
      "Csak ennek a CSV-táblának a részösszege. Nem a tulajdon teljes összege; a lekérdezések anonimizálása, a szűrők és a kihagyott sorok befolyásolhatják a lefedettséget.",
    "gsc.integrity.unknown":
      "Az összesítés nem érhető el. Az átfedő vagy kétértelmű sorokból nem állapítható meg teljes összeg.",
  },
  ga: {
    "report.title": "Tuairisc mhíosúil ar thorthaí",
    "report.published.title": "Foilseacháin taifeadta ({count})",
    "report.published.empty": "Níl aon fhoilseacháin taifeadta don mhí seo.",
    "report.stat.drafted": "Dréachtaí scríofa",
    "report.stat.scheduled": "Sceidealaithe",
    "report.stat.linksLive": "Naisc chomhpháirtithe beo ✓",
    "report.gsc.title": "Achoimre cuardaigh",
    "report.gsc.line": "{clicks} clic · {impressions} imprisean · meánsuíomh {position}",
    "report.gsc.empty":
      "Ceangail Google Search Console sna Socruithe chun méadrachtaí cuardaigh a chur san áireamh.",
    "report.plan.title": "Plean na míosa seo chugainn ({count})",
    "report.plan.empty":
      "Níl aon rud pleanáilte fós — oscail an leathanach Plean chun an mhí seo chugainn a ullmhú.",
    "report.footer":
      "Milo Growth. Bunaithe ar thorthaí foilsitheoireachta sábháilte. Ní sheiceálann an tuarascáil seo arís an bhfuil na leathanaigh ar líne faoi láthair.",
    "report.footer.agency":
      "{agency}. Bunaithe ar thorthaí foilsitheoireachta sábháilte. Ní sheiceálann an tuarascáil seo arís an bhfuil na leathanaigh ar líne faoi láthair.",
    "gsc.integrity.disclaimer":
      "Is dearbhuithe iad an fhoinse agus an t-airí sábháilte, ní fíorú neamhspleách. Ciallaíonn — nach bhfuil an fhaisnéis ar fáil, ní nialas riamh. D’fhéadfadh trácht a bheith ar lár sna táblaí. Tá na dátaí seo ar leithligh ó mhí na tuairisce agus ón dáta foilsithe. Ní chruthaíonn breathnuithe cuardaigh cúisíocht ná tiontuithe.",
    "gsc.integrity.legacy":
      "Sean-iompórtáil: coinníodh na sonraí bunaidh. Ní féidir an bonn uimhriúil a aisghabháil go hiontaofa; réamhamharc ar easpórtáil nua chun na méadrachtaí seo a úsáid.",
    "gsc.integrity.aggregate":
      "Comhiomlán airí dearbhaithe ón API. Is samplaí ar leith de na chéad rónna iad na táblaí fiosruithe agus leathanaigh agus ní chuirtear le chéile iad. Cuardach gréasáin, sonraí críochnaithe, laethanta féilire chrios ama an Aigéin Chiúin.",
    "gsc.integrity.rows":
      "Fo-iomlán an tábla CSV seo amháin. Ní hé iomlán iomlán an airí é; d’fhéadfadh anaithnidiú fiosruithe, scagairí agus rónna ar lár dul i bhfeidhm ar an gclúdach.",
    "gsc.integrity.unknown":
      "Níl comhiomlán ar fáil. Ní féidir iomlán a bhunú ó rónna forluiteacha nó débhríocha.",
  },
  mt: {
    "report.title": "Rapport ta’ kull xahar dwar ir-riżultati",
    "report.published.title": "Pubblikazzjonijiet irreġistrati ({count})",
    "report.published.empty": "M’hemmx pubblikazzjonijiet irreġistrati għal dan ix-xahar.",
    "report.stat.drafted": "Abbozzi miktuba",
    "report.stat.scheduled": "Skedati",
    "report.stat.linksLive": "Links tal-imsieħba online ✓",
    "report.gsc.title": "Ħarsa ġenerali lejn it-tfittxija",
    "report.gsc.line":
      "{clicks} klikks · {impressions} impressjonijiet · pożizzjoni medja {position}",
    "report.gsc.empty":
      "Qabbad Google Search Console fis-Settings biex tinkludi l-metriċi tat-tfittxija.",
    "report.plan.title": "Il-pjan tax-xahar id-dieħel ({count})",
    "report.plan.empty":
      "Għadu mhu ppjanat xejn — iftaħ il-paġna Pjan biex tipprepara x-xahar id-dieħel.",
    "report.footer":
      "Milo Growth. Ibbażat fuq ir-riżultati tal-pubblikazzjoni ssejvjati. Dan ir-rapport ma jerġax jiċċekkja jekk il-paġni humiex attwalment online.",
    "report.footer.agency":
      "{agency}. Ibbażat fuq ir-riżultati tal-pubblikazzjoni ssejvjati. Dan ir-rapport ma jerġax jiċċekkja jekk il-paġni humiex attwalment online.",
    "gsc.integrity.disclaimer":
      "Is-sors u l-proprjetà ssejvjati huma dikjarazzjonijiet, mhux verifika indipendenti. — tfisser mhux disponibbli, qatt żero. It-tabelli jistgħu jħallu barra traffiku. Dawn id-dati huma separati mix-xahar tar-rapport u mid-data tal-pubblikazzjoni. L-osservazzjonijiet tat-tfittxija ma jippruvawx kawżalità jew konverżjonijiet.",
    "gsc.integrity.legacy":
      "Importazzjoni antika: id-data oriġinali nżammet. Il-bażi numerika ma tistax tiġi rkuprata b’mod affidabbli; ara minn qabel esportazzjoni ġdida biex tuża dawn il-metriċi.",
    "gsc.integrity.aggregate":
      "Aggregat tal-proprjetà ddikjarat bħala li ġej mill-API. It-tabelli tal-mistoqsijiet u tal-paġni huma kampjuni separati tal-ewwel ringieli u ma jingħaddux flimkien. Tfittxija fuq il-web, data finalizzata, jiem kalendarji taż-żona tal-ħin tal-Paċifiku.",
    "gsc.integrity.rows":
      "Is-subtotal ta’ din it-tabella CSV biss. Mhuwiex it-total sħiħ tal-proprjetà; l-anonimizzazzjoni tal-mistoqsijiet, il-filtri u r-ringieli mħollija barra jistgħu jaffettwaw il-kopertura.",
    "gsc.integrity.unknown":
      "L-aggregat mhux disponibbli. Ringieli li jikkoinċidu jew huma ambigwi ma jistgħux jistabbilixxu total.",
  },
};
