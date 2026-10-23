# FindMyWalk

Find your path. Create your adventure.

FindMyWalk is an independent walking-route builder and discovery application. The original repository was a holding page; application development is on `build/platform-20261023`.

## Local development on hpubuntu

1. Install Node 24 and Docker with Compose.
2. Copy `.env.example` to `.env.local`, replace the database password and session secret, and set `POSTGRES_PASSWORD` in the shell or a private Compose `.env` file.
3. Run `docker compose --profile routing up -d db routing` and wait for routing graph build. The example extract covers Nottinghamshire only; outside coverage, pedestrian routing returns unavailable.
4. Run the SQL migrations in `db/` (see the migration files), then `npm ci` and `npm run dev`.
5. Open the localhost development port. Do not point live DNS at it. For browser tests, install the project-pinned Chromium with `npx --no-install playwright install chromium`, then run `BASE_URL=http://127.0.0.1:3108 npm run test:browser` and `BASE_URL=http://127.0.0.1:3108 npm run test:ar-browser` against a seeded local server.

Import local OSM places after migrations: create a Python venv with `osmium` and `psycopg[binary]`, obtain the matching Geofabrik Nottinghamshire `.osm.pbf` and `.poly`, then run `python scripts/import-osm-pois.py --pbf data/nottinghamshire-latest.osm.pbf --poly data/nottinghamshire.poly` with `DATABASE_URL` set. The importer records extract SHA, timestamp and coverage, and swaps the index transactionally.

The local Valhalla example builds a Nottinghamshire OSM extract in a dedicated Docker volume. Widen coverage with an appropriate extract and capacity plan before public launch. The MapLibre style uses OpenFreeMap; keep attribution visible. Open-data facilities and transit stops are not proof of current opening hours, accessibility, timetable or service operation.

## Provider configuration

`VALHALLA_URL` points to a Valhalla API. `GOOGLE_PLACES_API_KEY` is optional and must stay server-side; its absence means no live Google integration. Do not display Google Places results on the MapLibre map. Before enabling Google, configure billing, API restrictions, quotas, field masks, a compliant Google Maps presentation and attribution, and verify genuine responses. The public application can operate using open geographic data without Google.

## Deployment preparation

`compose.yaml` supplies an isolated PostGIS database bound to loopback; `Dockerfile` builds the application. Provide a TLS reverse proxy, dedicated routing instance, backups and a secret manager before public deployment. Back up the PostgreSQL volume with `pg_dump -Fc`; periodically restore to a separate database and run schema and route reads. Monitor `/api/health` and the routing/provider dependencies separately. No live DNS or service configuration is included here.

See [architecture decision](docs/adr-001-foundation.md) for code reuse and licensing boundaries, [deployment runbook](docs/deployment-runbook.md) for setup and restore, and [build status](docs/status-2026-10-23.md) for verified workflows and unmet requirements. AR Explorer is at `/ar` and uses the same discovery and pedestrian routing services; its browser labels are approximate and require device qualification.

## Visual asset

`public/landscape-hero.jpg` is [Track in the Peak District - 10 June 2025](https://commons.wikimedia.org/wiki/File:Track_in_the_Peak_District_-_10_June_2025.jpg) by Aethonatic, CC0. The earlier illustrated asset remains in the source repository for reference.
