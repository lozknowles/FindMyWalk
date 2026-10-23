/** Server-only Google Places (New) adapter. Never feed its results to MapLibre or persisted POIs. */
export type GooglePlace = {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  primaryType?: string;
  googleMapsUri?: string;
  attributions?: Array<{ provider: string; providerUri?: string }>;
};

const origin = 'https://places.googleapis.com/v1';
const searchMask = 'places.id,places.displayName,places.location,places.primaryType,places.googleMapsUri,places.attributions';
const detailMask = 'id,displayName,formattedAddress,location,primaryType,googleMapsUri,attributions,currentOpeningHours,websiteUri';

function key(): string {
  const value = process.env.GOOGLE_PLACES_API_KEY;
  if (!value) throw new Error('Google Places is not configured');
  return value;
}

async function request(path: string, mask: string, body?: unknown): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${origin}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': mask, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Google Places request failed (${response.status})`);
    return response.json();
  } finally { clearTimeout(timeout); }
}

function validPoint(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Invalid geographic point');
}

export async function nearbyGooglePlaces(latitude: number, longitude: number, radiusMeters: number, includedTypes: string[]): Promise<GooglePlace[]> {
  validPoint(latitude, longitude);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 100 || radiusMeters > 1000 || includedTypes.length < 1 || includedTypes.length > 5 || includedTypes.some(t => !/^[a-z_]+$/.test(t))) throw new Error('Invalid bounded Places search');
  const result = await request('/places:searchNearby', searchMask, {
    includedTypes,
    maxResultCount: 20,
    locationRestriction: { circle: { center: { latitude, longitude }, radius: radiusMeters } },
  });
  return Array.isArray(result.places) ? result.places : [];
}

export async function textGooglePlacesAlongRoute(textQuery: string, encodedPolyline: string): Promise<GooglePlace[]> {
  if (!textQuery || textQuery.length > 100 || !encodedPolyline || encodedPolyline.length > 10000) throw new Error('Invalid route search');
  const result = await request('/places:searchText', searchMask, {
    textQuery,
    pageSize: 20,
    searchAlongRouteParameters: { polyline: { encodedPolyline } },
  });
  return Array.isArray(result.places) ? result.places : [];
}

export async function googlePlaceDetails(placeId: string): Promise<GooglePlace> {
  if (!/^[A-Za-z0-9_-]{5,256}$/.test(placeId)) throw new Error('Invalid place ID');
  return request(`/places/${encodeURIComponent(placeId)}`, detailMask);
}
