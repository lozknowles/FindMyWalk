import { NextRequest, NextResponse } from 'next/server';
import {origin,json,failure,limitedText} from '../../../lib/server/core';
import {admitRouting} from '../../../lib/server/resource-limits';

type Coordinate = [number, number];

function decodePolyline6(encoded: string): Coordinate[] {
  const points: Coordinate[] = [];
  let lat = 0;
  let lng = 0;
  let index = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length || shift > 35) throw new Error('Invalid route geometry');
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return (result & 1) ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lng / 1e6, lat / 1e6]);
    if (points.length > 50000) throw new Error('Route geometry too large');
  }
  return points;
}

export async function POST(request: NextRequest) {
  let release:(()=>void)|undefined;
  try {
  origin(request);
  release=admitRouting();
  let waypoints: Coordinate[];
  try {
    const body = await json(request,16_384);
    waypoints = body?.waypoints;
    if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 25 ||
      waypoints.some((p) => !Array.isArray(p) || p.length !== 2 ||
        !Number.isFinite(p[0]) || !Number.isFinite(p[1]) ||
        Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) {
      return NextResponse.json({ error: 'Provide 2 to 25 valid [longitude, latitude] waypoints', code: 'INVALID_WAYPOINTS' }, { status: 400 });
    }
  } catch(e) { return failure(e); }
  const base = process.env.VALHALLA_URL;
  if (!base) {
    return NextResponse.json({ error: 'Pedestrian routing is not configured; use a clearly marked manual section', code: 'ROUTING_UNAVAILABLE' }, { status: 503 });
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response: Response;
    try {
      response = await fetch(new URL('/route', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locations: waypoints.map(([lon, lat]) => ({ lon, lat })), costing: 'pedestrian', units: 'kilometers', directions_options: { units: 'kilometers' } }),
        signal: controller.signal,
        cache: 'no-store',
      });

    if (!response.ok) {
      return NextResponse.json({ error: 'Pedestrian routing could not connect these waypoints', code: 'NO_PEDESTRIAN_ROUTE' }, { status: 422 });
    }
    const data = JSON.parse(await limitedText(response as unknown as Request,6_000_000));
    const trip = data?.trip;
    const legs = trip?.legs;
    if (!Array.isArray(legs) || !Number.isFinite(trip?.summary?.length) || !Number.isFinite(trip?.summary?.time)) throw new Error('Invalid routing response');
    const coordinates: Coordinate[] = [];
    for (const leg of legs) {
      const decoded = decodePolyline6(leg.shape);
      if(coordinates.length+decoded.length>100001)throw new Error('Route geometry too large');
      coordinates.push(...(coordinates.length ? decoded.slice(1) : decoded));
    }
    if (coordinates.length < 2) throw new Error('Empty route');
    return NextResponse.json({ geometry: { type: 'LineString', coordinates }, distanceMeters: Math.max(1,Math.round(trip.summary.length * 1000)), durationMinutes: Math.max(1,Math.round(trip.summary.time / 60)), source: 'valhalla-pedestrian', warnings: ['Mapped paths do not establish public rights of way or current safety.'] });
    } finally { clearTimeout(timeout); }
  } catch {
    return NextResponse.json({ error: 'Pedestrian routing is temporarily unavailable', code: 'ROUTING_UNAVAILABLE' }, { status: 503 });
  }
  } catch(e) {return failure(e)} finally {release?.()}
}
