# Google Play — Körpasset

Android-distribution (Play test track → Play). Produktkonton via Sign in
with Google: [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).

Portal: [Play Console](https://play.google.com/console)

## Granskningskonto (klart 2026-09-20)

Play-granskaren kan inte skapa konto. Körpasset har ingen e-post/lösenord —
de ska trycka **Fortsätt med Google**.

`review@korpasset.se` är avsett send-as-alias (samma mönster som
`info@mystarday.se`). Google-inloggning använder det **primära** Gmail-kontot.

| Roll | Adress |
| --- | --- |
| Google-konto (logga in) | `korpasset@gmail.com` |
| Alias (skicka som) | `review@korpasset.se` |

`korpasset@gmail.com` är bekräftat i Cursor-miljön. Alias-adressen är
avsändarmönstret, inte Google-login och inte värdet i `PLAY_REVIEW_EMAIL`
just nu.

Waitlist-admin (`/admin`) är **inte** recensionsinloggning. Ingen 2FA på
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
| Extra instruktioner | `Logga in med Google. Använd kontot ovan. Första inloggningen skapar testdata. Ingen betalning, inga koder. Apple-inloggning finns bara på iOS.` |

Välj **Nej** tills APK:n faktiskt har inloggning, annars fastnar granskningen.
Fyll inte i waitlist-admin där.

## Cursor Agent-secrets

Bekräftade i environment *pontusburman-papabravo/korpasset* 2026-09-20.
Namnen är exakt som i dashboard — `GMAIL_LOGGIN` är medvetet samma stavning
där, byt inte bara i git.

Samma lösenord som Gmail-kontot. Inte per alias. Gmail-MCP i Cursor är OAuth
mot det konto användaren godkänner och läser **inte**
`GMAIL_LOGGIN_PASSWORD`. Senast kopplat MCP: Papa Bravo-lådan
(`info@mystarday.se` / `info@korpasset.se`), inte `korpasset@gmail.com`.

| Name | Typ | Värde |
| --- | --- | --- |
| `GMAIL_LOGGIN` | Environment Variable | `korpasset@gmail.com` |
| `GMAIL_LOGGIN_PASSWORD` | Runtime Secret | Gmail-lösenordet |
| `PLAY_REVIEW_EMAIL` | Environment Variable | `korpasset@gmail.com` (samma som inloggning) |

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

## Legal

Samma sidor som på webben:

| Fält | URL |
| --- | --- |
| Integritetspolicy | `https://korpasset.se/integritet` |
| Användarvillkor | `https://korpasset.se/villkor` |

iOS App ID och App Store Connect: [apple-developer.md](apple-developer.md).
