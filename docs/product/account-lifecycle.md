# Account lifecycle

**Status:** Canonical.  
**Datum:** 2026-09-22  
**Omfattning:** Produktkonton för elever och handledare. Inte waitlist-admin. Inte paywall.

Hur man *får* ett konto (Apple/Google i appen, ingen webb-signup) ligger i [ADR-008](../decisions/ADR-008-app-oauth-accounts.md). Den här filen slår fast vad kontot *är* efter det: tillstånd, sessioner, claim, collision, radering och gränsen mellan app och webb.

Fyra nivåer som inte får blandas:

| Nivå | Vad | Inte |
| --- | --- | --- |
| `users` | Personen / actorn. Stabil `user_id`. | Inte en roll. Inte Premium. |
| `auth_identities` | Sätt att logga in. Nyckel = `(provider, provider_subject)` där subject är Apple/Google `sub`. | Inte e-post som nyckel. Inte auto-merge. |
| Roll | Uppstår per `driving_journey` (elev eller handledare). | Inte valt vid registrering. |
| Entitlement | Tillhör resan. | Aldrig kontot. Inget Premium-konto. |

Waitlist (`interest_signups`) och `/admin` är andra universum.

## 1. Account state

`users.account_state` är den centrala accessregeln för produkt-sessionen. En signerad cookie med `userId` räcker inte.

| State | Vad det är | Får använda produkten | Har produktkonto |
| --- | --- | --- | --- |
| `guest` | Actor utan Apple/Google. Skapas vid QR/länk så handledaren kan delta direkt. | Ja, på resor hen redan har access till | Nej |
| `active` | Apple eller Google är kopplat. Samma knapp är återkommande inloggning. | Ja | Ja |
| `suspended` | Kontot är avstängt. Identiteter får ligga kvar. | Nej | Ja, men låst |
| `deleted` | Tombstone. Identiteter borta, `display_name` nollad. Historik på andras resor frikopplad. | Nej | Nej |

```text
guest
  └─ claim Apple/Google  → active

(ingen user)
  └─ första Apple/Google → active  (ny user)

active
  ├─ logout              → samma user, ingen cookie
  ├─ suspend             → suspended
  └─ radera konto        → deleted

suspended
  ├─ (privilegierad återaktivering — inte v1-produktflöde)
  └─ radera konto        → deleted

deleted
  └─ ny Apple/Google     → ny user (samma sub får användas igen
                            eftersom auth_identities raderades)
```

`guest` är inte registrering. Eleven skapar körkortsresa först efter `active` i betans kontomodell. Slice-fallback via `/onboarding`-namnformulär är utvecklingsfallback, inte produkten. Se [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).

## 2. Session

Produkt-sessionen är en HMAC-signerad cookie (`bilklar_session`) med `{ userId, issuedAt }`. Det finns ingen session-tabell.

Regler:

- Cookie parsas, sedan slås `users.account_state` upp.
- `guest` och `active` → sessionen får användas.
- `suspended` och `deleted` → cookie ogiltigförklaras. Ingen produktroute får behandla dem som inloggade.
- Logout raderar cookien. Kontot och identiteterna ligger kvar.
- Logout på en enhet påverkar inte andra enheter (samma cookie-modell, ingen server-side revoke-lista i v1). Radering och `suspended` stoppar däremot *nästa* request från varje enhet, eftersom state läses från databasen.
- HMAC-cookien kan inte fjärrkillas innan nästa request. Det är acceptabelt i v1. Server-side `token_version` eller denylist är ett senare härdningssteg, inte ett krav för den här grunden.

Admin-cookien `korpasset_admin` följer inte de här reglerna.

## 3. Login och claim

Identitetsnyckel är Apple eller Google `sub`, verifierad på servern. Klienten skickar en identity token. Servern litar inte på `sub` eller e-post som klientdata.

### 3.1 Första gången (ingen session, ingen identity)

Skapa `users` med `account_state = active` och en rad i `auth_identities`. Display name får fyllas från providern och redigeras senare på `/konto`. E-post, om den kommer med, är support-metadata — inte login-id och inte merge-nyckel.

### 3.2 Återkommande inloggning

Samma `(provider, provider_subject)` → session på samma `user_id`. Display name skrivs inte över.

