# Progression research v1 — privat övningskörning, behörighet B

**Status:** research draft  
**Last updated:** 2026-09-15  
**Taxonomy version:** 1 (canonical, unchanged)

Detta dokument förbereder nästa produktfas medan vertical slice v1 användartestas. Det ändrar inget produktbeteende, ingen runtime-kod, ingen recommendation v0 och ingen canonical taxonomy.

### Fyra research-artefakter (`status: draft`, `notRuntime: true`)

| Artefakt | Fil | Innehåll |
| --- | --- | --- |
| 1. Official basis | [`skill-official-basis-v1.json`](skill-official-basis-v1.json) | skillKey → TSFS/Trafikverket/TS-råd |
| 2. Prerequisites | [`skill-prerequisites-v1.json`](skill-prerequisites-v1.json) | hard/soft-graf, introductionStage, pedagogiska kedjor |
| 3. Context progression | [`skill-context-progression-v1.json`](skill-context-progression-v1.json) | starting contexts, context-steg, bedömningskriterier per skill |
| 4. First drive & rules | [`first-drive-recommendation-rules-v1.json`](first-drive-recommendation-rules-v1.json) | första pass, observation→nästa steg, recommendation evidence |

Kombinerat index (ej runtime): [`progression-model-draft-v1.json`](progression-model-draft-v1.json)

Generator (ej runtime): `scripts/generate-progression-artifacts.mjs`

### Tre datatyper — alltid skilda

| Typ | Tillförlitlighet | Var det finns |
| --- | --- | --- |
| **OFFICIAL REQUIREMENT** | Hög | `officialBasis` per skill (vad källan föreskriver/bedömer) |
| **PEDAGOGICAL PRACTICE** | Medel | `introductionStage`, prerequisites mellan skills, first-drive lista |
| **PRODUCT HYPOTHESIS** | Vår modell | context ladders, progressionGuidance, assessmentCriteria, recommendation rules |

Skill-till-skill-relationer (prerequisites, first-drive prioritering) är **inte** OFFICIAL REQUIREMENT — officiell grund finns separat i `officialBasis` / `officialEvidence`.

---

## 1. Syfte och avgränsning

### Syfte

Besvara med myndighets- och pedagogisk förankring:

> Vad är ett rimligt nästa steg för just denna elev?

— inte:

> Vilken lektion är nummer 8?

### Avgränsning

| Gäller | Gäller inte |
| --- | --- |
| Readiness-baserad progression | Rigid lektionsstege |
| Skill vs context som separata axlar | En enda “svårighetsprocent” |
| Förslag till first-drive starting points | Onboarding-wizard i produkten |
| Underlag för framtida recommendation v1+ | Ändring av recommendation v0 |

### Källtyper i detta dokument

Varje påstående är märkt implicit genom avsnitt eller explicit med:

- **OFFICIAL REQUIREMENT** — lag/föreskrift eller myndighetstext
- **PEDAGOGICAL PRACTICE** — etablerad svensk trafikskole-/handledarpraxis, sekundär evidens
- **PRODUCT HYPOTHESIS** — rimlig produktmodell som ännu inte är verifierad med användare

---

## 2. Källor (verifierade 2026-09-15)

