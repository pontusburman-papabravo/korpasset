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

export interface GuideLink {
  href: string;
  label: string;
  note?: string;
}

/** Plain text, or text plus a descriptive link. */
export type GuideItem =
  | string
  | { text: string; href: string; linkLabel: string };

export interface GuideSection {
  heading: string;
  id?: string;
  paragraphs: string[];
  bullets?: GuideItem[];
  numbered?: GuideItem[];
  links?: GuideLink[];
}

export interface GuideFaq {
  question: string;
  answer: string;
}

export interface StandaloneGuide {
  path: string;
  label: string;
  documentTitle: string;
  description: string;
  h1: string;
  eyebrow: string;
  /** Direct answer, rendered immediately under the H1. */
  answer?: string;
  lede: string;
  sections: GuideSection[];
  faqs?: GuideFaq[];
  related?: GuideLink[];
}

export const HUB_PATH = "/ovningskorning";
export const LEGACY_HUB_PATH = "/ovningskora";
export const SUPERVISOR_PATH = "/handledare";
export const PASSENGER_PATH = "/ovningskora-med-passagerare";
export const PARENT_PATH = "/ovningskora-med-foralder";
export const PLAN_PATH = "/planera-ovningskorning";

/** Old or requested aliases that must not become a second indexable page. */
export const LEGACY_GUIDE_REDIRECTS = [
  { from: LEGACY_HUB_PATH, to: HUB_PATH },
  { from: "/handledare-ovningskorning", to: SUPERVISOR_PATH },
] as const;

const TS = {
  ovningskora:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/ovningskora/",
  handledare:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/handledare/",
  korkortstillstand:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/korkortstillstand/",
  planera:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/handledarskap-och-ovningskorning/planera-ovningsskorningen/",
  riskutbildning:
    "https://www.transportstyrelsen.se/sv/vagtrafik/korkort/ta-korkort/riskutbildning/riskutbildning-bil/",
  skylt: "https://www.transportstyrelsen.se/TSFS/TSFS%202010_81k.pdf",
  korkortsforordning:
    "https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/korkortsforordning-1998980_sfs-1998-980/",
} as const;

