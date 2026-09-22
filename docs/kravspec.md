# Körpasset — Kravspecifikation v1

**Status:** Canonical  
**Datum:** 2026-09-18  
**Produkt:** Körpasset  
**Domän:** korpasset.se  
**Tagline:** Övningskör med en plan.  
**Omfattning:** Privat övningskörning, svenskt B-körkort  
**Källa:** Samlad vy av den kanoniska dokumentationen i detta repo

Detta dokument är den **publika, samlade kravspecifikationen** för Körpasset v1. De enskilda källfilerna under `docs/` förblir canonical för produkt- och arkitekturarbete. Den här filen finns för att kunna delas som **en enda länk**.

---

## Innehåll

1. [Vision och syfte](#1-vision-och-syfte)
2. [Omfattning](#2-omfattning)
3. [Aktörer](#3-aktörer)
4. [Produktprinciper](#4-produktprinciper)
5. [Funktionella krav](#5-funktionella-krav)
6. [Domänmodell](#6-domänmodell)
7. [Skill Taxonomy v1](#7-skill-taxonomy-v1)
8. [Datamodell](#8-datamodell)
9. [Progression och rekommendation](#9-progression-och-rekommendation)
10. [Integritetskrav](#10-integritetskrav)
11. [Tekniska beslut](#11-tekniska-beslut)
12. [Källhänvisningar](#12-källhänvisningar)
13. [Beta-UX](#13-beta-ux)
14. [Definition of Beta Ready](#14-definition-of-beta-ready)
15. [korpasset.se](#15-korpassetse)
16. [Beta Validation och kommersiell gate](#16-beta-validation-och-kommersiell-gate)

---

## 1. Vision och syfte

Körpasset är en **B2C-app för svensk privat övningskörning** som håller ihop elevens träning mellan en eller flera handledare.

Tagline: **Övningskör med en plan.**

### 1.1 Kärnfrågor

Varje körpass och varje planeringssession ska kunna svara på:

> **Vad ska vi träna på idag?**

> **Hur gick det?**

> **Vad bör vi träna på nästa gång?**

### 1.2 Långsiktig vision

Eleven äger ett **Driving Passport** — en elevcentrerad, portabel körkortsresa som följer eleven oavsett vilka handledare, bilar eller miljöer som ingår.

v1 är strikt begränsad till **privat övningskörning** utan trafikskola, externa API:er eller teori.

### 1.3 Vad Körpasset inte är

- Inte en teoriapp
- Inte en AI-trafiklärare
- Inte en trafikskoleportal
- Inte ett verktyg som visar falsk precision som "87 % uppkörningsklar"

---

## 2. Omfattning

v1 är **privat övningskörning för svenskt B-körkort** — inget mer, inget mindre.

| Ingår i v1 | Ingår inte i v1 |
| --- | --- |
| Elevägd körkortsresa (`driving_journey`) | Trafikskoleintegration |
| Flera handledare (first-class) | Teori och kunskapsfrågor |
| QR/länk-handoff till handledare | AI-trafiklärare |
| Guest actor innan full autentisering | GPS-telemetri |
| Tap-to-rate efter körpass | Betalning |
| Training Focus och Drive Focus | Progression-UI med falsk precision |
| Append-only observations | Externa API:er (TABS, STR, m.m.) |
| Manuell/automat per resa | E-post/lösenord, magic link eller passkey för användare |
| Native app (Capacitor) med Apple- och Google-konto | Publik webb-signup |
| Valfri drive-context (miljö, ljus, väder, trafik) | Obligatorisk context-registrering i första flödet |

### 2.1 Produktloopen

```text
Observations
    ↓
Progression Engine
    ↓
Recommendation Engine
    ↓
Training Focus
    ↓
Drive Focus
    ↓
Drive
    ↓
New Observations
```

### 2.2 Första end-to-end-flödet (implementerat)

1. Elev fortsätter med Apple eller Google i appen och skapar journey
2. Elev delar QR/länk
3. Handledare (gäst i appen eller redan inloggad Apple/Google-user) accepterar
4. Elev och handledare planerar Drive Focus (2–3 moment)
5. Körpass genomförs
6. Handledare registrerar observations
7. System visar recap och föreslår Training Focus (recommendation engine i kod)

---

## 3. Aktörer

| Aktör | Äger resan | Får administrera | Får bedöma körpass | Får följa progress | Autentisering i v1 |
| --- | --- | --- | --- | --- | --- |
| **Elev (student)** | Ja | Ja — inbjudningar | Nej (handledaren bedömer i v1) | Ja — samma journey-read model | Apple eller Google i appen |
| **Handledare (supervisor)** | Nej | Nej | Ja, för körpass där hen är tilldelad handledare | Ja — även körpass hen inte själv körde | Gäst via invitation i appen, sedan Apple/Google på samma `user_id` |
| **Trafiklärare (`driving_instructor`)** | Nej | — | — | — | Finns i datamodellen, **ingen v1-feature** |

Regler:

- En registrerad user är en person, inte en roll. Roll är per `driving_journey`. Se [användare och progress](product/users-and-progress.md).
- `driving_journeys.student_user_id` är canonical student.
- Studenten är **inte** duplicerad som `journey_collaborator`.
- Flera handledare är first-class. Samma elev, flera supervisors — utan att duplicera data eller byta `user_id`.
- En handledare kan vara aktiv på flera elevers resor. En person kan vara elev på sin egen resa och handledare på andras.
- Handledaren ska nästan aldrig administrera. QR/länk ger lågfriktions-handoff.
- Elev och aktiva handledare ser **samma** utveckling, recap och nästa-gång-förslag. Progression tillhör resan.

---

## 4. Produktprinciper

Canonical v1-principer. Dessa är låsta tills ett ADR explicit ändrar dem.

### Elev och handledare

1. **Eleven äger körkortsresan.** `driving_journey` tillhör eleven. Handledare deltar, administrerar inte.
2. **Flera handledare är first-class.**
3. **Handledaren ska nästan aldrig administrera.**
4. **Guest actor får finnas innan full autentisering.** Scan → stable `user_id` → delta → claim senare, utan merge. Guest är inte registrering.

### Domän och data

5. **Skill ≠ Context.** Skill = vad eleven utför. Context = under vilka förhållanden.
6. **Observation ≠ Training Focus ≠ Drive Focus.** Tre separata begrepp.
7. **Observationer är append-only** för normal produktkod. Korrigering = ny observation med `supersedes_observation_id`.
8. **Progression är beräknat read model.** Lagras inte som canonical DB-state.
9. **Recommendation logic ligger i kod**, inte som canonical DB-state.

### Produkt och marknad

10. **B2C-first.** Privat övningskörning är wedge. Ingen extern integration krävs för launch.
11. **Körpasset fungerar utan trafikskola och externa API:er.**
12. **Körpasset är inte teoriapp** och **inte AI-trafiklärare**.
13. **Körpasset visar inte falsk precision** som "87 % uppkörningsklar".

### Teknik

14. **Actor ≠ authentication.** `users` är person/actor. `auth_identities` är hur personen autentiseras.
15. **PostgreSQL 15+** som canonical databas.

### Varumärke och positionering

16. **Produktnamnet är Körpasset.**
    Huvuddomänen är `korpasset.se`.
17. **Kärnlöftet är "Övningskör med en plan."**
    Produkten ska hjälpa elev och handledare att svara på:
    - Vad ska vi träna på idag?
    - Hur gick det?
    - Vad bör vi träna på nästa gång?
18. **Körpasset äger den praktiska träningsloopen — inte teorin.**
    Produkten ska inte positioneras som teoriapp, provsimulator eller ersättning för trafikskola/riskutbildning.
19. **Flera handledare är ett centralt värdeerbjudande.**
    Elevens träning ska hålla ihop även när olika handledare kör med eleven vid olika tillfällen.
20. **Ingen falsk myndighetsassociation.**
    Körpasset är en fristående tjänst och får inte framställas som utvecklad av, ansluten till eller godkänd av Transportstyrelsen eller Trafikverket.
21. **Officiella källor får beskrivas korrekt.**
    Körpasset är utvecklad med utgångspunkt i svenska regler och officiell vägledning för privat övningskörning, inklusive relevanta dokument från Transportstyrelsen och Trafikverket.
22. **Ingen falsk readiness-precision.**
    Produkten får inte visa procentsatser eller formuleringar som:
    - "87 % redo för uppkörning"
    - "100 % körklar"
    - "Godkänd"
    - "Moment avklarat för alltid"

23. **Produktkonton skapas bara i appen via Apple eller Google.**
    Ingen e-post/lösenord, magic link eller passkey för elever och handledare. Se [ADR-008](decisions/ADR-008-app-oauth-accounts.md).
24. **En körkortsresa, ett köp, alla handledare.**
    Kommersiell access tillhör `driving_journey`, inte `user`. Inget Premium-konto. Se [FR-13](#fr-13-kommersiell-access-tillhör-resan).

### Pass-metaforen

Produktnamnet Körpasset får användas aktivt i UX-språket:

- Nästa körpass
- Dagens fokus
- Starta körpass
- Senaste körpasset
- Så gick körpasset
- Nästa gång

En framtida visuell pass-/stämpelmetafor får användas för faktiska händelser och milstolpar, exempelvis:

- Första körpasset
- 10 genomförda körpass
- Första körningen i mörker
- Första motorvägskörningen

Sådana milstolpar får inte beskrivas som officiella godkännanden eller bevis på uppkörningsberedskap.

Gamification/stämplar ingår **inte i beta-MVP** om de inte redan finns.

### Flera handledare

Körpasset ska hålla ihop elevens träningshistorik oberoende av vilken handledare som kör.

Exempel på produktvärde:

> Pappa vet vad mamma övade på sist.

Observationer och rekommendationer tillhör elevens `driving_journey`, inte en enskild handledare.

Ingen handledare ska behöva manuellt överföra träningshistorik till nästa handledare.

Fritextanteckningar mellan handledare och ny `notes`-modell ingår **inte** i beta. Gemensamma observations och Training Focus räcker.

---

## 5. Funktionella krav

Kraven nedan beskriver det kanoniska v1-flödet. Där vertical slice redan finns i koden anges det.

### FR-1 Elev skapar körkortsresa

| Fält | Krav |
| --- | --- |
| ID | FR-1 |
| Aktör | Elev |
| Status | Implementerat som namn+session i vertical slice; betakonto enligt ADR-008 |
| Beskrivning | En inloggad elev (Apple eller Google i appen) anger visningsnamn och ungefär var ni är i övningskörningen (`just_started` / `building` / `near_test`) och får en `driving_journey` med `licence_type = B`. `/onboarding` frågar först om personen tar körkort eller är handledare/förälder, så en förälder inte skapar elevresan av misstag. |
| Session | Servern skapar eller återanvänder `user_id` från verifierad Apple/Google-identity. Identity skickas inte in som betrodd klientdata. |
| Efter steg | Eleven landar på sin journey-sida och kan bjuda in handledare. |
| Slice-fallback | `/onboarding` som skapar guest-elev utan OAuth är utvecklingsflaggan `ALLOW_GUEST_STUDENT_ONBOARDING` (av i produktion), inte betans kontomodell. |

### FR-2 Inbjudan via länk och QR

| Fält | Krav |
| --- | --- |
| ID | FR-2 |
| Aktör | Elev |
| Status | Implementerat |
| Beskrivning | Eleven skapar en invitation. Systemet visar en delbar URL och QR-kod. |
| Token | Lagras endast som hash (`token_hash`). Plain token lämnar servern i URL:en, inte i databasen. |
| Expiry | Invitation har `expires_at` och status `pending` / `accepted` / `expired` / `revoked`. |
| Begränsningar | Eleven får inte bjudas in som sin egen handledare. Samma user får inte förekomma två gånger i samma journey. |

### FR-3 Handledare ansluter som guest

| Fält | Krav |
| --- | --- |
| ID | FR-3 |
| Aktör | Handledare |
| Status | Implementerat |
| Beskrivning | Handledare öppnar länken i appen (Universal Link). Redan inloggad Apple/Google-user återanvänds; annars skapas en guest actor med stable `user_id`. |
| Accept | Atomic conditional UPDATE: exakt en caller vinner. Replay skyddas av unik `token_hash`. |
| Efter accept | Handledare blir `journey_collaborator` med `role = supervisor` och `status = active`. |
| Senare claim | Samma `user_id` behålls när Apple eller Google läggs till via `auth_identities`. Ingen normal guest→registered-merge. |

### FR-4 Planera Drive Focus

| Fält | Krav |
| --- | --- |
| ID | FR-4 |
| Aktör | Elev eller handledare med journey-access |
| Status | Implementerat |
| Beskrivning | Innan körpasset väljs **2–3 skills** som Drive Focus — svaret på “Vad tränar ni på idag?”. |
| UI | Räknare “N av 3 valda”. Fler än 3 val ska inte gå att göra. Färre än 2 ska inte gå att starta. |
| Server | Samma 2–3-regel valideras i service layer. |
| Flera handledare | Om eleven har mer än en aktiv handledare ska eleven välja vilken som kör med dem. |
| Aktivt pass | Finns redan ett pågående körpass ska användaren tas dit, inte starta ett nytt. |

### FR-5 Genomföra körpass

| Fält | Krav |
| --- | --- |
| ID | FR-5 |
| Aktör | Elev och tilldelad handledare |
| Status | Implementerat |
| Beskrivning | Ett `drive` skapas med valt Drive Focus. Under passet visas de valda momenten. |
| Avsluta | Eleven eller den tilldelade handledaren får avsluta. Andra handledare får inte avsluta. |
| Context | Drive-context (miljö, ljus, väder, trafik) är **valfri** i v1. Första flödet ska inte tvinga handledaren att ange den. |

### FR-6 Tap-to-rate efter körpass

| Fält | Krav |
| --- | --- |
| ID | FR-6 |
| Aktör | Tilldelad handledare |
| Status | Implementerat |
| Beskrivning | Efter avslutat pass bedömer handledaren **endast Drive Focus-skills** med tre nivåer. |
| Nivåer (UI) | Behöver hjälp / Med påminnelse / Utan hjälp |
| Behörighet | Bara `drive.supervisor_user_id`. Andra handledare och eleven bedömer inte i detta flöde. |
| En gång | En handledarbedömning per körpass. Redan bedömt körpass går till recap. |
| Tid | Bedömningen ska gå att göra på cirka 15–20 sekunder tillsammans för de valda momenten. |

### FR-7 Recap och nästa träning

| Fält | Krav |
| --- | --- |
| ID | FR-7 |
| Aktör | Elev och handledare |
| Status | Implementerat |
| Beskrivning | Efter bedömning visas “Så gick det” (recap per bedömt moment) och “Nästa gång” (rekommendationer). |
| Rekommendation | Högst 3 förslag. Prioritet: aktiv Training Focus → `needs_help` → `with_support` → core skills utan evidens. |
| Transmission | Vid `automatic_only` ska `car_control_gear_shifting` inte rekommenderas. |

### FR-8 Navigering och kontextväljare på `/app`

| Fält | Krav |
| --- | --- |
| ID | FR-8 |
| Aktör | Inloggad user (Elev / Handledare) |
| Status | Implementerat |
| Beskrivning | Produktentrén `/app` utvärderar antalet aktiva, tillgängliga `driving_journeys` för den inloggade aktören och dirigerar användaren baserat på kontext. Publik landning `/` är waitlist och skapar inte produktkonto. |

**Routing-regler:**

- **Ingen session på `/`:** Visa landningen med intresseanmälan till betan. Ingen Apple/Google-registrering.
- **Ingen session på `/app`:** Visa Fortsätt med Apple / Fortsätt med Google.
- **0 tillgängliga resor (inloggad på `/app`):** Omdirigera till onboarding (`/onboarding`) som skiljer elev (skapa resa) från handledare/förälder (öppna inbjudan). En `active` user kan skapa en resa. Guest skapar inte elevresa i produktion.
- **1 tillgänglig resa:** Omdirigera direkt till den aktiva resans översikt (`/journey/[id]`).
- **>1 tillgängliga resor:** Visa kontextväljare på `/app` med rubriken **"Välj elev"** och hjälptexten **"Vilken körkortsresa vill du öppna?"**.

**Designregler för kontextväljaren:**

- För handledarresor identifieras varje resa primärt med elevens namn.
- Den inloggades egen elevresa, om den finns bland valen, ska heta **"Min körkortsresa"**, inte personens eget namn som om hen handledde sig själv.
- Senaste körpassets datum får visas som sekundär information, exempelvis **"Clara — senast körd 14 sep"**.
- Kontextväljaren väljer endast vilken `driving_journey` användaren arbetar i.
- Den startar inte ett nytt körpass och ska inte använda copy som antyder att ett körpass måste börja.
- Rubriken **"Välj elev"** används när alla val är handledarresor. Ingår den egna elevresan ska rubriken vara **"Vilken körkortsresa vill du öppna?"**.

Tillgängliga resor:

```text
accessible journeys =
student-owned active journeys
+
active collaborator journeys
```

utan dubbletter. `archived`/`completed` räknas inte. Collaborator-access i v1 är aktiv `supervisor` (inte `removed`, inte `driving_instructor`).

### FR-9 Flera handledare utan dataflytt

| Fält | Krav |
| --- | --- |
| ID | FR-9 |
| Aktör | System |
| Status | Specificerat och delvis implementerat |
| Beskrivning | Handledare kan lämnas/ersättas utan att observations, focus eller drives flyttas. All journey-data tillhör eleven. |

### FR-10 Guest claim utan merge

| Fält | Krav |
| --- | --- |
| ID | FR-10 |
| Aktör | Handledare |
| Status | Specificerat, auth-providers inte byggda |
| Beskrivning | Guest kan senare claima Apple eller Google i appen utan att byta `user_id`. |
| Undantag | Claim av identity som redan hör till annan user är ett separat reconciliation-fall och ingår inte i första vertical slice. |

### FR-11 Produktkonto via Apple eller Google

| Fält | Krav |
| --- | --- |
| ID | FR-11 |
| Aktör | Elev eller handledare |
| Status | Specificerat, inte byggt |
| Beskrivning | Det finns ingen separat registrering och inget val av roll. Första lyckade Sign in with Apple eller Sign in with Google i appen skapar `users` (`account_state = active`) och en rad i `auth_identities`. Samma knapp är återkommande inloggning. Roll uppstår när personen skapar en resa (elev) eller accepterar en inbjudan (handledare). |
| Identitet | `provider_subject` är Apple respektive Google `sub`. E-post är inte nyckel och används inte för auto-merge. |
| Kanal | Bara iOS- och Android-appen. `korpasset.se` skapar inte produktkonton (intresseanmälan är waitlist, inte signup). |
| Inte v1 | E-post + lösenord, magic link, OTP, passkey och publik webb-signup. |
| App Store | Sign in with Apple krävs när Google erbjuds. Konto ska kunna raderas i appen. |
| Undantag | Waitlist-admin är intern e-post+lösenord och inte ett användarkonto. |

### FR-12 Delad progress på resan

| Fält | Krav |
| --- | --- |
| ID | FR-12 |
| Aktör | Elev och varje aktiv handledare på samma `driving_journey` |
| Status | Specificerat; delvis synligt i utvecklingssidan |
| Beskrivning | Alla med journey-access ska kunna följa samma progression-read model: utveckling per moment, senaste recap och nästa rekommendation. |

Regler:

- Progression beräknas per resa, inte per handledare och inte som ett personligt betyg.
- En handledare som inte körde senaste passet ska ändå se hur det gick och vad som rekommenderas.
- Eleven ser samma utveckling som handledarna.
- Etiketter är evidens (Inte tränat ännu / Behöver hjälp / Med påminnelse / Utan hjälp), inte godkännande eller uppkörningsberedskap.
- Gästhandledare får se progress på den resa de accepterat. Registrerat konto krävs för att behålla flera elever över enheter.
- Canonical utläggning: [användare och progress](product/users-and-progress.md).

### FR-13 Kommersiell access tillhör resan

| Fält | Krav |
| --- | --- |
| ID | FR-13 |
| Aktör | Den som betalar (elev, förälder eller handledare) |
| Status | Specificerat, inte byggt |
| Beskrivning | Entitlement knyts till `driving_journey`, inte till `user`. Ett köp låser upp eleven och alla aktiva handledare på den resan. |

Regler:

- Det finns inget Premium-konto som gör en person betalande på alla sina resor.
- SKU = `driving_journey` + tidsperiod. Inte user, handledare, enhet eller antal körpass.
- Vem som betalar och vem som är elev behöver inte vara samma person.
- Entitlements på olika resor påverkar inte varandra.
- Gästs eller handledares `user_id` får aldrig avgöra betalstatus.
- Canonical domän: [användare och progress §8](product/users-and-progress.md#8-betalning-och-access-tillhör-körkortsresan).
- Trial, priser och paywall: [FR-14](#fr-14-paywall-och-entitlement-livscykel).

### FR-14 Paywall och entitlement-livscykel

| Fält | Krav |
| --- | --- |
| ID | FR-14 |
| Aktör | Alla med journey-access |
| Status | Specificerat, inte byggt, inte aktivt under betan |
| Beskrivning | Resan går `trial` → `expired` → `active` → `expired` → `active` vid förlängning/förnyelse. |

Regler:

- Trial: 3 bedömda körpass eller 30 dagar, det som kommer först. Tillhör resan. Nya handledare ger inte ny trial.
- Betalda perioder: 6 / 12 / 24 månader till preliminärt 349 / 499 / 749 kr. Hypoteser. Inget autogiro.
- I `trial` och `active` är kärnloopen öppen för eleven och alla aktiva handledare.
- I `expired` är historik, utveckling, recap och handledare **läsbara**. Nya körpass, ny bedömning och nya inbjudningar är stängda.
- Ett körpass som redan pågår när resan blir `expired` får avslutas och bedömas. Därefter full `expired`.
- Utgången period raderar inte historik. Paywall får inte hota med radering.
- Canonical: [paywall och entitlement-livscykel](product/entitlement-lifecycle.md).

---

## 6. Domänmodell

### 6.1 Tre separata begrepp

| Begrepp | Fråga | Tabell |
| --- | --- | --- |
| **Observation** | Vad visade eleven att hen kunde? | `drive_observations` |
| **Training Focus** | Vad bör eleven träna på framåt? | `training_focus_items` |
| **Drive Focus** | Vad avsåg just detta körpass att träna? | `drive_focus_skills` |

En observation skapar inte automatiskt Training Focus. Drive Focus kan länka till en befintlig Training Focus-rad, men måste inte.

### 6.2 Assessment levels

| Kod | UI-etikett | Betydelse |
| --- | --- | --- |
| `needs_help` | Behöver hjälp | Handledaren måste ingripa eller instruera aktivt |
| `with_support` | Med påminnelse | Eleven klarar momentet med viss guidning eller påminnelse |
| `independent` | Utan hjälp | Eleven utför momentet självständigt och säkert |

`independent` ska låta naturligt. “Eleven klarade detta själv” ska vara en begriplig mening.

### 6.3 Skill ≠ Context

Context är **inte** skills. Skapa inte skills som `roundabout_in_heavy_traffic`.

| Dimension | Värden |
| --- | --- |
| Environment | `residential`, `urban`, `rural`, `highway` |
| Light | `daylight`, `dusk_dawn`, `night` |
| Weather | `dry`, `rain`, `snow_ice`, `fog` |
| Traffic | `light`, `moderate`, `heavy` |

Context lagras på `drives` och kan overridas per observation via `context_override`.

Exempel: eleven kan vara `independent` på `roundabout_positioning` i `light` traffic, men ha mycket lite evidens för samma skill i `heavy` traffic.

### 6.4 Transmission scope

Varje `driving_journey` anger om resan är `unknown`, `manual` eller `automatic_only`.

| Scope | Effekt på `car_control_gear_shifting` |
| --- | --- |
| `unknown` | Skill kan bedömas normalt |
| `manual` | Skill kan bedömas normalt |
| `automatic_only` | Skill behandlas som `not_applicable` i progression — inte borttagen från taxonomin |

---

## 7. Skill Taxonomy v1

**Status:** Canonical  
**Taxonomy version:** 1  
**Antal skills:** 38  
**Licensklass:** B

Detta är en produktmodell för praktisk privat övningskörning. Det är inte en juridisk omskrivning av Transportstyrelsens kursplan.

De nio huvudområdena är UX-grupperingar för “Vad tränar vi idag?”, inte Transportstyrelsens fyra kursplanemoment.

| sortOrder | areaKey | Titel | Antal skills |
| --- | --- | --- | --- |
| 1 | `car_control` | Bilkontroll | 5 |
| 2 | `observation_interaction` | Blick & samspel | 4 |
| 3 | `positioning_lanes` | Placering & körfält | 4 |
| 4 | `intersections_roundabouts` | Korsningar & rondeller | 6 |
| 5 | `urban_traffic` | Stadstrafik | 3 |
| 6 | `rural_roads` | Landsväg | 4 |
| 7 | `highway` | Motorväg & större leder | 3 |
| 8 | `maneuvering` | Manövrering | 5 |
| 9 | `independent_safe_driving` | Självständig & säker körning | 4 |

`mvpPriority`:

- `core` — ska kunna bedömas i v1:s tap-to-rate när den är relevant för passet
- `supporting` — finns i taxonomin, men ska inte tränga ut kärnloopen

### 7.1 Bilkontroll (`car_control`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `car_control_pre_drive_check` | Säkerhetskontroll | core | Eleven gör en enkel kontroll av bilen och körställning innan ni kör: ljus, däck, vätskor, speglar, stol, bälte. |
| `car_control_smooth_start_stop` | Start och stannande | core | Eleven får i gång bilen och stannar den mjukt, utan ryck, rullning eller onödiga motorstopp. |
| `car_control_braking` | Bromsning | core | Eleven doserar bromsen så att farten sjunker i tid, mjukt i vanlig körning och bestämt när det behövs. |
| `car_control_gear_shifting` | Växling | core | Eleven väljer och byter växel i tid, utan att tappa uppmärksamheten från vägen. Gäller manuell låda. |
| `car_control_speed_adaptation` | Hastighetsanpassning | core | Eleven håller en fart som passar skylt, sikt, väglag och trafik — inte bara den skyltade maxfarten. |

### 7.2 Blick & samspel (`observation_interaction`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `observation_mirror_routine` | Spegelrutin | core | Eleven tittar i speglarna före fartsänkning, sväng, körfältsbyte och när något händer bakom. |
| `observation_blind_spot` | Döda vinkeln | core | Eleven tar en kontrollblick över axeln innan körfältsbyte, start från kant och sväng där det behövs. |
| `observation_signaling` | Tecken och blinkers | core | Eleven visar avsikt i tid — blinkers, och ibland tecken med hand — och släcker när momentet är klart. |
| `observation_scanning` | Avsökning | core | Eleven letar långt fram, åt sidorna och efter det som kan hända — inte bara på bilen framför. |

### 7.3 Placering & körfält (`positioning_lanes`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `positioning_road_position` | Placering på vägen | core | Eleven ligger rätt i körfältet — inte för nära kant, mittlinje, parkerade bilar eller mötande. |
| `positioning_lane_selection` | Val av körfält | core | Eleven väljer körfält efter vart hen ska, inte efter att alla andra ligger här. |
| `positioning_lane_change` | Körfältsbyte | core | Eleven planerar bytet, speglar, blinkar, tar döda vinkeln och byter med avstånd till andra. |
| `positioning_turning` | Sväng | core | Eleven närmar sig, placerar sig och spårar genom svängen utan att skära eller svänga för vitt. |

### 7.4 Korsningar & rondeller (`intersections_roundabouts`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `intersections_right_hand_rule` | Högerregeln | core | Eleven känner igen korsningar utan väjningsmärke och lämnar företräde åt höger när det krävs. |
| `intersections_give_way` | Väjningsplikt och stopp | core | Eleven stannar eller lämnar företräde när märken, linjer eller sikt kräver det, och kör ut först när luckan räcker. |
| `intersections_traffic_lights` | Trafikljus | core | Eleven anpassar farten mot ljuset, är beredd på skifte och hamnar inte i korsningen på rött. |
| `roundabout_entry` | Infart i rondell | core | Eleven sänker farten, lämnar företräde åt trafiken i cirkulationen och tar en lucka utan att stanna i onödan. |
| `roundabout_positioning` | Placering i rondell | core | Eleven väljer rätt läge i cirkulationen, särskilt i flerfältsrondell, och håller spåret utan att skära. |
| `roundabout_exit` | Utfart ur rondell | core | Eleven visar tecken i tid, byter till ytterläge om det behövs och lämnar rondellen utan att störa andra. |

### 7.5 Stadstrafik (`urban_traffic`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `urban_vulnerable_road_users` | Oskyddade trafikanter | core | Eleven upptäcker gående, cyklister och barn i tid och anpassar fart, lucka och ögonkontakt. |
| `urban_passing_stationary` | Passera stillastående fordon | core | Eleven sänker farten och lämnar lucka när hen passerar parkerade bilar, buss i hållplats eller andra stillastående hinder. |
| `urban_tight_spaces` | Trånga gator | core | Eleven tar sig fram där det är smalt — bilar på båda sidor, mötande i villagata — utan att skrapa eller frysa. |

### 7.6 Landsväg (`rural_roads`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `rural_joining_and_leaving` | Infart och avfart på landsväg | core | Eleven kommer ut på, och svänger av från, en mer högtrafikerad landsväg med rätt fart, placering och tecken. |
| `rural_curves` | Kurvor på landsväg | core | Eleven läser kurvan, sänker före, placerar sig och gasar ut utan att skära eller bromsa mitt i. |
| `rural_meeting_traffic` | Möte | core | Eleven möter andra fordon med rätt lucka, fart och placering, även på smal väg. |
| `rural_passing` | Omkörning | supporting | Eleven väljer plats, visar tecken, accelererar och går tillbaka utan att skära in för tidigt. Inkluderar att avstå. |

### 7.7 Motorväg & större leder (`highway`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `highway_merging` | Påfart | core | Eleven använder accelerationsfältet, speglar, blinkar och smälter in i luckan utan att stanna på rampen. |
| `highway_lane_discipline` | Körfält på motorväg | core | Eleven håller höger när det går, använder vänster till omkörning och håller jämn placering i hög fart. |
| `highway_exiting` | Avfart | core | Eleven planerar avfarten i tid, byter fält, blinkar och sänker farten på decelerationsfältet — inte ute i körfältet. |

### 7.8 Manövrering (`maneuvering`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `maneuver_reversing` | Backning | core | Eleven backar rakt och i sväng med uppsikt, långsamt och utan att gissa sig fram. |
| `maneuver_hill_start` | Start i lutning | core | Eleven startar i motlut och medlut utan att rulla okontrollerat bakåt eller framåt. |
| `maneuver_parallel_parking` | Parallellparkering | core | Eleven parkerar längs gatan, vanligen genom att backa in, med kontroll på hörn och trafik. |
| `maneuver_parking` | Övrig parkering | supporting | Eleven parkerar på tomt, vinkelplats eller annan ficka som inte är klassisk parallellparkering. |
| `maneuver_turning_around` | Vändning | core | Eleven väljer en säker plats och vänder — trepunkt, slinga eller motsvarande — med uppsikt. |

### 7.9 Självständig & säker körning (`independent_safe_driving`)

| Nyckel | Titel | Prioritet | Beskrivning |
| --- | --- | --- | --- |
| `independent_route_planning` | Köra mot mål | core | Eleven hittar fram mot ett mål själv — känt mål eller skyltat — och rättar till om hen kör fel. |
| `independent_risk_awareness` | Riskmedvetenhet | core | Eleven ser risker i tid och agerar tidigt — sänker, väntar, byter plan — utan att handledaren behöver peka. |
| `independent_safety_margins` | Säkerhetsmarginaler | core | Eleven håller avstånd framåt, åt sidorna och i tid — inte stötvis, inte tätt inpå. |
| `independent_eco_driving` | Sparsam körning | supporting | Eleven planerar så att hen kan rulla, undvika onödiga stopp och hålla jämn fart utan att jaga växlar. |

Maskinläsbar seed-input: [`docs/domain/skill-taxonomy-v1.json`](domain/skill-taxonomy-v1.json). Fullständig officiell grund per skill: [`docs/domain/skill-taxonomy.md`](domain/skill-taxonomy.md).

---

## 8. Datamodell

Implementerad i [`db/migrations/0001_initial.sql`](../db/migrations/0001_initial.sql).

### 8.1 Översikt

```text
users ←→ auth_identities
  │
  ├── driving_journeys (student_user_id)
  │     ├── journey_collaborators
  │     ├── journey_invitations
  │     ├── drives
  │     ├── training_focus_items
  │     ├── drive_focus_skills
  │     └── drive_observations
  │
skills ← skill_definitions (versionerad taxonomi)
```

### 8.2 Enums

| Enum | Värden |
| --- | --- |
| `account_state` | `guest`, `active`, `suspended`, `deleted` |
| `collaborator_role` | `supervisor`, `driving_instructor` |
| `collaborator_status` | `active`, `removed` |
| `invitation_status` | `pending`, `accepted`, `expired`, `revoked` |
| `assessment_level` | `needs_help`, `with_support`, `independent` |
| `observation_source` | `supervisor`, `student`, `system`, `external`, `driving_school` |
| `focus_source` | `student`, `supervisor`, `driving_school`, `system`, `external` |
| `focus_status` | `active`, `completed`, `dismissed` |
| `driving_environment` | `residential`, `urban`, `rural`, `highway` |
| `light_condition` | `daylight`, `dusk_dawn`, `night` |
| `weather_condition` | `dry`, `rain`, `snow_ice`, `fog` |
| `traffic_level` | `light`, `moderate`, `heavy` |
| `transmission_scope` | `unknown`, `manual`, `automatic_only` |
| `journey_status` | `active`, `completed`, `archived` |
| `auth_provider` | `guest`, `apple`, `google`, `passkey`, `email_magic_link` |

Produkt-auth i v1 är `apple` och `google`. `guest` är tillfällig actor vid QR-handoff. `passkey` och `email_magic_link` stannar i enum men används inte som produktauth. Se [ADR-008](decisions/ADR-008-app-oauth-accounts.md).

`driving_instructor`, `observation_source = driving_school` och `focus_source = driving_school` finns för framtida integration men används inte i v1.

### 8.3 Tabeller (kravnivå)

**`users`** — actor/person. Guest och registrerad delar samma modell. `id` är stable genom guest → registered.

**`auth_identities`** — sätt att autentisera en user. En user kan ha flera identities. Unik `(provider, provider_subject)` där `provider_subject` är Apple/Google `sub`, inte e-post.

**`driving_journeys`** — elevägd resa. Studenten är inte collaborator. `licence_type` är `B` i v1.

**`journey_collaborators`** — unik `(journey_id, user_id)`.

**`journey_invitations`** — token endast hashad. DB CHECK: `accepted` kräver `accepted_at` + `accepted_by_user_id`; `pending` kräver att båda är NULL.

**`skills` / `skill_definitions`** — `skill_key` är permanent identitet. Definitioner är versionerad presentation (`taxonomy_version`, titel, area, `mvp_priority`).

**`drives`** — körpass. Context-fält nullable. `environment` default `{}` = inte registrerat.

**`training_focus_items`** — framåtblickande intent. Unik `(id, journey_id)`.

**`drive_focus_skills`** — plan för ett specifikt körpass. Unik `(drive_id, journey_id, skill_id)`.

**`drive_observations`** — append-only ledger. Unik `(id, journey_id)`.

Journey-isolering implementeras med **composite foreign keys**, t.ex. observation → drive inom samma journey.

---

## 9. Progression och rekommendation

Progression är ett **beräknat read model** — inte canonical DB-state.

```text
Observations (append-only ledger)
    ↓
Progression Engine (beräknar)
    ↓
Read model (per skill, per context, per journey)
    ↓
Recommendation Engine (i kod)
    ↓
Training Focus (persisted intent)
```

### 9.1 Vad som inte är progression

| Begrepp | Varför inte progression |
| --- | --- |
| Training Focus | Framåtblickande intent — separat entitet |
| Drive Focus | Plan för ett specifikt körpass — separat entitet |
| Prerequisite-graf | Analys i taxonomin, inte DB-constraint |

### 9.2 Recommendation v0 (implementerad)

Prioritetsordning, max 3 resultat, utan dubbletter:

1. Aktiva `training_focus_items`
2. Senaste icke-supersedade observation `needs_help`
3. Senaste icke-supersedade observation `with_support`
4. Core-skills utan evidens, i taxonomins `sort_order`

`car_control_gear_shifting` hoppas över vid `transmission_scope = automatic_only`.

### 9.3 Progression i UI

Progression ska beskriva **evidens och utveckling**, inte certifiering eller uppkörningsberedskap.

Per skill används i v1:

- Inte tränat ännu
- Behöver hjälp
- Med påminnelse
- Utan hjälp

Översikter får dessutom visa sakliga mått såsom:

- antal tränade moment,
- antal körpass där området tränats,
- senaste observation,
- senaste träningsdatum,
- vilka miljöer/context som det finns evidens från.

Exempel:

> Korsningar & rondeller  
> 5 av 6 moment tränade  
> 3 moment senast utan hjälp  
> Tränat i 4 körpass

Ett helt område ska inte reduceras till en påstådd sannolikhet eller officiell "godkänd"-status.

---

## 10. Integritetskrav

| # | Invariant | Lagring |
| --- | --- | --- |
| 1 | Observation får inte peka på drive i annan journey | DB — composite FK |
| 2 | Drive focus får inte peka på focus item i annan journey | DB — composite FK |
| 3 | Observation får inte superseda observation i annan journey | DB — composite FK |
| 4 | Observation får inte superseda sig själv | DB — CHECK |
| 5 | Högst en observation får superseda en given observation | DB — unique index |
| 6 | Correction måste behålla samma `journey_id`, `drive_id`, `skill_id` | Service layer |
| 7 | Correction-chain får inte skapa cykel | Service layer |
| 8 | Supervisor på drive måste höra till journey | Service layer |
| 9 | `started_by_user_id` måste ha relation till journey | Service layer |
| 10 | Eleven får inte bjudas in som sin egen handledare | Service layer |
| 11 | Invitation får inte accepteras två gånger | Service layer — atomic UPDATE |
| 12 | Accepted invitation kräver accept-fält | DB — CHECK |
| 13 | Pending invitation får inte ha accept-fält | DB — CHECK |
| 14 | Expired/revoked invitation får inte användas | Service layer |
| 15 | Completed focus item ska ha `completed_at` | DB — CHECK |
| 16 | Active focus item ska normalt inte ha `completed_at` | DB — CHECK |
| 17 | Student observation → `observer_user_id = student_user_id` | Service layer |
| 18 | Supervisor observation → `observer_user_id` är aktiv supervisor | Service layer |
| 19 | Actor identity hämtas från server session, inte klientinput | Service layer |
| 20 | Drive Focus måste vara 2–3 skills | Service layer |
| 21 | Bara tilldelad handledare får bedöma körpasset | Service layer |
| 22 | Bara elev eller tilldelad handledare får avsluta körpasset | Service layer |

### 10.1 Observation source rules

| Source | Krav |
| --- | --- |
| `supervisor`, `student` | `observer_user_id` krävs |
| `system` | Ingen actor krävs |
| `external` | `external_source_ref` krävs |
| `driving_school` | `observer_user_id` ELLER `external_source_ref` krävs |

Authorization: `observer_user_id`, `started_by_user_id` och accepterande user vid invitation hämtas från serverns actor/session.

Normal produktkod ska **INSERT** — inte UPDATE/DELETE — på `drive_observations`. Privileged GDPR/admin-process får hantera legitim radering/anonymisering.

### 10.2 Kontoradering och data lifecycle (tombstoning)

**Huvudprincip:** En användares kontoradering får aldrig oavsiktligt radera eller förstöra en annan användares `driving_journey` eller historiska data.

#### Elev raderar konto

När eleven begär kontoradering ska en privileged data-lifecycle-process hantera elevens konto och den elevägda `driving_journey` inklusive tillhörande journey-data som inte längre ska bevaras.

Raderingen ska omfatta beroende data såsom observationer, Drive Focus, Training Focus, drives, collaborators och invitations i den utsträckning som dessa inte behöver bevaras på annan giltig rättslig grund.

Databasen får använda `ON DELETE CASCADE` där detta är förenligt med datamodellens integritetskrav, men cascade-beteende är en implementationsteknik och inte den juridiska huvudregeln.

#### Handledare raderar konto

När en handledare begär kontoradering ska Körpasset:

- radera eller avaktivera samtliga `auth_identities`,
- återkalla aktiva sessioner, tokens och andra autentiseringsmöjligheter,
- radera eller nolla direkta profilidentifierare som inte längre behöver behandlas,
- sätta `users.account_state = deleted`,
- ta bort handledaren från fortsatt aktiv användning av berörda journeys,
- bevara det stabila `user_id` i historiska `drives`, `drive_observations` och andra ledger-relationer endast i den utsträckning som det krävs för att bevara elevens dataintegritet och det finns ett giltigt ändamål och rättslig grund för fortsatt behandling.

Historiska observationer får inte försvinna enbart därför att den handledare som skapade dem raderar sitt konto.

#### Pseudonymiserad tombstoned actor

Ett bevarat `user_id` som fortfarande kan kopplas till historik i en specifik `driving_journey` ska behandlas som **pseudonymiserad personuppgift**, inte som anonym data.

Pseudonymisering innebär därför inte obegränsad lagring. Kvarvarande data omfattas fortsatt av Körpassets gallrings- och datalagringspolicy och ska raderas eller omprövas när ändamålet eller den rättsliga grunden för fortsatt behandling upphör.

Om data senare görs faktiskt anonym ska anonymiseringen vara sådan att personen inte längre rimligen kan identifieras eller återkopplas till informationen.

#### UI-presentation

När en handledare är tombstoned:

- ska det tidigare profilnamnet inte visas i normal produkt-UI,
- historiska poster får visas med neutral etikett, exempelvis **"Tidigare handledare"**,
- den tombstonade aktören får inte kunna autentisera sig eller återuppta den gamla kontosessionen utan ett uttryckligt nytt account-recovery/reconciliation-flöde.

#### Implementation status (vertical slice v1)

Fullständig kontoradering är **inte** ett produktflöde i vertical slice. Befintligt schema kan stödja handledar-tombstoning utan ny arkitektur eller ny migration:

- `users.account_state` inkluderar redan `deleted` (oanvänd i produktkod före denna delta).
- Hard `DELETE` av en handledare **blockeras** av default RESTRICT/NO ACTION på `drives.supervisor_user_id`, `drives.started_by_user_id`, `drive_observations.observer_user_id`, `journey_collaborators.user_id` och invitation-FK:er.
- Hard `DELETE` av en elev **blockeras** av `driving_journeys.student_user_id` (RESTRICT). Om journeyn raderas först CASCADE:ar journey-barn (drives, observations, m.m.) — det är en privileged process, inte handledar-delete.
- `observer_user_id` är nullable på kolumnnivå, men CHECK kräver värdet för `source_type` supervisor/student. SET NULL skulle alltså bryta constraint:et; tombstone ska **behålla** `user_id`.
- Enda direkta identifieraren på `users` är `display_name`. E-post och provider-subject ligger i `auth_identities` (oanvänd i slice).
- Sessioner är signerade cookies; det finns ingen session-tabell att återkalla mot.
- Återstår som separat implementation: privileged delete-account-API, radering av `auth_identities`, nollning av `display_name`, `account_state = deleted`, collaborator `removed`, server-side session revoke, och historisk UI-etikett där observer-namn visas.

---

## 11. Tekniska beslut

| ADR | Beslut | Status |
| --- | --- | --- |
| [ADR-001](decisions/ADR-001-student-owned-journey.md) | Eleven äger `driving_journey`. Handledare är collaborators. | Accepted |
| [ADR-002](decisions/ADR-002-actor-auth-separation.md) | `users` ≠ `auth_identities`. Guest behåller samma `user_id`. | Accepted |
| [ADR-003](decisions/ADR-003-skill-context-separation.md) | Skill ≠ Context. Context på drive + optional override. | Accepted |
| [ADR-004](decisions/ADR-004-append-only-observations.md) | Observationer är append-only ledger. | Accepted |
| [ADR-005](decisions/ADR-005-observation-focus-separation.md) | Observation ≠ Training Focus ≠ Drive Focus. | Accepted |
| [ADR-006](decisions/ADR-006-b2c-first.md) | B2C-first. Ingen trafikskola eller extern API i v1. | Accepted |
| [ADR-007](decisions/ADR-007-postgresql-15.md) | PostgreSQL 15+ p.g.a. column-specific `ON DELETE SET NULL`. | Accepted |
| [ADR-008](decisions/ADR-008-app-oauth-accounts.md) | Produktkonton bara i appen via Apple och Google. Ingen webb-signup. | Accepted |

Databas: raw SQL-migration, inget ORM i foundation. Docker Compose för lokal utveckling.

---

## 12. Källhänvisningar

### 12.1 Canonical dokument i repo

- [Vision](product/vision.md)
- [MVP v1](product/mvp-v1.md)
- [Produktprinciper](product/product-principles.md)
- [Onboarding & handoff](product/onboarding-handoff.md)
- [Användare, roller och delad progress](product/users-and-progress.md)
- [Account lifecycle](product/account-lifecycle.md)
- [Paywall och entitlement-livscykel](product/entitlement-lifecycle.md)
- [Skill Taxonomy v1](domain/skill-taxonomy.md)
- [Data model](domain/data-model.md)
- [Progression model](domain/progression-model.md)
- [Database](architecture/database.md)

### 12.2 Officiella källor för taxonomin

Lästa 2026-09-14. Primärkällor, inte trafikskolebloggar eller körkortsappar.

| Källa | Användning |
| --- | --- |
| [TSFS 2011:20](https://www.transportstyrelsen.se/tsfs/TSFS%202011_20.pdf) | Kursplan behörighet B |
| [TSFS 2012:43](https://lagen.nu/tsfs/2012:43) | Förarprov behörighet B |
| [Planera övningskörningen](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/planera-ovningsskorningen/) | Planera, öva till självständighet, följ upp |
| [Övningsköra](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/ovningskora/) | Ram för privat övningskörning |
| [Handledare](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/handledare/) | Handledarroll |
| [Råd till handledaren](https://www.transportstyrelsen.se/globalassets/global/publikationer-och-rapporter/vag/korkort/rad_till_handledaren_a5_2026-08-01.pdf) (2026-08-01) | Säkerhetskontroll, manövrering, miljöprogression |
| [Så går körprovet till](https://www.trafikverket.se/korkort/ta-korkort/personbil-och-latt-lastbil/sa-gar-korprovet-till/) | Trafikverkets provpunkter |
| [Riskutbildning för personbil](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/riskutbildning/riskutbildning-bil/) | Avgränsning: inte v1-skills |

Riskutbildning (alkohol/trötthet och halka/hastighet i särförhållanden) är obligatorisk **extern** utbildning och ingår inte som v1-skills.

---

## 13. Beta-UX

Canonical målbild för beta. Allt behöver inte vara byggt i vertical slice; sektionerna låser produktkrav inför Beta Readiness.

### Elev

Elevens primära upplevelse ska vara:

```text
Min resa / Min utveckling
        ↓
Nästa körpass
        ↓
Senaste körpasset
        ↓
Utveckling per träningsområde
        ↓
Mina handledare / bjud in handledare
```

Elevens vy ska prioritera:

- långsiktig utveckling,
- nästa rekommenderade träning,
- gemensam historik från flera handledare,
- invitation/QR för handledare.

### Handledare

Handledarens primära upplevelse ska prioritera:

```text
Välj elev (om >1)
        ↓
Dagens fokus
        ↓
Starta körpass
        ↓
Kör
        ↓
Tap-to-rate
        ↓
Klart
        ↓
Samma utveckling som eleven (även pass hen inte körde)
```

Handledaren ska ha **minsta möjliga administration**.

Handledaren ska kunna öppna utveckling och recap på resan utan att ha kört det senaste passet. Det är så nästa handledare fortsätter där den förra slutade.

FR-6 gäller fortsatt:

- endast 2–3 Drive Focus-skills bedöms,
- tre val: Behöver hjälp / Med påminnelse / Utan hjälp,
- hela bedömningen ska kunna göras på cirka 15–20 sekunder.

---

## 14. Definition of Beta Ready

Körpasset är beta-ready när en ny elev och en ny handledare, utan hjälp från utvecklingsteamet, kan:

1. öppna/installera Körpasset och fortsätta med Apple eller Google,
2. skapa elevens körkortsresa,
3. ansluta en handledare via QR/länk i appen,
4. välja 2–3 moment för nästa körpass,
5. starta och avsluta körpasset,
6. låta den tilldelade handledaren bedöma momenten på cirka 15–20 sekunder,
7. se recap,
8. förstå vad som rekommenderas inför nästa körpass,
9. fortsätta samma elevresa med en annan handledare.

Beta-ready kräver också:

- fungerande produktionsmiljö,
- integritetspolicy,
- användarvillkor,
- kontakt/feedbackväg,
- grundläggande error/crash-observability,
- iOS-distribution via TestFlight,
- Android-distribution via Google Play test track,
- Sign in with Apple och Sign in with Google i appen.

Betalning ingår inte som blockerare för första beta. Se [Beta Validation och kommersiell gate](#16-beta-validation-och-kommersiell-gate).

---

## 15. korpasset.se

Publik landning för intresseanmälan till betan. Intresseanmälan är **inte** kontoregistrering. Produktkonton skapas bara i appen via Apple eller Google (`/app`). Invitation-URL:er på samma origin ska öppna appen (Universal Links / App Links). Slice-onboarding på `/onboarding` som skapar guest-elev är utvecklingsfallback bakom `ALLOW_GUEST_STUDENT_ONBOARDING` (av i produktion).

Informationshierarki:

```text
Körpasset
Övningskör med en plan.

Välj vad ni ska träna på.
Kör.
Följ upp på några sekunder.

[ Bli betatestare ]

→ Hur det fungerar: 3 steg
→ Flera handledare
→ Utveckling utan falska procentsiffror
→ Inte ännu en teoriapp
→ Officiella källor/metodik
→ Disclaimer
→ Beta CTA / intresseanmälan
→ Privacy / Terms / Contact / Radera konto
```

Canonical multi-handledar-copy:

> Pappa vet vad mamma övade på sist.
>
> När flera hjälper till med övningskörningen blir det lätt spretigt.
> Körpasset håller ihop träningen kring eleven, så nästa körpass kan fortsätta där det förra slutade – oavsett vem som sitter bredvid.

Canonical myndighetscopy:

> Körpasset är utvecklad med utgångspunkt i svenska regler och officiell vägledning för privat övningskörning från Transportstyrelsen och Trafikverket.
>
> Körpasset är en fristående tjänst och är inte utvecklad av, ansluten till eller godkänd av Transportstyrelsen eller Trafikverket.

---

## 16. Beta Validation och kommersiell gate

### Syfte

Första externa betan ska validera att Körpassets kärnloop fungerar i verklig privat övningskörning innan betalning introduceras.

Beta ska därför optimeras för **användning, återkomst och lärande**, inte intäkt.

### Beta cohort

Första valideringsmålet är:

> **25 aktiva elevresor (`driving_journeys`)**

En elevresa är den relevanta beta-enheten, inte antal installerade appar eller registrerade users.

En elevresa kan innehålla:

- en elev,
- en eller flera handledare,
- flera users/devices.

### Definition av aktiv beta-elevresa

En `driving_journey` räknas som **aktiv beta-elevresa** först när hela kärnloopen genomförts minst en gång:

```text
journey_created
→ supervisor_connected
→ drive_focus_saved
→ drive_started
→ drive_completed
→ rating_completed
→ recap_viewed
```

En registrering utan genomfört körpass räknas alltså inte som en validerad aktiv beta-elevresa.

### Beta pricing

Körpasset är **gratis under den första valideringsbetan**.

Ingen betalvägg eller prenumeration ska blockera kärnloopen innan Beta Validation Gate har uppnåtts.

Kommunikation till betatestare:

> Körpasset är gratis under betaperioden.
> Du får tidig tillgång och hjälper oss förbättra tjänsten inför lansering.

Körpasset ska i denna fas:

- inte lova livstidsfri användning,
- inte lova ett permanent framtida pris,
- inte kräva betaluppgifter,
- inte optimera onboarding mot köp.

De första betatestarna får senare erbjudas en separat founder/beta-förmån, men detta är ett framtida kommersiellt beslut och inte del av beta-MVP.

### Beta Validation Gate

Betan betraktas som initialt produktvaliderad när följande kriterier är uppfyllda.

#### 1. Volym

Minst:

> **25 aktiva elevresor**

ska ha genomfört minst ett komplett körpass genom Körpassets kärnloop.

#### 2. First Drive Completion

Minst:

> **20 av de första 25 aktiva elevresorna**

ska kunna genomföra kärnloopen utan manuell hjälp från Körpassets utvecklingsteam.

Det innebär:

```text
create journey
→ connect supervisor
→ choose 2–3 Drive Focus skills
→ complete drive
→ supervisor rating
→ recap
```

Supportfrågor är tillåtna, men processen får inte vara beroende av att teamet manuellt korrigerar data eller leder användaren genom flödet.

#### 3. Second Drive Rate

Det primära valideringsmåttet är:

> **Second Drive Rate**

Definition:

```text
antal aktiva elevresor som genomför ett andra rated drive
inom 14 dagar efter första completed drive
/
antal aktiva elevresor med första completed rated drive
```

Initial beta-gate:

> **Minst 12 av de första 25 aktiva elevresorna ska genomföra ett andra körpass inom 14 dagar.**

Detta är viktigare än:

- downloads,
- skapade konton,
- sessions,
- page views.

Ett andra körpass är stark evidens för att Körpasset blivit användbart i familjens faktiska övningskörning.

#### 4. Multi-supervisor validation

Eftersom flera handledare är ett centralt produktvärde ska betan innehålla verklig användning där:

- samma elev har fler än en handledare,
- olika handledare kan fortsätta samma elevresa,
- tidigare observations och rekommendationer är tillgängliga utan manuell överföring.

Det finns inget hårt procentkrav i första cohorten, men multi-supervisor-flödet ska ha används av flera verkliga beta-elevresor före kommersiell launch.

#### 5. Tap-to-rate

Handledarens bedömning efter körpass ska fortsatt uppfylla FR-6:

- endast 2–3 Drive Focus-skills,
- tre assessment levels,
- cirka 15–20 sekunders total bedömningstid.

Beta-feedback som visar att handledaren behöver navigera, söka eller administrera efter körningen ska behandlas som produktfriktion.

### Beta instrumentation

Följande produkt-events ska kunna mätas per `driving_journey`:

```text
journey_created
supervisor_connected
drive_focus_saved
drive_started
drive_completed
rating_completed
recap_viewed
second_drive_completed
```

Där det är relevant ska eventet även innehålla:

- anonym/pseudonym journey identifier,
- timestamp,
- antal Drive Focus skills,
- actor role,
- om journeyn har en eller flera aktiva supervisors.

Analytics ska inte lagra onödiga direkta personidentifierare.

### Canonical beta funnel

```text
Journey created
      ↓
Supervisor connected
      ↓
Drive Focus saved
      ↓
Drive started
      ↓
Drive completed
      ↓
Rating completed
      ↓
Recap viewed
      ↓
Second rated drive within 14 days
```

### Beta feedback

Betatestare ska ha en tydlig feedbackväg.

Feedback ska särskilt kunna kategoriseras kring:

- onboarding,
- invitation/QR,
- val av Drive Focus,
- start/avslut av körpass,
- tap-to-rate,
- recap,
- rekommendationer,
- flera handledare,
- tekniska problem.

Betafasen ska prioritera återkommande blockerande friktion framför nya features.

### Commercialization Gate

Betalning får börja planeras när Beta Validation Gate är uppnådd och de största P0/P1-friktionerna från betan är åtgärdade.

Första betalande fasen ska normalt komma **efter** den initiala 25-resorsbetan.

Rekommenderad sekvens:

```text
Beta Ready
      ↓
25 aktiva elevresor
      ↓
Beta Validation Gate
      ↓
Åtgärda största friktionerna
      ↓
Bredda mot cirka 50–100 elevresor
      ↓
Introducera betalning för nya användare
```

Betalning är **inte ett krav för Beta Ready eller första Beta Validation**.

Kommersiell access, när den införs, tillhör `driving_journey` — inte `user`. Inget Premium-konto. **En körkortsresa, ett köp, alla handledare.**

Trial, priser och vad som är läsbart efter utgång: [FR-14](#fr-14-paywall-och-entitlement-livscykel) och [paywall och entitlement-livscykel](product/entitlement-lifecycle.md).

Historik raderas inte. Paywall enforceras inte under betan.

### Prioriteringsregel under beta

Före Beta Validation Gate ska utvecklingsprioritet vara:

1. Blockerare i kärnloopen.
2. Friktion som minskar First Drive Completion.
3. Friktion som minskar Second Drive Rate.
4. Problem i multi-supervisor-flödet.
5. Stabilitet, support och observability.
6. Först därefter nya funktioner.

Funktioner som badges, stämplar, avancerad gamification, betalning, teori, AI eller GPS får inte prioriteras framför problem som påverkar kärnloopen eller återkomst till andra körpasset.

