import { renderLegalPage } from "./landing.js";

export function privacyPage(): string {
  return renderLegalPage(
    "Integritetspolicy",
    `<h1>Integritetspolicy</h1>
     <p>Senast uppdaterad: 21 september 2026.</p>
     <p>Papa Bravo AB är personuppgiftsansvarig för Körpasset, en tjänst för privat övningskörning när ni ska ta körkort. Vi samlar in så lite som möjligt, säljer inte dina uppgifter och använder dem inte för riktad annonsmarknadsföring.</p>

     <h2>Intresseanmälan till betan</h2>
     <p>När du anmäler intresse behandlar vi namn, e-post, roll (elev, förälder, handledare eller annat), om ni använder iPhone och/eller Android, samt valfri ort och fritext. Rättslig grund är samtycke. Syftet är att kontakta dig om betan och administrera kön. Vi skickar en bekräftelse till samma adress.</p>
     <p>Vi använder inte uppgifterna till nyhetsbrev, säljmejl eller profilering.</p>

     <h2>När du använder appen</h2>
     <p>Produktkonton skapas i iOS- och Android-appen via Sign in with Apple eller Sign in with Google. Vi tar emot en identitetstoken från Apple eller Google, verifierar den på servern och lagrar provider samt deras användar-id (<code>sub</code>) — inte e-postadressen som inloggningsnyckel. Apple och Google är mottagare av den inloggningsuppgift du väljer att använda. E-post som följer med från dem används inte för att slå ihop konton.</p>
     <p>För körkortsresan behandlar vi visningsnamn, session, inbjudningar, valda träningsmoment, körpass och handledarens korta bedömningar. Det är träningsanteckningar, inte betyg, hälsodata eller ett officiellt körkortsdokument. Rättslig grund är att tillhandahålla tjänsten.</p>
     <p>Vi samlar inte in personnummer, GPS-spår, biometri, betaluppgifter eller hälsodata. Vi behandlar inte särskilda kategorier av personuppgifter.</p>

     <h2>Data på enheten</h2>
     <p>Körpasset är en app som visar tjänsten från <code>korpasset.se</code>. På telefonen sparas bara det som behövs för att du ska förbli inloggad: en nödvändig sessionscookie och en cookie som känner igen att du öppnar appen. Körpass, namn och bedömningar lagras på servern, inte i en lokal databas på enheten.</p>
     <p>Appen begär inte tillgång till kamera, mikrofon, position, kontakter, foton, kalender eller Bluetooth. Vi läser inte av andra appar och samlar inte in reklam-id.</p>

     <h2>Lagring och delning</h2>
     <p>Uppgifterna lagras på Körpassets server och databas inom EU/EES. Förbindelsen är HTTPS. Vi säljer inte uppgifter och delar dem inte med annonsnätverk. Apple och Google tar emot inloggningsuppgiften när du fortsätter med deras konto. Hostingleverantören behandlar data som personuppgiftsbiträde i EU/EES.</p>
     <p>Intresseanmälningar raderas senast 18 månader efter anmälan, tidigare på begäran, eller när betan är avslutad och kön inte längre behövs. Under betan sker radering manuellt av admin — det finns inget automatiskt retention-jobb.</p>

     <h2>Radera konto</h2>
     <p>Du kan radera produktkontot i appen under <a href="/konto">Konto</a> genom att skriva RADERA. Då tas din inloggning bort. Om du är elev raderas din körkortsresa. Om du är handledare behålls historiken hos eleven, utan ditt namn.</p>

     <h2>Barn</h2>
     <p>Körpasset är till för privat övningskörning, normalt från 16 år med handledare. Tjänsten är inte riktad till barn under 13 år.</p>

     <h2>Dina rättigheter</h2>
     <p>Du kan begära registerutdrag, rättelse, radering av hela eller delar av din data, eller återkalla samtycket via <a href="mailto:support@korpasset.se">support@korpasset.se</a>, <a href="mailto:info@korpasset.se">info@korpasset.se</a> eller <a href="/kontakt">kontakt</a>. Du kan klaga till Integritetsskyddsmyndigheten.</p>
     <p>Så raderar du ditt Körpasset-konto: <a href="/radera-konto">Radera konto</a>.</p>

     <h2>Cookies</h2>
     <p>På landningssidan sätter vi inga analys- eller reklamcookies och gör inga tredjepartsanrop för typsnitt. Om du loggar in i produkten används en nödvändig sessionscookie. Waitlist-admin använder en separat HttpOnly-cookie på <code>/admin</code>.</p>`,
    "/integritet",
    "Hur Körpasset och Papa Bravo AB behandlar personuppgifter i betan och i produkten. Vi säljer inte dina uppgifter.",
  );
}

export function termsPage(): string {
  return renderLegalPage(
    "Användarvillkor",
    `<h1>Användarvillkor</h1>
     <p>Senast uppdaterad: 21 september 2026.</p>
     <p>Körpasset är en digital tjänst för privat övningskörning mot svenskt B-körkort. Tjänsten tillhandahålls av Papa Bravo AB och hjälper körkortselev och handledare att övningsköra med en plan och träna inför körkort.</p>

     <h2>Beta</h2>
     <p>Under den första betan är Körpasset gratis. En intresseanmälan ger inte automatiskt tillgång och är inte ett löfte om livstidsfri användning. Vi väljer in familjer löpande. Produktkonton skapas i appen med Apple eller Google. Kontot kan raderas under Konto i appen.</p>

     <h2>Vad tjänsten är — och inte är</h2>
     <p>Körpasset hjälper körkortselev och handledare att planera, följa upp och hålla ihop praktisk övningskörning. Det är inte en teoriapp, inte en AI-trafiklärare, inte en trafikskoleportal och inte ett officiellt körkortsdokument. Körpasset är inte utvecklat av, anslutet till eller godkänt av Transportstyrelsen eller Trafikverket.</p>
     <p>Läget i procent kommer från era bedömningar och är inte ett officiellt körkortsresultat. Körpasset ersätter inte handledarens ansvar i bilen. Den bedömer inte om eleven är redo för uppkörning.</p>

     <h2>Ansvar</h2>
     <p>Du ansvarar för att de uppgifter du lämnar är riktiga och för hur ni övningskör. Körpasset tillhandahålls i befintligt skick. Svensk lag gäller.</p>

     <h2>Kontakt</h2>
     <p>Allmänt: <a href="mailto:info@korpasset.se">info@korpasset.se</a>. Support: <a href="mailto:support@korpasset.se">support@korpasset.se</a>.</p>`,
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
