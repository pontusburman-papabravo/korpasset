# Veckomejl

Produktmejl till eleven om den egna körkortsresan. Samma klass som hjälpmejlen i `account_help_emails`: inte waitlist och inte nyhetsbrev.

## När

Söndagar från kl **18:00 Europe/Stockholm** till måndag 00:00. Jobbet startar med appen och tittar var 15:e minut (`app/src/jobs/weekly-summary.ts`).

Det finns ingen tidszon på användare eller hushåll. Veckan är därför alltid `Europe/Stockholm`, samma klocka som adminstatistiken.

Missas hela söndagen skickas veckan inte i efterhand.

## Period

Kalendervecka **måndag 00:00 inklusive** till **nästa måndag 00:00 exklusive**, beräknad med `date_trunc('week', … AT TIME ZONE 'Europe/Stockholm')`. En vårvecka med sommartid är 167 timmar. Gränserna räknas inte som 7×24 timmar.

- Genomfört körpass: `drives.ended_at` i intervallet. Öppna pass räknas inte.
- Körtid: `ended_at - started_at` för de passen. Minuter avrundas som i adminens aktivitetsserie.
- Momentträning och avbockning: `observed_at` på den kanoniska bedömningen, och bara om passet är genomfört.
- Nytt avbockat moment: hela checklistan observerad i veckan, och inte redan komplett före veckan.
- Progression: samma poängmodell som appen, vid veckans start respektive slut. Öppna pass ingår där, precis som i appen.
- Körsträcka visas bara när `distance_meters` finns. Saknad sträcka uppskattas inte.

Samma tidsstämpel kan bara ligga i ett intervall. Aktivitet efter utskicket samma söndag hör fortfarande till veckan, men ett andra mejl skickas inte.

Definitionerna delas med admin via `app/src/services/usage-stats-sql.ts`.

## Vilka

Eleven på en resa med `status = active`, konto `guest` eller `active`, och en adress: `users.contact_email`, annars e-post på senaste verifierade inloggningen.

Mejlet skickas bara om veckan har minst ett genomfört körpass, en momentträning eller en avbockning.

Inte:

- konto utan aktiv resa, eller resa som är arkiverad eller avslutad
- `account_state` `deleted` eller `suspended`
- konto utan adress
- handledare (ingen egen sammanfattning i den här versionen)
- admin-inloggningar (`admin_users` är inte produktkonton; det finns ingen testkontomarkör)

## Preferenser

Veckomejlet är produktkommunikation om elevens egen körkortsresa, samma klass som hjälpmejlen. Det läser inte `marketing_email_opt_in` och har ingen `List-Unsubscribe`.

Nyheter, tips och erbjudanden är ett separat val på Konto. Det är av som standard. Avregistrering gäller bara det valet.

Cookie-samtycke gäller webbanalys. Veckomejlet följer hjälpmejlens adressregel och hoppar dessutom över avstängda konton.

## Dublettskydd

`journey_weekly_emails` har unik `(journey_id, week_key, template)` där `week_key` är ISO-vecka (`2026-W40`) och `template` är `weekly_summary`.

Raden reserveras med status `sending` innan leverantören anropas.

- `sent` skickas inte igen, inte efter omstart, deploy eller ett jobb som körs två gånger.
- `failed` kan försökas igen. Ett fel hos en mottagare stoppar inte batchen.
- `sending` lämnas kvar. En krasch efter att leverantören tagit emot mejlet ger därför inte en kopia.

Adressen lagras inte i tabellen. Loggen har vecka, konto-id, resa-id, tid, mall, status, provider-id och felkod.

## Admin

Resans tidslinje under Statistik visar senaste veckomejl: vecka, status, tid och mall. Det finns ingen knapp som skickar om.

## Tips

Efter “Öppna Körpasset” och före “Vi hörs nästa söndag” finns en rad som tipsar om Körpasset. Länken går till `/tips?r=<kod>&source=weekly_email`, inte till App Store eller Google Play. Koden är elevens slumpade referral-kod. Mejlet innehåller inte e-post, namn, konto-id eller journey-id i URL:en, och ingen körstatistik i tipstexten.
