#!/usr/bin/env node
/**
 * Generates progression research draft artifacts from canonical taxonomy.
 * NOT used by runtime. Research/data only.
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const taxonomy = JSON.parse(
  readFileSync(join(root, "docs/domain/skill-taxonomy-v1.json"), "utf8"),
);

const META = {
  status: "draft",
  notRuntime: true,
  lastUpdated: "2026-09-15",
  taxonomyVersion: 1,
  locale: "sv-SE",
  licenseClass: "B",
};

const SOURCE_CATALOG = Object.fromEntries(
  taxonomy.sources.map((s) => [s.id, s]),
);

const stageMap = {
  car_control_pre_drive_check: "foundation",
  car_control_smooth_start_stop: "foundation",
  car_control_braking: "foundation",
  car_control_gear_shifting: "foundation",
  car_control_speed_adaptation: "controlled_traffic",
  observation_mirror_routine: "controlled_traffic",
  observation_blind_spot: "mixed_traffic",
  observation_signaling: "controlled_traffic",
  observation_scanning: "controlled_traffic",
  positioning_road_position: "controlled_traffic",
  positioning_lane_selection: "mixed_traffic",
  positioning_lane_change: "mixed_traffic",
  positioning_turning: "mixed_traffic",
  intersections_right_hand_rule: "controlled_traffic",
  intersections_give_way: "mixed_traffic",
  intersections_traffic_lights: "mixed_traffic",
  roundabout_entry: "complex_traffic",
  roundabout_positioning: "complex_traffic",
  roundabout_exit: "complex_traffic",
  urban_vulnerable_road_users: "mixed_traffic",
  urban_passing_stationary: "mixed_traffic",
  urban_tight_spaces: "mixed_traffic",
  rural_joining_and_leaving: "complex_traffic",
  rural_curves: "complex_traffic",
  rural_meeting_traffic: "complex_traffic",
  rural_passing: "complex_traffic",
  highway_merging: "complex_traffic",
  highway_lane_discipline: "complex_traffic",
  highway_exiting: "complex_traffic",
  maneuver_reversing: "foundation",
  maneuver_hill_start: "mixed_traffic",
  maneuver_parallel_parking: "mixed_traffic",
  maneuver_parking: "mixed_traffic",
  maneuver_turning_around: "mixed_traffic",
  independent_route_planning: "independent_readiness",
  independent_risk_awareness: "mixed_traffic",
  independent_safety_margins: "mixed_traffic",
  independent_eco_driving: "independent_readiness",
};

/** @type {Record<string, { prerequisites: Array<{skillKey: string, strength: string, dataType: string, rationale: string}>}>} */
const prereqResearch = {
  car_control_pre_drive_check: { prerequisites: [] },
  car_control_smooth_start_stop: {
    prerequisites: [
      {
        skillKey: "car_control_pre_drive_check",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Säkerhetskontroll är officiell rutin före varje pass; start/stopp kan övas parallellt på tom yta.",
      },
    ],
  },
  car_control_braking: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Grundläggande fartkontroll före finare bromsteknik.",
      },
    ],
  },
  car_control_gear_shifting: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: växling bygger på grundläggande start/stopp-kontroll (manuell bil).",
      },
    ],
  },
  car_control_speed_adaptation: {
    prerequisites: [
      {
        skillKey: "car_control_braking",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: hastighetsanpassning kräver kontrollerad bromsning.",
      },
      {
        skillKey: "positioning_road_position",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Placering och hastighet övas ofta tillsammans i bostadsområde.",
      },
    ],
  },
  observation_mirror_routine: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Spegelrutin kräver grundläggande fordonskontroll.",
      },
    ],
  },
  observation_blind_spot: {
    prerequisites: [
      {
        skillKey: "observation_mirror_routine",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Döda vinkeln kompletterar spegelrutin, inte ersätter den.",
      },
    ],
  },
  observation_signaling: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Blinkers kan övas tidigt i lugn miljö.",
      },
    ],
  },
  observation_scanning: {
    prerequisites: [
      {
        skillKey: "observation_mirror_routine",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Avsökning bygger på etablerad blickvana.",
      },
    ],
  },
  positioning_road_position: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Placering övas när eleven kan starta/stanna kontrollerat.",
      },
    ],
  },
  positioning_lane_selection: {
    prerequisites: [
      {
        skillKey: "positioning_road_position",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: körfältsval bygger på grundplacering i körfält.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Körfältsval kräver avsökning av skyltning och trafik.",
      },
    ],
  },
  positioning_lane_change: {
    prerequisites: [
      {
        skillKey: "observation_mirror_routine",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: körfältsbyte kräver etablerad spegelrutin.",
      },
      {
        skillKey: "observation_blind_spot",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Kontrollblick före körfältsbyte.",
      },
      {
        skillKey: "observation_signaling",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Tecken före körfältsbyte.",
      },
      {
        skillKey: "positioning_road_position",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Grundplacering före sidoförflyttning.",
      },
    ],
  },
  positioning_turning: {
    prerequisites: [
      {
        skillKey: "positioning_road_position",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: sväng kräver stabil grundplacering.",
      },
      {
        skillKey: "observation_signaling",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Blinkers före sväng.",
      },
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Fart innan och i sväng.",
      },
    ],
  },
  intersections_right_hand_rule: {
    prerequisites: [
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Högerregel kräver kontrollerad fart i korsning.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: högerregel kräver avsökning av korsande trafik.",
      },
    ],
  },
  intersections_give_way: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Stopp/start vid väjningsplikt.",
      },
      {
        skillKey: "car_control_braking",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Kontrollerad inbromsning mot väjningslinje.",
      },
      {
        skillKey: "observation_scanning",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: väjningsplikt kräver systematisk avsökning.",
      },
    ],
  },
  intersections_traffic_lights: {
    prerequisites: [
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Anpassa fart mot signal.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Uppmärksamhet på signal och korsande trafik.",
      },
    ],
  },
  roundabout_entry: {
    prerequisites: [
      {
        skillKey: "intersections_give_way",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: rondellinfart bygger på väjningsbeteende i korsning.",
      },
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Sänka fart före infart.",
      },
    ],
  },
  roundabout_positioning: {
    prerequisites: [
      {
        skillKey: "roundabout_entry",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Placering i cirkulation efter säker infart.",
      },
      {
        skillKey: "positioning_road_position",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Spårning i körfält.",
      },
    ],
  },
  roundabout_exit: {
    prerequisites: [
      {
        skillKey: "roundabout_positioning",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Utfart bygger på korrekt läge i rondellen.",
      },
      {
        skillKey: "observation_signaling",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: utfart ur rondell kräver tydlig signalering.",
      },
    ],
  },
  urban_vulnerable_road_users: {
    prerequisites: [
      {
        skillKey: "observation_scanning",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: oskyddade trafikanter kräver aktiv avsökning.",
      },
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Fartanpassning vid gående/cyklister.",
      },
    ],
  },
  urban_passing_stationary: {
    prerequisites: [
      {
        skillKey: "positioning_road_position",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: passerande stillastående kräver korrekt sidoplacering.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Upptäcka dörrar, fotgängare mellan bilar.",
      },
    ],
  },
  urban_tight_spaces: {
    prerequisites: [
      {
        skillKey: "positioning_road_position",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Grundplacering i smala gator.",
      },
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Långsam kontroll vid möte i trång gata.",
      },
    ],
  },
  rural_joining_and_leaving: {
    prerequisites: [
      {
        skillKey: "car_control_speed_adaptation",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: infart/sväng på landsväg kräver fartkontroll.",
      },
      {
        skillKey: "intersections_give_way",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Väjning vid infart.",
      },
      {
        skillKey: "positioning_turning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Svängteknik vid avfart.",
      },
    ],
  },
  rural_curves: {
    prerequisites: [
      {
        skillKey: "car_control_speed_adaptation",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: kurvkörning kräver fartkontroll.",
      },
      {
        skillKey: "positioning_road_position",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Placering i kurva.",
      },
    ],
  },
  rural_meeting_traffic: {
    prerequisites: [
      {
        skillKey: "positioning_road_position",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: möte på landsväg kräver grundplacering.",
      },
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Fart och lucka vid möte.",
      },
    ],
  },
  rural_passing: {
    prerequisites: [
      {
        skillKey: "rural_meeting_traffic",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Mötesbeteende före omkörning.",
      },
      {
        skillKey: "observation_mirror_routine",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: omkörning kräver etablerad spegelrutin.",
      },
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Acceleration och återgång.",
      },
    ],
  },
  highway_merging: {
    prerequisites: [
      {
        skillKey: "positioning_lane_change",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: motorvägspåfart bygger på körfältsbyte.",
      },
      {
        skillKey: "car_control_speed_adaptation",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Accelerationsfält kräver fartmatchning.",
      },
    ],
  },
  highway_lane_discipline: {
    prerequisites: [
      {
        skillKey: "positioning_lane_selection",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: körfältsdisciplin på motorväg bygger på körfältsval.",
      },
      {
        skillKey: "highway_merging",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Erfarenhet från påfart.",
      },
    ],
  },
  highway_exiting: {
    prerequisites: [
      {
        skillKey: "highway_lane_discipline",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: avfart kräver erfarenhet av körfältsdisciplin.",
      },
      {
        skillKey: "observation_signaling",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Tidig planering och tecken.",
      },
    ],
  },
  maneuver_reversing: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: backning bygger på grundläggande start/stopp-kontroll.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Uppsikt bakåt.",
      },
    ],
  },
  maneuver_hill_start: {
    prerequisites: [
      {
        skillKey: "car_control_smooth_start_stop",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: start i lutning kräver säker start/stopp-teknik.",
      },
      {
        skillKey: "car_control_gear_shifting",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Manuell bil — växling i lutning. Ej hard vid automatic_only.",
      },
    ],
  },
  maneuver_parallel_parking: {
    prerequisites: [
      {
        skillKey: "maneuver_reversing",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: fickparkering kräver säker backning.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Uppsikt mot trafik under parkering.",
      },
    ],
  },
  maneuver_parking: {
    prerequisites: [
      {
        skillKey: "maneuver_reversing",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: parkering bygger på backningsförmåga.",
      },
    ],
  },
  maneuver_turning_around: {
    prerequisites: [
      {
        skillKey: "maneuver_reversing",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: vändning kräver säker backning.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Säker plats och uppsikt.",
      },
    ],
  },
  independent_route_planning: {
    prerequisites: [
      {
        skillKey: "positioning_lane_selection",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: självständig navigering kräver körfältsval och avsökning.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Navigera kräver avsökning.",
      },
      {
        skillKey: "independent_risk_awareness",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Självständig körning kräver riskmedvetenhet.",
      },
    ],
  },
  independent_risk_awareness: {
    prerequisites: [
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: riskmedvetenhet bygger på systematisk avsökning.",
      },
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Riskmedvetenhet kopplas till fart.",
      },
    ],
  },
  independent_safety_margins: {
    prerequisites: [
      {
        skillKey: "car_control_speed_adaptation",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: säkerhetsmarginaler kopplas till fartkontroll.",
      },
      {
        skillKey: "observation_scanning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Avstånd kräver uppmärksamhet framåt.",
      },
    ],
  },
  independent_eco_driving: {
    prerequisites: [
      {
        skillKey: "car_control_speed_adaptation",
        strength: "hard",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Pedagogiskt: eco-körning kräver fartkontroll.",
      },
      {
        skillKey: "independent_route_planning",
        strength: "soft",
        dataType: "PEDAGOGICAL PRACTICE",
        rationale: "Planerad körning i blandad miljö.",
      },
    ],
  },
};

