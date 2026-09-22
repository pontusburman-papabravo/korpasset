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
- Server-to-server notification endpoint för Sign in with Apple

Wildcard går inte: Sign in with Apple och Associated Domains kräver Explicit App ID.

### Sign in with Apple — varför Primary

Körpasset är första (och enda) iOS-appen i den här gruppen. Gruppera **inte** med My Starday (`se.mystarday.app`). Användare ska ge samtycke till Körpasset separat.

Server-to-server-URL lämnades tom. Apple skickar JWT:er dit när någon ändrar Hide My Email, tar bort appen eller raderar sitt Apple-konto. Endpointen finns inte i Körpasset ännu — fyll inte i en URL som 404:ar. Reserverad sökväg när webhooken byggs:

`https://korpasset.se/api/apple/notifications`

TLS 1.2+, absolut HTTPS, ett URL per app-grupp. Sätts senare genom att redigera App ID:n.

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
`.p8` behövs för det. Nyckeln behövs först för client secret (Apple på
Android/webb) och för REST-anrop som token-revoke.

Servern serverar `/.well-known/apple-app-site-association`. Med
`APPLE_TEAM_ID=PQ7M3B7VW5` blir `appID` `PQ7M3B7VW5.se.korpasset.app`.

## Inte klart än

Ordning efter App Store Connect-appen:

1. **Google OAuth-klienter** för Körpasset — se [google-play.md](google-play.md). Blockerar Sign in with Google.
2. **Keys** (när Apple behövs på Android eller för revoke) — Developer → Keys → Sign in with Apple. Namn t.ex. `Körpasset Sign in with Apple`, koppla till App ID **Korpasset**. Ladda ner `.p8` en gång. Cursor runtime secrets (när den skapas): `APPLE_KEY_ID` + `APPLE_PRIVATE_KEY`. Filen lämnar inte git.
3. **Services ID** `se.korpasset.app.android` — bara för Apple-inloggning på Android, Return URL `https://korpasset.se/app`. Inte `se.mystarday.*`.
4. **Associated Domains** — `applinks:korpasset.se` och `webcredentials:korpasset.se` i [`native/ios/App/App/App.entitlements`](../../native/ios/App/App/App.entitlements). Bekräfta capability i Xcode mot teamet.
5. **`APPLE_CLIENT_ID` / `APPLE_TEAM_ID` i `deploy/.env`** så live AASA och token-verify stämmer.
6. **TestFlight** när första iOS-bygget finns.
7. **Apple-webhook** mot `https://korpasset.se/api/apple/notifications` — endpointen finns. Fyll i URL:en på App ID:n **efter** deploy. `consent-revoked` tar bort Apple-identity; `account-delete` tombstonar. Okänd `sub` svarar 200.

Push och betalning ingår inte i första betan.

Android / Play: [google-play.md](google-play.md).
