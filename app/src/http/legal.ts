import { renderLegalPage } from "./landing.js";

export function privacyPage(): string {
  return renderLegalPage(
    "Integritetspolicy",
    `<h1>Integritetspolicy</h1>
     <p>Senast uppdaterad: 20 september 2026.</p>
     <p>Papa Bravo AB är personuppgiftsansvarig för Körpasset. Vi samlar in så lite som möjligt, säljer inte dina uppgifter och använder dem inte för riktad annonsmarknadsföring.</p>

     <h2>Intresseanmälan till betan</h2>
     <p>När du anmäler intresse behandlar vi namn, e-post, roll (elev, förälder, handledare eller annat), om ni använder iPhone och/eller Android, samt valfri ort och fritext. Rättslig grund är samtycke. Syftet är att kontakta dig om betan och administrera kön.</p>
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
     <p>Du kan begära registerutdrag, rättelse, radering eller återkalla samtycket via <a href="mailto:info@korpasset.se">info@korpasset.se</a> eller <a href="/kontakt">kontakt</a>. Du kan klaga till Integritetsskyddsmyndigheten.</p>

     <h2>Cookies</h2>
     <p>På landningssidan sätter vi inga analys- eller reklamcookies och gör inga tredjepartsanrop för typsnitt. Om du loggar in i produkten används en nödvändig sessionscookie. Waitlist-admin använder en separat HttpOnly-cookie på <code>/admin</code>.</p>`,
    "/integritet",
  );
}

export function termsPage(): string {
  return renderLegalPage(
    "Användarvillkor",
    `<h1>Användarvillkor</h1>
     <p>Senast uppdaterad: 20 september 2026.</p>
     <p>Körpasset är en digital tjänst för privat övningskörning mot svenskt B-körkort. Tjänsten tillhandahålls av Papa Bravo AB.</p>

     <h2>Beta</h2>
     <p>Under den första betan är Körpasset gratis. En intresseanmälan ger inte automatiskt tillgång och är inte ett löfte om livstidsfri användning. Vi väljer in familjer löpande. Produktkonton skapas i appen med Apple eller Google. Kontot kan raderas under Konto i appen.</p>

     <h2>Vad tjänsten är — och inte är</h2>
     <p>Körpasset hjälper elev och handledare att planera, följa upp och hålla ihop praktisk träning. Det är inte en teoriapp, inte en AI-trafiklärare, inte en trafikskoleportal och inte ett officiellt körkortsdokument. Körpasset är inte utvecklat av, anslutet till eller godkänt av Transportstyrelsen eller Trafikverket.</p>
     <p>Produkten visar inte påstådd uppkörningsberedskap i procent och ersätter inte handledarens ansvar i bilen.</p>

     <h2>Ansvar</h2>
     <p>Du ansvarar för att de uppgifter du lämnar är riktiga och för hur ni övningskör. Körpasset tillhandahålls i befintligt skick. Svensk lag gäller.</p>

     <h2>Kontakt</h2>
     <p>Allmänt: <a href="mailto:info@korpasset.se">info@korpasset.se</a>. Support: <a href="mailto:support@korpasset.se">support@korpasset.se</a>.</p>`,
    "/villkor",
  );
}

export function contactPage(): string {
  return renderLegalPage(
    "Kontakt",
    `<h1>Kontakt</h1>
     <p>Körpasset är i sluten beta. Den snabbaste vägen in är <a href="/#intresse">intresseanmälan</a> — då hamnar du i kön och vi kan återkomma.</p>
     <p>Allmän kontakt: <a href="mailto:info@korpasset.se">info@korpasset.se</a>.</p>
     <p>Support och personuppgiftsfrågor: <a href="mailto:support@korpasset.se">support@korpasset.se</a>.</p>
     <p>Personuppgiftsansvarig: Papa Bravo AB.</p>
     <p>Körpasset är en fristående tjänst och är inte utvecklad av, ansluten till eller godkänd av Transportstyrelsen eller Trafikverket.</p>`,
    "/kontakt",
  );
}
