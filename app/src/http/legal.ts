import { renderLegalPage } from "./landing.js";

export function privacyPage(): string {
  return renderLegalPage(
    "Integritetspolicy",
    `<h1>Integritetspolicy</h1>
     <p>Senast uppdaterad: 23 september 2026</p>
     <p>Papa Bravo AB är personuppgiftsansvarig för Körpasset, en digital tjänst för privat övningskörning mot svenskt B-körkort.</p>
     <p>Vi samlar in så lite personuppgifter som möjligt. Vi säljer inte dina personuppgifter och använder dem inte för riktad annonsmarknadsföring.</p>
     <p>Du kan kontakta oss på:</p>
     <ul>
       <li>Allmänt: <a href="mailto:info@korpasset.se">info@korpasset.se</a></li>
       <li>Dataskydd och support: <a href="mailto:support@korpasset.se">support@korpasset.se</a></li>
     </ul>

     <h2>Intresseanmälan till betan</h2>
     <p>När du anmäler intresse behandlar vi:</p>
     <ul>
       <li>namn</li>
       <li>e-postadress</li>
       <li>roll, till exempel elev, förälder eller handledare</li>
       <li>om ni använder iPhone och/eller Android</li>
       <li>valfri ort</li>
       <li>eventuell fritext som du själv lämnar</li>
     </ul>
     <p>Syftet är att administrera betakön, kontakta dig om Körpassets beta och skicka en bekräftelse på din anmälan.</p>
     <p>Den rättsliga grunden är ditt samtycke. Du lämnar samtycket genom att kryssa i rutan att du vill bli kontaktad om betan. Du kan när som helst återkalla samtycket genom att kontakta oss.</p>
     <p>Vi använder inte uppgifterna från intresseanmälan för nyhetsbrev, generell säljmarknadsföring eller profilering.</p>

     <h2>När du använder Körpasset</h2>
     <p>När du får tillgång till Körpasset behandlar vi de uppgifter som behövs för att skapa konto och använda en körkortsresa. Det kan bland annat vara:</p>
     <ul>
       <li>visningsnamn</li>
       <li>e-postadress</li>
       <li>användar-id från inloggningsleverantören</li>
       <li>session och teknisk kontoinformation</li>
       <li>körkortsresor, inklusive ungefärlig övningsnivå som ni själva anger</li>
       <li>deltagare och inbjudningar</li>
       <li>körpass</li>
       <li>övningsmoment</li>
       <li>observationer</li>
       <li>anteckningar och uppföljning</li>
       <li>rekommendationer om vad ni kan träna vidare på</li>
       <li>tekniska produkthändelser, till exempel att en resa skapats eller ett körpass avslutats</li>
     </ul>
     <p>Den rättsliga grunden för behandling som är nödvändig för att tillhandahålla Körpasset är att fullgöra avtalet om tjänsten.</p>
     <p>Produkthändelser kopplas till interna id:n. De används för att driva och förstå betan, inte för reklam.</p>
     <p>En administratör kan spara en kontakt-e-post på kontot för support. Den adressen är inte inloggningsnyckel.</p>

     <h2>Inloggning med Apple eller Google</h2>
     <p>Inloggning sker med Sign in with Apple eller Sign in with Google.</p>
     <p>När du loggar in kan vi få uppgifter som e-postadress, namn och ett unikt användar-id (<code>sub</code>) från Apple eller Google, beroende på vilka uppgifter du väljer eller leverantören skickar.</p>
     <p>Körpasset använder leverantörens unika användar-id som identitetsnyckel. E-postadressen sparas när den lämnas till oss så att vi kan administrera kontot och tjänsten.</p>
     <p>Apple och Google behandlar också uppgifter enligt sina egna villkor och integritetspolicyer.</p>

     <h2>Uppgifter inom en körkortsresa</h2>
     <p>En körkortsresa kan delas mellan eleven och en eller flera handledare.</p>
     <p>Det innebär att uppgifter om en person ibland kan registreras av en annan deltagare i samma körkortsresa. En handledare kan till exempel registrera ett genomfört körpass eller en observation om vad ni tränade på.</p>
     <p>Sådana uppgifter används för att hålla ihop den gemensamma körkortsresan och göra informationen tillgänglig för de deltagare som har behörighet till den.</p>

     <h2>Vad vi inte samlar in</h2>
     <p>Körpasset samlar inte in:</p>
     <ul>
       <li>personnummer</li>
       <li>GPS-spår från körningen</li>
       <li>hälsodata</li>
     </ul>
     <p>Vi använder inte Körpasset för att fatta automatiserade beslut som har rättsliga eller på liknande sätt betydande konsekvenser för dig.</p>
     <p>Rekommendationer i tjänsten är stöd för planering av övningskörningen. De är inte en bedömning av om eleven är redo för uppkörning.</p>

     <h2>Leverantörer och mottagare</h2>
     <p>Vi använder externa leverantörer när det behövs för att driva Körpasset:</p>
     <ul>
       <li>server och databas hos en hostingleverantör inom EU/EES</li>
       <li>e-post via Resend, för bekräftelse på intresseanmälan och administratörsmejl</li>
       <li>inloggning och identitet via Sign in with Apple och Sign in with Google</li>
     </ul>
     <p>Sådana leverantörer får bara behandla personuppgifter i den omfattning som behövs för respektive tjänst och enligt tillämpliga avtal och dataskyddsregler.</p>
     <p>Sign in with Apple och Sign in with Google innebär att Apple respektive Google behandlar uppgifter i samband med inloggningen. De kan behandla uppgifter utanför EU/EES.</p>
     <p>Resend kan behandla e-postuppgifter utanför EU/EES när bekräftelsemejl skickas.</p>
     <p>Vi använder inte analys- eller reklamleverantörer och har ingen betalningsleverantör i betan.</p>

     <h2>Lagring</h2>
     <p>Personuppgifter från en intresseanmälan raderas senast 18 månader efter anmälan, tidigare om du begär det eller när betakön inte längre behövs.</p>
     <p>Under betan sker denna radering manuellt av administratör. Det finns för närvarande inget automatiskt retention-jobb för intresseanmälningar.</p>
     <p>Uppgifter i ett Körpasset-konto och en körkortsresa sparas så länge de behövs för att tillhandahålla tjänsten. Det finns inget automatiskt jobb som raderar inaktiva konton.</p>

     <h2>Säkerhet</h2>
     <p>Körpassets server och databas är placerade inom EU/EES.</p>
     <p>Kommunikation med Körpasset sker över krypterad HTTPS-anslutning.</p>
     <p>I produktion loggas teknisk information om anrop, bland annat IP-adress och sökväg, för drift och felsökning. Cookies och inloggningstokens redakteras i loggarna.</p>
     <p>Vi arbetar med tekniska och organisatoriska säkerhetsåtgärder för att skydda uppgifterna mot obehörig åtkomst, förlust och förändring.</p>

     <h2>Dina rättigheter</h2>
     <p>Beroende på situationen har du enligt GDPR rätt att:</p>
     <ul>
       <li>få information om hur vi behandlar dina personuppgifter</li>
       <li>få tillgång till dina personuppgifter</li>
       <li>få felaktiga uppgifter rättade</li>
       <li>begära radering</li>
       <li>begära begränsning av behandlingen</li>
       <li>invända mot viss behandling</li>
       <li>få ut uppgifter i ett portabelt format när reglerna om dataportabilitet är tillämpliga</li>
       <li>återkalla ett samtycke som du tidigare har lämnat</li>
     </ul>
     <p>Att återkalla ett samtycke påverkar inte lagligheten av behandling som redan har skett innan samtycket återkallades.</p>
     <p>Kontakta <a href="mailto:support@korpasset.se">support@korpasset.se</a> eller <a href="mailto:info@korpasset.se">info@korpasset.se</a> om du vill använda någon av dina rättigheter. Du kan också använda <a href="/kontakt">kontaktsidan</a>.</p>
     <p>Du har också rätt att lämna klagomål till Integritetsskyddsmyndigheten, IMY.</p>

     <h2>Radera konto</h2>
     <p>Du kan radera ditt Körpasset-konto via funktionen Radera konto i tjänsten. Utan appen: <a href="/radera-konto">Radera konto</a>.</p>
     <p>Om du inte kommer åt ditt konto kan du kontakta <a href="mailto:support@korpasset.se">support@korpasset.se</a>.</p>
     <p>När ett konto raderas gör tjänsten följande i dag:</p>
     <ul>
       <li>Visningsnamn och eventuell kontakt-e-post nollas.</li>
       <li>Inloggningskopplingar till Apple och Google tas bort. Du kan inte logga in på samma konto igen.</li>
       <li>Sessionen på den enhet där du raderar rensas. På andra enheter slutar den gamla sessionen gälla nästa gång tjänsten läser kontot, eftersom kontot är markerat som raderat.</li>
       <li>Om du är elev raderas din körkortsresa med körpass, observationer, träningsfokus och inbjudningar.</li>
       <li>Om du är handledare tas din åtkomst till andras resor bort. Körpass och observationer som hör till elevens resa behålls, utan ditt namn. Kvarvarande koppling är ett internt användar-id som inte går att logga in med.</li>
       <li>Själva användarraden raderas inte ur databasen. Kontot markeras som raderat.</li>
       <li>En intresseanmälan till betan raderas inte automatiskt med produktkontot.</li>
     </ul>
     <p>Interna produkthändelser kan fortfarande innehålla samma interna användar-id. De innehåller inte namn eller e-post.</p>
     <p>Databasbackuper kan innehålla uppgifter en tid efter radering. Det finns för närvarande ingen automatisk rensning av backuper i tjänsten.</p>

     <h2>Cookies och lokal teknik</h2>
     <p>På Körpassets publika landningssida sätter vi inga cookies och gör inga tredjepartsanrop för typsnitt, analys eller reklam.</p>
     <p>När du loggar in i produkten sätts en nödvändig HttpOnly-cookie som håller dig inloggad i upp till ett år. Cookien innehåller en signerad hänvisning till ditt användar-id, inte namn eller e-postadress.</p>
     <p>När en elev öppnar handledarens startlänk kan en HttpOnly-cookie sättas i upp till sju dagar. Den används för att hålla reda på den tekniska händelsen att länken öppnats. Värdet är en teknisk flagga, inte namn eller e-postadress. Cookien sätts inte av en vanlig inbjudningslänk.</p>
     <p>När du öppnar produkten eller en inbjudan kan en cookie användas för att känna igen att du kommit in via appen eller den ytan. Den är inte HttpOnly och innehåller bara värdet 1, inte namn eller e-postadress.</p>
     <p>Administrationsdelen använder en separat nödvändig HttpOnly-cookie för autentisering, i upp till 12 timmar.</p>
     <p>I appen kan webbläsarens sessionStorage användas tillfälligt för inbjudningslänkar. Det skickas inte som en cookie.</p>
     <p>Dessa tekniker används för att tjänsten ska fungera och inte för reklam eller spårning mellan olika webbplatser.</p>

     <h2>Ändringar i policyn</h2>
     <p>Vi kan uppdatera denna integritetspolicy när Körpasset utvecklas eller när vår behandling av personuppgifter förändras.</p>
     <p>Datumet högst upp på sidan visar när policyn senast uppdaterades. Vid större förändringar informerar vi på ett tydligt sätt i tjänsten.</p>`,
    "/integritet",
    "Hur Körpasset och Papa Bravo AB behandlar personuppgifter i betan och i produkten. Vi säljer inte dina uppgifter.",
  );
}

