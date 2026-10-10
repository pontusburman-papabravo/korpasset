# Papa Bravo-publicering

`papabravo.se` serveras av samma Caddy som Körpasset. Webbrot i den körande containern är `/data/sites/papabravo` i Docker-volymen `deploy_caddy_data`. Caddyfile i det här repot äger routingen. Byt inte till `tls internal` och lägg inte till `upgrade-insecure-requests`.

Den här sidan beskriver en senare, separat releaseprocess. Den är inte införd och ska inte användas som publiceringsmetod förrän bind-mounten nedan finns.

## Vad som är verifierat

På volymen kan en releasekatalog och en symlänk bytas utan att starta om Caddy. Ett engångstest med en Caddy som inte lyssnade på 80/443 visade:

- `file_server` följer en symlänk som pekar på en releasekatalog
- `ln -sfn` till en annan katalog bytte innehåll på nästa request
- testkatalogen togs bort efteråt och rörde inte den live webbroten

Filerna i den live webbroten ägs av den som kopierade in dem. Caddy läser dem som root. Volymens katalog `/data` är `root:root` och nås inte som en vanlig katalog av en användare utanför Docker.

## Föreslagen layout

På värden, ägd av en särskild användare `papabravo` utan medlemskap i gruppen `docker` och utan sudo:

```text
/var/www/papabravo-releases/<commit>/
/var/www/papabravo -> /var/www/papabravo-releases/<commit>
```

En senare Compose-ändring binder `/var/www/papabravo` till `/data/sites/papabravo` i Caddy. Caddyfile kan då behålla samma webbrot. Växlingen är `ln -sfn` på värden. Föregående katalog ligger kvar tills nästa lyckade publicering, och rollback är en ny `ln -sfn` till den föregående committen.

Den bind-mounten kräver en medveten Caddy-omstart en gång. Därefter behöver en Papa Bravo-publicering varken Caddy-omstart, Docker eller sudo.

## Publicering från Papa Bravo-repot

Repot är `pontusburman-papabravo/PB`. Bygg exakt den angivna committen:

```bash
git fetch origin <commit>
git checkout --detach <commit>
npm ci
npm test
```

`npm test` bygger `dist/` och kör `scripts/verify.mjs`. Kopiera `dist/` till `/var/www/papabravo-releases/<commit>/`, kontrollera checksummor mot bygget, och växla symlänken först därefter. Ta inte bort den föregående releasen i samma steg.

Tills bind-mounten finns är den fungerande metoden en katalogväxling inuti volymen, utförd av `deploy` via Docker. Den kräver Docker och är därför inte den självständiga processen ovan. Körpassets `scripts/vps-deploy-revision.sh` publicerar inte Papa Bravo.

En Körpasset-deploy vägrar SHA:n före checkout om `deploy/Caddyfile` saknar `papabravo.se` och `/data/sites/papabravo`. Arbetsflödet på `main` gör samma kontroll på den utcheckade SHA:n innan SSH, och en äldre SHA når därför inte servern. Misslyckas en appdeploy checkas den tidigare appversionen ut och bara tjänsten `app` byggs om. Postgres rörs inte i den rollbacken. Saknar den tidigare Caddyfilen Papa Bravo behålls i stället filen som gällde före checkout, och Caddy laddas om bara om den filen fortfarande serverar sajten. En deploy som inte byggt om appen återställer bara git, och återskapar inte Caddy om containern aldrig byttes.
