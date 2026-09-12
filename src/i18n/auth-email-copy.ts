import type { EmailLanguage } from "@/lib/email-languages";

export interface AuthEmailCopy {
  signupTitle: string;
  signupBody: string;
  signupIgnore: string;
  resetTitle: string;
  resetBody: string;
  resetIgnore: string;
}

/** Auth-request email copy; independent of runtime UI language registration. */
export const authEmailCopy: Record<EmailLanguage, AuthEmailCopy> = {
  en: {
    signupTitle: "Confirm your email",
    signupBody: "Confirm your email address for {siteName} using the button below.",
    signupIgnore: "If you did not create this account, you can ignore this email.",
    resetTitle: "Reset your password",
    resetBody:
      "We received a password reset request for {siteName}. Use the button below to choose a new password.",
    resetIgnore:
      "If you did not request a reset, ignore this email. Your password will not change unless you complete the reset.",
  },
  pl: {
    signupTitle: "Potwierdź adres e-mail",
    signupBody: "Potwierdź swój adres e-mail w {siteName}, korzystając z przycisku poniżej.",
    signupIgnore: "Jeśli to nie Ty utworzyłeś konto, możesz zignorować tę wiadomość.",
    resetTitle: "Zresetuj hasło",
    resetBody:
      "Otrzymaliśmy prośbę o zresetowanie hasła w {siteName}. Użyj przycisku poniżej, aby ustawić nowe hasło.",
    resetIgnore:
      "Jeśli nie proszono o reset, zignoruj tę wiadomość. Hasło nie zmieni się, dopóki nie ukończysz resetowania.",
  },
  sv: {
    signupTitle: "Bekräfta din e-postadress",
    signupBody: "Bekräfta din e-postadress för {siteName} med knappen nedan.",
    signupIgnore: "Om du inte skapade det här kontot kan du ignorera meddelandet.",
    resetTitle: "Återställ ditt lösenord",
    resetBody:
      "Vi har fått en begäran om att återställa ditt lösenord för {siteName}. Använd knappen nedan för att välja ett nytt lösenord.",
    resetIgnore:
      "Om du inte begärde en återställning kan du ignorera meddelandet. Ditt lösenord ändras inte förrän du slutför återställningen.",
  },
  da: {
    signupTitle: "Bekræft din e-mailadresse",
    signupBody: "Bekræft din e-mailadresse til {siteName} med knappen nedenfor.",
    signupIgnore: "Hvis du ikke oprettede denne konto, kan du ignorere e-mailen.",
    resetTitle: "Nulstil din adgangskode",
    resetBody:
      "Vi har modtaget en anmodning om at nulstille din adgangskode til {siteName}. Brug knappen nedenfor til at vælge en ny adgangskode.",
    resetIgnore:
      "Hvis du ikke bad om en nulstilling, kan du ignorere e-mailen. Din adgangskode ændres ikke, før du fuldfører nulstillingen.",
  },
  de: {
    signupTitle: "E-Mail-Adresse bestätigen",
    signupBody: "Bestätigen Sie Ihre E-Mail-Adresse für {siteName} über die Schaltfläche unten.",
    signupIgnore: "Wenn Sie dieses Konto nicht erstellt haben, können Sie diese E-Mail ignorieren.",
    resetTitle: "Passwort zurücksetzen",
    resetBody:
      "Wir haben eine Anfrage zum Zurücksetzen Ihres Passworts für {siteName} erhalten. Wählen Sie über die Schaltfläche unten ein neues Passwort.",
    resetIgnore:
      "Wenn Sie keine Zurücksetzung angefordert haben, ignorieren Sie diese E-Mail. Ihr Passwort ändert sich erst, wenn Sie die Zurücksetzung abschließen.",
  },
  fr: {
    signupTitle: "Confirmez votre adresse e-mail",
    signupBody: "Confirmez votre adresse e-mail pour {siteName} à l’aide du bouton ci-dessous.",
    signupIgnore: "Si vous n’avez pas créé ce compte, vous pouvez ignorer cet e-mail.",
    resetTitle: "Réinitialisez votre mot de passe",
    resetBody:
      "Nous avons reçu une demande de réinitialisation de votre mot de passe pour {siteName}. Utilisez le bouton ci-dessous pour choisir un nouveau mot de passe.",
    resetIgnore:
      "Si vous n’avez pas demandé cette réinitialisation, ignorez cet e-mail. Votre mot de passe ne changera pas tant que vous n’aurez pas terminé la réinitialisation.",
  },
  es: {
    signupTitle: "Confirma tu correo electrónico",
    signupBody:
      "Confirma tu dirección de correo electrónico para {siteName} con el botón de abajo.",
    signupIgnore: "Si no has creado esta cuenta, puedes ignorar este correo.",
    resetTitle: "Restablece tu contraseña",
    resetBody:
      "Hemos recibido una solicitud para restablecer tu contraseña de {siteName}. Usa el botón de abajo para elegir una nueva contraseña.",
    resetIgnore:
      "Si no has solicitado el restablecimiento, ignora este correo. Tu contraseña no cambiará hasta que completes el proceso.",
  },
  it: {
    signupTitle: "Conferma il tuo indirizzo email",
    signupBody: "Conferma il tuo indirizzo email per {siteName} con il pulsante qui sotto.",
    signupIgnore: "Se non hai creato questo account, puoi ignorare questa email.",
    resetTitle: "Reimposta la password",
    resetBody:
      "Abbiamo ricevuto una richiesta di reimpostazione della password per {siteName}. Usa il pulsante qui sotto per scegliere una nuova password.",
    resetIgnore:
      "Se non hai richiesto la reimpostazione, ignora questa email. La password non cambierà finché non completerai la procedura.",
  },
  pt: {
    signupTitle: "Confirme o seu endereço de e-mail",
    signupBody: "Confirme o seu endereço de e-mail para {siteName} através do botão abaixo.",
    signupIgnore: "Se não criou esta conta, pode ignorar este e-mail.",
    resetTitle: "Redefina a sua palavra-passe",
    resetBody:
      "Recebemos um pedido para redefinir a sua palavra-passe de {siteName}. Utilize o botão abaixo para escolher uma nova palavra-passe.",
    resetIgnore:
      "Se não pediu a redefinição, ignore este e-mail. A sua palavra-passe não será alterada enquanto não concluir o processo.",
  },
  nl: {
    signupTitle: "Bevestig je e-mailadres",
    signupBody: "Bevestig je e-mailadres voor {siteName} met de onderstaande knop.",
    signupIgnore: "Als je dit account niet hebt aangemaakt, kun je deze e-mail negeren.",
    resetTitle: "Stel je wachtwoord opnieuw in",
    resetBody:
      "We hebben een verzoek ontvangen om je wachtwoord voor {siteName} opnieuw in te stellen. Gebruik de onderstaande knop om een nieuw wachtwoord te kiezen.",
    resetIgnore:
      "Als je dit niet hebt aangevraagd, negeer dan deze e-mail. Je wachtwoord verandert pas als je de procedure voltooit.",
  },
  fi: {
    signupTitle: "Vahvista sähköpostiosoitteesi",
    signupBody: "Vahvista sähköpostiosoitteesi palvelussa {siteName} alla olevalla painikkeella.",
    signupIgnore: "Jos et luonut tätä tiliä, voit jättää tämän viestin huomiotta.",
    resetTitle: "Palauta salasanasi",
    resetBody:
      "Saimme pyynnön palauttaa salasanasi palvelussa {siteName}. Valitse uusi salasana alla olevalla painikkeella.",
    resetIgnore:
      "Jos et pyytänyt salasanan palautusta, jätä tämä viesti huomiotta. Salasanasi ei muutu ennen kuin suoritat palautuksen loppuun.",
  },
  et: {
    signupTitle: "Kinnita oma e-posti aadress",
    signupBody: "Kinnita oma e-posti aadress teenuses {siteName}, kasutades allolevat nuppu.",
    signupIgnore: "Kui sa seda kontot ei loonud, võid seda kirja eirata.",
    resetTitle: "Lähtesta oma parool",
    resetBody:
      "Saime taotluse sinu parooli lähtestamiseks teenuses {siteName}. Uue parooli valimiseks kasuta allolevat nuppu.",
    resetIgnore:
      "Kui sa parooli lähtestamist ei taotlenud, eira seda kirja. Sinu parool ei muutu enne lähtestamise lõpuleviimist.",
  },
  lv: {
    signupTitle: "Apstipriniet savu e-pasta adresi",
    signupBody:
      "Apstipriniet savu e-pasta adresi pakalpojumā {siteName}, izmantojot tālāk redzamo pogu.",
    signupIgnore: "Ja neizveidojāt šo kontu, varat ignorēt šo e-pastu.",
    resetTitle: "Atiestatiet savu paroli",
    resetBody:
      "Saņēmām pieprasījumu atiestatīt jūsu paroli pakalpojumā {siteName}. Izmantojiet tālāk redzamo pogu, lai izvēlētos jaunu paroli.",
    resetIgnore:
      "Ja nepieprasījāt paroles atiestatīšanu, ignorējiet šo e-pastu. Parole nemainīsies, kamēr nepabeigsiet atiestatīšanu.",
  },
  lt: {
    signupTitle: "Patvirtinkite el. pašto adresą",
    signupBody:
      "Patvirtinkite savo el. pašto adresą paslaugoje {siteName} naudodami toliau esantį mygtuką.",
    signupIgnore: "Jei nesukūrėte šios paskyros, galite nepaisyti šio laiško.",
    resetTitle: "Atkurkite slaptažodį",
    resetBody:
      "Gavome prašymą atkurti jūsų slaptažodį paslaugoje {siteName}. Naudodami toliau esantį mygtuką pasirinkite naują slaptažodį.",
    resetIgnore:
      "Jei neprašėte atkurti slaptažodžio, nepaisykite šio laiško. Slaptažodis nepasikeis, kol nebaigsite atkūrimo.",
  },
  bg: {
    signupTitle: "Потвърдете имейл адреса си",
    signupBody: "Потвърдете имейл адреса си за {siteName} чрез бутона по-долу.",
    signupIgnore: "Ако не сте създали този акаунт, можете да пренебрегнете този имейл.",
    resetTitle: "Нулирайте паролата си",
    resetBody:
      "Получихме заявка за нулиране на паролата ви за {siteName}. Използвайте бутона по-долу, за да изберете нова парола.",
    resetIgnore:
      "Ако не сте поискали нулиране, пренебрегнете този имейл. Паролата ви няма да се промени, докато не завършите нулирането.",
  },
  hr: {
    signupTitle: "Potvrdite svoju adresu e-pošte",
    signupBody: "Potvrdite svoju adresu e-pošte za {siteName} pomoću gumba u nastavku.",
    signupIgnore: "Ako niste izradili ovaj račun, možete zanemariti ovu poruku.",
    resetTitle: "Ponovno postavite lozinku",
    resetBody:
      "Primili smo zahtjev za ponovno postavljanje vaše lozinke za {siteName}. Pomoću gumba u nastavku odaberite novu lozinku.",
    resetIgnore:
      "Ako niste zatražili ponovno postavljanje, zanemarite ovu poruku. Lozinka se neće promijeniti dok ne dovršite postupak.",
  },
  cs: {
    signupTitle: "Potvrďte svou e-mailovou adresu",
    signupBody: "Potvrďte svou e-mailovou adresu pro {siteName} pomocí tlačítka níže.",
    signupIgnore: "Pokud jste tento účet nevytvořili, můžete tento e-mail ignorovat.",
    resetTitle: "Obnovte své heslo",
    resetBody:
      "Obdrželi jsme žádost o obnovení vašeho hesla pro {siteName}. Pomocí tlačítka níže si zvolte nové heslo.",
    resetIgnore:
      "Pokud jste o obnovení nepožádali, tento e-mail ignorujte. Vaše heslo se nezmění, dokud obnovení nedokončíte.",
  },
  sk: {
    signupTitle: "Potvrďte svoju e-mailovú adresu",
    signupBody: "Potvrďte svoju e-mailovú adresu pre {siteName} pomocou tlačidla nižšie.",
    signupIgnore: "Ak ste tento účet nevytvorili, môžete tento e-mail ignorovať.",
    resetTitle: "Obnovte svoje heslo",
    resetBody:
      "Dostali sme žiadosť o obnovenie vášho hesla pre {siteName}. Pomocou tlačidla nižšie si zvoľte nové heslo.",
    resetIgnore:
      "Ak ste o obnovenie nepožiadali, tento e-mail ignorujte. Vaše heslo sa nezmení, kým obnovenie nedokončíte.",
  },
  sl: {
    signupTitle: "Potrdite svoj e-poštni naslov",
    signupBody: "Potrdite svoj e-poštni naslov za {siteName} s spodnjim gumbom.",
    signupIgnore: "Če tega računa niste ustvarili, lahko to sporočilo prezrete.",
    resetTitle: "Ponastavite geslo",
    resetBody:
      "Prejeli smo zahtevo za ponastavitev vašega gesla za {siteName}. S spodnjim gumbom izberite novo geslo.",
    resetIgnore:
      "Če ponastavitve niste zahtevali, prezrite to sporočilo. Geslo se ne bo spremenilo, dokler ne dokončate ponastavitve.",
  },
  ro: {
    signupTitle: "Confirmă adresa de e-mail",
    signupBody: "Confirmă adresa de e-mail pentru {siteName} folosind butonul de mai jos.",
    signupIgnore: "Dacă nu ai creat acest cont, poți ignora acest e-mail.",
    resetTitle: "Resetează parola",
    resetBody:
      "Am primit o solicitare de resetare a parolei pentru {siteName}. Folosește butonul de mai jos pentru a alege o parolă nouă.",
    resetIgnore:
      "Dacă nu ai solicitat resetarea, ignoră acest e-mail. Parola nu se va schimba până când nu finalizezi resetarea.",
  },
  hu: {
    signupTitle: "Erősítse meg e-mail-címét",
    signupBody: "Erősítse meg e-mail-címét a(z) {siteName} szolgáltatásban az alábbi gombbal.",
    signupIgnore: "Ha nem Ön hozta létre ezt a fiókot, figyelmen kívül hagyhatja ezt az e-mailt.",
    resetTitle: "Állítsa vissza jelszavát",
    resetBody:
      "Kérést kaptunk a(z) {siteName} szolgáltatáshoz tartozó jelszava visszaállítására. Az alábbi gombbal válasszon új jelszót.",
    resetIgnore:
      "Ha nem kérte a visszaállítást, hagyja figyelmen kívül ezt az e-mailt. Jelszava nem változik meg, amíg nem fejezi be a visszaállítást.",
  },
  el: {
    signupTitle: "Επιβεβαιώστε το email σας",
    signupBody:
      "Επιβεβαιώστε τη διεύθυνση email σας για το {siteName} χρησιμοποιώντας το παρακάτω κουμπί.",
    signupIgnore: "Αν δεν δημιουργήσατε αυτόν τον λογαριασμό, μπορείτε να αγνοήσετε αυτό το email.",
    resetTitle: "Επαναφέρετε τον κωδικό σας",
    resetBody:
      "Λάβαμε αίτημα επαναφοράς του κωδικού σας για το {siteName}. Χρησιμοποιήστε το παρακάτω κουμπί για να επιλέξετε νέο κωδικό.",
    resetIgnore:
      "Αν δεν ζητήσατε επαναφορά, αγνοήστε αυτό το email. Ο κωδικός σας δεν θα αλλάξει μέχρι να ολοκληρώσετε την επαναφορά.",
  },
  ga: {
    signupTitle: "Deimhnigh do sheoladh ríomhphoist",
    signupBody: "Deimhnigh do sheoladh ríomhphoist le haghaidh {siteName} leis an gcnaipe thíos.",
    signupIgnore:
      "Murar chruthaigh tú an cuntas seo, is féidir leat neamhaird a dhéanamh den ríomhphost seo.",
    resetTitle: "Athshocraigh do phasfhocal",
    resetBody:
      "Fuaireamar iarratas chun do phasfhocal le haghaidh {siteName} a athshocrú. Úsáid an cnaipe thíos chun pasfhocal nua a roghnú.",
    resetIgnore:
      "Murar iarr tú athshocrú, déan neamhaird den ríomhphost seo. Ní athrófar do phasfhocal go dtí go gcríochnóidh tú an t-athshocrú.",
  },
  mt: {
    signupTitle: "Ikkonferma l-indirizz tal-email tiegħek",
    signupBody: "Ikkonferma l-indirizz tal-email tiegħek għal {siteName} bil-buttuna hawn taħt.",
    signupIgnore: "Jekk ma ħloqtx dan il-kont, tista’ tinjora din l-email.",
    resetTitle: "Irrisettja l-password tiegħek",
    resetBody:
      "Irċevejna talba biex tirrisettja l-password tiegħek għal {siteName}. Uża l-buttuna hawn taħt biex tagħżel password ġdida.",
    resetIgnore:
      "Jekk ma tlabtx ir-risettjar, injora din l-email. Il-password tiegħek ma tinbidilx sakemm tlesti r-risettjar.",
  },
};