export function termsPage(): string {
  return renderLegalPage(
    "Användarvillkor",
    `<h1>Användarvillkor</h1>
     <p>Senast uppdaterad: 23 september 2026</p>
     <p>Körpasset är en digital tjänst för privat övningskörning mot svenskt B-körkort.</p>
     <p>Tjänsten tillhandahålls av Papa Bravo AB.</p>
     <p>Genom att skapa ett konto och använda Körpasset accepterar du dessa användarvillkor.</p>

     <h2>Beta</h2>
     <p>Körpasset befinner sig för närvarande i beta och är gratis för de användare som får tillgång till betan.</p>
     <p>En intresseanmälan innebär inte automatiskt att du får tillgång till tjänsten. Vi bjuder in deltagare löpande.</p>
     <p>Tillgång till den kostnadsfria betan innebär inte ett löfte om att Körpasset kommer att vara gratis i framtiden eller att en användare får livslång fri tillgång.</p>
     <p>Om betalning införs kommer pris och villkor för köp att visas innan något köp genomförs.</p>

     <h2>Vad Körpasset är</h2>
     <p>Körpasset hjälper körkortselev och handledare att:</p>
     <ul>
       <li>planera övningskörning</li>
       <li>dokumentera körpass</li>
       <li>följa vad ni har tränat på</li>
       <li>se vad som kan vara lämpligt att träna vidare på</li>
       <li>hålla ihop körkortsresan mellan elev och en eller flera handledare</li>
     </ul>
     <p>En elev kan ha flera handledare kopplade till samma körkortsresa.</p>

     <h2>Vad Körpasset inte är</h2>
     <p>Körpasset är inte:</p>
     <ul>
       <li>en trafikskola</li>
       <li>en teoriapp</li>
       <li>en AI-trafiklärare</li>
       <li>en officiell bedömning av körförmåga</li>
       <li>ett officiellt körkortsdokument</li>
       <li>ett system från Transportstyrelsen eller Trafikverket</li>
     </ul>
     <p>Körpasset är inte utvecklat av, anslutet till eller godkänt av Transportstyrelsen eller Trafikverket.</p>
     <p>Körpasset visar inte någon procentsats för uppkörningsberedskap och bedömer inte om eleven är redo för uppkörning.</p>
     <p>Rekommendationer i tjänsten är endast stöd för planering av fortsatt övning.</p>

     <h2>Ansvar vid övningskörning</h2>
     <p>Körpasset förändrar inte elevens eller handledarens ansvar enligt svensk trafik- och körkortslagstiftning.</p>
     <p>Det är användarnas ansvar att kontrollera att alla krav för privat övningskörning är uppfyllda, exempelvis giltigt körkortstillstånd, godkänd handledare och eventuell introduktionsutbildning när sådan krävs.</p>
     <p>Handledaren ansvarar för övningskörningen på samma sätt oavsett om Körpasset används eller inte.</p>
     <p>Följ alltid gällande trafikregler och anpassa körningen efter elevens erfarenhet, trafikmiljön och förhållandena på platsen.</p>

     <h2>Konto</h2>
     <p>Du ansvarar för att uppgifterna i ditt konto är korrekta och för att skydda din inloggning.</p>
     <p>Inloggning sker genom de inloggningsmetoder som Körpasset tillhandahåller, exempelvis Sign in with Apple eller Sign in with Google.</p>
     <p>Försök inte få tillgång till andra användares konton eller körkortsresor utan tillåtelse.</p>

     <h2>Elever under 18 år</h2>
     <p>Körpasset kan användas av körkortselever som ännu inte har fyllt 18 år.</p>
     <p>Under den kostnadsfria betan innebär användningen ingen betalningsskyldighet.</p>
     <p>Eventuella framtida köp omfattas av de regler som gäller för avtal och köp som görs av minderåriga. Betalning och köp kommer att ha separata och tydliga villkor innan de kan genomföras.</p>

     <h2>Inbjudningar och deltagare</h2>
     <p>En körkortsresa kan delas med andra personer genom Körpassets inbjudningsfunktion.</p>
     <p>Skicka bara en inbjudan till personer som ska delta i den aktuella körkortsresan.</p>
     <p>En deltagare som får tillgång till resan kan, beroende på sin roll, se och lägga till information om körpass och övningen.</p>

     <h2>Tillåten användning</h2>
     <p>Du får inte använda Körpasset för att:</p>
     <ul>
       <li>bryta mot lag</li>
       <li>försöka få obehörig åtkomst till tjänsten eller andra användares uppgifter</li>
       <li>störa eller skada tjänstens tekniska funktion</li>
       <li>automatiskt hämta stora mängder data utan tillåtelse</li>
       <li>använda tjänsten på ett sätt som kan skada andra användare eller Körpasset</li>
     </ul>
     <p>Vi får begränsa eller stänga av åtkomst vid allvarligt missbruk, säkerhetsproblem eller brott mot dessa villkor.</p>

     <h2>Beta, tillgänglighet och förändringar</h2>
     <p>Körpasset är under aktiv utveckling.</p>
     <p>Under betan kan funktioner:</p>
     <ul>
       <li>förändras</li>
       <li>läggas till</li>
       <li>tas bort</li>
       <li>fungera annorlunda än tidigare</li>
       <li>tillfälligt vara otillgängliga</li>
     </ul>
     <p>Vi arbetar för att Körpasset ska vara stabilt och säkert men kan inte garantera att tjänsten alltid är tillgänglig utan avbrott eller fel.</p>
     <p>Detta begränsar inte rättigheter som följer av tvingande lag.</p>

     <h2>Din information</h2>
     <p>Du behåller rättigheterna till information och innehåll som du själv skapar i Körpasset.</p>
     <p>Du ger Papa Bravo AB rätt att tekniskt lagra, behandla och visa informationen i den utsträckning som behövs för att tillhandahålla Körpasset till dig och de personer som deltar i samma körkortsresa.</p>
     <p>Hur personuppgifter behandlas beskrivs närmare i vår <a href="/integritet">Integritetspolicy</a>.</p>

     <h2>Körpassets rättigheter</h2>
     <p>Körpasset, inklusive programvara, design, varumärke, texter och övrigt material som tillhör tjänsten, ägs av Papa Bravo AB eller används med tillstånd.</p>
     <p>Du får använda tjänsten för dess avsedda ändamål men får inte kopiera, distribuera eller exploatera Körpasset eller dess programvara utöver vad lag tillåter.</p>

     <h2>Radera konto och avsluta användning</h2>
     <p>Du kan när som helst sluta använda Körpasset.</p>
     <p>Om funktionen finns tillgänglig i ditt konto kan du använda Radera konto för att begära radering.</p>
     <p>Du kan också kontakta <a href="mailto:support@korpasset.se">support@korpasset.se</a> eller använda sidan <a href="/radera-konto">Radera konto</a>.</p>
     <p>Vad som händer med personuppgifter när ett konto tas bort beskrivs i <a href="/integritet">Integritetspolicyn</a>.</p>

     <h2>Ansvarsbegränsning</h2>
     <p>Körpasset är ett stödverktyg för privat övningskörning och ersätter inte professionell undervisning, förarens eller handledarens omdöme eller myndigheternas krav.</p>
     <p>Papa Bravo AB ansvarar inte för beslut i trafiken som fattas av elev, handledare eller annan förare utifrån information i Körpasset.</p>
     <p>Ingenting i dessa villkor begränsar ansvar eller rättigheter som inte får begränsas enligt tvingande svensk lag.</p>

     <h2>Ändringar av tjänsten och villkoren</h2>
     <p>Vi kan utveckla och förändra Körpasset över tid.</p>
     <p>Vi kan också uppdatera dessa villkor när tjänsten, lagstiftningen eller vårt erbjudande förändras.</p>
     <p>Vid större förändringar som har betydelse för användarna informerar vi på ett tydligt sätt innan eller i samband med att förändringen börjar gälla.</p>
     <p>Datumet högst upp visar när villkoren senast uppdaterades.</p>

     <h2>Svensk lag och tvister</h2>
     <p>Svensk lag gäller för dessa villkor.</p>
     <p>Om du är missnöjd vill vi i första hand att du kontaktar oss så att vi kan försöka lösa problemet.</p>
     <p>Som konsument kan du även ha möjlighet att vända dig till Allmänna reklamationsnämnden (ARN).</p>
     <p>Dina rättigheter enligt tvingande konsumentlagstiftning påverkas inte av dessa villkor.</p>

     <h2>Kontakt</h2>
     <p>Allmänt: <a href="mailto:info@korpasset.se">info@korpasset.se</a></p>
     <p>Support: <a href="mailto:support@korpasset.se">support@korpasset.se</a></p>`,
    "/villkor",
    "Användarvillkor för Körpasset. Privat övningskörning mot B-körkort: stöd för handledare och elev som ska ta körkort, inte ett betyg inför uppkörning.",
  );
}