function ctx(environment, traffic, light = "daylight", weather = "dry", ladderNote) {
  const step = { environment, traffic, light, weather };
  if (ladderNote) step.ladderNote = ladderNote;
  return step;
}

/**
 * Per-skill context model. No global environment ranking (residential < urban < rural < highway).
 * contextSensitivity:
 *   - none: no meaningful ladder (e.g. pre-drive check)
 *   - traffic_and_conditions: ladder via traffic/light/weather within a practice venue
 *   - environment-bound: skill only applies in specific environment(s)
 *   - multi-venue: alternate practice arenas without implying global env difficulty order
 * @type {Record<string, { contextSensitivity: string, note?: string, steps: object[] }>}
 */
const contextProgressionResearch = {
  car_control_pre_drive_check: {
    contextSensitivity: "none",
    note: "Kontextoberoende — miljö/trafik påverkar inte momentets svårighetsgrad.",
    steps: [ctx("residential", "light", "daylight", "dry", "En representativ startkontext")],
  },
  car_control_smooth_start_stop: {
    contextSensitivity: "traffic_and_conditions",
    note: "Progression via trafik och förhållanden i samma övningsmiljö.",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Introduktion"),
      ctx("residential", "moderate", "daylight", "dry", "Ökad trafik, samma miljö"),
      ctx("residential", "moderate", "dusk_dawn", "dry", "Sämre sikt, samma miljö"),
    ],
  },
  car_control_braking: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Grundbroms i lugn miljö"),
      ctx("residential", "moderate", "daylight", "dry", "Mer trafik, samma miljö"),
      ctx("residential", "moderate", "daylight", "rain", "Sämre grepp, samma miljö"),
      ctx("residential", "moderate", "dusk_dawn", "rain", "Kombinerade förhållanden"),
    ],
  },
  car_control_gear_shifting: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Växling i lugn fart"),
      ctx("residential", "moderate", "daylight", "dry", "Växling med mer trafik"),
      ctx("residential", "moderate", "dusk_dawn", "dry", "Växling vid sämre sikt"),
    ],
  },
  car_control_speed_adaptation: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Grundfart"),
      ctx("residential", "moderate", "daylight", "dry", "Fartanpassning med mer trafik"),
      ctx("residential", "heavy", "daylight", "dry", "Tät trafik, samma miljö"),
      ctx("residential", "moderate", "dusk_dawn", "rain", "Sämre sikt och grepp"),
    ],
  },
  observation_mirror_routine: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Etablera rutin"),
      ctx("residential", "moderate", "daylight", "dry", "Rutin under mer trafik"),
      ctx("residential", "moderate", "dusk_dawn", "dry", "Rutin vid sämre sikt"),
    ],
  },
  observation_blind_spot: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Typisk stadsmiljö för döda vinkeln"),
      ctx("urban", "heavy", "daylight", "dry", "Mer sidotrafik"),
      ctx("urban", "moderate", "dusk_dawn", "dry", "Sämre sikt"),
    ],
  },
  observation_signaling: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Blinkers i lugn miljö"),
      ctx("residential", "moderate", "daylight", "dry", "Tecken med mer trafik"),
      ctx("residential", "moderate", "dusk_dawn", "dry", "Tecken vid sämre sikt"),
    ],
  },
  observation_scanning: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Grundavsökning"),
      ctx("residential", "moderate", "daylight", "dry", "Mer att scanna"),
      ctx("residential", "heavy", "daylight", "dry", "Tät trafik"),
      ctx("residential", "moderate", "dusk_dawn", "dry", "Sämre sikt"),
    ],
  },
  positioning_road_position: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Grundplacering"),
      ctx("residential", "moderate", "daylight", "dry", "Placering med mer trafik"),
      ctx("residential", "heavy", "daylight", "dry", "Placering i tät trafik"),
      ctx("residential", "moderate", "dusk_dawn", "rain", "Placering under sämre förhållanden"),
    ],
  },
  positioning_lane_selection: {
    contextSensitivity: "environment-bound",
    note: "Körfältsval kräver fler körfält — typiskt urban eller highway.",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Körfältsval i stad"),
      ctx("urban", "heavy", "daylight", "dry", "Tät stadstrafik"),
      ctx("highway", "moderate", "daylight", "dry", "Körfältsval på motorväg (egen arena)"),
    ],
  },
  positioning_lane_change: {
    contextSensitivity: "environment-bound",
    note: "Körfältsbyte i miljöer med flera körfält.",
    steps: [
      ctx("urban", "light", "daylight", "dry", "Enkelt körfältsbyte"),
      ctx("urban", "moderate", "daylight", "dry", "Mer trafik"),
      ctx("highway", "moderate", "daylight", "dry", "Körfältsbyte på motorväg"),
      ctx("highway", "heavy", "daylight", "dry", "Tät motorvägstrafik"),
    ],
  },
  positioning_turning: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Enkel sväng"),
      ctx("residential", "moderate", "daylight", "dry", "Sväng med mer trafik"),
      ctx("urban", "moderate", "daylight", "dry", "Sväng i stad (arena med fler möten, ej strikt svårare)"),
    ],
  },
  intersections_right_hand_rule: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Enkel korsning"),
      ctx("residential", "moderate", "daylight", "dry", "Mer korsande trafik"),
      ctx("urban", "moderate", "daylight", "dry", "Stadskorsning (alternativ arena)"),
    ],
  },
  intersections_give_way: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Väjning i lugn korsning"),
      ctx("residential", "moderate", "daylight", "dry", "Mer trafik"),
      ctx("urban", "moderate", "daylight", "dry", "Stadskorsning"),
      ctx("urban", "moderate", "dusk_dawn", "rain", "Sämre sikt och grepp"),
    ],
  },
  intersections_traffic_lights: {
    contextSensitivity: "environment-bound",
    note: "Signalkorsningar finns främst i urban miljö.",
    steps: [
      ctx("urban", "light", "daylight", "dry", "Enkel signal"),
      ctx("urban", "moderate", "daylight", "dry", "Mer trafik"),
      ctx("urban", "heavy", "daylight", "dry", "Tät trafik"),
      ctx("urban", "heavy", "night", "dry", "Nattkörning"),
    ],
  },
  roundabout_entry: {
    contextSensitivity: "environment-bound",
    note: "Rondeller finns främst i urban miljö.",
    steps: [
      ctx("urban", "light", "daylight", "dry", "Enkel rondell"),
      ctx("urban", "moderate", "daylight", "dry", "Mer trafik"),
      ctx("urban", "heavy", "daylight", "dry", "Tät rondelltrafik"),
    ],
  },
  roundabout_positioning: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Placering i rondell"),
      ctx("urban", "heavy", "daylight", "dry", "Tät trafik"),
      ctx("urban", "heavy", "dusk_dawn", "rain", "Sämre förhållanden"),
    ],
  },
  roundabout_exit: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Utfart"),
      ctx("urban", "heavy", "daylight", "dry", "Utfart under tät trafik"),
      ctx("urban", "heavy", "dusk_dawn", "dry", "Sämre sikt"),
    ],
  },
  urban_vulnerable_road_users: {
    contextSensitivity: "multi-venue",
    note: "Oskyddade trafikanter i bostads- och stadsmiljö — arenor utan global ranking.",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Gående/cyklister i bostadsområde"),
      ctx("urban", "moderate", "daylight", "dry", "Stadsmiljö med fler möten"),
      ctx("urban", "heavy", "daylight", "dry", "Tät stadstrafik"),
      ctx("urban", "moderate", "dusk_dawn", "dry", "Sämre sikt"),
    ],
  },
  urban_passing_stationary: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Passera stillastående"),
      ctx("urban", "heavy", "daylight", "dry", "Tät stadstrafik"),
    ],
  },
  urban_tight_spaces: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Trång bostadsgata"),
      ctx("residential", "moderate", "daylight", "dry", "Möte i trång gata med trafik"),
      ctx("urban", "moderate", "daylight", "dry", "Trång stadsgata (alternativ arena)"),
    ],
  },
  rural_joining_and_leaving: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("rural", "light", "daylight", "dry", "Infart/sväng på landsväg"),
      ctx("rural", "moderate", "daylight", "dry", "Mer trafik"),
      ctx("rural", "heavy", "daylight", "dry", "Tät landsvägstrafik"),
    ],
  },
  rural_curves: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("rural", "light", "daylight", "dry", "Kurva i lugn fart"),
      ctx("rural", "moderate", "daylight", "dry", "Kurva med mer trafik"),
      ctx("rural", "moderate", "dusk_dawn", "rain", "Kurva under sämre förhållanden"),
    ],
  },
  rural_meeting_traffic: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("rural", "light", "daylight", "dry", "Möte på landsväg"),
      ctx("rural", "moderate", "daylight", "dry", "Möte med mer trafik"),
      ctx("rural", "moderate", "dusk_dawn", "dry", "Möte vid sämre sikt"),
    ],
  },
  rural_passing: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("rural", "light", "daylight", "dry", "Omkörning på landsväg"),
      ctx("rural", "moderate", "daylight", "dry", "Omkörning med mer trafik"),
    ],
  },
  highway_merging: {
    contextSensitivity: "environment-bound",
    note: "Endast motorväg; progression via trafik.",
    steps: [
      ctx("highway", "light", "daylight", "dry", "Påfart"),
      ctx("highway", "moderate", "daylight", "dry", "Påfart med mer trafik"),
      ctx("highway", "heavy", "daylight", "dry", "Tät motorvägstrafik"),
    ],
  },
  highway_lane_discipline: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("highway", "moderate", "daylight", "dry", "Körfältsdisciplin"),
      ctx("highway", "heavy", "daylight", "dry", "Tät trafik"),
      ctx("highway", "heavy", "daylight", "rain", "Regn på motorväg"),
    ],
  },
  highway_exiting: {
    contextSensitivity: "environment-bound",
    steps: [
      ctx("highway", "moderate", "daylight", "dry", "Avfart"),
      ctx("highway", "heavy", "daylight", "dry", "Avfart under tät trafik"),
    ],
  },
  maneuver_reversing: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Backning på tom yta"),
      ctx("residential", "light", "daylight", "dry", "Backning med lätt sidotrafik"),
    ],
  },
  maneuver_hill_start: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Start i lutning, lugn miljö"),
      ctx("residential", "moderate", "daylight", "dry", "Start i lutning med trafik"),
    ],
  },
  maneuver_parallel_parking: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Parkering i ficka"),
      ctx("residential", "light", "daylight", "dry", "Parkering med lätt sidotrafik"),
      ctx("urban", "light", "daylight", "dry", "Parkering i stad (alternativ arena)"),
    ],
  },
  maneuver_parking: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Parkering på plats"),
      ctx("residential", "light", "daylight", "dry", "Parkering med lätt sidotrafik"),
    ],
  },
  maneuver_turning_around: {
    contextSensitivity: "traffic_and_conditions",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Vändning på lugn plats"),
      ctx("rural", "light", "daylight", "dry", "Vändning på landsväg (alternativ arena)"),
    ],
  },
  independent_route_planning: {
    contextSensitivity: "multi-venue",
    note: "Självständig körning mot mål i varierande arenor — ingen global miljöranking.",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Navigering i stad"),
      ctx("urban", "heavy", "daylight", "dry", "Navigering i tät stad"),
      ctx("rural", "moderate", "daylight", "dry", "Navigering på landsväg (alternativ arena)"),
    ],
  },
  independent_risk_awareness: {
    contextSensitivity: "multi-venue",
    note: "Riskmedvetenhet i flera arenor — miljöbyte är inte samma sak som strikt svårighetssteg.",
    steps: [
      ctx("residential", "light", "daylight", "dry", "Grund i lugn miljö"),
      ctx("residential", "moderate", "daylight", "dry", "Mer stimuli"),
      ctx("urban", "moderate", "daylight", "dry", "Stadsmiljö (alternativ arena)"),
      ctx("highway", "moderate", "daylight", "dry", "Motorväg (alternativ arena)"),
      ctx("residential", "heavy", "night", "rain", "Sammansatta förhållanden"),
    ],
  },
  independent_safety_margins: {
    contextSensitivity: "multi-venue",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Marginaler i stad"),
      ctx("rural", "moderate", "daylight", "dry", "Marginaler på landsväg"),
      ctx("highway", "moderate", "daylight", "dry", "Marginaler på motorväg"),
      ctx("highway", "heavy", "daylight", "dry", "Tät motorvägstrafik"),
    ],
  },
  independent_eco_driving: {
    contextSensitivity: "multi-venue",
    steps: [
      ctx("urban", "moderate", "daylight", "dry", "Eco i stad"),
      ctx("rural", "moderate", "daylight", "dry", "Eco på landsväg"),
      ctx("highway", "moderate", "daylight", "dry", "Eco på motorväg"),
    ],
  },
};

