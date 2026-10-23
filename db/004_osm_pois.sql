CREATE TABLE IF NOT EXISTS osm_extracts (
 id integer PRIMARY KEY CHECK(id=1),
 region text NOT NULL,
 coverage geometry(MultiPolygon,4326) NOT NULL,
 source_url text NOT NULL,
 pbf_sha256 text NOT NULL,
 source_timestamp text,
 imported_at timestamptz NOT NULL DEFAULT now(),
 feature_count integer NOT NULL,
 skipped_geometry_count integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS osm_pois (
 family text NOT NULL CHECK(family IN ('place','transport')),
 osm_type text NOT NULL CHECK(osm_type IN ('node','way','relation')),
 osm_id bigint NOT NULL,
 name text NOT NULL,
 category text NOT NULL,
 location geometry(Point,4326) NOT NULL,
 PRIMARY KEY(family,osm_type,osm_id)
);
CREATE INDEX IF NOT EXISTS osm_pois_location ON osm_pois USING gist(location);
CREATE INDEX IF NOT EXISTS osm_pois_geography ON osm_pois USING gist((location::geography));

