ALTER TABLE walks ADD COLUMN IF NOT EXISTS geometry_source text NOT NULL DEFAULT 'unknown' CHECK(geometry_source IN ('manual','walking-router','gpx-import','unknown'));
