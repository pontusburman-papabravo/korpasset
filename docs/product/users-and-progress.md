# Användare, roller och delad progress

**Status:** Canonical spec. Ingen implementationsändring i denna delta.  
**Datum:** 2026-09-22

En registrerad användare är en **person**, inte en roll. Roll uppstår per `driving_journey`.

En elev kan ha flera handledare. En handledare kan ha flera elever. **Både elev och alla aktiva handledare på resan ska kunna följa samma utveckling.** Det är kärnan i “pappa vet vad mamma övade på sist.”

## 1. Registrering skapar ingen roll

Det finns ingen separat registrering och inget val “jag är elev” / “jag är handledare”.

```text
Fortsätt med Apple eller Google i appen
    ↓
users + auth_identities  (personen)
    ↓
antingen / både
    ├─ skapa driving_journey     → roll student på den resan
    └─ acceptera inbjudan        → roll supervisor på den resan
```

Guest via QR är inte ett konto. Samma `user_id` behålls när Apple eller Google läggs till. Se [ADR-002](../decisions/ADR-002-actor-auth-separation.md) och [ADR-008](../decisions/ADR-008-app-oauth-accounts.md).

`korpasset.se` skapar inte produktkonton.

## 2. Många-till-många via resor

| Relation | Regel i v1 |
| --- | --- |
| En person, flera resor | Ja. Tillgängliga resor = egna aktiva elevresor + aktiva handledarresor. |
| En elev, flera handledare | Ja. First-class. Samma `driving_journey`. |
| En handledare, flera elever | Ja. En collaborator-rad per resa. |
| Samma person som både elev och handledare | Ja, på **olika** resor. T.ex. egen B-resa och handledare för ett syskon. |
| Samma person som elev och handledare på **samma** resa | Nej. Eleven får inte bjudas in som sin egen handledare. |
| Två aktiva elevägda B-resor för samma person | Nej i v1. Högst en aktiv `driving_journey` där personen är `student_user_id`. |

Studenten är inte `journey_collaborator`. Canonical elev är `driving_journeys.student_user_id` ([ADR-001](../decisions/ADR-001-student-owned-journey.md)).

## 3. Båda följer progress — samma read model

Progression tillhör **resan**, inte handledaren och inte ett personligt “mitt betyg”.

Alla med access till resan — eleven och varje aktiv handledare — ska kunna se:

- utveckling per moment och område (samma etiketter: Inte tränat ännu / Behöver hjälp / Med påminnelse / Utan hjälp),
- senaste körpasset och recap,
- vad som rekommenderas nästa gång,
- om ett körpass pågår,
- vilka handledare som är med.

Det är **samma data**. Handledare A ska se det handledare B bedömde, utan att något flyttas. Eleven ser samma sak.

Det är viktigt att handledaren kan följa progress **även när hen inte körde senast**. Annars faller värdet med flera handledare.

Progression får inte framställas som officiellt körkortsresultat, godkännande eller “redo för uppkörning”.

## 4. Samma syn, olika handlingar

På en given resa skiljer sig vad man **får göra**, inte vad man **får se** av utvecklingen.

| Handling | Elev | Tilldelad handledare på just det körpasset | Annan aktiv handledare på resan |
| --- | --- | --- | --- |
| Se utveckling, recap, nästa gång | Ja | Ja | Ja |
| Bjuda in / återkalla handledare | Ja | Nej | Nej |
| Välja växellåda | Ja | Nej | Nej |
| Planera Drive Focus och starta körpass | Ja | Ja | Ja |
| Avsluta körpasset | Ja | Ja | Nej |
| Bedöma körpasset (tap-to-rate) | Nej | Ja | Nej |

Handledaren administrerar nästan aldrig. Eleven äger inbjudningar. Bedömning är den tilldelade handledarens jobb och ska ta cirka 15–20 sekunder.

## 5. En app, flera resor

Efter inloggning gäller FR-8:

- 0 resor → skapa resa eller öppna inbjudan.
- 1 resa → rakt in på den resan. Hemmet anpassar copy efter rollen (elev eller handledare).
- Flera resor → kontextväljare. Den väljer bara vilken resa som öppnas. Den startar inte ett körpass.

När personen både har en egen elevresa och handledarresor ska väljaren skilja dem:

- egen resa: **Min körkortsresa**,
- andras resor: **elevens namn**, gärna med senast körd som sekundär rad.

Copy “Välj elev” räcker när alla resor är handledarresor. Om den egna resan ingår ska rubriken vara **Vilken körkortsresa vill du öppna?**

## 6. Gäst kontra registrerad handledare

| | Gäst (QR, samma session) | Registrerad (Apple/Google) |
| --- | --- | --- |
| Delta och bedöma på den resan | Ja | Ja |
| Följa progress på den resan | Ja | Ja |
| Byta telefon / behålla resorna | Svagt — ny länk kan krävas | Ja, samma `user_id` |
| Flera elever | Nej, i praktiken en inbjudan i taget | Ja |
| Egen elevresa samtidigt | Nej | Ja |

Registrering är alltså inte krav för att *se* progress på en resa man redan är med på. Den är krav för att *behålla* flera elever och samma identitet över tid.

## 7. Vad det inte är

- Inte två kontotyper (“elevkonto” och “handledarkonto”).
- Inte en handledares privata progress, skild från elevens.
- Inte att eleven bedömer sig själv i v1:s tap-to-rate.
- Inte att handledaren ser andra resor eleven inte delat.
- Inte procent som “87 % uppkörningsklar”.
- Inte ett “Premium-konto” som låser upp alla personens resor.
- Inte kod eller schema i denna spec — bara produktregler.

## 8. Betalning och access tillhör körkortsresan

Körpassets kommersiella access är kopplad till **`driving_journey`**, inte till `user`.

Det finns inget “Premium-konto” som gör en person betalande på alla sina resor.

```text
person betalar
    ↓
driving_journey får entitlement
    ↓
student + alla aktiva supervisors på resan får samma produktaccess
```

Vem som betalar och vem som är elev behöver inte vara samma person. Flera handledare kräver inte flera köp. Gästens eller handledarens `user_id` avgör aldrig betalstatus.

Entitlements följer respektive resa separat. En person kan samtidigt vara elev på en betald resa och handledare på en annan som är i trial eller utgången. Nivåerna påverkar inte varandra.

> **En körkortsresa, ett köp, alla handledare.**

Trial, priser, tillstånden `trial` / `active` / `expired` och vad som är läsbart efter utgång ligger i [paywall och entitlement-livscykel](entitlement-lifecycle.md) — inte här.

## Relaterade dokument

- [ADR-001: Student-owned journey](../decisions/ADR-001-student-owned-journey.md)
- [ADR-002: Actor/auth separation](../decisions/ADR-002-actor-auth-separation.md)
- [ADR-008: App-only konton](../decisions/ADR-008-app-oauth-accounts.md)
- [Onboarding & handoff](onboarding-handoff.md)
- [MVP v1](mvp-v1.md)
- [Paywall och entitlement-livscykel](entitlement-lifecycle.md)
- [Kravspec FR-8, FR-9, FR-12, FR-13, FR-14](../kravspec.md#5-funktionella-krav)
