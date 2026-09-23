# Onboarding & handoff

Design för hur en elev bjuder in handledare utan administration och utan att byta `user_id`.

## Flöde

`/onboarding` frågar först om personen tar körkort eller är handledare/förälder. Det sparar ingen roll på kontot.

**Förälder/handledare får initiera. Eleven äger resan.** Föräldern skickar `/onboarding?som=elev` till den som tar körkort. Eleven skapar `driving_journey`. Föräldern ansluts som handledare via inbjudan. Föräldern skapar inte barnets resa.

Familjer som precis ska börja och familjer mitt i resan är lika first-class. `practice_stage` styr nästa-steg, inte ägarskap.

```text
Förälder hittar Körpasset och väljer handledare
    ↓
Förälder skickar startlänk till eleven
    ↓
Elev fortsätter med Apple eller Google i appen
    ↓
Elev skapar driving_journey (namn + var ni är i övningskörningen)
    ↓
Elev genererar invitation (QR eller länk)
    ↓
Handledare scannar / öppnar länk (Universal Link in i appen)
    ↓
Inloggad Apple/Google-user återanvänds, annars guest actor (stable user_id)
    ↓
Handledare accepterar invitation
    ↓
Handledare blir journey_collaborator (role: supervisor)
    ↓
Handledare deltar i körpass utan att administrera resan
```

Om eleven hittar Körpasset själv:

```text
Elev väljer “Jag tar körkort”
    ↓
Anger namn och var ni är (precis börjat / kört ett tag / nära uppkörning)
    ↓
Skapar driving_journey
    ↓
Bjuder in en eller flera handledare
```

Båda vägarna slutar i samma modell: eleven äger resan, handledare ansluts via inbjudan.

## Observation efter deploy

Se [produkt-events](product-events.md) för funneldefinition och metadata.

| Mått | Signal |
| --- | --- |
| Val av roll i onboarding | `onboarding_role_selected` (`student` / `supervisor`) |
| Eleven öppnade handledarens startlänk | `student_handoff_started` (sidinträde, inte att föräldern kopierade) |
| Elevresa från parent-handoff | `journey_created.event_source = parent_handoff` |
| Direkt elevresa | `journey_created.event_source = direct` |
| Nya resor med handledare | `supervisor_connected` per `journey_id` |
| Practice stage vid skapande | `journey_created.practice_stage` |
| Stale-nudge → körpass | `stale_drive_nudge_shown` sedan `drive_started` inom 48 h |

## Guest actor

En handledare som inte har autentiserat sig än får:

1. En **stable `user_id`** vid första besök (via invitation token)
2. Möjlighet att **delta** i körpass och registrera observations
3. Möjlighet att **claima** identiteten senare med Apple eller Google i appen

Guest är **inte** ett produktkonto. Kontoregistrering sker bara via Sign in with Apple eller Sign in with Google — första lyckade inloggningen skapar `auth_identities` och sätter `account_state = active`. Se [ADR-008](../decisions/ADR-008-app-oauth-accounts.md) och [account lifecycle](account-lifecycle.md).

**Ingen normal guest→registered-process ska kräva merge av `users`.** Samma `user_id` behålls när auth läggs till via `auth_identities`.

## Invitation-säkerhet

| Krav | Implementation |
| --- | --- |
| Token lagras endast hashad | `journey_invitations.token_hash` |
| Expiry | `expires_at` + status `expired` |
| Status | `pending` / `accepted` / `expired` / `revoked` |
| Accepted state | DB CHECK: `status = accepted` kräver `accepted_at` och `accepted_by_user_id` |
| Pending state | DB CHECK: `status = pending` kräver att accept-fält är NULL |
| One-time acceptance | Atomic UPDATE i service layer (se nedan) |
| Replay protection | Unik `token_hash`; exakt en caller vinner race |

### Atomic accept (service layer)

Race condition mellan parallella accept-requests löses med en enda conditional UPDATE — inte med mer modellering:

```sql
UPDATE journey_invitations
SET status = 'accepted',
    accepted_at = now(),
    accepted_by_user_id = $user_id,
    updated_at = now()
WHERE id = $invitation_id
  AND status = 'pending'
  AND expires_at > now()
RETURNING *;
```

Exakt en caller får raden. `RETURNING` tom → invitation redan accepterad, expired eller revoked.

## Constraints

- Eleven får **inte** bjudas in som sin egen handledare (`GET`/`POST /invite/...` ger 403)
- Samma user får **inte** förekomma två gånger i samma journey
- Studenten är **inte** collaborator — `student_user_id` på journey är canonical

En person kan senare vara handledare på flera resor och samtidigt ha en egen elevresa. Roll väljs inte vid registrering. Se [användare och progress](users-and-progress.md).

## Relaterade dokument

- [Användare, roller och delad progress](users-and-progress.md)
- [Data model](../domain/data-model.md) — `journey_invitations`, `journey_collaborators`
- [ADR-002: Actor/auth separation](../decisions/ADR-002-actor-auth-separation.md)
- [ADR-008: App-only konton via Apple och Google](../decisions/ADR-008-app-oauth-accounts.md)
- [ADR-001: Student-owned journey](../decisions/ADR-001-student-owned-journey.md)
- [Produkt-events](product-events.md)
