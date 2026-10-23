#!/usr/bin/env python3
"""Atomically import bounded Overture food and pub points from official GeoJSON.

Generate the file with `overturemaps download --type=place --bbox=... -f geojson -o ...`.
The matching .state file records the release and bounding box. Requires psycopg.
"""
import argparse
import json
import os
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID
import psycopg

CATEGORIES = {
    'coffee_shop': 'cafe', 'cafe': 'cafe', 'bakery': 'cafe',
    'restaurant': 'restaurant', 'fast_food_restaurant': 'fast_food', 'pub': 'pub',
}
MIN_CONFIDENCE = 0.80


def clean_text(value, limit):
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if value and len(value) <= limit and all(ord(c) >= 32 and ord(c) != 127 for c in value) else None


def website(value):
    value = clean_text(value, 2048)
    if not value or any(c.isspace() for c in value) or any(c in '<>"\\' for c in value):
        return None
    parsed = urlsplit(value)
    return value if parsed.scheme in ('http', 'https') and parsed.hostname and not parsed.username and not parsed.password else None


def venue_rows(features):
    for feature in features:
        props = feature.get('properties') or {}
        category = CATEGORIES.get((props.get('taxonomy') or {}).get('primary'))
        confidence = props.get('confidence')
        if not category or not isinstance(confidence, (float, int)) or confidence < MIN_CONFIDENCE:
            continue
        status = props.get('operating_status')
        if status == 'permanently_closed':
            continue
        point = (feature.get('geometry') or {}).get('coordinates')
        name = clean_text((props.get('names') or {}).get('primary'), 200)
        if not name or not isinstance(point, list) or len(point) != 2:
            continue
        lng, lat = point
        if not all(isinstance(v, (float, int)) for v in point) or not (-180 <= lng <= 180 and -90 <= lat <= 90):
            continue
        try:
            uid = str(UUID(str(feature['id'])))
        except (KeyError, ValueError, TypeError):
            continue
        addresses = props.get('addresses') or []
        address = clean_text(addresses[0].get('freeform'), 300) if addresses and isinstance(addresses[0], dict) else None
        phones = props.get('phones') or []
        phone = clean_text(phones[0], 100) if phones else None
        websites = props.get('websites') or []
        web = website(websites[0]) if websites else None
        updates = [s.get('update_time') for s in props.get('sources') or [] if isinstance(s, dict) and s.get('property', '') == '']
        observed = None
        for update in updates:
            try:
                observed = max(observed, datetime.fromisoformat(update.replace('Z', '+00:00'))) if observed else datetime.fromisoformat(update.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                pass
        yield (uid, name, category, lng, lat, float(confidence), status, address, phone, web, json.dumps(props.get('sources') or [], ensure_ascii=False), observed)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--geojson', required=True, type=Path)
    parser.add_argument('--state', required=True, type=Path)
    args = parser.parse_args()
    state = json.loads(args.state.read_text())
    release = state.get('last_release', '')
    bbox = state.get('bbox') or {}
    if not re.fullmatch(r'20\d\d-\d\d-\d\d\.\d+', release) or state.get('type') != 'place' or state.get('theme') != 'places':
        raise ValueError('Missing or invalid Overture release metadata')
    bounds = [bbox.get(k) for k in ('xmin', 'ymin', 'xmax', 'ymax')]
    if not all(isinstance(v, (float, int)) for v in bounds) or bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
        raise ValueError('Invalid Overture bounding box')
    features = json.loads(args.geojson.read_text()).get('features')
    if not isinstance(features, list):
        raise ValueError('Expected GeoJSON feature collection')
    rows = list(venue_rows(features))
    if not rows or len(rows) > 100_000:
        raise ValueError('Unexpected selected place count')
    source_url = f'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/release/{release}/theme=places/type=place/'
    with psycopg.connect(os.environ['DATABASE_URL']) as connection:
        with connection.cursor() as cursor:
            cursor.execute('CREATE TEMP TABLE import_overture (LIKE overture_pois INCLUDING ALL) ON COMMIT DROP')
            with cursor.copy('COPY import_overture (id,name,category,location,confidence,operating_status,address,phone,website,source_release,source_provenance,observed_at) FROM STDIN') as writer:
                for uid, name, category, lng, lat, confidence, status, address, phone, web, provenance, observed in rows:
                    writer.write_row((uid, name, category, f'SRID=4326;POINT({lng} {lat})', confidence, status, address, phone, web, release, provenance, observed))
            cursor.execute('TRUNCATE overture_pois')
            cursor.execute('INSERT INTO overture_pois SELECT * FROM import_overture')
            cursor.execute('''INSERT INTO overture_extracts (id,source_release,source_url,bbox,feature_count)
                VALUES (1,%s,%s,ST_MakeEnvelope(%s,%s,%s,%s,4326),%s)
                ON CONFLICT (id) DO UPDATE SET source_release=EXCLUDED.source_release,source_url=EXCLUDED.source_url,
                bbox=EXCLUDED.bbox,feature_count=EXCLUDED.feature_count,imported_at=now()''', (release, source_url, *bounds, len(rows)))
    print(f'release={release} food_and_pub_points={len(rows)}')


if __name__ == '__main__':
    main()