function assessmentCriteria(skill) {
  const t = skill.title.toLowerCase();
  const d = skill.description;
  return {
    needs_help: `Behöver hjälp: handledaren måste ofta ingripa, påminna eller korrigera vid ${t}. ${d.split(".")[0]}.`,
    with_support: `Med stöd: eleven klarar ${t} när handledaren påminner eller guidar vid behov, men behöver inte ta över.`,
    independent: `Självständig: eleven hanterar ${t} själv i aktuellt context utan att handledaren behöver korrigera.`,
    dataType: "PRODUCT HYPOTHESIS",
    note: "Formulerat för handledares tap-to-rate — inte officiella betygskriterier.",
  };
}

/** Resolve taxonomy officialBasis reference string to canonical source catalog id. */
function resolveSourceId(ref) {
  if (/TSFS\s*2011:20|2011:20/.test(ref)) return "tsfs-2011-20";
  if (/TSFS\s*2012:43|2012:43/.test(ref)) return "tsfs-2012-43";
  if (/Trafikverket/i.test(ref)) return "trv-korprov-b";
  if (/Råd till handledaren/i.test(ref)) return "ts-rad-handledaren-2026";
  if (/Planera övningskörning|Planera övning/i.test(ref)) return "ts-planera-ovningskorning";
  if (/Övningsköra|övningskörning/i.test(ref) && !/Planera/i.test(ref)) return "ts-ovningskora";
  if (/Handledare/i.test(ref) && !/Råd till handledaren/i.test(ref)) return "ts-handledare";
  if (/Riskutbildning/i.test(ref)) return "ts-riskutbildning-b";
  return null;
}

