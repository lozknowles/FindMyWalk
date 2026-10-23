# FindMyWalk

Find your path. Create your adventure.

FindMyWalk is an independent walking-route builder and discovery application. The original repository was a holding page; application development is on `build/platform-20261023`.

## Local development on hpubuntu

1. Install Node 24 and Docker with Compose.
2. Copy `.env.example` to `.env.local`, replace the database password and session secret, and set `POSTGRES_PASSWORD` in the shell or a private Compose `.env` file.
3. Run `docker compose up -d db`.
4. Run the SQL migrations in `db/` (see the migration files), then `npm ci` and `npm run dev`.
5. Open the localhost development port. Do not point live DNS at it.

The example Valhalla URL is a rate-limited public demo for development. Public deployment needs an owned or contracted pedestrian routing service. The MapLibre style uses OpenFreeMap; keep attribution visible. Open-data facilities and transit stops are not proof of current opening hours, accessibility, timetable or service operation.

## Provider configuration

`VALHALLA_URL` points to a Valhalla API. `GOOGLE_PLACES_API_KEY` is optional and must stay server-side; its absence means no live Google integration. Do not display Google Places results on the MapLibre map. Before enabling Google, configure billing, API restrictions, quotas, field masks, a compliant Google Maps presentation and attribution, and verify genuine responses. The public application can operate using open geographic data without Google.

## Deployment preparation

`compose.yaml` supplies an isolated PostGIS database bound to loopback; `Dockerfile` builds the application. Provide a TLS reverse proxy, dedicated routing instance, backups and a secret manager before public deployment. Back up the PostgreSQL volume with `pg_dump -Fc`; periodically restore to a separate database and run schema and route reads. Monitor `/api/health` and the routing/provider dependencies separately. No live DNS or service configuration is included here.

See [architecture decision](docs/adr-001-foundation.md) for code reuse and licensing boundaries.
