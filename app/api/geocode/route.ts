import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2 || q.length > 100) return NextResponse.json({ error: 'Enter a place name or postcode (2–100 characters)', code: 'INVALID_QUERY' }, { status: 400 });
  const base = process.env.PHOTON_URL;
  if (!base) return NextResponse.json({ error: 'Location search is not configured', code: 'GEOCODER_UNAVAILABLE' }, { status: 503 });
  try {
    const url = new URL('/api', base);
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '5');
    const response = await fetch(url, { headers: { 'User-Agent': 'FindMyWalk/0.1 (findmywalk.com)', Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Geocoder failed');
    const payload = await response.json();
    const results = (Array.isArray(payload.features) ? payload.features : []).slice(0, 5).flatMap((feature: any) => {
      const p = feature?.geometry?.coordinates;
      if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return [];
      const a = feature.properties || {};
      return [{ lng: p[0], lat: p[1], label: [a.name, a.city, a.state, a.country].filter(Boolean).filter((v: string, i: number, values: string[]) => values.indexOf(v) === i).join(', ') || q }];
    });
    return NextResponse.json({ results, source: 'OpenStreetMap/Photon', attribution: '© OpenStreetMap contributors' }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return NextResponse.json({ error: 'Location search is temporarily unavailable', code: 'GEOCODER_UNAVAILABLE' }, { status: 503 });
  }
}