function mapOfficialBasis(skill) {
  return (skill.officialBasis ?? []).map((ref) => {
    const sourceId = resolveSourceId(ref);
    if (!sourceId || !SOURCE_CATALOG[sourceId]) {
      throw new Error(
        `Cannot resolve officialBasis reference for ${skill.skillKey}: "${ref}"`,
      );
    }
    const catalog = SOURCE_CATALOG[sourceId];
    if (!catalog.url) {
      throw new Error(`Source ${sourceId} has no URL in canonical catalog`);
    }
    return {
      sourceId,
      reference: ref,
      sourceTitle: catalog.title,
      sourceUrl: catalog.url,
      dataType: "OFFICIAL REQUIREMENT",
    };
  });
}

function getContextConfig(skillKey) {
  const config = contextProgressionResearch[skillKey];
  if (!config) {
    throw new Error(`Missing contextProgressionResearch for ${skillKey}`);
  }
  return config;
}

function startingContexts(config) {
  const first = config.steps[0];
  return {
    environment: [first.environment],
    traffic: [first.traffic],
    light: [first.light ?? "daylight"],
    weather: [first.weather ?? "dry"],
    contextSensitivity: config.contextSensitivity,
    dataType: "PEDAGOGICAL PRACTICE",
  };
}

const allSkills = [];
for (const area of taxonomy.areas) {
  for (const skill of area.skills) {
    allSkills.push({ ...skill, areaKey: area.areaKey });
  }
}

