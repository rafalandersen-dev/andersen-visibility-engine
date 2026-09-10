const en = {
  history: "Delivery reservations and receipts",
  refresh: "Refresh delivery history",
  help: "Server-owned records protect the daily limit and recipient cooldown. Provider acceptance does not verify inbox delivery, opens, replies or link placement. Interrupted and uncertain attempts remain held; refreshing never sends or retries an email. Up to 3,000 retained attempts per account; draft deletion does not clear a reservation. Follow-ups always require separate review.",
  unavailable: "Delivery history is unavailable. Sending is held until it can be read.",
  empty:
    "No service-owned delivery records for this project. Older workspace labels are unverified.",
  records: "Inspect retained attempts",
  reserved: "Reserved — held, do not retry",
  dispatching: "Dispatch started — outcome not confirmed",
  accepted: "Provider accepted",
  unknown: "Unknown outcome — do not retry",
  blocked: "Blocked before provider dispatch",
  initial: "Initial message",
  followup: "Follow-up",
  reservedAt: "Reserved",
  updatedAt: "Last receipt update",
  version: "Reviewed message fingerprint",
  receipt: "Provider receipt",
  legacy:
    "Draft statuses and older saved history are editable workflow labels. Only the service-owned delivery history establishes a recorded attempt.",
  reviewHelp:
    "Review this exact saved recipient and message. Confirmation authorizes only this step. Any saved changes invalidate this review. Follow-ups are never automatic.",
  reviewError:
    "The saved message changed or is not eligible. Refresh delivery history, save your edits and open a fresh review.",
  held: "The delivery outcome is uncertain or the step is already reserved. Refresh delivery history. Do not retry or duplicate this message.",
  recover: "Restore accepted receipt to draft",
  recovered: "The accepted receipt has been restored to this unchanged draft.",
  recoveryError:
    "The draft changed or the receipt cannot be restored. The server-owned receipt remains in delivery history.",
};
const pl = [
  "Historia rezerwacji i potwierdzeń wysyłki",
  "Odśwież historię wysyłki",
  "Rekordy serwera chronią limit dzienny i odstęp między kontaktami. Akceptacja dostawcy nie potwierdza dostarczenia, otwarcia, odpowiedzi ani publikacji linku. Przerwane i niepewne próby pozostają wstrzymane; odświeżenie nie wysyła ani nie ponawia wiadomości. Do 3000 prób na konto; usunięcie szkicu nie usuwa rezerwacji. Każde przypomnienie wymaga osobnej kontroli.",
  "Historia wysyłki jest niedostępna. Wysyłanie jest wstrzymane do czasu jej odczytania.",
  "Brak rekordów wysyłki serwera dla tego projektu. Starsze etykiety obszaru roboczego są niezweryfikowane.",
  "Sprawdź zachowane próby",
  "Zarezerwowano — wstrzymane, nie ponawiaj",
  "Wysyłka rozpoczęta — wynik niepotwierdzony",
  "Dostawca zaakceptował",
  "Nieznany wynik — nie ponawiaj",
  "Zablokowano przed wysyłką do dostawcy",
  "Pierwsza wiadomość",
  "Przypomnienie",
  "Rezerwacja",
  "Ostatnia aktualizacja potwierdzenia",
  "Odcisk sprawdzonej wiadomości",
  "Potwierdzenie dostawcy",
  "Statusy szkiców i starsza historia to edytowalne etykiety. Tylko historia serwera potwierdza zarejestrowaną próbę.",
  "Sprawdź tego zapisanego odbiorcę i tę wiadomość. Potwierdzenie dotyczy tylko tego kroku. Zapisane zmiany unieważniają kontrolę. Przypomnienia nigdy nie są automatyczne.",
  "Zapisana wiadomość zmieniła się lub nie kwalifikuje się do wysyłki. Odśwież historię, zapisz zmiany i otwórz nową kontrolę.",
  "Wynik jest niepewny lub krok jest już zarezerwowany. Odśwież historię. Nie ponawiaj ani nie duplikuj wiadomości.",
  "Przywróć potwierdzenie akceptacji do szkicu",
  "Potwierdzenie akceptacji przywrócono do niezmienionego szkicu.",
  "Szkic zmienił się lub nie można przywrócić potwierdzenia. Rekord serwera pozostaje w historii.",
];
const sv = [
  "Leveransreservationer och kvitton",
  "Uppdatera leveranshistorik",
  "Serverns poster skyddar dygnsgränsen och kontaktintervallet. Leverantörens godkännande bekräftar inte leverans, öppning, svar eller länkplacering. Avbrutna och osäkra försök hålls kvar; uppdatering skickar aldrig eller försöker igen. Högst 3 000 sparade försök per konto; borttagning av utkast raderar inte reservationer. Uppföljningar kräver alltid separat granskning.",
  "Leveranshistoriken är otillgänglig. Sändning hålls tills den kan läsas.",
  "Inga leveransposter från servern för projektet. Äldre arbetsyteetiketter är obekräftade.",
  "Granska sparade försök",
  "Reserverad — hålls, försök inte igen",
  "Sändning påbörjad — resultat ej bekräftat",
  "Leverantören har accepterat",
  "Okänt resultat — försök inte igen",
  "Blockerad före sändning till leverantören",
  "Första meddelandet",
  "Uppföljning",
  "Reserverad",
  "Senaste kvittouppdatering",
  "Granskat meddelandes fingeravtryck",
  "Leverantörskvitto",
  "Utkaststatus och äldre historik är redigerbara arbetsflödesetiketter. Endast serverns leveranshistorik visar registrerade försök.",
  "Granska exakt denna sparade mottagare och detta meddelande. Bekräftelsen gäller bara detta steg. Sparade ändringar gör granskningen ogiltig. Uppföljningar sker aldrig automatiskt.",
  "Det sparade meddelandet har ändrats eller får inte skickas. Uppdatera historiken, spara ändringarna och öppna en ny granskning.",
  "Resultatet är osäkert eller steget är redan reserverat. Uppdatera historiken. Försök inte igen och duplicera inte meddelandet.",
  "Återställ accepterat kvitto till utkast",
  "Kvittot har återställts till detta oförändrade utkast.",
  "Utkastet ändrades eller kvittot kan inte återställas. Serverns kvitto finns kvar i historiken.",
];
const da = [
  "Leveringsreservationer og kvitteringer",
  "Opdater leveringshistorik",
  "Serverens poster beskytter døgnloftet og kontaktintervallet. Udbyderens accept bekræfter ikke levering, åbning, svar eller linkplacering. Afbrudte og usikre forsøg forbliver tilbageholdt; opdatering sender aldrig eller prøver igen. Højst 3.000 gemte forsøg pr. konto; sletning af kladder fjerner ikke reservationer. Opfølgninger kræver altid særskilt gennemgang.",
  "Leveringshistorikken er utilgængelig. Afsendelse er tilbageholdt, indtil den kan læses.",
  "Ingen leveringsposter fra serveren for projektet. Ældre arbejdsområdeetiketter er ubekræftede.",
  "Gennemgå gemte forsøg",
  "Reserveret — tilbageholdt, prøv ikke igen",
  "Afsendelse startet — resultat ikke bekræftet",
  "Udbyderen har accepteret",
  "Ukendt resultat — prøv ikke igen",
  "Blokeret før afsendelse til udbyderen",
  "Første besked",
  "Opfølgning",
  "Reserveret",
  "Seneste kvitteringsopdatering",
  "Fingeraftryk for gennemgået besked",
  "Udbyderkvittering",
  "Kladdestatus og ældre historik er redigerbare arbejdsgangsetiketter. Kun serverens leveringshistorik viser registrerede forsøg.",
  "Gennemgå præcis denne gemte modtager og besked. Bekræftelsen gælder kun dette trin. Gemte ændringer gør gennemgangen ugyldig. Opfølgninger er aldrig automatiske.",
  "Den gemte besked er ændret eller kan ikke sendes. Opdater historikken, gem ændringerne og åbn en ny gennemgang.",
  "Resultatet er usikkert, eller trinnet er allerede reserveret. Opdater historikken. Prøv ikke igen, og dupliker ikke beskeden.",
  "Gendan accepteret kvittering til kladde",
  "Kvitteringen er gendannet til denne uændrede kladde.",
  "Kladden blev ændret, eller kvitteringen kan ikke gendannes. Serverens kvittering findes stadig i historikken.",
];
export const outreachIntegrityCopy: Record<string, Record<string, string>> = {};
for (const [locale, values] of Object.entries({ en: Object.values(en), pl, sv, da })) {
  if (values.length !== Object.keys(en).length) throw new Error("outreach_translation_count");
  outreachIntegrityCopy[locale] = Object.fromEntries(
    Object.keys(en).map((key, i) => [`outreach.integrity.${key}`, values[i]]),
  );
}

