/** Manual recording of one collected discovery observation (CG-03C). Plain language; never claims MILO ran a
 * provider, verified an answer, cancelled a sent request or that an unconfirmed save was "not saved". Polish,
 * Swedish and Danish are author-written; no fluent-speaker acceptance is claimed. */
const en = {
  "manualCapture.open": "Record a collected answer",
  "manualCapture.openHelp":
    "For an answer you already collected yourself for one question and round of an approved panel. MILO does not run the question.",
  "manualCapture.title": "Record a collected answer",
  "manualCapture.intro":
    "Save one answer you collected for an approved question and round. What you enter is stored as you report it; MILO does not check it with the service.",
  "manualCapture.notSent": "Not sent. Please fix:",
  "manualCapture.step.choose": "Which observation",
  "manualCapture.step.answer": "The answer you got",
  "manualCapture.step.context": "How it was actually collected",
  "manualCapture.noVersion":
    "No approved discovery panel with a valid weekly schedule is available for recording.",
  "manualCapture.version": "Approved panel version",
  "manualCapture.versionOption": "Version {version} · {client} · approved {date}",
  "manualCapture.question": "Question",
  "manualCapture.round": "Round",
  "manualCapture.roundOption": "Round {round} · planned {date} · {state}",
  "manualCapture.choose": "Choose…",
  "manualCapture.slot.available": "can be recorded",
  "manualCapture.slot.notDue": "not due yet",
  "manualCapture.slot.occupied": "already has a record",
  "manualCapture.slot.erased": "used by a deleted record",
  "manualCapture.approvedQuestion": "Approved question (exact text)",
  "manualCapture.intendedSlot": "Planned time for this round: {date}",
  "manualCapture.affirm": "I asked exactly this question, word for word.",
  "manualCapture.affirmHelp":
    "If you asked something different, it cannot be recorded as this planned observation.",
  "manualCapture.status": "Result",
  "manualCapture.failure": "What went wrong",
  "manualCapture.rawAnswer": "The answer text",
  "manualCapture.rawAnswerHelp": "Paste the full answer as you received it.",
  "manualCapture.citations": "Source links shown with the answer",
  "manualCapture.citationsHelp":
    "One link per line, only links the answer itself showed as sources. Links inside the text do not count.",
  "manualCapture.citationsComplete":
    "I checked all sources shown, and this list is complete (an empty list then means no sources).",
  "manualCapture.contextHelp":
    "Enter what actually happened. The panel's planned settings are shown only for comparison; leave anything you do not know as unknown.",
  "manualCapture.capturedDate": "Date you collected it",
  "manualCapture.capturedTime": "Time (with seconds if you know them)",
  "manualCapture.utcOffset": "UTC offset of that time",
  "manualCapture.timeHelp":
    "The time on your clock when you got the answer, and its offset from UTC, for example +02:00. It must be after the planned time and not in the future.",
  "manualCapture.expected": "Planned: {value}",
  "manualCapture.service": "Service used",
  "manualCapture.interfaceName": "App or website used",
  "manualCapture.mode": "Kind of answer",
  "manualCapture.modeHelp": "API answers cannot be recorded here.",
  "manualCapture.searchMode": "Search mode shown (if any)",
  "manualCapture.modelLabel": "Model name shown",
  "manualCapture.webSearch": "Did it show it searched the web?",
  "manualCapture.freshSession": "Was it a fresh conversation?",
  "manualCapture.priorMessages": "Messages before the question",
  "manualCapture.requiredFact": "Required: please answer this.",
  "manualCapture.unknownBlank": "Leave empty if unknown.",
  "manualCapture.personalisation": "Personalisation",
  "manualCapture.signedIn": "Signed in",
  "manualCapture.memory": "Memory",
  "manualCapture.customInstructions": "Custom instructions",
  "manualCapture.connectedTools": "Connected tools",
  "manualCapture.temporaryChat": "Temporary chat",
  "manualCapture.accountTier": "Account plan",
  "manualCapture.interfaceLanguage": "Interface language",
  "manualCapture.answerLanguage": "Language of the answer",
  "manualCapture.collectionCountry": "Country you collected from",
  "manualCapture.collectionCity": "City you collected from",
  "manualCapture.locationInQuestion": "Place named in the question",
  "manualCapture.devicePermission": "Location permission",
  "manualCapture.vpn": "VPN used",
  "manualCapture.extraInstruction": "Anything you added to the question",
  "manualCapture.screenshotRef": "Screenshot reference",
  "manualCapture.screenshotRefHelp":
    "A note of where you keep a screenshot. MILO does not store or check the screenshot.",
  "manualCapture.missingReason": "Why there is no screenshot",
  "manualCapture.cost": "Cost you were charged (USD)",
  "manualCapture.costHelp": "Optional and self-reported; not a verified charge.",
  "manualCapture.sourceUrl": "Link to the answer page",
  "manualCapture.deviationNotes": "Notes",
  "manualCapture.deviationNotesHelp": "Anything that differed from the plan, one note per line.",
  "manualCapture.review": "Review before saving",
  "manualCapture.reviewTitle": "This exact entry will be saved:",
  "manualCapture.reviewWhen": "Collected at: {at}",
  "manualCapture.reviewStatus": "Result: {status}",
  "manualCapture.reviewCitations": "Source links: {count} · list complete: {complete}",
  "manualCapture.reviewMethod": "Entry method: {method}",
  "manualCapture.reviewHelp":
    "Saving sends exactly this entry. To change anything, go back and edit before saving.",
  "manualCapture.save": "Save",
  "manualCapture.edit": "Edit",
  "manualCapture.sending": "Sending… Please wait.",
  "manualCapture.unconfirmed": "Save not confirmed",
  "manualCapture.unconfirmedNote.sent":
    "The request was sent, but MILO could not confirm whether it was stored. It may already be saved.",
  "manualCapture.unconfirmedNote.resend":
    "Sending the same entry again could not be confirmed either. The earlier attempt may still be saved.",
  "manualCapture.unconfirmedNote.notFound":
    "Your saved records do not show this exact entry yet. It may still be saved later.",
  "manualCapture.unconfirmedNote.checkFailed":
    "Your saved records could not be read. The save is still unconfirmed.",
  "manualCapture.check": "Check saved records",
  "manualCapture.resend": "Send this exact entry again",
  "manualCapture.confirmed":
    "Saved. MILO confirmed this entry is stored (it may have been saved earlier).",
  "manualCapture.confirmedMatch": "Saved. This exact entry was found in your saved records.",
  "manualCapture.savedRecord": "Record ID: {id}",
  "manualCapture.refreshing": "Loading the updated records…",
  "manualCapture.refreshFailed": "The save is confirmed, but the updated view could not be loaded.",
  "manualCapture.reload": "Load the updated view",
  "manualCapture.resolved": "Read as: {outcome}",
  "manualCapture.noDeviations":
    "No gaps or differences from the plan were found in the recorded details.",
  "manualCapture.cancel": "Cancel",
  "manualCapture.close": "Close",
  "manualCapture.leave.title": "Leave this entry?",
  "manualCapture.leave.unsent": "What you entered has not been sent and will be discarded.",
  "manualCapture.leave.sending":
    "The save request was already sent and cannot be cancelled. It may still be stored. Leaving drops this copy here; check the coverage list later.",
  "manualCapture.leave.unconfirmed":
    "This entry may already be stored. Leaving drops this copy here; it does not undo a save.",
  "manualCapture.leave.stay": "Stay",
  "manualCapture.leave.discard": "Discard",
  "manualCapture.leave.abandon": "Leave anyway",
  "manualCapture.issue.slotUnavailable":
    "Choose a version, question and round that can be recorded.",
  "manualCapture.issue.affirmQuestion": "Confirm that you asked exactly the approved question.",
  "manualCapture.issue.status": "Choose the result.",
  "manualCapture.issue.failureRequired": "Describe what went wrong.",
  "manualCapture.issue.failureNotAllowed":
    "A complete answer cannot have a failure description. Remove it on the answer step, or choose Failed or Cut off.",
  "manualCapture.issue.rawAnswer": "Enter the answer text.",
  "manualCapture.issue.capturedAt": "Enter a valid date, time and UTC offset.",
  "manualCapture.issue.beforeSlot": "The time is before the planned time of this round.",
  "manualCapture.issue.beforeApproval": "The time is before the panel was approved.",
  "manualCapture.issue.inFuture": "The time is in the future.",
  "manualCapture.issue.service": "Enter the service you used.",
  "manualCapture.issue.interfaceName": "Enter the app or website you used.",
  "manualCapture.issue.mode": "Choose the kind of answer.",
  "manualCapture.issue.freshSession": "Answer whether it was a fresh conversation.",
  "manualCapture.issue.priorMessages":
    "Enter how many messages came before the question (0 or more).",
  "manualCapture.issue.citations":
    "Each source link must be a public web address of up to 2,048 characters (at most 100 links).",
  "manualCapture.issue.cost": "Enter a cost of 0 or more, or leave it empty.",
  "manualCapture.issue.sourceUrl":
    "The answer page link must be a public web address of up to 2,048 characters.",
  "manualCapture.issue.capacity":
    "This project already holds the maximum of 100 saved answer records.",
  "manualCapture.issue.invalid": "Some values are not in an accepted form. Please check them.",
  "manualCapture.opt.complete": "Complete",
  "manualCapture.opt.failed": "Failed",
  "manualCapture.opt.truncated": "Cut off",
  "manualCapture.opt.missed": "Missed",
  "manualCapture.opt.protocol_deviant": "Not following the panel rules",
  "manualCapture.opt.consumer-web": "Chat app or website",
  "manualCapture.opt.search": "Search with AI answers",
  "manualCapture.opt.unknown": "Unknown",
  "manualCapture.opt.evidenced": "Yes, it showed a web search",
  "manualCapture.opt.not_evidenced": "No",
  "manualCapture.opt.yes": "Yes",
  "manualCapture.opt.no": "No",
  "manualCapture.opt.non_personalised": "Off",
  "manualCapture.opt.personalised": "On",
  "manualCapture.opt.signed_in": "Signed in",
  "manualCapture.opt.signed_out": "Signed out",
  "manualCapture.opt.off": "Off",
  "manualCapture.opt.on": "On",
  "manualCapture.opt.none": "None",
  "manualCapture.opt.present": "Some",
  "manualCapture.opt.granted": "Allowed",
  "manualCapture.opt.denied": "Not allowed",
  "manualCapture.stepOf": "Step {n} of 3",
  "manualCapture.continue": "Continue",
  "manualCapture.back": "Back",
  "manualCapture.questionOption": "Question {n}: {text}",
  "manualCapture.requiredFacts": "When and how you asked (required)",
  "manualCapture.optional.model": "Model and web search — optional; empty means unknown",
  "manualCapture.optional.session":
    "Account and conversation settings — optional; unknown unless chosen",
  "manualCapture.optional.place": "Language and location — optional; empty means unknown",
  "manualCapture.optional.notes": "Additions, screenshot, cost and notes — optional",
  "manualCapture.slot.occupancyUnknown": "cannot be checked yet",
  "manualCapture.slot.promptMissing": "question no longer available",
  "manualCapture.slot.readsUnavailable": "records could not be loaded",
  "manualCapture.issue.readsUnavailable":
    "Your saved records could not be loaded just now, so a new entry cannot be sent. What you entered is kept; try again in a moment.",
  "manualCapture.issue.promptMissing":
    "This approved question is no longer in your question list (it may have been deleted or changed), so it cannot be recorded.",
  "manualCapture.issue.occupancyUnknown":
    "MILO cannot yet tell whether this round already has a record, so a new entry cannot be sent for it now.",
  "manualCapture.reviewQuestion": "Question {n}, round {round}: {text}",
  "manualCapture.reviewPlanned": "Planned time: {date}",
  "manualCapture.reviewAnswer": "Answer: {excerpt}",
  "manualCapture.reviewSurface": "Asked in: {service} · {interface} · {mode}",
  "manualCapture.reviewSession":
    "Fresh conversation: {fresh} · messages before the question: {prior}",
  "manualCapture.reviewUnknown": "Optional details left unknown: {count}",
  "manualCapture.confirmedWhen": "Collected at: {at}",
  "manualCapture.savedAnswer": "Stored answer: {excerpt}",
  "manualCapture.savedSources": "Stored source links: {count}",
  "manualCapture.deviationsTitle": "Gaps or differences from the plan in the recorded details:",
  "manualCapture.deviation.other": "Other gap or difference in the recorded details (code {code})",
  "manualCapture.deviation.session_not_fresh": "Recorded as not a fresh conversation",
  "manualCapture.deviation.prior_messages": "Recorded messages before the question",
  "manualCapture.deviation.extra_instruction": "Recorded an addition to the question",
  "manualCapture.deviation.personalisation_differs":
    "Personalisation: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.signed_in_differs":
    "Sign-in state: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.memory_differs":
    "Memory: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.custom_instructions_differ":
    "Custom instructions: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.connected_tools_differ":
    "Connected tools: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.account_tier_differs":
    "Account plan: the recorded value differs from the plan",
  "manualCapture.deviation.prompt_language_differs":
    "Question language: the recorded value differs from the plan",
  "manualCapture.deviation.interface_language_differs":
    "Interface language: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.surface_or_mode_differs":
    "Service, app, kind of answer or search mode: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.model_label_differs":
    "Model name: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.web_search_evidence_differs":
    "Web search indication: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.collection_country_differs":
    "Country: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.collection_city_differs":
    "City: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.device_location_differs":
    "Location permission: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.vpn_differs":
    "VPN use: the recorded details do not match the plan (a different value, or not recorded)",
  "manualCapture.deviation.capture_window_overrun":
    "Recorded time is outside the planned time window",
  "manualCapture.deviation.delay_untruthful": "Recorded delay does not match the times",
  "manualCapture.deviation.intended_slot_mismatch":
    "Planned time does not match the approved schedule",
  "manualCapture.deviation.discovery_schedule_invalid": "The panel's schedule is not valid",
  "manualCapture.deviation.discovery_schedule_missing": "The panel has no approved schedule",
  "manualCapture.deviation.duplicate_slot": "Another record exists for the same question and round",
  "manualCapture.deviation.erased_duplicate_slot":
    "A deleted record used the same question and round",
  "manualCapture.deviation.panel_unresolved": "The panel could not be found",
  "manualCapture.deviation.panel_not_approved": "The panel was not approved",
  "manualCapture.deviation.panel_version_differs": "Recorded panel version is not this version",
  "manualCapture.deviation.panel_mismatch": "Panel did not match",
  "manualCapture.deviation.question_not_in_panel": "Question is not in the panel",
  "manualCapture.deviation.question_text_changed":
    "Recorded question text is not the approved text",
  "manualCapture.deviation.round_out_of_panel": "Round is outside the panel",
  "manualCapture.deviation.malformed_capture_context": "The recorded details could not be read",
  "manualCapture.deviation.unknown_slot": "Question or round could not be identified",
  "manualCapture.deviation.panel_approved_after_capture":
    "Recorded time is before the panel was approved",
  "manualCapture.deviation.non_consumer_surface": "Not a chat app, website or AI search answer",
  "manualCapture.deviation.panel_grid_invalid": "The panel's question grid is not valid",
  "manualCapture.deviation.discovery_baseline_ambiguous":
    "The panel's baseline settings are ambiguous",
  "manualCapture.deviation.brand_run_on_discovery":
    "A brand run was attached to a discovery observation",
  "manualCapture.issue.tooLong":
    "“{field}” ({where}) is too long: {count} characters; at most {max} are accepted. Shorten it — nothing has been cut.",
  "manualCapture.issue.invalidField":
    "“{field}” ({where}) is not in an accepted form. Please check this field.",
  "manualCapture.issue.deviationNotes": "Notes: at most 20 lines, each up to 500 characters.",
  "manualCapture.charCount": "{count} of {max} characters",
  "manualCapture.failureNotApplicable":
    "A complete answer has no failure description. Remove it, or choose Failed or Cut off to keep it.",
  "manualCapture.removeFailure": "Remove the failure description",
} as const;
type Copy = Record<keyof typeof en, string>;
const pl: Copy = {
  "manualCapture.open": "Zapisz zebraną odpowiedź",
  "manualCapture.openHelp":
    "Dla odpowiedzi, którą już samodzielnie zebrano dla jednego pytania i rundy zatwierdzonego panelu. MILO nie zadaje pytania.",
  "manualCapture.title": "Zapisz zebraną odpowiedź",
  "manualCapture.intro":
    "Zapisz jedną odpowiedź zebraną dla zatwierdzonego pytania i rundy. Wpis jest zapisywany tak, jak go podano; MILO nie sprawdza go w usłudze.",
  "manualCapture.notSent": "Nie wysłano. Popraw:",
  "manualCapture.step.choose": "Która obserwacja",
  "manualCapture.step.answer": "Otrzymana odpowiedź",
  "manualCapture.step.context": "Jak ją faktycznie zebrano",
  "manualCapture.noVersion":
    "Brak zatwierdzonego panelu odkrywania z poprawnym tygodniowym harmonogramem, który można uzupełnić.",
  "manualCapture.version": "Zatwierdzona wersja panelu",
  "manualCapture.versionOption": "Wersja {version} · {client} · zatwierdzona {date}",
  "manualCapture.question": "Pytanie",
  "manualCapture.round": "Runda",
  "manualCapture.roundOption": "Runda {round} · plan {date} · {state}",
  "manualCapture.choose": "Wybierz…",
  "manualCapture.slot.available": "można zapisać",
  "manualCapture.slot.notDue": "jeszcze nie nadszedł czas",
  "manualCapture.slot.occupied": "ma już zapis",
  "manualCapture.slot.erased": "zajęta przez usunięty zapis",
  "manualCapture.approvedQuestion": "Zatwierdzone pytanie (dokładny tekst)",
  "manualCapture.intendedSlot": "Planowany czas tej rundy: {date}",
  "manualCapture.affirm": "Zadałem(-am) dokładnie to pytanie, słowo w słowo.",
  "manualCapture.affirmHelp":
    "Jeśli zadano inne pytanie, nie można go zapisać jako tej planowanej obserwacji.",
  "manualCapture.status": "Wynik",
  "manualCapture.failure": "Co poszło nie tak",
  "manualCapture.rawAnswer": "Tekst odpowiedzi",
  "manualCapture.rawAnswerHelp": "Wklej całą odpowiedź w otrzymanej postaci.",
  "manualCapture.citations": "Linki źródeł pokazane przy odpowiedzi",
  "manualCapture.citationsHelp":
    "Jeden link w wierszu, tylko linki, które odpowiedź sama pokazała jako źródła. Linki w treści się nie liczą.",
  "manualCapture.citationsComplete":
    "Sprawdziłem(-am) wszystkie pokazane źródła i ta lista jest pełna (pusta lista oznacza wtedy brak źródeł).",
  "manualCapture.contextHelp":
    "Podaj, co faktycznie się wydarzyło. Planowane ustawienia panelu są pokazane tylko do porównania; czego nie wiesz, zostaw jako nieznane.",
  "manualCapture.capturedDate": "Data zebrania",
  "manualCapture.capturedTime": "Godzina (z sekundami, jeśli je znasz)",
  "manualCapture.utcOffset": "Przesunięcie tej godziny względem UTC",
  "manualCapture.timeHelp":
    "Godzina na Twoim zegarze w chwili otrzymania odpowiedzi i jej przesunięcie względem UTC, np. +02:00. Musi być po czasie planowanym i nie w przyszłości.",
  "manualCapture.expected": "Plan: {value}",
  "manualCapture.service": "Użyta usługa",
  "manualCapture.interfaceName": "Użyta aplikacja lub strona",
  "manualCapture.mode": "Rodzaj odpowiedzi",
  "manualCapture.modeHelp": "Odpowiedzi z API nie można tu zapisać.",
  "manualCapture.searchMode": "Pokazany tryb wyszukiwania (jeśli był)",
  "manualCapture.modelLabel": "Pokazana nazwa modelu",
  "manualCapture.webSearch": "Czy pokazano, że przeszukano internet?",
  "manualCapture.freshSession": "Czy to była nowa rozmowa?",
  "manualCapture.priorMessages": "Wiadomości przed pytaniem",
  "manualCapture.requiredFact": "Wymagane: odpowiedz na to.",
  "manualCapture.unknownBlank": "Zostaw puste, jeśli nie wiesz.",
  "manualCapture.personalisation": "Personalizacja",
  "manualCapture.signedIn": "Zalogowanie",
  "manualCapture.memory": "Pamięć",
  "manualCapture.customInstructions": "Własne instrukcje",
  "manualCapture.connectedTools": "Podłączone narzędzia",
  "manualCapture.temporaryChat": "Czat tymczasowy",
  "manualCapture.accountTier": "Plan konta",
  "manualCapture.interfaceLanguage": "Język interfejsu",
  "manualCapture.answerLanguage": "Język odpowiedzi",
  "manualCapture.collectionCountry": "Kraj, z którego zebrano",
  "manualCapture.collectionCity": "Miasto, z którego zebrano",
  "manualCapture.locationInQuestion": "Miejsce wymienione w pytaniu",
  "manualCapture.devicePermission": "Zgoda na lokalizację",
  "manualCapture.vpn": "Użyto VPN",
  "manualCapture.extraInstruction": "Co dodano do pytania",
  "manualCapture.screenshotRef": "Odnośnik do zrzutu ekranu",
  "manualCapture.screenshotRefHelp":
    "Notatka, gdzie przechowujesz zrzut ekranu. MILO nie przechowuje ani nie sprawdza zrzutu.",
  "manualCapture.missingReason": "Dlaczego nie ma zrzutu ekranu",
  "manualCapture.cost": "Pobrana opłata (USD)",
  "manualCapture.costHelp":
    "Opcjonalnie i według Twojej deklaracji; nie jest to zweryfikowana opłata.",
  "manualCapture.sourceUrl": "Link do strony z odpowiedzią",
  "manualCapture.deviationNotes": "Uwagi",
  "manualCapture.deviationNotesHelp": "Wszystko, co różniło się od planu, jedna uwaga w wierszu.",
  "manualCapture.review": "Sprawdź przed zapisaniem",
  "manualCapture.reviewTitle": "Zostanie zapisany dokładnie ten wpis:",
  "manualCapture.reviewWhen": "Zebrano: {at}",
  "manualCapture.reviewStatus": "Wynik: {status}",
  "manualCapture.reviewCitations": "Linki źródeł: {count} · lista pełna: {complete}",
  "manualCapture.reviewMethod": "Sposób wprowadzenia: {method}",
  "manualCapture.reviewHelp":
    "Zapis wysyła dokładnie ten wpis. Aby coś zmienić, wróć i edytuj przed zapisaniem.",
  "manualCapture.save": "Zapisz",
  "manualCapture.edit": "Edytuj",
  "manualCapture.sending": "Wysyłanie… Proszę czekać.",
  "manualCapture.unconfirmed": "Zapis niepotwierdzony",
  "manualCapture.unconfirmedNote.sent":
    "Żądanie zostało wysłane, ale MILO nie może potwierdzić, czy zostało zapisane. Mogło już zostać zapisane.",
  "manualCapture.unconfirmedNote.resend":
    "Ponownego wysłania tego samego wpisu też nie udało się potwierdzić. Wcześniejsza próba mogła zostać zapisana.",
  "manualCapture.unconfirmedNote.notFound":
    "Zapisane rekordy nie pokazują jeszcze dokładnie tego wpisu. Może zostać zapisany później.",
  "manualCapture.unconfirmedNote.checkFailed":
    "Nie udało się odczytać zapisanych rekordów. Zapis nadal jest niepotwierdzony.",
  "manualCapture.check": "Sprawdź zapisane rekordy",
  "manualCapture.resend": "Wyślij ponownie dokładnie ten wpis",
  "manualCapture.confirmed":
    "Zapisano. MILO potwierdziło, że ten wpis jest zapisany (mógł zostać zapisany wcześniej).",
  "manualCapture.confirmedMatch": "Zapisano. Dokładnie ten wpis znaleziono w zapisanych rekordach.",
  "manualCapture.savedRecord": "Identyfikator zapisu: {id}",
  "manualCapture.refreshing": "Wczytywanie zaktualizowanych rekordów…",
  "manualCapture.refreshFailed":
    "Zapis jest potwierdzony, ale nie udało się wczytać zaktualizowanego widoku.",
  "manualCapture.reload": "Wczytaj zaktualizowany widok",
  "manualCapture.resolved": "Odczytano jako: {outcome}",
  "manualCapture.noDeviations":
    "W zapisanych danych nie znaleziono braków ani różnic względem planu.",
  "manualCapture.cancel": "Anuluj",
  "manualCapture.close": "Zamknij",
  "manualCapture.leave.title": "Opuścić ten wpis?",
  "manualCapture.leave.unsent": "Wprowadzone dane nie zostały wysłane i zostaną odrzucone.",
  "manualCapture.leave.sending":
    "Żądanie zapisu zostało już wysłane i nie można go anulować. Może zostać zapisane. Wyjście usuwa tę kopię; sprawdź później listę pokrycia.",
  "manualCapture.leave.unconfirmed":
    "Ten wpis mógł już zostać zapisany. Wyjście usuwa tę kopię; nie cofa zapisu.",
  "manualCapture.leave.stay": "Zostań",
  "manualCapture.leave.discard": "Odrzuć",
  "manualCapture.leave.abandon": "Wyjdź mimo to",
  "manualCapture.issue.slotUnavailable": "Wybierz wersję, pytanie i rundę, które można zapisać.",
  "manualCapture.issue.affirmQuestion": "Potwierdź, że zadano dokładnie zatwierdzone pytanie.",
  "manualCapture.issue.status": "Wybierz wynik.",
  "manualCapture.issue.failureRequired": "Opisz, co poszło nie tak.",
  "manualCapture.issue.failureNotAllowed":
    "Pełna odpowiedź nie może mieć opisu błędu. Usuń go w kroku odpowiedzi albo wybierz „Błąd” lub „Ucięta”.",
  "manualCapture.issue.rawAnswer": "Wpisz tekst odpowiedzi.",
  "manualCapture.issue.capturedAt": "Podaj poprawną datę, godzinę i przesunięcie UTC.",
  "manualCapture.issue.beforeSlot": "Godzina jest wcześniejsza niż planowany czas tej rundy.",
  "manualCapture.issue.beforeApproval": "Godzina jest wcześniejsza niż zatwierdzenie panelu.",
  "manualCapture.issue.inFuture": "Godzina jest w przyszłości.",
  "manualCapture.issue.service": "Podaj użytą usługę.",
  "manualCapture.issue.interfaceName": "Podaj użytą aplikację lub stronę.",
  "manualCapture.issue.mode": "Wybierz rodzaj odpowiedzi.",
  "manualCapture.issue.freshSession": "Odpowiedz, czy była to nowa rozmowa.",
  "manualCapture.issue.priorMessages": "Podaj, ile wiadomości było przed pytaniem (0 lub więcej).",
  "manualCapture.issue.citations":
    "Każdy link źródła musi być publicznym adresem o długości do 2048 znaków (najwyżej 100 linków).",
  "manualCapture.issue.cost": "Podaj koszt 0 lub większy albo zostaw puste.",
  "manualCapture.issue.sourceUrl":
    "Link do strony z odpowiedzią musi być publicznym adresem o długości do 2048 znaków.",
  "manualCapture.issue.capacity":
    "Ten projekt ma już maksymalnie 100 zapisanych rekordów odpowiedzi.",
  "manualCapture.issue.invalid": "Niektóre wartości mają niedozwoloną postać. Sprawdź je.",
  "manualCapture.opt.complete": "Pełna",
  "manualCapture.opt.failed": "Błąd",
  "manualCapture.opt.truncated": "Ucięta",
  "manualCapture.opt.missed": "Pominięta",
  "manualCapture.opt.protocol_deviant": "Niezgodna z zasadami panelu",
  "manualCapture.opt.consumer-web": "Aplikacja czatu lub strona",
  "manualCapture.opt.search": "Wyszukiwarka z odpowiedziami AI",
  "manualCapture.opt.unknown": "Nieznane",
  "manualCapture.opt.evidenced": "Tak, pokazano wyszukiwanie w internecie",
  "manualCapture.opt.not_evidenced": "Nie",
  "manualCapture.opt.yes": "Tak",
  "manualCapture.opt.no": "Nie",
  "manualCapture.opt.non_personalised": "Wyłączona",
  "manualCapture.opt.personalised": "Włączona",
  "manualCapture.opt.signed_in": "Zalogowano",
  "manualCapture.opt.signed_out": "Wylogowano",
  "manualCapture.opt.off": "Wyłączona",
  "manualCapture.opt.on": "Włączona",
  "manualCapture.opt.none": "Brak",
  "manualCapture.opt.present": "Są",
  "manualCapture.opt.granted": "Dozwolona",
  "manualCapture.opt.denied": "Niedozwolona",
  "manualCapture.stepOf": "Krok {n} z 3",
  "manualCapture.continue": "Dalej",
  "manualCapture.back": "Wstecz",
  "manualCapture.questionOption": "Pytanie {n}: {text}",
  "manualCapture.requiredFacts": "Kiedy i jak zadano pytanie (wymagane)",
  "manualCapture.optional.model":
    "Model i wyszukiwanie w sieci — opcjonalne; puste oznacza nieznane",
  "manualCapture.optional.session":
    "Ustawienia konta i rozmowy — opcjonalne; nieznane, dopóki nie wybrano",
  "manualCapture.optional.place": "Język i lokalizacja — opcjonalne; puste oznacza nieznane",
  "manualCapture.optional.notes": "Dodatki, zrzut ekranu, koszt i uwagi — opcjonalne",
  "manualCapture.slot.occupancyUnknown": "nie można jeszcze sprawdzić",
  "manualCapture.slot.promptMissing": "pytanie nie jest już dostępne",
  "manualCapture.slot.readsUnavailable": "nie udało się wczytać zapisów",
  "manualCapture.issue.readsUnavailable":
    "Nie udało się teraz wczytać zapisanych danych, więc nowego wpisu nie można wysłać. Wprowadzone dane zostają; spróbuj ponownie za chwilę.",
  "manualCapture.issue.promptMissing":
    "Tego zatwierdzonego pytania nie ma już na liście pytań (mogło zostać usunięte lub zmienione), więc nie można go zapisać.",
  "manualCapture.issue.occupancyUnknown":
    "MILO nie może jeszcze ustalić, czy ta runda ma już zapis, więc nie można teraz wysłać dla niej nowego wpisu.",
  "manualCapture.reviewQuestion": "Pytanie {n}, runda {round}: {text}",
  "manualCapture.reviewPlanned": "Planowany czas: {date}",
  "manualCapture.reviewAnswer": "Odpowiedź: {excerpt}",
  "manualCapture.reviewSurface": "Zadano w: {service} · {interface} · {mode}",
  "manualCapture.reviewSession": "Nowa rozmowa: {fresh} · wiadomości przed pytaniem: {prior}",
  "manualCapture.reviewUnknown": "Opcjonalne szczegóły pozostawione jako nieznane: {count}",
  "manualCapture.confirmedWhen": "Zebrano: {at}",
  "manualCapture.savedAnswer": "Zapisana odpowiedź: {excerpt}",
  "manualCapture.savedSources": "Zapisane linki do źródeł: {count}",
  "manualCapture.deviationsTitle": "Braki lub różnice względem planu w zapisanych danych:",
  "manualCapture.deviation.other": "Inny brak lub różnica w zapisanych danych (kod {code})",
  "manualCapture.deviation.session_not_fresh": "Zapisano, że nie była to nowa rozmowa",
  "manualCapture.deviation.prior_messages": "Zapisano wiadomości przed pytaniem",
  "manualCapture.deviation.extra_instruction": "Zapisano dodatek do pytania",
  "manualCapture.deviation.personalisation_differs":
    "Personalizacja: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.signed_in_differs":
    "Stan zalogowania: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.memory_differs":
    "Pamięć: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.custom_instructions_differ":
    "Instrukcje własne: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.connected_tools_differ":
    "Połączone narzędzia: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.account_tier_differs": "Plan konta: zapisana wartość różni się od planu",
  "manualCapture.deviation.prompt_language_differs":
    "Język pytania: zapisana wartość różni się od planu",
  "manualCapture.deviation.interface_language_differs":
    "Język interfejsu: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.surface_or_mode_differs":
    "Usługa, aplikacja, rodzaj odpowiedzi lub tryb wyszukiwania: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.model_label_differs":
    "Nazwa modelu: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.web_search_evidence_differs":
    "Oznaka wyszukiwania w sieci: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.collection_country_differs":
    "Kraj: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.collection_city_differs":
    "Miasto: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.device_location_differs":
    "Uprawnienie lokalizacji: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.vpn_differs":
    "Użycie VPN: zapisane dane nie zgadzają się z planem (inna wartość lub brak zapisu)",
  "manualCapture.deviation.capture_window_overrun":
    "Zapisany czas jest poza planowanym przedziałem",
  "manualCapture.deviation.delay_untruthful": "Zapisane opóźnienie nie zgadza się z czasami",
  "manualCapture.deviation.intended_slot_mismatch":
    "Planowany czas nie zgadza się z zatwierdzonym harmonogramem",
  "manualCapture.deviation.discovery_schedule_invalid": "Harmonogram panelu jest nieprawidłowy",
  "manualCapture.deviation.discovery_schedule_missing": "Panel nie ma zatwierdzonego harmonogramu",
  "manualCapture.deviation.duplicate_slot": "Istnieje inny zapis dla tego samego pytania i rundy",
  "manualCapture.deviation.erased_duplicate_slot":
    "Usunięty zapis dotyczył tego samego pytania i rundy",
  "manualCapture.deviation.panel_unresolved": "Nie znaleziono panelu",
  "manualCapture.deviation.panel_not_approved": "Panel nie był zatwierdzony",
  "manualCapture.deviation.panel_version_differs": "Zapisana wersja panelu nie jest tą wersją",
  "manualCapture.deviation.panel_mismatch": "Panel się nie zgadzał",
  "manualCapture.deviation.question_not_in_panel": "Pytania nie ma w panelu",
  "manualCapture.deviation.question_text_changed":
    "Zapisana treść pytania nie jest zatwierdzoną treścią",
  "manualCapture.deviation.round_out_of_panel": "Runda jest poza panelem",
  "manualCapture.deviation.malformed_capture_context":
    "Nie udało się odczytać zapisanych szczegółów",
  "manualCapture.deviation.unknown_slot": "Nie udało się ustalić pytania lub rundy",
  "manualCapture.deviation.panel_approved_after_capture":
    "Zapisany czas jest wcześniejszy niż zatwierdzenie panelu",
  "manualCapture.deviation.non_consumer_surface":
    "To nie była aplikacja czatu, strona ani odpowiedź wyszukiwarki AI",
  "manualCapture.deviation.panel_grid_invalid": "Siatka pytań panelu jest nieprawidłowa",
  "manualCapture.deviation.discovery_baseline_ambiguous":
    "Ustawienia bazowe panelu są niejednoznaczne",
  "manualCapture.deviation.brand_run_on_discovery":
    "Do obserwacji odkrywania dołączono przebieg marki",
  "manualCapture.issue.tooLong":
    "„{field}” ({where}) jest za długie: {count} znaków; dozwolone jest najwyżej {max}. Skróć tekst — nic nie zostało ucięte.",
  "manualCapture.issue.invalidField":
    "„{field}” ({where}) ma niedozwoloną postać. Sprawdź to pole.",
  "manualCapture.issue.deviationNotes": "Uwagi: najwyżej 20 wierszy, każdy do 500 znaków.",
  "manualCapture.charCount": "{count} z {max} znaków",
  "manualCapture.failureNotApplicable":
    "Pełna odpowiedź nie ma opisu błędu. Usuń go albo wybierz „Błąd” lub „Ucięta”, aby go zachować.",
  "manualCapture.removeFailure": "Usuń opis błędu",
};
const sv: Copy = {
  "manualCapture.open": "Registrera ett insamlat svar",
  "manualCapture.openHelp":
    "För ett svar du redan själv har samlat in för en fråga och omgång i en godkänd panel. MILO ställer inte frågan.",
  "manualCapture.title": "Registrera ett insamlat svar",
  "manualCapture.intro":
    "Spara ett svar du samlat in för en godkänd fråga och omgång. Det du anger sparas som du uppger det; MILO kontrollerar det inte hos tjänsten.",
  "manualCapture.notSent": "Inte skickat. Rätta:",
  "manualCapture.step.choose": "Vilken observation",
  "manualCapture.step.answer": "Svaret du fick",
  "manualCapture.step.context": "Hur det faktiskt samlades in",
  "manualCapture.noVersion":
    "Det finns ingen godkänd upptäcktspanel med giltigt veckoschema att registrera för.",
  "manualCapture.version": "Godkänd panelversion",
  "manualCapture.versionOption": "Version {version} · {client} · godkänd {date}",
  "manualCapture.question": "Fråga",
  "manualCapture.round": "Omgång",
  "manualCapture.roundOption": "Omgång {round} · planerad {date} · {state}",
  "manualCapture.choose": "Välj…",
  "manualCapture.slot.available": "kan registreras",
  "manualCapture.slot.notDue": "inte dags än",
  "manualCapture.slot.occupied": "har redan en post",
  "manualCapture.slot.erased": "upptagen av en raderad post",
  "manualCapture.approvedQuestion": "Godkänd fråga (exakt text)",
  "manualCapture.intendedSlot": "Planerad tid för omgången: {date}",
  "manualCapture.affirm": "Jag ställde exakt den här frågan, ord för ord.",
  "manualCapture.affirmHelp":
    "Om du ställde en annan fråga kan den inte registreras som den här planerade observationen.",
  "manualCapture.status": "Resultat",
  "manualCapture.failure": "Vad som gick fel",
  "manualCapture.rawAnswer": "Svarstexten",
  "manualCapture.rawAnswerHelp": "Klistra in hela svaret som du fick det.",
  "manualCapture.citations": "Källänkar som visades med svaret",
  "manualCapture.citationsHelp":
    "En länk per rad, bara länkar som svaret självt visade som källor. Länkar i texten räknas inte.",
  "manualCapture.citationsComplete":
    "Jag kontrollerade alla visade källor och listan är fullständig (en tom lista betyder då inga källor).",
  "manualCapture.contextHelp":
    "Ange vad som faktiskt hände. Panelens planerade inställningar visas bara för jämförelse; lämna det du inte vet som okänt.",
  "manualCapture.capturedDate": "Datum då du samlade in det",
  "manualCapture.capturedTime": "Tid (med sekunder om du vet dem)",
  "manualCapture.utcOffset": "Tidens förskjutning från UTC",
  "manualCapture.timeHelp":
    "Tiden på din klocka när du fick svaret och dess förskjutning från UTC, till exempel +02:00. Den måste vara efter den planerade tiden och inte i framtiden.",
  "manualCapture.expected": "Planerat: {value}",
  "manualCapture.service": "Använd tjänst",
  "manualCapture.interfaceName": "Använd app eller webbplats",
  "manualCapture.mode": "Typ av svar",
  "manualCapture.modeHelp": "API-svar kan inte registreras här.",
  "manualCapture.searchMode": "Visat sökläge (om något)",
  "manualCapture.modelLabel": "Visat modellnamn",
  "manualCapture.webSearch": "Visade den att den sökte på webben?",
  "manualCapture.freshSession": "Var det en ny konversation?",
  "manualCapture.priorMessages": "Meddelanden före frågan",
  "manualCapture.requiredFact": "Obligatoriskt: svara på detta.",
  "manualCapture.unknownBlank": "Lämna tomt om okänt.",
  "manualCapture.personalisation": "Personanpassning",
  "manualCapture.signedIn": "Inloggning",
  "manualCapture.memory": "Minne",
  "manualCapture.customInstructions": "Egna instruktioner",
  "manualCapture.connectedTools": "Anslutna verktyg",
  "manualCapture.temporaryChat": "Tillfällig chatt",
  "manualCapture.accountTier": "Kontoplan",
  "manualCapture.interfaceLanguage": "Gränssnittsspråk",
  "manualCapture.answerLanguage": "Svarets språk",
  "manualCapture.collectionCountry": "Land du samlade in från",
  "manualCapture.collectionCity": "Stad du samlade in från",
  "manualCapture.locationInQuestion": "Plats som nämns i frågan",
  "manualCapture.devicePermission": "Platsbehörighet",
  "manualCapture.vpn": "VPN använt",
  "manualCapture.extraInstruction": "Det du lade till i frågan",
  "manualCapture.screenshotRef": "Hänvisning till skärmbild",
  "manualCapture.screenshotRefHelp":
    "En anteckning om var du sparar en skärmbild. MILO lagrar eller kontrollerar inte skärmbilden.",
  "manualCapture.missingReason": "Varför det saknas skärmbild",
  "manualCapture.cost": "Debiterad kostnad (USD)",
  "manualCapture.costHelp": "Valfritt och enligt din egen uppgift; ingen verifierad debitering.",
  "manualCapture.sourceUrl": "Länk till svarssidan",
  "manualCapture.deviationNotes": "Anteckningar",
  "manualCapture.deviationNotesHelp": "Allt som skilde sig från planen, en anteckning per rad.",
  "manualCapture.review": "Granska innan du sparar",
  "manualCapture.reviewTitle": "Exakt den här posten sparas:",
  "manualCapture.reviewWhen": "Insamlad: {at}",
  "manualCapture.reviewStatus": "Resultat: {status}",
  "manualCapture.reviewCitations": "Källänkar: {count} · listan fullständig: {complete}",
  "manualCapture.reviewMethod": "Inmatningssätt: {method}",
  "manualCapture.reviewHelp":
    "Spara skickar exakt den här posten. Gå tillbaka och redigera före sparning om något ska ändras.",
  "manualCapture.save": "Spara",
  "manualCapture.edit": "Redigera",
  "manualCapture.sending": "Skickar… Vänta.",
  "manualCapture.unconfirmed": "Sparningen är inte bekräftad",
  "manualCapture.unconfirmedNote.sent":
    "Begäran skickades, men MILO kunde inte bekräfta om den sparades. Den kan redan vara sparad.",
  "manualCapture.unconfirmedNote.resend":
    "Att skicka samma post igen kunde inte heller bekräftas. Det tidigare försöket kan fortfarande vara sparat.",
  "manualCapture.unconfirmedNote.notFound":
    "Dina sparade poster visar inte exakt den här posten än. Den kan fortfarande sparas senare.",
  "manualCapture.unconfirmedNote.checkFailed":
    "Dina sparade poster kunde inte läsas. Sparningen är fortfarande obekräftad.",
  "manualCapture.check": "Kontrollera sparade poster",
  "manualCapture.resend": "Skicka exakt samma post igen",
  "manualCapture.confirmed":
    "Sparad. MILO bekräftade att posten är lagrad (den kan ha sparats tidigare).",
  "manualCapture.confirmedMatch":
    "Sparad. Exakt den här posten hittades bland dina sparade poster.",
  "manualCapture.savedRecord": "Post-ID: {id}",
  "manualCapture.refreshing": "Läser in uppdaterade poster…",
  "manualCapture.refreshFailed":
    "Sparningen är bekräftad, men den uppdaterade vyn kunde inte läsas in.",
  "manualCapture.reload": "Läs in den uppdaterade vyn",
  "manualCapture.resolved": "Tolkas som: {outcome}",
  "manualCapture.noDeviations":
    "Inga luckor eller skillnader mot planen hittades i de registrerade uppgifterna.",
  "manualCapture.cancel": "Avbryt",
  "manualCapture.close": "Stäng",
  "manualCapture.leave.title": "Lämna den här posten?",
  "manualCapture.leave.unsent": "Det du angett har inte skickats och kommer att kastas.",
  "manualCapture.leave.sending":
    "Begäran om att spara är redan skickad och kan inte avbrytas. Den kan fortfarande lagras. Om du lämnar försvinner kopian här; kontrollera täckningslistan senare.",
  "manualCapture.leave.unconfirmed":
    "Posten kan redan vara lagrad. Om du lämnar försvinner kopian här; det ångrar inte en sparning.",
  "manualCapture.leave.stay": "Stanna",
  "manualCapture.leave.discard": "Kasta",
  "manualCapture.leave.abandon": "Lämna ändå",
  "manualCapture.issue.slotUnavailable": "Välj en version, fråga och omgång som kan registreras.",
  "manualCapture.issue.affirmQuestion": "Bekräfta att du ställde exakt den godkända frågan.",
  "manualCapture.issue.status": "Välj resultatet.",
  "manualCapture.issue.failureRequired": "Beskriv vad som gick fel.",
  "manualCapture.issue.failureNotAllowed":
    "Ett fullständigt svar kan inte ha en felbeskrivning. Ta bort den i svarssteget, eller välj Misslyckat eller Avkortat.",
  "manualCapture.issue.rawAnswer": "Ange svarstexten.",
  "manualCapture.issue.capturedAt": "Ange ett giltigt datum, tid och UTC-förskjutning.",
  "manualCapture.issue.beforeSlot": "Tiden är före den planerade tiden för omgången.",
  "manualCapture.issue.beforeApproval": "Tiden är före panelens godkännande.",
  "manualCapture.issue.inFuture": "Tiden ligger i framtiden.",
  "manualCapture.issue.service": "Ange tjänsten du använde.",
  "manualCapture.issue.interfaceName": "Ange appen eller webbplatsen du använde.",
  "manualCapture.issue.mode": "Välj typ av svar.",
  "manualCapture.issue.freshSession": "Svara på om det var en ny konversation.",
  "manualCapture.issue.priorMessages":
    "Ange hur många meddelanden som kom före frågan (0 eller fler).",
  "manualCapture.issue.citations":
    "Varje källänk måste vara en offentlig webbadress på högst 2 048 tecken (högst 100 länkar).",
  "manualCapture.issue.cost": "Ange en kostnad på 0 eller mer, eller lämna tomt.",
  "manualCapture.issue.sourceUrl":
    "Länken till svarssidan måste vara en offentlig webbadress på högst 2 048 tecken.",
  "manualCapture.issue.capacity": "Projektet har redan maximalt 100 sparade svarsposter.",
  "manualCapture.issue.invalid": "Vissa värden har inte ett godtaget format. Kontrollera dem.",
  "manualCapture.opt.complete": "Fullständigt",
  "manualCapture.opt.failed": "Misslyckat",
  "manualCapture.opt.truncated": "Avkortat",
  "manualCapture.opt.missed": "Missat",
  "manualCapture.opt.protocol_deviant": "Följer inte panelens regler",
  "manualCapture.opt.consumer-web": "Chattapp eller webbplats",
  "manualCapture.opt.search": "Sökning med AI-svar",
  "manualCapture.opt.unknown": "Okänt",
  "manualCapture.opt.evidenced": "Ja, den visade en webbsökning",
  "manualCapture.opt.not_evidenced": "Nej",
  "manualCapture.opt.yes": "Ja",
  "manualCapture.opt.no": "Nej",
  "manualCapture.opt.non_personalised": "Av",
  "manualCapture.opt.personalised": "På",
  "manualCapture.opt.signed_in": "Inloggad",
  "manualCapture.opt.signed_out": "Utloggad",
  "manualCapture.opt.off": "Av",
  "manualCapture.opt.on": "På",
  "manualCapture.opt.none": "Inga",
  "manualCapture.opt.present": "Några",
  "manualCapture.opt.granted": "Tillåten",
  "manualCapture.opt.denied": "Inte tillåten",
  "manualCapture.stepOf": "Steg {n} av 3",
  "manualCapture.continue": "Fortsätt",
  "manualCapture.back": "Tillbaka",
  "manualCapture.questionOption": "Fråga {n}: {text}",
  "manualCapture.requiredFacts": "När och hur du frågade (obligatoriskt)",
  "manualCapture.optional.model": "Modell och webbsökning — valfritt; tomt betyder okänt",
  "manualCapture.optional.session":
    "Konto- och konversationsinställningar — valfritt; okänt om inget väljs",
  "manualCapture.optional.place": "Språk och plats — valfritt; tomt betyder okänt",
  "manualCapture.optional.notes": "Tillägg, skärmbild, kostnad och anteckningar — valfritt",
  "manualCapture.slot.occupancyUnknown": "kan inte kontrolleras än",
  "manualCapture.slot.promptMissing": "frågan finns inte längre",
  "manualCapture.slot.readsUnavailable": "posterna kunde inte läsas in",
  "manualCapture.issue.readsUnavailable":
    "Dina sparade poster kunde inte läsas in just nu, så en ny post kan inte skickas. Det du har skrivit finns kvar; försök igen om en stund.",
  "manualCapture.issue.promptMissing":
    "Den här godkända frågan finns inte längre i din frågelista (den kan ha tagits bort eller ändrats), så den kan inte registreras.",
  "manualCapture.issue.occupancyUnknown":
    "MILO kan ännu inte avgöra om omgången redan har en post, så en ny post kan inte skickas för den nu.",
  "manualCapture.reviewQuestion": "Fråga {n}, omgång {round}: {text}",
  "manualCapture.reviewPlanned": "Planerad tid: {date}",
  "manualCapture.reviewAnswer": "Svar: {excerpt}",
  "manualCapture.reviewSurface": "Frågat i: {service} · {interface} · {mode}",
  "manualCapture.reviewSession": "Ny konversation: {fresh} · meddelanden före frågan: {prior}",
  "manualCapture.reviewUnknown": "Valfria uppgifter som lämnats okända: {count}",
  "manualCapture.confirmedWhen": "Insamlat: {at}",
  "manualCapture.savedAnswer": "Sparat svar: {excerpt}",
  "manualCapture.savedSources": "Sparade källänkar: {count}",
  "manualCapture.deviationsTitle":
    "Luckor eller skillnader mot planen i de registrerade uppgifterna:",
  "manualCapture.deviation.other":
    "Annan lucka eller skillnad i de registrerade uppgifterna (kod {code})",
  "manualCapture.deviation.session_not_fresh": "Registrerat som inte en ny konversation",
  "manualCapture.deviation.prior_messages": "Registrerade meddelanden före frågan",
  "manualCapture.deviation.extra_instruction": "Registrerat ett tillägg till frågan",
  "manualCapture.deviation.personalisation_differs":
    "Personalisering: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.signed_in_differs":
    "Inloggning: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.memory_differs":
    "Minne: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.custom_instructions_differ":
    "Anpassade instruktioner: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.connected_tools_differ":
    "Anslutna verktyg: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.account_tier_differs":
    "Kontoplan: det registrerade värdet skiljer sig från planen",
  "manualCapture.deviation.prompt_language_differs":
    "Frågans språk: det registrerade värdet skiljer sig från planen",
  "manualCapture.deviation.interface_language_differs":
    "Gränssnittsspråk: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.surface_or_mode_differs":
    "Tjänst, app, typ av svar eller sökläge: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.model_label_differs":
    "Modellnamn: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.web_search_evidence_differs":
    "Tecken på webbsökning: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.collection_country_differs":
    "Land: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.collection_city_differs":
    "Stad: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.device_location_differs":
    "Platsbehörighet: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.vpn_differs":
    "VPN-användning: de registrerade uppgifterna stämmer inte med planen (annat värde eller inte registrerat)",
  "manualCapture.deviation.capture_window_overrun":
    "Registrerad tid ligger utanför det planerade tidsfönstret",
  "manualCapture.deviation.delay_untruthful":
    "Den registrerade fördröjningen stämmer inte med tiderna",
  "manualCapture.deviation.intended_slot_mismatch":
    "Planerad tid stämmer inte med det godkända schemat",
  "manualCapture.deviation.discovery_schedule_invalid": "Panelens schema är ogiltigt",
  "manualCapture.deviation.discovery_schedule_missing": "Panelen har inget godkänt schema",
  "manualCapture.deviation.duplicate_slot": "Det finns en annan post för samma fråga och omgång",
  "manualCapture.deviation.erased_duplicate_slot":
    "En borttagen post gällde samma fråga och omgång",
  "manualCapture.deviation.panel_unresolved": "Panelen kunde inte hittas",
  "manualCapture.deviation.panel_not_approved": "Panelen var inte godkänd",
  "manualCapture.deviation.panel_version_differs": "Registrerad panelversion är inte denna version",
  "manualCapture.deviation.panel_mismatch": "Panelen stämde inte",
  "manualCapture.deviation.question_not_in_panel": "Frågan finns inte i panelen",
  "manualCapture.deviation.question_text_changed":
    "Registrerad frågetext är inte den godkända texten",
  "manualCapture.deviation.round_out_of_panel": "Omgången ligger utanför panelen",
  "manualCapture.deviation.malformed_capture_context":
    "De registrerade uppgifterna kunde inte läsas",
  "manualCapture.deviation.unknown_slot": "Fråga eller omgång kunde inte identifieras",
  "manualCapture.deviation.panel_approved_after_capture":
    "Registrerad tid ligger före panelens godkännande",
  "manualCapture.deviation.non_consumer_surface": "Inte en chattapp, webbplats eller AI-sökning",
  "manualCapture.deviation.panel_grid_invalid": "Panelens frågeuppsättning är ogiltig",
  "manualCapture.deviation.discovery_baseline_ambiguous":
    "Panelens grundinställningar är tvetydiga",
  "manualCapture.deviation.brand_run_on_discovery":
    "En varumärkeskörning kopplades till en upptäcktsobservation",
  "manualCapture.issue.tooLong":
    "”{field}” ({where}) är för långt: {count} tecken; högst {max} godtas. Korta texten – inget har klippts bort.",
  "manualCapture.issue.invalidField":
    "”{field}” ({where}) har inte ett godtaget format. Kontrollera fältet.",
  "manualCapture.issue.deviationNotes":
    "Anteckningar: högst 20 rader, var och en högst 500 tecken.",
  "manualCapture.charCount": "{count} av {max} tecken",
  "manualCapture.failureNotApplicable":
    "Ett fullständigt svar har ingen felbeskrivning. Ta bort den, eller välj Misslyckat eller Avkortat för att behålla den.",
  "manualCapture.removeFailure": "Ta bort felbeskrivningen",
};
const da: Copy = {
  "manualCapture.open": "Registrér et indsamlet svar",
  "manualCapture.openHelp":
    "Til et svar, du allerede selv har indsamlet for ét spørgsmål og én runde i et godkendt panel. MILO stiller ikke spørgsmålet.",
  "manualCapture.title": "Registrér et indsamlet svar",
  "manualCapture.intro":
    "Gem ét svar, du har indsamlet til et godkendt spørgsmål og en runde. Det, du indtaster, gemmes som du angiver det; MILO kontrollerer det ikke hos tjenesten.",
  "manualCapture.notSent": "Ikke sendt. Ret venligst:",
  "manualCapture.step.choose": "Hvilken observation",
  "manualCapture.step.answer": "Svaret du fik",
  "manualCapture.step.context": "Hvordan det faktisk blev indsamlet",
  "manualCapture.noVersion":
    "Der er intet godkendt opdagelsespanel med gyldig ugeplan at registrere for.",
  "manualCapture.version": "Godkendt panelversion",
  "manualCapture.versionOption": "Version {version} · {client} · godkendt {date}",
  "manualCapture.question": "Spørgsmål",
  "manualCapture.round": "Runde",
  "manualCapture.roundOption": "Runde {round} · planlagt {date} · {state}",
  "manualCapture.choose": "Vælg…",
  "manualCapture.slot.available": "kan registreres",
  "manualCapture.slot.notDue": "ikke tid endnu",
  "manualCapture.slot.occupied": "har allerede en post",
  "manualCapture.slot.erased": "optaget af en slettet post",
  "manualCapture.approvedQuestion": "Godkendt spørgsmål (præcis tekst)",
  "manualCapture.intendedSlot": "Planlagt tid for runden: {date}",
  "manualCapture.affirm": "Jeg stillede præcis dette spørgsmål, ord for ord.",
  "manualCapture.affirmHelp":
    "Hvis du stillede et andet spørgsmål, kan det ikke registreres som denne planlagte observation.",
  "manualCapture.status": "Resultat",
  "manualCapture.failure": "Hvad der gik galt",
  "manualCapture.rawAnswer": "Svarteksten",
  "manualCapture.rawAnswerHelp": "Indsæt hele svaret, som du fik det.",
  "manualCapture.citations": "Kildelinks vist med svaret",
  "manualCapture.citationsHelp":
    "Ét link pr. linje, kun links som svaret selv viste som kilder. Links i teksten tæller ikke.",
  "manualCapture.citationsComplete":
    "Jeg har tjekket alle viste kilder, og listen er komplet (en tom liste betyder så ingen kilder).",
  "manualCapture.contextHelp":
    "Angiv, hvad der faktisk skete. Panelets planlagte indstillinger vises kun til sammenligning; lad det, du ikke ved, stå som ukendt.",
  "manualCapture.capturedDate": "Dato for indsamlingen",
  "manualCapture.capturedTime": "Tidspunkt (med sekunder, hvis du kender dem)",
  "manualCapture.utcOffset": "Tidspunktets forskydning fra UTC",
  "manualCapture.timeHelp":
    "Tidspunktet på dit ur, da du fik svaret, og dets forskydning fra UTC, fx +02:00. Det skal være efter det planlagte tidspunkt og ikke i fremtiden.",
  "manualCapture.expected": "Planlagt: {value}",
  "manualCapture.service": "Anvendt tjeneste",
  "manualCapture.interfaceName": "Anvendt app eller websted",
  "manualCapture.mode": "Type svar",
  "manualCapture.modeHelp": "API-svar kan ikke registreres her.",
  "manualCapture.searchMode": "Vist søgetilstand (hvis nogen)",
  "manualCapture.modelLabel": "Vist modelnavn",
  "manualCapture.webSearch": "Viste den, at den søgte på nettet?",
  "manualCapture.freshSession": "Var det en ny samtale?",
  "manualCapture.priorMessages": "Beskeder før spørgsmålet",
  "manualCapture.requiredFact": "Påkrævet: svar venligst på dette.",
  "manualCapture.unknownBlank": "Lad stå tomt, hvis ukendt.",
  "manualCapture.personalisation": "Personalisering",
  "manualCapture.signedIn": "Logget ind",
  "manualCapture.memory": "Hukommelse",
  "manualCapture.customInstructions": "Egne instruktioner",
  "manualCapture.connectedTools": "Tilsluttede værktøjer",
  "manualCapture.temporaryChat": "Midlertidig chat",
  "manualCapture.accountTier": "Kontoabonnement",
  "manualCapture.interfaceLanguage": "Brugerfladesprog",
  "manualCapture.answerLanguage": "Svarets sprog",
  "manualCapture.collectionCountry": "Land du indsamlede fra",
  "manualCapture.collectionCity": "By du indsamlede fra",
  "manualCapture.locationInQuestion": "Sted nævnt i spørgsmålet",
  "manualCapture.devicePermission": "Placeringstilladelse",
  "manualCapture.vpn": "VPN brugt",
  "manualCapture.extraInstruction": "Det du tilføjede til spørgsmålet",
  "manualCapture.screenshotRef": "Henvisning til skærmbillede",
  "manualCapture.screenshotRefHelp":
    "En note om, hvor du gemmer et skærmbillede. MILO gemmer eller kontrollerer ikke skærmbilledet.",
  "manualCapture.missingReason": "Hvorfor der ikke er et skærmbillede",
  "manualCapture.cost": "Opkrævet beløb (USD)",
  "manualCapture.costHelp": "Valgfrit og efter din egen angivelse; ikke en verificeret opkrævning.",
  "manualCapture.sourceUrl": "Link til svarsiden",
  "manualCapture.deviationNotes": "Noter",
  "manualCapture.deviationNotesHelp": "Alt, der afveg fra planen, én note pr. linje.",
  "manualCapture.review": "Gennemse før du gemmer",
  "manualCapture.reviewTitle": "Præcis denne post bliver gemt:",
  "manualCapture.reviewWhen": "Indsamlet: {at}",
  "manualCapture.reviewStatus": "Resultat: {status}",
  "manualCapture.reviewCitations": "Kildelinks: {count} · listen komplet: {complete}",
  "manualCapture.reviewMethod": "Indtastningsmåde: {method}",
  "manualCapture.reviewHelp":
    "Gem sender præcis denne post. Gå tilbage og redigér før du gemmer, hvis noget skal ændres.",
  "manualCapture.save": "Gem",
  "manualCapture.edit": "Redigér",
  "manualCapture.sending": "Sender… Vent venligst.",
  "manualCapture.unconfirmed": "Gemning ikke bekræftet",
  "manualCapture.unconfirmedNote.sent":
    "Anmodningen blev sendt, men MILO kunne ikke bekræfte, om den blev gemt. Den kan allerede være gemt.",
  "manualCapture.unconfirmedNote.resend":
    "At sende den samme post igen kunne heller ikke bekræftes. Det tidligere forsøg kan stadig være gemt.",
  "manualCapture.unconfirmedNote.notFound":
    "Dine gemte poster viser endnu ikke præcis denne post. Den kan stadig blive gemt senere.",
  "manualCapture.unconfirmedNote.checkFailed":
    "Dine gemte poster kunne ikke læses. Gemningen er stadig ubekræftet.",
  "manualCapture.check": "Tjek gemte poster",
  "manualCapture.resend": "Send præcis samme post igen",
  "manualCapture.confirmed":
    "Gemt. MILO bekræftede, at posten er gemt (den kan være gemt tidligere).",
  "manualCapture.confirmedMatch": "Gemt. Præcis denne post blev fundet blandt dine gemte poster.",
  "manualCapture.savedRecord": "Post-id: {id}",
  "manualCapture.refreshing": "Indlæser opdaterede poster…",
  "manualCapture.refreshFailed":
    "Gemningen er bekræftet, men den opdaterede visning kunne ikke indlæses.",
  "manualCapture.reload": "Indlæs den opdaterede visning",
  "manualCapture.resolved": "Læses som: {outcome}",
  "manualCapture.noDeviations":
    "Der blev ikke fundet mangler eller forskelle fra planen i de registrerede oplysninger.",
  "manualCapture.cancel": "Annullér",
  "manualCapture.close": "Luk",
  "manualCapture.leave.title": "Forlad denne post?",
  "manualCapture.leave.unsent": "Det, du har indtastet, er ikke sendt og bliver kasseret.",
  "manualCapture.leave.sending":
    "Anmodningen om at gemme er allerede sendt og kan ikke annulleres. Den kan stadig blive gemt. Hvis du går, forsvinder kopien her; tjek dækningslisten senere.",
  "manualCapture.leave.unconfirmed":
    "Posten kan allerede være gemt. Hvis du går, forsvinder kopien her; det fortryder ikke en gemning.",
  "manualCapture.leave.stay": "Bliv",
  "manualCapture.leave.discard": "Kassér",
  "manualCapture.leave.abandon": "Gå alligevel",
  "manualCapture.issue.slotUnavailable":
    "Vælg en version, et spørgsmål og en runde, der kan registreres.",
  "manualCapture.issue.affirmQuestion": "Bekræft, at du stillede præcis det godkendte spørgsmål.",
  "manualCapture.issue.status": "Vælg resultatet.",
  "manualCapture.issue.failureRequired": "Beskriv, hvad der gik galt.",
  "manualCapture.issue.failureNotAllowed":
    "Et komplet svar kan ikke have en fejlbeskrivelse. Fjern den i svartrinnet, eller vælg Mislykket eller Afkortet.",
  "manualCapture.issue.rawAnswer": "Indtast svarteksten.",
  "manualCapture.issue.capturedAt": "Angiv en gyldig dato, et tidspunkt og en UTC-forskydning.",
  "manualCapture.issue.beforeSlot": "Tidspunktet er før rundens planlagte tidspunkt.",
  "manualCapture.issue.beforeApproval": "Tidspunktet er før panelet blev godkendt.",
  "manualCapture.issue.inFuture": "Tidspunktet ligger i fremtiden.",
  "manualCapture.issue.service": "Angiv den tjeneste, du brugte.",
  "manualCapture.issue.interfaceName": "Angiv den app eller det websted, du brugte.",
  "manualCapture.issue.mode": "Vælg typen af svar.",
  "manualCapture.issue.freshSession": "Svar på, om det var en ny samtale.",
  "manualCapture.issue.priorMessages":
    "Angiv, hvor mange beskeder der kom før spørgsmålet (0 eller flere).",
  "manualCapture.issue.citations":
    "Hvert kildelink skal være en offentlig webadresse på højst 2.048 tegn (højst 100 links).",
  "manualCapture.issue.cost": "Angiv et beløb på 0 eller mere, eller lad feltet stå tomt.",
  "manualCapture.issue.sourceUrl":
    "Linket til svarsiden skal være en offentlig webadresse på højst 2.048 tegn.",
  "manualCapture.issue.capacity":
    "Projektet har allerede det maksimale antal på 100 gemte svarposter.",
  "manualCapture.issue.invalid": "Nogle værdier har ikke et godkendt format. Tjek dem venligst.",
  "manualCapture.opt.complete": "Komplet",
  "manualCapture.opt.failed": "Mislykket",
  "manualCapture.opt.truncated": "Afkortet",
  "manualCapture.opt.missed": "Misset",
  "manualCapture.opt.protocol_deviant": "Følger ikke panelets regler",
  "manualCapture.opt.consumer-web": "Chatapp eller websted",
  "manualCapture.opt.search": "Søgning med AI-svar",
  "manualCapture.opt.unknown": "Ukendt",
  "manualCapture.opt.evidenced": "Ja, den viste en websøgning",
  "manualCapture.opt.not_evidenced": "Nej",
  "manualCapture.opt.yes": "Ja",
  "manualCapture.opt.no": "Nej",
  "manualCapture.opt.non_personalised": "Fra",
  "manualCapture.opt.personalised": "Til",
  "manualCapture.opt.signed_in": "Logget ind",
  "manualCapture.opt.signed_out": "Logget ud",
  "manualCapture.opt.off": "Fra",
  "manualCapture.opt.on": "Til",
  "manualCapture.opt.none": "Ingen",
  "manualCapture.opt.present": "Nogle",
  "manualCapture.opt.granted": "Tilladt",
  "manualCapture.opt.denied": "Ikke tilladt",
  "manualCapture.stepOf": "Trin {n} af 3",
  "manualCapture.continue": "Fortsæt",
  "manualCapture.back": "Tilbage",
  "manualCapture.questionOption": "Spørgsmål {n}: {text}",
  "manualCapture.requiredFacts": "Hvornår og hvordan du spurgte (påkrævet)",
  "manualCapture.optional.model": "Model og websøgning — valgfrit; tomt betyder ukendt",
  "manualCapture.optional.session":
    "Konto- og samtaleindstillinger — valgfrit; ukendt, medmindre du vælger",
  "manualCapture.optional.place": "Sprog og sted — valgfrit; tomt betyder ukendt",
  "manualCapture.optional.notes": "Tilføjelser, skærmbillede, pris og noter — valgfrit",
  "manualCapture.slot.occupancyUnknown": "kan ikke kontrolleres endnu",
  "manualCapture.slot.promptMissing": "spørgsmålet findes ikke længere",
  "manualCapture.slot.readsUnavailable": "posterne kunne ikke indlæses",
  "manualCapture.issue.readsUnavailable":
    "Dine gemte poster kunne ikke indlæses lige nu, så en ny post kan ikke sendes. Det, du har indtastet, bevares; prøv igen om lidt.",
  "manualCapture.issue.promptMissing":
    "Dette godkendte spørgsmål er ikke længere på din spørgsmålsliste (det kan være slettet eller ændret), så det kan ikke registreres.",
  "manualCapture.issue.occupancyUnknown":
    "MILO kan endnu ikke afgøre, om runden allerede har en post, så en ny post kan ikke sendes for den nu.",
  "manualCapture.reviewQuestion": "Spørgsmål {n}, runde {round}: {text}",
  "manualCapture.reviewPlanned": "Planlagt tidspunkt: {date}",
  "manualCapture.reviewAnswer": "Svar: {excerpt}",
  "manualCapture.reviewSurface": "Spurgt i: {service} · {interface} · {mode}",
  "manualCapture.reviewSession": "Ny samtale: {fresh} · beskeder før spørgsmålet: {prior}",
  "manualCapture.reviewUnknown": "Valgfrie oplysninger efterladt som ukendte: {count}",
  "manualCapture.confirmedWhen": "Indsamlet: {at}",
  "manualCapture.savedAnswer": "Gemt svar: {excerpt}",
  "manualCapture.savedSources": "Gemte kildelinks: {count}",
  "manualCapture.deviationsTitle":
    "Mangler eller forskelle fra planen i de registrerede oplysninger:",
  "manualCapture.deviation.other":
    "Anden mangel eller forskel i de registrerede oplysninger (kode {code})",
  "manualCapture.deviation.session_not_fresh": "Registreret som ikke en ny samtale",
  "manualCapture.deviation.prior_messages": "Registrerede beskeder før spørgsmålet",
  "manualCapture.deviation.extra_instruction": "Registreret en tilføjelse til spørgsmålet",
  "manualCapture.deviation.personalisation_differs":
    "Personalisering: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.signed_in_differs":
    "Login-status: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.memory_differs":
    "Hukommelse: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.custom_instructions_differ":
    "Brugerdefinerede instruktioner: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.connected_tools_differ":
    "Tilsluttede værktøjer: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.account_tier_differs":
    "Kontoplan: den registrerede værdi afviger fra planen",
  "manualCapture.deviation.prompt_language_differs":
    "Spørgsmålets sprog: den registrerede værdi afviger fra planen",
  "manualCapture.deviation.interface_language_differs":
    "Grænsefladesprog: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.surface_or_mode_differs":
    "Tjeneste, app, svartype eller søgetilstand: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.model_label_differs":
    "Modelnavn: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.web_search_evidence_differs":
    "Tegn på websøgning: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.collection_country_differs":
    "Land: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.collection_city_differs":
    "By: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.device_location_differs":
    "Placeringstilladelse: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.vpn_differs":
    "Brug af VPN: de registrerede oplysninger passer ikke med planen (anden værdi eller ikke registreret)",
  "manualCapture.deviation.capture_window_overrun":
    "Registreret tidspunkt ligger uden for det planlagte tidsvindue",
  "manualCapture.deviation.delay_untruthful":
    "Den registrerede forsinkelse passer ikke med tidspunkterne",
  "manualCapture.deviation.intended_slot_mismatch":
    "Planlagt tidspunkt passer ikke med den godkendte tidsplan",
  "manualCapture.deviation.discovery_schedule_invalid": "Panelets tidsplan er ugyldig",
  "manualCapture.deviation.discovery_schedule_missing": "Panelet har ingen godkendt tidsplan",
  "manualCapture.deviation.duplicate_slot": "Der findes en anden post for samme spørgsmål og runde",
  "manualCapture.deviation.erased_duplicate_slot":
    "En slettet post gjaldt samme spørgsmål og runde",
  "manualCapture.deviation.panel_unresolved": "Panelet kunne ikke findes",
  "manualCapture.deviation.panel_not_approved": "Panelet var ikke godkendt",
  "manualCapture.deviation.panel_version_differs": "Registreret panelversion er ikke denne version",
  "manualCapture.deviation.panel_mismatch": "Panelet passede ikke",
  "manualCapture.deviation.question_not_in_panel": "Spørgsmålet er ikke i panelet",
  "manualCapture.deviation.question_text_changed":
    "Registreret spørgsmålstekst er ikke den godkendte tekst",
  "manualCapture.deviation.round_out_of_panel": "Runden ligger uden for panelet",
  "manualCapture.deviation.malformed_capture_context":
    "De registrerede oplysninger kunne ikke læses",
  "manualCapture.deviation.unknown_slot": "Spørgsmål eller runde kunne ikke identificeres",
  "manualCapture.deviation.panel_approved_after_capture":
    "Registreret tidspunkt ligger før panelets godkendelse",
  "manualCapture.deviation.non_consumer_surface": "Ikke en chatapp, hjemmeside eller AI-søgning",
  "manualCapture.deviation.panel_grid_invalid": "Panelets spørgsmålsopsætning er ugyldig",
  "manualCapture.deviation.discovery_baseline_ambiguous":
    "Panelets grundindstillinger er tvetydige",
  "manualCapture.deviation.brand_run_on_discovery":
    "En brandkørsel blev knyttet til en opdagelsesobservation",
  "manualCapture.issue.tooLong":
    "“{field}” ({where}) er for langt: {count} tegn; højst {max} accepteres. Forkort teksten – intet er skåret væk.",
  "manualCapture.issue.invalidField":
    "“{field}” ({where}) har ikke et godkendt format. Tjek feltet.",
  "manualCapture.issue.deviationNotes": "Noter: højst 20 linjer, hver på højst 500 tegn.",
  "manualCapture.charCount": "{count} af {max} tegn",
  "manualCapture.failureNotApplicable":
    "Et komplet svar har ingen fejlbeskrivelse. Fjern den, eller vælg Mislykket eller Afkortet for at beholde den.",
  "manualCapture.removeFailure": "Fjern fejlbeskrivelsen",
};
export const manualCaptureCopy = { en, pl, sv, da } as const;