// Artifact 1: official basis
const officialBasisArtifact = {
  ...META,
  artifact: "skill-official-basis-v1",
  description:
    "Mapping of each canonical skill to official Swedish sources (skill → officialBasis[]). Does not imply training order. Taxonomy whyNeeded is intentionally omitted — it is not guaranteed official text.",
  sourceCatalog: taxonomy.sources,
  skills: allSkills.map((skill) => ({
    skillKey: skill.skillKey,
    title: skill.title,
    areaKey: skill.areaKey,
    mvpPriority: skill.mvpPriority,
    officialBasis: mapOfficialBasis(skill),
  })),
};

// Artifact 2: prerequisites
const prerequisitesArtifact = {
  ...META,
  artifact: "skill-prerequisites-v1",
  description: "Pedagogical prerequisite graph between skills. Official requirements live in skill-official-basis-v1.json, not on edges. strength=hard marks strong pedagogical dependencies only.",
  introductionStages: [
    { key: "foundation", dataType: "PEDAGOGICAL PRACTICE" },
    { key: "controlled_traffic", dataType: "PEDAGOGICAL PRACTICE" },
    { key: "mixed_traffic", dataType: "PEDAGOGICAL PRACTICE" },
    { key: "complex_traffic", dataType: "PEDAGOGICAL PRACTICE" },
    { key: "independent_readiness", dataType: "PEDAGOGICAL PRACTICE" },
  ],
  pedagogicalChains: [
    {
      name: "vehicle_basics",
      dataType: "PEDAGOGICAL PRACTICE",
      skills: [
        "car_control_pre_drive_check",
        "car_control_smooth_start_stop",
        "car_control_braking",
        "positioning_road_position",
      ],
      note: "Typisk tidig kedja — inte obligatorisk ordning.",
    },
    {
      name: "observation_to_interaction",
      dataType: "PEDAGOGICAL PRACTICE",
      skills: [
        "observation_mirror_routine",
        "observation_blind_spot",
        "observation_scanning",
        "observation_signaling",
      ],
    },
    {
      name: "intersections_to_roundabout",
      dataType: "PEDAGOGICAL PRACTICE",
      skills: [
        "intersections_right_hand_rule",
        "intersections_give_way",
        "roundabout_entry",
        "roundabout_positioning",
        "roundabout_exit",
      ],
    },
  ],
  skills: allSkills.map((skill) => ({
    skillKey: skill.skillKey,
    title: skill.title,
    introductionStage: stageMap[skill.skillKey],
    introductionStageDataType: "PEDAGOGICAL PRACTICE",
    prerequisites: prereqResearch[skill.skillKey]?.prerequisites ?? [],
    taxonomyLikelyPrerequisites: skill.likelyPrerequisites,
    taxonomyDeviations: [],
  })),
};

