# Deployment and recovery runbook

This document records the original isolated-host preparation workflow. The FindMyWalk Nottinghamshire beta is now live; use [the live beta runbook](live-beta-runbook.md) for current operations, backups and rollback. The development instance remains separate from production.

## Reproduce on an isolated host

1. Use Node 24, Docker Compose, Python 3 and disk sized for the chosen OSM extract and Valhalla tiles.
2. Copy `.env.example` to a private `.env.local`; set independent random `POSTGRES_PASSWORD` and `SESSION_SECRET`, a matching `DATABASE_URL`, and the exact HTTPS `PUBLIC_ORIGIN`. Keep Google keys server-side. Do not commit secrets.
3. Set `POSTGRES_PASSWORD` in the Compose environment, then run `docker compose --profile routing up -d db routing`. Check database health and wait until `http://127.0.0.1:18082/status` responds. The example routing graph covers Nottinghamshire.
4. Run `npm ci`, then `npm run db:migrate`. Migration files are ordered, idempotent SQL; apply with a backup before upgrades.
5. Obtain a Geofabrik PBF and its matching `.poly` boundary for the region, recording the URL, timestamp and SHA. In a private venv, install `osmium` and `psycopg[binary]`. Set `DATABASE_URL` in that process and run `python scripts/import-osm-pois.py --pbf data/nottinghamshire-latest.osm.pbf --poly data/nottinghamshire.poly`. The import is one transaction; a failed import keeps the previous index. It refuses zero features.
6. Run `npm test`, `npm run typecheck`, `npm run build`. Start the app on a loopback port behind a TLS reverse proxy. Install the pinned Playwright browser with `npx --no-install playwright install chromium`, and run the browser smoke commands from README against the started, seeded service. Check `/api/health`, actual pedestrian routing, POI coverage, draft save, publication, GPX and mobile browser behavior through the external origin.
7. Establish a dedicated tile style/geocoder and rate limits before broad traffic. Keep OpenStreetMap/OpenMapTiles/photo attribution. Google Places needs restricted credentials, quota/billing, provider-specific storage rules and a compliant Google Maps display. Do not turn on the key in the MapLibre POI view.

## Backups and restore drill

Use `pg_dump -Fc` to a protected, encrypted backup destination on a defined schedule. Include role/secret recovery in the private operations plan. For a drill, create a separate empty PostGIS database, restore the dump with `pg_restore`, apply the same app revision and verify representative routes, publication snapshots, OSM coverage metadata and spatial queries. A completed backup command alone does not establish recoverability. Record the restore result and time before production release.

## Monitoring and rollback

Monitor the app `/api/health`, PostgreSQL, Valhalla graph and route success, geocoder/provider errors, storage capacity, import age and TLS certificate. Distinguish an outside-coverage request from an outage. Limit logs to route IDs/status; avoid camera frames, exact GPS traces and tokens. Deploy by immutable revision. Keep the previous app image and compatible DB snapshot; schema changes need tested backward compatibility or a restore plan. Roll back app traffic first, then restore data only with an explicit reconciliation plan for writes since the backup.

## Release scope

The 23 October 2026 release is a Nottinghamshire beta with anonymous browser-bound editing. See [the status report](status-2026-10-23.md) for public HTTPS acceptance evidence and outstanding master-mission work. Physical-device AR, account flows, broad coverage and external alerting remain open.
