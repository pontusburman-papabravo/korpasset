# Produkt-events

Server-side observation i tabellen `product_events`. Inga namn, e-post, fritext, telefon, invite-token, invite-copy, rå querystring eller cookie-värde.

## Modell

| Kolumn | Innehåll |
| --- | --- |
| `event_name` | Kanoniskt eventnamn |
| `journey_id` | Opaque journey, NULL innan resan finns |
| `user_id` | Opaque actor om session finns |
| `actor_role` | `student` / `supervisor` |
| `supervisor_count` | Antal aktiva handledare när det är relevant |
| `focus_skill_count` | Antal Drive Focus-skills |
| `event_source` | `direct` / `parent_handoff` när källa behövs |
| `practice_stage` | `unknown` / `just_started` / `building` / `near_test` vid skapande eller nudge |
| `days_since_drive_bucket` | `5-7` / `8-14` / `15-30` / `31+` |
| `created_at` | Tidpunkt |
| `share_surface` | `app` / `website` / `weekly_email` på delningshändelser, annars NULL |
| `client_platform` | `ios` / `android` / `web` på delningshändelser, annars NULL |
| `referrer_user_id` | Konto som äger referral-koden. Samma person som `user_id` när någon tipsar. På ett besök är `user_id` NULL och `referrer_user_id` är den som tipsade. |

Admin-statistik räknar användning från **domäntabeller**. Tips och delningar är undantaget och visas under Statistik → Tips & delningar.

## Events före den här observationen

`journey_created`, `supervisor_connected`, `drive_focus_saved`, `drive_started`, `drive_completed`, `rating_completed`, `recap_viewed`, `second_drive_completed`.

Historiska rader **skrivs inte om**. Nya kolumner är NULL på gamla events. Analys av `event_source` och `practice_stage` gäller alltså bara events efter migration `0012`.

## Events tillagda för handoff-observation

| Event | Semantik | Metadata |
| --- | --- | --- |
| `onboarding_role_selected` | **Sidinträde** på valt onboarding-spår. GET `/onboarding/elev` eller `/onboarding?som=elev` (utan `via`), och `/onboarding/handledare` eller `?som=handledare`. Inte ett unikt val per person. Refresh/back räknas om. | `actor_role`; `event_source=direct` för elevspår; `user_id` om session |
| `student_handoff_started` | **Eleven öppnade** handledarens startlänk (`GET /onboarding?som=elev&via=handledare`). Inte att föräldern kopierade eller skickade länken. Sidinträde: refresh räknas om. | `event_source=parent_handoff`, `actor_role=student`, ofta utan `journey_id` |
| `stale_drive_nudge_shown` | Journey-hemmet **visade** stale-nudge vid den requesten. Varje GET medan nudgen syns kan skapa en ny rad. | `journey_id`, `days_since_drive_bucket`, `practice_stage`, `actor_role` |

`journey_created` utökas — inte dupliceras — med `event_source` och `practice_stage`. Nya resor efter 0012 har alltid `event_source` = `direct` eller `parent_handoff`, aldrig NULL. `practice_stage` är samma värde som sparades på `driving_journeys` vid INSERT.

Återanvänds oförändrade: `supervisor_connected`, `drive_started`, `drive_completed`.

## Events tillagda för journey-IA

Inga befintliga eventnamn byttes. Tabbarna Konto/Hjälp finns inte längre som primära destinationer, så inga historiska events behöver mappas om.

| Event | Semantik | Metadata |
| --- | --- | --- |
| `journey_switched` | Användaren öppnade en annan tillgänglig resa än den som cookien pekade på. | `journey_id` (den nya), `user_id`, `actor_role` |
| `next_drive_plan_created` | Första aktiva 2–3-momentplanen sparades på resan. | `journey_id`, `user_id`, `actor_role`, `focus_skill_count` |
| `next_drive_plan_updated` | En befintlig plan ersattes med en ny. | samma |
| `training_guidance_opened` | Användaren öppnade “Så övar ni” / handledarguiden för ett moment. | `journey_id`, `user_id`, `actor_role` |

Ingen PII i payload. Namn ligger inte i eventet.

## Handoff-cookie

Handledarens länk är `/onboarding?som=elev&via=handledare`.

`via=handledare` sätter HttpOnly-cookien `korpasset_handoff=parent` (Max-Age 7 dygn, path `/`). Den finns så att OAuth däremellan inte tappar källan.

`POST /start` läser **bara cookien**, inte queryn. `via` ensam klassificerar inte en framtida resa.

Cookien rensas efter lyckad `POST /start`. En senare resa på samma enhet utan cookie blir `direct`. Öppnad länk utan efterföljande start lämnar cookien tills den går ut — det är attributionsfönstret, inte en permanent token.

## Vad som går att säga (och inte)

Tre nivåer, blanda inte:

