export interface SupervisorSkillGuide {
  lookFor: string[];
  coachTips: string[];
  discuss: string;
  tryWhen: string;
}

export interface SupervisorRoleChapter {
  key: "before" | "during" | "after";
  title: string;
  points: string[];
}

export const SUPERVISOR_ROLE_CHAPTERS: SupervisorRoleChapter[] = [
  {
    key: "before",
    title: "Före körpasset",
    points: [
      "Kolla att eleven har körkortstillstånd och id i bilen, och att ditt handledargodkännande gäller just den här eleven.",
      "Bilen ska vara säker och ha en synlig ÖVNINGSKÖR-skylt bak.",
      "Bestäm vad ni ska träna på och var — 2–3 moment räcker.",
    ],
  },
  {
    key: "during",
    title: "Under körpasset",
    points: [
      "Börja lugnt. Vänta med tät trafik tills eleven hanterar bilen.",
      "Ge instruktioner i tid, och säg gärna varför — inte bara vad.",
      "Öva tills eleven kan momentet själv innan ni tar nästa. Ta pauser.",
      "Du är ansvarig förare. Trafiksäkerheten går alltid först.",
    ],
  },
  {
    key: "after",
    title: "Efter körpasset",
    points: [
      "Låt eleven säga vad som gick bra och vad som känns osäkert.",
      "Bedöm bara dagens 2–3 moment. Det tar cirka 15 sekunder.",
      "Kom överens om nästa fokus och när ni kör igen.",
    ],
  },
];

