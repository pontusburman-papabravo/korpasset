# Native apps (TestFlight / Play)

Körpasset är en native Capacitor-app som laddar `https://korpasset.se/app`. Produktkonton skapas bara där, via Sign in with Apple och Sign in with Google ([ADR-008](../decisions/ADR-008-app-oauth-accounts.md), FR-11).

Koden i [`native/`](../../native/) är skalet. iOS-arkivering görs på en Mac med Xcode. Android kan byggas i Android Studio.

App ID och SKU: `se.korpasset.app`. Apple Team ID: `PQ7M3B7VW5` (Papa Bravo AB). Detaljer: [apple-developer.md](apple-developer.md), [google-play.md](google-play.md).

## Återanvänd My Starday-kontona

Papa Bravo har redan Apple Developer, App Store Connect, Google Play Console och Google Cloud för **Min Stjärndag** (`se.mystarday.app`). Körpasset ska **inte** skapa nya betalda utvecklarprogram. Det är en andra app under samma team.

| Återanvänd | Skapa nytt för Körpasset |
| --- | --- |
| Apple Developer-team `PQ7M3B7VW5` | App ID `se.korpasset.app` |
| App Store Connect-organisation | Ny app **Körpasset** |
| Sign in with Apple på teamet | Sign in with Apple på Körpassets App ID (Primary, inte grupperad) |
| Google Play Console-utvecklare | Ny app / nytt package `se.korpasset.app` |
| Google Cloud-projekt (eller ett syskonprojekt) | Nya OAuth-klienter: Web, iOS, Android för Körpasset |

Återanvänd **inte** My Stardays bundle id, client id eller Services ID. `aud` på identity token måste vara Körpassets egna klienter, annars avvisar servern inloggningen.

My Starday har Apple på iOS och Google på Android. Körpasset ska ha **båda på båda** — App Store kräver Sign in with Apple när Google erbjuds.

## Vad som redan finns i servern

| Yta | URL |
| --- | --- |
| App-inloggning | `https://korpasset.se/app` |
| Apple/Google continue | `POST /api/auth/apple` och `POST /api/auth/google` |
| Konto + radering | `https://korpasset.se/konto` (konto-UI landar i app-shell) |
| Universal Links | `https://korpasset.se/.well-known/apple-app-site-association` |
| App Links | `https://korpasset.se/.well-known/assetlinks.json` |
| Inbjudan | `https://korpasset.se/invite/<token>` |

Landningen `/` är waitlist, inte signup.

## Env på VPS

Lägg till i `deploy/.env` när developer-konsolerna är klara. Rotera inte `SESSION_SECRET`.

```
APPLE_BUNDLE_ID=se.korpasset.app
APPLE_TEAM_ID=PQ7M3B7VW5
APPLE_CLIENT_ID=se.korpasset.app
APPLE_CLIENT_IDS=se.korpasset.app,se.korpasset.app.android
GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_IDS=<web>,<ios>,<android>
GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=<ios-client-id>.apps.googleusercontent.com
ANDROID_PACKAGE_NAME=se.korpasset.app
ANDROID_SHA256_CERT_FINGERPRINTS=<Play App signing SHA-256>
```

Utan client-id svarar inloggningen 503. Waitlist fortsätter att fungera. `APPLE_TEAM_ID` behövs för att AASA ska innehålla `PQ7M3B7VW5.se.korpasset.app`.

## Apple (en gång, samma team som My Starday)

App ID `se.korpasset.app` är redan registrerad som Explicit + Sign in with Apple (Primary) + Associated Domains. Se [apple-developer.md](apple-developer.md).

1. Team ID är `PQ7M3B7VW5` (samma som Min Stjärndag).
2. För Apple-inloggning på Android: Services ID t.ex. `se.korpasset.app.android` med return URL `https://korpasset.se/app`.
3. App Store Connect: ny app **Körpasset** (inte en ny version av Min Stjärndag). SKU `se.korpasset.app`. **Privacy Policy URL:** `https://korpasset.se/integritet`. Villkor: `https://korpasset.se/villkor`.
4. Bygg på Mac:

```bash
cd native
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

I Xcode: team, associated domains (`applinks:korpasset.se`), Sign in with Apple capability. Archive → TestFlight.

Ikon: `app/public/brand/korpasset-social-1024.png` (1024×1024).

## Google (en gång, samma Play-konto som My Starday)

1. Play Console → skapa appen **Körpasset** (package `se.korpasset.app`). Ingen ny 25-dollarsavgift. Granskning: [google-play.md](google-play.md).
2. Butiksuppgifter → **Webbadress till integritetspolicy:** `https://korpasset.se/integritet` (samma sida som App Store).
3. I Google Cloud: tre OAuth-klienter för Körpasset — Web, iOS (`se.korpasset.app`) och Android (`se.korpasset.app` + SHA-1 från Play App signing för Körpasset, inte My Stjärndag).
4. Web-client-id är `aud` på id-token som servern verifierar. Sätt den i `GOOGLE_WEB_CLIENT_ID` och i Capacitor-init. Kopiera inte My Stardays `GOOGLE_WEB_CLIENT_ID`.
5. SHA-256 från **Körpassets** Play App signing in i `ANDROID_SHA256_CERT_FINGERPRINTS` (kolon-separerad hex). Redeploy så `assetlinks.json` stämmer.
6. Bygg:

```bash
cd native
npm install
npx cap add android
npx cap sync android
npx cap open android
```

Ladda upp AAB till intern/closed test track.

## Store-copy (beta)

- Namn: Körpasset
- Underrubrik: Övningskör med en plan.
- Beskrivning: Körpasset hjälper elev och handledare att välja dagens fokus, följa upp på några sekunder och hålla ihop träningen mellan flera handledare. Gratis under betan.
- Kategori: Education
- Ålder: 4+ (ingen kontroversiell data). Inloggning via Apple/Google.

Sign in with Apple måste finnas när Google finns. Konto ska kunna raderas i appen (`/konto`).
