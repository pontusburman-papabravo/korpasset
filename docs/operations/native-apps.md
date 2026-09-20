# Native apps (TestFlight / Play)

Körpasset är en native Capacitor-app som laddar `https://korpasset.se/app`. Produktkonton skapas bara där, via Sign in with Apple och Sign in with Google ([ADR-008](../decisions/ADR-008-app-oauth-accounts.md), FR-11).

Koden i [`native/`](../../native/) är skalet. iOS-arkivering görs på en Mac med Xcode. Android kan byggas i Android Studio.

## Vad som redan finns i servern

| Yta | URL |
| --- | --- |
| App-inloggning | `https://korpasset.se/app` |
| Apple/Google continue | `POST /api/auth/apple` och `POST /api/auth/google` |
| Konto + radering | `https://korpasset.se/konto` |
| Universal Links | `https://korpasset.se/.well-known/apple-app-site-association` |
| App Links | `https://korpasset.se/.well-known/assetlinks.json` |
| Inbjudan | `https://korpasset.se/invite/<token>` |

Landningen `/` är waitlist, inte signup.

## Env på VPS

Lägg till i `deploy/.env` när developer-konsolerna är klara. Rotera inte `SESSION_SECRET`.

```
APPLE_BUNDLE_ID=se.korpasset.app
APPLE_TEAM_ID=<10-teckens Apple Team ID>
APPLE_CLIENT_ID=se.korpasset.app
APPLE_CLIENT_IDS=se.korpasset.app,se.korpasset.app.android
GOOGLE_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_IDS=<web>,<ios>,<android>
GOOGLE_WEB_CLIENT_ID=<web-client-id>.apps.googleusercontent.com
GOOGLE_IOS_CLIENT_ID=<ios-client-id>.apps.googleusercontent.com
ANDROID_PACKAGE_NAME=se.korpasset.app
ANDROID_SHA256_CERT_FINGERPRINTS=<Play App signing SHA-256>
```

Utan client-id svarar inloggningen 503. Waitlist fortsätter att fungera.

## Apple (en gång)

1. Apple Developer Program.
2. App ID `se.korpasset.app` med Sign in with Apple och Associated Domains (`applinks:korpasset.se`).
3. För Android-Apple: Services ID t.ex. `se.korpasset.app.android` med return URL `https://korpasset.se/app`.
4. App Store Connect: app **Körpasset**, privacy policy `https://korpasset.se/integritet`, terms `https://korpasset.se/villkor`.
5. Bygg på Mac:

```bash
cd native
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
```

I Xcode: team, associated domains, Sign in with Apple capability. Archive → TestFlight.

Ikon: `app/public/brand/korpasset-social-1024.png` (1024×1024).

## Google (en gång)

1. Google Play Console (engångsavgift) + Google Cloud-projekt.
2. OAuth-klienter: Web, iOS (`se.korpasset.app`) och Android (`se.korpasset.app` + SHA-1 från Play App signing).
3. Web-client-id är `aud` på id-token som servern verifierar. Sätt den i `GOOGLE_WEB_CLIENT_ID` och i Capacitor-init.
4. SHA-256 från Play App signing in i `ANDROID_SHA256_CERT_FINGERPRINTS` (kolon-separerad hex). Redeploy så `assetlinks.json` stämmer.
5. Bygg:

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

Sign in with Apple måste finnas när Google finns. Konto ska kunna raderas i appen (`/konto`) — det är redan byggt.
