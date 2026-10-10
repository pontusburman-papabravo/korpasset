# Nästa körpass — kampanjbilder

Färdiga annonsbilder för budskapet **Vad ska ni öva på nästa körpass?**

Länk: https://korpasset.se/kom-igang

Bilderna är sammansatta av en riktig skärmbild från den inloggade appen, logotypen i `app/public/brand/korpasset-logo.svg` och Körpassets färger (`#1A2B4C`, `#00C896`, varm bakgrund `#F6F3EC`). Ingen bildgenerering.

## Färdiga format

| Fil | Mått | Användning |
| --- | --- | --- |
| `exports/korpasset-nasta-korpass-1080x1350.png` | 1080 × 1350 | Facebook/Instagram-flöde |
| `exports/korpasset-nasta-korpass-1080x1080.png` | 1080 × 1080 | Kvadrat |
| `exports/korpasset-nasta-korpass-1080x1920.png` | 1080 × 1920 | Stories/Reels |

Stories-bilden har tom yta ovanför logotypen och under adressen, så plattformens kontroller inte täcker rubrik eller knapp.

Annonsbilden visar ett utsnitt av skärmbilden: från **Alex körkortsresa** till och med **Starta körpass**. Appens header och flikrad finns i de råa skärmbilderna. Utsnittet är till för att planen och startknappen ska gå att läsa i mobilstorlek. Bilden är inte utsträckt.

## Råa skärmbilder

Viewport: **390 × 844 CSS-pixlar**, `deviceScaleFactor` **3**. Playwright med Chrome, locale `sv-SE`, tidszon `Europe/Stockholm`.

| Fil | Route | Vad den visar |
| --- | --- | --- |
| `raw/04-nasta-handledare.png` | `/journey/{id}/nasta` som handledaren Erik | Sparad plan och **Starta körpass**. Den här bilden används i annonsen. |
| `raw/01-nasta-elev.png` | samma route som eleven Alex | Samma plan, plus valet mellan handledare. Hjälp-knappen ligger över högerkanten av startknappen i den här vyn. |
| `raw/02-sa-gick-det.png` | `/journey/{id}/drive/{id}/done` | **Så gick det** efter senaste körpasset. |
| `raw/03-utveckling.png` | `/journey/{id}/utveckling` | Läge per kapitel, blandade bedömningar. |
| `raw/05-handledare.png` | `/journey/{id}` som Alex, skrollad till handledarna | Erik och Sara. Hjälp-knappen täcker en rad i växellådskortet under. |

Appens commit när skärmbilderna togs: `9fce2baba36cbe262859feb9a3f317022e7ce5f5`.

De inloggade vyerna (`/nasta`, `/utveckling`, körpassets uppföljning) är oförändrade mot `origin/main` `b747987`, som lade till `/kom-igang`.

## Demodata

Lokalt bara. Ingen produktionsdatabas.

1. Inbäddad Postgres på `127.0.0.1:54329`, samma användare och databasnamn som `db/docker-compose.yml`. Docker fanns inte i miljön. Start: `scripts/start-demo-db.mts`.
2. Migrationer och taxonomi-seed via appens `applyMigrations` och `seedTaxonomy`.
3. Resan skapades med appens tjänster i `scripts/seed-demo.mts`:
   - elev **Alex**, övningsläge `building`, manuell växellåda
   - handledare **Erik** och **Sara** via inbjudan och `acceptInvitation`
   - fem avslutade körpass med 2–3 moment vardera, bedömda med `needs_help`, `with_support` och `independent`
   - sparad plan: Placering i rondell, Avsökning, Högerregeln
4. Efter att passen skapats genom tjänsterna sattes `started_at`, `ended_at` och `observed_at` tillbaka så passen ligger 20, 15, 10, 6 och 2 dagar tillbaka. Utan det skulle alla fem få samma tidsstämpel och historiken se ut som ett enda tillfälle.

Moment och skalor kommer från taxonomin. Inga egna moment.

Inloggningen i webbläsaren var en lokal sessionscookie mot utvecklingshemligheten. Produktionsinloggningen är orörd.

## Annonstext

**Rubrik:** Vad ska ni öva på nästa körpass?

**Text:** Planera nästa pass. Kom ihåg vad ni tränat på. Gratis under betan.

**Beskrivning:** Hämta för iPhone

**Länk:** https://korpasset.se/kom-igang

## Plattform

iPhone finns i App Store. Google Play är inte öppet för installation: den publicerade sidan `/kom-igang` har `data-play-live="0"` och säger att Play väntar på godkännande. Annonsen säger därför **Hämta för iPhone**, inte att Android går att installera.

`https://korpasset.se/kom-igang` svarar 200 och visar kampanjsidan. Det är inget lanseringshinder för länken. Sidan byggdes inte om i det här arbetet.

## Återskapa

```bash
# databas, sedan i ett annat skal:
cd app && npx tsx ../artifacts/marketing/next-drive-campaign/scripts/start-demo-db.mts
cd app && DATABASE_URL=postgresql://bilklar:bilklar@127.0.0.1:54329/bilklar_test npx tsx ../artifacts/marketing/next-drive-campaign/scripts/seed-demo.mts
cd app && DATABASE_URL=postgresql://bilklar:bilklar@127.0.0.1:54329/bilklar_test npx tsx src/index.ts

# annonsbilder från den sparade skärmbilden:
node artifacts/marketing/next-drive-campaign/scripts/compose-ads.mjs
```

`compose-ads.mjs` behöver `playwright-core` och Chrome. Skärmbildstagningen kördes med viewport enligt ovan.