// Mark deviations
const devMap = {
  maneuver_hill_start: "gear_shifting hard should be conditional on manual transmission",
  independent_eco_driving: "route_planning demoted to soft; speed_adaptation is official hard",
  intersections_give_way: "added soft braking prerequisite",
  car_control_speed_adaptation: "added soft positioning prerequisite",
};
for (const s of prerequisitesArtifact.skills) {
  if (devMap[s.skillKey]) {
    s.taxonomyDeviations.push({
      issue: devMap[s.skillKey],
      dataType: "PRODUCT HYPOTHESIS",
    });
  }
}

// Artifact 3: context progression + assessment criteria
const contextArtifact = {
  ...META,
  artifact: "skill-context-progression-v1",
  description: "Per-skill starting contexts, context ladders, and supervisor assessment guidance.",
  contextCombinationRule: {
    rule: "Per-skill context ladder — no global environment ranking. Increase at most one ordinal dimension (traffic/light/weather) after independent within the skill's ladder model; needs_help → same or easier step.",
    dataType: "PRODUCT HYPOTHESIS",
  },
  skills: allSkills.map((skill) => {
    const config = getContextConfig(skill.skillKey);
    return {
      skillKey: skill.skillKey,
      title: skill.title,
      contextSensitivity: config.contextSensitivity,
      contextNote: config.note ?? null,
      recommendedStartingContexts: startingContexts(config),
      contextProgression: config.steps.map((step, i) => ({
        step: i + 1,
        environment: step.environment,
        traffic: step.traffic,
        light: step.light ?? "daylight",
        weather: step.weather ?? "dry",
        ...(step.ladderNote ? { ladderNote: step.ladderNote } : {}),
        dataType: i === 0 ? "PEDAGOGICAL PRACTICE" : "PRODUCT HYPOTHESIS",
      })),
      progressionGuidance: {
        needs_help: "repeat_same_or_easier",
        with_support: "repeat_similar",
        independent: "increase_context_or_adjacent_skill",
        dataType: "PRODUCT HYPOTHESIS",
      },
      assessmentCriteria: assessmentCriteria(skill),
    };
  }),
};

