/** Romanian authoring only; not registered in the runtime or language picker.
 * `backlinks.gapNote` follows `backlink-integrity.ts`; `linknet.policyNote` and
 * `linknet.reciprocalWarn` follow `link-network-copy.ts`. Both override `en.ts`. */
export const roLinks: Readonly<Record<string, string>> = {
  "linknet.title": "Rețeaua de creștere prin linkuri",
  "linknet.subtitle":
    "Primiți potriviri cu site-uri relevante din rețeaua Milo, trimiteți o prezentare personală și lăsați-l pe Milo să verifice că linkul este cu adevărat publicat.",
  "linknet.policyNote":
    "Relevanța este pe primul loc: potrivirile necesită subiecte comune, schimburile directe de linkuri sunt semnalate și nimic nu este plasat automat. Aceste verificări nu garantează respectarea politicilor motoarelor de căutare.",
  "linknet.topics": "Subiecte",
  "linknet.topicsPlaceholder": "Subiecte (separate prin virgulă)",
  "linknet.contact": "E-mail de contact",
  "linknet.contactPlaceholder": "E-mail de contact pentru parteneri",
  "linknet.join": "Alăturați-vă rețelei",
  "linknet.update": "Actualizați înregistrarea",
  "linknet.pause": "Întrerupeți",
  "linknet.joined": "Înregistrat — partenerii pot găsi acum acest site.",
  "linknet.paused": "Înregistrarea a fost întreruptă.",
  "linknet.find": "Găsiți parteneri",
  "linknet.noMatches":
    "Nu există încă parteneri relevanți — rețeaua crește cu fiecare site Milo care se alătură.",
  "linknet.score": "Potrivire",
  "linknet.copyIntro": "Copiați e-mailul de prezentare",
  "linknet.introCopied": "Prezentarea a fost copiată — lipiți-o în e-mail.",
  "linknet.markContacted": "Marcați ca contactat",
  "linknet.markAgreed": "Marcați ca acceptat",
  "linknet.decline": "Refuzați",
  "linknet.targetUrlPlaceholder": "URL-ul paginii convenite (unde va fi linkul)",
  "linknet.verify": "Verificați linkul",
  "linknet.verified": "Link găsit — plasarea este publicată și verificată.",
  "linknet.notFound": "Nu a fost găsit încă niciun link pe acea pagină — verificat și înregistrat.",
  "linknet.liveSince": "Publicat din",
  "linknet.nofollow": "nofollow",
  "linknet.lastCheckMiss": "Ultima verificare: linkul nu a fost găsit",
  "linknet.reciprocalWarn":
    "Aceasta ar crea un schimb direct de linkuri cu acest site. Verificați relevanța și evitați schimburile excesive.",
  "linknet.status.suggested": "Sugerat",
  "linknet.status.contacted": "Contactat",
  "linknet.status.agreed": "Acceptat",
  "linknet.status.live_verified": "Publicat ✓",
  "linknet.status.declined": "Refuzat",
  "backlinks.title": "Backlinkuri",
  "backlinks.subtitle":
    "Date reale despre backlinkurile domeniului dvs. — puterea profilului, decalajul de linkuri față de concurenți și recomandări sigure pentru obținerea de linkuri.",
  "backlinks.disclaimer":
    "Metricile de backlinkuri provin dintr-un index extern de linkuri și sunt estimări — niciun index nu vede toate linkurile. Recomandările sunt doar sugestii white-hat: Milo nu propune niciodată scheme de linkuri sau linkuri plătite nedeclarate și nu garantează clasamente, trafic sau venituri.",
  "backlinks.run": "Rulați analiza backlinkurilor",
  "backlinks.rerun": "Reîmprospătați analiza",
  "backlinks.running": "Se analizează…",
  "backlinks.empty":
    "Rulați o analiză a backlinkurilor pentru a vedea profilul real de linkuri al domeniului, cum se compară cu concurenții și ce domenii au linkuri către ei, dar nu către dvs.",
  "backlinks.notConfigured.title": "Conectați o sursă de date despre backlinkuri",
  "backlinks.notConfigured.body":
    "Acest modul folosește indexul de backlinkuri DataForSEO și nu este încă conectat. Proprietarul spațiului de lucru trebuie să creeze un cont DataForSEO (plată în funcție de utilizare) și să adauge DATAFORSEO_LOGIN și DATAFORSEO_PASSWORD ca secrete de backend. Până atunci, datele despre backlinkuri nu sunt disponibile.",
  "backlinks.status.ready.title": "DataForSEO funcțional",
  "backlinks.status.ready.body": "API-ul Backlinks este conectat și răspunde.",
  "backlinks.status.lowBalance.title": "Soldul DataForSEO este scăzut",
  "backlinks.status.lowBalance.body":
    "Reîncărcați-l curând pentru a evita întreruperea analizelor.",
  "backlinks.status.paused.title": "Accesul DataForSEO este suspendat",
  "backlinks.status.paused.body":
    "Contactați asistența DataForSEO pentru a reactiva contul înainte de a rula o altă analiză.",
  "backlinks.status.error.title": "Starea DataForSEO nu este disponibilă",
  "backlinks.status.error.body":
    "Contul sau API-ul Backlinks nu au putut fi verificate. Reîmprospătați starea sau verificați panoul furnizorului.",
  "backlinks.status.balance": "Sold: {balance}.",
  "backlinks.status.refresh": "Reîmprospătați starea",
  "backlinks.competitorsUsed": "Concurenți comparați: {list}",
  "backlinks.competitorsFromAnalysis":
    "Se folosesc concurenții din cea mai recentă analiză a concurenței: {list}",
  "backlinks.noCompetitors":
    "Acest proiect nu are URL-uri ale concurenților — analiza va acoperi doar propriul profil. Adăugați concurenți în Configurarea proiectului sau în modulul Concurenți pentru a vedea decalajul de linkuri.",
  "backlinks.lastRun": "Ultima analiză: {date}",
  "backlinks.score.overall": "Poziția linkurilor",
  "backlinks.score.profile": "Puterea profilului",
  "backlinks.score.gap": "Decalaj față de concurenți",
  "backlinks.score.quality": "Calitatea linkurilor",
  "backlinks.gapHint": "mai mare = mai mult de câștigat",
  "backlinks.summaryHeading": "Rezumat",
  "backlinks.topActions": "Principalele acțiuni pentru linkuri",
  "backlinks.profileTable": "Domeniul dvs. față de concurenți",
  "backlinks.table.domain": "Domeniu",
  "backlinks.table.rank": "Rangul domeniului",
  "backlinks.table.backlinks": "Backlinkuri",
  "backlinks.table.referringDomains": "Domenii de trimitere",
  "backlinks.table.broken": "Nefuncționale",
  "backlinks.table.spam": "Scor de spam",
  "backlinks.table.notFetched": "Datele nu au putut fi preluate",
  "backlinks.you": "Dvs.",
  "backlinks.gapHeading": "Decalaj de linkuri — au linkuri către concurenți, nu către dvs.",
  "backlinks.gapNote":
    "Eșantion din indexul furnizorului, solicitat cu domeniul dvs. exclus. Aceasta nu verifică independent că aceste site-uri nu au linkuri către dvs.",
  "backlinks.gap.linksTo": "Are linkuri către",
  "backlinks.gapEmpty":
    "Nu a fost găsit niciun decalaj de linkuri — fie nu au fost preluați concurenți, fie nu a existat suprapunere.",
  "backlinks.referringHeading": "Principalele domenii care au linkuri către dvs.",
  "backlinks.referringEmpty":
    "Nu au fost găsite încă domenii de trimitere în index — un domeniu nou pornește adesea de la zero.",
  "backlinks.recommendations": "Recomandări",
  "backlinks.effort": "Efort",
  "backlinks.target": "Țintă / platformă",
  "backlinks.approach": "Abordare",
  "backlinks.action.convert": "Creați oportunitatea",
  "backlinks.action.converted": "Oportunitate creată",
  "backlinks.action.convertTop": "Convertiți recomandările principale",
  "backlinks.toast.done": "Analiza backlinkurilor s-a finalizat",
  "backlinks.toast.converted": "Oportunitate creată",
  "backlinks.toast.convertedTop": "Au fost create {count} oportunități",
  "backlinks.category.linkGapTargets": "Ținte din decalajul de linkuri",
  "backlinks.category.contentForLinks": "Conținut pentru linkuri",
  "backlinks.category.digitalPr": "PR digital",
  "backlinks.category.partnerships": "Parteneriate și sponsorizări",
  "backlinks.category.directories": "Directoare și profiluri",
  "backlinks.category.linkHygiene": "Igiena linkurilor",
  "backlinks.integrity.partial": "Metrici parțiale",
  "backlinks.integrity.source":
    "Sursă declarată: indexul DataForSEO la data analizei salvate, pentru domeniile afișate, inclusiv subdomeniile. Etichetele de sursă din datele salvate ale spațiului de lucru nu reprezintă o verificare independentă. — înseamnă indisponibil, niciodată zero. Acoperirea indexului este incompletă; acestea nu sunt verificări în timp real ale destinațiilor.",
  "backlinks.integrity.legacy":
    "Analiză veche păstrată. Normalizarea anterioară putea transforma datele lipsă în zerouri, astfel că baza ei numerică nu este disponibilă. Recomandările originale rămân sfaturi istorice.",
  "backlinks.integrity.scores":
    "Scorurile și recomandările sunt estimări AI pe baza dovezilor disponibile, nu măsurători ale furnizorului, garanții de clasament sau rezultate măsurate.",
  "backlinks.integrity.sample":
    "Eșantion limitat de domenii de top. Domeniile omise nu dovedesc linkuri absente sau pierdute; nu este stabilită o monitorizare continuă.",
  "backlinks.integrity.failed":
    "Solicitarea a eșuat. Acest tabel nu este disponibil; nu înseamnă zero backlinkuri sau lipsa unui decalaj de linkuri.",
  "backlinks.integrity.not_requested":
    "Eșantionul de decalaj nu a fost solicitat deoarece nu au fost furnizate domenii ale concurenților.",
  "backlinks.integrity.unknown": "Starea colectării pentru acest tabel este necunoscută.",
  "backlinks.integrity.empty":
    "Nu există rânduri de afișat. Verificați starea colectării de mai sus înainte de a interpreta acest tabel.",
  "marketplace.title": "Publicații sponsorizate",
  "marketplace.subtitle":
    "Asociați oportunitățile de backlinkuri cu plasări sponsorizate transparente, verificate editorial.",
  "marketplace.disclosureTitle": "Piață white-hat.",
  "marketplace.disclosure":
    'Fiecare solicitare necesită o declarare clară a sponsorizării și rel="sponsored". O solicitare nu este o achiziție și nu garantează niciodată clasamente, trafic sau venituri.',
  "marketplace.demoNoticeTitle": "Catalog de previzualizare.",
  "marketplace.demoNotice":
    "Domeniile, metricile și prețurile de mai jos sunt date demonstrative cât timp accesul la API-ul Linkhouse este în așteptare. Solicitările sunt salvate doar în Milo pentru verificare; nu se creează nicio comandă sau plată la furnizor.",
  "marketplace.demoBadge": "Demo",
  "marketplace.integrationTitle": "Integrare Linkhouse",
  "marketplace.integrationLive":
    "Catalogul furnizorului este conectat. Fiecare comandă plătită necesită în continuare confirmarea totalului exact.",
  "marketplace.integrationPending":
    "Contractul de producție este pregătit; maparea endpointurilor și credențialele așteaptă documentația Linkhouse.",
  "marketplace.catalogConnected": "Catalog activ",
  "marketplace.catalogDemo": "Catalog demo",
  "marketplace.orderingEnabled": "Comenzi activate",
  "marketplace.orderingLocked": "Comenzi blocate",
  "marketplace.offers": "Oferte",
  "marketplace.orders": "Solicitări",
  "marketplace.search": "Căutați domenii sau subiecte…",
  "marketplace.noAnalysis":
    "Rulați analiza backlinkurilor pentru a adăuga semnale de decalaj de linkuri la potrivire. Potrivirea după subiect și piață este deja activă.",
  "marketplace.reason.linkGap": "Decalaj de linkuri față de concurenți",
  "marketplace.rank": "Rangul domeniului",
  "marketplace.traffic": "Trafic estimat",
  "marketplace.turnaround": "Durată de execuție",
  "marketplace.days": "{count} zile",
  "marketplace.price": "Preț orientativ",
  "marketplace.request": "Solicitați verificarea",
  "marketplace.reviewPrice": "Verificați prețul",
  "marketplace.quoteLocked": "Este necesară configurarea ofertei de preț",
  "marketplace.requested": "Solicitat",
  "marketplace.quoteTitle": "Verificați prețul publicării",
  "marketplace.basePrice": "Prețul furnizorului",
  "marketplace.serviceFee": "Comision de serviciu Milo ({count}%)",
  "marketplace.totalPrice": "Total exact",
  "marketplace.quoteExpires":
    "Această ofertă de preț expiră la {time}. După această oră este necesară o nouă ofertă.",
  "marketplace.confirmSponsored":
    'Solicit o declarare clară a sponsorizării și rel="sponsored" sau nofollow pentru link.',
  "marketplace.confirmPaymentLive":
    "Autorizez explicit o comandă la furnizor pentru totalul exact de €{total}.",
  "marketplace.confirmPaymentDemo":
    "Confirm solicitarea de verificare de €{total} și înțeleg că modul demo nu creează nicio comandă sau plată la furnizor.",
  "marketplace.confirmPurchase": "Confirmați comanda plătită",
  "marketplace.confirmDemoRequest": "Salvați solicitarea de verificare",
  "marketplace.confirmedAt": "Confirmat",
  "marketplace.ordersEmpty": "Nu există încă solicitări de publicare.",
  "marketplace.toast.exists": "Această ofertă are deja o solicitare activă.",
  "marketplace.toast.requested": "Solicitarea de publicare a fost salvată pentru verificare.",
  "marketplace.toast.submitted": "Comanda plătită a fost trimisă furnizorului.",
  "marketplace.toast.catalogError":
    "Catalogul furnizorului nu a putut fi reîmprospătat. Catalogul demo sigur rămâne disponibil.",
  "marketplace.toast.quoteError": "Oferta de preț nu a putut fi pregătită. Încercați din nou.",
  "marketplace.toast.quoteExpired":
    "Oferta de preț a expirat. Solicitați un preț nou înainte de confirmare.",
  "marketplace.toast.orderError": "Comanda nu a fost creată. Nu s-a efectuat nicio plată.",
  "marketplace.toast.orderReview":
    "Rezultatul la furnizor nu a putut fi confirmat. Milo a salvat solicitarea ca În verificare; nu reîncercați până când nu este reconciliată.",
  "marketplace.status.Requested": "Solicitat",
  "marketplace.status.In Review": "În verificare",
  "marketplace.status.Submitted": "Trimis",
  "marketplace.status.Accepted": "Acceptat",
  "marketplace.status.Published": "Publicat",
  "marketplace.status.Failed": "Eșuat",
  "marketplace.status.Cancelled": "Anulat",
};
