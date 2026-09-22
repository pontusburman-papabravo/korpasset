# MVP v1

v1 är **privat övningskörning för svenskt B-körkort** — inget mer, inget mindre.

## Scope

| Ingår i v1 | Ingår inte i v1 |
| --- | --- |
| Elevägd körkortsresa (`driving_journey`) | Trafikskoleintegration |
| Flera handledare (first-class) | Teori och kunskapsfrågor |
| QR/länk-handoff till handledare | AI-trafiklärare |
| Guest actor innan full autentisering | GPS-telemetri |
| Tap-to-rate efter körpass | Betalning |
| Training Focus och Drive Focus | Progression-UI med falsk precision |
| Append-only observations | Externa API:er (TABS, STR, m.m.) |
| Manuell/automat per resa | E-post/lösenord, magic link eller passkey för användare |
| Native app (Capacitor) med Apple- och Google-konto | Publik webb-signup |

## Produktloopen

```text
Observations
    ↓
Progression Engine
    ↓
Recommendation Engine
    ↓
Training Focus
    ↓
Drive Focus
    ↓
Drive
    ↓
New Observations
```

Tre separata domänbegrepp — se [ADR-005](../decisions/ADR-005-observation-focus-separation.md):

| Begrepp | Fråga |
| --- | --- |
| **Observation** | Vad visade eleven att hen kunde? |
| **Training Focus** | Vad bör eleven träna på framåt? |
| **Drive Focus** | Vad avsåg just detta körpass att träna? |

## Assessment levels

| Nivå | Betydelse |
| --- | --- |
| `needs_help` | Handledaren måste ingripa eller instruera aktivt |
| `with_support` | Eleven klarar momentet med viss guidning eller påminnelse |
| `independent` | Eleven utför momentet självständigt och säkert |

## Context (inte skills)

Environment, ljus, väder och trafik är **context** — inte skills. Se [ADR-003](../decisions/ADR-003-skill-context-separation.md).

## Transmission scope

Varje `driving_journey` anger om resan är `unknown`, `manual` eller `automatic_only`. Skills som `car_control_gear_shifting` behandlas som `not_applicable` vid `automatic_only` — i progression, inte genom att ta bort skillen.

## Första end-to-end-flödet (nästa PR)

1. Elev fortsätter med Apple eller Google i appen och skapar journey
2. Elev delar QR/länk
3. Handledare (guest eller befintlig user) accepterar
4. Elev och handledare planerar Drive Focus
5. Körpass genomförs
6. Handledare registrerar observations
7. System föreslår Training Focus (recommendation engine i kod)

## Relaterade dokument

- [Vision](vision.md)
- [Produktprinciper](product-principles.md)
- [Data model](../domain/data-model.md)
- [ADR-008: App-only konton](../decisions/ADR-008-app-oauth-accounts.md)
- [ADR-009: Resan är säljobjektet](../decisions/ADR-009-journey-priced.md)
- [Betalmodell](pricing.md)
- [Skill Taxonomy v1](../domain/skill-taxonomy.md)
