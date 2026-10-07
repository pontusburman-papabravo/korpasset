# Apple Developer — Körpasset App ID

Registrerade identifierare för iOS-appen (Capacitor-shell, TestFlight → App Store).
Produktkonton via Sign in with Apple: [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).
Byggsteg: [native-apps.md](native-apps.md).

Portal: [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)

## Team

| Fält | Värde |
| --- | --- |
| Konto | Papa Bravo AB |
| Team ID / App ID Prefix | `PQ7M3B7VW5` |

Samma Apple Developer-team används av My Starday. Blanda inte identifierare mellan produkterna.

## App ID (klart 2026-09-20)

| Fält | Värde |
| --- | --- |
| Name / Description | Korpasset |
| Bundle ID | `se.korpasset.app` |
| Typ | Explicit (inte Wildcard) |
| Platform | Standard App ID (iOS, iPadOS, …) |

Bundle ID:n är canonical. Använd exakt `se.korpasset.app` i Xcode/Capacitor, App Store Connect och `apple-app-site-association`.

### Capabilities

Påslaget:

| Capability | Konfiguration |
| --- | --- |
| Sign In with Apple | **Primary App ID** (inte grupperad med annan app) |
| Associated Domains | På, för Universal Links på inbjudningar |

Inte påslaget (kan läggas till senare på samma App ID):

- Push Notifications
- In-App Purchase, Apple Pay, iCloud, HealthKit, NFC, App Groups, Wallet

Server-to-server notification endpoint ska sättas manuellt. Se nedan.

Wildcard går inte: Sign in with Apple och Associated Domains kräver Explicit App ID.

### Sign in with Apple — varför Primary

Körpasset är första (och enda) iOS-appen i den här gruppen. Gruppera **inte** med My Starday (`se.mystarday.app`). Användare ska ge samtycke till Körpasset separat.

Server-to-server-URL lämnades tom när App ID:t skapades. Endpointen finns och verifierar Apples JWT mot `https://appleid.apple.com/auth/keys` (`iss` `https://appleid.apple.com`, `aud` = bundle ID). Osignerade payload:er avvisas. `account-delete` tombstonar kontot. `consent-revoked` tar bort Apple-identity och tombstonar om ingen annan provider finns kvar. Finns en sparad refresh token körs revoke innan den raden tas bort. Okänd `sub` svarar 200.

Sätt URL:en manuellt, efter att revisionen med revoke är deployad:

`https://korpasset.se/api/apple/notifications`

## Identifierare som inte är Körpasset

Samma lista i portalen innehåller My Starday. Rör dem inte från Körpasset-arbete:

| Name | Identifier |
| --- | --- |
| My Starday App | `se.mystarday.app` |
| XC se mystarday app WidgetRoutine | `se.mystarday.app.WidgetRoutine` |

## App Store Connect — New App

