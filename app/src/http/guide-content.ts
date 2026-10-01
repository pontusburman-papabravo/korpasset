/** Public practice guides. Plain copy only — HTML is built in guides.ts. */

export interface SitemapPage {
  path: string;
  priority: string;
  changefreq: "weekly" | "monthly" | "yearly";
}

export interface MomentGuide {
  path: string;
  /** Short label in breadcrumbs and “nearby” links. */
  label: string;
  cardTitle: string;
  cardBlurb: string;
  documentTitle: string;
  description: string;
  h1: string;
  intro: string;
  studentCan: string[];
  supervisorWatches: string[];
  steps: string[];
  mistakes: string[];
  readyWhen: string;
  /** What to write down in Körpasset after this pass. */
  cta: string;
}

export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface StandaloneGuide {
  path: string;
  label: string;
  documentTitle: string;
  description: string;
  h1: string;
  eyebrow: string;
  lede: string;
  sections: GuideSection[];
}

export const HUB_PATH = "/ovningskora";
export const SUPERVISOR_PATH = "/handledare";

export const MOMENT_GUIDES: MomentGuide[] = [
  {
    path: "/ovningskora/forsta-gangen",
    label: "Första gången",
    cardTitle: "Första gången",
    cardBlurb: "Ett kort pass: stol, start, stopp och en lugn avslutning.",
    documentTitle: "Första gången ni övningskör · Körpasset",
    description:
      "Ett lugnt första körpass. Vad körkortseleven behöver kunna, vad handledaren tittar efter och när ni ska avsluta innan det blir för mycket.",
    h1: "Första gången ni övningskör",
    intro:
      "Första passet ska kännas litet. Välj en tom yta eller en tyst villagata i dagsljus, och bestäm innan motorn går igång att ni bara tränar att komma iväg, rulla och stanna. Trafikregler, rondell och parkering får vänta tills bilen känns bekant.",
    studentCan: [
      "Ställa in stol, ratt, speglar och bälte själv, och säga vad som ändrades.",
      "Starta utan ryck och stanna mjukt där ni kommit överens om.",
      "Hålla blicken långt fram, inte i växelspaken eller i knät.",
    ],
    supervisorWatches: [
      "Om eleven hinner titta upp innan bilen rullar, eller om händerna redan jobbar.",
      "Om stoppet är bestämt av eleven eller om du får bromsa åt.",
      "Om pratet från dig ökar när det blir tyst i bilen. Tystnad är ofta ett bra tecken.",
    ],
    steps: [
      "Stå stilla bredvid bilen och säg vad passet ska innehålla: start, en kort sträcka, stopp. Inget mer.",
      "Låt eleven sätta stol, speglar och bälte. Fråga vad som sitter fel om något skaver, i stället för att rätta själv.",
      "En start och ett stopp på tom yta. Gör om samma sak tills det känns odramatiskt, inte tills det är perfekt.",
      "Om det fortfarande är lugnt: en kort slinga i villaområdet, samma fart, samma uppgift.",
      "Avsluta medan eleven fortfarande kan berätta vad som hände. Tio lugna minuter slår ett trött pass.",
    ],
    mistakes: [
      "Att fylla första kvarten med allt ni själva var nervösa för: fickparkering, köer, en rondell “på vägen hem”.",
      "Att kommentera varje meter. Eleven hör inte vägen om du pratar oavbrutet.",
      "Att mäta passet i tid. Ett kort pass som slutar med en tydlig nästa gång är ett lyckat första pass.",
    ],
    readyWhen:
      "När eleven kan starta och stanna på den tomma ytan utan att någon av er håller andan. Då är backning på samma yta ett bra nästa pass — inte en ny miljö.",
    cta:
      "Skriv upp de två sakerna som satt och den enda som ska göras om. Nästa handledare ska kunna läsa det utan att ringa dig.",
  },
  {
    path: "/ovningskora/backning",
    label: "Backning",
    cardTitle: "Backning",
    cardBlurb: "Tom yta, blick bakåt och så låg fart att ni hinner stanna.",
    documentTitle: "Öva backning: uppsikt och låg fart · Körpasset",
    description:
      "Backa på tom yta först. Körkortseleven tittar bakåt, håller låg fart och handledaren ser om blicken eller ratten tar över.",
    h1: "Öva backning",
    intro:
      "Backning är ett uppsiktsmoment, inte ett ratttrick. Börja på en tom parkering i dagsljus, utan bilar i vägen. Kameran i bilen kan hjälpa sen. Första gångerna ska eleven vända sig om och se vad som finns bakom.",
    studentCan: [
      "Stanna, titta bakåt och åt sidorna, och först därefter släppa bromsen.",
      "Rulla en billängd, stanna, titta igen. Farten ska vara så låg att ett stopp är odramatiskt.",
      "Backa rakt en kort bit, och sedan en mjuk sväng, utan att gissa var bakhjulet tar vägen.",
    ],
    supervisorWatches: [
      "Om blicken verkligen går bakåt, eller om eleven bara nickar mot spegeln.",
      "Om farten smyger upp så fort svängen börjar.",
      "Om du själv lutar dig och styr med rösten. Då är ytan för svår, inte eleven.",
    ],
    steps: [
      "Välj en tom ruta med gott om asfalt bakom. Peka ut stolpar och kant innan ni rullar.",
      "Eleven sitter stilla, vänder sig och säger vad som syns bakom bilen. Ingen gas än.",
      "Rulla en billängd rakt bakåt. Stanna. Gör om tills spåret är tråkigt.",
      "Lägg till en mjuk sväng. Samma regel: titta, rulla, stanna.",
      "Avsluta där. Fickparkering är ett annat pass, när den här blicken sitter.",
    ],
    mistakes: [
      "Att lita på backkameran som enda uppsikt. Kameran ser inte allt vid sidan.",
      "Att backa långt i ett svep och rätta med stora rattrörelser.",
      "Att öva mellan parkerade bilar första gången, “eftersom det ändå är där man backar”.",
    ],
    readyWhen:
      "När eleven backar en kort sträcka och en mjuk sväng på tom yta och fortfarande tittar ut, inte bara på skärmen. Då kan ni ta en rymlig parkeringsruta.",
    cta:
      "Notera om det var blicken, farten eller svängen som behövde en påminnelse. Nästa pass ska börja med just det, inte med en trängre lucka.",
  },
  {
    path: "/ovningskora/parkering",
    label: "Parkering",
    cardTitle: "Parkering",
    cardBlurb: "Stor ruta först. Uppsikt mot gatan före en perfekt centrerad bil.",
    documentTitle: "Öva parkering med körkortselev · Körpasset",
    description:
      "Så övar ni parkering privat. Välj en rymlig plats, håll uppsikt mot trafiken och vänta med trånga luckor tills backningen sitter.",
    h1: "Öva parkering",
    intro:
      "Parkering går att dela upp. Först en stor ruta på en lugn parkering, framåt in. Sedan en bred ficka längs en gata med lite trafik. En trång stadsgata är ett sent moment. Eleven ska välja platsen själv och kunna säga varför den duger.",
    studentCan: [
      "Peka ut en plats och säga om den är stor nog, och vad som händer om någon kommer bakom.",
      "Köra in i en ruta framåt med uppsikt hela vägen, och stanna innan det tar i.",
      "Backa in i en bred ficka i tre steg: startläge, vinkel, räta upp. Titta ut mot gatan under backningen, inte bara på linjerna.",
    ],
    supervisorWatches: [
      "Om eleven tappar gatan så fort inriktningen mot rutan börjar.",
      "Om platsen var elevens val. En plats du valde säger inget om omdömet.",
      "Om ett lätt stöt mot konen eller linjen blir en omstart med irritation. Ett nytt försök från samma läge räcker.",
    ],
    steps: [
      "Gå ur bilen och titta på en tom ruta tillsammans. Prata om var bakhjulen kommer att ta, inte om betyg.",
      "Eleven kör in framåt, stannar, och ni tittar på hjulen en gång. Sedan ut igen, samma ruta.",
      "Välj en bred ficka utan kö bakom. Dela manövern: lägg bilen parallellt, backa till vinkel, räta upp.",
      "Avbryt om en bil kommer. Trafiken runt är uppgiften, inte att hinna klart.",
      "Spara den trånga luckan till ett annat pass, när den breda fickan känns långsam och odramatisk.",
    ],
    mistakes: [
      "Att jaga en liten lucka för att det “ser ut som uppkörning”.",
      "Att stirra på kantstenen och glömma spegeln ut mot gatan.",
      "Att handledaren rattar med instruktioner i varje centimeter. Då övar eleven att lyda, inte att se.",
    ],
    readyWhen:
      "När eleven kan ta en stor ruta och en bred ficka och fortfarande söker av gatan. Start i backe eller högerregeln är vettigare nästa steg än en smalare ficka samma dag.",
    cta:
      "Skriv vilken plats ni tog och om det var valet, uppsikten eller själva fickan som ska övas igen. Nästa handledare ska inte gissa.",
  },
  {
    path: "/ovningskora/start-i-backe",
    label: "Start i backe",
    cardTitle: "Start i backe",
    cardBlurb: "Lätt lutning, ingen kö bakom, och bilen ska inte rulla.",
    documentTitle: "Start i backe utan att rulla bakåt · Körpasset",
    description:
      "Start i lätt lutning, utan kö bakom. Körkortseleven håller emot rullningen. Handbroms är ett stöd i början, även i automat.",
    h1: "Start i backe",
    intro:
      "Ni behöver en mild backe med fri sikt och ingen bil tätt bakom. Målet är litet: bilen ska stå stilla, och sedan rulla framåt utan att dippa bakåt. En brant backe med kö är fel första plats, oavsett hur modig eleven känner sig.",
    studentCan: [
      "Hålla bilen stilla i lutningen och säga vad som håller emot: fotbroms, handbroms eller båda.",
      "Köra iväg utan en okontrollerad rullning bakåt.",
      "Göra om samma start tre gånger utan att gasa i panik.",
    ],
    supervisorWatches: [
      "Om bilen rör sig bakåt innan den tar fart. En decimeter är redan information.",
      "Om eleven släpper allt på en gång. Då är lutningen för brant, eller så behövs handbromsen som stöd.",
      "Om ni har automat. Momentet finns kvar: bilen ska inte rulla medan foten flyttas.",
    ],
    steps: [
      "Stanna på en svag lutning där det är tomt bakom. Låt eleven känna att bilen vill rulla, med bromsen i.",
      "Första starten med handbroms som stöd. Fot och koppling, eller fotbroms och gas i automat, tills bilen tar emot.",
      "Släpp handbromsen först när bilen vill framåt. Stanna igen och gör om.",
      "Tre lugna starter på samma ställe. Byt inte backe för att det gick en gång.",
      "En aning brantare lutning bara om de tre första var tråkiga och ni fortfarande är ensamma där.",
    ],
    mistakes: [
      "Att börja i en brant backe för att “det är så det är på riktigt”.",
      "Att hoppa över momentet för att bilen är automat. Rullning finns ändå.",
      "Att lägga till en sväng eller en utfart i samma start. En sak i taget.",
    ],
    readyWhen:
      "När eleven kan stå stilla och köra iväg på den lätta lutningen utan att ni båda tittar bakåt i panik. Använd sedan en backe som råkar finnas på vägen, inte som ett nytt projekt samma eftermiddag.",
    cta:
      "Anteckna om det var handbroms, koppling eller bara foten som höll emot, och om nästa pass ska vara samma backe eller en vanlig körning där backen dyker upp.",
  },
  {
    path: "/ovningskora/hogerregeln",
    label: "Högerregeln",
    cardTitle: "Högerregeln",
    cardBlurb: "Omärkta korsningar i villaområdet. Känn igen dem och släpp fram.",
    documentTitle: "Öva högerregeln i villaområdet · Körpasset",
    description:
      "Öva högerregeln där korsningen saknar märke. Körkortseleven ska känna igen den, söka åt höger och faktiskt lämna företräde.",
    h1: "Öva högerregeln",
    intro:
      "Högerregeln sitter inte i en skylt. Den sitter i korsningar som saknar märke och väjningslinje, ofta i villaområden. Välj tre eller fyra sådana korsningar ni redan känner, i dagsljus och låg fart. Eleven ska säga högt om det är högerregel eller om det finns ett märke, innan ni är framme.",
    studentCan: [
      "Se skillnad på en korsning med väjningsplikt och en utan, i tid för att sänka farten.",
      "Söka åt höger och lämna företräde när någon kommer därifrån, inte bara nicka ditåt.",
      "Förklara efteråt varför just den korsningen var högerregel.",
    ],
    supervisorWatches: [
      "Om eleven sänker för att hen såg korsningen, eller för att du sa till.",
      "Om “jag tittade” betyder att bilen ändå rullade ut.",
      "Om varje korsning blir ett stopp av försiktighet. Då är reglerna ihopblandade, och det är värt att stanna och reda ut en i taget.",
    ],
    steps: [
      "Gå igenom kartan i stillastående: vilka korsningar saknar märke, och en där ni faktiskt har väjningsplikt så skillnaden syns.",
      "Kör fram mot den första. Eleven säger “högerregel” eller “märke” innan korsningen.",
      "Om någon kommer från höger: stanna på riktigt och släpp fram. Beröm avståendet, inte bara en mjuk inbromsning.",
      "Ta samma korsningar en gång till. Andra varvet ska din påminnelse “kolla höger” kunna utebli.",
      "Avsluta med att eleven pekar ut en korsning ni inte övade och säger vad som gäller där.",
    ],
    mistakes: [
      "Att bara öva där det är tomt, så eleven aldrig behöver släppa fram någon.",
      "Att titta åt vänster av vana och glömma höger.",
      "Att blanda in en rondell i samma pass. Det är ett annat företräde.",
    ],
    readyWhen:
      "När eleven kan säga varför en korsning saknar märke och lämna företräde utan att du pekar. En liten enfältsrondell är ett bra nästa moment, en annan dag.",
    cta:
      "Skriv vilka korsningar ni tog och om eleven såg dem själv. Nästa gång ska ni kunna åka tillbaka till samma ställe och göra mindre.",
  },
  {
    path: "/ovningskora/rondell",
    label: "Rondell",
    cardTitle: "Rondell",
    cardBlurb: "En enkel enfältsrondell, många varv. Flerfält får vänta.",
    documentTitle: "Öva rondell: infart, läge och utfart · Körpasset",
    description:
      "Börja med en enkel enfältsrondell. Öva fart före infarten, lucka och blinkers ut. Flerfältsrondell får vänta tills den lilla sitter.",
    h1: "Öva rondell",
    intro:
      "Ta en liten enfältsrondell i ett villaområde, inte den stora leden. Kör den flera varv så att infart, läge och utfart blir tre saker ni känner igen, inte en överraskning. Flerfält är ett senare pass, när den här rondellen känns långsam.",
    studentCan: [
      "Sänka farten före infarten och titta åt vänster efter en lucka, utan att stanna i onödan.",
      "Hålla sig i rondellen utan att skära, och veta vilken utfart ni ska ta innan ni är inne.",
      "Blinka ut i tid och lämna utan att störa den som fortsätter runt.",
    ],
    supervisorWatches: [
      "Om eleven fryser vid infarten trots en lucka, eller kastar sig in i en för liten.",
      "Om blinkersen ut kommer när ni redan är på väg ut.",
      "Om du börjar beskriva en flerfältsrondell “medan vi ändå är här”. Det är ett annat pass.",
    ],
    steps: [
      "Stanna före rondellen första gången bara för att peka: här sänker vi, här tittar vi, tredje utfarten är målet. Sedan kör ni.",
      "Eleven tar samma utfart flera varv. Luckan ska väljas, inte hoppas fram.",
      "Byt utfart. Säg den tidigt, så placeringen hinner bli ett val.",
      "Öva att avstå från en trång lucka och ta nästa. Det är ett godkänt beslut.",
      "Avsluta på den här rondellen. En större led är nästa kapitel, inte nästa varv.",
    ],
    mistakes: [
      "Att stanna på infarten varje gång, även när det är fritt.",
      "Att glömma blinkers ut, eller att lägga sig fel för utfarten och rätta mitt i.",
      "Att ta en flerfältsrondell för att den ligger på vägen hem.",
    ],
    readyWhen:
      "När samma enfältsrondell går att köra åt mer än ett håll utan att du säger “titta vänster”. Då kan ni senare lägga till en större, fortfarande i dagsljus och utan rusning.",
    cta:
      "Notera om det var luckan, placeringen eller utfarten som behövde påminnelse. Nästa rondellpass ska ha ett fokus, inte alla tre på nytt.",
  },
  {
    path: "/ovningskora/landsvag",
    label: "Landsväg",
    cardTitle: "Landsväg",
    cardBlurb: "Känd utfart, en kurva och ett möte. Omkörning får vänta.",
    documentTitle: "Övningskörning på landsväg · Körpasset",
    description:
      "När tätorten sitter kan ni ta en känd landsväg i dagsljus: påfart, kurva och möte. Omkörning är inte det första momentet där.",
    h1: "Övningskörning på landsväg",
    intro:
      "Landsväg är högre fart och längre beslut, inte en belöning för att villaområdet gick bra en gång. Vänta tills start, stopp och vanliga korsningar är lugna. Välj en utfart ni känner, med god sikt, i dagsljus. Omkörning hör hemma sent i träningen, och bara om ni båda är överens om att platsen duger.",
    studentCan: [
      "Stå stilla vid utfarten, titta på luckorna och säga om den räcker i den fart som gäller på vägen.",
      "Sänka före en kurva, inte mitt i den, och placera bilen så mötet får plats.",
      "Avstå från en omkörning utan att det känns som ett misslyckande.",
    ],
    supervisorWatches: [
      "Om farten är nere innan kurvan börjar. Broms i kurvan är för sent.",
      "Om luckan ut på vägen var elevens val. En lucka du tvingade fram räknas inte.",
      "Om du själv blir rastlös bakom en långsammare bil. Avstå är ett giltigt beslut, säg det högt.",
    ],
    steps: [
      "Välj utfarten hemma, inte i farten. Dagsljus, torrt väglag, en väg ni har åkt som passagerare.",
      "Stanna och titta på luckor innan eleven kör ut. En utfart, inte en rundtur.",
      "Ta en kurva där eleven säger “sänker nu” innan den börjar. Kör samma kurva åt andra hållet om det går.",
      "Ett möte på en väg som inte är som smalast. Prata efteråt om var ni lade bilen, inte om mod.",
      "Lämna omkörning. Om ni ändå pratar om den: bara för att säga att den får vänta tills resten känns tråkigt.",
    ],
    mistakes: [
      "Att ta landsvägen som första miljö för att “det är mindre trafik”.",
      "Att gasa in i en för kort lucka för att inte stå kvar vid utfarten.",
      "Att lägga in en omkörning som första landsvägsmoment.",
    ],
    readyWhen:
      "När utfarten och kurvan känns odramatiska och eleven sänker utan att du säger till. Motorväg är nästa miljö, en annan dag, med en påfart ni redan känner.",
    cta:
      "Skriv om det var luckan ut, kurvan eller mötet som ska göras om, och att omkörning inte ingick. Nästa förare ska inte hitta på ett svårare pass.",
  },
  {
    path: "/ovningskora/motorvag",
    label: "Motorväg",
    cardTitle: "Motorväg",
    cardBlurb: "En känd påfart i dagsljus. Hela accelerationsfältet, sedan högerfilen.",
    documentTitle: "Öva motorväg: påfart och avfart · Körpasset",
    description:
      "En känd påfart i dagsljus. Använd accelerationsfältet, stanna inte på rampen och planera avfarten innan ni är framme vid den.",
    h1: "Öva motorväg",
    intro:
      "Första motorvägspasset ska vara kort och känt. En påfart ni har åkt förut, dagsljus, inte rusning. Målet är att komma in i trafikrytmen och att komma av igen på en avfart ni valt i förväg. Att ligga kvar länge, byta fil utan anledning eller “ta igen” en missad avfart hör inte hemma här.",
    studentCan: [
      "Använda accelerationsfältet för att närma sig trafiken, och välja en lucka utan att stanna på rampen.",
      "Lägga sig i höger fil och hålla avstånd framåt när ni väl är inne.",
      "Börja leta avfarten i tid, byta fil lugnt och sänka farten på avfartsfältet, inte ute i körfältet.",
    ],
    supervisorWatches: [
      "Om eleven stannar eller nästan stannar på rampen. Då är det för tidigt, eller så behövs ett varv till där du pekar ut luckorna först.",
      "Om blicken fastnar på hastighetsmätaren i stället för på luckan.",
      "Om en missad avfart blir en sen inbromsning. Nästa avfart är rätt beslut.",
    ],
    steps: [
      "Åk påfarten en gång som samtal, om eleven aldrig kört den: var fältet tar slut, var ni tittar, vilken avfart ni ska ta.",
      "Eleven kör in. Hela fältet får användas. Om det är tätt: fortsätt i fältet och vänta på lucka, stanna inte.",
      "En kort stund i höger fil. Inget filbyte “för att prova”.",
      "Säg avfarten tidigt. Eleven ska hinna se skylten själv.",
      "Om ni missar den: ta nästa. Prata om det när ni står stilla, inte mitt i filen.",
    ],
    mistakes: [
      "Att stanna på påfarten för att vänta in en lucka.",
      "Att byta till vänster fil utan att ni ska förbi någon.",
      "Att bromsa i körfältet för att hinna en avfart som redan är förbi.",
    ],
    readyWhen:
      "När samma påfart går att köra utan att någon av er håller andan, och avfarten var planerad. En annan påfart kan vänta till nästa pass. Landsvägen ni redan kan är fortfarande hemmaplan om motorvägen kändes för stor.",
    cta:
      "Skriv vilken påfart och vilken avfart, och om nästa gång ska vara samma ställe. Ett motorvägspass som upprepas är mer värt än tre nya.",
  },
];

