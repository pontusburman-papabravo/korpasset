# Produktprinciper

Canonical v1-principer för Körpasset. Dessa är låsta tills ett ADR explicit ändrar dem.

## Elev och handledare

1. **Eleven äger körkortsresan.** `driving_journey` tillhör eleven. Handledare deltar, administrerar inte.
2. **Flera handledare är first-class.** Samma elev, flera supervisors — utan att duplicera data eller byta `user_id`.
3. **Handledaren ska nästan aldrig administrera.** QR/länk ger lågfriktions-handoff. Ingen trafikskoleportal i v1.
4. **Guest actor får finnas innan full autentisering.** Scan → stable `user_id` → delta → claim senare, utan merge. Guest är inte registrering.

## Domän och data

5. **Skill ≠ Context.** Skill = vad eleven utför. Context = under vilka förhållanden.
6. **Observation ≠ Training Focus ≠ Drive Focus.** Tre separata begrepp i datamodellen — se [data model](../domain/data-model.md).
7. **Observationer är append-only** för normal produktkod. Korrigering = ny observation med `supersedes_observation_id`.
8. **Progression är beräknat read model.** Lagras inte som canonical DB-state.
9. **Recommendation logic ligger i kod**, inte som canonical DB-state.

## Produkt och marknad

10. **B2C-first.** Privat övningskörning är wedge. Ingen extern integration krävs för launch.
11. **Körpasset fungerar utan trafikskola och externa API:er.**
12. **Körpasset är inte teoriapp** och **inte AI-trafiklärare**.
13. **Körpasset visar inte falsk precision** som "87 % uppkörningsklar".

## Teknik

14. **Actor ≠ authentication.** `users` är person/actor. `auth_identities` är hur personen autentiseras.
15. **PostgreSQL 15+** som canonical databas — se [ADR-007](../decisions/ADR-007-postgresql-15.md).

## Varumärke och positionering

16. **Produktnamnet är Körpasset.** Huvuddomänen är `korpasset.se`.
17. **Kärnlöftet är "Övningskör med en plan."**
18. **Körpasset äger den praktiska träningsloopen — inte teorin.**
19. **Flera handledare är ett centralt värdeerbjudande.**
20. **Ingen falsk myndighetsassociation.**
21. **Officiella källor får beskrivas korrekt.**
22. **Ingen falsk readiness-precision.**
23. **Produktkonton skapas bara i appen via Apple eller Google.** Ingen e-post/lösenord, magic link eller passkey för elever och handledare. Se [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).
24. **En körkortsresa, ett köp, alla handledare.** Kommersiell access tillhör `driving_journey`, inte `user`. Inget Premium-konto. Vem som betalar spelar ingen roll. Se [användare och progress §8](users-and-progress.md#8-betalning-och-access-tillhör-körkortsresan) och [paywall](entitlement-lifecycle.md).
25. **Två lika viktiga verkligheter.** Familjer som precis ska börja och familjer mitt i resan är first-class. Nybörjaren är inte ett specialfall.
26. **Förälder/handledare får initiera. Eleven äger resan.** Den som hittar Körpasset kan sätta igång och få in eleven. `student_user_id` är ägare. Föräldern blir handledare via inbjudan — aldrig av att skapa barnets resa.
27. **Hjälp att komma ut, inte skuld.** Visa tid sedan senaste passet och föreslå en kort runda. Inga streaks, motivation scores, föräldrakontroll eller påstådd uppkörningsberedskap.
28. **En resa per elev.** Samma vuxna kan vara handledare på flera resor. Access, progression och entitlement blandas inte mellan resor.

Fullständig utläggning: [kravspec](../kravspec.md).

## Relaterade ADR:er

- [ADR-001: Student-owned journey](../decisions/ADR-001-student-owned-journey.md)
- [ADR-002: Actor/auth separation](../decisions/ADR-002-actor-auth-separation.md)
- [ADR-003: Skill/context separation](../decisions/ADR-003-skill-context-separation.md)
- [ADR-004: Append-only observations](../decisions/ADR-004-append-only-observations.md)
- [ADR-005: Observation/focus separation](../decisions/ADR-005-observation-focus-separation.md)
- [ADR-006: B2C-first](../decisions/ADR-006-b2c-first.md)
- [ADR-007: PostgreSQL 15](../decisions/ADR-007-postgresql-15.md)
- [ADR-008: App-only konton via Apple och Google](../decisions/ADR-008-app-oauth-accounts.md)