Portal: [Apps](https://appstoreconnect.apple.com/apps)

| Fält | Värde |
| --- | --- |
| Platforms | **iOS** (inte macOS, tvOS, visionOS) |
| Name | Körpasset |
| Primary Language | Swedish |
| Bundle ID | Korpasset — `se.korpasset.app` |
| SKU | `se.korpasset.app` |
| User Access | Full Access |

SKU syns inte för användare. Den måste vara unik i Papa Bravo-kontot och går inte att byta. Samma sträng som bundle ID undviker krock med My Starday.

Privacy Policy URL i App Store Connect: `https://korpasset.se/integritet`.
Villkor: `https://korpasset.se/villkor`.

## VPS-env när native-appen deployas

Team ID är publikt. Sätt i `deploy/.env` (rotera inte `SESSION_SECRET`):

```
APPLE_BUNDLE_ID=se.korpasset.app
APPLE_TEAM_ID=PQ7M3B7VW5
APPLE_CLIENT_ID=se.korpasset.app
```

iOS identity tokens verifieras mot Apples JWKS (`aud` = bundle ID). Ingen
`.p8` behövs för det. Nyckeln behövs för client secret när servern växlar
authorization code och när den revokar refresh token. `client_id` i de
anropen är App ID:t `se.korpasset.app` (`APPLE_BUNDLE_ID`), samma värde
som native Sign in with Apple använder. Det är inte Services ID:t.

Servern serverar `/.well-known/apple-app-site-association`. Med
`APPLE_TEAM_ID=PQ7M3B7VW5` blir `appID` `PQ7M3B7VW5.se.korpasset.app`.

## Inte klart än

Ordning efter App Store Connect-appen:

1. **Google OAuth-klienter** för Körpasset — se [google-play.md](google-play.md). Blockerar Sign in with Google.
2. **Sign in with Apple-nyckel** — krävs innan revoke kan köras i produktion. Steg nedan. `.p8` lämnar inte git.
3. **Services ID** `se.korpasset.app.android` — bara för Apple-inloggning på Android, Return URL `https://korpasset.se/app`. Inte `se.mystarday.*`.
4. **Associated Domains och Sign in with Apple** — `applinks:korpasset.se`, `webcredentials:korpasset.se` och `com.apple.developer.applesignin` i [`native/ios/App/App/App.entitlements`](../../native/ios/App/App/App.entitlements). Bekräfta capability i Xcode mot teamet. Ett bygge utan entitlement får `ASAuthorizationError` 1000 direkt, utan Apple-ruta.
5. **`APPLE_CLIENT_ID` / `APPLE_TEAM_ID` i `deploy/.env`** så live AASA och token-verify stämmer.
6. **TestFlight** när första iOS-bygget finns.
7. **Apple-webhook** — fyll i URL:en på App ID:n efter deploy. Steg nedan.

Push och betalning ingår inte i första betan.

## Sign in with Apple-nyckel (manuellt)

Portal: [Keys](https://developer.apple.com/account/resources/authkeys/list)

Apple beskriver nyckeln i [Create a Sign in with Apple private key](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key).

1. Logga in på Apple Developer med Papa Bravo-teamet. Team ID är `PQ7M3B7VW5`.
2. Certificates, Identifiers & Profiles → Keys → lägg till en nyckel.
3. Namn, till exempel `Körpasset Sign in with Apple`.
4. Slå på **Sign in with Apple**. Configure. Välj Primary App ID **Korpasset** (`se.korpasset.app`). Välj inte My Starday.
5. Register. Ladda ner `.p8` direkt. Apple tillåter nedladdningen en gång. Filnamnet är `AuthKey_<KeyID>.p8`.
6. Key ID (10 tecken) på nyckelsidan → `APPLE_KEY_ID` i `deploy/.env`.
7. Innehållet i `.p8` → `APPLE_PRIVATE_KEY`. Radbrytningar får skrivas som `\n`. Skriv aldrig nyckeln i git, loggar, ärenden eller frontend.
8. `APPLE_TEAM_ID=PQ7M3B7VW5` och `APPLE_BUNDLE_ID=se.korpasset.app` ska redan stämma. `APPLE_CLIENT_ID` för identity-token är samma bundle ID.

Client secret mintas på servern (ES256, `kid` = Key ID, `iss` = Team ID, `sub` = `se.korpasset.app`, `aud` = `https://appleid.apple.com`). Apple avvisar `exp` mer än 15777000 sekunder framåt. Körpasset använder 300 sekunder per anrop.

Utan nyckeln går Apple-inloggning via identity token fortfarande. Ingen refresh token sparas. Radering av ett konto som redan har en refresh token avbryts (503) tills nyckeln finns. Revoke blir inte en tyst no-op.

## Server-to-server URL (manuellt)

Portal: [Identifiers](https://developer.apple.com/account/resources/identifiers/list)

1. Identifiers → App IDs → **Korpasset** (`se.korpasset.app`).
2. Sign In with Apple → Configure / Edit.
3. Server to Server Notification Endpoint: `https://korpasset.se/api/apple/notifications`
4. Spara.

Gör det efter att revisionen med revoke är deployad. Endpointen finns redan på `main` och verifierar signaturen. Innan revoke-revisionen är live tombstonar en notis lokalt utan Apple-revoke, vilket är ofarligt så länge inga refresh tokens finns sparade.

## Revoke vid kontoradering

Ordning när Apple-identity har `apple_refresh_token`:

1. `POST https://appleid.apple.com/auth/revoke` med `client_id`, `client_secret`, `token` och `token_type_hint=refresh_token`.
2. HTTP 200 (Apple: token revokad eller redan ogiltig) → lokal tombstone, identity och token försvinner.
3. HTTP 400 `invalid_grant` → token är redan ogiltig. Lokal radering fortsätter. Gränssnittet påstår inte att en ny revoke lyckades.
4. Annan HTTP 400, nätverksfel eller 5xx → kontot finns kvar, token finns kvar, användaren kan försöka igen.
5. Saknad nyckel när token finns → samma sak, 503, ingen radering.

Saknas refresh token raderas kontot ändå. Det gäller äldre Apple-konton och konton där code-växlingen inte kunde sparas. Ingen falsk “revoke succeeded”. Bekräftelsen säger att Apple-inloggningen inte kunde återkallas automatiskt och hur man tar bort appen under Logga in med Apple.

Authorization code växlas vid inloggning mot `POST https://appleid.apple.com/auth/token` (`grant_type=authorization_code`). Native iOS skickar ingen `redirect_uri`, så det fältet utelämnas. iOS 1.0 (6) med `@capgo/capacitor-social-login` 8.5.10 lämnar koden i `accessToken.token` när `useProperTokenExchange` är false, vilket är det läge appen initierar. Webbskriptet läser den koden. Ingen ny iOS-binär krävs för det.

Android / Play: [google-play.md](google-play.md).
