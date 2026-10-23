# ADR 001 — FindMyWalk foundation (23 October 2026)

## Decision

Build an independent Next.js/TypeScript application with a single PostgreSQL/PostGIS database. Keep walking geometry, route persistence, routing, places, transport and publication behind separate modules inside one deployable application. Use MapLibre GL JS with OpenFreeMap tiles and visible OSM/OpenMapTiles attribution. An isolated local Valhalla service initially builds a Nottinghamshire OSM extract. A regional or global production routing graph needs an explicit capacity and coverage plan.

Each saved route has ordered waypoint IDs, GeoJSON WGS84 geometry, distance in metres, duration in minutes, owner, visibility and revision. A published walk must not expose a private draft. Browser authorization and spatial data validation are server responsibilities.

## Source reuse

The user confirms ownership of Collingham.org application code. The inspected checkout was `/home/loz/work/localwalks-village-tags-mobile-20261008` at `969a12a8665bf7e9b7fe5cac97c17359ca13a189`. Relevant source includes `src/utils/gpxImporter.ts`, `src/utils/gpxGenerator.ts`, `src/types/Route.ts`, `src/components/WalkForm.tsx`, and `src/utils/penRouteMatcher.ts`. Reuse compatible GPX and route behavior where sensible, without coupling FindMyWalk to Collingham authentication, data or uptime. No Collingham production changes are part of this build.

## Provider boundaries

Open-data POIs and transport stops may be shown on the MapLibre map with their source attribution; stop presence is separate from timetable or live-service evidence. Google Places API (New) is an optional server-side provider and needs API billing, restricted credentials, field masks and live verification. Google Places results displayed on a map require a Google Map; they must not be copied into the MapLibre POI layer or permanent open-data records. Place IDs are a documented storage exception. Printed guides and exports use independently sourced data unless provider permissions explicitly allow inclusion. Google search-along-route is a bias and may omit circular-route results; it cannot be used to assert an exact corridor. The API must fail closed when credentials or compliant display mode are absent.

## Deployment and evidence

Development, builds and tests run on hpubuntu. The GitHub repository is `lozknowles/FindMyWalk`; the existing `main` contained only a holding page at `182f6fa8b0f13d86ab2aa5129633d5cb61e62699`. Work takes place in `/fast/work/findmywalk-platform` on branch `build/platform-20261023`, preserving untracked files in the original checkout. Database runs on a dedicated loopback port and volume. No DNS or public deployment changes are authorized by this ADR. Public operation requires dedicated routing, verified backups, monitoring, photo storage, abuse controls and provider terms review.

## Alternatives rejected

Separate services would add operational burden before the vertical workflows are proven. Using Collingham's live API or user database would create a runtime dependency and risk private resident data. A generic driving-route service is unsuitable for pedestrian routing.
