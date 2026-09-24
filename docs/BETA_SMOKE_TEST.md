# Beta smoke test

Körs på **två rena telefoninstallationer** innan första externa betafamiljen. Markera PASS eller FAIL. Ingen rad får antas.

Produktionsorigin: `https://korpasset.se`. Inbjudningslänk: `https://korpasset.se/invite/<token>`.

## Telefon A — elev

| # | Steg | PASS | FAIL |
| --- | --- | --- | --- |
| 1 | Installera Körpasset från TestFlight eller Play-testspåret. | | |
| 2 | Starta appen. | | |
| 3 | Fortsätt med Apple eller Google. Ingen ny dialog vid nästa start. | | |
| 4 | Välj att ta körkort och skapa en ny körkortsresa. | | |
| 5 | Skapa en inbjudan. | | |
| 6 | QR och länk är `https://korpasset.se/invite/…`, inte bara `korpasset://`. | | |

## Telefon B — handledare

| # | Steg | PASS | FAIL |
| --- | --- | --- | --- |
| 7 | Öppna QR eller länken. | | |
| 8 | Om appen är installerad öppnas Körpasset till inbjudan, även från kallstart. | | |
| 9 | Om appen saknas: sidan förklarar att länken finns kvar. Installera, öppna samma länk. | | |
| 10 | Logga in med Apple eller Google. Inbjudan finns kvar efter inloggning. | | |
| 11 | Acceptera inbjudan. | | |
| 12 | Rätt elev och samma resa syns. | | |

## Körpass

| # | Steg | PASS | FAIL |
| --- | --- | --- | --- |
| 13 | Starta körpass. | | |
| 14 | Välj 2–3 moment. | | |
| 15 | Slutför körpasset. | | |
| 16 | Bedöm momenten på några sekunder. | | |
| 17 | Recap syns. | | |
| 18 | Nästa fokus syns. | | |

## Persistence

| # | Steg | PASS | FAIL |
| --- | --- | --- | --- |
| 19 | Stäng båda apparna helt. | | |
| 20 | Starta igen. | | |
| 21 | Båda är fortfarande inloggade. | | |
| 22 | Samma resa finns. | | |
| 23 | Historiken finns. | | |

## Handledare 2

| # | Steg | PASS | FAIL |
| --- | --- | --- | --- |
| 24 | Skapa en ny inbjudan från elevens resa. | | |
| 25 | Anslut ett tredje konto, om en tredje telefon finns. | | |
| 26 | Samma elevresa används. Ingen ny resa skapades. | | |

## Account

| # | Steg | PASS | FAIL |
| --- | --- | --- | --- |
| 27 | Logga ut på ett testkonto. | | |
| 28 | Logga in med samma provider igen. | | |
| 29 | Samma konto och resor kommer tillbaka. | | |
| 30 | Radera kontot via befintligt flöde på ett testkonto (skriv RADERA). | | |
| 31 | Ny inloggning med samma provider är ett nytt konto, inte den raderade resan. | | |

## Om en rad failar

Serverloggen skiljer på felen utan att skriva token, identity token eller session:

| Loggmeddelande | Betydelse |
| --- | --- |
| `oauth failed` / `oauth continue failed` / `oauth not configured` | Inloggning |
| `invite invalid` / `invite expired` | Inbjudan ogiltig eller utgången |
| `invite acceptance failed` | Accept misslyckades |
| `start drive failed` | Kunde inte starta körpass |
| `complete drive failed` | Kunde inte avsluta körpass |
| `account deletion failed` | Kontoradering |
| `unhandled request error` | Övrigt API-fel |

Inget Sentry. Waitlist på `/` ska fortfarande fungera.