export const MOMENT_ORDER = MOMENT_GUIDES.map((guide) => guide.path);

const hubSections: GuideSection[] = [
  {
    heading: "Hur privat övningskörning fungerar",
    paragraphs: [
      "Privat övningskörning betyder att körkortseleven tränar i en vanlig bil med en handledare, mot B-körkort. Ni väljer själva när ni kör, var ni kör och vad passet ska handla om. Det ersätter inte en trafikskola om ni vill ha en, och det är inte ett prov.",
      "Ett körpass blir tydligare om det har ett syfte. Två eller tre moment räcker. Resten av vägen är transport, inte ett nytt kapitel.",
    ],
  },
  {
    heading: "Elev och handledare",
    paragraphs: [
      "Eleven är den som ska kunna köra själv till slut. Handledaren sitter bredvid, väljer miljö efter vad eleven klarar och säger till i tid — och är tyst när det går.",
      "Det kan vara en förälder, en partner eller någon annan vuxen som är godkänd handledare för just den här eleven. Körpasset ändrar inte vem som är ansvarig i bilen. Det hjälper er att komma ihåg vad ni tränade.",
    ],
  },
  {
    heading: "Innan ni börjar",
    paragraphs: [
      "Körpasset ställer inte upp kraven för att få övningsköra. De finns hos Transportstyrelsen: körkortstillstånd, godkänd handledare och hur övningskörningen får gå till. Läs där, och håll isär det från tipsen på den här sidan.",
      "När det formella är på plats kan ni förbereda själva passet. Bestäm en plats, ett moment och hur länge ni tänker hålla på. Kolla att bilen känns bekant för den som ska handleda: stol, speglar, var bromsen sitter. Övningskör-skylten och övriga krav läser ni hos myndigheten, inte ur minnet.",
    ],
  },
  {
    heading: "Så kan ni planera träningen",
    paragraphs: [
      "Börja med det eleven ska kunna i den miljö ni faktiskt har. En tom parkering och en villagata räcker långt. Skriv tre rader före passet: var ni kör, vad ni övar, vad som vore ett bra slut.",
      "Lägg inte ett nytt moment och en ny plats på samma dag. Om rondellen är ny, kör en rondell ni känner. Om landsvägen är ny, ta en utfart ni redan åkt.",
    ],
  },
  {
    heading: "Hur ofta ni bör köra",
    paragraphs: [
      "Det finns inget Körpasset-schema med ett visst antal timmar. Korta pass som återkommer gör mer än ett långt pass någon gång i månaden. Många kommer längre med två lugna varv i veckan än med en söndag som tar slut i irritation.",
      "Om en vecka faller bort: börja nästa gång där ni slutade. Samma moment, samma plats. Ett uppehåll är inte ett skäl att ta något svårare.",
    ],
  },
  {
    heading: "Från enkla moment till svårare",
    paragraphs: [
      "En ordning som brukar hålla är den här. Först start och stopp på lugn plats. Sedan backning och parkering där det är gott om utrymme. Därefter omärkta korsningar och en liten rondell. Landsväg när tätorten är odramatisk. Motorväg sist av de här, på en påfart ni känner.",
      "Hoppa inte för att något “känns viktigt inför uppkörningen”. Ett moment som sitter i en enkel miljö går att ta med till en svårare. Ett moment som bara överlevdes i den svåra miljön behöver ofta göras om.",
    ],
  },
  {
    heading: "Varför det är värt att skriva upp körpassen",
    paragraphs: [
      "Efter ett bra pass minns man känslan. Efter ett stökigt pass minns man irritationen. Ingen av dem säger vad ni ska göra nästa tisdag. Några rader räcker: vad ni övade, hur det gick, vad som ska upprepas.",
      "Det är särskilt värt om ni inte kör varje dag. Nästa pass ska kunna börja utan att ni rekonstruerar förra månaden i bilen.",
    ],
  },
  {
    heading: "När flera handledare delar på samma elev",
    paragraphs: [
      "Mamma och pappa, eller en förälder och en partner, kör sällan likadant. Eleven märker det direkt om den ena börjar om från noll och den andra tar motorvägen. Gemensamma anteckningar gör att nästa person fortsätter, i stället för att gissa.",
      "Kom överens om vem som tar vilket moment den här veckan, och lämna en mening om vad som inte satt. Samma elev, samma historik. Ni behöver inte sitta i bilen samtidigt.",
    ],
  },
  {
    heading: "Hur Körpasset hjälper till",
    paragraphs: [
      "Körpasset är en app för övningskörning. Eleven skapar resan och bjuder in handledarna. Ni väljer ett par moment, kör, och skriver efteråt hur det gick. Nästa pass kan utgå från det, även om det är en annan handledare som öppnar appen.",
      "Appen bedömer inte om eleven är redo för uppkörning och ersätter inte trafikskolan. Den håller ihop planen så att träningen inte bara finns i någons huvud.",
    ],
  },
];

