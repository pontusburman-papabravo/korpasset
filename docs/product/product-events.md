# Produkt-events

Server-side observation i tabellen `product_events`. Inga namn, e-post, fritext eller invite-copy.

## Modell

| Kolumn | Innehåll |
| --- | --- |
| `event_name` | Kanoniskt eventnamn |
| `journey_id` | Opaque journey, NULL innan resan finns |
| `user_id` | Opaque actor om session finns |
| `actor_role` | `student` / `supervisor` |
| `supervisor_count` | Antal aktiva handledare när det är relevant |
| `focus_skill_count` | Antal Drive Focus-skills |
| `event_source` | `direct` / `parent_handoff` när källa behövs |
| `practice_stage` | `unknown` / `just_started` / `building` / `near_test` vid skapande eller nudge |
| `days_since_drive_bucket` | `5-7` / `8-14` / `15-30` / `31+` |
| `created_at` | Tidpunkt |

Admin-statistik räknar fortfarande från **domäntabeller**, inte härifrån.

## Events före #51/#52-observationen

`journey_created`, `supervisor_connected`, `drive_focus_saved`, `drive_started`, `drive_completed`, `rating_completed`, `recap_viewed`, `second_drive_completed`.

Skrivs från journeys, invitations, drives och recap. Ingen `event_source`, ingen `practice_stage` på eventet.

## Events tillagda för handoff-observation

| Event | När | Metadata |
| --- | --- | --- |
| `onboarding_role_selected` | GET `/onboarding?som=elev` (utan handoff) eller `?som=handledare` | `actor_role`, `event_source=direct` för elevval, `user_id` om session |
| `student_handoff_started` | GET `/onboarding?som=elev&via=handledare` | `event_source=parent_handoff`, `actor_role=student` |
| `stale_drive_nudge_shown` | Journey-hem visar stale-nudge | `journey_id`, `days_since_drive_bucket`, `practice_stage`, `actor_role` |

`journey_created` utökas — inte dupliceras — med `event_source` och `practice_stage`.

Återanvänds oförändrade: `supervisor_connected`, `drive_started`, `drive_completed`.

Parent-handoff markeras med query `via=handledare` på handledarens startlänk och en kortlivad HttpOnly-cookie `korpasset_handoff=parent` som läses vid `POST /start`. Ingen unik tracking-token.

## Parent handoff funnel

```text
1. onboarding_role_selected(role=supervisor)
2. student_handoff_started
3. journey_created(source=parent_handoff)
4. supervisor_connected
5. drive_started  (första körpasset)
```

Senare beräkningar (SQL mot events + domän, ingen funnelmotor här):

- supervisor-role → handoff rate = `student_handoff_started` / `onboarding_role_selected` där `actor_role=supervisor`
- handoff → journey-created = `journey_created` där `event_source=parent_handoff` / `student_handoff_started`
- journey-created → supervisor-connected = journeys med `supervisor_connected` / `journey_created` (per `journey_id`)
- journey-created → first-drive = journeys med `drive_started` / `journey_created` (per `journey_id`)
- median tid journey-created → first-drive = `min(drive_started.created_at) - journey_created.created_at` per journey

`onboarding_role_selected` och `student_handoff_started` är ofta olika enheter. Rate är volymkvot, inte user-join.

## Practice stage

Fördelning vid skapande: `journey_created.practice_stage`.

Aktuell fördelning (kan ha ändrats efter start): `driving_journeys.practice_stage`.

Ingen ranking.

## Stale drive

```text
stale_drive_nudge_shown
→ drive_started på samma journey_id
  inom 48 timmar efter första shown efter senaste avslutade pass
```

Impressioner kan upprepas vid varje besök på hemmet medan nudgen syns. Analys ska använda första `stale_drive_nudge_shown` efter senaste `drive_completed`. Conversion är ett analysmått, inte runtime-logik.