export const MOMENT_GUIDES: MomentGuide[] = [
  {
    path: "/ovningskora/forsta-gangen",
    label: "Första gången",
    cardTitle: "Första gången",
    cardBlurb: "Ett kort pass: stol, start, stopp och en lugn avslutning.",
    documentTitle: "Första gången ni övningskör · Körpasset",
    description:
      "Ett lugnt första körpass. Vad körkortseleven behöver kunna, vad handledaren tittar efter och hur ni kan avsluta innan det blir för mycket.",
    h1: "Första gången ni övningskör",
    intro:
      "Första passet kan vara litet. Börja på en stor tom yta som är avskild eller mycket lugn, i dagsljus. Bestäm innan motorn går igång att ni bara tränar att komma iväg, rulla och stanna. Annan trafik kan vänta tills den grundläggande manövreringen fungerar och du som handledare bedömer att det är säkert. Rondell och parkering kan vänta tills bilen känns bekant.",
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
      "Annan trafik först när start och stopp fungerar på den tomma ytan, och du bedömer att platsen är säker.",
      "Avsluta medan eleven fortfarande kan berätta vad som hände. Ett kort pass är ofta lättare att följa upp än ett som tar slut i trötthet.",
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
    cardBlurb: "Tom yta, uppsikt runt bilen och så låg fart att ni hinner stanna.",
    documentTitle: "Öva backning: uppsikt och låg fart · Körpasset",
    description:
      "Backa på tom yta först. Körkortseleven håller låg fart och ser runt bilen med speglar, egen sikt och kamera som komplement.",
    h1: "Öva backning",
    intro:
      "Backning handlar om uppsikt runt bilen, inte om ett särskilt ratttrick. Börja på en tom parkering i dagsljus, utan bilar i vägen. Speglar, egen sikt och backkamera används tillsammans. Kameran är ett komplement, inte den enda informationskällan.",
    studentCan: [
      "Stanna och skaffa uppsikt bakåt och åt sidorna innan bromsen släpps. Speglar, egen sikt och kamera kan användas tillsammans.",
      "Rulla en billängd, stanna, titta igen. Håll farten så låg att ett stopp är odramatiskt.",
      "Backa rakt en kort bit, och sedan en mjuk sväng, utan att gissa var bakhjulet tar vägen.",
    ],
    supervisorWatches: [
      "Om uppsikten räcker runt bilen, eller om eleven bara använder en källa: spegeln, kameran eller blicken bakåt.",
      "Om farten smyger upp så fort svängen börjar.",
      "Om du själv lutar dig och styr med rösten. Då kan ytan vara för svår ännu.",
    ],
    steps: [
      "Välj en tom ruta med gott om asfalt bakom. Peka ut stolpar och kant innan ni rullar.",
      "Ett sätt att kolla den direkta sikten är att vända sig och säga vad som syns bakom och vid sidan. Speglar och kamera får vara med. Ingen gas än.",
      "Rulla en billängd rakt bakåt. Stanna. Gör om tills spåret är tråkigt.",
      "Lägg till en mjuk sväng. Samma upplägg: titta, rulla, stanna.",
      "Avsluta där. Fickparkering kan bli ett annat pass, när uppsikten sitter.",
    ],
    mistakes: [
      "Att lita på bara en källa. Kameran ser inte allt vid sidan, och varken speglar, kamera eller en blick bakåt räcker ensam om uppsikten runt bilen saknas.",
      "Att backa långt i ett svep och rätta med stora rattrörelser.",
      "Att öva mellan parkerade bilar första gången, “eftersom det ändå är där man backar”.",
    ],
    readyWhen:
      "När eleven backar en kort sträcka och en mjuk sväng på tom yta och har uppsikt runt bilen, inte bara på skärmen. Då kan ni ta en rymlig parkeringsruta.",
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
      "Parkering går att dela upp som träning. Först en stor ruta på en lugn parkering, framåt in. Sedan en bred ficka längs en gata med lite trafik, om backningen redan känns lugn. En trång stadsgata kan vänta. Eleven kan välja platsen själv och säga varför den duger.",
    studentCan: [
      "Peka ut en plats och säga om den är stor nog, och vad som händer om någon kommer bakom.",
      "Köra in i en ruta framåt med uppsikt hela vägen, och stanna innan det tar i.",
      "Backa in i en bred ficka. Ett sätt att dela upp manövern är startläge, vinkel och att räta upp. Titta ut mot gatan under backningen, inte bara på linjerna.",
    ],
    supervisorWatches: [
      "Om eleven tappar gatan så fort inriktningen mot rutan börjar.",
      "Om platsen var elevens val. En plats du valde säger inget om omdömet.",
      "Om ett lätt stöt mot konen eller linjen blir en omstart med irritation. Ett nytt försök från samma läge räcker.",
    ],
    steps: [
      "Gå ur bilen och titta på en tom ruta tillsammans. Prata om var bakhjulen kommer att ta, inte om betyg.",
      "Eleven kör in framåt, stannar, och ni tittar på hjulen en gång. Sedan ut igen, samma ruta.",
      "Välj en bred ficka utan kö bakom. Ett sätt att dela upp manövern är att lägga bilen parallellt, backa till vinkel och räta upp. Det är ett övningssätt, inte en regel.",
      "Avbryt om en bil kommer. Trafiken runt är uppgiften, inte att hinna klart.",
      "Spara den trånga luckan till ett annat pass, när den breda fickan känns långsam och odramatisk.",
    ],
    mistakes: [
      "Att välja en trång lucka innan den breda känns lugn.",
      "Att stirra på kantstenen och glömma spegeln ut mot gatan.",
      "Att handledaren rattar med instruktioner i varje centimeter. Då övar eleven att lyda, inte att se.",
    ],
    readyWhen:
      "När eleven kan ta en stor ruta och en bred ficka och fortfarande söker av gatan. Start i backe eller högerregeln kan vara ett annat pass, i stället för en smalare ficka samma dag.",
    cta:
      "Skriv vilken plats ni tog och om det var valet, uppsikten eller själva fickan som ska övas igen. Nästa handledare ska inte gissa.",
  },
  {
    path: "/ovningskora/start-i-backe",
    label: "Start i backe",
    cardTitle: "Start i backe",
    cardBlurb: "Lätt lutning, ingen kö bakom. Öva att hålla bilen stilla.",
    documentTitle: "Start i backe utan att rulla bakåt · Körpasset",
    description:
      "Start i lätt lutning, utan kö bakom. Körkortseleven håller emot rullningen. Handbroms kan vara ett stöd. Även en automatbil kan röra sig i en lutning.",
    h1: "Start i backe",
    intro:
      "Ni behöver en mild backe med fri sikt och ingen bil tätt bakom. Målet är litet: att bilen står stilla, och sedan rullar framåt utan att dippa bakåt. En brant backe med kö är en svår första plats, även om eleven känner sig redo.",
    studentCan: [
      "Hålla bilen stilla i lutningen och säga vad som håller emot: fotbroms, handbroms eller båda.",
      "Köra iväg utan en okontrollerad rullning bakåt.",
      "Göra om samma start tre gånger utan att gasa i panik.",
    ],
    supervisorWatches: [
      "Om bilen rör sig bakåt innan den tar fart. En decimeter är redan information.",
      "Om eleven släpper allt på en gång. Då kan lutningen vara för brant, eller så kan handbromsen vara ett stöd.",
      "Om ni har automat. Även en automatbil kan röra sig i en lutning, beroende på bil och situation.",
    ],
    steps: [
      "Stanna på en svag lutning där det är tomt bakom. Låt eleven känna att bilen vill rulla, med bromsen i.",
      "Ett sätt att börja är med handbroms som stöd, om det passar bilen och lutningen. Det är inget ni måste använda. Fot och koppling, eller fotbroms och gas i automat, tills bilen tar emot.",
      "Om ni använder handbroms: släpp den när bilen vill framåt. Stanna igen och gör om.",
      "Tre lugna starter på samma ställe. Byt inte backe för att det gick en gång.",
      "En aning brantare lutning bara om de tre första var tråkiga och ni fortfarande är ensamma där.",
    ],
    mistakes: [
      "Att börja i en brant backe för att “det är så det är på riktigt”.",
      "Att hoppa över momentet för att bilen är automat. Även en automatbil kan röra sig i en lutning, beroende på bil och situation.",
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
    cardBlurb: "Väjningsplikt från höger, övad i lugna omärkta korsningar.",
    documentTitle: "Öva högerregeln i villaområdet · Körpasset",
    description:
      "Högerregeln ger väjningsplikt mot fordon från höger när kurserna skär varandra, om ingen annan väjningsregel gäller. I passet övar ni omärkta korsningar.",
    h1: "Öva högerregeln",
    intro:
      "Högerregeln innebär att du har väjningsplikt mot fordon som närmar sig från höger när era kurser skär varandra, om inte andra väjningsregler gäller. Den gäller inte bara i vanliga vägkorsningar. I det här passet tränar ni på vanliga omärkta korsningar i ett lugnt villaområde. Välj tre eller fyra sådana korsningar ni redan känner, i dagsljus och låg fart. Att en skylt saknas räcker inte som förklaring: trafiksignal, väjningsplikt, huvudled eller en annan regel kan styra i stället.",
    studentCan: [
      "Se skillnad på när ett märke, en signal eller en annan regel styr väjningsplikten, och när högerregeln kan gälla.",
      "Söka åt höger och lämna företräde när ett fordon kommer därifrån och kurserna skär varandra, inte bara nicka ditåt.",
      "Förklara efteråt varför högerregeln gällde just där, inte bara att en skylt saknades.",
    ],
    supervisorWatches: [
      "Om eleven sänker för att hen såg situationen, eller för att du sa till.",
      "Om “jag tittade” betyder att bilen ändå rullade ut.",
      "Om varje korsning blir ett stopp även när det är fritt från höger. Då kan ni stanna och reda ut en korsning i taget. Att stanna när det behövs är däremot riktigt.",
    ],
    steps: [
      "Gå igenom kartan i stillastående: var ni tror att högerregeln gäller, och en plats där ett väjningspliktsmärke eller en annan regel styr, så skillnaden syns.",
      "Kör fram mot den första. Eleven säger vad som styr väjningsplikten innan ni är framme, inte bara om en skylt saknas.",
      "Om ett fordon kommer från höger och kurserna skär varandra: sänk farten i god tid eller stanna, och kör vidare bara om det kan ske utan fara eller hinder.",
      "Ta samma korsningar en gång till. Andra varvet kan din påminnelse “kolla höger” utebli.",
      "Avsluta med att eleven pekar ut en korsning ni inte övade och säger vad som gäller där, inklusive om en annan regel tar över.",
    ],
    mistakes: [
      "Att bara öva där det är tomt, så eleven inte behöver släppa fram någon.",
      "Att utgå från att en korsning utan skylt automatiskt är högerregel.",
      "Att titta åt vänster av vana och glömma höger.",
      "Att blanda in en rondell i samma pass. Där väjer den som kör in för dem som redan är inne.",
    ],
    readyWhen:
      "När eleven kan förklara varför högerregeln gällde i just den korsningen, och lämna företräde utan att du pekar. En liten enfältsrondell kan vara ett senare moment, en annan dag.",
    cta:
      "Skriv vilka korsningar ni tog och om eleven såg dem själv. Nästa gång ska ni kunna åka tillbaka till samma ställe och göra mindre.",
  },
  {
    path: "/ovningskora/rondell",
    label: "Cirkulationsplats",
    cardTitle: "Cirkulationsplats",
    cardBlurb: "En enkel enfältscirkulationsplats, många varv. Flerfält får vänta.",
    documentTitle: "Cirkulationsplats – infart, läge och utfart | Körpasset",
    description:
      "Börja med en enkel enfältscirkulationsplats. Öva fart före infarten, en säker lucka och blinkers vid utfart. Flerfält kan vänta.",
    h1: "Öva cirkulationsplats",
    intro:
      "Det som i vardagligt tal brukar kallas rondell heter egentligen cirkulationsplats. Rondellen är området i mitten. Ta en liten enfältscirkulationsplats, inte den stora leden. Kör den flera varv så att infart, läge och utfart blir tre saker ni känner igen. Flerfält kan vänta tills den här känns lugn. Hur ni placerar er följer skyltar och körfält på just den platsen.",
    studentCan: [
      "Sänka farten före infarten och lämna företräde åt dem som redan är inne. Stanna om luckan inte räcker, och kör in när det kan ske säkert.",
      "Välja det läge som skyltar och körfält visar för utfarten ni bestämt, och veta utfarten innan ni är inne.",
      "Visa utfarten med blinkers och lämna utan att störa den som fortsätter runt.",
    ],
    supervisorWatches: [
      "Om eleven fryser vid infarten trots en lucka, eller kastar sig in i en för liten.",
      "Om blinkersen ut kommer när ni redan är på väg ut.",
      "Om du börjar beskriva en flerfältsrondell “medan vi ändå är här”. Det är ett annat pass.",
    ],
    steps: [
      "Stanna före rondellen första gången bara för att peka: här sänker vi, här tittar vi, tredje utfarten är målet. Sedan kör ni.",
      "Eleven tar samma utfart flera varv. Ett sätt är att välja luckan medvetet, inte att hoppas att den räcker.",
      "Byt utfart. Säg den tidigt, så placeringen hinner bli ett val.",
      "Öva att avstå från en trång lucka och ta nästa. Det kan vara ett klokt val.",
      "Avsluta på den här rondellen. En större led är nästa kapitel, inte nästa varv.",
    ],
    mistakes: [
      "Att stanna på infarten varje gång, även när det är fritt.",
      "Att glömma blinkers vid utfarten, eller att välja läge utan att titta på skyltar och körfält.",
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
      "När tätorten sitter kan ni ta en känd landsväg i dagsljus: utfart, kurva och möte. Omkörning är ett mer krävande moment och kan vänta.",
    h1: "Övningskörning på landsväg",
    intro:
      "Landsväg är högre fart och längre beslut. Ett möjligt läge är när start, stopp och vanliga korsningar känns lugna. Välj en utfart ni känner, med god sikt, i dagsljus. Omkörning är ett mer krävande moment och kan vänta tills eleven har god kontroll på fart, placering och avstånd. Den behöver inte ingå i ett visst skede.",
    studentCan: [
      "Stå stilla vid utfarten, titta på luckorna och säga om den räcker i den fart som gäller på vägen.",
      "Anpassa farten före en kurva så att bilen kan köras stabilt genom den, och placera bilen så mötet får plats.",
      "Avstå från en omkörning utan att det känns som ett misslyckande.",
    ],
    supervisorWatches: [
      "Om eleven anpassar farten före kurvan så att bilen kan köras stabilt genom den. Att behöva bromsa kraftigt inne i kurvan kan tyda på att farten var för hög från början. Trafiken kan ändå kräva en inbromsning.",
      "Om luckan ut på vägen var elevens val. En lucka du tvingade fram säger lite om omdömet.",
      "Om du själv blir rastlös bakom en långsammare bil. Att avstå kan vara ett klokt val. Säg det högt.",
    ],
    steps: [
      "Välj utfarten hemma, inte i farten. Dagsljus, torrt väglag, en väg ni har åkt som passagerare.",
      "Stanna och titta på luckor innan eleven kör ut. En utfart, inte en rundtur.",
      "Ta en kurva där eleven säger “sänker nu” innan den börjar. Kör samma kurva åt andra hållet om det går.",
      "Ett möte på en väg som inte är som smalast. Prata efteråt om var ni lade bilen, inte om mod.",
      "Omkörning behöver inte ingå. Om ni pratar om den: den kan vänta tills eleven har god kontroll på fart, placering och avstånd.",
    ],
    mistakes: [
      "Att ta landsvägen som första miljö för att “det är mindre trafik”.",
      "Att gasa in i en för kort lucka för att inte stå kvar vid utfarten.",
      "Att ta en omkörning innan eleven har kontroll på fart, placering och avstånd.",
    ],
    readyWhen:
      "När utfarten och kurvan känns odramatiska och eleven anpassar farten före kurvan utan att du säger till. Motorväg kan vara ett senare pass, en annan dag, med en påfart ni redan känner. Det är ett förslag, inte en given ordning.",
    cta:
      "Skriv om det var luckan ut, kurvan eller mötet som kan göras om, och om omkörning ingick eller inte. Nästa handledare behöver inte gissa sig till ett svårare pass.",
  },
  {
    path: "/ovningskora/motorvag",
    label: "Motorväg",
    cardTitle: "Motorväg",
    cardBlurb: "En känd påfart i dagsljus. Anpassa farten och sök en säker lucka.",
    documentTitle: "Öva motorväg: påfart och avfart · Körpasset",
    description:
      "En känd påfart i dagsljus. Använd accelerationsfältet för att söka en säker lucka. Målet är att köra in utan stopp, men bara om det kan ske säkert.",
    h1: "Öva motorväg",
    intro:
      "Första motorvägspasset kan vara kort och känt. En påfart ni har åkt förut, dagsljus, inte rusning. Använd accelerationsfältet för att anpassa hastigheten till trafiken och söka en säker lucka. Målet är att kunna köra in utan att behöva stanna, men kör aldrig ut om det inte kan ske säkert. Säkerheten går före flytet. Planera också en avfart i förväg.",
    studentCan: [
      "Använda accelerationsfältet för att anpassa hastigheten till trafiken, söka en säker lucka och lämna fältet så snart det kan ske säkert.",
      "Låta bli att köra ut bara för att undvika ett stopp.",
      "Börja leta avfarten i tid. Om det finns ett avfartsfält tar ni det så snart det kan ske, och sänker farten där. Om avfarten missas kan ni ta nästa.",
    ],
    supervisorWatches: [
      "Om eleven återkommande tappar fart så mycket att en säker infart blir svår trots en normal trafiksituation. Då kan miljön vara för svår ännu. Ett enstaka stopp betyder inte att eleven inte är redo.",
      "Om blicken fastnar på hastighetsmätaren i stället för på luckan.",
      "Om en missad avfart blir en sen inbromsning i körfältet. Då kan ni ta nästa avfart.",
    ],
    steps: [
      "Prata igenom påfarten innan ni kör den, om eleven aldrig kört den: var fältet tar slut, var ni tittar, vilken avfart ni ska ta.",
      "Accelerationsfältet används för att närma sig trafikens fart och hitta en lucka. Lämna fältet så snart det kan ske säkert. Om luckan inte finns: sakta in eller stanna hellre än att köra ut.",
      "En kort stund i höger körfält, om det passar trafiken. På det här passet behöver ni inte byta fil bara för att prova.",
      "Säg avfarten tidigt, så eleven hinner se skylten.",
      "Om ni missar den: ta nästa. Prata om det när ni står stilla.",
    ],
    mistakes: [
      "Att köra ut i en för liten lucka bara för att slippa stanna.",
      "Att byta till vänster fil på ett första pass, utan att ni ska förbi någon.",
      "Att bromsa sent i körfältet för att hinna en avfart som redan är förbi. Nästa avfart kan vara lugnare.",
    ],
    readyWhen:
      "När samma påfart går att köra med en säker lucka, och avfarten var planerad. Ett stopp som gjordes för att luckan inte räckte är inte ett misslyckande. En annan påfart kan vänta till nästa pass. Landsvägen ni redan kan är fortfarande hemmaplan om motorvägen kändes för stor.",
    cta:
      "Skriv vilken påfart och vilken avfart, och om nästa gång kan vara samma ställe. Samma påfart en gång till kan vara lättare att följa upp än tre nya.",
  },
];

export const MOMENT_ORDER = MOMENT_GUIDES.map((guide) => guide.path);

const hubSections: GuideSection[] = [
  {
    heading: "Vad som krävs för att börja",
    id: "borja",
    paragraphs: [
      "Privat övningskörning betyder att eleven tränar med en handledare som Transportstyrelsen har godkänt för just den eleven. Det går att kombinera med lektioner på trafikskola. Körpasset är inget av det: varken myndighet, skola eller prov.",
      "Transportstyrelsen kräver fyra saker för att få övningsköra. Den som bara kör med trafikskola eller utbildare behöver inte en egen handledare. Den som kör privat behöver det.",
    ],
    bullets: [
      "Ett körkortstillstånd.",
      "En godkänd handledare, om ni kör privat.",
      "Ålderskravet för fordonsslaget. För personbil utan släp, behörighet B, är det 16 år.",
      "En giltig ID-handling. Den ska finnas med i bilen.",
    ],
    links: [
      { href: "#korkortstillstand", label: "Körkortstillstånd", note: "Ansökan, synintyg och giltighet" },
      { href: SUPERVISOR_PATH, label: "Handledare vid övningskörning", note: "Ålder, körkort och godkännande" },
      { href: PARENT_PATH, label: "Övningsköra med förälder", note: "När mamma eller pappa sitter bredvid" },
      { href: TS.ovningskora, label: "Övningsköra hos Transportstyrelsen", note: "Aktuella krav" },
    ],
  },
  {
    heading: "Körkortstillstånd",
    id: "korkortstillstand",
    paragraphs: [
      "Eleven behöver ett giltigt körkortstillstånd för att övningsköra och för att göra förarprov. För personbil söker man grupp 1. I den gruppen ingår bland annat traktor, AM, A, B och BE.",
      "Till ansökan hör en hälsodeklaration och ett synintyg. Synintyget får inte vara utfärdat tidigare än två månader före ansökan. Själva ansökan kostar inget hos Transportstyrelsen. Det finns ingen åldersgräns för att söka, men det finns en åldersgräns för att få övningsköra.",
      "Tillståndet gäller i fem år och kan inte förlängas. När det har gått ut behövs en ny ansökan för att fortsätta övningsköra eller göra prov.",
    ],
    links: [
      { href: TS.korkortstillstand, label: "Körkortstillstånd hos Transportstyrelsen", note: "Ansökan och vad som prövas" },
    ],
  },
  {
    heading: "Handledare vid privat övningskörning",
    id: "handledare",
    paragraphs: [
      "Handledaren ska ha ansökt och blivit godkänd för den elev ni ska köra med. För personbil ska handledaren ha fyllt 24 år och ha haft behörigheten i sammanlagt minst fem av de senaste tio åren. Godkännandet gäller en elev i taget. En elev kan ha flera handledare. En handledare kan ha högst fem elever samtidigt.",
      "Vid bil ska den som har uppsikt följa med i bilen, vid den som kör. Transportstyrelsen skriver att handledaren räknas som förare och ansvarar för körningen, även om det är eleven som håller i ratten.",
    ],
    links: [
      { href: SUPERVISOR_PATH, label: "Regler och krav för handledare", note: "24 år, körkortstid, giltighet och återkallelse" },
      { href: PARENT_PATH, label: "Övningsköra med förälder" },
      { href: PASSENGER_PATH, label: "Passagerare vid övningskörning" },
      { href: TS.handledare, label: "Handledare hos Transportstyrelsen" },
      { href: TS.korkortsforordning, label: "Körkortsförordningen", note: "Uppsikt i bilen" },
    ],
  },
  {
    heading: "Introduktionsutbildning",
    id: "introduktion",
    paragraphs: [
      "Den 1 augusti 2026 slopades kravet på introduktionsutbildning för privat övningskörning med personbil och lätt lastbil. Varken elev eller handledare behöver en giltig sådan kurs för att köra privat. Handledaren ska fortfarande vara godkänd. Den som redan har ansökt och väntar på beslut behöver inte ansöka på nytt.",
      "Det är en annan sak än riskutbildningen. Riskutbildningen ska fortfarande vara gjord innan förarprovet för behörighet B, både kunskapsprov och körprov. Den har två delar. Den gäller tills körkortet tas ut, som längst i fem år. Den som övningskör privat bokar den själv hos en utbildare.",
    ],
    links: [
      { href: TS.ovningskora, label: "Om introduktionsutbildningen hos Transportstyrelsen" },
      { href: TS.riskutbildning, label: "Riskutbildning för personbil" },
    ],
  },
  {
    heading: "Övningskörningsskylt",
    id: "skylt",
    paragraphs: [
      "Bilen ska ha en grön skylt med texten ÖVNINGSKÖR baktill. Den ska vara väl synlig bakifrån och får inte skymma sikten inifrån bilen. Vid privat övningskörning med godkänd handledare är botten grön. En trafikskola använder en röd skylt.",
    ],
    links: [
      { href: TS.ovningskora, label: "Placering av skylten", note: "Transportstyrelsens frågor och svar" },
      { href: TS.planera, label: "Grön skylt före körningen", note: "Transportstyrelsens checklista" },
      { href: TS.skylt, label: "Föreskrifterna om skylten", note: "TSFS 2010:81" },
    ],
  },
  {
    heading: "Så kommer ni igång",
    paragraphs: [
      "När tillstånd, handledare, ID och skylt är på plats kan ni planera själva passet. Välj en plats, ett moment och hur ni märker att det räcker. Handledarbeviset ska finnas med, på papper eller digitalt.",
      "Låt den som handleder känna på bilen innan eleven kör: stol, speglar och var bromsen sitter. Första passet kan vara kort. Start, en lugn sträcka, stopp.",
    ],
    links: [
      { href: "/ovningskora/forsta-gangen", label: "Börja övningsköra", note: "Första körpasset" },
      { href: PLAN_PATH, label: "Planera övningskörning" },
    ],
  },
  {
    heading: "Vad ni kan träna i början",
    paragraphs: [
      "Transportstyrelsen råder er att börja på lugna platser, utan annan trafik som stör, och vänta med trafik tills eleven kan hantera bilen säkert. En stor tom yta räcker för start, stopp och backning.",
      "Ta ett nytt moment i en miljö eleven redan känner. En ny rondell och en ny landsväg samma eftermiddag blir två okända saker på en gång.",
    ],
    links: [
      { href: "/ovningskora/forsta-gangen", label: "Första körpasset" },
      { href: "/ovningskora/backning", label: "Backning" },
      { href: "/ovningskora/start-i-backe", label: "Start i backe" },
    ],
  },
  {
    heading: "Hur ofta ni kan köra",
    id: "hur-ofta",
    paragraphs: [
      "Transportstyrelsen skriver att man bör övningsköra regelbundet. De anger ingen tidtabell och inget visst antal pass i veckan. Körpasset gör det inte heller.",
      "Korta, återkommande pass är ofta lättare att följa upp än ett långt pass med många moment. Om en vecka faller bort kan ni nästa gång ta samma moment på samma plats.",
    ],
    links: [
      { href: PLAN_PATH, label: "Så planerar du övningskörningen" },
      { href: TS.planera, label: "Planera övningskörningen", note: "Transportstyrelsen" },
    ],
  },
  {
    heading: "Från enkel miljö till svårare trafik",
    paragraphs: [
      "En praktisk ordning är manövrering på tom yta, sedan lugna bostadsområden och korsningar, därefter tätare trafik, landsväg och till sist motorväg på en påfart ni känner. Det är ett förslag att anpassa efter eleven, inte ett krav för uppkörning.",
      "Transportstyrelsen rekommenderar att ni övar ett moment tills eleven kan göra det självständigt innan ni tar nästa, och att ni varierar miljö, väder och tid på dygnet när grunden sitter. Trafiksäkerheten går först. Handledaren kan avbryta.",
    ],
    links: [
      { href: PLAN_PATH, label: "Planera övningskörning", note: "Progressionen, steg för steg" },
      { href: "/ovningskora/landsvag", label: "Landsväg" },
      { href: "/ovningskora/motorvag", label: "Motorväg" },
      { href: "/ovningskora/rondell", label: "Cirkulationsplats" },
      { href: "/ovningskora/parkering", label: "Parkering" },
    ],
  },
  {
    heading: "Flera handledare kring samma elev",
    paragraphs: [
      "Mamma, pappa eller en partner behöver inte köra likadant. Eleven behöver veta vad som redan är övat. Skriv en rad efter passet: vad ni tog, vad som ska göras om, vad ni lät vänta. Nästa person kan läsa det i stället för att gissa.",
    ],
    links: [
      { href: PARENT_PATH, label: "Övningsköra med förälder", note: "Mål före passet och en kort reflektion efter" },
    ],
  },
];

export const PRACTICE_HUB: StandaloneGuide = {
  path: HUB_PATH,
  label: "Övningskörning",
  documentTitle: "Övningskörning – regler, tips och komplett guide | Körpasset",
  description:
    "Vad som krävs för att börja övningsköra privat mot B-körkort, hur ni planerar passen och går från lugn miljö till svårare trafik.",
  h1: "Övningskörning – komplett guide",
  eyebrow: "Guide",
  lede:
    "För elev och handledare som övningskör privat mot personbil. Först det som behöver vara på plats. Sedan hur ni kan lägga upp körningen.",
  sections: hubSections,
  faqs: [
    {
      question: "När får man börja övningsköra personbil?",
      answer:
        "För behörighet B, personbil utan släp, från 16 år. Eleven behöver körkortstillstånd. Vid privat övningskörning behövs också en handledare som är godkänd för den eleven. Andra kombinationer, till exempel bil med släp, har andra åldrar.",
    },
    {
      question: "Måste man gå en övningskörningskurs?",
      answer:
        "Introduktionsutbildningen för privat övningskörning med personbil och lätt lastbil krävs inte längre. Kravet slopades 1 augusti 2026. Handledaren ska fortfarande vara godkänd. Riskutbildningen är något annat och ska vara gjord innan förarprovet.",
    },
    {
      question: "Hur ofta bör man övningsköra?",
      answer:
        "Transportstyrelsen rekommenderar att ni kör regelbundet och anger ingen tidtabell. Korta pass som återkommer kan vara lättare att följa upp än ett långt pass med många moment.",
    },
    {
      question: "Kan eleven ha flera handledare?",
      answer:
        "Ja. Det finns ingen gräns för hur många handledare en elev kan ha. Varje handledare kan ha högst fem elever samtidigt, och godkännandet gäller en elev i taget.",
    },
  ],
  related: [
    { href: "/ovningskora/forsta-gangen", label: "Börja övningsköra", note: "Första körpasset" },
    { href: PARENT_PATH, label: "Övningsköra med förälder" },
    { href: SUPERVISOR_PATH, label: "Handledare vid övningskörning" },
    { href: PASSENGER_PATH, label: "Passagerare vid övningskörning" },
    { href: "#korkortstillstand", label: "Körkortstillstånd" },
    { href: "#skylt", label: "Övningskörningsskylt" },
    { href: PLAN_PATH, label: "Planera övningskörning" },
    { href: "/ovningskora/landsvag", label: "Landsväg" },
    { href: "/ovningskora/motorvag", label: "Motorväg" },
    { href: "/ovningskora/rondell", label: "Cirkulationsplats" },
    { href: "/ovningskora/parkering", label: "Parkering" },
  ],
};

export const SUPERVISOR_GUIDE: StandaloneGuide = {
  path: SUPERVISOR_PATH,
  label: "Handledare",
  documentTitle: "Handledare vid övningskörning – regler och krav | Körpasset",
  description:
    "Vem som får vara handledare vid privat övningskörning: ålder, körkort, godkännande och ansvar. Plus hur ni kan lägga upp passen.",
  h1: "Handledare vid övningskörning",
  eyebrow: "Handledare",
  lede:
    "Du behöver vara godkänd av Transportstyrelsen för just den här eleven. För personbil gäller bland annat att du har fyllt 24 år och har haft behörigheten i sammanlagt minst fem av de senaste tio åren.",
  sections: [
    {
      heading: "Vem som får vara handledare",
      paragraphs: [
        "Det spelar ingen roll om du är förälder, partner eller någon annan. Transportstyrelsen prövar samma krav. Att vara förälder räcker inte i sig.",
        "Du ska ha ett giltigt körkort från Sverige eller ett annat EES-land, för det fordonsslag ni ska övningsköra med. Behörigheten ska ha funnits under sammanlagt minst fem av de senaste tio åren. Den behöver inte ha varit obruten. Har du körkort från ett annat EES-land ska en kopia skickas till Transportstyrelsen, 701 97 Örebro.",
        "Eleven ska ha ett giltigt körkortstillstånd. Undantag som Transportstyrelsen beskriver: den som övningskör för att ta bort villkor om automat, och villkoret inte beror på medicinska skäl, behöver inget körkortstillstånd. Detsamma gäller om eleven redan har B och ska övningsköra för utökad B.",
      ],
      bullets: [
        "Du har fyllt 24 år.",
        "Du har giltigt körkort från Sverige eller annat EES-land.",
        "Du har haft rätt behörighet i sammanlagt minst fem av de senaste tio åren.",
        "Eleven har giltigt körkortstillstånd, med de undantag som står ovan.",
        "Transportstyrelsen har godkänt dig som handledare för den eleven.",
      ],
      links: [
        { href: PARENT_PATH, label: "Övningsköra med förälder" },
        { href: `${HUB_PATH}#korkortstillstand`, label: "Körkortstillstånd" },
        { href: TS.handledare, label: "Handledare hos Transportstyrelsen" },
      ],
    },
    {
      heading: "Godkännande och handledarbevis",
      paragraphs: [
        "Ansökan görs för varje elev. Du måste vara godkänd för just den person du kör med. Ett handledarbevis gäller i fem år, så länge körkortet inte blir återkallat. Sedan behövs en ny ansökan. Undantaget är ett godkännande för en elev före den 1 februari 2012: det gäller för den eleven utan tidsgräns, så länge körkortet inte återkallas.",
        "Om elevens körkortstillstånd förnyas medan handledarskapet gäller behöver du inte ansöka igen. Beviset ska finnas med vid körningen, på papper eller digitalt. Polisen kan be att få se det, på papper eller via inloggning i digital brevlåda.",
        "I normala fall tar handläggningen upp till fyra veckor när kraven är uppfyllda och handlingarna är inne. En utredning kan ta längre tid, till exempel om körkortet har varit återkallat under de senaste tre åren.",
      ],
      links: [
        { href: TS.handledare, label: "Ansök och läs om giltighetstiden" },
      ],
    },
    {
      heading: "När man inte kan bli godkänd",
      paragraphs: [
        "Transportstyrelsen avslår eller kan inte godkänna en ansökan i de här fallen. Exemplen på deras sida är vägledande. Läs beslutet om ditt körkort har varit återkallat.",
      ],
      bullets: [
        "Körkortet har varit återkallat i mer än tre månader under de senaste tre åren för att du brutit mot en viktig trafikregel, till exempel fortkörning eller rödljuskörning.",
        "Körkortet har varit återkallat någon gång under de senaste tre åren på grund av rattfylleri, opålitlighet ur nykterhetssynpunkt eller grova brott.",
        "Körkortet har under de senaste tre åren gällt med villkor om alkolås.",
        "Du har redan giltiga godkännanden för fem elever.",
      ],
    },
    {
      heading: "Om körkortet återkallas",
      paragraphs: [
        "Om körkortet återkallas upphör du att vara handledare för den behörighet som återkallas. Ett nytt handledarskap kräver en ny ansökan. Ett godkännande som meddelats efter den 1 februari 2012 gäller i fem år även om eleven tar körkort under tiden. Det går inte att häva i förtid på samma sätt som äldre godkännanden.",
      ],
    },
    {
      heading: "Introduktionsutbildning",
      paragraphs: [
        "För privat övningskörning med personbil och lätt lastbil krävs ingen introduktionsutbildning sedan den 1 augusti 2026. Ett handledarskap som fortfarande är giltigt påverkas inte av att en äldre introduktionsutbildning har gått ut. Du behöver inte ansöka om på nytt bara av det skälet.",
      ],
      links: [
        { href: `${HUB_PATH}#introduktion`, label: "Introduktionsutbildning och riskutbildning" },
      ],
    },
    {
      heading: "Vem som räknas som förare",
      paragraphs: [
        "Det är handledaren som räknas som förare och som ansvarar för körningen. Du ansvarar också för att handledarbeviset är med. Vid en förseelse eller en olycka kan handledaren bli straffad.",
        "Vid övningskörning med bil ska den som har uppsikt följa med i bilen, vid den som kör. Du ska kunna ta över om något händer. Har du en tillfällig skada som gör att du inte kan köra bilen själv bör du vänta med övningskörningen. Har ditt körkort villkor om särskild utrustning ska bilen ha den utrustningen, eftersom du räknas som förare.",
      ],
      links: [
        { href: PASSENGER_PATH, label: "Passagerare vid övningskörning", note: "Extra personer i bilen" },
        { href: TS.planera, label: "Ansvar under körningen", note: "Transportstyrelsen" },
        { href: TS.korkortsforordning, label: "Körkortsförordningen" },
      ],
    },
    {
      heading: "Flera handledare",
      paragraphs: [
        "En elev kan ha flera handledare. Var och en ansöker för sig. En handledare kan ha högst fem elever samtidigt, och bara en elev per körtillfälle.",
      ],
      links: [
        { href: PARENT_PATH, label: "När föräldrar turas om" },
      ],
    },
    {
      heading: "Rollen bredvid",
      paragraphs: [
        "Juridiskt räknas du som handledare som förare och ansvarar för körningen. Din roll i träningen är samtidigt att låta eleven göra så mycket som situationen och elevens förmåga tillåter. Du behöver inte detaljstyra så fort eleven tvekar, och du är inte en passagerare som hoppas att det löser sig.",
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
        "Korta pass kan vara lättare att hålla lugna. Om rösten höjs, om eleven slutar svara eller om du börjar styra varje meter: avbryt och kör hem, eller byt till något eleven redan kan.",
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
  faqs: [
    {
      question: "Kan en förälder vara handledare?",
      answer:
        "Ja, om samma krav är uppfyllda som för andra: fyllda 24 år, körkort med rätt behörighet i sammanlagt minst fem av de senaste tio åren, och ett godkännande för just den eleven.",
    },
    {
      question: "Hur länge gäller handledarbeviset?",
      answer:
        "Fem år, så länge körkortet inte blir återkallat. Därefter behövs en ny ansökan. Ett godkännande för en elev före den 1 februari 2012 gäller för den eleven utan tidsgräns, så länge körkortet inte återkallas.",
    },
    {
      question: "Vem är förare när eleven kör?",
      answer:
        "Handledaren. Transportstyrelsen skriver att handledaren räknas som förare och ansvarar för körningen, och kan bli straffad vid en förseelse eller olycka.",
    },
  ],
  related: [
    { href: HUB_PATH, label: "Övningskörning – komplett guide" },
    { href: PARENT_PATH, label: "Övningsköra med förälder" },
    { href: PASSENGER_PATH, label: "Passagerare vid övningskörning" },
    { href: PLAN_PATH, label: "Planera övningskörning" },
    { href: "/ovningskora/forsta-gangen", label: "Första körpasset" },
  ],
};

export const PASSENGER_GUIDE: StandaloneGuide = {
  path: PASSENGER_PATH,
  label: "Passagerare",
  documentTitle: "Får man ha passagerare när man övningskör? | Körpasset",
  description:
    "Ja, om övningskörningen kan ske trafiksäkert. Så skriver Transportstyrelsen. Här är skillnaden mot råd när eleven fortfarande lär sig.",
  h1: "Får man ha passagerare när man övningskör?",
  eyebrow: "Regler",
  answer:
    "Ja. Transportstyrelsen skriver att du får ha passagerare med dig om övningskörningen kan ske på ett trafiksäkert sätt. Det finns inget generellt förbud mot barn eller andra familjemedlemmar.",
  lede:
    "Det korta svaret kommer från Transportstyrelsen. Resten av sidan skiljer på vad reglerna säger och vad som kan vara klokt när eleven fortfarande lär sig.",
  sections: [
    {
      heading: "Vad reglerna säger",
      paragraphs: [
        "Vid privat övningskörning får passagerare följa med, under förutsättning att körningen kan ske trafiksäkert. Transportstyrelsen beskriver inga särskilda passagerarregler utöver det villkoret, och inget undantag från vanliga regler i bilen.",
        "Handledaren är inte en sådan passagerare. Vid bil är handledaren den som har uppsikt, ska sitta med vid den som kör och räknas som förare. Frågan om passagerare gäller andra personer i bilen.",
      ],
      links: [
        { href: TS.ovningskora, label: "Får jag ha passagerare med mig vid övningskörning?", note: "Transportstyrelsen" },
        { href: SUPERVISOR_PATH, label: "Handledare vid övningskörning", note: "Vem som räknas som förare" },
      ],
    },
    {
      heading: "Vem som ansvarar för körningen",
      paragraphs: [
        "Ansvaret ligger på handledaren. Transportstyrelsen skriver att handledaren är ansvarig förare under övningskörningen och kan bli straffad vid en förseelse eller olycka. En passagerare tar inte över det ansvaret, och eleven blir inte förare i juridisk mening för att hen håller i ratten.",
      ],
      links: [
        { href: TS.planera, label: "Ansvar under övningskörningen", note: "Transportstyrelsen" },
        { href: PARENT_PATH, label: "Övningsköra med förälder" },
      ],
    },
    {
      heading: "Barn och andra i familjen",
      paragraphs: [
        "Reglerna förbjuder inte att ett syskon, en partner eller ett barn följer med. Villkoret är att övningskörningen kan ske trafiksäkert.",
        "Det är ett träningstips, inte en regel: ett barn som behöver tillsyn, eller flera personer som pratar, kan ta uppmärksamhet från vägen. De första passen blir ofta lugnare med bara elev och handledare i bilen.",
      ],
    },
    {
      heading: "När extra passagerare kan störa träningen",
      paragraphs: [
        "Det kan vara olämpligt ur träningssynpunkt även när det är tillåtet. Typiska lägen är ett nytt moment, en ny miljö, eller ett pass där handledaren redan behöver gripa in ofta. Då kan ni låta passagerarna vänta till ett pass eleven redan klarar lugnt.",
        "Kommentarer från baksätet mitt i en manöver gör det svårare att höra handledaren. Bestäm innan ni kör vem som pratar, och spara omdömen tills bilen står stilla.",
      ],
      links: [
        { href: PARENT_PATH, label: "Så kan förälder och elev prata i bilen" },
        { href: "/ovningskora/forsta-gangen", label: "Första körpasset" },
        { href: PLAN_PATH, label: "Planera övningskörning" },
      ],
    },
  ],
  faqs: [
    {
      question: "Får man ha passagerare vid privat övningskörning?",
      answer:
        "Ja, om övningskörningen kan ske på ett trafiksäkert sätt. Det är Transportstyrelsens formulering.",
    },
    {
      question: "Gäller andra regler för passagerarna än vid vanlig körning?",
      answer:
        "Transportstyrelsen anger inga särskilda passagerarregler för övningskörning, utöver att körningen ska kunna ske trafiksäkert.",
    },
    {
      question: "Vem ansvarar om något händer?",
      answer:
        "Handledaren räknas som förare och ansvarar för körningen. En passagerare tar inte det ansvaret.",
    },
    {
      question: "Kan barn följa med?",
      answer:
        "Ja, under samma villkor: att övningskörningen kan ske trafiksäkert. Ur träningssynpunkt är en tyst bil ofta lättare i början.",
    },
  ],
  related: [
    { href: HUB_PATH, label: "Övningskörning – komplett guide" },
    { href: SUPERVISOR_PATH, label: "Handledare vid övningskörning" },
    { href: PARENT_PATH, label: "Övningsköra med förälder" },
    { href: "/ovningskora/forsta-gangen", label: "Första körpasset" },
    { href: "/ovningskora/hogerregeln", label: "Högerregeln" },
    { href: PLAN_PATH, label: "Planera övningskörning" },
  ],
};

export const PARENT_GUIDE: StandaloneGuide = {
  path: PARENT_PATH,
  label: "Med förälder",
  documentTitle: "Övningsköra med förälder – regler och tips | Körpasset",
  description:
    "Mamma eller pappa kan vara handledare om kraven är uppfyllda. Så lägger ni upp de första passen och pratar i bilen utan att det spårar ur.",
  h1: "Övningsköra med förälder",
  eyebrow: "Familj",
  lede:
    "Mamma eller pappa får vara handledare. Det som avgör är samma krav som för andra: ålder, körkort, godkännande för just den eleven och elevens körkortstillstånd.",
  sections: [
    {
      heading: "Får en förälder vara handledare?",
      paragraphs: [
        "Ja. Släktskapet är varken ett krav eller ett hinder. Transportstyrelsen prövar personen, inte relationen. Båda föräldrarna kan vara handledare om var och en blir godkänd för eleven.",
      ],
      links: [
        { href: SUPERVISOR_PATH, label: "Handledare vid övningskörning", note: "Kraven i sin helhet" },
        { href: TS.handledare, label: "Handledare hos Transportstyrelsen" },
      ],
    },
    {
      heading: "Krav på handledaren",
      paragraphs: [
        "Du ska ha fyllt 24 år och ha ett giltigt körkort från Sverige eller ett annat EES-land. Behörigheten för det fordon ni ska köra ska ha funnits i sammanlagt minst fem av de senaste tio åren. Dessutom ska Transportstyrelsen ha godkänt dig för den här eleven.",
        "Det finns situationer där en ansökan inte blir godkänd, till exempel efter vissa återkallelser de senaste tre åren, villkor om alkolås, eller om du redan har fem elever. De fallen står samlade på sidan om handledare.",
      ],
      links: [
        { href: SUPERVISOR_PATH, label: "Ålder, körkortstid och återkallelse" },
      ],
    },
    {
      heading: "Handledarbevis",
      paragraphs: [
        "Godkännandet gäller en elev. Ska båda föräldrarna köra gör var och en en ansökan. Beviset gäller i fem år så länge körkortet inte återkallas, och det ska finnas med i bilen, på papper eller digitalt.",
      ],
    },
    {
      heading: "Körkortstillstånd",
      paragraphs: [
        "Eleven behöver ett giltigt körkortstillstånd för att övningsköra mot B-körkort. Det gäller i fem år och kan inte förlängas. ID-handlingen ska finnas med i bilen.",
      ],
      links: [
        { href: `${HUB_PATH}#korkortstillstand`, label: "Körkortstillstånd" },
      ],
    },
    {
      heading: "Introduktionsutbildning",
      paragraphs: [
        "För privat övningskörning med personbil och lätt lastbil behövs ingen introduktionsutbildning sedan den 1 augusti 2026. Godkännandet som handledare behövs fortfarande.",
      ],
      links: [
        { href: `${HUB_PATH}#introduktion`, label: "Vad som gäller för kursen" },
      ],
    },
    {
      heading: "Vem som räknas som förare",
      paragraphs: [
        "Det gör föräldern som är handledare, även när det är ens eget barn som kör. Transportstyrelsen skriver att handledaren räknas som förare, ansvarar för körningen och kan bli straffad vid en förseelse eller olycka. Eleven övar. Det flyttar inte den juridiska förarrollen.",
      ],
      links: [
        { href: TS.planera, label: "Ansvar under körningen", note: "Transportstyrelsen" },
      ],
    },
    {
      heading: "Försäkring",
      paragraphs: [
        "Villkoren bestäms av det bolag som försäkrar bilen, och de kan skilja sig åt. Transportstyrelsen skriver att handledaren räknas som förare. Om avtalet tittar på vem som kör är det den rollen som är relevant. Det ersätter inte texten i just ert avtal.",
        "Fråga bolaget vad som gäller vid privat övningskörning, och om det spelar roll vem som äger bilen eller vem som står på försäkringen. Körpasset kan inte säga att ett visst skydd gäller.",
      ],
    },
    {
      heading: "De första körpassen",
      paragraphs: [
        "Börja där det är lugnt och ta ett moment. Säg innan ni startar vad passet ska innehålla och var ni inte ska hamna. Avsluta medan ni fortfarande kan prata om vad som hände.",
        "Transportstyrelsen råder er att vänta med trafik tills eleven kan hantera bilen säkert, och att öva varje moment tills det går självständigt innan ni tar nästa.",
      ],
      links: [
        { href: "/ovningskora/forsta-gangen", label: "Första körpasset" },
        { href: PLAN_PATH, label: "Planera övningskörning" },
        { href: "/ovningskora/parkering", label: "Parkering" },
        { href: "/ovningskora/hogerregeln", label: "Högerregeln" },
      ],
    },
    {
      heading: "Prata under körningen",
      paragraphs: [
        "Säg till i tid, och säg gärna varför när det finns en sekund till det. En instruktion mitt i manövern behöver vara kort. Synpunkter på körsättet kan vänta tills bilen står stilla.",
        "Kom överens om ett ord för att sakta ner eller stanna, innan motorn går igång. Då behöver ni inte förhandla om tonen i en korsning.",
      ],
    },
    {
      heading: "När det blir stressigt",
      paragraphs: [
        "Om rösterna höjs, om eleven slutar svara eller om du styr varje meter: avbryt passet eller byt till något eleven redan kan. Ett kort pass som slutar lugnt är lättare att ta igen än ett som slutar i gräl.",
        "Ta inte upp hela körningen vid ett rödljus. En sak, kopplad till det ni bestämde före passet, räcker när ni har stannat.",
      ],
    },
    {
      heading: "Prata om målet innan ni startar",
      paragraphs: [
        "Säg vad passet är till för, vilken plats ni ska använda och hur ni märker att det räcker. Till exempel tre lugna starter, eller en känd slinga. Transportstyrelsen rekommenderar att ni planerar vad ni ska öva och var.",
        "Ett mål som är sagt i förväg gör det lättare att låta bli sidospår. Den nya rondellen på vägen hem kan bli ett eget pass.",
      ],
    },
    {
      heading: "Avsluta med en kort reflektion",
      paragraphs: [
        "När bilen står stilla får eleven berätta vad som gick bra och vad som behöver övas igen. Lägg sedan till en sak du såg, kopplad till dagens mål. Kom överens om vad nästa pass ska ta.",
        "Skriv ner det. Nästa handledare, eller du själv om en vecka, ska kunna läsa två meningar och fortsätta. I Körpasset ligger anteckningen på elevens resa, så den finns kvar även när ni turas om.",
      ],
      links: [
        { href: TS.planera, label: "Före, under och efter passet", note: "Transportstyrelsen" },
      ],
    },
  ],
  faqs: [
    {
      question: "Räcker det att man är förälder?",
      answer:
        "Nej. Föräldern ska uppfylla kraven för handledare och vara godkänd för den eleven. Ålder, körkort och godkännande prövas som för andra.",
    },
    {
      question: "Kan båda föräldrarna köra?",
      answer:
        "Ja, om var och en är godkänd för eleven. En elev kan ha flera handledare. Varje handledare kan ha högst fem elever samtidigt.",
    },
    {
      question: "Vem är juridiskt förare?",
      answer:
        "Handledaren, alltså den förälder som är godkänd och har uppsikt. Inte eleven.",
    },
  ],
  related: [
    { href: HUB_PATH, label: "Övningskörning – komplett guide" },
    { href: SUPERVISOR_PATH, label: "Handledare vid övningskörning" },
    { href: PLAN_PATH, label: "Planera övningskörning" },
    { href: "/ovningskora/forsta-gangen", label: "Första körpasset" },
    { href: PASSENGER_PATH, label: "Passagerare vid övningskörning" },
    { href: "/ovningskora/landsvag", label: "Landsväg" },
  ],
};

export const PLAN_GUIDE: StandaloneGuide = {
  path: PLAN_PATH,
  label: "Planera",
  documentTitle: "Planera övningskörningen – från första passet till uppkörning | Körpasset",
  description:
    "En progression från tom yta till landsväg och motorväg, utan en låst tidplan. Anpassa ordningen efter eleven.",
  h1: "Så planerar du övningskörningen",
  eyebrow: "Plan",
  lede:
    "Det finns ingen tidplan som passar alla. Transportstyrelsen rekommenderar regelbunden körning, lugna platser först, och att ni tar nästa moment när eleven kan göra det förra självständigt.",
  sections: [
    {
      heading: "Innan ni lägger en rutt",
      paragraphs: [
        "Körkortstillstånd, godkänd handledare, ID och grön skylt behöver vara på plats. Det formella står i guiden om övningskörning. Den här sidan handlar om ordningen på träningen.",
        "Välj ett fokus per pass och säg det innan ni kör. Transportstyrelsen rekommenderar att ni bestämmer vad ni ska öva och var.",
      ],
      links: [
        { href: HUB_PATH, label: "Övningskörning – komplett guide" },
        { href: TS.planera, label: "Planera övningskörningen", note: "Transportstyrelsen" },
      ],
    },
    {
      heading: "En möjlig progression",
      paragraphs: [
        "Listan är ett sätt att tänka, anpassat efter de moment Körpasset redan har guider för. Hoppa över ett steg som redan är lugnt. Stanna kvar på ett steg som bara gick för att handledaren pratade hela vägen. Motorväg är inte ett krav för att få fortsätta med annat, och inget steg är en garanti inför uppkörning.",
      ],
      numbered: [
        {
          text: "Fordonskontroll och grundläggande manövrering. Stol, speglar, bälte och att bilen känns bekant, på en tom yta.",
          href: "/ovningskora/forsta-gangen",
          linkLabel: "Första körpasset",
        },
        {
          text: "Start och stopp, tills det går utan att någon av er håller andan.",
          href: "/ovningskora/forsta-gangen",
          linkLabel: "Start och stopp i första passet",
        },
        "Växling och fartkontroll på samma lugna yta, innan ni blandar in korsningar. I en automatbil ser växlingen annorlunda ut. Fartkontrollen finns kvar.",
        {
          text: "Lugna bostadsområden, när start och stopp sitter.",
          href: "/ovningskora/hogerregeln",
          linkLabel: "Högerregeln i villaområdet",
        },
        {
          text: "Korsningar. Börja med omärkta korsningar ni känner, i dagsljus.",
          href: "/ovningskora/hogerregeln",
          linkLabel: "Öva högerregeln",
        },
        {
          text: "Stadstrafik i liten skala. En enkel cirkulationsplats räcker som första steg. Flerfält kan vänta.",
          href: "/ovningskora/rondell",
          linkLabel: "Öva cirkulationsplats",
        },
        {
          text: "Landsväg när tätorten känns lugn. En känd utfart, en kurva, ett möte. Omkörning kan vänta.",
          href: "/ovningskora/landsvag",
          linkLabel: "Övningskörning på landsväg",
        },
        {
          text: "Motorväg på en påfart ni känner, i dagsljus. Använd accelerationsfältet för att söka en säker lucka.",
          href: "/ovningskora/motorvag",
          linkLabel: "Öva motorväg",
        },
        {
          text: "Parkering och manövrering där det finns utrymme: backning, en stor ruta, start i lätt lutning.",
          href: "/ovningskora/parkering",
          linkLabel: "Öva parkering",
        },
        "Självständigare körning. Eleven gör mer utan påminnelse, i miljöer ni redan har övat. Variera väder och tid på dygnet när grunden är lugn.",
      ],
    },
    {
      heading: "Backning och lutning hör till manövreringen",
      paragraphs: [
        "Parkering blir lättare om backningen redan är lugn. Start i backe kan ligga tidigt, på en svag lutning utan kö, eller senare när ni ändå passerar en backe. Ta dem när eleven har kontroll på fart och uppsikt, inte för att de råkar ligga som punkt nio i en lista.",
      ],
      links: [
        { href: "/ovningskora/backning", label: "Öva backning" },
        { href: "/ovningskora/start-i-backe", label: "Start i backe" },
        { href: "/ovningskora/parkering", label: "Öva parkering" },
      ],
    },
    {
      heading: "Mörker, halka och riskutbildning",
      paragraphs: [
        "Transportstyrelsen rekommenderar att ni varierar väder och tid på dygnet. Mörker och halt väglag är svårare förhållanden, och de passar bättre när eleven redan hanterar bilen i enklare miljö. Den här sajten har inga separata pass för det, just för att de inte ska bli tunna listor.",
        "Riskutbildningens andra del tar bland annat halka på bana. Den är en obligatorisk utbildning innan förarprovet, hos en utbildare, och ersätter inte den privata körningen. Den ersätts inte heller av ett privat pass på en hal väg.",
      ],
      links: [
        { href: TS.riskutbildning, label: "Riskutbildning för personbil", note: "Transportstyrelsen" },
      ],
    },
    {
      heading: "Anpassa efter eleven",
      paragraphs: [
        "Ordningen ovan är ett förslag. En elev som redan kör lugnt i villaområdet behöver inte börja om med start och stopp för sakens skull. En elev som bara tog sig igenom en korsning för att du sa till i varje meter kan ta samma korsning igen.",
        "Hur ofta ni kör är också elevens sak. Regelbundet, som Transportstyrelsen skriver, kan vara två korta pass en vecka och inget nästa. Börja då där ni slutade.",
      ],
      links: [
        { href: `${HUB_PATH}#hur-ofta`, label: "Hur ofta ni kan köra" },
      ],
    },
    {
      heading: "Efter passet",
      paragraphs: [
        "Låt eleven säga vad som gick bra och vad som ska övas igen. Kom överens om nästa gång. En rad på papper eller i Körpasset räcker, så att nästa handledare ser samma sak.",
      ],
      links: [
        { href: PARENT_PATH, label: "Avsluta passet med en kort reflektion" },
        { href: SUPERVISOR_PATH, label: "Praktiska råd för handledaren" },
      ],
    },
  ],
  related: [
    { href: HUB_PATH, label: "Övningskörning – komplett guide" },
    { href: "/ovningskora/forsta-gangen", label: "Första körpasset" },
    { href: PARENT_PATH, label: "Övningsköra med förälder" },
    { href: "/ovningskora/landsvag", label: "Landsväg" },
    { href: "/ovningskora/motorvag", label: "Motorväg" },
    { href: "/ovningskora/rondell", label: "Cirkulationsplats" },
    { href: "/ovningskora/parkering", label: "Parkering" },
  ],
};

export const HOME_GUIDE_CARDS = [
  MOMENT_GUIDES[0],
  MOMENT_GUIDES[2],
  MOMENT_GUIDES[5],
] as const;

export const CLUSTER_GUIDES = [
  PASSENGER_GUIDE,
  PARENT_GUIDE,
  PLAN_GUIDE,
] as const;

export const PRACTICE_SITEMAP_PAGES: SitemapPage[] = [
  { path: HUB_PATH, priority: "0.9", changefreq: "monthly" },
  ...CLUSTER_GUIDES.map((guide) => ({
    path: guide.path,
    priority: "0.8",
    changefreq: "monthly" as const,
  })),
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
    ...CLUSTER_GUIDES,
    ...MOMENT_GUIDES,
    SUPERVISOR_GUIDE,
  ].map((guide) => ({
    path: guide.path,
    documentTitle: guide.documentTitle,
    description: guide.description,
    h1: guide.h1,
  }));
}
