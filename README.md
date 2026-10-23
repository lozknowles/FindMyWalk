# FindMyWalk

Find your path. Create your adventure.

FindMyWalk is an independent walking-route builder and discovery application. The site is live as a Nottinghamshire beta. Development and deployment are performed on hpubuntu; the public build has separate production services and storage.

## Local development on hpubuntu

1. Install Node 24 and Docker with Compose.
2. Copy `.env.example` to `.env.local`, replace the database password and session secret, and set `POSTGRES_PASSWORD` in the shell or a private Compose `.env` file.
3. Run `docker compose --profile routing up -d db routing` and wait for routing graph build. The example extract covers Nottinghamshire only; outside coverage, pedestrian routing returns unavailable.
4. Run the SQL migrations in `db/` (see the migration files), then `npm ci` and `npm run dev`.
5. Open the localhost development port. Do not point live DNS at it. For browser tests, install the project-pinned Chromium with `npx --no-install playwright install chromium`, then run `BASE_URL=http://127.0.0.1:3108 npm run test:browser` and `BASE_URL=http://127.0.0.1:3108 npm run test:ar-browser` against a seeded local server.

Import local OSM places after migrations: create a Python venv with `osmium` and `psycopg[binary]`, obtain the matching Geofabrik Nottinghamshire `.osm.pbf` and `.poly`, then run `python scripts/import-osm-pois.py --pbf data/nottinghamshire-latest.osm.pbf --poly data/nottinghamshire.poly` with `DATABASE_URL` set. The importer records extract SHA, timestamp and coverage, and swaps the index transactionally.

The local Valhalla example builds a Nottinghamshire OSM extract in a dedicated Docker volume. Widen coverage with an appropriate extract and capacity plan before public launch. The MapLibre style uses OpenFreeMap; keep attribution visible. Open-data facilities and transit stops are not proof of current opening hours, accessibility, timetable or service operation.

## Provider configuration

`VALHALLA_URL` points to a Valhalla API. `GOOGLE_PLACES_API_KEY` is optional and must stay server-side; its absence means no live Google integration. Do not display Google Places results on the MapLibre map. Before enabling Google, configure billing, API restrictions, quotas, field masks, a compliant Google Maps presentation and attribution, and verify genuine responses. The public application can operate using open geographic data without Google. `ARCGIS_STATIC_MAPS_KEY` is optional, server-only, and enables the attributed Satellite PDF; see [satellite adapter](docs/satellite-imagery.md). Without a valid key, the Satellite PDF action is unavailable while GPX and standard PDF still work.

## Automatic walks and mapped facilities

The Create page generates one to five circular pedestrian walks of different target lengths from a chosen start. Each result uses a routed geometry and offers GPX and PDF downloads. An optional walk-guide format adds a planning panel; when a walk is saved and shared by link, its guide can include a QR code for the saved webpage. With a server-side ArcGIS Static Maps key, Satellite PDF adds an attributed imagery map on physical page 3, the route and numbered mapped places, followed by a contact-details table. Selecting a result opens it in the existing map editor for changes and saving. The map and route panel show OpenStreetMap pubs, cafés and landmarks within a 100 m corridor of the current route, with OSM coverage and source date. A separate programmatic search of OSM and Overture Maps food-and-drink points shortlists within 1.2 km, deduplicates, and checks a pedestrian out-and-back detour. Suggested extra distance and time are separate from the walk length; the mapped point may not be the entrance. The importer retains explicit OSM phone, website and email fields where mapped; it does not infer contact details. Proximity does not establish access, opening, or a safe detour.

## Deployment

`compose.yaml` supplies an isolated PostGIS database bound to loopback; `Dockerfile` builds the application. Provide a TLS reverse proxy, dedicated routing instance, backups and a secret manager before public deployment. Back up the PostgreSQL volume with `pg_dump -Fc`; periodically restore to a separate database and run schema and route reads. Monitor `/api/health` and the routing/provider dependencies separately. Production deployment uses a separate stack and HTTPS gateway; see the deployment runbook for operational controls.

See [architecture decision](docs/adr-001-foundation.md) for code reuse and licensing boundaries, [deployment runbook](docs/deployment-runbook.md) for setup and restore, and [build status](docs/status-2026-10-23.md) for verified workflows and unmet requirements. AR Explorer is at `/ar` and uses the same discovery and pedestrian routing services; its browser labels are approximate and require device qualification.

## Visual asset

`public/landscape-hero.jpg` is [Track in the Peak District - 10 June 2025](https://commons.wikimedia.org/wiki/File:Track_in_the_Peak_District_-_10_June_2025.jpg) by Aethonatic, CC0. The earlier illustrated asset remains in the source repository for reference.

### Additional places index

The two Collingham cafés are **not named in application code**. `db/007_overture_places.sql` defines an independently attributed regional place index. `scripts/import-overture-places.py` atomically imports food and pub features with Overture IDs, categories, location, confidence, status, source release and observation time. It rejects confidence below 0.80 and permanently closed records. It reads the official CLI's GeoJSON and `.state` file, and requires `DATABASE_URL` and `psycopg`. Example (run on hpubuntu after the migration):

```sh
overturemaps download --type=place --bbox=-1.45,52.75,-0.55,53.57 -f geojson -o nottinghamshire-places.geojson
python scripts/import-overture-places.py --geojson nottinghamshire-places.geojson --state nottinghamshire-places.geojson.state
```

Refresh from a new release after checking data quality. Imports replace the secondary index in one database transaction; a failed import retains the previous release. The app exposes the release and an unavailable/partial status. Overture positions and operating status are provider evidence, not proof of an entrance, current opening or legal access. Detours use the pedestrian routing service and never change the main GPX line. [Overture data and licensing](https://docs.overturemaps.org/attribution/); full applicable licence texts, Foursquare NOTICE and transformation note are served at `/data-licenses`. The importer retains row-level source provenance. The API may return partial or unavailable for routing failure, out-of-coverage routes or candidate truncation. Suggestions are limited to a routed return detour of 2 km extra walking.