// Artifact 4: first drive + recommendation rules
const rulesArtifact = {
  ...META,
  artifact: "first-drive-recommendation-rules-v1",
  description: "Rules for zero-observation starting points and post-observation next steps.",
  firstDriveStartingPoints: [
    {
      skillKey: "car_control_pre_drive_check",
      title: "Säkerhetskontroll",
      priority: 1,
      dataType: "PEDAGOGICAL PRACTICE",
      rationale: "Naturlig startpunkt före första passet — etablerar rutin.",
      officialEvidence: [
        { sourceId: "tsfs-2012-43", reference: "TSFS 2012:43, 14–17 §§" },
        { sourceId: "ts-rad-handledaren-2026", reference: "Råd till handledaren 2026-08-01" },
      ],
    },
    {
      skillKey: "car_control_smooth_start_stop",
      title: "Start och stannande",
      priority: 2,
      dataType: "PEDAGOGICAL PRACTICE",
      rationale: "Första motoriska tröskel på lugn yta.",
      officialEvidence: [
        { sourceId: "tsfs-2011-20", reference: "TSFS 2011:20, 2 kap. 2 § p. 4" },
        { sourceId: "trv-korprov-b", reference: "Trafikverket: start från vägkant" },
      ],
    },
    {
      skillKey: "car_control_braking",
      title: "Bromsning",
      priority: 3,
      dataType: "PEDAGOGICAL PRACTICE",
      rationale: "Grundbroms direkt efter start/stopp i samma pass.",
      officialEvidence: [
        { sourceId: "tsfs-2011-20", reference: "TSFS 2011:20, 2 kap. 2 § p. 5" },
        { sourceId: "tsfs-2012-43", reference: "TSFS 2012:43, 18 §" },
      ],
    },
    {
      skillKey: "positioning_road_position",
      title: "Placering på vägen",
      priority: 4,
      dataType: "PEDAGOGICAL PRACTICE",
      rationale: "Nästa steg när eleven lämnar tom yta — placering i körfält.",
      officialEvidence: [
        { sourceId: "ts-planera-ovningskorning", reference: "Planera övningskörningen — lugna platser först" },
      ],
    },
    {
      skillKey: "observation_signaling",
      title: "Tecken och blinkers",
      priority: 5,
      optional: true,
      dataType: "PEDAGOGICAL PRACTICE",
      rationale: "Enkel tidig vinst; kan kombineras med start/stopp.",
      officialEvidence: [],
    },
  ],
  firstDriveDataType: "PEDAGOGICAL PRACTICE",
  observationProgressionRules: {
    needs_help: {
      action: "repeat_same_or_easier_context",
      priority: 1,
      dataType: "PRODUCT HYPOTHESIS",
      alignsWith: "Transportstyrelsen — öva tills momentet sitter",
    },
    with_support: {
      action: "repeat_same_context",
      optionalAdjacentPrerequisite: true,
      dataType: "PRODUCT HYPOTHESIS",
    },
    independent: {
      action: "increase_one_context_dimension_or_introduce_adjacent_skill",
      dataType: "PRODUCT HYPOTHESIS",
    },
  },
  recommendationEvidenceExamples: [
    {
      dataType: "PRODUCT HYPOTHESIS",
      example: {
        skillKey: "positioning_road_position",
        lastAssessment: "independent",
        lastContext: ctx("residential", "light"),
        inference: "Not done everywhere — suggest same skill at urban + moderate traffic",
        nextStep: ctx("urban", "moderate"),
      },
    },
    {
      dataType: "PRODUCT HYPOTHESIS",
      example: {
        skillKey: "intersections_give_way",
        lastAssessment: "needs_help",
        lastContext: ctx("urban", "moderate"),
        inference: "Repeat same skill or step down to residential + light",
        nextStep: ctx("residential", "light"),
      },
    },
  ],
  recommendationPriorityOrder: [
    "active_training_focus",
    "needs_help_recent",
    "with_support_recent",
    "independent_context_step_up",
    "adjacent_unobserved_core",
    "first_drive_starting_points",
  ],
  explicitlyNotModelled: [
    "readiness_percentage",
    "required_lesson_count",
    "universal_mandatory_skill_order",
    "exact_repetition_count",
    "ML/AI predictions",
  ],
};

// Combined index for convenience
const combinedArtifact = {
  ...META,
  artifact: "progression-model-draft-v1",
  description: "Combined index of four research artifacts. NOT read by runtime.",
  artifacts: {
    officialBasis: "skill-official-basis-v1.json",
    prerequisites: "skill-prerequisites-v1.json",
    contextProgression: "skill-context-progression-v1.json",
    firstDriveRules: "first-drive-recommendation-rules-v1.json",
  },
  skills: allSkills.map((skill) => {
    const config = getContextConfig(skill.skillKey);
    return {
      skillKey: skill.skillKey,
      title: skill.title,
      officialBasis: mapOfficialBasis(skill),
      introductionStage: stageMap[skill.skillKey],
      prerequisites: prereqResearch[skill.skillKey]?.prerequisites ?? [],
      contextSensitivity: config.contextSensitivity,
      recommendedStartingContexts: {
        environment: [config.steps[0].environment],
        traffic: [config.steps[0].traffic],
        light: [config.steps[0].light ?? "daylight"],
        weather: [config.steps[0].weather ?? "dry"],
      },
      contextProgression: config.steps,
      progressionGuidance: {
        needs_help: "repeat_same_or_easier",
        with_support: "repeat_similar",
        independent: "increase_context_or_move_forward",
      },
      assessmentCriteria: {
        needs_help: assessmentCriteria(skill).needs_help,
        with_support: assessmentCriteria(skill).with_support,
        independent: assessmentCriteria(skill).independent,
      },
    };
  }),
};

const EXPECTED_SKILL_COUNT = 38;
const canonicalSkillKeys = new Set(allSkills.map((s) => s.skillKey));

function countDataTypes(artifact, path = "") {
  const counts = { official: 0, practice: 0, hypothesis: 0 };
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    if (obj.dataType === "OFFICIAL REQUIREMENT") counts.official++;
    else if (obj.dataType === "PEDAGOGICAL PRACTICE") counts.practice++;
    else if (obj.dataType === "PRODUCT HYPOTHESIS") counts.hypothesis++;
    for (const v of Object.values(obj)) walk(v);
  }
  walk(artifact);
  return counts;
}

