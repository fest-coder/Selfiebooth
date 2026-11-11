# Minglo Selfie

Selfie booth til udlejning — bygget til iPad/tablet, kører i browseren, virker uden internet.

**Gæstens flow:** tryk for at starte → vælg format og look → nedtælling → se billedet → scan QR-koden og tag det med hjem.

## Det kan den

- **Tre formater:** Foto, Strimmel (3 billeder) og Collage (4 billeder) — med festens navn og dato trykt på.
- **Fire looks:** Naturlig, Glød, Noir og Retro. Det man ser i søgeren, er præcis det, der bliver gemt.
- **QR-deling:** gæsten scanner og får sit billede på mobilen med det samme (kræver sky-opsætning, se nedenfor).
- **Online-galleri:** ét link til kunden med alle festens billeder — opdaterer sig selv under festen.
- **Offline først:** alle billeder gemmes på tabletten med det samme og uploades automatisk, når der er net.
- **Admin bag kode:** eventnavn, logo, kamera, nedtælling, download af alle billeder som .zip.
- Skærmen bruges som blitz, skærmen holdes vågen, og boothen går selv tilbage til start, når ingen rører den.

## Kom i gang

Kameraet kræver `https://` eller `localhost`.

```bash
python3 -m http.server 8000
# åbn http://localhost:8000
```

Til rigtig brug hostes mappen som den er (ingen build) — fx GitHub Pages, Netlify eller Cloudflare Pages.

### Før hvert event

1. Åbn boothen og hold fingeren på **minglo-logoet øverst i ca. 1 sekund**. Standardkoden er `1234` (skift den under *Sikkerhed og app*).
2. Skriv festens navn og dato, og tryk **Start nyt event** — så får kunden sit eget, tomme galleri.
3. Send galleri-linket (eller QR-koden) til kunden.

### Efter eventet

Admin → **Download alle (.zip)** → **Slet alle**. Tjek at "Venter på upload" står på 0, før I sletter.

### iPad som kiosk

- Safari → Del → **Føj til hjemmeskærm**, og åbn appen derfra (så kører den i fuld skærm).
- Indstillinger → Tilgængelighed → **Guidet adgang**, så gæsterne ikke kan forlade appen.
- Brug ringlys, hold 1–1,5 m afstand, og tør linsen af — det betyder mere for billederne end noget andet.

## QR-deling og online-galleri (Supabase)

Uden dette trin virker boothen stadig, men billederne ligger kun på tabletten.

1. Opret et gratis projekt på [supabase.com](https://supabase.com).
2. Kør dette i **SQL Editor**:

   ```sql
   insert into storage.buckets (id, name, public)
   values ('selfies', 'selfies', true)
   on conflict (id) do nothing;

   create policy "booth kan uploade" on storage.objects
     for insert to anon with check (bucket_id = 'selfies');

   create policy "galleri kan vise" on storage.objects
     for select to anon using (bucket_id = 'selfies');
   ```

3. Udfyld `js/config.js` med projektets URL og den **offentlige** nøgle (anon / publishable) — aldrig `service_role`.
4. Læg ændringen op, og tryk **Opdater app** i admin på tabletten.

Billederne ligger i `selfies/<event-id>/`. Slet mappen i Supabase, når kunden har fået sine billeder.

> **Privatliv:** Links til billeder og gallerier er uoplistede, ikke hemmelige — alle med linket kan se dem, og
> den offentlige nøgle kan liste indholdet af bucket'en. Det svarer til, hvordan delte fest-gallerier normalt
> fungerer, men aftal med kunden, hvor længe billederne skal ligge, og slet dem bagefter (GDPR).

## Tilpas designet

Alt det visuelle styres fra toppen af `css/minglo.css` (farver, gradient, fonte, hjørner). Logoet uploades i admin
og erstatter teksten "minglo" både i boothen og på billederne. Layoutet af de færdige billeder ligger i `js/compose.js`.

## Filer

| Fil | Indhold |
|---|---|
| `index.html`, `css/booth.css`, `js/booth.js` | Selve boothen |
| `js/admin.js` | Admin-panelet |
| `js/compose.js` | Filtre og billedlayouts |
| `js/store.js`, `js/cloud.js` | Lokalt lager og upload-kø |
| `foto.html`, `galleri.html`, `js/guest.js` | Siderne gæsterne ser på mobilen |
| `js/config.js` | Sky-opsætning |
| `sw.js`, `manifest.webmanifest` | Offline og "føj til hjemmeskærm" |

Fonte (Instrument Serif, Outfit — SIL OFL) og QR-biblioteket (qrcode-generator — MIT) ligger lokalt, så intet hentes udefra.
