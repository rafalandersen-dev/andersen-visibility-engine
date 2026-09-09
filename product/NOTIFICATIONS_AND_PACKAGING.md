# Milo Growth — powiadomienia, pakiety i ochrona marży

> Current implementation and release status: [CURRENT_STATE.md](CURRENT_STATE.md), reconciled 9 September 2026. This document retains its decision/specification role; dated proposals do not establish delivery.

Plan nadrzędny: [ROADMAP.md](./ROADMAP.md). Pełny rejestr zakresu: [PLAN_REVIEW_2026_09_07.md](./PLAN_REVIEW_2026_09_07.md).

Data: 7 września 2026. Status: wymagania użytkownika i rekomendowana specyfikacja do dalszego wdrożenia. Nie jest to uruchomiony system ani zatwierdzony cennik. Nie zmieniono abonamentów, konfiguracji produkcyjnej ani wysyłki.

## Kierunek produktu

- Sprzedajemy osobom działającym solo i zespołom. Każdy projekt może działać w trybie ręcznym, z zatwierdzaniem albo na autopilocie; tryb mieszany ustala się według rodzaju działania.
- Użytkownik kupuje zrozumiałe rezultaty i zakres obsługi: artykuły, obrazy, monitoring widoczności, automatyzację. Tokeny modeli i koszt wykonania są wewnętrzną miarą Milo.
- Model kosztowy powstaje równolegle z funkcjami. Kwoty abonamentów ustalamy dopiero po pomiarze kosztów reprezentatywnych scenariuszy i określeniu limitów.
- Powiadomienia operacyjne są częścią podstawowego produktu i nie powinny być płatnym dodatkiem.

## 1. Centrum powiadomień i e-mail

Jedna historia zdarzeń w aplikacji. E-mail jest podstawowym kanałem dla informacji wymagających działania; Slack może być dodatkowym kanałem zespołu. Rozdzielamy powiadomienia operacyjne, podsumowania i marketing. Ustawienia częstotliwości i odbiorcy są jawne.

| Zdarzenie | Proponowany moment / warunek | Działanie użytkownika |
|---|---|---|
| Brak akceptacji przed terminem | Np. 24 godziny przed planowanym terminem; brak aktualnej akceptacji właściwej wersji | Sprawdź i zatwierdź artykuł |
| Publikacja zablokowana | Wykrycie przeszkody: jakość, linki, obrazy, uprawnienia, połączenie z CMS | Otwórz dokładną przeszkodę i rozwiązanie |
| Publikacja nieudana lub wynik niepewny | Trwała awaria albo wyczerpanie bezpiecznych ponowień; niepewny wynik wymaga sprawdzenia istniejącej publikacji | Sprawdź wynik / napraw połączenie |
| Ręczny termin minął | Nadszedł ustalony termin, a publikacja ręczna nadal nie została wykonana | Opublikuj lub zmień termin; komunikat nie nazywa tego awarią systemu |
| Brak pokrycia na kolejny tydzień | Kontrola np. w czwartek/piątek według strefy projektu i uzgodnionego rytmu | Uzupełnij plan lub zatwierdź przygotowane treści |
| Kończy się limit pakietu | Prognoza wskazuje, że pozostały limit nie pokryje uzgodnionego planu | Dostosuj plan albo świadomie dokup określony pakiet |
| Autopilot zatrzymany | Brak budżetu, utrata połączenia, trwały problem jakości lub blokada wykonania | Usuń konkretną przeszkodę / zmień zakres |
| Podsumowanie tygodnia | Jeden raport w wybranym dniu | Zobacz wykonane publikacje, kolejny tydzień i oczekujące decyzje |

Każda wiadomość ma: projekt, tytuł zadania, dokładny termin ze strefą czasową, rzeczywisty status, powód, jeden główny przycisk i informację, czy Milo podejmie dalsze działanie. Podpis może brzmieć „Milo — Twój asystent AI”. Bez technicznych stack trace, tokenów i surowych odpowiedzi dostawcy.

### Zasady wykrywania pustego kalendarza

