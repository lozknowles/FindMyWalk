# Architect gate record — 23 October 2026

The primary owns decisions and implementation. Gates were invoked under the user-supplied AGENTS.md instructions.

## Plan gate: platform foundation

**Trigger:** substantial route editor, storage, provider and publishing architecture.

**Finding:** use modular Next.js/TypeScript and PostGIS with ordered waypoints, revisions and immutable published snapshots. Keep Google Places display and storage separate from open-data MapLibre presentation; state pedestrian routing coverage.

**Decision:** adopted ADR 001 and local Valhalla and OSM index for the runnable vertical slice.

## Plan gate: AR Explorer

**Trigger:** AR became a cross-component core requirement.

**Finding:** build approximate browser AR on the same geographic discovery and pedestrian routing APIs, separating mapped evidence, compass alignment and visual identity. Preserve camera privacy and map/list fallback; desktop fixtures do not establish physical accuracy.

**Decision:** added reusable sensor and projection modules and an AR page that sends destinations to the editor. The current overlay is horizontal-compass based; pitch, terrain and recognition are unresolved.

## No-progress gate: transport and discovery

**Trigger:** repeated SSH configuration failures and public Overpass timeouts.

**Finding:** use the proven explicit `ssh -F none -p 2222` invocation and a bounded local OSM extract.

**Decision:** the SSH probe succeeded, and the transactional local import populated PostGIS. The protected original checkout remained untouched.

## No-progress gate: browser/runtime

**Trigger:** repeated browser startup and MapLibre worker issues.

**Finding:** isolate the worker and verify against a known server origin in a real browser.

**Decision:** vendored the worker with its license, configured `PUBLIC_ORIGIN`, and reran the browser walkthrough.

## No-progress gate: Playwright provisioning

**Trigger:** two smoke scripts failed before page execution when the installed browser did not match project Playwright 1.64.1.

**Finding:** install the pinned Chromium revision, then rerun smoke; HTTP and unit checks do not qualify browser interaction.

**Decision:** installed Chromium revision 1248 using the project CLI. Both browser smoke scripts passed with the portable launcher.

## Completion gate: reviewed partial build

**Trigger:** integrated route editor, discovery, sharing and AR browser slice had passed tests and build.

**Finding:** the master mission remains incomplete. Material defects and gaps: Docker image copied local secrets before a .dockerignore; short walks could round to zero duration and fail save; AR has no pitch/roll/calibration; initial AR handoff could not add to an existing walk; GPX browser evidence was narrower than stated; Google adapter lacked fixtures. Other untested flows include physical AR alignment, return-to-route, full place filters/corridor, accounts and production operations.

**Decision:** added .dockerignore and standalone non-root runtime, built and inspected the image for excluded state; fixed minimum route duration with a short-route API test; added existing-walk destination integration and browser coverage; expanded GPX/unauthorised browser coverage; added Google adapter fixture tests. Documentation now describes the horizontal overlay and remaining acceptance gaps. The review qualifies a partial build handoff, not completion of the full mission or public release.
