# Selfie Booth — DIY prototype

En fungerende, browser-baseret selfie-booth til udlejning. Kører som en almindelig
hjemmeside, virker uden internet, og gemmer billeder lokalt til de kan uploades.

## Filer

| Fil | Formål |
|---|---|
| `index.html` | Selve boothen — kamera, nedtælling, capture, filmstrip |
| `admin.html` | Galleri, sync-status og indstillinger (pinkode-beskyttet) |
| `db.js` | Delt logik: lokalt lager (IndexedDB), indstillinger, cloud-sync |
| `style.css` | Fælles design-tokens og styling |
| `manifest.json` + `sw.js` | Gør boothen til en PWA, der kan starte helt offline |

## Kom i gang lokalt

Kameraet kræver enten `https://` eller `localhost` — ikke almindelig `http://`.
Til test på din computer:

```bash
cd selfiebooth
python3 -m http.server 8000
```

Åbn `http://localhost:8000` i browseren og giv adgang til kameraet.

## Optagelsestilstande

Der er tre knapper øverst over lukkerknappen i boothen:

- **1 billede** — klassisk enkeltbillede, fuld skærm
- **Fotostrimmel** — tager 4 billeder i træk (med kort pause imellem til at stille
  sig om) og samler dem i én lodret strimmel med hvid kant og event-navn/dato
  nederst, ligesom en rigtig photo booth-strimmel
- **Kvadrat** — samme idé, men som et 2×2-gitter i stedet for en lang strimmel

Valget huskes til næste billede, og admin kan sætte en standard-tilstand under
Indstillinger, som boothen starter i.

## Sådan virker det

1. Gæsten vælger tilstand (eller bruger standarden) og trykker på lukkerknappen
   → nedtælling → flash → billedet (eller alle 4, ved strip/kvadrat) gemmes
   **øjeblikkeligt lokalt** på tabletten (IndexedDB) — uanset om der er internet.
2. Boothen tjekker automatisk hvert 15. sekund (og med det samme ved genoprettet
   forbindelse) om der er ikke-uploadede billeder, og forsøger at sende dem videre.
3. Admin-siden (langt tryk på event-navnet i boothen, eller `admin.html` direkte)
   viser alle billeder, sync-status, og lader jer downloade eller slette dem.

## Sæt et rigtigt upload-endpoint op

Lige nu gemmer boothen kun lokalt, indtil I sætter en `uploadEndpoint` i
Admin → Indstillinger. `db.js` forventer en simpel `POST`-endpoint der modtager
billedet som `multipart/form-data` under feltnavnet `file`.

Nemmeste vej: **Supabase Storage** (gratis niveau er rigeligt til dette).

1. Opret et gratis Supabase-projekt og en Storage-bucket, fx `booth-photos`.
2. Lav en lille serverless-funktion (Supabase Edge Function, eller en Vercel/
   Cloudflare Worker) der modtager filen og lægger den i bucket'en med
   Supabase's service-role-nøgle. **Læg aldrig nøglen direkte i boothens kode** —
   den skal blive på en server, ikke på tabletten.
3. Sæt funktionens URL som `uploadEndpoint` i Admin → Indstillinger.

Firebase Storage eller jeres egen backend fungerer efter samme princip — det
eneste `db.js` kræver er en `POST`-endpoint der svarer `2xx` ved succes.

## Sæt tabletten op i kiosk-tilstand

**iPad:** Indstillinger → Tilgængelighed → Guided Access → slå til. Åbn
`index.html` i Safari (helst tilføjet til hjemmeskærm først, så den kører uden
browser-UI), tryk tre gange på sidebeskyttelsesknappen for at aktivere Guided
Access, og lås skærmen til kun denne app.

**Android:** Brug en kiosk-browser-app (fx "Fully Kiosk Browser") og pek den på
jeres hostede URL, eller aktiver Android's indbyggede "Screen pinning" under
Indstillinger → Sikkerhed.

I begge tilfælde skal boothen hostes et sted med `https://` (fx GitHub Pages,
Netlify, Vercel eller Cloudflare Pages — alle har gratis niveauer, der er
rigelige til dette).

## Idéer til videre udvikling

- **Print på stedet** — koble en Bluetooth-fotoprinter til via Web Bluetooth,
  eller send til en app som understøtter print (fx via AirPrint fra iPad).
- **QR-deling** — generér en QR-kode efter capture, der linker direkte til det
  uploadede billede, så gæsten kan hente det med det samme.
- **Filtre/rammer** — tegn en branded ramme eller et event-logo ind på canvas'en
  i `capturePhoto()`, samme sted vandmærket allerede tilføjes i dag.
- **Flere billeder i én strimmel** — tag 3-4 billeder i træk og sæt dem sammen
  til én lodret fotostrimmel, ligesom klassiske photo booths.

## Kendte begrænsninger i denne prototype

- Skærmen holdes vågen via Screen Wake Lock API (understøttet i Safari fra
  iPadOS 16.4). På ældre iPadOS skal I stadig sætte Auto-Lock til "Aldrig" under
  Indstillinger → Skærm og lysstyrke, som ekstra sikkerhed.
- Cloud-upload er en integration, I selv skal koble til (se ovenfor) — der er
  ingen "rigtig" backend inkluderet, da det kræver jeres egne cloud-nøgler.
- Baggrunds-sync på iPad/Safari er ikke en ægte OS-niveau baggrundsproces (Safari
  understøtter ikke Background Sync API fuldt ud) — boothen løser det ved selv at
  tjekke forbindelsen løbende, mens den er åben og kørende, hvilket er tilstrækkeligt
  til normal brug ved et event.
- Der er ingen billed-komprimering ud over JPEG-kvalitet 0.92 — juster i
  `capturePhoto()` i `index.html`, hvis I vil balancere filstørrelse vs. kvalitet.