- Limit abonamentu jest maksymalną dostępnością, a nie automatycznie zobowiązaniem do regularnego publikowania.
- Rytm ustalamy w konfiguracji, np. wtorek i piątek. Zachowanie historyczne może zasugerować rytm; użytkownik powinien potwierdzić jego przyjęcie.
- Oceniamy pokrycie konkretnych slotów, nie tylko obecność jakiegokolwiek artykułu w przyszłości. Rozróżniamy brak szkicu, brak akceptacji, gotowy materiał i faktycznie uzbrojoną kolejkę publikacji.
- Pauza projektu, sezonowość lub wyłączony harmonogram wstrzymują alerty o braku treści.
- Autopilot uzupełnia plan tylko wtedy, gdy uprawnienia obejmują generowanie/planowanie i pozwala na to pakiet. Tryb z akceptacją przygotowuje materiały do decyzji. Nie zmieniamy samodzielnie trybu manualnego.
- „8 artykułów miesięcznie” nie jest równoznaczne z „2 artykułami tygodniowo”. W miesiącu może przypaść 9 lub 10 wybranych dni publikacji. Interfejs pokazuje konflikt przed zatwierdzeniem rytmu i pozwala dobrać pakiet albo zredukować liczbę slotów.

### Niezawodność powiadomień

- Zdarzenia wyliczane po stronie serwera także przy wylogowanym użytkowniku.
- Trwała kolejka wysyłki, deduplikacja według projektu, zadania, wersji terminu i rodzaju zdarzenia; ponowienie zadania nie tworzy kolejnego maila o tym samym incydencie.
- Ponownie sprawdzamy stan tuż przed wysłaniem: rozwiązany problem, przesunięta publikacja lub pauza wygaszają nieaktualny alert.
- Kilka braków akceptacji łączymy w jedną wiadomość, z ograniczoną eskalacją przed terminem. Nie wysyłamy każdej próby ponowienia CMS jako nowej awarii.
- W zespołach odbiorcą jest przypisany zatwierdzający; właściciel stanowi zastępstwo. Ograniczenia odbiorców i dostępu odpowiadają projektowi.
- Link w mailu otwiera właściwy ekran po autoryzacji. Samo otwarcie linku przez skaner pocztowy nigdy nie publikuje ani nie zatwierdza.
- Awaria kosztowego licznika AI nie blokuje powiadomień operacyjnych, odczytu danych ani ręcznej edycji.

## 2. Prosty cennik, kontrolowane koszty

Na stronie pakiet opisuje:

1. Liczbę projektów oraz artykułów w okresie rozliczeniowym.
2. Co zawiera artykuł: zakres researchu, standard długości, formatowanie, SEO, kontrolę jakości oraz ustaloną liczbę poprawek.
3. Liczbę generowanych obrazów i ich standard. Własne zdjęcia nie zużywają limitu generowania obrazów.
4. Dostępny tryb pracy oraz granice automatyzacji.
5. Zakres AI visibility: pytania, monitorowane usługi/tryby, rynki, języki i częstotliwość sprawdzania.
6. Zakres pracy agenta poza artykułami: np. audyty, aktualizacje stron i raporty. Nie sprzedajemy nieograniczonego wykonywania dowolnych kosztownych zadań.
7. Cenę i jasne warunki dodatków, resetu, przenoszenia niewykorzystanego limitu oraz zmiany planu.

Propozycja konstrukcji: niewielka liczba pakietów o rosnącym zakresie, jawna liczba obrazów w każdym oraz proste dodatki „więcej artykułów”, „więcej obrazów”, „większy monitoring”. Nie mnożymy osobnych taryf dla każdej kombinacji manual/mieszany/auto i z obrazami/bez obrazów.

Tryb pracy nie determinuje sam w sobie kosztu tekstu: artykuł wygenerowany ręcznie może kosztować tyle samo co wygenerowany automatycznie. Autopilot dodaje cykliczne sprawdzanie, planowanie, aktualizacje i próby wykonania, które trzeba objąć budżetem. Obrazy mają osobny koszt i limit prób; wgrywanie własnego zdjęcia nie jest generowaniem AI.

### Co znaczy zużyty artykuł

