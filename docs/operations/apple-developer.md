# Apple Developer — Körpasset App ID

Registrerade identifierare för iOS-appen (Capacitor-shell, TestFlight → App Store).
Produktkonton via Sign in with Apple: [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).

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

## Inte klart än

Ordning efter App Store Connect-appen:

1. **Keys** — Sign in with Apple-nyckel så backend kan verifiera identity token. Private key och `.p8` lämnar inte repo.
2. **Services ID** (t.ex. `se.korpasset.app.signin`) — bara om webb-/serverflöde mot Apple behövs, med Return URL på `https://korpasset.se/…`.
3. **Associated Domains i appen** — `applinks:korpasset.se`.
4. **`/.well-known/apple-app-site-association`** på `korpasset.se` så `/invite/<token>` öppnar appen.
5. **TestFlight** när första iOS-bygget finns.
6. **Apple-webhook** mot `https://korpasset.se/api/apple/notifications` (konto-radering / Apple-events).

Push och betalning ingår inte i första betan.
