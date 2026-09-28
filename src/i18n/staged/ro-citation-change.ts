/** Romanian authoring only; not registered in the runtime or language picker. Machine-authored on
 * 2026-09-28 from the English change-evidence namespace; fluent human acceptance pending. */
export const roCitationChange: Readonly<Record<string, string>> = {
  "citationChange.title": "Modificări ale fișelor și configurației",
  "citationChange.intro":
    "Înregistrați modificarea intenționată ca artefact (doar câmpurile acceptate și nesecrete), aprobați exact acea versiune, declarați când a fost efectuată și apoi legați o îmbunătățire de ea. O declarație nu este dovadă de la destinație.",
  "citationChange.artifact.new": "Artefact de modificare nou",
  "citationChange.artifact.kind": "Tip",
  "citationChange.artifact.kind.listing": "Fișă",
  "citationChange.artifact.kind.configuration": "Configurație",
  "citationChange.artifact.reference": "Referință",
  "citationChange.artifact.referenceHint":
    "Identificatorul fișei sau al setării (de exemplu id-ul profilului sau calea setării). Fără date de autentificare.",
  "citationChange.artifact.fields": "Câmpuri",
  "citationChange.artifact.fieldsHint":
    "Pot fi înregistrate doar câmpurile acceptate; datele de autentificare, tokenurile și setările private sunt refuzate și nu pot fi adăugate aici.",
  "citationChange.artifact.before": "Înainte",
  "citationChange.artifact.after": "După",
  "citationChange.artifact.save": "Salvați artefactul",
  "citationChange.artifact.saved":
    "Artefact salvat (un conținut identic returnează artefactul existent).",
  "citationChange.artifact.remove":
    "Ștergeți artefactul (conținutul este eliminat; identificatorii rămân pentru audit)",
  "citationChange.artifact.empty": "Încă nu există niciun artefact de modificare.",
  "citationChange.artifact.unsupported": "Câmp sau valoare neacceptată; nu s-a salvat nimic.",
  "citationChange.approval.title": "Aprobarea exact a acestei versiuni",
  "citationChange.approval.approve": "Aprobați această versiune",
  "citationChange.approval.revoke": "Revocați aprobarea",
  "citationChange.approval.owner": "Aprobat de mine (proprietar)",
  "citationChange.approval.delegate": "Aprobat de un recenzent delegat: {email}",
  "citationChange.approval.none": "Momentan neaprobat.",
  "citationChange.receipt.title": "Declarații de efectuare",
  "citationChange.receipt.record": "Declarați efectuat acum",
  "citationChange.receipt.recorded": "Declarație înregistrată.",
  "citationChange.receipt.none": "Încă nu există nicio declarație.",
  "citationChange.receipt.note":
    "O declarație spune că o persoană a făcut modificarea; nu dovedește niciodată că destinația o afișează.",
  "citationChange.binding.kind": "Tip de legare",
  "citationChange.binding.public": "Încercare publicată (URL public)",
  "citationChange.binding.change": "Modificare de fișă / configurație",
  "citationChange.binding.artifact": "Artefact",
  "citationChange.binding.receipt": "Declarație de efectuare",
  "citationChange.binding.chooseArtifact": "Alegeți un artefact aprobat",
  "citationChange.binding.chooseReceipt": "Alegeți o declarație",
  "citationChange.issue.artifact_required": "Alegeți un artefact aprobat.",
  "citationChange.issue.artifact_unapproved": "Artefactul ales nu este aprobat momentan.",
  "citationChange.issue.receipt_required": "Alegeți o declarație de efectuare pentru artefact.",
  "citationChange.independent.title": "Inspecție independentă",
  "citationChange.independent.none": "fără inspecție independentă",
  "citationChange.independent.inconclusive": "neconcludentă (nu confirmă)",
  "citationChange.independent.disputed":
    "contestată (un inspector desemnat a văzut că modificarea lipsește; exclusă din pregătirea verificată)",
  "citationChange.independent.independently_inspected":
    "inspectată independent (o altă persoană autentificată a văzut modificarea aprobată)",
  "citationChange.independent.note":
    "Inspecția independentă este o inspecție umană făcută de o altă persoană din echipă; nu este niciodată o verificare automată sau o dovadă cauzală, iar o livrare contestată este exclusă chiar și atunci când ați atestat-o dumneavoastră.",
  "citationChange.eligible.yes": "contează ca modificare verificată",
  "citationChange.eligible.no": "nu contează ca verificată",
  "citationChange.assign.title": "Desemnări de inspecție",
  "citationChange.assign.pick": "Alegeți un recenzent din echipă",
  "citationChange.assign.grant": "Acordați inspecția",
  "citationChange.assign.revoke": "Revocați",
  "citationChange.assign.link": "Copiați linkul inspectorului",
  "citationChange.assign.linkCopied": "Link copiat.",
  "citationChange.assign.none": "Niciun inspector desemnat.",
  "citationChange.assign.effective": "în vigoare",
  "citationChange.assign.ineffective": "nu mai este în vigoare",
  "citationChange.inspect.title": "Inspectați o modificare înregistrată",
  "citationChange.inspect.intro":
    "Deschideți referința exactă, comparați-o cu conținutul aprobat de mai jos, apoi înregistrați ce ați văzut. Deschiderea referinței nu atestă nimic în sine.",
  "citationChange.inspect.reference": "Referință",
  "citationChange.inspect.open": "Deschideți referința",
  "citationChange.inspect.approvedVersion": "Versiune aprobată",
  "citationChange.inspect.approvedContent": "Conținut aprobat",
  "citationChange.inspect.identity": "Identitățile aprobatorului și ale executantului",
  "citationChange.inspect.identityUnavailable":
    "Executantul sau aprobatorul acestei modificări este necunoscut (o publicare mai veche sau o aprobare nerezolvată); nu se poate înregistra o chitanță independentă.",
  "citationChange.inspect.result": "Ce ați văzut?",
  "citationChange.inspect.shows_approved_content": "Afișează modificarea aprobată",
  "citationChange.inspect.does_not_show": "Nu o afișează",
  "citationChange.inspect.inconclusive": "Neconcludent",
  "citationChange.inspect.record": "Înregistrați inspecția",
  "citationChange.inspect.retry": "Reîncercați aceeași inspecție",
  "citationChange.inspect.withdraw": "Retrageți inspecția mea curentă",
  "citationChange.inspect.recorded": "Inspecție înregistrată ca v{version}.",
  "citationChange.inspect.history": "Istoricul inspecțiilor mele",
  "citationChange.inspect.head": "curentă",
  "citationChange.inspect.withdrawn": "retrasă",
  "citationChange.inspect.loadError":
    "Această inspecție nu a putut fi încărcată (nedesemnată, revocată sau rândul s-a schimbat).",
  "citationChange.readiness.independent": "Inspectate independent: {count}",
  "citationChange.readiness.disputed": "Contestate (excluse): {count}",
  "citationChange.readiness.receipts":
    "Doar declarații de efectuare (nu dovadă de livrare): {count}",
  "citationChange.error.unsupported": "Câmp, valoare sau tip neacceptat; nu s-a salvat nimic.",
  "citationChange.error.unavailable":
    "Înregistrarea modificării nu a putut fi încărcată sau salvată.",
  "citationChange.error.stale": "Artefactul s-a schimbat de când l-ați văzut; redeschideți-l.",
  "citationChange.error.forbidden": "Nu aveți permisiunea să faceți asta pentru acest proiect.",
  "citationChange.error.unapproved": "Această versiune nu este aprobată momentan.",
  "citationChange.error.receiptInvalid":
    "Momentul declarat este înainte de aprobare sau în viitor.",
  "citationChange.error.capacity":
    "S-a atins capacitatea de artefacte de modificare pentru acest proiect.",
  "citationChange.error.inspectionInvalid":
    "Inspecția nu este validă (moment, referință sau stare).",
  "citationChange.error.notIndependent":
    "Ați efectuat sau aprobat această modificare, așa că nu o puteți inspecta independent.",
  "citationChange.error.identityUnavailable":
    "Identitatea executantului sau a aprobatorului nu este disponibilă; inspecția independentă este refuzată.",
  "citationChange.error.inspectionConflict":
    "Lanțul dumneavoastră de inspecții s-a schimbat; reîncărcați și înregistrați din nou.",
  "citationChange.error.generic": "Acțiunea asupra dovezilor modificării nu a putut fi finalizată.",
  "citationChange.artifact.fieldKey": "Câmp",
  "citationChange.artifact.addField": "Adăugați câmp",
  "citationChange.artifact.removeField": "Eliminați",
  "citationChange.artifact.removed": "Artefact șters (identificatorii de audit păstrați).",
  "citationChange.artifact.approvalRevision": "revizia aprobării {revision}",
  "citationChange.approval.approved": "Aprobare înregistrată.",
  "citationChange.approval.revoked": "Aprobare revocată.",
  "citationChange.approval.retry": "Reîncercați aceeași decizie",
  "citationChange.approval.replayed":
    "Aceasta a fost o repetare a unei cereri anterioare; decizia curentă se afișează după reîncărcare.",
  "citationChange.receipt.remove": "Eliminați declarația",
  "citationChange.receipt.removed": "Declarație eliminată.",
  "citationChange.binding.deleted": "Artefactul legat a fost șters; au rămas doar identificatorii.",
  "citationChange.detail.changeTitle": "Modificare de fișă / configurație legată",
  "citationChange.detail.artifactVersion": "Versiunea aprobată a artefactului",
  "citationChange.detail.receiptAt": "Declarat efectuat la",
  "citationChange.assign.candidatesNone":
    "Niciun recenzent eligibil din echipă de desemnat (politică sau listă).",
  "citationChange.assign.granted": "Inspecție acordată.",
  "citationChange.assign.revoked": "Inspecție revocată.",
  "citationChange.inspect.kindPublic": "Pagină publicată",
  "citationChange.inspect.fresh":
    "Inspecția dumneavoastră curentă nu mai are efect ({reason}); înregistrați una nouă față de capul curent al lanțului.",
  "citationChange.inspect.reason.superseded": "înlocuită de o chitanță ulterioară",
  "citationChange.inspect.reason.withdrawn": "retrasă",
  "citationChange.inspect.reason.account": "cont indisponibil",
  "citationChange.inspect.reason.assignment": "desemnarea a fost acordată din nou",
  "citationChange.inspect.reason.authority": "autoritatea dumneavoastră în echipă s-a schimbat",
  "citationChange.inspect.reason.independence": "sunteți acum executantul sau aprobatorul",
  "citationChange.inspect.noContent":
    "Conținutul aprobat nu mai este disponibil (artefact șters sau publicare lipsă).",
  "citationChange.inspect.boundFindings": "Constatări legate",
  "citationChange.inspect.withdrawnDone": "Inspecție retrasă.",
  "citationChange.dissent.title": "Dezacord activ privind această modificare livrată",
  "citationChange.dissent.row": "{inspector} · rândul {row} · {at}",
  "citationChange.status.receipt_recorded":
    "declarație de efectuare înregistrată (nu dovadă de livrare)",
  "citationChange.artifact.duplicateField":
    "Acest câmp este deja folosit de alt rând; alegeți un câmp diferit sau eliminați acest rând.",
  "citationChange.artifact.fieldsExhausted": "Fiecare câmp acceptat de acest tip are deja un rând.",
  "citationChange.approval.pendingNote":
    "Cererea anterioară nu s-a întors. Reîncercarea trimite exact aceeași decizie (versiunea {sha}, {decision}, revizia examinată {revision}); nimic nu se recalculează din starea curentă.",
  "citationChange.approval.newDecision": "Renunțați și decideți din nou",
  "citationChange.receipt.retry": "Reîncercați aceeași declarație",
  "citationChange.receipt.newPerformance": "Declarați o nouă efectuare",
  "citationChange.receipt.pendingNote":
    "Declarația anterioară nu s-a întors. Reîncercarea trimite exact același moment declarat ({at}); o nouă efectuare este o acțiune explicită separată.",
  "citationChange.approval.blockedBy":
    "Rezolvați mai întâi decizia în așteptare pentru {reference} (reîncercați-o sau renunțați); celelalte aprobări așteaptă.",
  "citationChange.receipt.blockedBy":
    "Rezolvați mai întâi declarația în așteptare pentru {reference} (reîncercați-o sau declarați o nouă efectuare); celelalte declarații așteaptă.",
  "citationChange.readiness.verified":
    "Modificări distincte verificate: {count} din {required} necesare (o modificare contează când dovada ei este eligibilă: propria atestare sau o inspecție independentă a unei modificări livrate; o modificare contestată sau exclusă nu contează niciodată)",
  "citationChange.readiness.sources":
    "Observații înregistrate privind modificările curente: atestate de proprietar {owner}, inspectate independent {independent} (acestea sunt numere de observații înregistrate, nu dovezi eligibile; contestațiile și excluderile decid numărul verificat de mai sus)",
  "citationChange.evidence.independentBaseline":
    "linia de bază este rezolvată de dovada independentă (fără atestarea proprietarului pe acest rând)",
  "citationChange.inspect.ownerIntro":
    "Deschideți fișa sau setarea la referința exactă, comparați cu câmpurile aprobate de mai jos, apoi înregistrați ce ați văzut. Deschiderea nu atestă nimic în sine.",
  "citationChange.inspect.contentUnavailable":
    "Conținutul aprobat exact al acestei modificări nu a putut fi încărcat (artefact șters, modificat sau indisponibil): o atestare pozitivă nu este posibilă; un rezultat negativ sau neconcludent poate fi înregistrat în continuare.",
  "citationChange.receipt.stale":
    "nevalidă sub aprobarea curentă (înregistrată sub o decizie anterioară sau aprobarea nu mai este curentă) — declarați o execuție nouă",
  "citationChange.issue.receipt_stale":
    "Declarația aleasă nu este validă sub aprobarea curentă: a fost înregistrată sub o decizie de aprobare anterioară sau aprobarea nu mai este curentă. Declarați o execuție nouă și alegeți-o pe aceea.",
  "citationChange.error.receiptStale":
    "Declarația a fost înregistrată sub o decizie de aprobare anterioară (aprobarea a fost între timp revocată sau decisă din nou). Declarați o execuție nouă sub aprobarea curentă și legați-o pe aceea.",
  "citationChange.binding.receiptStale":
    "Declarația legată a fost înregistrată sub o decizie de aprobare anterioară, deci acest rând rămâne la legat de aprobare și nicio inspecție nouă nu poate lega acea declarație. Declarați o execuție nouă sub aprobarea curentă și înregistrați o versiune nouă a îmbunătățirii.",
};