- Nie uzależniamy naliczenia wyłącznie od publikacji: klient mógłby generować i eksportować dowolną liczbę szkiców, nigdy ich nie publikując.
- Rekomendacja: limit zużywa poprawnie dostarczony, użyteczny szkic zgodny z określonym standardem. Brak zatwierdzenia nie cofa kosztu wykonanej pracy. Standard i zasady poprawek muszą być widoczne przed zakupem.
- Błąd techniczny nie może zabierać jednostki użytkownikowi; koszt nieudanej próby nadal zapisujemy wewnętrznie. Ponowienie transportowe nie nalicza tej samej pracy drugi raz.
- Całkowite ponowne wygenerowanie innej treści oraz dodatkowe warianty obrazów mają jawne zasady. Ręczna edycja tekstu pozostaje dostępna po wykorzystaniu generowania.
- Import gotowego tekstu z Claude/ChatGPT przez MCP nie jest generowaniem tekstu przez Milo. Dalsze obrazy, research lub ocena mogą zużyć odpowiednie usługi. Nie doliczamy fikcyjnego kosztu generowania do importu.
- Już gotowy i zatwierdzony artykuł może zostać opublikowany mimo wyczerpania generowania, o ile uprawnienia do publikacji nadal obowiązują.

## 3. Model ekonomiczny

Koszt na klienta obejmuje tekst wejściowy i wyjściowy, research/wyszukiwanie, ocenę jakości, poprawki, tłumaczenia, obrazy i ich warianty, monitoring odpowiedzi AI, wykonanie zadań agenta, CMS/integracje, e-mail, infrastrukturę i obsługę płatności. Monitoring wielu pytań w wielu usługach i rynkach rośnie multiplikatywnie — nie wystarczy policzyć kosztu samego artykułu.

Podstawowy model monitoringu: pytania × usługi/tryby × kombinacje rynku i języka × liczba uruchomień × powtórzenia. Np. 40 pytań × 8 usług × 30 dni = 9600 obserwacji dla jednej kombinacji rynku i języka przy jednym powtórzeniu. To liczba operacji, nie wycena.

Mierzymy typowy koszt, wyższe percentyle i maksymalny scenariusz dopuszczony pakietem. Ustalamy bufor na retry i zmiany stawek. Jakości nie oceniamy wyłącznie kosztem — mierzymy użyteczność szkiców, odsetek poprawek, gotowość do publikacji i czas do zakończenia zadania.

Pomocniczo: cena netto po rabacie musi pokrywać pełny koszt świadczenia i docelową marżę. Gdy koszt C obejmuje wszystkie koszty zmienne, minimalna cena dla zakładanej marży M to C / (1 − M). Opłaty zależne od ceny należy uwzględnić w modelu, a nie pominąć. Nie ustalono jeszcze C, M ani docelowych cen.

### Zabezpieczenia przed kosztem większym niż abonament

- Rozdzielamy jednostki sprzedane użytkownikowi od technicznych kosztów dostawców; wewnętrzny licznik nie jest automatycznie publicznym systemem kredytów.
- Limity i uprawnienia rozstrzyga serwer. Przed zadaniem rezerwujemy maksymalny dopuszczony koszt; po wykonaniu uzgadniamy faktyczne zużycie. Równoległe zadania nie mogą przekroczyć wspólnego budżetu.
- Każdy job ma identyfikator, ograniczenie prób, czasu i liczby narzędzi. Agent nie może samodzielnie tworzyć nieskończonej pętli researchu/generowania.
- Twarde limity na klienta i globalne limity awaryjne. Brak wiarygodnego pomiaru blokuje nowe płatne wywołania AI, z jasnym statusem dla klienta.
- Z góry określona polityka limitu: kolejka wstrzymana albo jawnie wybrane płatne rozszerzenie. Bez automatycznych dopłat bez uzgodnionego budżetu.
- Zharmonizować okres liczników z komunikacją abonamentu i zdarzeniami Stripe. Uwzględnić upgrade, downgrade, anulowanie, odnowienie i zwroty bez podwójnego resetowania limitów.

## 4. Co istnieje w sprawdzonym kodzie Milo