const GUIDES: Record<string, SupervisorSkillGuide> = {
  car_control_pre_drive_check: {
    lookFor: [
      "Eleven går runt bilen utan att du räknar upp listan.",
      "Stol, ratt, speglar och bälte sitter innan ni rullar.",
      "Varningslampor och uppenbara fel tas på allvar.",
    ],
    coachTips: [
      "Gör kontrollen till en vana före varje pass, även korta turer.",
      "Be eleven berätta vad hen tittar på — inte bara peka.",
      "Bryt inte in förrän hen missar något viktigt.",
    ],
    discuss: "Vad skulle du göra om en varningslampa tändes nu?",
    tryWhen: "Före varje körpass, oavsett miljö.",
  },
  car_control_smooth_start_stop: {
    lookFor: [
      "Start utan ryck eller onödigt motorstopp.",
      "Stannar i tid, mjukt, utan att rulla.",
      "Spegel och beredskap innan ni rullar från kanten.",
    ],
    coachTips: [
      "Öva först på tom parkering eller tyst villaområde.",
      "Säg “mjukt” hellre än en lång instruktion mitt i manövern.",
      "Låt eleven känna kopplingen själv. Räkna inte tempo.",
    ],
    discuss: "När kände du att bilen var på väg att rycka — och vad gjorde du då?",
    tryWhen: "Lugnt område, torr väg, innan tät trafik.",
  },
  car_control_braking: {
    lookFor: [
      "Ser tidigt att farten ska ner.",
      "Mjuk broms i vanlig körning, bestämd när det behövs.",
      "Inte sent, hårt och överraskat.",
    ],
    coachTips: [
      "Peka långt fram: “där ska farten redan vara nere”.",
      "Öva både mjukt stopp och ett tydligare stopp, på säker plats.",
      "Fråga vad hen såg — inte bara hur hårt hen tryckte.",
    ],
    discuss: "Hur tidigt såg du att vi skulle behöva sakta in?",
    tryWhen: "Raksträcka med god sikt, sedan i vanlig trafik.",
  },
  car_control_gear_shifting: {
    lookFor: [
      "Växel efter fart, inte efter slentrian.",
      "Byter utan att titta ner.",
      "Blicken stannar på vägen.",
    ],
    coachTips: [
      "Öva växling stillastående först om det behövs, sen rullande.",
      "Påminn om blicken, inte bara handen.",
      "Hoppa över momentet om ni kör automat.",
    ],
    discuss: "När visste du att det var dags att byta växel?",
    tryWhen: "Lugnt område. Inte samtidigt som nya trafikregler.",
  },
  car_control_speed_adaptation: {
    lookFor: [
      "Anpassar mot skylt, men också sikt och väglag.",
      "Sänker när det är trångt, barn eller dålig sikt.",
      "Jagar inte maxfarten.",
    ],
    coachTips: [
      "Fråga “vilken fart passar här?” innan ni kommer fram.",
      "Beröm tidig sänkning, inte bara rätt siffra på mätaren.",
      "Byt miljö när 30- och 50-känslan sitter.",
    ],
    discuss: "Varför var just den här farten lagom — inte bara tillåten?",
    tryWhen: "Blandade skyltar i villaområde och tätort.",
  },
  observation_mirror_routine: {
    lookFor: [
      "Spegel före fartsänkning, sväng och byte.",
      "Tittar bakåt när något händer bakom.",
      "Inte bara en snabb nick utan att se.",
    ],
    coachTips: [
      "Säg “spegel” i tid, sen tystna när vanan kommer.",
      "Fråga vad hen såg i spegeln, inte om hen tittade.",
      "Öva samma rutin varje gång ni stannar eller svänger.",
    ],
    discuss: "Vad såg du bakom oss senast du tittade?",
    tryWhen: "Varje pass. Extra tydligt i stadstrafik.",
  },
  observation_blind_spot: {
    lookFor: [
      "Speglar först, sedan axelblick.",
      "Manöver först efter blicken.",
      "Gör det vid byte, start från kant och vissa svängar.",
    ],
    coachTips: [
      "Visa själv en gång i stillastående: spegel, axel, sen gas.",
      "Bryt lugnt om hen rullar ut utan blicken.",
      "Koppla ihop med blinkers så det blir en kedja.",
    ],
    discuss: "När räcker spegeln inte — och vad gör du då?",
    tryWhen: "Start från kant och körfältsbyte i lugn trafik.",
  },
  observation_signaling: {
    lookFor: [
      "Visar avsikt i tid, inte mitt i manövern.",
      "Blinkar före sväng, byte och utfart.",
      "Släcker när momentet är klart.",
    ],
    coachTips: [
      "Påminn före korsningen, inte i den.",
      "Förklara att tecken är för andra, inte för provet.",
      "Låt eleven säga högt när hen tänker blinka, sen tystna.",
    ],
    discuss: "Vem behövde veta vad du skulle göra just där?",
    tryWhen: "Kända rundor med flera svängar.",
  },
  observation_scanning: {
    lookFor: [
      "Tittar långt fram, inte bara på bilen framför.",
      "Söker sidorna och det som kan hända.",
      "Farten sjunker när sikten blir sämre.",
    ],
    coachTips: [
      "Be eleven berätta tre saker hen ser långt fram.",
      "Peka inte på allt. Låt hen upptäcka först.",
      "Öva “vad kan hända här?” vid busshållplats och övergång.",
    ],
    discuss: "Vad kan hända bakom den parkerade bilen?",
    tryWhen: "Tätort med parkerade bilar och övergångsställen.",
  },
  positioning_road_position: {
    lookFor: [
      "Ligger mitt i körfältet, inte mot kant eller mittlinje.",
      "Lucka till parkerade bilar och mötande.",
      "Håller spåret i kurva.",
    ],
    coachTips: [
      "Använd en referens: “huven mot linjen”, inte “lite mer åt vänster”.",
      "Öva på bred och smal gata samma pass.",
      "Säg till tidigt om hen driver mot kantsten.",
    ],
    discuss: "Vad höll du avstånd till — kanten, linjen eller de parkerade?",
    tryWhen: "Villagata först, sedan tätare stad.",
  },
  positioning_lane_selection: {
    lookFor: [
      "Väljer fält efter vart ni ska, inte efter kön.",
      "Byter i tid, inte i sista stund.",
      "Läser skyltar och pilar i marken.",
    ],
    coachTips: [
      "Säg målet tidigt: “vi ska vänster i nästa”.",
      "Låt eleven välja fält, sen bekräfta.",
      "Stanna och titta på skyltningen om det blev fel.",
    ],
    discuss: "Vilket körfält behövde vi — och när visste du det?",
    tryWhen: "Flerfältsväg mot ett känt mål.",
  },
  positioning_lane_change: {
    lookFor: [
      "Planerar bytet, inte impuls.",
      "Spegel, blinkers, döda vinkeln, sen lucka.",
      "Byter utan att skära in.",
    ],
    coachTips: [
      "Håll kedjan: spegel–tecken–blick–byte.",
      "Om luckan är för liten: “vänta, ta nästa”.",
      "Öva först där farten är låg.",
    ],
    discuss: "Var kedjan komplett, eller hoppade något steg över?",
    tryWhen: "Lugn flerfilig gata i dagsljus.",
  },
  positioning_turning: {
    lookFor: [
      "Farten är nere före svängen.",
      "Rätt placering och tecken.",
      "Spår genom svängen utan att skära.",
    ],
    coachTips: [
      "Dela upp: in mot svängen, genom, ut.",
      "Titta dit ni ska — händerna följer blicken.",
      "Öva vänster och höger var för sig.",
    ],
    discuss: "Var farten redan rätt innan du vred, eller bromsade du mitt i?",
    tryWhen: "Kända korsningar med god sikt.",
  },
  intersections_right_hand_rule: {
    lookFor: [
      "Känner igen korsning utan märke.",
      "Sänker och söker åt höger.",
      "Lämnar företräde när det krävs.",
    ],
    coachTips: [
      "Öva just de omärkta korsningarna i villaområdet.",
      "Säg “kolla höger” i tid, sen tystna.",
      "Fråga hur hen visste att det var högerregel.",
    ],
    discuss: "Hur såg du att det inte fanns något märke här?",
    tryWhen: "Lugna villakorsningar, dagsljus.",
  },
  intersections_give_way: {
    lookFor: [
      "Ser märke, linje eller dålig sikt i tid.",
      "Stannar eller släpper fram på riktigt.",
      "Kör ut först när luckan räcker.",
    ],
    coachTips: [
      "Låt eleven säga “jag släpper” högt innan hen rullar.",
      "Om sikten är dålig: kryp fram, inte gissa.",
      "Beröm en lucka hen avstod från.",
    ],
    discuss: "När visste du att luckan räckte?",
    tryWhen: "Kända utfarter mot 50-väg.",
  },
  intersections_traffic_lights: {
    lookFor: [
      "Anpassar farten mot ljuset.",
      "Är beredd på skifte.",
      "Hamnar inte i korsningen på rött.",
    ],
    coachTips: [
      "Prata om “hinna stanna mjukt”, inte chansa på gult.",
      "Öva samma ljus flera varv.",
      "Påminn om att titta även när det är grönt.",
    ],
    discuss: "Vad var din plan om ljuset slocknade till gult nu?",
    tryWhen: "Trafikljus med god sikt, först utan rusning.",
  },
  roundabout_entry: {
    lookFor: [
      "Sänker före infarten.",
      "Lämnar företräde åt cirkulationen.",
      "Tar en lucka utan att stanna i onödan.",
    ],
    coachTips: [
      "Öva en enkel enfältsrondell många varv.",
      "Säg “titta vänster” i tid.",
      "Om hen fryser: ta ett varv till, inte en lång utskällning.",
    ],
    discuss: "Hur valde du luckan — för tidig, lagom eller i sista stund?",
    tryWhen: "Liten rondell i villaområde först.",
  },
  roundabout_positioning: {
    lookFor: [
      "Väljer läge efter vilken utfart ni ska ta.",
      "Håller spåret utan att skära.",
      "Rätt fält i flerfältsrondell.",
    ],
    coachTips: [
      "Säg utfarten tidigt: “tredje avfarten”.",
      "Ta flerfältsrondell först när enfält sitter.",
      "Titta på pilar i marken tillsammans i stillastående om det behövs.",
    ],
    discuss: "Vilket läge behövde vi för just den utfarten?",
    tryWhen: "Känd enfältsrondell, senare större led.",
  },
  roundabout_exit: {
    lookFor: [
      "Blinkar ut i tid.",
      "Tar ytterläge om det behövs.",
      "Lämnar utan att störa den som fortsätter.",
    ],
    coachTips: [
      "Koppla blinkers till “nu lämnar vi”.",
      "Öva att avstå från en trång lucka ut.",
      "Kör samma rondell åt flera håll.",
    ],
    discuss: "När började du visa att vi skulle ut?",
    tryWhen: "Samma rondell som infarten, flera varv.",
  },
  urban_vulnerable_road_users: {
    lookFor: [
      "Ser gående, cykel och barn i tid.",
      "Sänker och lämnar lucka.",
      "Söker ögonkontakt när det går.",
    ],
    coachTips: [
      "Be eleven peka ut oskyddade långt fram.",
      "Sänk själv tonen vid skola och övergång — inte panik.",
      "Beröm tidig upptäckt mer än sen inbromsning.",
    ],
    discuss: "Vem såg du först — och vad kunde hen göra plötsligt?",
    tryWhen: "Tätort dagtid, gärna nära skola eller centrum.",
  },
  urban_passing_stationary: {
    lookFor: [
      "Sänker före stillastående bil eller buss.",
      "Lämnar lucka, inte trångt inpå.",
      "Kollar mötande innan hen passerar.",
    ],
    coachTips: [
      "Säg “här kan en dörr öppnas” vid parkerade rader.",
      "Öva att stanna och släppa mötande.",
      "Buss i hållplats: extra låg fart.",
    ],
    discuss: "Vad kunde komma fram bakom den stillastående bilen?",
    tryWhen: "Gata med parkerade bilar och en busshållplats.",
  },
  urban_tight_spaces: {
    lookFor: [
      "Låg fart när det är smalt.",
      "Placering mellan bilar och kant.",
      "Möte utan att frysa helt.",
    ],
    coachTips: [
      "Hellre för långsamt än att skrapa.",
      "Bestäm vem som släpper — öva att backa undan.",
      "Ta villagata först, sen trängre centrum.",
    ],
    discuss: "Hur visste du om du skulle släppa eller fortsätta?",
    tryWhen: "Villagata med möte, dagsljus.",
  },
  rural_joining_and_leaving: {
    lookFor: [
      "Rätt fart ut på och av landsvägen.",
      "Placering och tecken i tid.",
      "Lucka som räcker i 70–90.",
    ],
    coachTips: [
      "Stå stilla och titta på luckorna först.",
      "Säg “vänta” hellre än att tvinga ut.",
      "Öva samma utfart flera gånger.",
    ],
    discuss: "Hur lång lucka behövde du i den här farten?",
    tryWhen: "Känd utfart mot landsväg, god sikt, dagsljus.",
  },
  rural_curves: {
    lookFor: [
      "Läser kurvan i tid.",
      "Sänker före, inte mitt i.",
      "Placering och gas ut.",
    ],
    coachTips: [
      "Be eleven säga “sänker nu” före kurvan.",
      "Inte gas och ratt samtidigt som första övning.",
      "Ta samma kurva åt båda håll.",
    ],
    discuss: "Var hade du redan rätt fart — före eller inne i kurvan?",
    tryWhen: "Landsväg med god sikt, torrt väglag.",
  },
  rural_meeting_traffic: {
    lookFor: [
      "Ser mötet i tid.",
      "Placering och lucka mot mötande.",
      "Sänker och samspelar på smal väg.",
    ],
    coachTips: [
      "Peka långt fram: “där kommer mötet”.",
      "Öva att släppa ner hjulen mot kanten utan att sladda.",
      "Vid osäkerhet: sänk mer, inte mer gas.",
    ],
    discuss: "Vad gjorde du för att mötet skulle kännas tryggt för båda?",
    tryWhen: "Smal landsväg i dagsljus, först utan nederbörd.",
  },
  rural_passing: {
    lookFor: [
      "Väljer plats — eller avstår.",
      "Spegel och tecken.",
      "Går tillbaka utan att skära in.",
    ],
    coachTips: [
      "Avstå är ett godkänt val. Säg det högt.",
      "Ta omkörning sent i träningen, aldrig som första landsvägsmoment.",
      "Om du är tveksam: ni kör inte om.",
    ],
    discuss: "Varför var det här en bra plats — eller varför avstod du?",
    tryWhen: "Rak landsväg med god sikt, låg trafik. Supporting-moment.",
  },
  highway_merging: {
    lookFor: [
      "Använder hela accelerationsfältet.",
      "Spegel, blinkers, lucka.",
      "Stannar inte på rampen.",
    ],
    coachTips: [
      "Kör påfarten först som passagerare och prata luckor.",
      "Målet är att smälta in, inte att nå exakt skyltad fart.",
      "Om det är fullt: fortsätt i fältet och vänta, stanna inte.",
    ],
    discuss: "När visste du att luckan var din?",
    tryWhen: "Känd påfart, dagsljus, inte rusning första gången.",
  },
  highway_lane_discipline: {
    lookFor: [
      "Håller höger när det går.",
      "Vänster till omkörning, sen tillbaka.",
      "Jämn placering i högre fart.",
    ],
    coachTips: [
      "Korta pass först. Hög fart tröttar.",
      "Påminn om avstånd framåt mer än om ratten.",
      "Byt inte fält “bara för att”.",
    ],
    discuss: "Varför låg vi i just det här körfältet?",
    tryWhen: "Efter att påfart sitter, torr väg, dagsljus.",
  },
  highway_exiting: {
    lookFor: [
      "Planerar avfarten i tid.",
      "Byter fält och blinkar.",
      "Sänker på decelerationsfältet, inte ute i filen.",
    ],
    coachTips: [
      "Säg avfartsnumret tidigt och låt eleven leta skylt.",
      "Om ni missar: ta nästa. Inte sen hård inbromsning.",
      "Öva samma avfart flera gånger.",
    ],
    discuss: "När började du leta efter avfarten?",
    tryWhen: "Känd avfart, god skyltning, inte första mörkerpasset.",
  },
  maneuver_reversing: {
    lookFor: [
      "Uppsikt bakåt och åt sidorna.",
      "Låg fart.",
      "Rakt och i sväng utan att gissa.",
    ],
    coachTips: [
      "Öva på tom yta först.",
      "Be eleven vända sig och titta, inte lita bara på kameran.",
      "Korta sträckor. Rulla, titta, rulla.",
    ],
    discuss: "Vad såg du bakom bilen innan du rullade?",
    tryWhen: "Tom parkering, dagsljus, ingen trafik.",
  },
  maneuver_hill_start: {
    lookFor: [
      "Håller emot rullning.",
      "Koppling och gas i balans.",
      "Ingen okontrollerad rullning bakåt eller framåt.",
    ],
    coachTips: [
      "Börja i lätt lutning, inte brant backe.",
      "Handbroms är tillåtet stöd i början.",
      "Automat: öva ändå att inte rulla.",
    ],
    discuss: "Vad höll emot rullningen — fot, handbroms eller båda?",
    tryWhen: "Lugn backe utan bakomvarande kö.",
  },
  maneuver_parallel_parking: {
    lookFor: [
      "Rätt startläge längs gatan.",
      "Uppsikt mot trafik och hörn.",
      "Backar in utan att ta kantsten.",
    ],
    coachTips: [
      "Dela i tre steg: startläge, vinkel, räta upp.",
      "Trafiken runt är viktigare än perfekt lucka.",
      "Ta en stor ficka först.",
    ],
    discuss: "När tittade du ut mot gatan senast under backningen?",
    tryWhen: "Bred gata med stora luckor, låg trafik.",
  },
  maneuver_parking: {
    lookFor: [
      "Väljer plats och riktning medvetet.",
      "Uppsikt hela vägen.",
      "In i fickan utan att skrapa.",
    ],
    coachTips: [
      "Låt eleven välja plats. Diskutera sen om den var klok.",
      "Framåt och bakåt in — båda behövs.",
      "Gå ut och titta på hjulen efteråt första gångerna.",
    ],
    discuss: "Varför just den här rutan — och hur skulle du ta dig ut sen?",
    tryWhen: "Tom parkering, sedan vanligare tomt.",
  },
  maneuver_turning_around: {
    lookFor: [
      "Väljer en säker plats att vända.",
      "Uppsikt hela tiden.",
      "Trepunkt eller slinga utan brådska.",
    ],
    coachTips: [
      "Fråga “är det här en bra plats?” innan hen börjar.",
      "Hellre extra steg än att svänga över linjen i panik.",
      "Öva både slinga och trepunkt.",
    ],
    discuss: "Vad gjorde platsen säker — eller osäker?",
    tryWhen: "Tyst sidogata eller tom yta.",
  },
  independent_route_planning: {
    lookFor: [
      "Håller målet utan att du navigerar varje sväng.",
      "Följer skyltning.",
      "Rättar till utan att frysa om ni kör fel.",
    ],
    coachTips: [
      "Ge ett mål, inte en tur-beskrivning.",
      "Om hen kör fel: “rätta till tryggt”, inte “du skulle vänster”.",
      "Korta kända mål först.",
    ],
    discuss: "När förstod du att vi var på väg fel — och vad gjorde du då?",
    tryWhen: "Känd hemmarunda, sedan ett nytt men skyltat mål.",
  },
  independent_risk_awareness: {
    lookFor: [
      "Ser risken i tid.",
      "Sänker, väntar eller byter plan själv.",
      "Du behöver inte peka.",
    ],
    coachTips: [
      "Vänta tre sekunder innan du säger något.",
      "Fråga “vad kan hända här?” före stället, inte efter.",
      "Beröm tidig handling mer än sen räddning.",
    ],
    discuss: "Vilken risk såg du först — och vad gjorde du utan att jag sa något?",
    tryWhen: "När grunderna sitter, i känd miljö med mer liv.",
  },
  independent_safety_margins: {
    lookFor: [
      "Avstånd framåt som håller i tid.",
      "Lucka åt sidorna.",
      "Inte stötvis inpå.",
    ],
    coachTips: [
      "Använd “tre sekunder” som prat, inte som sanningssiffra.",
      "Peka på när luckan krymper, sen tystna.",
      "Öva i 30 och 50 samma pass.",
    ],
    discuss: "Hade du tid att stanna om bilen framför bromsade nu?",
    tryWhen: "Vanlig tätort efter att start/stopp och blick sitter.",
  },
  independent_eco_driving: {
    lookFor: [
      "Läser trafik så ni kan rulla.",
      "Jämn fart, färre onödiga stopp.",
      "Jagar inte växlar.",
    ],
    coachTips: [
      "Det här är supporting. Ta det sent.",
      "Koppla till planering: ljus, backe, bilen framför.",
      "Säg inte “spara bränsle” om det krockar med säkerheten.",
    ],
    discuss: "Var kunde vi rulla i stället för att bromsa och gasa om?",
    tryWhen: "När eleven redan kör självständigt i känd miljö.",
  },
};

export function supervisorGuideForSkillKey(
  skillKey: string,
): SupervisorSkillGuide | null {
  return GUIDES[skillKey] ?? null;
}

export function supervisorGuideSkillKeys(): string[] {
  return Object.keys(GUIDES);
}
