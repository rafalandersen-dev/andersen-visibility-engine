import type { OnboardingLanguage } from "@/lib/types";

export const betaGuidanceCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "betaGuide.questions":
      "Check whether owners understand Milo quickly, which markets and segments respond best, which benefits matter, willingness to pay and what to improve next.",
    "betaGuide.goalsIntro":
      "Plan structured validation with 20–30 prospects before a wider paid launch. Outreach and demos require separate authorization; this playbook is not evidence that validation has happened.",
    "betaGuide.goalUnderstanding":
      "Confirm small business owners understand Milo within the first few minutes.",
    "betaGuide.goalMarket": "Identify the strongest market (Poland, Sweden, Denmark, UK/EU).",
    "betaGuide.goalSegment":
      "Identify the strongest segment (wellness/beauty, local services, consultants, clinics, e-commerce).",
    "betaGuide.goalValue":
      "Find the benefit customers value most: audit, publishing, measurement, integrations or authority work.",
    "betaGuide.goalPrice": "Test real willingness to pay and acceptable price points.",
    "betaGuide.goalFeedback":
      "Capture the top objections, confusing screens and requested improvements.",
    "betaGuide.segmentPoland": "A — Poland wellness / local service",
    "betaGuide.segmentPolandDetail":
      "Beauty salons, massage therapists, physiotherapists, wellness studios, small clinics and local services. Test content and pricing needs; the owner's Polish network may help with conversations.",
    "betaGuide.segmentSweden": "B — Sweden wellness / local service",
    "betaGuide.segmentSwedenDetail":
      "Massage and wellness studios, clinics, consultants and local premium brands. Test local needs and willingness to pay; show Synergy Massage materials only with permission.",
    "betaGuide.segmentCommerce": "C — Small e-commerce",
    "betaGuide.segmentCommerceDetail":
      "Shopify, WooCommerce and WordPress stores and niche product brands. Test content, Search Console and authority needs. Integrations and package fit require separate verification.",
    "betaGuide.segmentAgency": "D — Agencies / freelancers",
    "betaGuide.segmentAgencyDetail":
      "Web designers, SEO freelancers and marketing consultants. Verify multi-client workflows and permissions before recommending a package.",
    "betaGuide.requireWebsite": "Existing website",
    "betaGuide.requireBusiness": "Active business",
    "betaGuide.requireDecisionMaker": "Accessible decision-maker",
    "betaGuide.requireOffer": "Visible service/product offer",
    "betaGuide.requireNeed": "Need for better content/visibility",
    "betaGuide.requireBeta": "Willing to try a guided beta",
    "betaGuide.niceCms": "WordPress or Shopify site",
    "betaGuide.niceGsc": "Google Search Console access",
    "betaGuide.niceGbp": "Google Business Profile",
    "betaGuide.niceCopy": "Weak/unclear website copy",
    "betaGuide.niceLocal": "Local market focus",
    "betaGuide.niceTraffic": "Existing traffic or ad spend",
    "betaGuide.avoidEnterprise": "Enterprise companies",
    "betaGuide.avoidRegulated": "Heavily regulated medical/legal/finance claims",
    "betaGuide.avoidGuarantees": "Demands of guaranteed rankings",
    "betaGuide.avoidMass": "Wanting cheap mass AI articles",
    "betaGuide.avoidCms": "Complex custom CMS",
    "betaGuide.avoidNoWebsite": "No website at all",
    "betaGuide.promise":
      "Proposed 30-day aim: clearer website content, priorities and a measurement plan, within an agreed pilot scope.",
    "betaGuide.offerAudit": "Free AI Visibility Readiness Audit",
    "betaGuide.offerSetup": "Milo project setup + Brand Intelligence setup",
    "betaGuide.offerReview": "Website/content gap review",
    "betaGuide.offerPlan": "First 30-day growth plan",
    "betaGuide.offerPriorities": "3–5 prioritized content opportunities",
    "betaGuide.offerDrafts":
      "1–2 drafts with Milo Score for business review; publication readiness requires separate checks",
    "betaGuide.offerPublishing":
      "Publishing support after destination verification and authorization",
    "betaGuide.offerAnalytics":
      "Analytics setup and Search Console import guidance where verified data is available",
    "betaGuide.offerAuthority": "Authority Builder starter list for review; no placement promises",
    "betaGuide.offerSummary": "Review summary and next actions",
    "betaGuide.outcome":
      "Intended outcome: an agreed plan, content priorities and documented next steps. Publishing and measurement depend on verified access, data and approvals.",
    "betaGuide.noGuarantees": "Never promise rankings, revenue, traffic or AI citations.",
    "betaGuide.pricingReference":
      "Reference prices from the app's billing catalogue: Assisted Setup is one-time; Monthly Care is recurring. Founding prices apply only to the first pilot businesses. These figures do not establish paid-launch readiness.",
    "betaGuide.paymentHold":
      "Label first-pilot pricing clearly. Stripe replaces Paddle; owner setup and payment lifecycle acceptance remain open. Paid launch is on hold. A manual status in Billing does not confirm payment or commercial readiness.",
    "betaGuide.demoWebsite": "Start with their website or approved demo materials.",
    "betaGuide.demoAudit":
      "Show a saved audit. A new live audit requires separate authorization and cost checks.",
    "betaGuide.demoScore": "Explain the score: readiness, not rankings.",
    "betaGuide.demoPublic":
      "Show the public beta or market page briefly and flag any outdated claims.",
    "betaGuide.demoApp": "Open the Milo app.",
    "betaGuide.demoSetup": "Show onboarding / project setup.",
    "betaGuide.demoBrand": "Show Brand Intelligence.",
    "betaGuide.demoPlan":
      "Show content priorities in Plan; the former Opportunities page now redirects to Plan.",
    "betaGuide.demoDraft":
      "Show a saved content draft. New generation requires separate authorization and cost checks.",
    "betaGuide.demoQuality":
      "Show Milo Score and draft-improvement options; running generation requires authorization.",
    "betaGuide.demoPublishing":
      "Show publishing settings and current connector status; destination verification and publishing approval are separate steps.",
    "betaGuide.demoMeasurement":
      "Show Analytics, Search Console evidence and Authority Builder. Identify the source, period and missing or unverified data; do not present these as measured results.",
    "betaGuide.demoClose":
      "Close with the proposed pilot scope and an agreed next step. Do not collect payment while paid launch is on hold.",
    "betaGuide.demoHonesty":
      "Talk track: Milo connects planning, content, publishing and measurement. Distinguish what has been shown from what has been verified in real use. If a connector or payment flow is unverified, say so explicitly; do not imply it is ready.",
    "betaGuide.discoveryCustomers": "What customers do you want more of?",
    "betaGuide.discoveryOffer": "Which services/products matter most now?",
    "betaGuide.discoveryMarket": "Which market/location matters most?",
    "betaGuide.discoveryLeads": "Is your website bringing inquiries/sales?",
    "betaGuide.discoveryAds": "Running Google/social ads?",
    "betaGuide.discoveryGsc": "Do you have Search Console?",
    "betaGuide.discoveryEditor": "Who updates your website now?",
    "betaGuide.discoveryFrequency": "How often do you publish?",
    "betaGuide.discoveryWriting": "What's hard about writing content?",
    "betaGuide.discoveryPages": "Do you know which pages perform best?",
    "betaGuide.discoverySearch": "Do you know what people search before contacting you?",
    "betaGuide.discoveryValue": "What would make this worth paying for?",
    "betaGuide.discoverySupport": "Self-service, guided setup, or monthly help?",
    "betaGuide.discoveryPrice": "What monthly price would feel acceptable?",
    "betaGuide.discoveryBarrier": "What would stop you from using this?",
    "betaGuide.objectionChatgpt": "“Is this just ChatGPT writing blogs?”",
    "betaGuide.answerChatgpt":
      "Milo supports audit, planning, brand rules, drafts, quality review and outcome review. Show only verified steps; publishing and measurement depend on the client's access and data.",
    "betaGuide.objectionRankings": "“Can you guarantee rankings?”",
    "betaGuide.answerRankings":
      "No. Milo helps assess readiness, improve clarity and content quality, and organize publishing and measurement. Rankings and traffic depend on many external factors.",
    "betaGuide.objectionAgency": "“I already have a website agency.”",
    "betaGuide.answerAgency":
      "Milo can support the agency with content planning and drafts. The agency still handles design, technical work and agreed approvals. Outcome measurement requires verified data.",
    "betaGuide.objectionTool": "“I don't want another tool.”",
    "betaGuide.answerTool":
      "The proposed beta includes help with project setup, a first plan and content review. Agree the support scope and responsibilities before starting.",
    "betaGuide.objectionAds": "“Why not just use Google Ads?”",
    "betaGuide.answerAds":
      "Ads and content work serve different needs. Milo helps organize website content and measurement; it does not guarantee traffic or return on investment.",
    "betaGuide.objectionSeo": "“Is this SEO?”",
    "betaGuide.answerSeo":
      "Partly. Milo supports SEO and AI visibility readiness, content planning, publishing and measurement. Readiness assessments do not prove actual rankings or AI citations.",
    "betaGuide.objectionAi": "“Is AI content safe?”",
    "betaGuide.answerAi":
      "AI output is a draft. Brand Intelligence, Milo Score and review notes support review but do not prove correctness. The business must check facts, rights and claims before publication.",
    "betaGuide.outreachInstructions":
      "Review templates before use: check current scope, availability and approvals. Keep messages personal, without false urgency or ranking guarantees. Offer an audit and 3–5 practical improvements. Replace {name}, {referrer} and {points}. Copying does not send a message.",
    "betaGuide.trackerInstructions":
      "A lightweight spreadsheet template. Download the CSV below; do not store prospect data on this playbook page.",
    "betaGuide.feedbackUnderstanding": "Understood value",
    "betaGuide.feedbackRelevance": "Relevance to business",
    "betaGuide.feedbackTrust": "Trust in AI output",
    "betaGuide.feedbackInterest": "Interest in assisted beta",
    "betaGuide.feedbackWillingness": "Willingness to pay",
    "betaGuide.feedbackPricing": "Clarity of pricing",
    "betaGuide.feedbackRecommend": "Likelihood to recommend",
    "betaGuide.feedbackUseful": "What part was most useful?",
    "betaGuide.feedbackConfusing": "What was confusing?",
    "betaGuide.feedbackUnnecessary": "What felt unnecessary?",
    "betaGuide.feedbackFirst": "What would you want first?",
    "betaGuide.feedbackPay": "What would make you pay?",
    "betaGuide.feedbackFair": "What price feels fair?",
    "betaGuide.feedbackSupport": "Self-service or guided support?",
    "betaGuide.targetProspects": "Target: 20 prospects identified",
    "betaGuide.targetAudits": "Target: 10 free audits after authorization",
    "betaGuide.targetOutreach": "Target: 10 outreach messages after contact authorization",
    "betaGuide.targetReplies": "Target: 5 replies",
    "betaGuide.targetBookings": "Target: 3 demos booked",
    "betaGuide.targetDemos": "Target: 2 demos completed",
    "betaGuide.targetCommitment":
      "Target: 1 pilot commitment; payment only after paid-launch approval",
    "betaGuide.targetFollowups": "Target: 2 warm follow-ups",
    "betaGuide.targetObjections": "Target: top 5 objections collected",
    "betaGuide.targetScreens": "Target: top 5 confusing screens",
    "betaGuide.targetImprovements": "Target: top 5 requested improvements",
    "betaGuide.decisionPrice": "Understand Milo but will not pay → refine pricing and offer.",
    "betaGuide.decisionOnboarding":
      "Like the audit but not the app → improve the audit-to-onboarding handoff.",
    "betaGuide.decisionSupport":
      "Want done-for-you support → validate Assisted Beta and Monthly Care needs before committing to delivery.",
    "betaGuide.decisionCms":
      "Ask for WordPress or Shopify → prioritize authorized end-to-end testing and documentation.",
    "betaGuide.decisionGuarantees":
      "Ask for guarantees → clarify limitations and realistic expectations.",
    "betaGuide.decisionClarity": "Are confused → simplify public/beta messaging.",
  },
  pl: {
    "betaGuide.questions":
      "Sprawdź, czy właściciele szybko rozumieją Milo, które rynki i segmenty reagują najlepiej, jakie korzyści cenią, ile chcą zapłacić i co poprawić.",
    "betaGuide.goalsIntro":
      "Plan walidacji obejmuje 20–30 potencjalnych klientów przed szerszym płatnym uruchomieniem. Kontakt i demonstracje wymagają osobnej zgody; ten poradnik nie stanowi dowodu przeprowadzonej walidacji.",
    "betaGuide.goalUnderstanding":
      "Sprawdź, czy właściciele małych firm rozumieją Milo w kilka minut.",
    "betaGuide.goalMarket":
      "Znajdź najbardziej obiecujący rynek: Polska, Szwecja, Dania, Wielka Brytania lub UE.",
    "betaGuide.goalSegment":
      "Znajdź najbardziej obiecujący segment: wellness i uroda, usługi lokalne, konsultanci, kliniki lub e-commerce.",
    "betaGuide.goalValue":
      "Sprawdź, co klienci cenią najbardziej: audyt, publikowanie, pomiar wyników, integracje czy budowanie autorytetu.",
    "betaGuide.goalPrice": "Sprawdź rzeczywistą gotowość do zapłaty i akceptowalne ceny.",
    "betaGuide.goalFeedback": "Zapisz główne obiekcje, niejasne ekrany i oczekiwane usprawnienia.",
    "betaGuide.segmentPoland": "A — Polska: wellness i usługi lokalne",
    "betaGuide.segmentPolandDetail":
      "Salony urody, masażyści, fizjoterapeuci, studia wellness, małe kliniki i usługi lokalne. Sprawdź potrzeby dotyczące treści i cen; polska sieć kontaktów właściciela może ułatwić rozmowy.",
    "betaGuide.segmentSweden": "B — Szwecja: wellness i usługi lokalne",
    "betaGuide.segmentSwedenDetail":
      "Studia masażu i wellness, kliniki, konsultanci i lokalne marki premium. Sprawdź lokalne potrzeby i gotowość do zapłaty; materiały Synergy Massage pokazuj tylko za zgodą.",
    "betaGuide.segmentCommerce": "C — Małe sklepy internetowe",
    "betaGuide.segmentCommerceDetail":
      "Sklepy Shopify, WooCommerce i WordPress oraz niszowe marki produktów. Sprawdź potrzeby dotyczące treści, Search Console i autorytetu. Integracje i wybór pakietu wymagają osobnej weryfikacji.",
    "betaGuide.segmentAgency": "D — Agencje i freelancerzy",
    "betaGuide.segmentAgencyDetail":
      "Projektanci stron, specjaliści SEO i konsultanci marketingowi. Sprawdź pracę z wieloma klientami i uprawnienia przed rekomendacją pakietu.",
    "betaGuide.requireWebsite": "Istniejąca strona internetowa",
    "betaGuide.requireBusiness": "Działająca firma",
    "betaGuide.requireDecisionMaker": "Dostęp do osoby decyzyjnej",
    "betaGuide.requireOffer": "Widoczna oferta usług lub produktów",
    "betaGuide.requireNeed": "Potrzeba lepszych treści lub widoczności",
    "betaGuide.requireBeta": "Gotowość do udziału w becie ze wsparciem",
    "betaGuide.niceCms": "Strona na WordPressie lub Shopify",
    "betaGuide.niceGsc": "Dostęp do Google Search Console",
    "betaGuide.niceGbp": "Profil Firmy w Google",
    "betaGuide.niceCopy": "Słabe lub niejasne treści na stronie",
    "betaGuide.niceLocal": "Skupienie na rynku lokalnym",
    "betaGuide.niceTraffic": "Istniejący ruch lub wydatki na reklamę",
    "betaGuide.avoidEnterprise": "Duże przedsiębiorstwa",
    "betaGuide.avoidRegulated": "Ściśle regulowane twierdzenia medyczne, prawne lub finansowe",
    "betaGuide.avoidGuarantees": "Oczekiwanie gwarantowanych pozycji",
    "betaGuide.avoidMass": "Oczekiwanie tanich, masowych artykułów AI",
    "betaGuide.avoidCms": "Złożony, niestandardowy CMS",
    "betaGuide.avoidNoWebsite": "Brak strony internetowej",
    "betaGuide.promise":
      "Proponowany cel na 30 dni: jaśniejsze treści na stronie, priorytety i plan pomiaru wyników, w ramach uzgodnionego zakresu pilotażu.",
    "betaGuide.offerAudit": "Bezpłatny audyt gotowości do widoczności w AI",
    "betaGuide.offerSetup": "Konfiguracja projektu Milo i Brand Intelligence",
    "betaGuide.offerReview": "Przegląd luk na stronie i w treściach",
    "betaGuide.offerPlan": "Pierwszy plan wzrostu na 30 dni",
    "betaGuide.offerPriorities": "3–5 priorytetowych pomysłów na treści",
    "betaGuide.offerDrafts":
      "1–2 szkice z Milo Score do oceny przez firmę; gotowość do publikacji wymaga osobnego sprawdzenia",
    "betaGuide.offerPublishing":
      "Wsparcie publikacji po weryfikacji miejsca docelowego i uzyskaniu zgody",
    "betaGuide.offerAnalytics":
      "Wsparcie konfiguracji Analytics i importu Search Console, jeśli dostępne są zweryfikowane dane",
    "betaGuide.offerAuthority":
      "Lista startowa w Authority Builder do przeglądu; bez obietnic pozyskania linków",
    "betaGuide.offerSummary": "Podsumowanie przeglądu i kolejne działania",
    "betaGuide.outcome":
      "Planowany rezultat: uzgodniony plan, priorytety treści i udokumentowane kolejne kroki. Publikacja i pomiar wyników zależą od zweryfikowanego dostępu, danych i zgód.",
    "betaGuide.noGuarantees": "Nigdy nie obiecuj pozycji, przychodów, ruchu ani cytowań w AI.",
    "betaGuide.pricingReference":
      "Ceny referencyjne z katalogu w aplikacji: konfiguracja ze wsparciem jest jednorazowa, a miesięczna opieka cykliczna. Stawki pilotażowe dotyczą wyłącznie pierwszych firm. Nie są dowodem gotowości płatnego uruchomienia.",
    "betaGuide.paymentHold":
      "Wyraźnie oznacz ceny dla pierwszych firm pilotażowych. Stripe zastępuje Paddle; konfiguracja przez właściciela i testy całego cyklu płatności pozostają otwarte. Płatne uruchomienie jest wstrzymane. Ręczny status w Billing nie potwierdza płatności ani gotowości komercyjnej.",
    "betaGuide.demoWebsite":
      "Zacznij od strony klienta lub zatwierdzonych materiałów demonstracyjnych.",
    "betaGuide.demoAudit":
      "Pokaż zapisany audyt. Nowy audyt na żywo wymaga osobnej zgody i weryfikacji kosztów.",
    "betaGuide.demoScore": "Wyjaśnij, że wynik ocenia gotowość, a nie pozycje w wyszukiwarce.",
    "betaGuide.demoPublic":
      "Krótko pokaż publiczną stronę beta lub rynku i wskaż wszelkie nieaktualne deklaracje.",
    "betaGuide.demoApp": "Otwórz aplikację Milo.",
    "betaGuide.demoSetup": "Pokaż wdrożenie i konfigurację projektu.",
    "betaGuide.demoBrand": "Pokaż Brand Intelligence.",
    "betaGuide.demoPlan":
      "Pokaż priorytety treści w Planie; dawna strona Opportunities przekierowuje teraz do Planu.",
    "betaGuide.demoDraft":
      "Pokaż zapisany szkic. Nowe generowanie wymaga osobnej zgody i weryfikacji kosztów.",
    "betaGuide.demoQuality":
      "Pokaż Milo Score i opcje poprawy szkicu; uruchomienie generowania wymaga zgody.",
    "betaGuide.demoPublishing":
      "Pokaż ustawienia publikacji i bieżący status integracji; weryfikacja miejsca docelowego i zgoda na publikację są osobnymi krokami.",
    "betaGuide.demoMeasurement":
      "Pokaż Analytics, dane Search Console i Authority Builder. Wskaż źródło, okres oraz brakujące lub niezweryfikowane dane; nie traktuj ich jako zmierzonych wyników.",
    "betaGuide.demoClose":
      "Zakończ proponowanym zakresem pilotażu i uzgodnionym kolejnym krokiem. Nie pobieraj płatności, dopóki uruchomienie jest wstrzymane.",
    "betaGuide.demoHonesty":
      "Przekaz: Milo łączy planowanie, tworzenie treści, publikację i pomiar. Wyraźnie odróżniaj to, co pokazano, od tego, co potwierdzono w rzeczywistym użyciu. Jeśli integracja lub płatności nie zostały zweryfikowane, powiedz to wprost; nie sugeruj, że są gotowe.",
    "betaGuide.discoveryCustomers": "Jakich klientów chcesz pozyskiwać więcej?",
    "betaGuide.discoveryOffer": "Które usługi lub produkty są teraz najważniejsze?",
    "betaGuide.discoveryMarket": "Który rynek lub lokalizacja jest najważniejsza?",
    "betaGuide.discoveryLeads": "Czy strona przynosi zapytania lub sprzedaż?",
    "betaGuide.discoveryAds": "Czy prowadzisz reklamy w Google lub mediach społecznościowych?",
    "betaGuide.discoveryGsc": "Czy masz dostęp do Search Console?",
    "betaGuide.discoveryEditor": "Kto obecnie aktualizuje Twoją stronę?",
    "betaGuide.discoveryFrequency": "Jak często publikujesz?",
    "betaGuide.discoveryWriting": "Co sprawia trudność w pisaniu treści?",
    "betaGuide.discoveryPages": "Czy wiesz, które strony osiągają najlepsze wyniki?",
    "betaGuide.discoverySearch": "Czy wiesz, czego ludzie szukają przed kontaktem z Tobą?",
    "betaGuide.discoveryValue": "Co sprawiłoby, że warto byłoby za to zapłacić?",
    "betaGuide.discoverySupport": "Samoobsługa, konfiguracja ze wsparciem czy comiesięczna pomoc?",
    "betaGuide.discoveryPrice": "Jaka miesięczna cena byłaby akceptowalna?",
    "betaGuide.discoveryBarrier": "Co powstrzymałoby Cię przed korzystaniem z tego?",
    "betaGuide.objectionChatgpt": "„Czy to tylko ChatGPT piszący blogi?”",
    "betaGuide.answerChatgpt":
      "Milo wspiera audyt, planowanie, zasady marki, szkice, ocenę jakości i przegląd wyników. Pokazuj wyłącznie zweryfikowane etapy; publikacja i pomiar zależą od dostępu i danych klienta.",
    "betaGuide.objectionRankings": "„Czy gwarantujecie pozycje w wyszukiwarce?”",
    "betaGuide.answerRankings":
      "Nie. Milo pomaga ocenić gotowość, poprawić przejrzystość i jakość treści oraz uporządkować publikację i pomiar. Pozycje i ruch zależą od wielu czynników zewnętrznych.",
    "betaGuide.objectionAgency": "„Mam już agencję obsługującą stronę.”",
    "betaGuide.answerAgency":
      "Milo może wspierać agencję w planowaniu treści i przygotowaniu szkiców. Agencja nadal odpowiada za projektowanie, prace techniczne i uzgodnione zatwierdzenia. Pomiar wyników wymaga zweryfikowanych danych.",
    "betaGuide.objectionTool": "„Nie chcę kolejnego narzędzia.”",
    "betaGuide.answerTool":
      "Proponowana beta obejmuje pomoc w konfiguracji projektu, przygotowaniu pierwszego planu i przeglądzie treści. Przed rozpoczęciem uzgodnij zakres pomocy i odpowiedzialności.",
    "betaGuide.objectionAds": "„Dlaczego nie korzystać po prostu z Google Ads?”",
    "betaGuide.answerAds":
      "Reklamy i praca nad treściami odpowiadają na różne potrzeby. Milo pomaga uporządkować treści strony i pomiar wyników; nie gwarantuje ruchu ani zwrotu z inwestycji.",
    "betaGuide.objectionSeo": "„Czy to SEO?”",
    "betaGuide.answerSeo":
      "Częściowo. Milo wspiera gotowość do SEO i widoczności w AI, planowanie treści, publikację i pomiar. Oceny gotowości nie są dowodem rzeczywistych pozycji ani cytowań w AI.",
    "betaGuide.objectionAi": "„Czy treści AI są bezpieczne?”",
    "betaGuide.answerAi":
      "Treść AI to szkic. Brand Intelligence, Milo Score i uwagi pomagają w przeglądzie, ale nie potwierdzają poprawności. Firma musi sprawdzić fakty, prawa i twierdzenia przed publikacją.",
    "betaGuide.outreachInstructions":
      "Wzory wymagają przeglądu przed użyciem: sprawdź aktualny zakres, dostępność i zgody. Pisz osobiście, bez sztucznej presji ani gwarancji pozycji. Zaproponuj audyt i 3–5 praktycznych usprawnień. Zastąp {name}, {referrer} i {points}. Kopiowanie nie wysyła wiadomości.",
    "betaGuide.trackerInstructions":
      "Prosty szablon do arkusza kalkulacyjnego. Pobierz poniższy plik CSV; nie zapisuj danych potencjalnych klientów na tej stronie poradnika.",
    "betaGuide.feedbackUnderstanding": "Zrozumienie wartości",
    "betaGuide.feedbackRelevance": "Przydatność dla firmy",
    "betaGuide.feedbackTrust": "Zaufanie do treści AI",
    "betaGuide.feedbackInterest": "Zainteresowanie betą ze wsparciem",
    "betaGuide.feedbackWillingness": "Gotowość do zapłaty",
    "betaGuide.feedbackPricing": "Przejrzystość cen",
    "betaGuide.feedbackRecommend": "Skłonność do polecenia",
    "betaGuide.feedbackUseful": "Co było najbardziej przydatne?",
    "betaGuide.feedbackConfusing": "Co było niejasne?",
    "betaGuide.feedbackUnnecessary": "Co wydawało się zbędne?",
    "betaGuide.feedbackFirst": "Co chcesz otrzymać najpierw?",
    "betaGuide.feedbackPay": "Co skłoniłoby Cię do zapłaty?",
    "betaGuide.feedbackFair": "Jaka cena wydaje się uczciwa?",
    "betaGuide.feedbackSupport": "Samoobsługa czy pomoc we wdrożeniu?",
    "betaGuide.targetProspects": "Cel: 20 zidentyfikowanych potencjalnych klientów",
    "betaGuide.targetAudits": "Cel: 10 bezpłatnych audytów po uzyskaniu zgody",
    "betaGuide.targetOutreach": "Cel: 10 wiadomości po uzyskaniu zgody na kontakt",
    "betaGuide.targetReplies": "Cel: 5 odpowiedzi",
    "betaGuide.targetBookings": "Cel: 3 umówione demonstracje",
    "betaGuide.targetDemos": "Cel: 2 przeprowadzone demonstracje",
    "betaGuide.targetCommitment":
      "Cel: 1 deklaracja udziału w pilotażu; płatność dopiero po zatwierdzeniu płatnego uruchomienia",
    "betaGuide.targetFollowups": "Cel: 2 ponowne kontakty z zainteresowanymi osobami",
    "betaGuide.targetObjections": "Cel: 5 najważniejszych obiekcji",
    "betaGuide.targetScreens": "Cel: 5 najbardziej niejasnych ekranów",
    "betaGuide.targetImprovements": "Cel: 5 najczęściej oczekiwanych usprawnień",
    "betaGuide.decisionPrice": "Rozumieją Milo, ale nie chcą płacić → dopracuj cenę i ofertę.",
    "betaGuide.decisionOnboarding":
      "Podoba im się audyt, ale nie aplikacja → popraw przejście od audytu do wdrożenia.",
    "betaGuide.decisionSupport":
      "Chcą pełnej obsługi → sprawdź potrzeby w zakresie bety ze wsparciem i miesięcznej opieki przed zobowiązaniem się do usługi.",
    "betaGuide.decisionCms":
      "Pytają o WordPress lub Shopify → nadaj priorytet zatwierdzonym testom pełnego przepływu i dokumentacji.",
    "betaGuide.decisionGuarantees":
      "Pytają o gwarancje → jasno wyjaśnij ograniczenia i realistyczne oczekiwania.",
    "betaGuide.decisionClarity":
      "Są zdezorientowani → uprość komunikację publiczną i dotyczącą bety.",
  },
  sv: {
    "betaGuide.questions":
      "Undersök om ägare snabbt förstår Milo, vilka marknader och segment som svarar bäst, vilka fördelar de värderar, vad de vill betala och vad som behöver förbättras.",
    "betaGuide.goalsIntro":
      "Planera validering med 20–30 potentiella kunder före en bredare betald lansering. Kontakt och demonstrationer kräver separat godkännande; denna guide är inget bevis på genomförd validering.",
    "betaGuide.goalUnderstanding": "Bekräfta att småföretagare förstår Milo inom några minuter.",
    "betaGuide.goalMarket":
      "Identifiera den mest lovande marknaden: Polen, Sverige, Danmark, Storbritannien eller EU.",
    "betaGuide.goalSegment":
      "Identifiera det mest lovande segmentet: wellness och skönhet, lokala tjänster, konsulter, kliniker eller e-handel.",
    "betaGuide.goalValue":
      "Ta reda på vad kunderna värderar mest: granskning, publicering, resultatmätning, integrationer eller stärkt auktoritet.",
    "betaGuide.goalPrice": "Undersök faktisk betalningsvilja och acceptabla prisnivåer.",
    "betaGuide.goalFeedback":
      "Dokumentera de viktigaste invändningarna, otydliga vyer och önskade förbättringar.",
    "betaGuide.segmentPoland": "A — Polen: wellness och lokala tjänster",
    "betaGuide.segmentPolandDetail":
      "Skönhetssalonger, massörer, fysioterapeuter, wellnessstudior, små kliniker och lokala tjänster. Undersök behov kring innehåll och pris; ägarens polska nätverk kan underlätta samtal.",
    "betaGuide.segmentSweden": "B — Sverige: wellness och lokala tjänster",
    "betaGuide.segmentSwedenDetail":
      "Massage- och wellnessstudior, kliniker, konsulter och lokala premiummärken. Undersök lokala behov och betalningsvilja; visa material från Synergy Massage endast med tillstånd.",
    "betaGuide.segmentCommerce": "C — Små e-handelsföretag",
    "betaGuide.segmentCommerceDetail":
      "Shopify-, WooCommerce- och WordPress-butiker samt nischade produktmärken. Undersök behov kring innehåll, Search Console och auktoritet. Integrationer och paketval kräver separat verifiering.",
    "betaGuide.segmentAgency": "D — Byråer och frilansare",
    "betaGuide.segmentAgencyDetail":
      "Webbdesigners, SEO-specialister och marknadskonsulter. Verifiera arbete med flera kunder och behörigheter innan du rekommenderar ett paket.",
    "betaGuide.requireWebsite": "Befintlig webbplats",
    "betaGuide.requireBusiness": "Aktiv verksamhet",
    "betaGuide.requireDecisionMaker": "Tillgänglig beslutsfattare",
    "betaGuide.requireOffer": "Synligt tjänste- eller produkterbjudande",
    "betaGuide.requireNeed": "Behov av bättre innehåll eller synlighet",
    "betaGuide.requireBeta": "Villig att prova en guidad beta",
    "betaGuide.niceCms": "WordPress- eller Shopify-webbplats",
    "betaGuide.niceGsc": "Tillgång till Google Search Console",
    "betaGuide.niceGbp": "Google Företagsprofil",
    "betaGuide.niceCopy": "Svag eller otydlig webbtext",
    "betaGuide.niceLocal": "Fokus på lokal marknad",
    "betaGuide.niceTraffic": "Befintlig trafik eller annonsbudget",
    "betaGuide.avoidEnterprise": "Stora företag",
    "betaGuide.avoidRegulated":
      "Strikt reglerade medicinska, juridiska eller finansiella påståenden",
    "betaGuide.avoidGuarantees": "Krav på garanterade placeringar",
    "betaGuide.avoidMass": "Önskemål om billiga AI-artiklar i mängd",
    "betaGuide.avoidCms": "Komplext specialbyggt CMS",
    "betaGuide.avoidNoWebsite": "Ingen webbplats alls",
    "betaGuide.promise":
      "Föreslaget mål för 30 dagar: tydligare webbplatsinnehåll, prioriteringar och en plan för resultatmätning inom pilotens överenskomna omfattning.",
    "betaGuide.offerAudit": "Kostnadsfri granskning av beredskap för AI-synlighet",
    "betaGuide.offerSetup": "Konfiguration av Milo-projekt och Brand Intelligence",
    "betaGuide.offerReview": "Granskning av luckor på webbplatsen och i innehållet",
    "betaGuide.offerPlan": "Första tillväxtplanen för 30 dagar",
    "betaGuide.offerPriorities": "3–5 prioriterade innehållsidéer",
    "betaGuide.offerDrafts":
      "1–2 utkast med Milo Score för företagets granskning; publiceringsberedskap kräver separat kontroll",
    "betaGuide.offerPublishing":
      "Publiceringsstöd efter verifiering av destinationen och godkännande",
    "betaGuide.offerAnalytics":
      "Hjälp med Analytics och Search Console-import när verifierade data finns",
    "betaGuide.offerAuthority":
      "Startlista i Authority Builder för granskning; inga löften om länkar",
    "betaGuide.offerSummary": "Sammanfattning av granskningen och nästa steg",
    "betaGuide.outcome":
      "Avsett resultat: en överenskommen plan, innehållsprioriteringar och dokumenterade nästa steg. Publicering och resultatmätning beror på verifierad åtkomst, data och godkännanden.",
    "betaGuide.noGuarantees": "Lova aldrig placeringar, intäkter, trafik eller AI-citeringar.",
    "betaGuide.pricingReference":
      "Referenspriser från appens katalog: assisterad uppsättning är en engångstjänst och månatlig hjälp är återkommande. Pilotpriser gäller endast de första företagen. De visar inte att en betald lansering är godkänd.",
    "betaGuide.paymentHold":
      "Märk priser för de första pilotföretagen tydligt. Stripe ersätter Paddle; ägarens konfiguration och tester av hela betalningscykeln återstår. Betald lansering är pausad. En manuell status i Billing bekräftar varken betalning eller kommersiell beredskap.",
    "betaGuide.demoWebsite": "Börja med kundens webbplats eller godkänt demomaterial.",
    "betaGuide.demoAudit":
      "Visa en sparad granskning. En ny livegranskning kräver separat godkännande och kostnadskontroll.",
    "betaGuide.demoScore": "Förklara att poängen bedömer beredskap, inte sökplaceringar.",
    "betaGuide.demoPublic":
      "Visa kort den offentliga beta- eller marknadssidan och påpeka eventuella inaktuella påståenden.",
    "betaGuide.demoApp": "Öppna Milo-appen.",
    "betaGuide.demoSetup": "Visa introduktion och projektkonfiguration.",
    "betaGuide.demoBrand": "Visa Brand Intelligence.",
    "betaGuide.demoPlan":
      "Visa innehållsprioriteringar i Plan; den tidigare sidan Opportunities omdirigerar nu till Plan.",
    "betaGuide.demoDraft":
      "Visa ett sparat utkast. Ny generering kräver separat godkännande och kostnadskontroll.",
    "betaGuide.demoQuality":
      "Visa Milo Score och alternativ för att förbättra utkastet; generering kräver godkännande.",
    "betaGuide.demoPublishing":
      "Visa publiceringsinställningar och aktuell integrationsstatus; verifiering av destinationen och publiceringsgodkännande är separata steg.",
    "betaGuide.demoMeasurement":
      "Visa Analytics, Search Console-data och Authority Builder. Ange källa, tidsperiod och saknade eller overifierade data; behandla dem inte som uppmätta resultat.",
    "betaGuide.demoClose":
      "Avsluta med föreslagen pilotomfattning och ett överenskommet nästa steg. Ta inte betalt medan lanseringen är pausad.",
    "betaGuide.demoHonesty":
      "Budskap: Milo kopplar samman planering, innehåll, publicering och mätning. Skilj tydligt mellan det som visats och det som verifierats i verklig användning. Om en integration eller betalning inte har verifierats, säg det tydligt; antyd inte att den är klar.",
    "betaGuide.discoveryCustomers": "Vilka kunder vill du ha fler av?",
    "betaGuide.discoveryOffer": "Vilka tjänster eller produkter är viktigast just nu?",
    "betaGuide.discoveryMarket": "Vilken marknad eller plats är viktigast?",
    "betaGuide.discoveryLeads": "Ger webbplatsen förfrågningar eller försäljning?",
    "betaGuide.discoveryAds": "Annonserar du på Google eller sociala medier?",
    "betaGuide.discoveryGsc": "Har du tillgång till Search Console?",
    "betaGuide.discoveryEditor": "Vem uppdaterar din webbplats nu?",
    "betaGuide.discoveryFrequency": "Hur ofta publicerar du?",
    "betaGuide.discoveryWriting": "Vad är svårt med att skriva innehåll?",
    "betaGuide.discoveryPages": "Vet du vilka sidor som presterar bäst?",
    "betaGuide.discoverySearch": "Vet du vad folk söker efter innan de kontaktar dig?",
    "betaGuide.discoveryValue": "Vad skulle göra detta värt att betala för?",
    "betaGuide.discoverySupport": "Självservice, guidad uppsättning eller månatlig hjälp?",
    "betaGuide.discoveryPrice": "Vilket månadspris skulle kännas acceptabelt?",
    "betaGuide.discoveryBarrier": "Vad skulle hindra dig från att använda detta?",
    "betaGuide.objectionChatgpt": "”Är detta bara ChatGPT som skriver bloggar?”",
    "betaGuide.answerChatgpt":
      "Milo stöder granskning, planering, varumärkesregler, utkast, kvalitetsbedömning och resultatuppföljning. Visa endast verifierade steg; publicering och mätning beror på kundens åtkomst och data.",
    "betaGuide.objectionRankings": "”Kan ni garantera placeringar?”",
    "betaGuide.answerRankings":
      "Nej. Milo hjälper till att bedöma beredskap, förbättra tydlighet och innehållskvalitet samt strukturera publicering och mätning. Placeringar och trafik beror på många externa faktorer.",
    "betaGuide.objectionAgency": "”Jag har redan en webbyrå.”",
    "betaGuide.answerAgency":
      "Milo kan stödja byrån med innehållsplanering och utkast. Byrån ansvarar fortsatt för design, tekniskt arbete och överenskomna godkännanden. Resultatmätning kräver verifierade data.",
    "betaGuide.objectionTool": "”Jag vill inte ha ännu ett verktyg.”",
    "betaGuide.answerTool":
      "Den föreslagna betan omfattar hjälp med projektkonfiguration, en första plan och innehållsgranskning. Kom överens om stödets omfattning och ansvar innan ni börjar.",
    "betaGuide.objectionAds": "”Varför inte bara använda Google Ads?”",
    "betaGuide.answerAds":
      "Annonser och innehållsarbete fyller olika behov. Milo hjälper till att strukturera webbplatsinnehåll och resultatmätning; det garanterar inte trafik eller avkastning.",
    "betaGuide.objectionSeo": "”Är detta SEO?”",
    "betaGuide.answerSeo":
      "Delvis. Milo stöder SEO-beredskap och beredskap för AI-synlighet, innehållsplanering, publicering och mätning. Beredskapsbedömningar bevisar inte faktiska placeringar eller AI-citeringar.",
    "betaGuide.objectionAi": "”Är AI-innehåll säkert?”",
    "betaGuide.answerAi":
      "AI-innehåll är ett utkast. Brand Intelligence, Milo Score och anteckningar stöder granskningen men bevisar inte att innehållet är korrekt. Företaget måste kontrollera fakta, rättigheter och påståenden före publicering.",
    "betaGuide.outreachInstructions":
      "Granska mallarna före användning: kontrollera aktuell omfattning, tillgänglighet och godkännanden. Skriv personligt, utan falsk brådska eller placeringsgarantier. Föreslå en granskning och 3–5 praktiska förbättringar. Ersätt {name}, {referrer} och {points}. Kopiering skickar inget meddelande.",
    "betaGuide.trackerInstructions":
      "En enkel mall för ett kalkylblad. Hämta CSV-filen nedan; spara inte prospektdata på denna guidesida.",
    "betaGuide.feedbackUnderstanding": "Förståelse av värdet",
    "betaGuide.feedbackRelevance": "Relevans för verksamheten",
    "betaGuide.feedbackTrust": "Förtroende för AI-innehåll",
    "betaGuide.feedbackInterest": "Intresse för assisterad beta",
    "betaGuide.feedbackWillingness": "Betalningsvilja",
    "betaGuide.feedbackPricing": "Tydlighet i prissättningen",
    "betaGuide.feedbackRecommend": "Benägenhet att rekommendera",
    "betaGuide.feedbackUseful": "Vilken del var mest användbar?",
    "betaGuide.feedbackConfusing": "Vad var otydligt?",
    "betaGuide.feedbackUnnecessary": "Vad kändes onödigt?",
    "betaGuide.feedbackFirst": "Vad skulle du vilja ha först?",
    "betaGuide.feedbackPay": "Vad skulle få dig att betala?",
    "betaGuide.feedbackFair": "Vilket pris känns rimligt?",
    "betaGuide.feedbackSupport": "Självservice eller guidat stöd?",
    "betaGuide.targetProspects": "Mål: 20 identifierade potentiella kunder",
    "betaGuide.targetAudits": "Mål: 10 kostnadsfria granskningar efter godkännande",
    "betaGuide.targetOutreach": "Mål: 10 meddelanden efter godkännande för kontakt",
    "betaGuide.targetReplies": "Mål: 5 svar",
    "betaGuide.targetBookings": "Mål: 3 bokade demonstrationer",
    "betaGuide.targetDemos": "Mål: 2 genomförda demonstrationer",
    "betaGuide.targetCommitment":
      "Mål: 1 åtagande att delta i piloten; betalning först efter godkänd betald lansering",
    "betaGuide.targetFollowups": "Mål: 2 uppföljningar med intresserade kontakter",
    "betaGuide.targetObjections": "Mål: 5 viktigaste invändningar",
    "betaGuide.targetScreens": "Mål: 5 mest otydliga vyer",
    "betaGuide.targetImprovements": "Mål: 5 mest efterfrågade förbättringar",
    "betaGuide.decisionPrice": "Förstår Milo men vill inte betala → förfina pris och erbjudande.",
    "betaGuide.decisionOnboarding":
      "Gillar granskningen men inte appen → förbättra övergången från granskning till introduktion.",
    "betaGuide.decisionSupport":
      "Vill ha full service → undersök behovet av assisterad beta och månatlig hjälp innan du lovar leverans.",
    "betaGuide.decisionCms":
      "Frågar om WordPress eller Shopify → prioritera godkända tester av hela flödet och dokumentation.",
    "betaGuide.decisionGuarantees":
      "Frågar om garantier → förtydliga begränsningar och realistiska förväntningar.",
    "betaGuide.decisionClarity": "Är förvirrade → förenkla offentlig information och betabudskap.",
  },
  da: {
    "betaGuide.questions":
      "Undersøg, om ejere hurtigt forstår Milo, hvilke markeder og segmenter der reagerer bedst, hvilke fordele de værdsætter, hvad de vil betale, og hvad der skal forbedres.",
    "betaGuide.goalsIntro":
      "Planlæg validering med 20–30 potentielle kunder før en bredere betalt lancering. Kontakt og demonstrationer kræver særskilt godkendelse; denne vejledning dokumenterer ikke gennemført validering.",
    "betaGuide.goalUnderstanding": "Bekræft, at små virksomhedsejere forstår Milo på få minutter.",
    "betaGuide.goalMarket":
      "Find det mest lovende marked: Polen, Sverige, Danmark, Storbritannien eller EU.",
    "betaGuide.goalSegment":
      "Find det mest lovende segment: wellness og skønhed, lokale tjenester, konsulenter, klinikker eller e-handel.",
    "betaGuide.goalValue":
      "Find ud af, hvad kunderne værdsætter mest: gennemgang, publicering, resultatmåling, integrationer eller opbygning af autoritet.",
    "betaGuide.goalPrice": "Undersøg reel betalingsvillighed og acceptable prisniveauer.",
    "betaGuide.goalFeedback":
      "Registrer de vigtigste indvendinger, uklare skærmbilleder og ønskede forbedringer.",
    "betaGuide.segmentPoland": "A — Polen: wellness og lokale tjenester",
    "betaGuide.segmentPolandDetail":
      "Skønhedssaloner, massører, fysioterapeuter, wellnessstudier, små klinikker og lokale tjenester. Undersøg behov for indhold og pris; ejerens polske netværk kan lette samtalerne.",
    "betaGuide.segmentSweden": "B — Sverige: wellness og lokale tjenester",
    "betaGuide.segmentSwedenDetail":
      "Massage- og wellnessstudier, klinikker, konsulenter og lokale premiummærker. Undersøg lokale behov og betalingsvillighed; vis kun materiale fra Synergy Massage med tilladelse.",
    "betaGuide.segmentCommerce": "C — Små e-handelsvirksomheder",
    "betaGuide.segmentCommerceDetail":
      "Shopify-, WooCommerce- og WordPress-butikker samt nichebrands. Undersøg behov for indhold, Search Console og autoritet. Integrationer og pakkevalg kræver særskilt verificering.",
    "betaGuide.segmentAgency": "D — Bureauer og freelancere",
    "betaGuide.segmentAgencyDetail":
      "Webdesignere, SEO-specialister og marketingkonsulenter. Verificer arbejde med flere kunder og rettigheder, før du anbefaler en pakke.",
    "betaGuide.requireWebsite": "Eksisterende hjemmeside",
    "betaGuide.requireBusiness": "Aktiv virksomhed",
    "betaGuide.requireDecisionMaker": "Tilgængelig beslutningstager",
    "betaGuide.requireOffer": "Synligt service- eller produkttilbud",
    "betaGuide.requireNeed": "Behov for bedre indhold eller synlighed",
    "betaGuide.requireBeta": "Villig til at prøve en guidet beta",
    "betaGuide.niceCms": "WordPress- eller Shopify-hjemmeside",
    "betaGuide.niceGsc": "Adgang til Google Search Console",
    "betaGuide.niceGbp": "Google Virksomhedsprofil",
    "betaGuide.niceCopy": "Svag eller uklar hjemmesidetekst",
    "betaGuide.niceLocal": "Fokus på det lokale marked",
    "betaGuide.niceTraffic": "Eksisterende trafik eller annonceudgifter",
    "betaGuide.avoidEnterprise": "Store virksomheder",
    "betaGuide.avoidRegulated": "Strengt regulerede medicinske, juridiske eller finansielle udsagn",
    "betaGuide.avoidGuarantees": "Krav om garanterede placeringer",
    "betaGuide.avoidMass": "Ønske om billige AI-artikler i store mængder",
    "betaGuide.avoidCms": "Komplekst specialbygget CMS",
    "betaGuide.avoidNoWebsite": "Ingen hjemmeside",
    "betaGuide.promise":
      "Foreslået mål for 30 dage: tydeligere hjemmesideindhold, prioriteter og en plan for resultatmåling inden for pilotens aftalte omfang.",
    "betaGuide.offerAudit": "Gratis gennemgang af parathed til AI-synlighed",
    "betaGuide.offerSetup": "Opsætning af Milo-projekt og Brand Intelligence",
    "betaGuide.offerReview": "Gennemgang af mangler på hjemmesiden og i indholdet",
    "betaGuide.offerPlan": "Første vækstplan for 30 dage",
    "betaGuide.offerPriorities": "3–5 prioriterede indholdsidéer",
    "betaGuide.offerDrafts":
      "1–2 udkast med Milo Score til virksomhedens gennemgang; publiceringsparathed kræver særskilt kontrol",
    "betaGuide.offerPublishing":
      "Publiceringsstøtte efter verificering af destinationen og godkendelse",
    "betaGuide.offerAnalytics":
      "Hjælp til Analytics og Search Console-import, når verificerede data er tilgængelige",
    "betaGuide.offerAuthority":
      "Startliste i Authority Builder til gennemgang; ingen løfter om links",
    "betaGuide.offerSummary": "Opsummering af gennemgangen og næste skridt",
    "betaGuide.outcome":
      "Tilsigtet resultat: en aftalt plan, indholdsprioriteter og dokumenterede næste skridt. Publicering og resultatmåling afhænger af verificeret adgang, data og godkendelser.",
    "betaGuide.noGuarantees": "Lov aldrig placeringer, omsætning, trafik eller AI-citeringer.",
    "betaGuide.pricingReference":
      "Referencepriser fra appens katalog: assisteret opsætning er en engangsydelse, og månedlig hjælp er tilbagevendende. Pilotpriser gælder kun de første virksomheder. De dokumenterer ikke godkendelse af en betalt lancering.",
    "betaGuide.paymentHold":
      "Markér priser til de første pilotvirksomheder tydeligt. Stripe erstatter Paddle; ejerens opsætning og test af hele betalingsforløbet udestår. Betalt lancering er sat på pause. En manuel status i Billing bekræfter hverken betaling eller kommerciel parathed.",
    "betaGuide.demoWebsite": "Start med kundens hjemmeside eller godkendt demomateriale.",
    "betaGuide.demoAudit":
      "Vis en gemt gennemgang. En ny livegennemgang kræver særskilt godkendelse og omkostningskontrol.",
    "betaGuide.demoScore": "Forklar, at scoren vurderer parathed, ikke placeringer i søgninger.",
    "betaGuide.demoPublic":
      "Vis kort den offentlige beta- eller markedsside, og påpeg eventuelle forældede udsagn.",
    "betaGuide.demoApp": "Åbn Milo-appen.",
    "betaGuide.demoSetup": "Vis introduktion og projektopsætning.",
    "betaGuide.demoBrand": "Vis Brand Intelligence.",
    "betaGuide.demoPlan":
      "Vis indholdsprioriteter i Plan; den tidligere side Opportunities omdirigerer nu til Plan.",
    "betaGuide.demoDraft":
      "Vis et gemt udkast. Ny generering kræver særskilt godkendelse og omkostningskontrol.",
    "betaGuide.demoQuality":
      "Vis Milo Score og muligheder for at forbedre udkastet; generering kræver godkendelse.",
    "betaGuide.demoPublishing":
      "Vis publiceringsindstillinger og aktuel integrationsstatus; verificering af destinationen og publiceringsgodkendelse er særskilte trin.",
    "betaGuide.demoMeasurement":
      "Vis Analytics, Search Console-data og Authority Builder. Angiv kilde, periode og manglende eller uverificerede data; behandl dem ikke som målte resultater.",
    "betaGuide.demoClose":
      "Afslut med det foreslåede pilotomfang og et aftalt næste skridt. Opkræv ikke betaling, mens lanceringen er sat på pause.",
    "betaGuide.demoHonesty":
      "Budskab: Milo forbinder planlægning, indhold, publicering og måling. Skeln tydeligt mellem det, der er vist, og det, der er verificeret i reel brug. Hvis en integration eller betaling ikke er verificeret, så sig det tydeligt; antyd ikke, at den er klar.",
    "betaGuide.discoveryCustomers": "Hvilke kunder vil du gerne have flere af?",
    "betaGuide.discoveryOffer": "Hvilke tjenester eller produkter er vigtigst lige nu?",
    "betaGuide.discoveryMarket": "Hvilket marked eller sted er vigtigst?",
    "betaGuide.discoveryLeads": "Giver hjemmesiden henvendelser eller salg?",
    "betaGuide.discoveryAds": "Annoncerer du på Google eller sociale medier?",
    "betaGuide.discoveryGsc": "Har du adgang til Search Console?",
    "betaGuide.discoveryEditor": "Hvem opdaterer din hjemmeside nu?",
    "betaGuide.discoveryFrequency": "Hvor ofte publicerer du?",
    "betaGuide.discoveryWriting": "Hvad er svært ved at skrive indhold?",
    "betaGuide.discoveryPages": "Ved du, hvilke sider der klarer sig bedst?",
    "betaGuide.discoverySearch": "Ved du, hvad folk søger efter, før de kontakter dig?",
    "betaGuide.discoveryValue": "Hvad ville gøre dette værd at betale for?",
    "betaGuide.discoverySupport": "Selvbetjening, guidet opsætning eller månedlig hjælp?",
    "betaGuide.discoveryPrice": "Hvilken månedspris ville føles acceptabel?",
    "betaGuide.discoveryBarrier": "Hvad ville forhindre dig i at bruge dette?",
    "betaGuide.objectionChatgpt": "”Er det bare ChatGPT, der skriver blogs?”",
    "betaGuide.answerChatgpt":
      "Milo understøtter gennemgang, planlægning, brandregler, udkast, kvalitetsvurdering og resultatopfølgning. Vis kun verificerede trin; publicering og måling afhænger af kundens adgang og data.",
    "betaGuide.objectionRankings": "”Kan I garantere placeringer?”",
    "betaGuide.answerRankings":
      "Nej. Milo hjælper med at vurdere parathed, forbedre klarhed og indholdskvalitet samt strukturere publicering og måling. Placeringer og trafik afhænger af mange eksterne faktorer.",
    "betaGuide.objectionAgency": "”Jeg har allerede et webbureau.”",
    "betaGuide.answerAgency":
      "Milo kan støtte bureauet med indholdsplanlægning og udkast. Bureauet har fortsat ansvar for design, teknisk arbejde og aftalte godkendelser. Resultatmåling kræver verificerede data.",
    "betaGuide.objectionTool": "”Jeg vil ikke have endnu et værktøj.”",
    "betaGuide.answerTool":
      "Den foreslåede beta omfatter hjælp til projektopsætning, en første plan og indholdsgennemgang. Aftal støttens omfang og ansvar, før I starter.",
    "betaGuide.objectionAds": "”Hvorfor ikke bare bruge Google Ads?”",
    "betaGuide.answerAds":
      "Annoncer og indholdsarbejde opfylder forskellige behov. Milo hjælper med at strukturere hjemmesideindhold og resultatmåling; det garanterer ikke trafik eller afkast.",
    "betaGuide.objectionSeo": "”Er det SEO?”",
    "betaGuide.answerSeo":
      "Delvist. Milo understøtter SEO-parathed og parathed til AI-synlighed, indholdsplanlægning, publicering og måling. Parathedsvurderinger dokumenterer ikke faktiske placeringer eller AI-citeringer.",
    "betaGuide.objectionAi": "”Er AI-indhold sikkert?”",
    "betaGuide.answerAi":
      "AI-indhold er et udkast. Brand Intelligence, Milo Score og noter støtter gennemgangen, men beviser ikke, at indholdet er korrekt. Virksomheden skal kontrollere fakta, rettigheder og udsagn før publicering.",
    "betaGuide.outreachInstructions":
      "Gennemgå skabelonerne før brug: kontrollér aktuelt omfang, tilgængelighed og godkendelser. Skriv personligt, uden falsk hastværk eller placeringsgarantier. Foreslå en gennemgang og 3–5 praktiske forbedringer. Erstat {name}, {referrer} og {points}. Kopiering sender ingen besked.",
    "betaGuide.trackerInstructions":
      "En enkel skabelon til et regneark. Hent CSV-filen nedenfor; gem ikke kundeemnedata på denne vejledningsside.",
    "betaGuide.feedbackUnderstanding": "Forståelse af værdien",
    "betaGuide.feedbackRelevance": "Relevans for virksomheden",
    "betaGuide.feedbackTrust": "Tillid til AI-indhold",
    "betaGuide.feedbackInterest": "Interesse for assisteret beta",
    "betaGuide.feedbackWillingness": "Betalingsvillighed",
    "betaGuide.feedbackPricing": "Klarhed i prissætningen",
    "betaGuide.feedbackRecommend": "Tilbøjelighed til at anbefale",
    "betaGuide.feedbackUseful": "Hvilken del var mest nyttig?",
    "betaGuide.feedbackConfusing": "Hvad var uklart?",
    "betaGuide.feedbackUnnecessary": "Hvad føltes unødvendigt?",
    "betaGuide.feedbackFirst": "Hvad ville du gerne have først?",
    "betaGuide.feedbackPay": "Hvad ville få dig til at betale?",
    "betaGuide.feedbackFair": "Hvilken pris føles rimelig?",
    "betaGuide.feedbackSupport": "Selvbetjening eller guidet støtte?",
    "betaGuide.targetProspects": "Mål: 20 identificerede potentielle kunder",
    "betaGuide.targetAudits": "Mål: 10 gratis gennemgange efter godkendelse",
    "betaGuide.targetOutreach": "Mål: 10 beskeder efter godkendelse af kontakt",
    "betaGuide.targetReplies": "Mål: 5 svar",
    "betaGuide.targetBookings": "Mål: 3 bookede demonstrationer",
    "betaGuide.targetDemos": "Mål: 2 gennemførte demonstrationer",
    "betaGuide.targetCommitment":
      "Mål: 1 tilsagn om pilotdeltagelse; betaling først efter godkendt betalt lancering",
    "betaGuide.targetFollowups": "Mål: 2 opfølgninger med interesserede kontakter",
    "betaGuide.targetObjections": "Mål: 5 vigtigste indvendinger",
    "betaGuide.targetScreens": "Mål: 5 mest uklare skærmbilleder",
    "betaGuide.targetImprovements": "Mål: 5 mest efterspurgte forbedringer",
    "betaGuide.decisionPrice": "Forstår Milo, men vil ikke betale → tilpas pris og tilbud.",
    "betaGuide.decisionOnboarding":
      "Kan lide gennemgangen, men ikke appen → forbedr overgangen fra gennemgang til introduktion.",
    "betaGuide.decisionSupport":
      "Ønsker fuld service → undersøg behovet for assisteret beta og månedlig hjælp, før du lover levering.",
    "betaGuide.decisionCms":
      "Spørger om WordPress eller Shopify → prioritér godkendte test af hele forløbet og dokumentation.",
    "betaGuide.decisionGuarantees":
      "Spørger om garantier → tydeliggør begrænsninger og realistiske forventninger.",
    "betaGuide.decisionClarity": "Er forvirrede → forenkl offentlig information og betabudskaber.",
  },
};
