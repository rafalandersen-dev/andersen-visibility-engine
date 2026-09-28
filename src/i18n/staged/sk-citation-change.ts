/** Slovak authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const skCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Zmeny v profiloch a konfigurácii",
  "citationChange.intro":
    "Zaznamenajte zamýšľanú zmenu ako artefakt (iba podporované neutajené polia), schváľte presne túto verziu, deklarujte, kedy bola vykonaná, a potom k nej naviažte zlepšenie. Deklarácia nie je dôkazom z cieľového miesta.",
  "citationChange.artifact.new": "Nový artefakt zmeny",
  "citationChange.artifact.kind": "Druh",
  "citationChange.artifact.kind.listing": "Profil",
  "citationChange.artifact.kind.configuration": "Konfigurácia",
  "citationChange.artifact.reference": "Odkaz",
  "citationChange.artifact.referenceHint":
    "Identifikátor profilu alebo nastavenia (napríklad id profilu alebo cesta k nastaveniu). Bez prihlasovacích údajov.",
  "citationChange.artifact.fields": "Polia",
  "citationChange.artifact.fieldsHint":
    "Zaznamenať možno iba podporované polia; prihlasovacie údaje, tokeny a súkromné nastavenia sú odmietnuté a nemožno ich sem pridať.",
  "citationChange.artifact.before": "Pred",
  "citationChange.artifact.after": "Po",
  "citationChange.artifact.save": "Uložiť artefakt",
  "citationChange.artifact.saved": "Artefakt uložený (identický obsah vracia existujúci artefakt).",
  "citationChange.artifact.remove":
    "Odstrániť artefakt (obsah sa odstráni; identifikátory zostanú na audit)",
  "citationChange.artifact.empty": "Zatiaľ žiadny artefakt zmeny.",
  "citationChange.artifact.unsupported": "Nepodporované pole alebo hodnota; nič sa neuložilo.",
  "citationChange.approval.title": "Schválenie presne tejto verzie",
  "citationChange.approval.approve": "Schváliť túto verziu",
  "citationChange.approval.revoke": "Odvolať schválenie",
  "citationChange.approval.owner": "Schválené mnou (vlastník)",
  "citationChange.approval.delegate": "Schválené povereným recenzentom: {email}",
  "citationChange.approval.none": "Momentálne neschválené.",
  "citationChange.receipt.title": "Deklarácie vykonania",
  "citationChange.receipt.record": "Deklarovať vykonanie teraz",
  "citationChange.receipt.recorded": "Deklarácia zaznamenaná.",
  "citationChange.receipt.none": "Zatiaľ žiadna deklarácia.",
  "citationChange.receipt.note":
    "Deklarácia hovorí, že osoba zmenu vykonala; nikdy nedokazuje, že ju cieľové miesto zobrazuje.",
  "citationChange.binding.kind": "Druh väzby",
  "citationChange.binding.public": "Publikovaný pokus (verejná URL)",
  "citationChange.binding.change": "Zmena profilu / konfigurácie",
  "citationChange.binding.artifact": "Artefakt",
  "citationChange.binding.receipt": "Deklarácia vykonania",
  "citationChange.binding.chooseArtifact": "Vyberte schválený artefakt",
  "citationChange.binding.chooseReceipt": "Vyberte deklaráciu",
  "citationChange.issue.artifact_required": "Vyberte schválený artefakt.",
  "citationChange.issue.artifact_unapproved": "Vybraný artefakt momentálne nie je schválený.",
  "citationChange.issue.receipt_required": "Vyberte deklaráciu vykonania pre artefakt.",
  "citationChange.independent.title": "Nezávislá kontrola",
  "citationChange.independent.none": "žiadna nezávislá kontrola",
  "citationChange.independent.inconclusive": "nepreukazná (nepotvrdzuje)",
  "citationChange.independent.disputed":
    "sporná (pridelený kontrolór videl, že zmena chýba; vylúčená z overenej pripravenosti)",
  "citationChange.independent.independently_inspected":
    "nezávisle skontrolovaná (iná overená osoba videla schválenú zmenu)",
  "citationChange.independent.note":
    "Nezávislá kontrola je ľudská kontrola inou osobou v tíme; nikdy nejde o automatické overenie ani príčinný dôkaz a sporné doručenie je vylúčené, aj keď ste ho sami potvrdili.",
  "citationChange.eligible.yes": "počíta sa ako overená zmena",
  "citationChange.eligible.no": "nepočíta sa ako overená",
  "citationChange.assign.title": "Pridelenia kontrol",
  "citationChange.assign.pick": "Vyberte recenzenta z tímu",
  "citationChange.assign.grant": "Udeliť kontrolu",
  "citationChange.assign.revoke": "Odvolať",
  "citationChange.assign.link": "Kopírovať odkaz kontrolóra",
  "citationChange.assign.linkCopied": "Odkaz skopírovaný.",
  "citationChange.assign.none": "Žiadny pridelený kontrolór.",
  "citationChange.assign.effective": "účinné",
  "citationChange.assign.ineffective": "už neúčinné",
  "citationChange.inspect.title": "Skontrolovať zaznamenanú zmenu",
  "citationChange.inspect.intro":
    "Otvorte presný odkaz, porovnajte ho so schváleným obsahom nižšie a potom zaznamenajte, čo ste videli. Samotné otvorenie odkazu nič nepotvrdzuje.",
  "citationChange.inspect.reference": "Odkaz",
  "citationChange.inspect.open": "Otvoriť odkaz",
  "citationChange.inspect.approvedVersion": "Schválená verzia",
  "citationChange.inspect.approvedContent": "Schválený obsah",
  "citationChange.inspect.identity": "Identity schvaľovateľa a vykonávateľa",
  "citationChange.inspect.identityUnavailable":
    "Vykonávateľ alebo schvaľovateľ tejto zmeny nie je známy (staršia publikácia alebo nevyriešené schválenie); nezávislý doklad nemožno zaznamenať.",
  "citationChange.inspect.result": "Čo ste videli?",
  "citationChange.inspect.shows_approved_content": "Zobrazuje schválenú zmenu",
  "citationChange.inspect.does_not_show": "Nezobrazuje ju",
  "citationChange.inspect.inconclusive": "Nepreukazné",
  "citationChange.inspect.record": "Zaznamenať kontrolu",
  "citationChange.inspect.retry": "Zopakovať rovnakú kontrolu",
  "citationChange.inspect.withdraw": "Stiahnuť moju aktuálnu kontrolu",
  "citationChange.inspect.recorded": "Kontrola zaznamenaná ako v{version}.",
  "citationChange.inspect.history": "História mojich kontrol",
  "citationChange.inspect.head": "aktuálna",
  "citationChange.inspect.withdrawn": "stiahnutá",
  "citationChange.inspect.loadError":
    "Túto kontrolu sa nepodarilo načítať (nepridelená, odvolaná alebo sa riadok zmenil).",
  "citationChange.readiness.independent": "Nezávisle skontrolované: {count}",
  "citationChange.readiness.disputed": "Sporné (vylúčené): {count}",
  "citationChange.readiness.receipts": "Iba deklarácie vykonania (nie dôkaz doručenia): {count}",
  "citationChange.error.unsupported": "Nepodporované pole, hodnota alebo druh; nič sa neuložilo.",
  "citationChange.error.unavailable": "Záznam zmeny sa nepodarilo načítať ani uložiť.",
  "citationChange.error.stale": "Artefakt sa odvtedy, čo ste ho videli, zmenil; otvorte ho znova.",
  "citationChange.error.forbidden": "Na túto akciu nemáte v tomto projekte oprávnenie.",
  "citationChange.error.unapproved": "Táto verzia momentálne nie je schválená.",
  "citationChange.error.receiptInvalid":
    "Deklarovaný okamih je pred schválením alebo v budúcnosti.",
  "citationChange.error.capacity": "Bola dosiahnutá kapacita artefaktov zmien pre tento projekt.",
  "citationChange.error.inspectionInvalid": "Kontrola nie je platná (okamih, odkaz alebo stav).",
  "citationChange.error.notIndependent":
    "Túto zmenu ste vykonali alebo schválili, preto ju nemôžete nezávisle skontrolovať.",
  "citationChange.error.identityUnavailable":
    "Identita vykonávateľa alebo schvaľovateľa nie je k dispozícii; nezávislá kontrola je odmietnutá.",
  "citationChange.error.inspectionConflict":
    "Váš reťazec kontrol sa zmenil; načítajte znova a zaznamenajte znova.",
  "citationChange.error.generic": "Akciu s dôkazmi o zmene sa nepodarilo dokončiť.",
  "citationChange.artifact.fieldKey": "Pole",
  "citationChange.artifact.addField": "Pridať pole",
  "citationChange.artifact.removeField": "Odstrániť",
  "citationChange.artifact.removed": "Artefakt odstránený (auditné identifikátory zachované).",
  "citationChange.artifact.approvalRevision": "revízia schválenia {revision}",
  "citationChange.approval.approved": "Schválenie zaznamenané.",
  "citationChange.approval.revoked": "Schválenie odvolané.",
  "citationChange.approval.retry": "Zopakovať rovnaké rozhodnutie",
  "citationChange.approval.replayed":
    "Išlo o opakovanie skoršej požiadavky; aktuálne rozhodnutie sa zobrazí po obnovení.",
  "citationChange.receipt.remove": "Odstrániť deklaráciu",
  "citationChange.receipt.removed": "Deklarácia odstránená.",
  "citationChange.binding.deleted":
    "Naviazaný artefakt bol odstránený; zostali len identifikátory.",
  "citationChange.detail.changeTitle": "Naviazaná zmena profilu / konfigurácie",
  "citationChange.detail.artifactVersion": "Schválená verzia artefaktu",
  "citationChange.detail.receiptAt": "Deklarované ako vykonané",
  "citationChange.assign.candidatesNone":
    "Žiadny vhodný recenzent z tímu na pridelenie (politika alebo zoznam).",
  "citationChange.assign.granted": "Kontrola udelená.",
  "citationChange.assign.revoked": "Kontrola odvolaná.",
  "citationChange.inspect.kindPublic": "Publikovaná stránka",
  "citationChange.inspect.fresh":
    "Vaša aktuálna kontrola už nemá účinok ({reason}); zaznamenajte novú voči svojej aktuálnej hlave reťazca.",
  "citationChange.inspect.reason.superseded": "nahradená neskorším dokladom",
  "citationChange.inspect.reason.withdrawn": "stiahnutá",
  "citationChange.inspect.reason.account": "účet nie je k dispozícii",
  "citationChange.inspect.reason.assignment": "pridelenie bolo udelené znova",
  "citationChange.inspect.reason.authority": "vaše oprávnenie v tíme sa zmenilo",
  "citationChange.inspect.reason.independence": "teraz ste vykonávateľ alebo schvaľovateľ",
  "citationChange.inspect.noContent":
    "Schválený obsah už nie je k dispozícii (artefakt odstránený alebo publikácia chýba).",
  "citationChange.inspect.boundFindings": "Naviazané zistenia",
  "citationChange.inspect.withdrawnDone": "Kontrola stiahnutá.",
  "citationChange.dissent.title": "Aktívny nesúhlas s touto doručenou zmenou",
  "citationChange.dissent.row": "{inspector} · riadok {row} · {at}",
  "citationChange.status.receipt_recorded":
    "deklarácia vykonania zaznamenaná (nie dôkaz doručenia)",
  "citationChange.artifact.duplicateField":
    "Toto pole už používa iný riadok; zvoľte iné pole alebo tento riadok odstráňte.",
  "citationChange.artifact.fieldsExhausted":
    "Každé podporované pole tohto druhu už má svoj riadok.",
  "citationChange.approval.pendingNote":
    "Predchádzajúca požiadavka sa nevrátila. Opakovanie odošle presne rovnaké rozhodnutie (verzia {sha}, {decision}, revidovaná revízia {revision}); nič sa neprepočítava z aktuálneho stavu.",
  "citationChange.approval.newDecision": "Zahodiť a rozhodnúť znova",
  "citationChange.receipt.retry": "Zopakovať rovnakú deklaráciu",
  "citationChange.receipt.newPerformance": "Deklarovať nové vykonanie",
  "citationChange.receipt.pendingNote":
    "Predchádzajúca deklarácia sa nevrátila. Opakovanie odošle presne rovnaký deklarovaný okamih ({at}); nové vykonanie je samostatná výslovná akcia.",
  "citationChange.approval.blockedBy":
    "Najprv vyriešte čakajúce rozhodnutie pre {reference} (zopakujte ho alebo zahoďte); ostatné schválenia čakajú.",
  "citationChange.receipt.blockedBy":
    "Najprv vyriešte čakajúcu deklaráciu pre {reference} (zopakujte ju alebo deklarujte nové vykonanie); ostatné deklarácie čakajú.",
  "citationChange.readiness.verified":
    "Overené odlišné zmeny: {count} z {required} požadovaných (zmena sa počíta, keď je jej dôkaz spôsobilý: vaše vlastné potvrdenie alebo nezávislá kontrola doručenej zmeny; sporná alebo vylúčená zmena sa nikdy nepočíta)",
  "citationChange.readiness.sources":
    "Zaznamenané pozorovania aktuálnych zmien: potvrdené vlastníkom {owner}, nezávisle skontrolované {independent} (ide o počty zaznamenaných pozorovaní, nie o spôsobilé dôkazy; o overenom počte vyššie rozhodujú spory a vylúčenia)",
  "citationChange.evidence.independentBaseline":
    "východiskový stav rieši nezávislý dôkaz (v tomto riadku chýba potvrdenie vlastníka)",
  "citationChange.inspect.ownerIntro":
    "Otvorte profil alebo nastavenie na presnom odkaze, porovnajte so schválenými poľami nižšie a potom zaznamenajte, čo ste videli. Samotné otvorenie nič nepotvrdzuje.",
  "citationChange.inspect.contentUnavailable":
    "Presný schválený obsah tejto zmeny sa nepodarilo načítať (artefakt odstránený, zmenený alebo nedostupný): kladné potvrdenie nie je možné; záporný alebo nepreukazný výsledok možno stále zaznamenať.",
};