export function contactPage(): string {
  return renderLegalPage(
    "Kontakt",
    `<h1>Kontakt</h1>
     <p class="lede">Körpasset är ett stöd för privat övningskörning när ni ska ta körkort.</p>
     <p>Hör av dig om du är handledare, körkortselev eller förälder och vill övningsköra med bättre struktur. Tjänsten hjälper er träna inför körkort och uppkörning och hålla ihop handledare under övningskörningen. Eleven behöver körkortstillstånd.</p>
     <p>Körpasset är i sluten beta. Den snabbaste vägen in är <a href="/#intresse">intresseanmälan</a> — då hamnar du i kön och vi kan återkomma.</p>
     <p>Allmän kontakt: <a href="mailto:info@korpasset.se">info@korpasset.se</a>.</p>
     <p>Support och personuppgiftsfrågor: <a href="mailto:support@korpasset.se">support@korpasset.se</a>.</p>
     <p>Personuppgiftsansvarig: Papa Bravo AB.</p>
     <p>Vill du radera ditt Körpasset-konto och tillhörande data? Gå till <a href="/radera-konto">radera konto</a>.</p>
     <p>Körpasset är en fristående tjänst och är inte utvecklad av, ansluten till eller godkänd av Transportstyrelsen eller Trafikverket.</p>`,
    "/kontakt",
    "Kontakta Körpasset om privat övningskörning, handledare, körkortselev och betan. Support och personuppgiftsfrågor till Papa Bravo AB.",
  );
}

