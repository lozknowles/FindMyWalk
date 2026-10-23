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

**Conditional verdict and acceptance:** architect approved controlled cutover at revision `6ddd981` after CI, source tests, deployed image, health, resource limits and noindex checks. It explicitly required public HTTPS acceptance and rollback on essential failure. The primary switched only the backed-up FindMyWalk TLS vhost, then verified apex/www, CSP, 12 successful map tile responses, no browser page errors, owner/visitor sharing and revocation, GPX, mobile, AR camera-denied fallback and simulated GPS route, genuine public pedestrian routing, Paris outside-coverage rejection and report submission. No rollback trigger occurred. This is a live Nottinghamshire beta verdict, not full mission or physical AR completion.

## Plan gate: automatic walks and mapped facilities

**Trigger:** the user required Collingham-style generation of one to five different length walks with GPX/PDF, then facility icons from map data along each walk.

**Finding:** the architect recommended reusing local Valhalla, bounding and admitting generation requests, validating actual routed lengths and distinct closed loops, retaining one canonical geometry for map/export/save, and returning fewer routes honestly. For places, enrich accepted route corridors from the indexed local OSM store, distinguish proximity from access, and show source age/coverage and unavailable status.

**Decision:** implemented bounded deterministic loop generation, route-corridor discovery for pub/cafe/landmark categories, map/sidebar indicators, canonical GPX/PDF exports with route directions, and warning states. The generated route can be selected into the existing editor and saved. No opening or access guarantee is made from OSM proximity.

## Completion gate: automatic walks and mapped facilities

**Trigger:** route generation, export and facility display cross routing, database, map, editor and public runtime boundaries.

**Evidence pending review:** 59 source tests, production Next build, and mobile browser walkthrough generating five different Collingham walks, showing mapped pub/cafe counts, selecting and saving a route, GPX with 114 route points, and a valid two-page A4 PDF with directions. Awaiting architect completion verdict and public HTTPS acceptance before declaring this feature live.

## Plan gate: satellite walk-guide PDF

**Trigger:** user added a third PDF page with satellite imagery, numbered mapped places and contact table, plus an optional editorial-style guide and QR link.

**Finding:** the architect required a print-permitted static image source with visible attribution; reuse the PDF renderer, align route and numbered place markers against one image, show only explicit mapped contact fields, paginate tables, and reserve physical page 3 even when directions span more pages. A missing imagery credential must produce an explicit unavailable state, not a synthetic satellite image. A QR should identify an actual accessible saved walk.

**Decision:** selected the ArcGIS Location Platform Static Maps imagery service as an optional server-side adapter because its official documentation explicitly lists reports and other static outputs. A dedicated key with Static Maps privilege is required. Collingham's general map uses OSM tiles and its limited cached Google Earth overlay does not provide a reusable nationwide PDF credential. PDF fixtures may use non-satellite test imagery but production export cannot claim satellite output without a licensed key. Contact fields are being added through the existing OSM import, and only a published unlisted walk may receive a walk-specific QR.

## No-progress gate: PDF browser smoke

**Trigger:** the browser smoke failed twice waiting for a PDF download after the guide and satellite controls were added.

**Finding:** architect traced this to a strict locator matching both “PDF” and “Satellite PDF”; the pending download promise masked the click exception on browser close. No exporter redesign was justified.

**Decision:** use an exact PDF button match and await click and download together. The subsequent mobile browser run passed five walks, GPX, PDF, save, reverse reroute and closure reload. This proves the standard PDF browser path; configured satellite/guide/QR acceptance remains separate.

## Completion gate: integrated satellite and guide candidate

**Trigger:** the satellite provider, PDF page three, contact data import, route generation and live deployment span multiple services.

**Finding:** the architect found a QR identity risk when a generated route was edited before sharing. The no-progress browser gate then found that saving changed the URL and unmounted the generated export controls.

**Decision:** clear generated identity on geometry-changing mode, loop and GPX actions; require the published saved geometry to match the selected generated route before offering a QR; keep the generator visible within its active editor session after the canonical saved URL appears. Selection changes only after replacement is accepted. A restricted, rotated ArcGIS Static Maps credential is stored in root-only production configuration, with the earlier value invalidated.

**Candidate evidence:** 85 Vitest tests, four Python contact-import tests, TypeScript check and production build passed. The mobile five-walk browser test passed route lengths, pub/cafe counts, GPX, PDF, save, reverse reroute and closure. A configured browser generated and downloaded a guide PDF through the real ArcGIS adapter; physical A4 page 3 was rendered and visually checked for imagery, route alignment, two numbered places, embedded attribution and contact table. The provider request returned JPEG. The encrypted pre-migration production backup was copied to the gateway with matching SHA-256; additive migration 006 and atomic OSM import completed with 18,691 features and non-null contact counts. Public HTTPS QR and deployment acceptance remain required before a live verdict.

## No-progress gate: satellite browser export

**Trigger:** twice the configured guide smoke waited for a download or POST after sharing.

**Finding:** no satellite POST was sent because the saved route URL caused the generator panel to unmount. This was editor state ownership, not provider or PDF failure.

**Decision:** retain the generator for the active generated editor session at the saved URL. Rerun showed one visible card, enabled satellite action, a successful POST and a downloaded real-imagery PDF. HTTPS QR remains a separate acceptance check.
