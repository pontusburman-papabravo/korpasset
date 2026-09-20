# Inventering — Körpasset launch assets 01

Källmappen `artifacts/input/korpasset-brand/` fanns inte i den här miljön.
Canonical source är därför den låsta identiteten i `app/public/brand/` (riktning **Länken / Vägbanor**).

Prioritet vid överlapp: **SVG master → transparent PNG → lågupplöst preview**.

| Fil | Format | Dimension | Transparent | Canonical | Rekommenderad användning | SHA256-16 |
| --- | --- | --- | --- | --- | --- | --- |
| `logo/korpasset-logo.svg` | SVG | vector | ja (ingen bakgrund i logotyp-SVG) | canonical master | Huvudlogga utan tagline. Webbheader, video-end card, ljus bakgrund. | `e4b4c652f0beb741` |
| `logo/korpasset-logo.png` | PNG | 1415×260 | ja | raster från SVG | Högupplöst raster av huvudloggan. Använd när SVG inte stöds. | `266f388c42034de8` |
| `logo/korpasset-logo-1200.png` | PNG | 1200×333 | ja | befintlig PNG | Befintlig PNG-preview av huvudloggan. Lägre prioritet än SVG-rastern. | `b39df328834745e7` |
| `logo/korpasset-logo-tagline.svg` | SVG | vector | ja (ingen bakgrund i logotyp-SVG) | canonical master | Huvudlogga med brandline ÖVNING IDAG. FRIHET IMORGON. | `76110ab7f901dc63` |
| `logo/korpasset-logo-tagline.png` | PNG | 1774×313 | ja | raster från SVG | Högupplöst raster av logga + brandline. | `c6408a805d3227d5` |
| `logo/korpasset-logo-tagline-1600.png` | PNG | 1600×488 | ja | befintlig PNG | Befintlig PNG av logga + brandline. Andrahandsval. | `8c064c62ce4327f8` |
| `icon/korpasset-symbol.svg` | SVG | vector | ja (ingen bakgrund i logotyp-SVG) | canonical master | Icon-only / symbol utan text. Favicon-släkt, appikon-master. | `4cfa6f36d98b5792` |
| `icon/korpasset-symbol.png` | PNG | 653×404 | ja | raster från SVG | Transparent raster av symbolen. | `b0db728a27c40dc4` |
| `icon/favicon.svg` | SVG | vector | ja (ingen bakgrund i logotyp-SVG) | canonical favicon | Favicon. Samma symbol, avsedd för webbläsarikon. | `9fd8c6a30d1075c8` |
| `icon/korpasset-icon-light.svg` | SVG | vector | ja (ingen bakgrund i logotyp-SVG) | canonical light icon | Appikon / social profil, ljus bakgrund. | `f47a2f82611dda2d` |
| `icon/korpasset-icon-light-1024.png` | PNG | 1024×1024 | ja | canonical light PNG | Appikon ljus 1024×1024. Instagram/TikTok/Facebook profil. | `1947826fb28b7969` |
| `icon/korpasset-icon-dark.svg` | SVG | vector | ja (ingen bakgrund i logotyp-SVG) | canonical dark icon | Appikon / social profil, mörk bakgrund. | `ae9e8cdc727be4d2` |
| `icon/korpasset-icon-dark-1024.png` | PNG | 1024×1024 | ja | canonical dark PNG | Appikon mörk 1024×1024. | `3533b743adf8abff` |
| `campaign/korpasset-campaign-landscape-original-1200x630.png` | PNG | 1200×630 | nej | canonical landscape plate | Närmaste befintliga liggande kampanj-/OG-platta. Ingen separat vertikal originalfil fanns i källan. | `36877ed998e0ab27` |
| `exports/9x16-tiktok-reels-stories/korpasset-9x16-brand-lockup-1080x1920.png` | PNG | 1080×1920 | nej | derived export | Annonsredo export. Se README för kanal. | `12e54ceb29c03070` |
| `exports/9x16-tiktok-reels-stories/korpasset-9x16-beta-launch-1080x1920.png` | PNG | 1080×1920 | nej | derived export | Annonsredo export. Se README för kanal. | `22dcfdae42e0ba23` |
| `exports/1x1-square/korpasset-1x1-brand-lockup-1080x1080.png` | PNG | 1080×1080 | nej | derived export | Annonsredo export. Se README för kanal. | `f0280ba560c2484c` |
| `exports/1x1-square/korpasset-1x1-beta-launch-1080x1080.png` | PNG | 1080×1080 | nej | derived export | Annonsredo export. Se README för kanal. | `98328dcacd9c64b6` |
| `exports/1x1-square/korpasset-1x1-icon-light-1080x1080.png` | PNG | 1080×1080 | nej | derived export | Annonsredo export. Se README för kanal. | `e6484125a5ea010f` |
| `exports/1x1-square/korpasset-1x1-icon-dark-1080x1080.png` | PNG | 1080×1080 | nej | derived export | Annonsredo export. Se README för kanal. | `f3aab8f3e9a39155` |
| `exports/16x9-landscape/korpasset-16x9-brand-lockup-1920x1080.png` | PNG | 1920×1080 | nej | derived export | Annonsredo export. Se README för kanal. | `501e981e7ddb4f77` |
| `exports/16x9-landscape/korpasset-16x9-beta-launch-1920x1080.png` | PNG | 1920×1080 | nej | derived export | Annonsredo export. Se README för kanal. | `dc06155feb738d84` |
| `exports/16x9-landscape/korpasset-16x9-og-plate-1920x1080.png` | PNG | 1920×1080 | nej | derived export | Annonsredo export. Se README för kanal. | `08d9972d55e2e981` |

## Saknade original

Följande fanns **inte** som egna källfiler (varken i `artifacts/input/korpasset-brand/` eller i `app/public/brand/`):

- separat stående kampanjoriginal (9:16)
- separat kvadratisk kampanjoriginal med launch-copy (1:1 med text)
- ny logotyp eller avvikande färgpalett

9:16- och 1:1-kampanjexporten är därför **formatanpassningar** av den befintliga loggan, brandlinen och den copy som angavs för paketeringen. Ingen ny symbol ritades.
