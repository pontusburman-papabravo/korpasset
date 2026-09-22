# Betalmodell

**Status:** Canonical modell. Priserna är hypoteser tills betalexperimentet.  
**Datum:** 2026-09-22

Körpasset säljs **per elevs körkortsresa**, inte per användare, handledare eller körpass.

Ett köp omfattar eleven och alla elevens handledare.

Målet är det praktiska körprovet — inte teoriprovet. Därför säljs tid på resan, inte månader som ett löpande abonnemang.

Canonical beslut: [ADR-009](../decisions/ADR-009-journey-priced.md).

## Gratis provperiod

En ny elevresa får använda Körpassets kärnloop gratis tills **3 bedömda körpass** har genomförts, dock längst **30 dagar**.

Syftet är att familjen ska hinna uppleva hela kärnloopen:

> **Vad tränar vi idag? → Hur gick det? → Vad tränar vi nästa gång?**

Provperioden räknas på `driving_journey`. Handledare som ansluter senare delar samma gratisfönster — de skapar inte en ny provperiod.

Ett bedömt körpass är ett completed drive med handledarbedömning (kärnloopen genom `rating_completed`).

## Betalda perioder

Efter provperioden kan familjen köpa Körpasset som ett **engångsköp utan automatisk förnyelse**.

| Period | Preliminärt pris | Positionering |
| --- | ---: | --- |
| **6 månader** | **349 kr** | För familjer som redan är igång och vill få struktur på slutdelen av övningskörningen |
| **12 månader** | **499 kr** | **Rekommenderat** – för de flesta körkortsresor |
| **24 månader** | **749 kr** | Hela resan – för den som börjar tidigt och vill använda Körpasset hela vägen |

Priserna är **hypoteser och inte slutligt beslutade** före betalexperimentet.

De får inte publiceras på `korpasset.se` eller i butikstexter som gällande pris innan experimentet.

## Kommersiella principer

- Inget månadsabonnemang.
- Ingen automatisk förnyelse.
- Ingen avgift per handledare.
- Ingen avgift per körpass.
- Ingen betalvägg per moment eller färdighet.
- Eleven behåller samma körkortsresa och historik under hela den köpta perioden.
- När perioden löper ut kan familjen köpa ytterligare tid.
- Betalningskanal implementeras enligt reglerna för respektive plattform och marknad.

## Betalstart

Betalning aktiveras inte enbart för att den tekniskt är färdig.

Före betalexperimentet ska Körpasset ha tillräckligt många aktiva elevresor för att kunna bedöma framför allt:

> **First Drive → Second Drive → fortsatt användning**

Den viktigaste signalen är att familjer faktiskt återkommer till nästa körpass och får värde av den gemensamma historiken mellan elev och handledare.

Beta är gratis. Se [kravspec §16](../kravspec.md#16-beta-validation-och-kommersiell-gate).

## Inte i den här modellen

- Livstidsfri användning
- Låst butikspris före experiment
- App Store-prenumeration som default
- Per handledare, per körpass eller per moment
- Teori, kunskapsfrågor eller “klara körprovet-garanti” som påstår godkännande

## Relaterade dokument

- [ADR-009: Resan är säljobjektet](../decisions/ADR-009-journey-priced.md)
- [MVP v1](mvp-v1.md)
- [Produktprinciper](product-principles.md)
- [Kravspec §16](../kravspec.md#16-beta-validation-och-kommersiell-gate)
