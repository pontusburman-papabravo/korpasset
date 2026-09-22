# ADR-009: Körpasset säljs per elevs körkortsresa

**Status:** Accepted  
**Date:** 2026-09-22

## Context

Körkortsboken (STR) säljer prepaid tid mot teoriprovet: 48 timmar gratis, sedan 1/3/6/12 månader utan automatisk förnyelse. Körpassets mål är det **praktiska** körprovet. Privat övningskörning kan pågå upp till två år. Ett månadsabonnemang i 24 månader skulle kännas som en extra räkning och riskera uppsägning just när historiken mellan flera handledare blir värdefull.

Körpassets värde sitter i `driving_journey`: samma elev, flera handledare, gemensam historik, nästa fokus. Att ta betalt per user, handledare eller körpass skulle motverka kärnloopen och Second Drive Rate.

## Decision

- **Säljobjektet är elevens körkortsresa.** Ett köp omfattar eleven och alla handledare på den resan.
- **Gratis provperiod:** kärnloopen tills **3 bedömda körpass**, dock längst **30 dagar**, per ny `driving_journey`.
- **Därefter engångsköp** av 6, 12 eller 24 månader. **12 månader är rekommenderat.**
- **Inget månadsabonnemang och ingen automatisk förnyelse.** Ytterligare tid köps som en ny period.
- **Ingen avgift** per handledare, körpass, moment eller färdighet.
- **Samma resa och historik** behålls under köpt period och vid förnyelse.
- **Priserna 349 / 499 / 749 kr är hypoteser** tills ett betalexperiment. De är inte butikspris.
- **Betalning startar inte** bara för att implementationen är klar. Först tillräckligt många aktiva elevresor och signal på First Drive → Second Drive → fortsatt användning.
- **Betalningskanal** följer respektive plattform och marknad (webb och/eller butik). Kanalvalet är implementation, inte säljobjekt.

## Consequences

- Datamodellen för betalning, när den byggs, knyts till `driving_journey` — inte till `users` som prenumerant.
- Flera handledare får inte skapa extra intäkt och inte extra kassaflöde.
- Onboarding och landning får inte lova livstidsfrihet eller publicera hypotespriserna som gällande.
- Beta förblir gratis enligt kravspec §16.
- App Store/Play-regler kan tvinga IAP för digitalt innehåll i appen; det ändrar inte att SKU:t är resan.

## Relaterade dokument

- [Betalmodell](../product/pricing.md)
- [ADR-001: Student-owned journey](ADR-001-student-owned-journey.md)
- [ADR-006: B2C-first](ADR-006-b2c-first.md)
- [Kravspec §16](../kravspec.md#16-beta-validation-och-kommersiell-gate)
