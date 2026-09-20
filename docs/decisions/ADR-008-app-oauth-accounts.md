# ADR-008: App-only konton via Apple och Google

**Status:** Accepted  
**Date:** 2026-09-18

## Context

Körpasset ska användas som app, inte som en webbtjänst man skapar konto på. Användare ska inte välja e-post, lösenord, magic link eller passkey. De enda sätten att få ett produktkonto är **Sign in with Apple** och **Sign in with Google** i iOS- och Android-appen.

Det som redan finns på `korpasset.se` (intresseanmälan, legal, waitlist-admin) är inte produktregistrering. Vertical slice skapar idag guest-användare via `/onboarding` och inbjudningslänk — det är utvecklingsfallback, inte betans kontomodell.

App Store kräver Sign in with Apple om någon annan tredjeparts-inloggning (Google) erbjuds. Samma knapp är både första registrering och återkommande inloggning.

## Decision

- **Ingen separat registrering.** Första lyckade Apple- eller Google-inloggningen i appen skapar kontot.
- **Produktkanalen är appen.** iOS (TestFlight → App Store) och Android (Play test track → Play). Capacitor-shell laddar samma origin som idag.
- **`korpasset.se` registrerar inte produktkonton.** Landning, intresseanmälan, legal och waitlist-admin ligger kvar på webben.
- **v1-providers för produktkonton är bara `apple` och `google`.** `passkey` och `email_magic_link` stannar i enum för schema-kompatibilitet men används inte som produkt-auth.
- **Identitetsnyckel är provider `sub`, inte e-post.** Apple Hide My Email och byten av Gmail-adress får inte skapa ett nytt konto eller tysta-merga två personer.
- **Guest är inte ett konto.** Guest får finnas i appen vid QR/länk så handledaren kan delta direkt. Claim sker med Apple eller Google mot samma `user_id` (ADR-002). Eleven skapar körkortsresa först efter Apple/Google.
- **Waitlist-admin** (`admin_users`, e-post + lösenord) är intern personalinloggning, inte användarkonto.

## Flöde

```text
Installera Körpasset
    ↓
Fortsätt med Apple  eller  Fortsätt med Google
    ↓
Appen skickar identity token till servern
    ↓
Servern verifierar token mot Apple/Google
    ↓
Slå upp auth_identities (provider, provider_subject)
    ├─ träff     → session på befintlig user
    └─ ingen träff
          ├─ gästsession i appen → lägg identity på samma user_id, account_state = active
          └─ annars ny user (active) + auth_identity
    ↓
Elev: skapa körkortsresa
Handledare: acceptera inbjudan (om den inte redan är accepterad som gäst)
```

Inbjudan öppnas som Universal Link / App Link in i appen. Webbläsare som träffar `/invite/<token>` ska peka mot appen, inte skapa ett webbkonto.

## Vad som inte ingår

- E-post + lösenord för elever eller handledare
- Magic link, OTP eller passkey som v1-inloggning
- Publik webb-signup eller webb-onboarding som skapar produktkonto
- Automatisk merge av två users för att e-postadresserna råkar likna varandra
- Claim av en Apple/Google-identity som redan sitter på en annan user (fortsatt separat reconciliation, ADR-002)

## Consequences

- Beta Ready kräver fungerande Apple- och Google-inloggning i appen, inte bara session-cookie från namnformulär.
- Integritetspolicy måste nämna Apple och Google som mottagare av inloggningsuppgift när auth byggs.
- Appen måste kunna radera konto inifrån (App Store).
- En user får ha både Apple och Google kopplade; det är frivillig länk, inte auto-merge.
- Display name får fyllas från Apple/Google vid första inloggning och redigeras i appen. E-post, om den kommer med, är metadata för support — inte login-id.
- Nuvarande `/onboarding` som skapar guest-elev är slice-fallback tills OAuth i appen är live.

## Relaterade dokument

- [ADR-002: Actor/auth separation](ADR-002-actor-auth-separation.md)
- [Onboarding & handoff](../product/onboarding-handoff.md)
- [Data model](../domain/data-model.md)
- [Kravspec FR-11](../kravspec.md)
- [Apple Developer App ID](../operations/apple-developer.md) — `se.korpasset.app`, Sign in with Apple som Primary
- [Google Play](../operations/google-play.md) — granskningskonto `korpasset@gmail.com`