| ID | Källa | Status 2026 | Användning |
| --- | --- | --- | --- |
| `tsfs-2011-20` | [TSFS 2011:20 Kursplan B](https://www.transportstyrelsen.se/tsfs/TSFS%202011_20.pdf) | **Gällande** (i kraft 2011-04-01, ingen senare ändring identifierad) | Utbildningsmål: manövrering → trafikmiljöer → speciella sammanhang → personliga förutsättningar |
| `tsfs-2012-43` | [TSFS 2012:43 Förarprov B](https://lagen.nu/tsfs/2012:43) (konsoliderad, ändrad t.ex. TSFS 2024:22) | **Gällande** | Säkerhetskontroll, särskild manövrering, trafikbeteende (19 §) |
| `ts-planera-ovningskorning` | [Planera övningskörningen](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/planera-ovningsskorningen/) | **Aktuell** | Lugna platser först; öva till självständighet; planera nästa pass |
| `ts-ovningskora` | [Övningsköra](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/ovningskora/) | **Aktuell** | Ram för privat övningskörning |
| `ts-handledare` | [Handledare](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/handledare/) | **Aktuell** | Handledarkrav, ansvar |
| `ts-rad-handledaren-2026` | [Råd till handledaren (2026-08-01)](https://www.transportstyrelsen.se/globalassets/global/publikationer-och-rapporter/vag/korkort/rad_till_handledaren_a5_2026-08-01.pdf) | **Aktuell** | Praktisk handledarguidning, säkerhetskontroll före pass |
| `ts-riskutbildning-b` | [Riskutbildning B](https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/riskutbildning/riskutbildning-bil/) | **Aktuell** | Riskmedvetenhet, hastighet, alkohol/droger — påverkar *när* riskmedvetenhet är relevant, inte skill-listan |
| `trv-korprov-b` | [Trafikverket — Så går körprovet till](https://www.trafikverket.se/korkort/ta-korkort/personbil-och-latt-lastbil/sa-gar-korprovet-till/) (senast uppdaterad 2026-06-02) | **Aktuell** | Provpunkter, manövrering, självständig körning mot mål |
| `trv-presentation` | [Presentation av körprov B](https://www.trafikverket.se/korkort/ta-korkort/personbil-och-latt-lastbil/sa-gar-korprovet-till/) (protokoll/broschyr) | **Aktuell** | Fyra kompetensområden: fordonskännedom/manövrering, miljö, regler, säkerhet/beteende |

### Viktig myndighetsförändring 2026

**OFFICIAL REQUIREMENT:** Introduktionsutbildningen (TSFS 2010:127) upphävs från **2026-08-01** ([TSFS 2026:57](https://lagen.nu/tsfs/2026:57)). Det påverkar *inte* kursplanen TSFS 2011:20 eller körprovsinnehållet, men innebär att fler familjer kan börja övningsköra utan formell introduktionskurs. **PRODUCT HYPOTHESIS:** Behovet av inbyggd pedagogisk vägledning i produkten (t.ex. first-drive starting points) kan öka.

### Sekundär pedagogisk evidens (använd försiktigt)

- Trafikskolor följer ofta en logisk ordning: parkering/tom yta → bostadsområde → stad → landsväg → motorväg.
- Ingen enskild trafikskolas lektionsplan används som norm i detta dokument.

---

## 3. Föreslagen progressionsmodell

### 3.1 Varför inte lektionsnummer

**OFFICIAL REQUIREMENT:** TSFS 2011:20 beskriver *moment och mål*, inte en obligatorisk lektionsordning för privat övningskörning.

**PEDAGOGICAL PRACTICE:** Elever utvecklas ojämnt — stark på landsväg, svag i rondell är vanligt.

**PRODUCT HYPOTHESIS:** Progression ska vara *readiness per skill i context*, inte global “nivå 7”.

### 3.2 Fem readiness-steg (förslag)

Utmaning av ursprunglig modell: “INDEPENDENT DRIVING” som eget steg riskerar att blandas ihop med assessment-nivån `independent`. Vi byter namn till **`independent_readiness`** (examens-/självständighetsnära helhet).

| Steg | Svenskt namn | Officiell förankring | Typisk miljö |
| --- | --- | --- | --- |
| `foundation` | Grund | TSFS 2011:20 kap. 2 (manövrering, fordon); TS planera: lugna platser utan störande trafik | Tom yta, parkering, enkel gata |
| `controlled_traffic` | Lugn trafik | TSFS 2011:20 kap. 3 (trafikmiljöer), lätt; bostadsområde | Residential, light traffic, daylight |
| `mixed_traffic` | Blandad trafik | Korsningar, signaler, stad; TSFS 2012:43 §19 p.5 | Urban, moderate traffic |
| `complex_traffic` | Komplex trafik | Rondell, landsväg, motorväg; varierat väder/ljus | Rural, highway, heavy traffic, dusk/rain |
| `independent_readiness` | Självständighetsnära | TSFS 2012:43 §12 självständig körning mot mål; helhetsbedömning | Blandade miljöer, elev navigerar |

**PRODUCT HYPOTHESIS:** `introductionStage` anger *när en skill normalt introduceras första gången*, inte när eleven “klarar området”. Samma skill kan återkomma i alla senare steg med svårare context.

### 3.3 Skill progression ≠ Context progression

**Canonical (oförändrat):** Skill = vad eleven gör. Context = under vilka förhållanden.

Exempel:

| Skill | Context A | Context B |
| --- | --- | --- |
| `intersections_give_way` | residential, light, daylight, dry | urban, heavy, dusk, rain |

Samma skillKey. Olika pedagogisk svårighet. Progression kan öka context utan nya skills.

### 3.4 Context difficulty-modell (per skill, ingen global miljöranking)

Fyra dimensioner från canonical taxonomy. **Ingen global ordning** `residential < urban < rural < highway` — svårighet modelleras per skill via `contextSensitivity`:

| `contextSensitivity` | Betydelse |
| --- | --- |
| `none` | Kontextoberoende (t.ex. säkerhetskontroll) — ingen falsk miljöstege |
| `traffic_and_conditions` | Stege via trafik/ljus/väder inom en övningsarena |
| `environment-bound` | Momentet gäller i specifik miljö (motorväg, landsväg, stad) |
| `multi-venue` | Flera arenor utan att miljöbyte automatiskt = svårare |

Ordinala nivåer per dimension (där de är meningsfulla):

| Dimension | 1 | 2 | 3 |
| --- | --- | --- | --- |
| `traffic` | light | moderate | heavy |
| `light` | daylight | dusk_dawn | night |
| `weather` | dry | rain | snow_ice / fog |

**PRODUCT HYPOTHESIS — enkel kombinationsregel:**

1. Öka **högst en dimension åt gången** mellan pass om föregående bedömning var `independent` (inom skillens ladder-modell).
2. Vid `needs_help`: sänk minst en dimension eller behåll samma skill i enklare context.
3. `weather` och `light` introduceras normalt **efter** eleven är `with_support` eller `independent` på samma skill i daylight/dry.

**PEDAGOGICAL PRACTICE:** Natt och halka är sällan första privatpass — men ska inte vara förbjudna för avancerade elever.

---

## 4. Observation → nästa steg (design, ej implementerat)

Canonical assessment levels: `needs_help` | `with_support` | `independent`.

| Bedömning | Föreslagen progression | Officiell/praktisk motivering |
| --- | --- | --- |
| `needs_help` | Samma skill, **samma eller enklare** context. Prioritera repetition före ny skill. | TS planera: öva tills momentet sitter innan nästa |
| `with_support` | Samma skill, **samma** context. Eventuellt kort repetition av närliggande prerequisite om mönster pekar på grundfel. | PEDAGOGICAL PRACTICE: “nästan där” — inte höj svårighet än |
| `independent` | **Antingen** höj en context-dimension för samma skill **eller** introducera pedagogiskt närliggande skill på samma/lägre context | TSFS 2012:43: färdighet ska visas i varierande situationer inför prov |

**PRODUCT HYPOTHESIS — beslutsträd (förenklat):**

```
independent på skill S i context C
  → finns relevant närliggande skill S2 med introductionStage ≤ nuvarande fas, ej observerad?
      ja, och S är "entry" till S2 enligt prerequisites → föreslå S2 i C
  → annars → föreslå S i C' där C' skiljer sig i exakt en dimension, svårare
```

**Relation till recommendation v0 (endast kontext):** v0 prioriterar `needs_help` > `with_support` > core unobserved. Denna research lägger till *context* och *readiness-steg* som framtida dimensioner — utan att ändra v0.

---

## 5. Första körpasset (utan observationsdata)

### 5.1 Officiell och praktisk grund

**OFFICIAL REQUIREMENT**

- Säkerhetskontroll före körning (TSFS 2012:43 §14–17; Råd till handledaren 2026).
- Manövrering och broms som grund (TSFS 2011:20 kap. 2).

**PEDAGOGICAL PRACTICE**

- Första pass på lugn yta tills fordonet hanteras säkert (Planera övningskörningen).
- Start/stopp, broms, grundläggande placering före korsningar.

**PRODUCT HYPOTHESIS**

- Visa **4–5** starting points, inte 38.
- Låt handledare/elev välja 2–3 därifrån (samma UX som idag, men med curator-lista).

### 5.2 Föreslagna first-drive starting points

| Prioritet | skillKey | Titel | Motivering |
| --- | --- | --- | --- |
| 1 | `car_control_pre_drive_check` | Säkerhetskontroll | PRACTICE (officialEvidence: TSFS 2012:43, Råd till handledaren) |
| 2 | `car_control_smooth_start_stop` | Start och stannande | PRACTICE (officialEvidence: TSFS 2011:20, Trafikverket) |
| 3 | `car_control_braking` | Bromsning | PRACTICE (officialEvidence: TSFS 2011:20, TSFS 2012:43) |
| 4 | `positioning_road_position` | Placering på vägen | PRACTICE: krävs så fort eleven lämnar tom yta |
| 5 (valfri) | `observation_signaling` | Tecken och blinkers | PRACTICE: enkel, synlig vinst tidigt; SOFT intro |

**Medvetet inte i första curator-listan:** rondeller, motorväg, omkörning, självständig körning mot mål.

**Manuell växellåda:** `car_control_gear_shifting` kan erbjudas som alternativ till start/stopp när `transmission_scope = manual` — inte i default-listan för `automatic_only`.

---

## 6. Granskning av 38 canonical skills

Per-skill data i de fyra artefakterna ovan. Exempel på kombinerat schema:

```json
{
  "skillKey": "positioning_road_position",
  "officialBasis": [{ "sourceId": "tsfs-2012-43", "dataType": "OFFICIAL REQUIREMENT" }],
  "introductionStage": "controlled_traffic",
  "prerequisites": [{ "skillKey": "car_control_smooth_start_stop", "strength": "soft" }],
  "recommendedStartingContexts": {
    "environment": ["residential"],
    "traffic": ["light"]
  },
  "contextProgression": [
    { "environment": "residential", "traffic": "light" },
    { "environment": "urban", "traffic": "moderate" },
    { "environment": "urban", "traffic": "heavy" }
  ],
  "progressionGuidance": {
    "needs_help": "repeat_same_or_easier",
    "with_support": "repeat_similar",
    "independent": "increase_context_or_move_forward"
  }
}
```

### Bedömningskriterier (handledarperspektiv)

**PRODUCT HYPOTHESIS** — i [`skill-context-progression-v1.json`](skill-context-progression-v1.json) per skill. Syfte: göra tap-to-rate begripligare, inte ersätta förarprövarens helhetsbedömning.

Exempel *Placering på vägen*:

- **Behöver hjälp:** handledaren måste ofta korrigera placeringen.
- **Med stöd:** eleven klarar med påminnelser.
- **Självständig:** eleven väljer och korrigerar placering utan hjälp.

### Recommendation evidence (framtida produkt)

**PRODUCT HYPOTHESIS** — se [`first-drive-recommendation-rules-v1.json`](first-drive-recommendation-rules-v1.json):

```text
Placering på vägen
senaste observation: independent
context: residential + light traffic

→ inte "klar för alltid"
→ nästa steg: samma skill i urban + moderate traffic
```

Det vi **inte** modellerar: readiness-%, lektionsantal, universell ordning, exakt repetitionsantal.

Sammanfattning per område:

### 6.1 Bilkontroll (5 skills) — stage `foundation` → `controlled_traffic`

| skillKey | introductionStage | Hard prerequisites | Soft prerequisites |
| --- | --- | --- | --- |
| `car_control_pre_drive_check` | foundation | — | — |
| `car_control_smooth_start_stop` | foundation | pre_drive_check | — |
| `car_control_braking` | foundation | smooth_start_stop | — |
| `car_control_gear_shifting` | foundation* | smooth_start_stop | braking (*endast manual) |
| `car_control_speed_adaptation` | controlled_traffic | braking | positioning_road_position |

### 6.2 Blick & samspel (4) — `foundation` → `mixed_traffic`

| skillKey | introductionStage | Notering |
| --- | --- | --- |
| `observation_mirror_routine` | controlled_traffic | Kan övas tidigt i residential trots taxonomy `relevantContext` |
| `observation_blind_spot` | mixed_traffic | Kräver spegelvana |
| `observation_signaling` | foundation/controlled | Tidig, enkel vinst |
| `observation_scanning` | controlled_traffic | Tvärgående — växlar i svårighet via context |

### 6.3 Placering & körfält (4) — `controlled_traffic` → `mixed_traffic`

Körfältsbyte är sammansatt moment (spegel + död vinkel + tecken + placering) — **hard** chain enligt taxonomy, rimligt.

### 6.4 Korsningar & rondeller (6) — `controlled_traffic` → `complex_traffic`

Rondell uppdelad i infart/placering/utfart stämmer med Trafikverkets provpunkter. **PRODUCT HYPOTHESIS:** elev kan vara `independent` på utfart men `needs_help` på placering — modellen stödjer detta via context, inte nya skills.

### 6.5 Stadstrafik (3) — `mixed_traffic`

`urban_vulnerable_road_users` hör hemma tidigt i residential/urban — OFFICIAL: oskyddade trafikanter är egen provpunkt.

### 6.6 Landsväg (4) — `complex_traffic`

`rural_passing` (supporting): sent, efter möte. **PEDAGOGICAL PRACTICE:** omkörning sällan i tidig privat övning — taxonomy `mvpPriority: supporting` är korrekt.

### 6.7 Motorväg (3) — `complex_traffic`

Kräver körfältsbyte och hastighet — hard chain rimlig.

### 6.8 Manövrering (5) — `foundation` → `mixed_traffic`

Backning kan introdas tidigt på tom yta (foundation). Parkering senare (mixed). **OFFICIAL:** minst ett backmoment på prov.

### 6.9 Självständig & säker (4) — `mixed_traffic` → `independent_readiness`

`independent_route_planning` är capstone — OFFICIAL: självständig körning mot mål. `independent_eco_driving` är supporting och sent.

---

## 7. Avvikelser mot taxonomy `likelyPrerequisites`

Dessa **ändrar inte** taxonomy — rapporteras för framtida övervägande.

| skillKey | Taxonomy säger | Research rekommenderar | Typ |
| --- | --- | --- | --- |
| `maneuver_hill_start` | hard: `gear_shifting` | hard endast vid `transmission_scope = manual`; annars soft: `smooth_start_stop` | Villkorlig hard |
| `independent_eco_driving` | hard: `route_planning` | soft: `speed_adaptation`; hard: `route_planning` för full eco i blandad miljö | För strikt hard |
| `intersections_give_way` | hard: start_stop, scanning | lägg soft: `braking` | Saknad mjuk kedja |
| `car_control_speed_adaptation` | hard: braking | lägg soft: `positioning_road_position` | Placering hjälper hastighetsbedömning |
| `observation_mirror_routine` | `relevantContext` utan residential | residential är vanlig övningsmiljö — **context-note**, inte prereq-fel | Kontext vs intro |

---

## 8. Kritisk granskning (attack på modellen)

| Fråga | Bedömning |
| --- | --- |
| Har vi gjort trafikskolans lektionsordning till sanning? | **Delvis risk.** `introductionStage` beskriver typisk intro, inte krav. Eleven ska kunna hoppa fram om `independent` i närliggande skill. |
| För många prerequisites? | **Måttlig risk.** Hard chains är medvetet få (körfältsbyte, motorväg, rondell). Mest soft. |
| Kan eleven gå snabbare? | **Ja.** Modellen är readiness-baserad, inte låsande. Stages är default, inte gates. |
| Bra på landsväg, dålig i rondell? | **Ja, det är huvudpoängen.** Skills är oberoende; context per skill. |
| Samma skill via svårare context utan duplicering? | **Ja.** Canonical design + context tier-regler. |
| Falsk precision? | **Medvetet undvikit** — ordinala steg, max-regel, inga procent. |
| Bygger vi något onödigt för “vad ska vi träna på nästa gång”? | **Risk:** fem stages kan vara mer än produkten behöver. Minsta produktlogik: (1) first-drive lista, (2) observation-regler, (3) context step-up. Stages kan vara internt. |

### Öppna osäkerheter

1. **Hur mycket ska riskutbildning påverka progression?** Risk 1 (kunskap) är inte samma som `independent_risk_awareness` i bil — vi har inte modellerat teorikunskap.
2. **Introduktionsutbildning borttagen 2026-08-01:** ökar behovet av produktstöd, men exakt copy är overifierad.
3. **Automat vs manuell:** `gear_shifting` och `hill_start` behöver transmission-gating i framtida logik.
4. **Parallellparkering vs trafik:** familjer övar parkering tidigt; officiell provordning blandar manövrering tidigt — tension mellan “first drive” och “exam order”.
5. **Självständighet per handledare:** multi-supervisor kan ge motstridiga signals — append-only löser historik, inte konflikt i rekommendation.

---

## 9. Vad som bör bli produktlogik senare

| Research-del | Framtida produkt | Prioritet |
| --- | --- | --- |
| First-drive starting points (4–5 skills) | Curator-lista när `observation_count = 0` | Hög (UX-test pågår) |
| `needs_help` → samma/enklare context | Recommendation v1 | Hög |
| `independent` → context step-up | Recommendation v1 + ev. drive planning | Medel |
| `introductionStage` som default-sortering | “Föreslaget nästa” bland core unobserved | Medel |
| Hard prerequisite validation vid skill-val | Varning i UI, inte blockering | Låg |
| Readiness stages som synlig UI | Troligen **nej** i B2C v1 — för trafikskoligt | Låg |

**Implementera inte före** manuellt produkttest av vertical slice och beslut om UX-fixrunda.

---

## 10. Relation till befintlig kod

| Artefakt | Roll |
| --- | --- |
| `docs/domain/progression-model.md` | Canonical arkitektur: progression = read model |
| `app/src/services/recommendations.ts` | v0: training focus → needs_help → with_support → core unobserved |
| `docs/domain/progression-model-draft-v1.json` | **Draft research only** — `status: draft` |

---

## 11. Referenser i repo

- [Skill Taxonomy v1](skill-taxonomy.md) / [`skill-taxonomy-v1.json`](skill-taxonomy-v1.json)
- [Product principles](../product/product-principles.md)
- [Progression model](progression-model.md) (arkitektur, oförändrad)