| Nivå | Vad det är | Vad det inte är |
| --- | --- | --- |
| Eventvolym | Antal sidinträden / events | Unika personer eller unika val |
| Journey-level | Samma `journey_id` mellan events | Att två personer är samma hushåll |
| Cross-device/person | Finns **inte** | Ingen join mellan förälderns och elevens enhet |

### Parent handoff — observerbara steg

```text
1. onboarding_role_selected(actor_role=supervisor)   # sidinträde, ofta förälderns enhet
2. student_handoff_started                           # eleven öppnade länken, ofta annan enhet
3. journey_created(event_source=parent_handoff)
4. supervisor_connected                              # samma journey_id
5. drive_started                                     # samma journey_id, första passet
```

Steg 1 → 2 är **aggregerad volymrelation**, inte individkonvertering. Föräldern som valde handledare och eleven som öppnade länken kan inte kopplas.

Tillåtna kvoter:

- Volym: `student_handoff_started` / `onboarding_role_selected` där `actor_role=supervisor`
- Volym: `journey_created` med `event_source=parent_handoff` / `student_handoff_started`
- Journey-level: andel `journey_created` som har `supervisor_connected` på samma `journey_id`
- Journey-level: andel `journey_created` som har `drive_started` på samma `journey_id`
- Journey-level: median `min(drive_started.created_at) - journey_created.created_at`

Kalla inte steg 1→2 eller 2→3 för conversion. De länkar inte samma person.

### Practice stage

Vid skapande: `journey_created.practice_stage` (`unknown` / `just_started` / `building` / `near_test`).

Aktuell fördelning (kan ha ändrats): `driving_journeys.practice_stage`.

Ingen ranking.

### Stale drive — deskriptiv observation

Nudgen kan emittera flera `stale_drive_nudge_shown` per journey (refresh). Ingen runtime-deduplicering.

Analysregel:

```text
första stale_drive_nudge_shown efter senaste drive_completed
  (saknas completed: första shown på journeyn)
→ första drive_started på samma journey_id
  inom 48 timmar efter den shown-raden
```

Det är inte bevisad kausal effekt av nudgen. Inget `stale_drive_nudge_converted` i runtime.

## Delning

Inloggad användare delar `https://korpasset.se/tips?r=<kod>&source=app|website|weekly_email`. Koden är åtta tecken ur `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, slumpad en gång per konto och lagrad i `users.referral_code`. Den innehåller inte user-id, e-post, namn eller journey-id. Utloggad delning använder `?source=` utan `r`. Äldre `?ref=share_app|share_website|share_weekly_email` anger fortfarande yta, men identifierar ingen person.

| Event | Semantik | Metadata |
| --- | --- | --- |
| `share_prompt_viewed` | Tipsrutan visades i appen eller på webbplatsen. `/tips` loggar inte den här raden. | `user_id`, `referrer_user_id`, `share_surface`, `client_platform`, `journey_id` och `actor_role` när sessionen har en resa |
| `share_started` | Användaren tryckte Tipsa, Dela eller Kopiera länk. Det är inte bevis på att meddelandet skickades. Admin kallar det Delningsknappen använd. | samma |
| `share_link_copied` | Länken kopierades, antingen som val eller som reserv när delning saknas. | samma |
| `share_completed` | Systemets delningsruta eller Web Share API slutfördes. Avbruten delning räknas inte. | samma |
| `share_landing_viewed` | Någon annan öppnade en giltig personlig länk. Admin kallar det Länken öppnad. | `user_id` är NULL. `referrer_user_id` är kodens konto. `share_surface` kommer från `source` eller äldre `ref` |
| `share_registration` | Ett nytt konto skapades medan den första giltiga koden fanns kvar. Admin kallar det Registrering via tips. | `user_id` är det nya kontot, `referrer_user_id` är den som tipsade |

Besöksloggen sparar inte besökarens konto. En omladdning med samma kod i samma webbläsarsession (`korpasset_referral_seen`, HttpOnly, utan `Max-Age`) skriver inte en ny rad. En inloggad användare som öppnar sin egen länk ger inget besök.

Cookien `korpasset_referral` är HttpOnly, SameSite=Lax, path `/`, 30 dygn. Värdet är `kod.yta.unixsekunder` för första klicket. En senare kod ersätter den inte så länge den första fortfarande tillhör ett konto som inte är raderat. Vid nytt konto (`POST /start` utan befintlig session, eller OAuth när kontot skapas) skrivs `referred_by_user_id`, `referred_by_code` och `referred_at` om fältet fortfarande är tomt. En andra referrer kan inte vinna. Intresseanmälan är inte ett konto. Cookien följer inte med in i App Store-installationen.

Raderad eller okänd kod ger en vanlig `/tips`-sida, ingen cookie och inget besök. Veckomejlet länkar med elevens kod och `source=weekly_email`. Utskicket i sig är inte `share_started`.