export function accountDeletionPage(): string {
  return renderLegalPage(
    "Radera konto",
    `<h1>Radera ditt Körpasset-konto</h1>
     <p>Papa Bravo AB är personuppgiftsansvarig för appen Körpasset. På den här sidan begär du att ditt konto och tillhörande data ska raderas. Du behöver inte ha appen installerad.</p>

     <h2>Så begär du radering</h2>
     <h3>I appen Körpasset</h3>
     <ol>
       <li>Öppna Körpasset och gå till <strong>Konto</strong>.</li>
       <li>Skriv <strong>RADERA</strong> i bekräftelsefältet.</li>
       <li>Tryck på <strong>Radera mitt konto</strong>.</li>
     </ol>
     <p>Raderingen i appen sker direkt.</p>

     <h3>Utan appen</h3>
     <p>Skicka e-post till <a href="mailto:support@korpasset.se?subject=Radera%20K%C3%B6rpasset-konto">support@korpasset.se</a> och skriv att du vill radera ditt Körpasset-konto. Ange visningsnamn och om du är elev eller handledare, om du kan. Använd gärna samma e-postadress som hör till Sign in with Apple eller Sign in with Google.</p>
     <p><a class="btn btn-primary" href="mailto:support@korpasset.se?subject=Radera%20K%C3%B6rpasset-konto">Skicka raderingsbegäran</a></p>
     <p>Vi behandlar e-postbegäranden inom 30 dagar.</p>

     <h2>Vad som raderas</h2>
     <ul>
       <li>Visningsnamn och inloggningskopplingar (Sign in with Apple, Sign in with Google och session).</li>
       <li>Om du är elev: körkortsresan med körpass, observationer, träningsfokus och inbjudningar.</li>
       <li>Om du är handledare: din åtkomst till andras resor. Ditt namn tas bort från historiken.</li>
     </ul>

     <h2>Vad som behålls</h2>
     <ul>
       <li>Om du är handledare behålls observationer och körpass på elevens resa, utan ditt namn, så att eleven inte förlorar sin historik. Kvarvarande koppling är ett internt användar-id som inte går att logga in med.</li>
       <li>Intresseanmälan till betan (namn och e-post på korpasset.se) raderas inte automatiskt med produktkontot. Begär det i samma mejl om du vill att den också ska tas bort. Intresseanmälningar raderas senast 18 månader efter anmälan.</li>
     </ul>

     <h2>Radera data utan att radera kontot</h2>
     <p>Du kan begära att delar av din data raderas utan att radera kontot, till exempel intresseanmälan eller visningsnamn. Skriv vad du vill ta bort i mejlet till <a href="mailto:support@korpasset.se">support@korpasset.se</a>.</p>

     <p>Ett raderat konto kan inte återställas. Vill du tillbaka senare skapar du ett nytt konto i appen Körpasset.</p>
     <p>Mer i <a href="/integritet">integritetspolicyn</a>.</p>`,
    "/radera-konto",
    "Radera ditt Körpasset-konto och tillhörande data. Papa Bravo AB tar emot begäran i appen eller via e-post.",
  );
}