Przegląd odczytowy źródeł na commicie 1715e4c4212da7984555ab873e3dc950e9ba9741 (zawartość PR #63, później scalonego). Nie sprawdzano wartości sekretów, flag produkcyjnych ani dostarczalności poczty.

- `src/lib/calendar-schedule.ts`: `upcomingPublishRisks` rozróżnia planowane cele i rzeczywiście uzbrojone publikacje oraz wykrywa brak gotowości przed terminem. To baza do alertów, nie dowód wysyłania maili.
- `src/lib/email/send.ts` i istniejące trasy pocztowe: szablony/transport, klucz idempotencji i kolejka. Aktualny helper wymaga kontekstu zalogowanego klienta; alerty w tle potrzebują właściwej autoryzowanej ścieżki serwerowej.
- `src/lib/ai-usage.server.ts`: kategorie użycia, atomowe `claim_ai_usage`, uprawnienia pobierane z tabeli entitlements, osobna bramka obrazów. Egzekwowanie liczników zależy od flagi, której stanu produkcyjnego nie weryfikowano.
- Istotna luka w obecnym kodzie: błąd RPC licznika lub brak rekordu zwrotnego dopuszcza wywołanie. Przed szerokim autopilotem trzeba zmienić tę ścieżkę i dodać mierzenie kosztu pieniężnego, nie tylko liczby operacji.
- `src/lib/image-gen.server.ts`: osobne adaptery Lovable i OpenAI; faktyczny koszt zależy od wybranego dostawcy, modelu i parametrów. W tym zadaniu nie zmieniono dostawcy i nie wykonano płatnego benchmarku.
- Niektóre komentarze pliku meteringu opisują dawny, zapisywalny przez klienta plan. Obecna funkcja `resolvePlan` już korzysta z serwerowych entitlements; nie należy na podstawie starego komentarza zgłaszać tej naprawionej luki jako aktywnej.

## 5. Kolejność i warunki ukończenia

- [ ] Zdefiniować zdarzenia, odpowiedzialnych odbiorców, ustawienia i przykładowe wiadomości.
- [ ] Zaimplementować kontrolę pokrycia kalendarza, powiadomienia przed terminem, po błędzie i po zatrzymaniu autopilota.
- [ ] Dodać serwerową kolejkę, deduplikację, ponowną weryfikację stanu i historię doręczenia.
- [ ] Uszczelnić licznik i zbudować pomiar pełnego kosztu z rezerwacją budżetu.
- [ ] Zmierzyć scenariusze: sam tekst, tekst + obraz, poprawki, import MCP, monitoring i zadanie agenta. Korzystać z aktualnych oficjalnych stawek; odpłatne testy wykonać w uzgodnionym budżecie.
- [ ] Wyliczyć niewielką liczbę pakietów i proste dodatki. Wyraźnie określić, co nalicza artykuł, obraz i dodatkową pracę.
- [ ] Dopiero potem skonfigurować docelowe ceny i pełny cykl subskrypcji Stripe.

Przypadki odbioru: brak akceptacji 24h przed terminem; akceptacja chwilę przed wysłaniem alertu; zmiana terminu; cofnięcie akceptacji przez edycję; wygasłe CMS; niepewny wynik publikacji; duplikat cron; pusty kolejny tydzień; częściowe pokrycie; projekt w pauzie; 8 artykułów wobec 10 slotów; wyczerpany limit; awaria licznika; równoległe zadania na granicy budżetu; kosztowny retry obrazu; brak zużycia generowania przy imporcie MCP.

## Punkt odniesienia: Nimt

Na stronie sprawdzonej 7 września 2026 Nimt opisuje plany oparte na kredytach (m.in. 10 000 kredytów za 79 EUR miesięcznie). Jest to jednostka ich pakietu; nie ma podstaw utożsamiać jej 1:1 z tokenami modelu. Nie zweryfikowano tu przelicznika poszczególnych operacji. Dla Milo rekomendujemy komunikację w artykułach, obrazach i jasno określonym zakresie monitoringu oraz pracy agenta.

Źródło: [oficjalny cennik na stronie Nimt](https://www.nimt.ai/), sprawdzony 7 września 2026.