### 3.3 Guest claim (FR-10)

Gästsession i appen + oanvänd Apple/Google-identity → lägg identity på **samma** `user_id`, sätt `account_state = active`. Drives, observations och collaborator-rader pekar oförändrat på samma person. Ingen merge.

### 3.4 Andra providern

En `active` user får koppla den andra providern (Apple efter Google eller tvärtom) till samma `user_id`. Det är frivillig länk, inte auto-merge via e-post.

### 3.5 Collision

Om identity redan sitter på en **annan** user: **409**. Ingen merge. Ingen tyst övertagning. Gästens `user_id` och historik lämnas orörda. Reconciliation av två personer som råkar vara samma människa är ett separat fall och ingår inte i v1.

### 3.6 Suspended och deleted vid login

- Identity på `suspended` → avvisas. Personen får inte en ny session.
- Identity på `deleted` ska inte finnas (`auth_identities` raderas vid tombstone). Samma Apple/Google `sub` får då skapa ett **nytt** konto.
- Cookie för `deleted` eller `suspended` får aldrig återuppliva den gamla actorn.

## 4. Logout, namn och radering

| Handling | Effekt |
| --- | --- |
| Logga ut | Cookie rensas. User och identities kvar. |
| Ändra visningsnamn | Bara `users.display_name`. Inte identity, inte resa. |
| Radera konto i appen | Se [kravspec §10.2](../kravspec.md#102-kontoradering-och-data-lifecycle-tombstoning): identiteter bort, namn nollat, `deleted`, elevresor CASCADE. Handledarhistorik på andras resor behålls men frikopplas från `users` (`user_id` nollad + `observer_deleted` / `supervisor_deleted` / `started_by_deleted`). Waitlist orörd. |
| Radera via webben (`/radera-konto`) | Supportväg när appen inte finns. Samma tombstone. |

Efter radering: ny Apple/Google-inloggning är ett nytt konto, inte recovery av den tombstonade `user_id`.

Inbjudan får **inte** skriva över `display_name` på ett `active`-konto. Namn från inbjudningsformuläret används när en guest-actor skapas. Aktiv user behåller kontots namn; ändring sker på `/konto`.

`/konto` visar identitet (namn, hur man är inloggad, logout, radering). Den visar **inte** om en resa är trial/active/expired.

## 5. App mot webb

Produktkonton skapas bara i iOS- och Android-appen.

| Yta | Skapar produktkonto? |
| --- | --- |
| Native app, Sign in with Apple/Google | Ja |
| `/app` | Produktentré. Visar Apple/Google utan session. Skapar konto via `POST /api/auth/apple\|google`, inte via landningen. |
| `korpasset.se` landning / intresseanmälan | Nej |
| `/onboarding` namnformulär | Nej i betans modell (dev-fallback bakom `ALLOW_GUEST_STUDENT_ONBOARDING`, av i produktion) |
| `/invite/<token>` i vanlig webbläsare | Nej. Ska peka mot appen (Universal Link / App Link), inte bli webb-signup |
| Guest-accept av inbjudan | App/native-beteende. Guest är actor, inte registrering |

Webbläsaren är inte ett alternativt produktregistreringsflöde.

## 6. Vad det inte är

- Inte e-post + lösenord, magic link, OTP eller passkey för elever och handledare.
- Inte två kontotyper (elevkonto / handledarkonto).
- Inte att entitlement, trial eller paywall sitter på `user`.
- Inte auto-merge för att två e-postadresser liknar varandra.
- Inte att `suspended` används i ett produkt-UI i v1 — tillståndet finns och ska enforceras om det sätts.
- Inte native-skal, TestFlight eller Play i den här specen. Kanalen är ändå appen.

## Relaterade dokument

- [ADR-002: Actor/auth separation](../decisions/ADR-002-actor-auth-separation.md)
- [ADR-008: App-only konton](../decisions/ADR-008-app-oauth-accounts.md)
- [Användare, roller och delad progress](users-and-progress.md)
- [Onboarding & handoff](onboarding-handoff.md)
- [Paywall och entitlement-livscykel](entitlement-lifecycle.md) — kommersiell access, inte konto
- [Kravspec FR-10, FR-11](../kravspec.md#5-funktionella-krav)
