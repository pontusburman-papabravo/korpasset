# Google Play — Körpasset

Android-distribution (Play test track → Play). Produktkonton via Sign in
with Google: [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).

Portal: [Play Console](https://play.google.com/console)

## Granskningskonto

Play-granskaren kan inte skapa konto. Körpasset har ingen e-post/lösenord —
de ska trycka **Fortsätt med Google**.

`review@korpasset.se` är alias (samma mönster som `info@mystarday.se`).
Google-inloggning använder det **primära** Gmail-kontot.

| Roll | Adress |
| --- | --- |
| Google-konto (logga in) | `korpasset@gmail.com` |
| Alias (skicka som) | `review@korpasset.se` |

I Play Console → App content → Inloggningsuppgifter:

| Fält | Värde |
| --- | --- |
| Är någon del av appen begränsad? | **Ja** (när Google-inloggning finns i APK:n) |
| Användarnamn | `korpasset@gmail.com` |
| Lösenord | lösenordet till det Gmail-kontot (inte i git) |
| Extra instruktioner | `Logga in med Google. Använd kontot ovan. Första inloggningen skapar testdata. Ingen betalning, inga koder. Apple-inloggning finns bara på iOS.` |

Välj **Nej** tills APK:n faktiskt har inloggning, annars fastnar granskningen.

## Cursor Agent-secrets

Samma lösenord som Gmail-kontot. Inte per alias. Gmail-MCP i Cursor är OAuth
och läser inte den här secreten.

| Name | Typ | Värde |
| --- | --- | --- |
| `GOOGLE_ACCOUNT_EMAIL` | Environment Variable | `korpasset@gmail.com` |
| `GOOGLE_ACCOUNT_PASSWORD` | Runtime Secret | Gmail-lösenordet |
| `PLAY_REVIEW_EMAIL` | Environment Variable | `review@korpasset.se` |

Lösenordet lämnar inte repo eller chatt.

## Legal

Samma sidor som på webben:

| Fält | URL |
| --- | --- |
| Integritetspolicy | `https://korpasset.se/integritet` |
| Användarvillkor | `https://korpasset.se/villkor` |

iOS App ID och App Store Connect: [apple-developer.md](apple-developer.md).
