# ADR-001: Student-owned journey

**Status:** Accepted  
**Date:** 2026-09-15

## Context

Körpasset är en B2C-app för privat övningskörning. Eleven är den som driver körkortsresan. Handledare deltar men ska nästan aldrig administrera.

## Decision

- `driving_journeys.student_user_id` är canonical student
- Studenten är **inte** duplicerad som `journey_collaborator`
- All journey-data (drives, observations, focus) tillhör journey — och därmed eleven
- Flera handledare deltar via `journey_collaborators` utan att äga resan

## Consequences

- Invitation och onboarding designas från elevens perspektiv
- Progression och recommendations beräknas per journey (elev)
- Handledare kan lämnas/ersättas utan att data flyttas

## Relaterade dokument

- [Vision](../product/vision.md)
- [Onboarding & handoff](../product/onboarding-handoff.md)
- [Användare, roller och delad progress](../product/users-and-progress.md)
