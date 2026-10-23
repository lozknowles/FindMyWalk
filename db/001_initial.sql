CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS walks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL, title varchar(160) NOT NULL, description text NOT NULL DEFAULT '',
 waypoints jsonb NOT NULL CHECK(jsonb_typeof(waypoints)='array'),
 geometry geometry(LineString,4326) NOT NULL,
 distance_meters double precision NOT NULL CHECK(distance_meters>0),
 duration_minutes double precision NOT NULL CHECK(duration_minutes>0),
 visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','unlisted','public')),
 geometry_source text NOT NULL DEFAULT 'unknown' CHECK(geometry_source IN ('manual','walking-router','gpx-import','unknown')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 published_snapshot jsonb, published_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS walks_owner_updated ON walks(owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS walks_geometry ON walks USING gist(geometry);
CREATE INDEX IF NOT EXISTS walks_public ON walks(published_at DESC) WHERE visibility='public' AND published_at IS NOT NULL;