const recoveryCopy: Record<string, string[]> = {
  en: [
    "Cancel before dispatch",
    "Cancelled before dispatch. This step stays blocked; no email was sent by this reservation.",
    "Cancellation was not confirmed. Refresh history; dispatch may already have started. Unknown or started attempts cannot be cancelled or retried.",
  ],
  pl: [
    "Anuluj przed wysyłką",
    "Anulowano przed wysyłką. Ten krok pozostaje zablokowany; ta rezerwacja nie wysłała wiadomości.",
    "Nie potwierdzono anulowania. Odśwież historię; wysyłka mogła się rozpocząć. Nie można anulować ani ponawiać rozpoczętych lub niepewnych prób.",
  ],
  sv: [
    "Avbryt före sändning",
    "Avbruten före sändning. Steget förblir blockerat; denna reservation skickade inget mejl.",
    "Avbrottet är inte bekräftat. Uppdatera historiken; sändningen kan redan ha börjat. Okända eller påbörjade försök kan inte avbrytas eller upprepas.",
  ],
  da: [
    "Annuller før afsendelse",
    "Annulleret før afsendelse. Trinnet forbliver blokeret; denne reservation sendte ingen mail.",
    "Annulleringen er ikke bekræftet. Opdater historikken; afsendelsen kan være startet. Ukendte eller startede forsøg kan ikke annulleres eller gentages.",
  ],
};
for (const [locale, values] of Object.entries(recoveryCopy))
  for (const [i, key] of ["cancel", "cancelled", "cancelError"].entries())
    outreachIntegrityCopy[locale][`outreach.integrity.${key}`] = values[i];
