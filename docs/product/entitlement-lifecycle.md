# Paywall och entitlement-livscykel

**Status:** Canonical kommersiell spec. Inte byggt. Inte aktiverat under betan.  
**Datum:** 2026-09-22

Här ligger **gratisperiod, priser, tillstånd och vad som är läsbart efter utgång**.

Vem som är elev eller handledare, och att entitlement sitter på resan, ligger i [användare och progress](users-and-progress.md). Den här filen svarar på *när* resan är öppen och *vad* som händer när den inte är det.

Produktprincipen är oförändrad:

> **En körkortsresa, ett köp, alla handledare.**

## Tillstånd

Varje `driving_journey` har exakt ett kommersiellt tillstånd åt gången.

```text
trial
    ↓  3 bedömda körpass eller 30 dagar (först)
expired
    ↓  köp 6 / 12 / 24 mån
active
    ↓  perioden tar slut
expired
    ↓  nytt köp till samma resa
active   (förlängd / förnyad)
```

| Tillstånd | Betydelse |
| --- | --- |
| `trial` | Ny resa i gratisperioden. Kärnloopen är öppen. |
| `active` | Betald 6-, 12- eller 24-månadersperiod som inte har löpt ut. |
| `expired` | Trial eller betald period är slut. Historik är läsbar. Nya körpass är stängda. |

Det finns inget separat tillstånd `renewed`. Förlängning och förnyelse sätter resan till `active` igen på samma `driving_journey`.

Beta och tiden före betalexperimentet behandlar alla resor som öppna. Tillstånden ovan **enforceras inte** förrän kommersiell access slås på.

## Trial

En ny `driving_journey` börjar i `trial`.

Gratisperioden tar slut när **det första** av följande inträffar:

- **3 bedömda körpass** (`rating_completed` på resan), eller
- **30 dagar** från `driving_journeys.started_at`.

Regler:

- Trial tillhör resan, inte `user`.
- Att lägga till, byta eller ta bort handledare skapar inte ny trial.
- En person som är handledare på en trial-resa och elev på en annan räknar inte ihop körpass eller dagar mellan resorna.
- Ett bedömt körpass är ett avslutat drive med handledarbedömning. Påbörjade men inte bedömda pass räknas inte.

När trial tar slut går resan till `expired`. Samma paywall som efter en betald period. Copy får säga att provperioden är slut.

## Betalda perioder

Efter `expired` (eller om familjen köper under `trial`) kan någon med access till resan köpa tid. Köpet är ett **förbetalt tidsbegränsat köp utan automatisk förnyelse**.

| Period | Preliminärt pris | Positionering |
| --- | ---: | --- |
| 6 månader | 349 kr | För den som redan är igång |
| 12 månader | 499 kr | Rekommenderat |
| 24 månader | 749 kr | Hela körkortsresan |

Priserna är **hypoteser** tills betalexperimentet. De får inte publiceras som butikspris innan dess.

SKU = `driving_journey` + tidsperiod.

- Vem som betalar behöver inte vara eleven.
- Flera handledare kräver inte flera köp.
- Köp under `trial` avslutar trial och sätter `active` från köptillfället.
- Köp under `active` **förlänger** `ends_at` med den köpta perioden (tid läggs på kvarvarande tid).
- Köp under `expired` **förnyar**: `active` från köptillfället, samma resa, samma historik.

Kanal följer respektive plattform och marknad. Det ändrar inte SKU:t.

## Vad som är öppet i `trial` och `active`

Samma produktaccess för eleven och alla aktiva handledare. Rollreglerna i [användare och progress](users-and-progress.md) gäller ovanpå detta.

Öppet:

- planera Drive Focus och starta körpass,
- genomföra, avsluta och bedöma,
- live-anteckningar och övningssteg,
- se och följa utveckling, recap, nästa gång,
- bjuda in och hantera handledare (elev),
- handledarguiden.

## Vad som är läsbart i `expired`

Utgången access **raderar inte** körhistorik, progression, bedömningar, Drive Focus, Training Focus eller relationer.

**Läsbart** för alla med journey-access:

- resans hem (senaste körpass, nästa-gång-förslag som text),
- utveckling per moment och område,
- recap för avslutade bedömda körpass,
- lista över handledare,
- handledarguiden.

**Stängt** tills nytt köp:

- starta nytt körpass,
- spara nytt Drive Focus i syfte att starta,
- nya live-observationer,
- ny tap-to-rate — utom undantaget nedan,
- nya invitationer.

Elevens övriga kontohandlingar (namn, radera konto, hjälp) påverkas inte.

Paywall-copy ska inte hota med raderad historik. Den ska säga att träningen finns kvar och att ett nytt köp låter er fortsätta samma resa.

### Körpass som pågår när perioden tar slut

Om ett drive är `active` när resan går till `expired`:

- de som redan får avsluta det körpasset får avsluta det,
- den tilldelade handledaren får bedöma **just det** körpasset,
- därefter gäller `expired` fullt ut.

Inget nytt körpass får startas.

## Vem som ser paywall

Paywall tillhör resan. Den visas när någon försöker en stängd handling, och som tydlig men inte blockerande CTA på resans hem i `expired`.

Eleven, en förälder eller en handledare på resan får genomföra köpet. Vem som betalar spelar ingen roll. En förälder som upptäckte produkten och driver onboarding blir inte ägare av resan genom köpet. Gästens `user_id` avgör inte om resan är `trial`, `active` eller `expired`.

En person kan samtidigt se en egen `active` resa, en `trial`-resa som handledare och en `expired`-resa som handledare. Tillstånden blandas inte.

## Inte i den här specen

- Implementation, schema eller betalprovider.
- App Store- vs webbkanal (följer plattformsregler när det byggs).
- Founder/beta-rabatt (separat kommersiellt beslut).
- “Klara körprovet-garanti” som påstår godkännande.
- Livstidsfri användning.

## Relaterade dokument

- [Användare, roller och delad progress](users-and-progress.md) — vem som betalar ≠ vilken resa som har entitlement
- [FR-13](../kravspec.md#fr-13-kommersiell-access-tillhör-resan), [FR-14](../kravspec.md#fr-14-paywall-och-entitlement-livscykel)
- [Kravspec §16](../kravspec.md#16-beta-validation-och-kommersiell-gate)
