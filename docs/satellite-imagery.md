# Satellite map adapter

Optional ArcGIS Location Platform Static Maps integration for printable guides.
Set server-only ARCGIS_STATIC_MAPS_KEY with the premium:user:staticMaps privilege.
Provision a key permitted for this server application and review the provider's
current licence, attribution and usage charges before enabling it. Never expose
this key as a NEXT_PUBLIC variable.

GET /api/satellite reports configured availability only; it does not prove the
provider credential, licence, quota or service are working. No outbound request
is made by that check.

POST /api/satellite requires the application's trusted Origin header and JSON:
{"geometry":{"type":"LineString","coordinates":[[-0.86,53.14],[-0.85,53.15]]},"facilities":[{"coordinate":[-0.855,53.145],"number":1}],"width":1024,"height":640}

Coordinates are WGS84 longitude/latitude. Markers must use the same 1-based
numbering as the guide's facilities table. Route length is 2-5000 coordinates;
there are at most 60 facility markers, each a unique integer 1-99. Combined
longitude/latitude spans cannot exceed 0.5 degrees. Latitude is limited to
85 degrees for imagery. Dimensions are integers 128-1024, default 1024x640.

Success is a JPEG containing imagery, route and numbered facility markers
rendered together by ArcGIS, with provider/data attribution embedded. Preserve
the entire image and its aspect ratio; do not crop attribution. The
X-Map-Attribution header is supplementary, not a replacement for embedded data
attribution. The provider fits the extent to every geometry plus 8% padding;
no client projection or overlay is required. Imagery capture dates and currency
are unknown; this adapter does not assert a current aerial survey.

Failures return {error,code}. SATELLITE_NOT_CONFIGURED (503) means the optional
key is missing. SATELLITE_UNAVAILABLE (503) includes provider denial, timeout,
non-JPEG or oversized response. No fabricated satellite fallback is returned.
Requests have a 12-second upstream deadline, 5 MB response cap, 300 KB JSON
body cap, fixed HTTPS provider/style, redirect rejection, no-store responses,
and an application-process limit of 12 requests/minute and two concurrent
requests. Process limits are not a distributed quota.

Provider API references (checked 23 October 2026):
- https://developers.arcgis.com/rest/static-maps/
- https://developers.arcgis.com/rest/static-maps/types/
- https://developers.arcgis.com/documentation/mapping-and-location-services/mapping/static-maps/map-with-multiple-geometries/

Qualification: mocked adapter/endpoint tests cover missing credentials, denied
requests, untrusted origins, bounded input, image response validation, and the
route/marker/attribution request composition. A real configured-provider candidate run returned a JPEG and the browser downloaded
a guide PDF. Physical page 3 was rendered and checked for route, numbered markers,
attribution and a contact table. Public HTTPS QR acceptance and ongoing provider
licence/quota monitoring remain deployment checks.
