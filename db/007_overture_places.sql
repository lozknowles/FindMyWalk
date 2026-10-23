-- Independent, attributed business directory index. Imported atomically from an Overture release.
CREATE TABLE IF NOT EXISTS overture_pois (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 category text NOT NULL,
 location geometry(Point,4326) NOT NULL,
 confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
 operating_status text,
 address text,
 phone varchar(100),
 website varchar(2048),
 source_release text NOT NULL,
 source_provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
 observed_at timestamptz,
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overture_pois_geography ON overture_pois USING gist ((location::geography));
CREATE TABLE IF NOT EXISTS overture_extracts (
 id integer PRIMARY KEY CHECK (id=1),
 source_release text NOT NULL,
 source_url text NOT NULL,
 bbox geometry(Polygon,4326) NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 feature_count integer NOT NULL
);

ALTER TABLE overture_pois ADD COLUMN IF NOT EXISTS source_provenance jsonb NOT NULL DEFAULT '[]'::jsonb;
