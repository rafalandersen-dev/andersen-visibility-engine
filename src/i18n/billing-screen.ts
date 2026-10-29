import type { OnboardingLanguage } from "@/lib/types";

export const billingScreenCopy: Record<OnboardingLanguage, Readonly<Record<string, string>>> = {
  en: {
    "billingScreen.owner": "Owner",
    "billingScreen.freePreview": "Free Preview",
    "billingScreen.saveFailed": "Could not save",
    "billingScreen.checkoutFailed": "Checkout failed",
    "billingScreen.planFailed": "Could not update the plan.",
    "billingScreen.portalUnlinked":
      "This account is not linked to the legacy Paddle portal. Contact billing@milogrowth.com for help with subscription changes.",
    "billingScreen.portalFailed": "Could not open subscription management.",
    "billingScreen.projects": "Projects: {n}",
    "billingScreen.websites": "Websites: {n}",
    "billingScreen.publishingOn": "Publishing included",
    "billingScreen.publishingOff": "Publishing not included",
    "billingScreen.contentMonthly": "Content generations/month: {n}",
    "billingScreen.manageTitle": "Manage your subscription",
    "billingScreen.manageHelp":
      "Open the linked billing portal to review payment details, invoices and available subscription changes.",
    "billingScreen.cancelAt": "Cancellation is scheduled for {date}.",
    "billingScreen.manage": "Manage billing",
    "billingScreen.cancel": "Cancel subscription",
    "billingScreen.inactiveHelp":
      "Subscription management and cancellation controls appear here for an active paid or manually granted plan.",
    "billingScreen.otherCountry": "Other / not listed",
    "billingScreen.market.Poland": "Poland",
    "billingScreen.market.Sweden": "Sweden",
    "billingScreen.market.Denmark": "Denmark",
    "billingScreen.market.United Kingdom": "United Kingdom",
    "billingScreen.market.European Union": "European Union",
    "billingScreen.market.Other": "Other",
    "billingScreen.separateAddon": "Separate add-on",
    "billingScreen.backlinksHelp":
      "Link intelligence, marketplace review and outreach. Publisher placements require separate review and purchase approval.",
    "billingScreen.reviewAddon": "Review add-on",
    "billingScreen.cancelHelp":
      "For a linked Paddle subscription, open the legacy portal to review cancellation options and confirm when access ends.",
    "billingScreen.cancelExport":
      "You can export your content before access changes. Review any separate backlink purchases independently.",
    "billingScreen.unknownValue": "Unknown",
    "billingScreen.commercial.title": "Subscription and billing operations",
    "billingScreen.commercial.loading": "Reading your billing status…",
    "billingScreen.commercial.unavailable":
      "We could not read your billing status, so we cannot confirm your current plan or the outcome of anything recent. Actions are held until this read succeeds.",
    "billingScreen.commercial.refreshFailed":
      "The latest refresh did not succeed. The details below are the last ones we verified.",
    "billingScreen.commercial.refresh": "Refresh billing status",
    "billingScreen.commercial.provider": "Billing provider",
    "billingScreen.commercial.provider.stripe": "Stripe",
    "billingScreen.commercial.provider.paddle": "Paddle",
    "billingScreen.commercial.provider.manual": "Manual grant",
    "billingScreen.commercial.provider.none": "No paid agreement",
    "billingScreen.commercial.provider.unknown": "Not established",
    "billingScreen.commercial.mode": "Provider mode",
    "billingScreen.commercial.mode.test": "Test",
    "billingScreen.commercial.mode.live": "Live",
    "billingScreen.commercial.plan": "Verified plan",
    "billingScreen.commercial.access": "Access",
    "billingScreen.commercial.access.free": "Free",
    "billingScreen.commercial.access.paid": "Paid",
    "billingScreen.commercial.access.unknown": "Not established",
    "billingScreen.commercial.access.pendingProjection": "Waiting for verification",
    "billingScreen.commercial.seats": "Purchased extra seats",
    "billingScreen.commercial.periodEnd": "Paid period ends",
    "billingScreen.commercial.cancelScheduled":
      "A cancellation is scheduled for the end of the paid period.",
    "billingScreen.commercial.currentAmount": "Current billed amount",
    "billingScreen.commercial.amountUnknown": "Not available from the billing record",
    "billingScreen.commercial.amountFixture": "Local fixture value — not a customer record",
    "billingScreen.commercial.catalogNote":
      "The plan prices below are the catalogue for the billing country selected in the form. They are not your current charge.",
    "billingScreen.commercial.pendingProjection":
      "Your access has not changed yet. It changes only after we verify the new state.",
    "billingScreen.commercial.manualHeld":
      "Manual plan changes are held while this account's Stripe state is unresolved or unreadable.",
    "billingScreen.commercial.manualHeldToast":
      "Manual plan changes are held for this account right now.",
    "billingScreen.commercial.freeIsCancellation":
      "Moving to Free is a cancellation of the paid subscription and is confirmed separately.",
    "billingScreen.commercial.manageUnavailable":
      "Self-service subscription management is not available for this account. Contact billing@milogrowth.com.",
    "billingScreen.commercial.manageHelpStripe":
      "Plan, seat and cancellation changes for this subscription are made here, and each one is confirmed separately.",
    "billingScreen.commercial.manageHelpStripeHeld":
      "This Stripe subscription is managed here, but no change is available right now.",
    "billingScreen.commercial.manageHelpStripeReversal":
      "This subscription is set to end. The one change available here is withdrawing that cancellation.",
    "billingScreen.commercial.manageHelpPaddle":
      "This subscription is on the legacy Paddle portal. Open it to review payment details, invoices and cancellation.",
    "billingScreen.commercial.manageHelpManual":
      "This plan was granted manually, so there is nothing to manage with a payment provider. Contact billing@milogrowth.com to change it.",
    "billingScreen.commercial.manageHelpNone":
      "There is no paid subscription on this account, so there is nothing to manage.",
    "billingScreen.commercial.cancelHelpStripe":
      "Cancelling keeps your plan active until the end of the period you have paid for. You confirm the exact date before anything is sent.",
    "billingScreen.commercial.operation.notDiscovered":
      "We cannot currently see this request on the billing record. It is kept exactly as it was sent and was not repeated, and changes stay held until its outcome can be verified.",
    "billingScreen.commercial.changePlan": "Change plan or seats",
    "billingScreen.commercial.planInput": "Target plan",
    "billingScreen.commercial.seatInput": "Target extra working seats",
    "billingScreen.commercial.prepare": "Prepare a quote",
    "billingScreen.commercial.reverse": "Withdraw the scheduled cancellation",
    "billingScreen.commercial.resume": "Check this operation again",
    "billingScreen.commercial.quote.title": "Confirm this change",
    "billingScreen.commercial.quote.loading": "Preparing the quote…",
    "billingScreen.commercial.quote.dueNow": "Amount due now",
    "billingScreen.commercial.quote.recurring": "Long-term recurring estimate",
    "billingScreen.commercial.quote.recurringNote":
      "An estimate of one full period at the target plan and seats. It is not a promise of your next charge.",
    "billingScreen.commercial.quote.recurringAdjusted":
      "This estimate includes existing adjustments on the subscription.",
    "billingScreen.commercial.quote.effective": "Takes effect",
    "billingScreen.commercial.quote.effectiveImmediate": "Once the amount due now is paid",
    "billingScreen.commercial.quote.expires": "Quote valid until",
    "billingScreen.commercial.quote.expired":
      "This quote has expired and cannot be confirmed. Prepare a new one.",
    "billingScreen.commercial.quote.stale":
      "Your selection changed, so this quote no longer applies. Prepare it again.",
    "billingScreen.commercial.quote.limits":
      "Target limits: {working} working seats, {viewer} viewer seats, {projects} projects.",
    "billingScreen.commercial.confirm": "Confirm the change",
    "billingScreen.commercial.working": "Working…",
    "billingScreen.commercial.cancel.title": "Cancel your subscription",
    "billingScreen.commercial.cancel.body":
      "Your plan stays active until the end of the period you have paid for and then stops. You will not be charged again.",
    "billingScreen.commercial.cancel.until": "Access continues until {date}.",
    "billingScreen.commercial.cancel.untilUnknown":
      "The exact end date is not available from the billing record yet.",
    "billingScreen.commercial.cancel.confirm": "Confirm cancellation",
    "billingScreen.commercial.reverse.title": "Withdraw the cancellation",
    "billingScreen.commercial.reverse.body":
      "This asks the provider to keep the existing subscription running instead of ending it at the end of the paid period.",
    "billingScreen.commercial.reverse.confirm": "Withdraw the cancellation",
    "billingScreen.commercial.operation.title": "A billing operation is open",
    "billingScreen.commercial.operation.pending":
      "We are waiting for an answer. Do not start another change.",
    "billingScreen.commercial.operation.uncertain":
      "The outcome of this request is not confirmed. It was not repeated and no second request was created.",
    "billingScreen.commercial.operation.applied":
      "The provider reported this change as applied. Your access changes only after we verify it.",
    "billingScreen.commercial.operation.awaitingPayment":
      "A payment is required before this change applies.",
    "billingScreen.commercial.operation.scheduled": "This change is scheduled for a later date.",
    "billingScreen.commercial.operation.cancelled": "The cancellation request was accepted.",
    "billingScreen.commercial.operation.reversed": "The cancellation was withdrawn.",
    "billingScreen.commercial.operation.verifiedApplied":
      "This change is applied and verified. The current plan shown above is the new one.",
    "billingScreen.commercial.operation.verifiedCancelled":
      "The cancellation is confirmed and verified. Access continues until the paid period ends.",
    "billingScreen.commercial.operation.verifiedReversed":
      "The withdrawal is confirmed and verified. This subscription is no longer ending.",
    "billingScreen.commercial.operation.refused":
      "This request was refused. Check the current state before trying anything else.",
    "billingScreen.commercial.operation.terms": "Original request: {plan}, {seats} extra seats.",
    "billingScreen.commercial.operation.ambiguous":
      "We cannot tell which billing operation is open, so every change is held.",
    "billingScreen.commercial.operation.dismiss": "Dismiss this notice",
    "billingScreen.reason.held":
      "Plan, seat and cancellation changes are held pending payment setup, acceptance and release.",
    "billingScreen.reason.notConfigured": "Billing is not fully configured for this account yet.",
    "billingScreen.reason.accountUnverified": "The billing account could not be verified.",
    "billingScreen.reason.subscriptionNotCurrent":
      "The subscription is not in a state that can be changed right now.",
    "billingScreen.reason.scheduleConflict": "Another scheduled change conflicts with this one.",
    "billingScreen.reason.cancellationPending":
      "A cancellation is already pending on this subscription.",
    "billingScreen.reason.mixedChange":
      "Changing the plan and the seat count together is not supported here.",
    "billingScreen.reason.marketReview":
      "Your billing country changed, so this subscription needs a review before further changes.",
    "billingScreen.reason.billingCountry": "Your billing country could not be established.",
    "billingScreen.reason.currencyUnsupported":
      "This currency is not supported for subscription changes.",
    "billingScreen.reason.currencySwitch":
      "A running subscription cannot change currency. Contact support.",
    "billingScreen.reason.seatMarket": "Extra seats are not available in your billing market yet.",
    "billingScreen.reason.capacityUnknown":
      "Your current usage could not be established, so the change is held.",
    "billingScreen.reason.capacityWorking":
      "Too many working seats are in use for the target plan. Working seats include people and pending invitations.",
    "billingScreen.reason.capacityViewer": "Too many viewer seats are in use for the target plan.",
    "billingScreen.reason.capacityProjectsUnknown":
      "Your project count could not be established, so the change is held.",
    "billingScreen.reason.capacityProjects": "Too many projects exist for the target plan.",
    "billingScreen.reason.requestInvalid": "This request could not be accepted.",
    "billingScreen.reason.quoteInvalid": "This quote cannot be used. Prepare a new one.",
    "billingScreen.reason.quoteSelectionChanged":
      "Your selection changed after the quote was prepared.",
    "billingScreen.reason.quoteRefused": "This quote was refused and nothing was charged.",
    "billingScreen.reason.previewUnavailable":
      "The provider's preview is unavailable, so no quote was issued.",
    "billingScreen.reason.previewUnreadable":
      "The provider's preview could not be read exactly, so no quote was issued. This is not a zero amount.",
    "billingScreen.reason.outcomeUncertain":
      "The outcome is not confirmed. The original request is kept and no second one was created.",
    "billingScreen.reason.paymentPending": "The change is waiting on a payment at the provider.",
    "billingScreen.reason.paymentDeclined":
      "The invoice for this change is not paid, so the change has not applied.",
    "billingScreen.reason.changeNotApplied": "The change has not been applied yet.",
    "billingScreen.reason.dispatchUncertain":
      "This request may already exist at the provider, so nothing was repeated or replaced.",
    "billingScreen.reason.bindingHeld":
      "This operation's details could not be matched exactly, so it is held for review.",
    "billingScreen.reason.operationFenced":
      "This operation is held under the evidence we have. Nothing further was sent.",
    "billingScreen.reason.scheduleHeld":
      "The provider's schedule for this change could not be confirmed, so it is held.",
    "billingScreen.reason.notApplied":
      "There is no confirmed result. The original request is kept.",
    "billingScreen.reason.operationRefused": "This operation was refused.",
    "billingScreen.reason.operationFailed": "This operation failed and was closed.",
    "billingScreen.reason.operationExpired": "This operation expired before anything was sent.",
    "billingScreen.reason.cancellationPreexisting": "A cancellation was already in place.",
    "billingScreen.reason.cancellationAbsent": "There is no cancellation to withdraw.",
    "billingScreen.reason.cancellationReversed": "That cancellation has already been withdrawn.",
    "billingScreen.reason.cancellationRecreated":
      "The cancellation state changed. Check the current subscription.",
    "billingScreen.reason.cancelIrreversible":
      "This subscription has ended and cannot be reinstated.",
    "billingScreen.reason.unavailable":
      "Billing information is unavailable right now, so this action is held.",
    "billingScreen.reason.unknown":
      "We cannot verify the outcome of this request. It is kept as it is and nothing was repeated; check this page again shortly.",
    "billingScreen.feature.oneSite": "1 project / 1 website",
    "billingScreen.feature.audit": "Free AI Visibility Audit",
    "billingScreen.feature.limitedContent": "Limited content & Milo Score",
    "billingScreen.feature.analyticsLite": "Analytics & GSC Lite",
    "billingScreen.feature.authorityPreview": "Authority preview",
    "billingScreen.feature.brandOpportunities": "Brand Intelligence & opportunities",
    "billingScreen.feature.contentScore": "Content + Milo Score",
    "billingScreen.feature.publishingCustom": "Publishing (custom & WordPress)",
    "billingScreen.feature.analyticsAuthority": "Analytics v2, GSC Lite, Authority",
    "billingScreen.feature.threeSites": "Up to 3 projects / websites",
    "billingScreen.feature.higherContent": "Higher content & Improve limits",
    "billingScreen.feature.publishingConnectors": "Publishing + connectors",
    "billingScreen.feature.analyticsAuthorityV2": "Analytics v2, GSC Lite, Authority v2",
    "billingScreen.feature.planner": "AI Visibility planner",
    "billingScreen.feature.fiveSites": "Up to 5 projects / websites",
    "billingScreen.feature.highLimits": "High monthly limits",
    "billingScreen.feature.images": "AI image generation",
    "billingScreen.feature.moreGsc": "More GSC imports & authority",
    "billingScreen.feature.evaluationConfigured": "AI Evaluation (where configured)",
    "billingScreen.feature.prioritySupport": "Priority support",
    "billingScreen.feature.clientProjects": "Up to 15 client projects",
    "billingScreen.feature.reports": "White-label monthly reports (on demand)",
    "billingScreen.feature.highestLimits": "Highest monthly limits",
    "billingScreen.feature.allConnectors": "Connectors + AI Evaluation (where configured)",
  },
  pl: {
    "billingScreen.owner": "Właściciel",
    "billingScreen.freePreview": "Bezpłatny podgląd",
    "billingScreen.saveFailed": "Nie udało się zapisać",
    "billingScreen.checkoutFailed": "Nie udało się rozpocząć płatności",
    "billingScreen.planFailed": "Nie udało się zaktualizować planu.",
    "billingScreen.portalUnlinked":
      "To konto nie jest połączone ze starszym portalem Paddle. W sprawie zmian subskrypcji napisz na billing@milogrowth.com.",
    "billingScreen.portalFailed": "Nie udało się otworzyć zarządzania subskrypcją.",
    "billingScreen.projects": "Projekty: {n}",
    "billingScreen.websites": "Witryny: {n}",
    "billingScreen.publishingOn": "Publikowanie w planie",
    "billingScreen.publishingOff": "Publikowanie poza planem",
    "billingScreen.contentMonthly": "Generowanie treści na miesiąc: {n}",
    "billingScreen.manageTitle": "Zarządzaj subskrypcją",
    "billingScreen.manageHelp":
      "Otwórz połączony portal rozliczeń, aby sprawdzić dane płatności, faktury i dostępne zmiany subskrypcji.",
    "billingScreen.cancelAt": "Anulowanie zaplanowano na {date}.",
    "billingScreen.manage": "Zarządzaj rozliczeniami",
    "billingScreen.cancel": "Anuluj subskrypcję",
    "billingScreen.inactiveHelp":
      "Przy aktywnym płatnym lub ręcznie przyznanym planie pojawiają się tu opcje zarządzania i anulowania subskrypcji.",
    "billingScreen.otherCountry": "Inny / brak na liście",
    "billingScreen.market.Poland": "Polska",
    "billingScreen.market.Sweden": "Szwecja",
    "billingScreen.market.Denmark": "Dania",
    "billingScreen.market.United Kingdom": "Wielka Brytania",
    "billingScreen.market.European Union": "Unia Europejska",
    "billingScreen.market.Other": "Inny",
    "billingScreen.separateAddon": "Osobny dodatek",
    "billingScreen.backlinksHelp":
      "Analiza linków, przegląd ofert wydawców i kontakt z nimi. Publikacje u wydawców wymagają osobnej oceny i zatwierdzenia zakupu.",
    "billingScreen.reviewAddon": "Sprawdź dodatek",
    "billingScreen.cancelHelp":
      "Jeśli subskrypcja jest połączona z Paddle, otwórz starszy portal, aby sprawdzić opcje anulowania i potwierdzić termin zakończenia dostępu.",
    "billingScreen.cancelExport":
      "Możesz wyeksportować treści przed zmianą dostępu. Osobno sprawdź ewentualne zakupy linków.",
    "billingScreen.unknownValue": "Nieznane",
    "billingScreen.commercial.title": "Subskrypcja i operacje rozliczeniowe",
    "billingScreen.commercial.loading": "Odczytujemy stan rozliczeń…",
    "billingScreen.commercial.unavailable":
      "Nie udało się odczytać stanu rozliczeń, więc nie możemy potwierdzić bieżącego planu ani wyniku ostatnich działań. Akcje są wstrzymane, dopóki odczyt się nie powiedzie.",
    "billingScreen.commercial.refreshFailed":
      "Ostatnie odświeżenie się nie powiodło. Poniżej są ostatnie zweryfikowane dane.",
    "billingScreen.commercial.refresh": "Odśwież stan rozliczeń",
    "billingScreen.commercial.provider": "Dostawca rozliczeń",
    "billingScreen.commercial.provider.stripe": "Stripe",
    "billingScreen.commercial.provider.paddle": "Paddle",
    "billingScreen.commercial.provider.manual": "Przyznanie ręczne",
    "billingScreen.commercial.provider.none": "Brak płatnej umowy",
    "billingScreen.commercial.provider.unknown": "Nieustalony",
    "billingScreen.commercial.mode": "Tryb dostawcy",
    "billingScreen.commercial.mode.test": "Testowy",
    "billingScreen.commercial.mode.live": "Produkcyjny",
    "billingScreen.commercial.plan": "Zweryfikowany plan",
    "billingScreen.commercial.access": "Dostęp",
    "billingScreen.commercial.access.free": "Bezpłatny",
    "billingScreen.commercial.access.paid": "Płatny",
    "billingScreen.commercial.access.unknown": "Nieustalony",
    "billingScreen.commercial.access.pendingProjection": "Czeka na weryfikację",
    "billingScreen.commercial.seats": "Wykupione dodatkowe miejsca",
    "billingScreen.commercial.periodEnd": "Opłacony okres kończy się",
    "billingScreen.commercial.cancelScheduled":
      "Anulowanie zaplanowano na koniec opłaconego okresu.",
    "billingScreen.commercial.currentAmount": "Bieżąca kwota rozliczenia",
    "billingScreen.commercial.amountUnknown": "Niedostępna w zapisie rozliczeniowym",
    "billingScreen.commercial.amountFixture":
      "Wartość z lokalnej atrapy — nie jest zapisem klienta",
    "billingScreen.commercial.catalogNote":
      "Poniższe ceny planów to cennik dla kraju wybranego w formularzu. Nie są to Twoje bieżące opłaty.",
    "billingScreen.commercial.pendingProjection":
      "Twój dostęp jeszcze się nie zmienił. Zmieni się dopiero po zweryfikowaniu nowego stanu.",
    "billingScreen.commercial.manualHeld":
      "Ręczne zmiany planu są wstrzymane, dopóki stan Stripe na tym koncie jest nierozstrzygnięty lub nieczytelny.",
    "billingScreen.commercial.manualHeldToast":
      "Ręczne zmiany planu są teraz wstrzymane dla tego konta.",
    "billingScreen.commercial.freeIsCancellation":
      "Przejście na plan bezpłatny to anulowanie płatnej subskrypcji i potwierdza się je osobno.",
    "billingScreen.commercial.manageUnavailable":
      "Samodzielne zarządzanie subskrypcją nie jest dostępne dla tego konta. Napisz na billing@milogrowth.com.",
    "billingScreen.commercial.manageHelpStripe":
      "Zmiany planu, miejsc i anulowania tej subskrypcji wykonuje się tutaj, a każdą potwierdza się osobno.",
    "billingScreen.commercial.manageHelpStripeHeld":
      "Tą subskrypcją Stripe zarządza się tutaj, ale teraz żadna zmiana nie jest dostępna.",
    "billingScreen.commercial.manageHelpStripeReversal":
      "Ta subskrypcja ma się zakończyć. Jedyna dostępna tutaj zmiana to wycofanie tego anulowania.",
    "billingScreen.commercial.manageHelpPaddle":
      "Ta subskrypcja jest w starszym portalu Paddle. Otwórz go, aby sprawdzić dane płatności, faktury i anulowanie.",
    "billingScreen.commercial.manageHelpManual":
      "Ten plan przyznano ręcznie, więc nie ma czym zarządzać u dostawcy płatności. Aby go zmienić, napisz na billing@milogrowth.com.",
    "billingScreen.commercial.manageHelpNone":
      "Na tym koncie nie ma płatnej subskrypcji, więc nie ma czym zarządzać.",
    "billingScreen.commercial.cancelHelpStripe":
      "Po anulowaniu plan pozostaje aktywny do końca opłaconego okresu. Dokładną datę potwierdzasz, zanim cokolwiek zostanie wysłane.",
    "billingScreen.commercial.operation.notDiscovered":
      "Nie widzimy teraz tego żądania w zapisie rozliczeniowym. Zostaje dokładnie takie, jakie zostało wysłane, i nie zostało powtórzone, a zmiany są wstrzymane, dopóki nie da się zweryfikować jego wyniku.",
    "billingScreen.commercial.changePlan": "Zmień plan lub miejsca",
    "billingScreen.commercial.planInput": "Docelowy plan",
    "billingScreen.commercial.seatInput": "Docelowa liczba dodatkowych miejsc roboczych",
    "billingScreen.commercial.prepare": "Przygotuj wycenę",
    "billingScreen.commercial.reverse": "Wycofaj zaplanowane anulowanie",
    "billingScreen.commercial.resume": "Sprawdź tę operację ponownie",
    "billingScreen.commercial.quote.title": "Potwierdź tę zmianę",
    "billingScreen.commercial.quote.loading": "Przygotowujemy wycenę…",
    "billingScreen.commercial.quote.dueNow": "Kwota do zapłaty teraz",
    "billingScreen.commercial.quote.recurring": "Długoterminowy szacunek kwoty cyklicznej",
    "billingScreen.commercial.quote.recurringNote":
      "To szacunek jednego pełnego okresu dla docelowego planu i miejsc. Nie jest to obietnica kolejnej opłaty.",
    "billingScreen.commercial.quote.recurringAdjusted":
      "Szacunek uwzględnia istniejące korekty na subskrypcji.",
    "billingScreen.commercial.quote.effective": "Wchodzi w życie",
    "billingScreen.commercial.quote.effectiveImmediate": "Po opłaceniu kwoty należnej teraz",
    "billingScreen.commercial.quote.expires": "Wycena ważna do",
    "billingScreen.commercial.quote.expired":
      "Ta wycena wygasła i nie może zostać potwierdzona. Przygotuj nową.",
    "billingScreen.commercial.quote.stale":
      "Twój wybór się zmienił, więc ta wycena już nie obowiązuje. Przygotuj ją ponownie.",
    "billingScreen.commercial.quote.limits":
      "Docelowe limity: {working} miejsc roboczych, {viewer} miejsc podglądu, {projects} projektów.",
    "billingScreen.commercial.confirm": "Potwierdź zmianę",
    "billingScreen.commercial.working": "Trwa…",
    "billingScreen.commercial.cancel.title": "Anuluj subskrypcję",
    "billingScreen.commercial.cancel.body":
      "Plan pozostaje aktywny do końca opłaconego okresu, a potem się kończy. Nie zostanie pobrana kolejna opłata.",
    "billingScreen.commercial.cancel.until": "Dostęp trwa do {date}.",
    "billingScreen.commercial.cancel.untilUnknown":
      "Dokładna data zakończenia nie jest jeszcze dostępna w zapisie rozliczeniowym.",
    "billingScreen.commercial.cancel.confirm": "Potwierdź anulowanie",
    "billingScreen.commercial.reverse.title": "Wycofaj anulowanie",
    "billingScreen.commercial.reverse.body":
      "To prośba do dostawcy, aby utrzymał istniejącą subskrypcję, zamiast zakończyć ją z końcem opłaconego okresu.",
    "billingScreen.commercial.reverse.confirm": "Wycofaj anulowanie",
    "billingScreen.commercial.operation.title": "Otwarta operacja rozliczeniowa",
    "billingScreen.commercial.operation.pending":
      "Czekamy na odpowiedź. Nie rozpoczynaj kolejnej zmiany.",
    "billingScreen.commercial.operation.uncertain":
      "Wynik tego żądania nie jest potwierdzony. Nie zostało powtórzone i nie utworzono drugiego żądania.",
    "billingScreen.commercial.operation.applied":
      "Dostawca zgłosił tę zmianę jako zastosowaną. Twój dostęp zmieni się dopiero po naszej weryfikacji.",
    "billingScreen.commercial.operation.awaitingPayment":
      "Zanim zmiana zacznie obowiązywać, wymagana jest płatność.",
    "billingScreen.commercial.operation.scheduled":
      "Ta zmiana jest zaplanowana na późniejszy termin.",
    "billingScreen.commercial.operation.cancelled": "Żądanie anulowania zostało przyjęte.",
    "billingScreen.commercial.operation.reversed": "Anulowanie zostało wycofane.",
    "billingScreen.commercial.operation.verifiedApplied":
      "Ta zmiana została zastosowana i zweryfikowana. Bieżący plan powyżej to już nowy plan.",
    "billingScreen.commercial.operation.verifiedCancelled":
      "Anulowanie zostało potwierdzone i zweryfikowane. Dostęp trwa do końca opłaconego okresu.",
    "billingScreen.commercial.operation.verifiedReversed":
      "Wycofanie zostało potwierdzone i zweryfikowane. Ta subskrypcja już się nie kończy.",
    "billingScreen.commercial.operation.refused":
      "To żądanie zostało odrzucone. Sprawdź bieżący stan, zanim spróbujesz czegoś innego.",
    "billingScreen.commercial.operation.terms":
      "Pierwotne żądanie: {plan}, dodatkowe miejsca: {seats}.",
    "billingScreen.commercial.operation.ambiguous":
      "Nie możemy ustalić, która operacja rozliczeniowa jest otwarta, więc każda zmiana jest wstrzymana.",
    "billingScreen.commercial.operation.dismiss": "Ukryj tę informację",
    "billingScreen.reason.held":
      "Zmiany planu, miejsc i anulowania są wstrzymane do czasu konfiguracji płatności, akceptacji i wydania.",
    "billingScreen.reason.notConfigured":
      "Rozliczenia nie są jeszcze w pełni skonfigurowane dla tego konta.",
    "billingScreen.reason.accountUnverified": "Nie udało się zweryfikować konta rozliczeniowego.",
    "billingScreen.reason.subscriptionNotCurrent":
      "Subskrypcja nie jest w stanie, który można teraz zmienić.",
    "billingScreen.reason.scheduleConflict": "Inna zaplanowana zmiana koliduje z tą.",
    "billingScreen.reason.cancellationPending": "Dla tej subskrypcji trwa już proces anulowania.",
    "billingScreen.reason.mixedChange":
      "Jednoczesna zmiana planu i liczby miejsc nie jest tu obsługiwana.",
    "billingScreen.reason.marketReview":
      "Twój kraj rozliczeniowy się zmienił, więc subskrypcja wymaga przeglądu przed dalszymi zmianami.",
    "billingScreen.reason.billingCountry": "Nie udało się ustalić Twojego kraju rozliczeniowego.",
    "billingScreen.reason.currencyUnsupported":
      "Ta waluta nie jest obsługiwana przy zmianach subskrypcji.",
    "billingScreen.reason.currencySwitch":
      "Trwająca subskrypcja nie może zmienić waluty. Skontaktuj się z pomocą.",
    "billingScreen.reason.seatMarket":
      "Dodatkowe miejsca nie są jeszcze dostępne na Twoim rynku rozliczeniowym.",
    "billingScreen.reason.capacityUnknown":
      "Nie udało się ustalić bieżącego wykorzystania, więc zmiana jest wstrzymana.",
    "billingScreen.reason.capacityWorking":
      "Dla docelowego planu zajętych jest zbyt wiele miejsc roboczych. Miejsca robocze obejmują osoby i oczekujące zaproszenia.",
    "billingScreen.reason.capacityViewer":
      "Dla docelowego planu zajętych jest zbyt wiele miejsc podglądu.",
    "billingScreen.reason.capacityProjectsUnknown":
      "Nie udało się ustalić liczby projektów, więc zmiana jest wstrzymana.",
    "billingScreen.reason.capacityProjects": "Istnieje zbyt wiele projektów jak na docelowy plan.",
    "billingScreen.reason.requestInvalid": "To żądanie nie mogło zostać przyjęte.",
    "billingScreen.reason.quoteInvalid": "Tej wyceny nie można użyć. Przygotuj nową.",
    "billingScreen.reason.quoteSelectionChanged": "Twój wybór zmienił się po przygotowaniu wyceny.",
    "billingScreen.reason.quoteRefused": "Ta wycena została odrzucona i nic nie zostało pobrane.",
    "billingScreen.reason.previewUnavailable":
      "Podgląd dostawcy jest niedostępny, więc nie wystawiono wyceny.",
    "billingScreen.reason.previewUnreadable":
      "Podglądu dostawcy nie dało się odczytać dokładnie, więc nie wystawiono wyceny. To nie jest kwota zerowa.",
    "billingScreen.reason.outcomeUncertain":
      "Wynik nie jest potwierdzony. Pierwotne żądanie zostaje zachowane i nie utworzono drugiego.",
    "billingScreen.reason.paymentPending": "Zmiana czeka na płatność u dostawcy.",
    "billingScreen.reason.paymentDeclined":
      "Faktura za tę zmianę nie jest opłacona, więc zmiana nie weszła w życie.",
    "billingScreen.reason.changeNotApplied": "Zmiana nie została jeszcze zastosowana.",
    "billingScreen.reason.dispatchUncertain":
      "To żądanie może już istnieć u dostawcy, więc niczego nie powtórzono ani nie zastąpiono.",
    "billingScreen.reason.bindingHeld":
      "Nie udało się dokładnie dopasować szczegółów tej operacji, więc jest wstrzymana do przeglądu.",
    "billingScreen.reason.operationFenced":
      "Ta operacja jest wstrzymana przy posiadanych dowodach. Nic więcej nie zostało wysłane.",
    "billingScreen.reason.scheduleHeld":
      "Nie udało się potwierdzić harmonogramu tej zmiany u dostawcy, więc jest wstrzymana.",
    "billingScreen.reason.notApplied":
      "Brak potwierdzonego wyniku. Pierwotne żądanie zostaje zachowane.",
    "billingScreen.reason.operationRefused": "Ta operacja została odrzucona.",
    "billingScreen.reason.operationFailed": "Ta operacja nie powiodła się i została zamknięta.",
    "billingScreen.reason.operationExpired":
      "Ta operacja wygasła, zanim cokolwiek zostało wysłane.",
    "billingScreen.reason.cancellationPreexisting": "Anulowanie już obowiązywało.",
    "billingScreen.reason.cancellationAbsent": "Nie ma anulowania, które można wycofać.",
    "billingScreen.reason.cancellationReversed": "To anulowanie zostało już wycofane.",
    "billingScreen.reason.cancellationRecreated":
      "Stan anulowania się zmienił. Sprawdź bieżącą subskrypcję.",
    "billingScreen.reason.cancelIrreversible":
      "Ta subskrypcja została zakończona i nie można jej przywrócić.",
    "billingScreen.reason.unavailable":
      "Informacje rozliczeniowe są teraz niedostępne, więc ta akcja jest wstrzymana.",
    "billingScreen.reason.unknown":
      "Nie możemy zweryfikować wyniku tego żądania. Zostaje bez zmian i nie zostało powtórzone; sprawdź tę stronę ponownie za chwilę.",
    "billingScreen.feature.oneSite": "1 projekt / 1 witryna",
    "billingScreen.feature.audit": "Bezpłatny audyt widoczności AI",
    "billingScreen.feature.limitedContent": "Ograniczone treści i Milo Score",
    "billingScreen.feature.analyticsLite": "Analityka i GSC Lite",
    "billingScreen.feature.authorityPreview": "Podgląd budowania autorytetu",
    "billingScreen.feature.brandOpportunities": "Wiedza o marce i możliwości",
    "billingScreen.feature.contentScore": "Treści + Milo Score",
    "billingScreen.feature.publishingCustom": "Publikowanie (własna integracja i WordPress)",
    "billingScreen.feature.analyticsAuthority": "Analityka v2, GSC Lite, budowanie autorytetu",
    "billingScreen.feature.threeSites": "Do 3 projektów / witryn",
    "billingScreen.feature.higherContent": "Wyższe limity treści i ulepszania",
    "billingScreen.feature.publishingConnectors": "Publikowanie + integracje",
    "billingScreen.feature.analyticsAuthorityV2": "Analityka v2, GSC Lite, budowanie autorytetu v2",
    "billingScreen.feature.planner": "Planer widoczności AI",
    "billingScreen.feature.fiveSites": "Do 5 projektów / witryn",
    "billingScreen.feature.highLimits": "Wysokie limity miesięczne",
    "billingScreen.feature.images": "Generowanie obrazów AI",
    "billingScreen.feature.moreGsc": "Więcej importów GSC i budowania autorytetu",
    "billingScreen.feature.evaluationConfigured": "Ocena AI (po skonfigurowaniu)",
    "billingScreen.feature.prioritySupport": "Priorytetowa pomoc",
    "billingScreen.feature.clientProjects": "Do 15 projektów klientów",
    "billingScreen.feature.reports": "Miesięczne raporty pod własną marką (na żądanie)",
    "billingScreen.feature.highestLimits": "Najwyższe limity miesięczne",
    "billingScreen.feature.allConnectors": "Integracje + ocena AI (po skonfigurowaniu)",
  },
  sv: {
    "billingScreen.owner": "Ägare",
    "billingScreen.freePreview": "Kostnadsfri förhandsvisning",
    "billingScreen.saveFailed": "Det gick inte att spara",
    "billingScreen.checkoutFailed": "Det gick inte att starta betalningen",
    "billingScreen.planFailed": "Det gick inte att uppdatera abonnemanget.",
    "billingScreen.portalUnlinked":
      "Kontot är inte kopplat till den äldre Paddle-portalen. Kontakta billing@milogrowth.com för hjälp med abonnemangsändringar.",
    "billingScreen.portalFailed": "Det gick inte att öppna abonnemangshanteringen.",
    "billingScreen.projects": "Projekt: {n}",
    "billingScreen.websites": "Webbplatser: {n}",
    "billingScreen.publishingOn": "Publicering ingår",
    "billingScreen.publishingOff": "Publicering ingår inte",
    "billingScreen.contentMonthly": "Innehållsgenereringar per månad: {n}",
    "billingScreen.manageTitle": "Hantera ditt abonnemang",
    "billingScreen.manageHelp":
      "Öppna den kopplade faktureringsportalen för att granska betalningsuppgifter, fakturor och tillgängliga abonnemangsändringar.",
    "billingScreen.cancelAt": "Uppsägningen är planerad till {date}.",
    "billingScreen.manage": "Hantera fakturering",
    "billingScreen.cancel": "Säg upp abonnemanget",
    "billingScreen.inactiveHelp":
      "Här visas kontroller för abonnemangshantering och uppsägning för ett aktivt betalt eller manuellt tilldelat abonnemang.",
    "billingScreen.otherCountry": "Annat / finns inte i listan",
    "billingScreen.market.Poland": "Polen",
    "billingScreen.market.Sweden": "Sverige",
    "billingScreen.market.Denmark": "Danmark",
    "billingScreen.market.United Kingdom": "Storbritannien",
    "billingScreen.market.European Union": "Europeiska unionen",
    "billingScreen.market.Other": "Annat",
    "billingScreen.separateAddon": "Separat tillägg",
    "billingScreen.backlinksHelp":
      "Länkanalys, granskning av marknadsplatsen och kontakt med utgivare. Placeringar hos utgivare kräver separat granskning och inköpsgodkännande.",
    "billingScreen.reviewAddon": "Granska tillägg",
    "billingScreen.cancelHelp":
      "För ett kopplat Paddle-abonnemang kan du öppna den äldre portalen för att granska uppsägningsalternativ och bekräfta när åtkomsten upphör.",
    "billingScreen.cancelExport":
      "Du kan exportera ditt innehåll innan åtkomsten ändras. Granska eventuella separata länkköp för sig.",
    "billingScreen.unknownValue": "Okänt",
    "billingScreen.commercial.title": "Abonnemang och faktureringsåtgärder",
    "billingScreen.commercial.loading": "Läser din faktureringsstatus…",
    "billingScreen.commercial.unavailable":
      "Vi kunde inte läsa din faktureringsstatus, så vi kan inte bekräfta ditt nuvarande abonnemang eller resultatet av något nyligen gjort. Åtgärder hålls tillbaka tills läsningen lyckas.",
    "billingScreen.commercial.refreshFailed":
      "Den senaste uppdateringen lyckades inte. Uppgifterna nedan är de senaste vi verifierade.",
    "billingScreen.commercial.refresh": "Uppdatera faktureringsstatus",
    "billingScreen.commercial.provider": "Faktureringsleverantör",
    "billingScreen.commercial.provider.stripe": "Stripe",
    "billingScreen.commercial.provider.paddle": "Paddle",
    "billingScreen.commercial.provider.manual": "Manuell tilldelning",
    "billingScreen.commercial.provider.none": "Inget betalt avtal",
    "billingScreen.commercial.provider.unknown": "Inte fastställd",
    "billingScreen.commercial.mode": "Leverantörsläge",
    "billingScreen.commercial.mode.test": "Test",
    "billingScreen.commercial.mode.live": "Skarpt",
    "billingScreen.commercial.plan": "Verifierat abonnemang",
    "billingScreen.commercial.access": "Åtkomst",
    "billingScreen.commercial.access.free": "Kostnadsfri",
    "billingScreen.commercial.access.paid": "Betald",
    "billingScreen.commercial.access.unknown": "Inte fastställd",
    "billingScreen.commercial.access.pendingProjection": "Väntar på verifiering",
    "billingScreen.commercial.seats": "Köpta extra platser",
    "billingScreen.commercial.periodEnd": "Betald period slutar",
    "billingScreen.commercial.cancelScheduled":
      "En uppsägning är planerad till slutet av den betalda perioden.",
    "billingScreen.commercial.currentAmount": "Nuvarande fakturerat belopp",
    "billingScreen.commercial.amountUnknown": "Finns inte i faktureringsunderlaget",
    "billingScreen.commercial.amountFixture": "Värde från lokal testdata — inte en kunduppgift",
    "billingScreen.commercial.catalogNote":
      "Priserna nedan är katalogpriser för landet som valts i formuläret. De är inte din nuvarande avgift.",
    "billingScreen.commercial.pendingProjection":
      "Din åtkomst har inte ändrats ännu. Den ändras först när vi har verifierat det nya läget.",
    "billingScreen.commercial.manualHeld":
      "Manuella abonnemangsändringar hålls tillbaka så länge kontots Stripe-läge är oavklarat eller oläsbart.",
    "billingScreen.commercial.manualHeldToast":
      "Manuella abonnemangsändringar hålls tillbaka för det här kontot just nu.",
    "billingScreen.commercial.freeIsCancellation":
      "Att gå till det kostnadsfria abonnemanget är en uppsägning av det betalda abonnemanget och bekräftas separat.",
    "billingScreen.commercial.manageUnavailable":
      "Självbetjäning för abonnemang är inte tillgänglig för det här kontot. Kontakta billing@milogrowth.com.",
    "billingScreen.commercial.manageHelpStripe":
      "Ändringar av abonnemang, platser och uppsägning för det här abonnemanget görs här, och var och en bekräftas separat.",
    "billingScreen.commercial.manageHelpStripeHeld":
      "Det här Stripe-abonnemanget hanteras här, men ingen ändring är tillgänglig just nu.",
    "billingScreen.commercial.manageHelpStripeReversal":
      "Abonnemanget är på väg att avslutas. Den enda ändring som är tillgänglig här är att dra tillbaka uppsägningen.",
    "billingScreen.commercial.manageHelpPaddle":
      "Det här abonnemanget ligger i den äldre Paddle-portalen. Öppna den för att granska betalningsuppgifter, fakturor och uppsägning.",
    "billingScreen.commercial.manageHelpManual":
      "Abonnemanget tilldelades manuellt, så det finns inget att hantera hos en betalleverantör. Kontakta billing@milogrowth.com för att ändra det.",
    "billingScreen.commercial.manageHelpNone":
      "Det finns inget betalt abonnemang på kontot, så det finns inget att hantera.",
    "billingScreen.commercial.cancelHelpStripe":
      "Vid uppsägning är abonnemanget aktivt till slutet av den period du har betalat för. Du bekräftar det exakta datumet innan något skickas.",
    "billingScreen.commercial.operation.notDiscovered":
      "Vi kan just nu inte se den här begäran i faktureringsunderlaget. Den behålls exakt som den skickades och upprepades inte, och ändringar hålls tillbaka tills resultatet kan verifieras.",
    "billingScreen.commercial.changePlan": "Ändra abonnemang eller platser",
    "billingScreen.commercial.planInput": "Önskat abonnemang",
    "billingScreen.commercial.seatInput": "Önskat antal extra arbetsplatser",
    "billingScreen.commercial.prepare": "Förbered en offert",
    "billingScreen.commercial.reverse": "Dra tillbaka den planerade uppsägningen",
    "billingScreen.commercial.resume": "Kontrollera den här åtgärden igen",
    "billingScreen.commercial.quote.title": "Bekräfta den här ändringen",
    "billingScreen.commercial.quote.loading": "Förbereder offerten…",
    "billingScreen.commercial.quote.dueNow": "Belopp att betala nu",
    "billingScreen.commercial.quote.recurring": "Långsiktig uppskattning av återkommande belopp",
    "billingScreen.commercial.quote.recurringNote":
      "En uppskattning av en hel period med det önskade abonnemanget och platserna. Det är inte ett löfte om din nästa avgift.",
    "billingScreen.commercial.quote.recurringAdjusted":
      "Uppskattningen inkluderar befintliga justeringar på abonnemanget.",
    "billingScreen.commercial.quote.effective": "Träder i kraft",
    "billingScreen.commercial.quote.effectiveImmediate":
      "När beloppet som ska betalas nu är betalt",
    "billingScreen.commercial.quote.expires": "Offerten gäller till",
    "billingScreen.commercial.quote.expired":
      "Offerten har gått ut och kan inte bekräftas. Förbered en ny.",
    "billingScreen.commercial.quote.stale":
      "Ditt val ändrades, så offerten gäller inte längre. Förbered den igen.",
    "billingScreen.commercial.quote.limits":
      "Nya gränser: {working} arbetsplatser, {viewer} läsplatser, {projects} projekt.",
    "billingScreen.commercial.confirm": "Bekräfta ändringen",
    "billingScreen.commercial.working": "Pågår…",
    "billingScreen.commercial.cancel.title": "Säg upp ditt abonnemang",
    "billingScreen.commercial.cancel.body":
      "Ditt abonnemang är aktivt till slutet av den period du har betalat för och upphör sedan. Du debiteras inte igen.",
    "billingScreen.commercial.cancel.until": "Åtkomsten fortsätter till {date}.",
    "billingScreen.commercial.cancel.untilUnknown":
      "Det exakta slutdatumet finns ännu inte i faktureringsunderlaget.",
    "billingScreen.commercial.cancel.confirm": "Bekräfta uppsägningen",
    "billingScreen.commercial.reverse.title": "Dra tillbaka uppsägningen",
    "billingScreen.commercial.reverse.body":
      "Detta ber leverantören att låta det befintliga abonnemanget fortsätta i stället för att avsluta det vid den betalda periodens slut.",
    "billingScreen.commercial.reverse.confirm": "Dra tillbaka uppsägningen",
    "billingScreen.commercial.operation.title": "En faktureringsåtgärd är öppen",
    "billingScreen.commercial.operation.pending": "Vi väntar på svar. Påbörja ingen ny ändring.",
    "billingScreen.commercial.operation.uncertain":
      "Resultatet av den här begäran är inte bekräftat. Den upprepades inte och ingen andra begäran skapades.",
    "billingScreen.commercial.operation.applied":
      "Leverantören rapporterade ändringen som genomförd. Din åtkomst ändras först när vi har verifierat det.",
    "billingScreen.commercial.operation.awaitingPayment":
      "En betalning krävs innan ändringen träder i kraft.",
    "billingScreen.commercial.operation.scheduled":
      "Den här ändringen är planerad till ett senare datum.",
    "billingScreen.commercial.operation.cancelled": "Begäran om uppsägning togs emot.",
    "billingScreen.commercial.operation.reversed": "Uppsägningen drogs tillbaka.",
    "billingScreen.commercial.operation.verifiedApplied":
      "Ändringen är genomförd och verifierad. Abonnemanget som visas ovan är det nya.",
    "billingScreen.commercial.operation.verifiedCancelled":
      "Uppsägningen är bekräftad och verifierad. Åtkomsten fortsätter till den betalda periodens slut.",
    "billingScreen.commercial.operation.verifiedReversed":
      "Tillbakadragandet är bekräftat och verifierat. Abonnemanget upphör inte längre.",
    "billingScreen.commercial.operation.refused":
      "Begäran avslogs. Kontrollera nuvarande läge innan du provar något annat.",
    "billingScreen.commercial.operation.terms":
      "Ursprunglig begäran: {plan}, {seats} extra platser.",
    "billingScreen.commercial.operation.ambiguous":
      "Vi kan inte avgöra vilken faktureringsåtgärd som är öppen, så alla ändringar hålls tillbaka.",
    "billingScreen.commercial.operation.dismiss": "Dölj det här meddelandet",
    "billingScreen.reason.held":
      "Ändringar av abonnemang, platser och uppsägning hålls tillbaka i väntan på betalningsuppsättning, godkännande och release.",
    "billingScreen.reason.notConfigured":
      "Faktureringen är ännu inte helt konfigurerad för det här kontot.",
    "billingScreen.reason.accountUnverified": "Faktureringskontot kunde inte verifieras.",
    "billingScreen.reason.subscriptionNotCurrent":
      "Abonnemanget är inte i ett läge som kan ändras just nu.",
    "billingScreen.reason.scheduleConflict": "En annan planerad ändring krockar med den här.",
    "billingScreen.reason.cancellationPending":
      "En uppsägning pågår redan för det här abonnemanget.",
    "billingScreen.reason.mixedChange":
      "Att ändra abonnemang och antal platser samtidigt stöds inte här.",
    "billingScreen.reason.marketReview":
      "Ditt faktureringsland har ändrats, så abonnemanget behöver granskas före fler ändringar.",
    "billingScreen.reason.billingCountry": "Ditt faktureringsland kunde inte fastställas.",
    "billingScreen.reason.currencyUnsupported":
      "Den här valutan stöds inte för abonnemangsändringar.",
    "billingScreen.reason.currencySwitch":
      "Ett pågående abonnemang kan inte byta valuta. Kontakta supporten.",
    "billingScreen.reason.seatMarket":
      "Extra platser är ännu inte tillgängliga på din faktureringsmarknad.",
    "billingScreen.reason.capacityUnknown":
      "Din nuvarande användning kunde inte fastställas, så ändringen hålls tillbaka.",
    "billingScreen.reason.capacityWorking":
      "För många arbetsplatser används för det önskade abonnemanget. Arbetsplatser räknar både personer och väntande inbjudningar.",
    "billingScreen.reason.capacityViewer":
      "För många läsplatser används för det önskade abonnemanget.",
    "billingScreen.reason.capacityProjectsUnknown":
      "Antalet projekt kunde inte fastställas, så ändringen hålls tillbaka.",
    "billingScreen.reason.capacityProjects":
      "Det finns för många projekt för det önskade abonnemanget.",
    "billingScreen.reason.requestInvalid": "Begäran kunde inte tas emot.",
    "billingScreen.reason.quoteInvalid": "Offerten kan inte användas. Förbered en ny.",
    "billingScreen.reason.quoteSelectionChanged":
      "Ditt val ändrades efter att offerten förbereddes.",
    "billingScreen.reason.quoteRefused": "Offerten avslogs och inget debiterades.",
    "billingScreen.reason.previewUnavailable":
      "Leverantörens förhandsbesked är inte tillgängligt, så ingen offert utfärdades.",
    "billingScreen.reason.previewUnreadable":
      "Leverantörens förhandsbesked kunde inte läsas exakt, så ingen offert utfärdades. Det är inte ett nollbelopp.",
    "billingScreen.reason.outcomeUncertain":
      "Resultatet är inte bekräftat. Den ursprungliga begäran behålls och ingen andra skapades.",
    "billingScreen.reason.paymentPending": "Ändringen väntar på en betalning hos leverantören.",
    "billingScreen.reason.paymentDeclined":
      "Fakturan för ändringen är inte betald, så ändringen har inte genomförts.",
    "billingScreen.reason.changeNotApplied": "Ändringen har ännu inte genomförts.",
    "billingScreen.reason.dispatchUncertain":
      "Begäran kan redan finnas hos leverantören, så inget upprepades eller ersattes.",
    "billingScreen.reason.bindingHeld":
      "Åtgärdens uppgifter kunde inte matchas exakt, så den hålls tillbaka för granskning.",
    "billingScreen.reason.operationFenced":
      "Åtgärden hålls tillbaka utifrån de uppgifter vi har. Inget mer skickades.",
    "billingScreen.reason.scheduleHeld":
      "Leverantörens tidsplan för ändringen kunde inte bekräftas, så den hålls tillbaka.",
    "billingScreen.reason.notApplied":
      "Det finns inget bekräftat resultat. Den ursprungliga begäran behålls.",
    "billingScreen.reason.operationRefused": "Åtgärden avslogs.",
    "billingScreen.reason.operationFailed": "Åtgärden misslyckades och stängdes.",
    "billingScreen.reason.operationExpired": "Åtgärden gick ut innan något skickades.",
    "billingScreen.reason.cancellationPreexisting": "En uppsägning fanns redan.",
    "billingScreen.reason.cancellationAbsent": "Det finns ingen uppsägning att dra tillbaka.",
    "billingScreen.reason.cancellationReversed": "Den uppsägningen har redan dragits tillbaka.",
    "billingScreen.reason.cancellationRecreated":
      "Uppsägningens läge har ändrats. Kontrollera det aktuella abonnemanget.",
    "billingScreen.reason.cancelIrreversible": "Abonnemanget har upphört och kan inte återupptas.",
    "billingScreen.reason.unavailable":
      "Faktureringsuppgifterna är inte tillgängliga just nu, så åtgärden hålls tillbaka.",
    "billingScreen.reason.unknown":
      "Vi kan inte verifiera resultatet av den här begäran. Den behålls som den är och upprepades inte; titta in på sidan igen om en stund.",
    "billingScreen.feature.oneSite": "1 projekt / 1 webbplats",
    "billingScreen.feature.audit": "Kostnadsfri granskning av AI-synlighet",
    "billingScreen.feature.limitedContent": "Begränsat innehåll och Milo Score",
    "billingScreen.feature.analyticsLite": "Analys och GSC Lite",
    "billingScreen.feature.authorityPreview": "Förhandsvisning av auktoritetsbyggande",
    "billingScreen.feature.brandOpportunities": "Varumärkesanalys och möjligheter",
    "billingScreen.feature.contentScore": "Innehåll + Milo Score",
    "billingScreen.feature.publishingCustom": "Publicering (egen integration och WordPress)",
    "billingScreen.feature.analyticsAuthority": "Analys v2, GSC Lite, auktoritetsbyggande",
    "billingScreen.feature.threeSites": "Upp till 3 projekt / webbplatser",
    "billingScreen.feature.higherContent": "Högre gränser för innehåll och förbättringar",
    "billingScreen.feature.publishingConnectors": "Publicering + integrationer",
    "billingScreen.feature.analyticsAuthorityV2": "Analys v2, GSC Lite, auktoritetsbyggande v2",
    "billingScreen.feature.planner": "Planerare för AI-synlighet",
    "billingScreen.feature.fiveSites": "Upp till 5 projekt / webbplatser",
    "billingScreen.feature.highLimits": "Höga månadsgränser",
    "billingScreen.feature.images": "AI-bildgenerering",
    "billingScreen.feature.moreGsc": "Fler GSC-importer och mer auktoritetsbyggande",
    "billingScreen.feature.evaluationConfigured": "AI-utvärdering (där den är konfigurerad)",
    "billingScreen.feature.prioritySupport": "Prioriterad support",
    "billingScreen.feature.clientProjects": "Upp till 15 kundprojekt",
    "billingScreen.feature.reports": "Månadsrapporter med eget varumärke (på begäran)",
    "billingScreen.feature.highestLimits": "Högsta månadsgränserna",
    "billingScreen.feature.allConnectors":
      "Integrationer + AI-utvärdering (där de är konfigurerade)",
  },
  da: {
    "billingScreen.owner": "Ejer",
    "billingScreen.freePreview": "Gratis forhåndsvisning",
    "billingScreen.saveFailed": "Kunne ikke gemme",
    "billingScreen.checkoutFailed": "Betalingen kunne ikke startes",
    "billingScreen.planFailed": "Kunne ikke opdatere abonnementet.",
    "billingScreen.portalUnlinked":
      "Kontoen er ikke tilknyttet den ældre Paddle-portal. Kontakt billing@milogrowth.com for hjælp til abonnementsændringer.",
    "billingScreen.portalFailed": "Kunne ikke åbne abonnementsadministrationen.",
    "billingScreen.projects": "Projekter: {n}",
    "billingScreen.websites": "Websteder: {n}",
    "billingScreen.publishingOn": "Publicering inkluderet",
    "billingScreen.publishingOff": "Publicering ikke inkluderet",
    "billingScreen.contentMonthly": "Indholdsgenereringer pr. måned: {n}",
    "billingScreen.manageTitle": "Administrer dit abonnement",
    "billingScreen.manageHelp":
      "Åbn den tilknyttede faktureringsportal for at gennemgå betalingsoplysninger, fakturaer og tilgængelige abonnementsændringer.",
    "billingScreen.cancelAt": "Opsigelsen er planlagt til {date}.",
    "billingScreen.manage": "Administrer fakturering",
    "billingScreen.cancel": "Opsig abonnement",
    "billingScreen.inactiveHelp":
      "Her vises administration og opsigelse for et aktivt betalt eller manuelt tildelt abonnement.",
    "billingScreen.otherCountry": "Andet / ikke på listen",
    "billingScreen.market.Poland": "Polen",
    "billingScreen.market.Sweden": "Sverige",
    "billingScreen.market.Denmark": "Danmark",
    "billingScreen.market.United Kingdom": "Storbritannien",
    "billingScreen.market.European Union": "Den Europæiske Union",
    "billingScreen.market.Other": "Andet",
    "billingScreen.separateAddon": "Separat tilkøb",
    "billingScreen.backlinksHelp":
      "Linkanalyse, gennemgang af markedspladsen og kontakt til udgivere. Placeringer hos udgivere kræver særskilt gennemgang og købsgodkendelse.",
    "billingScreen.reviewAddon": "Se tilkøb",
    "billingScreen.cancelHelp":
      "For et tilknyttet Paddle-abonnement kan du åbne den ældre portal for at gennemgå opsigelsesmuligheder og bekræfte, hvornår adgangen ophører.",
    "billingScreen.cancelExport":
      "Du kan eksportere dit indhold, før adgangen ændres. Gennemgå eventuelle særskilte linkkøb separat.",
    "billingScreen.unknownValue": "Ukendt",
    "billingScreen.commercial.title": "Abonnement og faktureringshandlinger",
    "billingScreen.commercial.loading": "Læser din faktureringsstatus…",
    "billingScreen.commercial.unavailable":
      "Vi kunne ikke læse din faktureringsstatus, så vi kan ikke bekræfte dit nuværende abonnement eller resultatet af noget nyligt. Handlinger er på hold, indtil læsningen lykkes.",
    "billingScreen.commercial.refreshFailed":
      "Den seneste opdatering lykkedes ikke. Oplysningerne nedenfor er de senest verificerede.",
    "billingScreen.commercial.refresh": "Opdater faktureringsstatus",
    "billingScreen.commercial.provider": "Faktureringsudbyder",
    "billingScreen.commercial.provider.stripe": "Stripe",
    "billingScreen.commercial.provider.paddle": "Paddle",
    "billingScreen.commercial.provider.manual": "Manuel tildeling",
    "billingScreen.commercial.provider.none": "Ingen betalt aftale",
    "billingScreen.commercial.provider.unknown": "Ikke fastslået",
    "billingScreen.commercial.mode": "Udbydertilstand",
    "billingScreen.commercial.mode.test": "Test",
    "billingScreen.commercial.mode.live": "Live",
    "billingScreen.commercial.plan": "Verificeret abonnement",
    "billingScreen.commercial.access": "Adgang",
    "billingScreen.commercial.access.free": "Gratis",
    "billingScreen.commercial.access.paid": "Betalt",
    "billingScreen.commercial.access.unknown": "Ikke fastslået",
    "billingScreen.commercial.access.pendingProjection": "Afventer verificering",
    "billingScreen.commercial.seats": "Købte ekstra pladser",
    "billingScreen.commercial.periodEnd": "Betalt periode slutter",
    "billingScreen.commercial.cancelScheduled":
      "En opsigelse er planlagt til udgangen af den betalte periode.",
    "billingScreen.commercial.currentAmount": "Nuværende faktureret beløb",
    "billingScreen.commercial.amountUnknown": "Findes ikke i faktureringsgrundlaget",
    "billingScreen.commercial.amountFixture": "Værdi fra lokale testdata — ikke en kundeoplysning",
    "billingScreen.commercial.catalogNote":
      "Priserne nedenfor er katalogpriser for det land, der er valgt i formularen. De er ikke din nuværende betaling.",
    "billingScreen.commercial.pendingProjection":
      "Din adgang er ikke ændret endnu. Den ændres først, når vi har verificeret den nye tilstand.",
    "billingScreen.commercial.manualHeld":
      "Manuelle abonnementsændringer er sat på hold, så længe kontoens Stripe-tilstand er uafklaret eller ulæselig.",
    "billingScreen.commercial.manualHeldToast":
      "Manuelle abonnementsændringer er på hold for denne konto lige nu.",
    "billingScreen.commercial.freeIsCancellation":
      "At skifte til det gratis abonnement er en opsigelse af det betalte abonnement og bekræftes separat.",
    "billingScreen.commercial.manageUnavailable":
      "Selvbetjent abonnementsadministration er ikke tilgængelig for denne konto. Kontakt billing@milogrowth.com.",
    "billingScreen.commercial.manageHelpStripe":
      "Ændringer af abonnement, pladser og opsigelse for dette abonnement foretages her, og hver enkelt bekræftes separat.",
    "billingScreen.commercial.manageHelpStripeHeld":
      "Dette Stripe-abonnement administreres her, men der er ingen ændring tilgængelig lige nu.",
    "billingScreen.commercial.manageHelpStripeReversal":
      "Abonnementet er ved at ophøre. Den eneste ændring, der er tilgængelig her, er at trække opsigelsen tilbage.",
    "billingScreen.commercial.manageHelpPaddle":
      "Dette abonnement ligger i den ældre Paddle-portal. Åbn den for at gennemgå betalingsoplysninger, fakturaer og opsigelse.",
    "billingScreen.commercial.manageHelpManual":
      "Abonnementet blev tildelt manuelt, så der er intet at administrere hos en betalingsudbyder. Kontakt billing@milogrowth.com for at ændre det.",
    "billingScreen.commercial.manageHelpNone":
      "Der er intet betalt abonnement på kontoen, så der er intet at administrere.",
    "billingScreen.commercial.cancelHelpStripe":
      "Ved opsigelse er abonnementet aktivt indtil udgangen af den periode, du har betalt for. Du bekræfter den præcise dato, før der sendes noget.",
    "billingScreen.commercial.operation.notDiscovered":
      "Vi kan i øjeblikket ikke se denne anmodning i faktureringsgrundlaget. Den bevares præcis som den blev sendt og blev ikke gentaget, og ændringer er på hold, indtil resultatet kan verificeres.",
    "billingScreen.commercial.changePlan": "Skift abonnement eller pladser",
    "billingScreen.commercial.planInput": "Ønsket abonnement",
    "billingScreen.commercial.seatInput": "Ønsket antal ekstra arbejdspladser",
    "billingScreen.commercial.prepare": "Forbered et tilbud",
    "billingScreen.commercial.reverse": "Træk den planlagte opsigelse tilbage",
    "billingScreen.commercial.resume": "Tjek denne handling igen",
    "billingScreen.commercial.quote.title": "Bekræft denne ændring",
    "billingScreen.commercial.quote.loading": "Forbereder tilbuddet…",
    "billingScreen.commercial.quote.dueNow": "Beløb til betaling nu",
    "billingScreen.commercial.quote.recurring": "Langsigtet skøn over det tilbagevendende beløb",
    "billingScreen.commercial.quote.recurringNote":
      "Et skøn over én hel periode med det ønskede abonnement og antal pladser. Det er ikke et løfte om din næste betaling.",
    "billingScreen.commercial.quote.recurringAdjusted":
      "Skønnet indeholder eksisterende reguleringer på abonnementet.",
    "billingScreen.commercial.quote.effective": "Træder i kraft",
    "billingScreen.commercial.quote.effectiveImmediate": "Når beløbet til betaling nu er betalt",
    "billingScreen.commercial.quote.expires": "Tilbuddet gælder til",
    "billingScreen.commercial.quote.expired":
      "Tilbuddet er udløbet og kan ikke bekræftes. Forbered et nyt.",
    "billingScreen.commercial.quote.stale":
      "Dit valg blev ændret, så tilbuddet gælder ikke længere. Forbered det igen.",
    "billingScreen.commercial.quote.limits":
      "Nye grænser: {working} arbejdspladser, {viewer} læsepladser, {projects} projekter.",
    "billingScreen.commercial.confirm": "Bekræft ændringen",
    "billingScreen.commercial.working": "I gang…",
    "billingScreen.commercial.cancel.title": "Opsig dit abonnement",
    "billingScreen.commercial.cancel.body":
      "Dit abonnement er aktivt indtil udgangen af den periode, du har betalt for, og stopper derefter. Du bliver ikke opkrævet igen.",
    "billingScreen.commercial.cancel.until": "Adgangen fortsætter til {date}.",
    "billingScreen.commercial.cancel.untilUnknown":
      "Den præcise slutdato findes endnu ikke i faktureringsgrundlaget.",
    "billingScreen.commercial.cancel.confirm": "Bekræft opsigelsen",
    "billingScreen.commercial.reverse.title": "Træk opsigelsen tilbage",
    "billingScreen.commercial.reverse.body":
      "Dette beder udbyderen om at lade det eksisterende abonnement fortsætte i stedet for at afslutte det ved den betalte periodes udgang.",
    "billingScreen.commercial.reverse.confirm": "Træk opsigelsen tilbage",
    "billingScreen.commercial.operation.title": "En faktureringshandling er åben",
    "billingScreen.commercial.operation.pending": "Vi venter på svar. Start ikke en ny ændring.",
    "billingScreen.commercial.operation.uncertain":
      "Resultatet af denne anmodning er ikke bekræftet. Den blev ikke gentaget, og der blev ikke oprettet en ny.",
    "billingScreen.commercial.operation.applied":
      "Udbyderen rapporterede ændringen som gennemført. Din adgang ændres først, når vi har verificeret det.",
    "billingScreen.commercial.operation.awaitingPayment":
      "Der kræves en betaling, før ændringen træder i kraft.",
    "billingScreen.commercial.operation.scheduled": "Denne ændring er planlagt til en senere dato.",
    "billingScreen.commercial.operation.cancelled": "Anmodningen om opsigelse blev modtaget.",
    "billingScreen.commercial.operation.reversed": "Opsigelsen blev trukket tilbage.",
    "billingScreen.commercial.operation.verifiedApplied":
      "Ændringen er gennemført og verificeret. Abonnementet ovenfor er det nye.",
    "billingScreen.commercial.operation.verifiedCancelled":
      "Opsigelsen er bekræftet og verificeret. Adgangen fortsætter til udgangen af den betalte periode.",
    "billingScreen.commercial.operation.verifiedReversed":
      "Tilbagetrækningen er bekræftet og verificeret. Abonnementet ophører ikke længere.",
    "billingScreen.commercial.operation.refused":
      "Anmodningen blev afvist. Tjek den aktuelle tilstand, før du prøver noget andet.",
    "billingScreen.commercial.operation.terms":
      "Oprindelig anmodning: {plan}, {seats} ekstra pladser.",
    "billingScreen.commercial.operation.ambiguous":
      "Vi kan ikke afgøre, hvilken faktureringshandling der er åben, så alle ændringer er på hold.",
    "billingScreen.commercial.operation.dismiss": "Skjul denne besked",
    "billingScreen.reason.held":
      "Ændringer af abonnement, pladser og opsigelse er på hold, indtil betalingsopsætning, godkendelse og release er på plads.",
    "billingScreen.reason.notConfigured":
      "Faktureringen er endnu ikke fuldt konfigureret for denne konto.",
    "billingScreen.reason.accountUnverified": "Faktureringskontoen kunne ikke verificeres.",
    "billingScreen.reason.subscriptionNotCurrent":
      "Abonnementet er ikke i en tilstand, der kan ændres lige nu.",
    "billingScreen.reason.scheduleConflict": "En anden planlagt ændring er i konflikt med denne.",
    "billingScreen.reason.cancellationPending":
      "Der er allerede en opsigelse undervejs på dette abonnement.",
    "billingScreen.reason.mixedChange":
      "Det understøttes ikke her at ændre abonnement og antal pladser samtidig.",
    "billingScreen.reason.marketReview":
      "Dit faktureringsland er ændret, så abonnementet skal gennemgås før flere ændringer.",
    "billingScreen.reason.billingCountry": "Dit faktureringsland kunne ikke fastslås.",
    "billingScreen.reason.currencyUnsupported":
      "Denne valuta understøttes ikke ved abonnementsændringer.",
    "billingScreen.reason.currencySwitch":
      "Et igangværende abonnement kan ikke skifte valuta. Kontakt supporten.",
    "billingScreen.reason.seatMarket":
      "Ekstra pladser er endnu ikke tilgængelige på dit faktureringsmarked.",
    "billingScreen.reason.capacityUnknown":
      "Dit nuværende forbrug kunne ikke fastslås, så ændringen er på hold.",
    "billingScreen.reason.capacityWorking":
      "Der er for mange arbejdspladser i brug til det ønskede abonnement. Arbejdspladser tæller både personer og afventende invitationer.",
    "billingScreen.reason.capacityViewer":
      "Der er for mange læsepladser i brug til det ønskede abonnement.",
    "billingScreen.reason.capacityProjectsUnknown":
      "Antallet af projekter kunne ikke fastslås, så ændringen er på hold.",
    "billingScreen.reason.capacityProjects":
      "Der er for mange projekter til det ønskede abonnement.",
    "billingScreen.reason.requestInvalid": "Anmodningen kunne ikke accepteres.",
    "billingScreen.reason.quoteInvalid": "Tilbuddet kan ikke bruges. Forbered et nyt.",
    "billingScreen.reason.quoteSelectionChanged":
      "Dit valg blev ændret, efter at tilbuddet blev forberedt.",
    "billingScreen.reason.quoteRefused": "Tilbuddet blev afvist, og intet blev opkrævet.",
    "billingScreen.reason.previewUnavailable":
      "Udbyderens forhåndsberegning er ikke tilgængelig, så der blev ikke udstedt et tilbud.",
    "billingScreen.reason.previewUnreadable":
      "Udbyderens forhåndsberegning kunne ikke læses præcist, så der blev ikke udstedt et tilbud. Det er ikke et nulbeløb.",
    "billingScreen.reason.outcomeUncertain":
      "Resultatet er ikke bekræftet. Den oprindelige anmodning bevares, og der blev ikke oprettet en ny.",
    "billingScreen.reason.paymentPending": "Ændringen afventer en betaling hos udbyderen.",
    "billingScreen.reason.paymentDeclined":
      "Fakturaen for ændringen er ikke betalt, så ændringen er ikke gennemført.",
    "billingScreen.reason.changeNotApplied": "Ændringen er endnu ikke gennemført.",
    "billingScreen.reason.dispatchUncertain":
      "Anmodningen findes måske allerede hos udbyderen, så intet blev gentaget eller erstattet.",
    "billingScreen.reason.bindingHeld":
      "Handlingens oplysninger kunne ikke matches præcist, så den er på hold til gennemgang.",
    "billingScreen.reason.operationFenced":
      "Handlingen er på hold ud fra de oplysninger, vi har. Der blev ikke sendt mere.",
    "billingScreen.reason.scheduleHeld":
      "Udbyderens tidsplan for ændringen kunne ikke bekræftes, så den er på hold.",
    "billingScreen.reason.notApplied":
      "Der er intet bekræftet resultat. Den oprindelige anmodning bevares.",
    "billingScreen.reason.operationRefused": "Handlingen blev afvist.",
    "billingScreen.reason.operationFailed": "Handlingen mislykkedes og blev lukket.",
    "billingScreen.reason.operationExpired": "Handlingen udløb, før der blev sendt noget.",
    "billingScreen.reason.cancellationPreexisting": "Der var allerede en opsigelse.",
    "billingScreen.reason.cancellationAbsent": "Der er ingen opsigelse at trække tilbage.",
    "billingScreen.reason.cancellationReversed": "Den opsigelse er allerede trukket tilbage.",
    "billingScreen.reason.cancellationRecreated":
      "Opsigelsens tilstand er ændret. Tjek det aktuelle abonnement.",
    "billingScreen.reason.cancelIrreversible": "Abonnementet er ophørt og kan ikke genoptages.",
    "billingScreen.reason.unavailable":
      "Faktureringsoplysningerne er ikke tilgængelige lige nu, så handlingen er på hold.",
    "billingScreen.reason.unknown":
      "Vi kan ikke verificere resultatet af denne anmodning. Den bevares, som den er, og blev ikke gentaget; se på siden igen om lidt.",
    "billingScreen.feature.oneSite": "1 projekt / 1 websted",
    "billingScreen.feature.audit": "Gratis gennemgang af AI-synlighed",
    "billingScreen.feature.limitedContent": "Begrænset indhold og Milo Score",
    "billingScreen.feature.analyticsLite": "Analyse og GSC Lite",
    "billingScreen.feature.authorityPreview": "Forhåndsvisning af autoritetsopbygning",
    "billingScreen.feature.brandOpportunities": "Brandanalyse og muligheder",
    "billingScreen.feature.contentScore": "Indhold + Milo Score",
    "billingScreen.feature.publishingCustom": "Publicering (egen integration og WordPress)",
    "billingScreen.feature.analyticsAuthority": "Analyse v2, GSC Lite, autoritetsopbygning",
    "billingScreen.feature.threeSites": "Op til 3 projekter / websteder",
    "billingScreen.feature.higherContent": "Højere grænser for indhold og forbedringer",
    "billingScreen.feature.publishingConnectors": "Publicering + integrationer",
    "billingScreen.feature.analyticsAuthorityV2": "Analyse v2, GSC Lite, autoritetsopbygning v2",
    "billingScreen.feature.planner": "Planlægger for AI-synlighed",
    "billingScreen.feature.fiveSites": "Op til 5 projekter / websteder",
    "billingScreen.feature.highLimits": "Høje månedsgrænser",
    "billingScreen.feature.images": "AI-billedgenerering",
    "billingScreen.feature.moreGsc": "Flere GSC-importer og mere autoritetsopbygning",
    "billingScreen.feature.evaluationConfigured": "AI-evaluering (hvor den er konfigureret)",
    "billingScreen.feature.prioritySupport": "Prioriteret support",
    "billingScreen.feature.clientProjects": "Op til 15 kundeprojekter",
    "billingScreen.feature.reports": "Månedsrapporter med eget brand (efter behov)",
    "billingScreen.feature.highestLimits": "Højeste månedsgrænser",
    "billingScreen.feature.allConnectors":
      "Integrationer + AI-evaluering (hvor de er konfigureret)",
  },
};
