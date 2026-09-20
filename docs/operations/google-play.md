# Google Play — Körpasset

Android-distribution (Play test track → Play). Produktkonton via Sign in
with Google: [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).
Byggsteg: [native-apps.md](native-apps.md).

Portal: [Play Console](https://play.google.com/console)

## Granskningskonto (klart 2026-09-20)

Play-granskaren kan inte skapa konto. Körpasset har ingen e-post/lösenord —
de ska trycka **Fortsätt med Google**.

Ett konto: `korpasset@gmail.com`. Inget send-as-alias.

Waitlist-admin är `pontus.burman@papabravo.se` på `/admin` — **inte**
recensionsinloggning och inte Gmail-kontot. Ingen 2FA på
`korpasset@gmail.com` — Play-granskaren kan inte klara ett extra steg.
Peka inte MX för `korpasset.se` mot Google; utgående produktmejl går via
Resend (`support@korpasset.se`).

## Play Console — klistra in

### Ny app

| Fält | Värde |
| --- | --- |
| App name | Körpasset |
| Default language | Swedish — sv-SE |
| App or game | App |
| Free or paid | Free |
| Package name | `se.korpasset.app` (samma applicationId som iOS bundle ID) |
| Integritetspolicy | `https://korpasset.se/integritet` |
| Villkor (om fältet finns) | `https://korpasset.se/villkor` |

Ingen ny Play-utvecklaravgift. Samma Papa Bravo-konto som My Starday. Skapa
**inte** en ny version av Min Stjärndag.

### App content → Inloggningsuppgifter

| Fält | Värde |
| --- | --- |
| Är någon del av appen begränsad? | **Ja** när Google-inloggning finns i APK:n, annars **Nej** |
| Användarnamn | `korpasset@gmail.com` |
| Lösenord | lösenordet till det Gmail-kontot (Cursor-secret, inte git) |
| Extra instruktioner | se rutan under |

Välj **Nej** tills APK:n faktiskt har inloggning, annars fastnar granskningen.
Fyll inte i waitlist-admin där.

Klistra in i **Annan information som krävs för åtkomst till appen**
(max 500 tecken, engelska):

```
Sign in with "Fortsätt med Google" using korpasset@gmail.com (fields above). No in-app password. No 2FA, biometrics, membership, location, or QR to open the app. Skip invitation QR. First login creates test data. No payment/codes. Apple is iOS-only. Do not use /admin (staff).
```

## Innehållsklassificering (IARC, klart 2026-09-20)

Kategori i frågeformuläret: **Alla andra apptyper** (inte spel). Körpasset
har inget våld, sex, droger, gambling eller obehagligt språk. Spara de
här betygen:

| Territorium | Organisation | Betyg |
| --- | --- | --- |
| Brasilien | ClassInd | Alla åldrar |
| Nordamerika | ESRB | Ingen åldersgräns |
| Europa | PEGI | PEGI 3 |
| Tyskland | USK | Alla åldrar |
| Övriga världen | IARC Generic | 3-årsgräns |
| Ryssland / Sydkorea | Google Play | 3-årsgräns |

Sydkoreas GRAC-krav för 19+ **spel** gäller inte. App Store-motsvarigheten
är 4+. Målgruppen är övningskörning (ofta 16+), men det är inte
innehållsklassificeringen.

## Cursor Agent-secrets

Bekräftade i environment *pontusburman-papabravo/korpasset* 2026-09-20.
Namnen är exakt som i dashboard — `GMAIL_LOGGIN` är medvetet samma stavning
där, byt inte bara i git.

Gmail-MCP i Cursor är OAuth mot det konto användaren godkänner och läser
**inte** `GMAIL_LOGGIN_PASSWORD`. Senast kopplat MCP: Papa Bravo-lådan
(`info@mystarday.se` / `info@korpasset.se`), inte `korpasset@gmail.com`.

| Name | Typ | Värde |
| --- | --- | --- |
| `GMAIL_LOGGIN` | Environment Variable | `korpasset@gmail.com` |
| `GMAIL_LOGGIN_PASSWORD` | Runtime Secret | Gmail-lösenordet |
| `PLAY_REVIEW_EMAIL` | Environment Variable | `korpasset@gmail.com` |

Äldre namn (`GOOGLE_ACCOUNT_EMAIL`, `GOOGLE_ACCOUNT_PASSWORD`) skapades
inte. `RESEND_API_KEY` och `RESEND_WEBHOOK_SECRET` i samma environment är
produktmejlsnycklar, inte Play-login — se [production.md](production.md).

Lösenordet lämnar inte repo eller chatt.

## Google Cloud OAuth (nästa portalsteg)

Play-granskningskontot räcker inte för Sign in with Google. Skapa **nya**
OAuth-klienter för Körpasset (kopiera inte My Stardays client id):

1. Web — `aud` som backend verifierar.
2. iOS — bundle `se.korpasset.app`.
3. Android — package `se.korpasset.app` + SHA-1 från **Körpassets** Play
   App signing, inte My Starday.

Sätt client-id:n i VPS-env (`GOOGLE_WEB_CLIENT_ID` / `GOOGLE_CLIENT_IDS`)
när native-appen deployas. Utan dem svarar `POST /api/auth/google` 503.

Servern serverar redan `/.well-known/assetlinks.json`. Den är tom tills
`ANDROID_SHA256_CERT_FINGERPRINTS` sätts.

## Legal

Samma sidor som på webben:

| Fält | URL |
| --- | --- |
| Integritetspolicy | `https://korpasset.se/integritet` |
| Användarvillkor | `https://korpasset.se/villkor` |

iOS App ID och App Store Connect: [apple-developer.md](apple-developer.md).