function validateArtifacts(artifacts) {
  const errors = [];

  if (allSkills.length !== EXPECTED_SKILL_COUNT) {
    errors.push(`Taxonomy skill count ${allSkills.length} !== ${EXPECTED_SKILL_COUNT}`);
  }

  for (const [name, artifact] of Object.entries(artifacts)) {
    if (artifact.status !== "draft") errors.push(`${name}: status must be draft`);
    if (artifact.notRuntime !== true) errors.push(`${name}: notRuntime must be true`);
    if (artifact.skills) {
      if (artifact.skills.length !== EXPECTED_SKILL_COUNT) {
        errors.push(`${name}: expected ${EXPECTED_SKILL_COUNT} skills, got ${artifact.skills.length}`);
      }
      for (const s of artifact.skills) {
        if (!canonicalSkillKeys.has(s.skillKey)) {
          errors.push(`${name}: unknown skillKey ${s.skillKey}`);
        }
      }
    }
  }

  const disallowedOfficialBasisSkillFields = [
    "officialSummary",
    "whyNeeded",
    "taxonomyRationale",
    "dataType",
  ];
  for (const s of officialBasisArtifact.skills) {
    for (const field of disallowedOfficialBasisSkillFields) {
      if (field in s) {
        errors.push(
          `officialBasis skill ${s.skillKey}: must not include ${field} (not guaranteed official)`,
        );
      }
    }
    if (!s.officialBasis?.length) {
      errors.push(`officialBasis skill ${s.skillKey}: officialBasis must be non-empty`);
    }
    for (const b of s.officialBasis) {
      if (b.dataType !== "OFFICIAL REQUIREMENT") {
        errors.push(
          `officialBasis ${s.skillKey} → ${b.sourceId}: entry must be OFFICIAL REQUIREMENT`,
        );
      }
      if (!SOURCE_CATALOG[b.sourceId]) {
        errors.push(`officialBasis ${s.skillKey}: unknown sourceId ${b.sourceId}`);
      } else if (!b.sourceUrl) {
        errors.push(`officialBasis ${s.skillKey}: null sourceUrl for ${b.sourceId}`);
      } else if (b.sourceUrl !== SOURCE_CATALOG[b.sourceId].url) {
        errors.push(`officialBasis ${s.skillKey}: sourceUrl mismatch for ${b.sourceId}`);
      }
    }
  }

  for (const s of prerequisitesArtifact.skills) {
    if (!stageMap[s.skillKey]) errors.push(`Missing introductionStage for ${s.skillKey}`);
    for (const p of s.prerequisites) {
      if (!canonicalSkillKeys.has(p.skillKey)) {
        errors.push(`prerequisite ${s.skillKey} → ${p.skillKey}: unknown skillKey`);
      }
      if (p.dataType === "OFFICIAL REQUIREMENT") {
        errors.push(`prerequisite ${s.skillKey} → ${p.skillKey}: must not be OFFICIAL REQUIREMENT`);
      }
    }
  }

  for (const p of rulesArtifact.firstDriveStartingPoints) {
    if (!canonicalSkillKeys.has(p.skillKey)) {
      errors.push(`firstDrive: unknown skillKey ${p.skillKey}`);
    }
    if (p.dataType === "OFFICIAL REQUIREMENT") {
      errors.push(`firstDrive ${p.skillKey}: must not be OFFICIAL REQUIREMENT`);
    }
    for (const ev of p.officialEvidence ?? []) {
      if (!SOURCE_CATALOG[ev.sourceId]) {
        errors.push(`firstDrive ${p.skillKey}: unknown officialEvidence sourceId ${ev.sourceId}`);
      }
    }
  }

  for (const skillKey of canonicalSkillKeys) {
    if (!contextProgressionResearch[skillKey]) {
      errors.push(`Missing contextProgressionResearch for ${skillKey}`);
    }
    if (!prereqResearch[skillKey]) {
      errors.push(`Missing prereqResearch for ${skillKey}`);
    }
  }

  if (errors.length) {
    throw new Error(`Generator validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  }
}

const artifacts = {
  officialBasis: officialBasisArtifact,
  prerequisites: prerequisitesArtifact,
  contextProgression: contextArtifact,
  firstDriveRules: rulesArtifact,
  combined: combinedArtifact,
};

validateArtifacts(artifacts);

const prereqCounts = countDataTypes(prerequisitesArtifact);
const firstDriveCounts = countDataTypes({
  firstDriveStartingPoints: rulesArtifact.firstDriveStartingPoints,
});
const officialBasisEntryCount = officialBasisArtifact.skills.reduce(
  (n, s) => n + s.officialBasis.length,
  0,
);

const outDir = join(root, "docs/domain");
writeFileSync(
  join(outDir, "skill-official-basis-v1.json"),
  JSON.stringify(officialBasisArtifact, null, 2) + "\n",
);
writeFileSync(
  join(outDir, "skill-prerequisites-v1.json"),
  JSON.stringify(prerequisitesArtifact, null, 2) + "\n",
);
writeFileSync(
  join(outDir, "skill-context-progression-v1.json"),
  JSON.stringify(contextArtifact, null, 2) + "\n",
);
writeFileSync(
  join(outDir, "first-drive-recommendation-rules-v1.json"),
  JSON.stringify(rulesArtifact, null, 2) + "\n",
);
writeFileSync(
  join(outDir, "progression-model-draft-v1.json"),
  JSON.stringify(combinedArtifact, null, 2) + "\n",
);

console.log("Generated 5 files for", allSkills.length, "skills");
console.log("Validation: PASS");
console.log(
  JSON.stringify(
    {
      skillCount: allSkills.length,
      officialBasisEntries: officialBasisEntryCount,
      prerequisiteEdges: prereqCounts,
      firstDriveEntries: firstDriveCounts,
      meta: { status: META.status, notRuntime: META.notRuntime },
    },
    null,
    2,
  ),
);
