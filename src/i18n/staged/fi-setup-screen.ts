/** Finnish authoring only; not registered in the runtime or language picker. */
export const fiSetupScreen: Readonly<Record<string, string>> = {
  "setupScreen.invalidUrl": "{field}: osoitteen alussa on oltava http:// tai https://",
  "setupScreen.missing": "Täytä pakolliset kentät: {fields}",
  "setupScreen.additional": "Sisällön lisäkielet",
  "setupScreen.sellingPoints": "Erottavat myyntivaltit",
  "setupScreen.publishing": "Julkaiseminen",
  "setupScreen.mode": "Julkaisutapa",
  "setupScreen.mode.draft": "Vain luonnokset",
  "setupScreen.mode.manual": "Manuaalinen julkaiseminen",
  "setupScreen.endpoint": "Luonnosten toimituksen rajapintaosoite",
  "setupScreen.liveEndpoint": "Julkaisun rajapintaosoite",
  "setupScreen.liveHelp":
    "Erillinen rajapinta tarkistetun luonnoksen julkaisemiseen. Se käyttää samaa julkaisun salaisuutta.",
  "setupScreen.secret": "Julkaisun salaisuus",
  "setupScreen.secretHelp":
    "Palvelin tallentaa uudet salaisuudet ja lähettää ne määritettyyn kohteeseen pyynnön otsakkeessa. Määritä sama salaisuus kohteessa.",
  "setupScreen.destination": "Oletuskohde",
  "setupScreen.faq": "Usein kysytyt kysymykset -osio",
  "setupScreen.approvalHelp":
    "Artikkelin hyväksyminen merkitsee sen valmiiksi. Julkaiseminen vaatii erillisen toimen: julkaise nyt tai ajasta julkaisu. Tarkista sisältö ja väitteet ennen julkaisemista.",
  "setupScreen.disclaimer": "Tekoälysisällön vastuuvapauslauseke",
  "setupScreen.retiredTitle": "Automaattinen julkaiseminen hyväksymisen yhteydessä on poistettu.",
  "setupScreen.retiredHelp":
    "Projektin julkaisutapa on nyt {mode}. Hyväksyminen merkitsee artikkelin valmiiksi; julkaiseminen vaatii yhä erillisen toimen tai ajastuksen. Aiemmin hyväksytyt artikkelit voivat edelleen olla luonnoksia. Tarkista niiden tila ennen uuden työn ajastamista.",
  "setupScreen.saving": "Tallennetaan…",
  "setupScreen.save": "Tallenna julkaisuasetukset",
  "setupScreen.saved": "Julkaisuasetukset tallennettu",
  "setupScreen.failed": "Julkaisuasetuksia ei voitu tallentaa",
  "setupScreen.tagsExample": "seo, kasvu",
};
