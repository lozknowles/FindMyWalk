# Nottinghamshire beta operations

The public origin is `https://findmywalk.com` with `www` redirected to the apex. CottageServer terminates TLS and proxies only the FindMyWalk virtual host to hpubuntu's Tailscale address on port 3110. hpubuntu runs a separate Docker Compose project at `/fast/services/findmywalk`; production PostGIS and Valhalla volumes do not share the development instance's data. The app image is built from an identified Git revision, with database and router images pinned by digest. The static Apache document root remains the traffic rollback target.

## Release

1. On hpubuntu, build/test in `/fast/work/findmywalk-platform` and record the Git SHA and image ID. Copy `deploy/production.compose.yaml` and `deploy/backup-production.sh` to the private service directory; keep `.env` and `backup.pass` root-only. The Compose file binds PostGIS and routing to loopback and the app to hpubuntu's Tailscale IP.
2. Take and verify a remote encrypted backup before a schema or image change. Apply ordered SQL migrations. Import the pinned Nottinghamshire PBF and matching polygon into the independent production database; check the reported SHA, coverage and feature count.
3. Start the pinned routing image from the prepared regional graph and require `/status` HTTP 200. Start the app; require `/api/health` and a real pedestrian route before proxy cutover. The release candidate is accessible only through the private upstream until cutover.
4. Back up the exact Apache FindMyWalk TLS virtual host, change only that virtual host to reverse proxy, run `apache2ctl configtest`, then reload Apache. Preserve the holding page files. Check both apex and www over trusted HTTPS, secure cookies, owner and visitor sharing, revocation, denied permissions, route failure, outside-coverage errors, mobile layout and report submission.
5. Record the source SHA, image ID, PBF SHA, encrypted backup hash, restore result, config backup path and external test results. Keep the prior image and holding-page configuration.

## Data protection and response

New walks start private. Unlisted links can be passed onward; they are not confidential. Public publication is disabled unless `ALLOW_PUBLIC_PUBLISH=true` is explicitly configured. The anonymous cookie is the only editing key; losing it loses editing access. Route creation, GPX import, route calculation and discovery have bounded admission. `WRITES_ENABLED=false` pauses write and routing requests if an abuse or storage incident occurs. Limits are process-local; deploy a single app replica for this beta.

Reports are stored in `route_reports`. An operator should review `SELECT id,route_id,reason,details,created_at FROM route_reports WHERE reviewed_at IS NULL ORDER BY created_at;` daily and after any alert. Do not publish report contents. For an unsafe shared route, first pause writes if needed, then withdraw its snapshot with a documented SQL change or remove the route after preserving evidence and notifying the user if a contact exists. Log the report resolution in `reviewed_at` and `resolution`. The beta has no user messaging, automatic moderation or account recovery.

`/fast/services/findmywalk/backup.sh` produces a GPG AES-256 encrypted `pg_dump -Fc` locally, copies it to root-only `/var/backups/findmywalk` on CottageServer over SSH and verifies SHA-256 equality. The recovery passphrase is protected on both hosts. Run the script daily and inspect failures. Periodically restore the remote encrypted copy to an isolated PostGIS database and verify counts, shared snapshots, regional coverage and spatial search. No backup is assumed recoverable without this drill. Retention and alert escalation need an operator decision as traffic grows.

For a gateway failure or app regression, restore the saved FindMyWalk virtual host and reload Apache. This returns the holding page without altering other virtual hosts. Keep the production database and uploaded routes intact during traffic rollback. If a database rollback is necessary, reconcile writes accepted after the backup before restoring.
