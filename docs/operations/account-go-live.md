# Account go-live (Fas 8)

Checklista innan extern beta med Apple/Google i appen. Waitlist och `/admin` får fortsätta utan OAuth-env — processen ska starta — men **produktinloggning** är 503 tills client-id är satta.

Ingen paywall. Ingen e-post/lösenord. Identity-nyckel är `(provider, provider_subject)`.

## Env på VPS (`deploy/.env`)

Sätt utan att rotera `POSTGRES_PASSWORD` eller `SESSION_SECRET`.

| Variabel | Klart när |
| --- | --- |
| `APPLE_BUNDLE_ID=se.korpasset.app` | Alltid |
| `APPLE_TEAM_ID=PQ7M3B7VW5` | AASA `appID` är `PQ7M3B7VW5.se.korpasset.app` |
| `APPLE_CLIENT_ID` / `APPLE_CLIENT_IDS` | `POST /api/auth/apple` inte 503 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_IDS` | `POST /api/auth/google` inte 503 |
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_IOS_CLIENT_ID` | Capacitor SocialLogin init. Riktiga `*.apps.googleusercontent.com` — inte `<…>`-placeholders. iOS kräver också Info.plist `GIDClientID` + reversed URL-scheme och TestFlight-ombyggnad. |
| `ANDROID_PACKAGE_NAME=se.korpasset.app` | App Links package |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | Play App Signing SHA-256, kolon-hex. `assetlinks.json` inte `[]` |
| `ALLOW_GUEST_STUDENT_ONBOARDING` | **Inte** `true` i produktion |

`assertProductionConfig` kräver `DATABASE_URL`, `SESSION_SECRET` (≥32, inte default) och https-`APP_BASE_URL`. Den kräver **inte** Apple/Google — medvetet, så waitlist överlever. Saknas client-id loggas en varning vid start.

## Live-koll efter redeploy

```bash
curl -sS https://korpasset.se/health
curl -sS -D- https://korpasset.se/app | head
curl -sS https://korpasset.se/.well-known/apple-app-site-association
curl -sS https://korpasset.se/.well-known/assetlinks.json
```

Förvänta:

- `/app`: `noindex`, `viewport-fit=cover`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy`, `Strict-Transport-Security`
- AASA: paths `/invite/*`, `/app`, `/onboarding`, `/konto`
- assetlinks: package `se.korpasset.app` + SHA-256 (inte tom lista)
- `ALLOW_GUEST_STUDENT_ONBOARDING` av: anonym `/onboarding` visar Apple/Google, inte namnformulär som skapar guest-elev

## Apple Developer

1. Associated Domains i Xcode mot `App.entitlements`.
2. Sign in with Apple capability (Primary).
3. Server-to-server URL på App ID:n: `https://korpasset.se/api/apple/notifications` — **efter** den här endpointen är live. `consent-revoked` tar bort Apple-identity (tombstone om det var sista inloggningen). `account-delete` tombstonar kontot. Okänd `sub` → 200.
4. TestFlight-bygge med `se.korpasset.app`.

## Google Play

1. OAuth-klienter Web + iOS + Android för Körpasset, inte My Starday.
2. Intern/closed test track. SHA-256 från **Körpassets** Play App Signing in i env.
3. Integritetspolicy `https://korpasset.se/integritet`. Konto-radering i appen (`/konto`) och på webben (`/radera-konto`).

## Manuell röktest i appen (inte CI)

På en riktig enhet, före extern beta:

1. Fortsätt med Apple → skapar konto, `/onboarding`.
2. Logga ut, Fortsätt med Apple igen → samma user.
3. Koppla Google på `/konto`.
4. Fortsätt med Google på ny install → samma user.
5. Elev bjuder in → Universal/App Link `/invite/<token>` öppnar appen, gäst eller inloggad accept, claim behåller `user_id`.
6. Radera konto i appen → ny Apple-inloggning är ett nytt konto.
7. Collision: samma Apple på annan session → 409, ingen merge.

## Säkerhet som redan är på

- Identity token: JWKS-signatur, issuer, audience, `exp`, valfri nonce (klienten skickar nonce).
- OAuth 10 försök / 15 min per IP. 409 vid identity på annan user. 503 utan client-id.
- Session: HttpOnly, SameSite=Lax, Secure på https. `suspended`/`deleted` rensar cookie.
- `identityToken` och Apple-notis-`payload` redakteras i loggar.
- Guest-elev via `/start` av i produktion.

Detaljer: [production.md](production.md), [native-apps.md](native-apps.md), [apple-developer.md](apple-developer.md), [google-play.md](google-play.md), [account-lifecycle.md](../product/account-lifecycle.md).
