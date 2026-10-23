#!/usr/bin/env python3
"""Atomic local OSM discovery import. Dependencies: osmium, psycopg[binary].
Uses the exact PBF + matching Geofabrik .poly coverage. No network calls.
Example: DATABASE_URL in environment, then:
.venv-osm/bin/python scripts/import-osm-pois.py --pbf data/nottinghamshire-latest.osm.pbf --poly data/nottinghamshire.poly
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import osmium
import psycopg

PLACE_AMENITIES = {'cafe', 'pub', 'toilets'}
PLACE_TOURISM = {'attraction', 'viewpoint', 'museum'}


def classifications(tags):
    rows = []
    if tags.get('amenity') in PLACE_AMENITIES:
        rows.append(('place', tags['amenity']))
    elif tags.get('tourism') in PLACE_TOURISM:
        rows.append(('place', tags['tourism']))
    if tags.get('railway') in {'station', 'halt', 'tram_stop'}:
        rows.append(('transport', 'tram' if tags.get('railway') == 'tram_stop' else 'rail'))
    elif tags.get('highway') == 'bus_stop':
        rows.append(('transport', 'bus'))
    elif tags.get('public_transport') in {'platform', 'stop_position'}:
        kind = 'rail' if tags.get('train') == 'yes' else 'tram' if tags.get('tram') == 'yes' else 'bus' if tags.get('bus') == 'yes' else 'transport'
        rows.append(('transport', kind))
    return rows


def read_poly(path):
    lines = [line.strip() for line in path.read_text().splitlines() if line.strip()]
    outer, holes = [], []
    i = 1
    while i < len(lines) and lines[i] != 'END':
        is_hole = lines[i].startswith('!')
        i += 1
        ring = []
        while i < len(lines) and lines[i] != 'END':
            nums = lines[i].split()
            if len(nums) != 2:
                raise ValueError('Invalid .poly coordinate')
            lng, lat = map(float, nums)
            if not math.isfinite(lng) or not math.isfinite(lat) or abs(lng) > 180 or abs(lat) > 90:
                raise ValueError('Out-of-range .poly coordinate')
            ring.append([lng, lat])
            i += 1
        if i == len(lines):
            raise ValueError('Unterminated .poly ring')
        i += 1
        if len(ring) < 3:
            raise ValueError('Coverage ring has fewer than three points')
        if ring[-1] != ring[0]:
            ring.append(ring[0])
        (holes if is_hole else outer).append([ring])
    if not outer:
        raise ValueError('No coverage polygons')
    return json.dumps({'type': 'MultiPolygon', 'coordinates': outer}), json.dumps({'type': 'MultiPolygon', 'coordinates': holes}) if holes else None


class Importer(osmium.SimpleHandler):
    def __init__(self, cursor):
        super().__init__()
        self.cursor = cursor
        self.factory = osmium.geom.GeoJSONFactory()
        self.pending = []
        self.skipped = 0

    def add(self, osm_type, osm_id, tags, geometry):
        for family, category in classifications(tags):
            self.pending.append((family, osm_type, osm_id, tags.get('name') or category.replace('_', ' ').capitalize(), category, geometry))
        if len(self.pending) >= 1000:
            self.flush()

    def flush(self):
        if not self.pending:
            return
        self.cursor.executemany("""
            INSERT INTO import_pois(family,osm_type,osm_id,name,category,location)
            VALUES(%s,%s,%s,%s,%s,ST_PointOnSurface(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326))))
            ON CONFLICT(family,osm_type,osm_id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category,location=EXCLUDED.location
        """, self.pending)
        self.pending.clear()

    def node(self, obj):
        tags = dict(obj.tags)
        if classifications(tags):
            if obj.location.valid():
                self.add('node', obj.id, tags, self.factory.create_point(obj))
            else:
                self.skipped += 1

    def way(self, obj):
        tags = dict(obj.tags)
        if not classifications(tags):
            return
        try:
            self.add('way', obj.id, tags, self.factory.create_linestring(obj))
        except (osmium.InvalidLocationError, RuntimeError):
            self.skipped += 1

    def area(self, obj):
        tags = dict(obj.tags)
        if not classifications(tags):
            return
        try:
            self.add('way' if obj.from_way() else 'relation', obj.orig_id(), tags, self.factory.create_multipolygon(obj))
        except (osmium.InvalidLocationError, RuntimeError):
            self.skipped += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pbf', required=True, type=Path)
    parser.add_argument('--poly', required=True, type=Path)
    parser.add_argument('--region', default='Nottinghamshire')
    parser.add_argument('--source-url', default='https://download.geofabrik.de/europe/united-kingdom/england/nottinghamshire.html')
    parser.add_argument('--database-url-env', default='DATABASE_URL')
    args = parser.parse_args()
    database_url = os.environ.get(args.database_url_env)
    if not database_url:
        parser.error('Database URL environment variable is not configured')
    outer, holes = read_poly(args.poly)
    digest = hashlib.sha256()
    with args.pbf.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    reader = osmium.io.Reader(str(args.pbf))
    try:
        source_timestamp = reader.header().get('osmosis_replication_timestamp') or None
    finally:
        reader.close()
    # One transaction and advisory lock: readers see the complete old or new index.
    # A failed import leaves the previous index and its coverage untouched.
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext('findmywalk-osm-import'))")
            cursor.execute('CREATE TEMP TABLE import_pois (LIKE osm_pois INCLUDING ALL) ON COMMIT DROP')
            handler = Importer(cursor)
            handler.apply_file(str(args.pbf), locations=True, idx='flex_mem')
            handler.flush()
            cursor.execute('SELECT count(*) FROM import_pois')
            count = cursor.fetchone()[0]
            if count == 0:
                raise ValueError('No supported features found; previous index retained')
            cursor.execute("""CREATE TEMP TABLE import_coverage ON COMMIT DROP AS
                SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
                    CASE WHEN %s::text IS NULL THEN ST_GeomFromGeoJSON(%s)
                    ELSE ST_Difference(ST_UnaryUnion(ST_GeomFromGeoJSON(%s)),ST_UnaryUnion(ST_GeomFromGeoJSON(%s))) END
                ),3))::geometry(MultiPolygon,4326) AS geometry""", (holes, outer, outer, holes))
            cursor.execute('SELECT ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry) FROM import_coverage')
            if not cursor.fetchone()[0]:
                raise ValueError('Invalid coverage geometry; previous index retained')
            # Boundaries from the .poly are authoritative, even when the PBF includes buffer features.
            cursor.execute('DELETE FROM osm_pois')
            cursor.execute('INSERT INTO osm_pois SELECT p.* FROM import_pois p,import_coverage c WHERE ST_Covers(c.geometry,p.location)')
            cursor.execute('SELECT count(*) FROM osm_pois')
            retained = cursor.fetchone()[0]
            cursor.execute("""INSERT INTO osm_extracts(id,region,coverage,source_url,pbf_sha256,source_timestamp,feature_count,skipped_geometry_count)
                SELECT 1,%s,geometry,%s,%s,%s,%s,%s FROM import_coverage
                ON CONFLICT(id) DO UPDATE SET region=EXCLUDED.region,coverage=EXCLUDED.coverage,
                source_url=EXCLUDED.source_url,pbf_sha256=EXCLUDED.pbf_sha256,source_timestamp=EXCLUDED.source_timestamp,
                feature_count=EXCLUDED.feature_count,skipped_geometry_count=EXCLUDED.skipped_geometry_count,imported_at=now()
            """, (args.region,args.source_url,digest.hexdigest(),source_timestamp,retained,handler.skipped))
    print(json.dumps({'region':args.region,'features':retained,'skippedGeometry':handler.skipped,'pbfSha256':digest.hexdigest(),'sourceTimestamp':source_timestamp,'attribution':'OpenStreetMap contributors, ODbL'}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never emit connection URLs or driver exception text that might include credentials.
        print('OSM import failed (' + type(error).__name__ + '); transaction rolled back. Check input files, schema and database configuration.', file=sys.stderr)
        sys.exit(1)

