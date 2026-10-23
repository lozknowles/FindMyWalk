-- Additive and idempotent: existing features retain NULL until the next atomic import.
ALTER TABLE osm_pois ADD COLUMN IF NOT EXISTS phone varchar(100);
ALTER TABLE osm_pois ADD COLUMN IF NOT EXISTS website varchar(2048);
ALTER TABLE osm_pois ADD COLUMN IF NOT EXISTS email varchar(254);
