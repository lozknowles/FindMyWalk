#!/usr/bin/env bash
set -euo pipefail
umask 077
root=/fast/services/findmywalk
backup_dir="$root/backups"
mkdir -p "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="findmywalk-$stamp.dump.gpg"
temporary="$backup_dir/$name.tmp"
final="$backup_dir/$name"
trap 'rm -f "$temporary"' EXIT
docker exec findmywalk-production-db-1 pg_dump -U findmywalk -d findmywalk -Fc |
  gpg --batch --yes --pinentry-mode loopback --passphrase-file "$root/backup.pass" --symmetric --cipher-algo AES256 --output "$temporary"
test -s "$temporary"
mv "$temporary" "$final"
local_hash=$(sha256sum "$final" | cut -d ' ' -f1)
sudo -u loz ssh -o BatchMode=yes -p 2222 cottageserver "sudo -n tee /var/backups/findmywalk/$name >/dev/null" < "$final"
remote_hash=$(sudo -u loz ssh -o BatchMode=yes -p 2222 cottageserver "sudo -n sha256sum /var/backups/findmywalk/$name" | cut -d ' ' -f1)
test "$local_hash" = "$remote_hash"
printf 'backup=%s sha256=%s remote=verified\n' "$final" "$local_hash"
