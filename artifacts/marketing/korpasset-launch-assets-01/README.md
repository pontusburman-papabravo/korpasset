# Körpasset launch assets 01

Paketerat marknadsmaterial från den **befintliga** Körpasset-identiteten. Ingen ny logotyp, ingen ny färgpalett och ingen produktkod är ändrad.

Riktning: **Länken / Vägbanor**  
Produktnamn: **Körpasset**  
Destination: [korpasset.se](https://korpasset.se) — CTA **Bli betatestare**

## Källa

Den begärda mappen `artifacts/input/korpasset-brand/` fanns inte i den här miljön. Canonical source är därför den låsta identiteten i `app/public/brand/`, kopierad oförändrad till `source/`.

Prioritet vid överlapp:

1. SVG (master)
2. Transparent PNG
3. Befintlig lägre preview-PNG

## Canonical assets

| Roll | Canonical fil | Inte |
| --- | --- | --- |
| Huvudlogga utan tagline | `logo/korpasset-logo.svg` | Använd inte PNG-preview om SVG går |
| Huvudlogga med brandline | `logo/korpasset-logo-tagline.svg` | Byt inte ut brandlinen |
| Symbol / icon-only | `icon/korpasset-symbol.svg` | Rita inte om länken |
| Appikon ljus | `icon/korpasset-icon-light.svg` + `…-1024.png` | |
| Appikon mörk | `icon/korpasset-icon-dark.svg` + `…-1024.png` | |
| Liggande originalplatta | `campaign/korpasset-campaign-landscape-original-1200x630.png` | Det fanns inget separat stående kampanjoriginal |

Full filtabell: [docs/inventory.md](docs/inventory.md)  
Copy: [docs/copy-deck.md](docs/copy-deck.md)

## Vilken export ska användas var

### TikTok / Reels / Stories (9:16)

Mapp: `exports/9x16-tiktok-reels-stories/`

| Fil | Användning |
| --- | --- |
| `korpasset-9x16-beta-launch-1080x1920.png` | Statisk annons, första bildruta, eller stillbild med on-video-text ovanpå |
| `korpasset-9x16-brand-lockup-1080x1920.png` | Slutruta / end card. Loggan stöttar, den tar inte över |

Profilbild på TikTok-kontot: `icon/korpasset-icon-light-1024.png` (mörk variant om flödet är mörkt).

Låt inte loggan sitta i TikToks nedre UI-zon. Beta-exporten är satt med extra luft nertill just därför.

### Square social post / ad (1:1)

Mapp: `exports/1x1-square/`

| Fil | Användning |
| --- | --- |
| `korpasset-1x1-beta-launch-1080x1080.png` | Feed-annons / organiskt inlägg med launch-copy |
| `korpasset-1x1-brand-lockup-1080x1080.png` | Tyst varumärkespost, delningsbild utan extra copy |
| `korpasset-1x1-icon-light-1080x1080.png` | Profil / appikon ljus, uppskalad till 1080 |
| `korpasset-1x1-icon-dark-1080x1080.png` | Profil / appikon mörk |

### Landscape / web hero / ad (16:9)

Mapp: `exports/16x9-landscape/`

| Fil | Användning |
| --- | --- |
| `korpasset-16x9-beta-launch-1920x1080.png` | Kampanjhero, YouTube/Meta landscape, presentation |
| `korpasset-16x9-brand-lockup-1920x1080.png` | Ren lockup i 16:9, återuppbyggd från SVG |
| `korpasset-16x9-og-plate-1920x1080.png` | Befintlig OG-platta paddad till 16:9, ingen ny text |

OG-originalet `1200×630` ligger kvar i `campaign/` för webbdelning där Open Graph-mått krävs.

## Färger (låsta)

- Deep Navy `#1A2B4C`
- Teal `#00C896`
- Off-white `#F8F9FA`

Använd teal till accent och URL, inte som brödtextfärg.

## Vad som inte ska göras

- Byt inte namn till något annat än **Körpasset**
- Byt inte brandline till en ny huvudtagline
- Lova inte app installs, procentuell körkortsberedskap eller myndighetskoppling
- Visa inte halvfärdiga produktflöden som huvudnummer i annonsen
- Skala inte sönder loggan (behåll proportioner; ingen drop shadow, ingen outline)

## Återskapa exporter

```bash
python3 artifacts/marketing/korpasset-launch-assets-01/docs/build_exports.py
```

Skriptet läser `app/public/brand/` och skriver om `logo/`, `icon/`, `campaign/`, `exports/` och `docs/inventory.md`. Det ändrar inte produkten.
