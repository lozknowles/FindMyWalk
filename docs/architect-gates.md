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

## Plan gate: controlled live Nottinghamshire beta

**Trigger:** the user explicitly authorised continuing and pushing FindMyWalk live. The live domain was an Apache holding page on CottageServer; the tested application and regional services were development-only on hpubuntu.

**Finding:** the partial master build can be released only as a clearly labelled Nottinghamshire beta. Public traffic requires a dedicated production stack and secrets, bounded routing and writes, unlisted sharing with abuse reporting, local or permitted provider search, honest AR limitations, backup/restore proof and HTTPS acceptance. The development worktree and database must not become production.

**Decision:** adopted a separate production Compose stack on hpubuntu behind the existing CottageServer TLS gateway, with independent PostGIS and Valhalla volumes. The site defaults to private drafts and unlisted links; public publication is disabled by default. OpenFreeMap is used under its published public instance terms; place search uses the local OSM index. The static page is retained as the traffic rollback target. Cutover remains conditional on release-candidate tests, restore drill, completion review and external-origin checks.

## No-progress gate: Docker Compose execution context

**Trigger:** twice running unprivileged `docker compose -f ... config` yielded `unknown shorthand flag: 'f'`.

**Finding:** `loz` does not have the Compose plugin in its Docker CLI context. The same explicit file and environment validate under `sudo -n docker compose`. This was a CLI/plugin context issue, not evidence of invalid YAML; the precise plugin discovery difference was not needed for deployment.

**Decision:** use the verified privileged Compose invocation consistently, check resolved project/services/images/ports/volumes without printing secrets, and leave plugin installation alone. The production stack was already started under the privileged context; health and API checks provide readiness evidence beyond configuration parsing.

## Completion gate: bounded live beta candidate

**Trigger:** the candidate spans routing, database writes, anonymous sharing, AR, production infrastructure and public ingress.

**Finding:** architect reviewed the final control changes and found no additional defect in the Stop sharing/Delete flow, ownership check, all-saved-walk display or expanded revocation smoke. The review required passing execution, a deployed immutable image, effective resource limits, noindex headers and browser acceptance on the public HTTPS origin before a final verdict.

**Decision:** defer cutover until those checks are recorded. The full master mission remains incomplete; this gate applies to the Nottinghamshire beta release only.