export const PRACTICE_HUB: StandaloneGuide = {
  path: HUB_PATH,
  label: "Övningskörning",
  documentTitle: "Privat övningskörning – guide för elev och handledare · Körpasset",
  description:
    "Så fungerar privat övningskörning mot B-körkort. Planera passen, gå från enkla moment till svårare och håll ihop körkortselev och handledare.",
  h1: "Privat övningskörning, steg för steg",
  eyebrow: "Guide",
  lede:
    "För dig som hjälper någon att ta B-körkort: förälder, partner eller annan handledare. Här är ett praktiskt sätt att lägga upp den privata övningskörningen, från första passet till de större vägarna.",
  sections: hubSections,
};

export const SUPERVISOR_GUIDE: StandaloneGuide = {
  path: SUPERVISOR_PATH,
  label: "Handledare",
  documentTitle: "Handledare vid privat övningskörning · Körpasset",
  description:
    "Handledarens roll vid privat övningskörning: planera korta pass, ge lugn återkoppling och följ körkortselevens utveckling när ni är flera.",
  h1: "Handledare vid privat övningskörning",
  eyebrow: "Handledare",
  lede:
    "Du sitter bredvid någon som ska lära sig köra. Din uppgift i träningen är att välja ett lagom pass, säga det som behövs i tid och lämna kvar en bild av hur det gick. Kraven på vem som får vara handledare står hos Transportstyrelsen — de upprepas inte här.",
  sections: [
    {
      heading: "Rollen bredvid",
      paragraphs: [
        "Handledaren är inte en andreförare som tar över så fort det blir osäkert, och inte en passagerare som hoppas att det löser sig. Du väljer väg efter vad eleven kan, ger en instruktion tidigt nog att hinna användas, och tar en paus när det stannar av.",
        "I bilen är trafiksäkerheten först. Om du behöver bryta, bryt lugnt och kör åt sidan. Pratet om vad som hände kan vänta tills ni står stilla.",
      ],
    },
    {
      heading: "Planera passet innan ni rullar",
      paragraphs: [
        "Bestäm två eller tre moment och en plats. Säg det högt innan ni startar, så eleven vet vad som är uppgiften och vad som bara är vägen dit.",
        "Ett pass utan plan blir lätt en lång åktur där allt kommenteras och inget blir övat. Ett pass med för många mål blir samma sak, fast med sämre humör.",
      ],
      bullets: [
        "Var ni ska köra, och var ni inte ska hamna idag.",
        "Vilket moment som är själva saken.",
        "Hur ni märker att det räcker, till exempel tre lugna försök eller en känd slinga.",
      ],
    },
    {
      heading: "Återkoppling som går att använda",
      paragraphs: [
        "Låt eleven prata först: vad som kändes bra, vad som kändes osäkert. Lägg sedan till en sak du såg, kopplad till dagens moment. Inte en lista över hela körningen.",
        "Säg vad du såg och vad ni ska göra med det. “Du tittade höger först på tredje korsningen” är något att bygga på. “Du måste skärpa dig” är det inte.",
      ],
    },
    {
      heading: "Håll passet lugnt",
      paragraphs: [
        "Korta pass håller. Om rösten höjs, om eleven slutar svara eller om du börjar styra varje meter: avbryt och kör hem, eller byt till något eleven redan kan.",
        "Instruktioner i tid, och gärna varför, slår en lång utläggning mitt i manövern. När momentet sitter kan du vara tyst. Tystnaden är träningen.",
      ],
    },
    {
      heading: "Följ utvecklingen, inte humöret",
      paragraphs: [
        "Ett bra pass betyder inte att momentet sitter nästa vecka. Ett dåligt pass betyder inte att ni ska byta moment. Titta på om eleven behöver mindre hjälp på samma sak.",
        "Skriv en rad efteråt. Om du bara minns känslan är det lätt att nästa pass blir antingen för lätt eller för svårt.",
      ],
    },
    {
      heading: "Flera handledare, samma elev",
      paragraphs: [
        "När ni är två vuxna kring samma körkortselev behöver ni inte köra likadant. Ni behöver veta vad den andra redan har tagit. Annars får eleven börja om, eller så hamnar ni på motorvägen för att ingen sa att rondellen fortfarande är osäker.",
        "Lämna över med en mening: vad ni övade, vad som ska göras om, vad ni medvetet lät vänta. I Körpasset ligger det på elevens resa, så båda handledarna ser samma historik.",
      ],
    },
    {
      heading: "Skriv upp körpasset",
      paragraphs: [
        "Dokumentationen behöver inte vara lång. Moment, en kort bedömning, nästa fokus. Det tar mindre tid än att reda ut i bilen varför ni kör samma sak igen utan att veta om det.",
        "Körpasset är till för den anteckningen. Appen säger inte att eleven är klar för prov, och den hittar inte på myndighetskrav. Den gör att nästa pass har en början.",
      ],
    },
  ],
};

export const HOME_GUIDE_CARDS = [
  MOMENT_GUIDES[0],
  MOMENT_GUIDES[2],
  MOMENT_GUIDES[5],
] as const;

export const PRACTICE_SITEMAP_PAGES: SitemapPage[] = [
  { path: HUB_PATH, priority: "0.9", changefreq: "monthly" },
  ...MOMENT_GUIDES.map((guide) => ({
    path: guide.path,
    priority: "0.7",
    changefreq: "monthly" as const,
  })),
  { path: SUPERVISOR_PATH, priority: "0.8", changefreq: "monthly" },
];

export function momentByPath(path: string): MomentGuide | undefined {
  return MOMENT_GUIDES.find((guide) => guide.path === path);
}

export function publicGuideMeta(): Array<{
  path: string;
  documentTitle: string;
  description: string;
  h1: string;
}> {
  return [
    PRACTICE_HUB,
    ...MOMENT_GUIDES,
    SUPERVISOR_GUIDE,
  ].map((guide) => ({
    path: guide.path,
    documentTitle: guide.documentTitle,
    description: guide.description,
    h1: guide.h1,
  }));
}
