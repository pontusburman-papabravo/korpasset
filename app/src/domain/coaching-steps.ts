import { AppError } from "../errors.js";

export interface CoachingStep {
  key: string;
  label: string;
}

const STEPS: Record<string, CoachingStep[]> = {
  car_control_pre_drive_check: [
    { key: "outside", label: "Runt bilen: ljus, däck, läckage" },
    { key: "seat_belt", label: "Stol, ratt och bälte" },
    { key: "mirrors", label: "Speglar" },
    { key: "controls", label: "Vätskor och varningslampor" },
  ],
  car_control_smooth_start_stop: [
    { key: "ready", label: "Koppling, växel och spegel innan ni rullar" },
    { key: "start", label: "Mjuk start utan ryck" },
    { key: "stop", label: "Stanna i tid, mjukt, utan rullning" },
  ],
  car_control_braking: [
    { key: "scan", label: "Se tidigt att farten ska ner" },
    { key: "ease", label: "Mjuka bromsen i vanlig körning" },
    { key: "firm", label: "Bestämd broms när det behövs" },
  ],
  car_control_gear_shifting: [
    { key: "choose", label: "Välj växel efter fart" },
    { key: "shift", label: "Byt utan att titta ner" },
    { key: "road", label: "Håll blicken på vägen" },
  ],
  car_control_speed_adaptation: [
    { key: "sign", label: "Anpassa mot skylt" },
    { key: "sight", label: "Anpassa mot sikt och väglag" },
    { key: "traffic", label: "Anpassa mot trafik — inte bara maxfart" },
  ],
  observation_mirror_routine: [
    { key: "before_slow", label: "Spegel före fartsänkning" },
    { key: "before_turn", label: "Spegel före sväng eller byte" },
    { key: "behind", label: "Spegel när något händer bakom" },
  ],
  observation_blind_spot: [
    { key: "mirrors_first", label: "Speglar först" },
    { key: "shoulder", label: "Axelblick i döda vinkeln" },
    { key: "then_move", label: "Manöver först efter blicken" },
  ],
  observation_signaling: [
    { key: "intent", label: "Visa avsikt i tid" },
    { key: "before_move", label: "Blinkers före sväng, byte eller utfart" },
    { key: "off", label: "Släck när momentet är klart" },
  ],
  observation_scanning: [
    { key: "far", label: "Långt fram" },
    { key: "sides", label: "Åt sidorna" },
    { key: "what_if", label: "Vad kan hända — inte bara bilen framför" },
  ],
  positioning_road_position: [
    { key: "lane", label: "Mitt i körfältet" },
    { key: "edge", label: "Inte för nära kant eller mittlinje" },
    { key: "others", label: "Lucka till parkerade och mötande" },
  ],
  positioning_lane_selection: [
    { key: "where", label: "Välj fält efter vart ni ska" },
    { key: "early", label: "Byt i tid, inte i sista stund" },
    { key: "not_follow", label: "Inte bara följa kön" },
  ],
  positioning_lane_change: [
    { key: "plan", label: "Planera bytet" },
    { key: "mirror", label: "Spegel" },
    { key: "signal", label: "Blinkers" },
    { key: "blind_spot", label: "Döda vinkeln" },
    { key: "gap", label: "Byt med lucka" },
  ],
  positioning_turning: [
    { key: "speed", label: "Fart in mot svängen" },
    { key: "place", label: "Rätt placering" },
    { key: "mirror_signal", label: "Spegel och blinkers" },
    { key: "track", label: "Spår genom svängen — inte skära" },
  ],
  intersections_right_hand_rule: [
    { key: "spot", label: "Känna igen korsning utan märke" },
    { key: "slow", label: "Sänk och sök höger" },
    { key: "yield", label: "Lämna företräde åt höger" },
  ],
  intersections_give_way: [
    { key: "sign", label: "Se märke, linje eller dålig sikt" },
    { key: "stop", label: "Stanna eller släpp fram" },
    { key: "gap", label: "Kör ut när luckan räcker" },
  ],
  intersections_traffic_lights: [
    { key: "approach", label: "Anpassa farten mot ljuset" },
    { key: "change", label: "Beredd på skifte" },
    { key: "not_red", label: "Inte i korsningen på rött" },
  ],
  roundabout_entry: [
    { key: "slow", label: "Sänk före infarten" },
    { key: "yield", label: "Företräde åt trafiken i cirkulationen" },
    { key: "gap", label: "Ta en lucka — stanna inte i onödan" },
  ],
  roundabout_positioning: [
    { key: "choose", label: "Välj läge efter utfart" },
    { key: "track", label: "Håll spåret" },
    { key: "multi", label: "Rätt fält i flerfältsrondell" },
  ],
  roundabout_exit: [
    { key: "signal", label: "Blinkers ut i tid" },
    { key: "outer", label: "Ytterläge om det behövs" },
    { key: "leave", label: "Lämna utan att störa" },
  ],
  urban_vulnerable_road_users: [
    { key: "spot", label: "Se gående, cykel och barn i tid" },
    { key: "speed", label: "Sänk och lämna lucka" },
    { key: "eye", label: "Ögonkontakt när det går" },
  ],
  urban_passing_stationary: [
    { key: "slow", label: "Sänk före stillastående" },
    { key: "gap", label: "Lucka till buss, bil eller hinder" },
    { key: "oncoming", label: "Kolla mötande innan ni passerar" },
  ],
  urban_tight_spaces: [
    { key: "slow", label: "Låg fart" },
    { key: "place", label: "Placering mellan bilar och kant" },
    { key: "meet", label: "Möte i villagata utan att frysa" },
  ],
  rural_joining_and_leaving: [
    { key: "speed", label: "Rätt fart ut på / av landsvägen" },
    { key: "place", label: "Placering" },
    { key: "signal", label: "Tecken i tid" },
    { key: "gap", label: "Lucka i 70–90-trafik" },
  ],
  rural_curves: [
    { key: "read", label: "Läs kurvan" },
    { key: "before", label: "Sänk före, inte mitt i" },
    { key: "place", label: "Placering och gas ut" },
  ],
  rural_meeting_traffic: [
    { key: "see", label: "Se mötet i tid" },
    { key: "place", label: "Placering och lucka" },
    { key: "narrow", label: "Smal väg: sänk och samspela" },
  ],
  rural_passing: [
    { key: "decide", label: "Välj plats — eller avstå" },
    { key: "signal", label: "Spegel och tecken" },
    { key: "pass", label: "Accelerera och gå tillbaka utan att skära" },
  ],
  highway_merging: [
    { key: "accel", label: "Använd accelerationsfältet" },
    { key: "mirror", label: "Spegel" },
    { key: "signal", label: "Blinkers" },
    { key: "gap", label: "Smält in i luckan — stanna inte på rampen" },
  ],
  highway_lane_discipline: [
    { key: "right", label: "Håll höger när det går" },
    { key: "overtake", label: "Vänster till omkörning" },
    { key: "place", label: "Jämn placering i hög fart" },
  ],
  highway_exiting: [
    { key: "plan", label: "Planera avfarten i tid" },
    { key: "change", label: "Byt fält och blinka" },
    { key: "slow", label: "Sänk på decelerationsfältet, inte ute i filen" },
  ],
  maneuver_reversing: [
    { key: "look", label: "Uppsikt bakåt och åt sidorna" },
    { key: "slow", label: "Långsamt" },
    { key: "straight", label: "Rakt och i sväng utan att gissa" },
  ],
  maneuver_hill_start: [
    { key: "hold", label: "Håll emot rullning" },
    { key: "balance", label: "Koppling och gas i balans" },
    { key: "go", label: "Rulla inte okontrollerat bakåt eller framåt" },
  ],
  maneuver_parallel_parking: [
    { key: "place", label: "Rätt startläge längs gatan" },
    { key: "scan", label: "Uppsikt mot trafik och hörn" },
    { key: "reverse", label: "Backa in utan att ta kantsten" },
  ],
  maneuver_parking: [
    { key: "choose", label: "Välj plats och riktning" },
    { key: "scan", label: "Uppsikt" },
    { key: "fit", label: "In i fickan utan att skrapa" },
  ],
  maneuver_turning_around: [
    { key: "place", label: "Säker plats att vända" },
    { key: "scan", label: "Uppsikt" },
    { key: "turn", label: "Trepunkt eller slinga utan brådska" },
  ],
  independent_route_planning: [
    { key: "goal", label: "Håll målet" },
    { key: "signs", label: "Följ skyltning" },
    { key: "recover", label: "Rätta till om ni kör fel" },
  ],
  independent_risk_awareness: [
    { key: "see", label: "Se risken i tid" },
    { key: "act", label: "Sänk, vänta eller byt plan" },
    { key: "own", label: "Utan att handledaren pekar" },
  ],
  independent_safety_margins: [
    { key: "front", label: "Avstånd framåt" },
    { key: "side", label: "Lucka åt sidorna" },
    { key: "time", label: "Tid — inte stötvis inpå" },
  ],
  independent_eco_driving: [
    { key: "look", label: "Läs trafik så ni kan rulla" },
    { key: "smooth", label: "Jämn fart, undvik onödiga stopp" },
    { key: "gears", label: "Inte jaga växlar" },
  ],
};

export function coachingStepsForSkillKey(skillKey: string): CoachingStep[] {
  return STEPS[skillKey] ?? [];
}

export function coachingStepLabel(
  skillKey: string,
  stepKey: string,
): string | null {
  return (
    coachingStepsForSkillKey(skillKey).find((step) => step.key === stepKey)
      ?.label ?? null
  );
}

export function normalizeCompletedStepKeys(
  skillKey: string,
  raw: string[] | undefined,
): string[] {
  const allowed = new Set(
    coachingStepsForSkillKey(skillKey).map((step) => step.key),
  );
  const unique: string[] = [];
  for (const key of raw ?? []) {
    const trimmed = key.trim();
    if (!trimmed) continue;
    if (!allowed.has(trimmed)) {
      throw new AppError("Ogiltigt övningssteg", 400, "invalid_coaching_step");
    }
    if (!unique.includes(trimmed)) unique.push(trimmed);
  }
  return unique;
}

export function parseFormStringList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") return [value];
  return [];
}
