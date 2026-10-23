import QRCode from 'qrcode';
export interface GeneratedSatelliteImage {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
  /** North-up Web Mercator image extent, not the route's unpadded bounds. */
  bounds?: { west: number; south: number; east: number; north: number };
  /** True when the authorized adapter already composed GPX and numbered markers. */
  precomposed?: boolean;
  attribution: string;
  capturedAt?: string;
}
export interface GeneratedPdfOptions {
  format?: 'standard' | 'guide';
  savedWalk?: { url: string; publicOrigin: string; published: true; visibility: 'unlisted' };
}
function savedWalkUrl(options: GeneratedPdfOptions): string | null {
  const saved = options.savedWalk;
  if (!saved || saved.published !== true || saved.visibility !== 'unlisted') return null;
  try {
    const url = new URL(saved.url), origin = new URL(saved.publicOrigin);
    if (url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password ||
      !/^\/walks\/[a-zA-Z0-9_-]+$/.test(url.pathname) || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
export interface GeneratedExportPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  address?: string;
  sourceUrl?: string;
  statusNote?: string;
  positionQuality?: 'approximate' | 'site';
  verifiedAt?: string;
}
export interface GeneratedExportRoute {
  title: string;
  geometry: { type: 'LineString'; coordinates: number[][] };
  distanceMeters: number;
  durationMinutes: number;
  start: { lat: number; lng: number; label?: string };
  targetKm: number;
  directions?: { instruction: string; lengthMeters: number }[];
  directionsTruncated?: boolean;
  facilities?: {
    places?: GeneratedExportPlace[];
    nearbyPlaces?: GeneratedExportPlace[];
    counts: { pub: number; cafe: number; landmark: number };
    sourceTimestamp?: string | null;
    coverage?: 'full' | 'partial';
    truncated?: boolean;
  };
}
const safety = 'Computer-generated route. Check access rights, closures, weather and terrain before setting out. Follow signs and carry a suitable navigation map. This sketch is not a navigation map.';
const attribution = 'Route data: (c) OpenStreetMap contributors | openstreetmap.org/copyright';
const proximity = 'Proximity does not establish access, opening hours or a safe detour.';
function facilitySummary(route: GeneratedExportRoute): string[] {
  const facilities = route.facilities;
  if (!facilities || Object.values(facilities.counts).some(count => !Number.isSafeInteger(count) || count < 0)) {
    return ['Nearby mapped places unavailable.'];
  }
  const { pub, cafe, landmark } = facilities.counts;
  const result = [pub + ' pubs; ' + cafe + ' cafes / food; ' + landmark + ' landmarks mapped within 100 m of the route.'];
  if (facilities.sourceTimestamp) {
    const date = new Date(facilities.sourceTimestamp);
    if (!Number.isNaN(date.getTime())) result.push('Map source date: ' + date.toISOString().slice(0, 10) + '.');
  }
  if (facilities.coverage === 'partial' || facilities.truncated) result.push('Results may be incomplete (limited map coverage or results).');
  if (facilities.nearbyPlaces?.length) result.push('Also in Collingham (approximate guide locations, not counted as route facilities): ' + facilities.nearbyPlaces.map(place => place.name).join('; ') + '. Check opening and access.');
  if (pub + cafe + landmark === 0) result.push('No mapped places found; facilities may still exist.');
  return result;
}
function validate(route: GeneratedExportRoute) {
  if (route.geometry.type !== 'LineString' || route.geometry.coordinates.length < 2 ||
    route.geometry.coordinates.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) ||
    !Number.isFinite(route.distanceMeters) || route.distanceMeters <= 0 ||
    !Number.isFinite(route.durationMinutes) || route.durationMinutes <= 0 ||
    !Number.isFinite(route.targetKm) || route.targetKm <= 0 ||
    !Number.isFinite(route.start.lat) || Math.abs(route.start.lat) > 90 ||
    !Number.isFinite(route.start.lng) || Math.abs(route.start.lng) > 180)
    throw new Error('Cannot export an invalid generated route.');
}
export function generatedFilename(title: string, extension: 'pdf' | 'gpx') {
  const stem = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');
  return 'findmywalk-' + (stem || 'generated-walk') + '.' + extension;
}
function xml(value: string) {
  return value.replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
export function generatedGpxBlob(route: GeneratedExportRoute): Blob {
  validate(route);
  const description = (route.distanceMeters / 1000).toFixed(2) + ' km; estimated walking time: ' +
    Math.max(1, Math.round(route.durationMinutes)) + ' minutes. ' + attribution + '. ' + safety + ' Mapped places near this walk: ' + facilitySummary(route).join(' ') + ' ' + proximity;
  const points = route.geometry.coordinates.map(([lng, lat]) =>
    '<trkpt lat="' + lat + '" lon="' + lng + '"></trkpt>').join('\n');
  return new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="FindMyWalk" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '<metadata><name>' + xml(route.title) + '</name><desc>' + xml(description) +
    '</desc><link href="https://www.openstreetmap.org/copyright"><text>OpenStreetMap contributors</text></link></metadata>\n' +
    '<trk><name>' + xml(route.title) + '</name><desc>' + xml(description) + '</desc><trkseg>\n' +
    points + '\n</trkseg></trk></gpx>\n'], { type: 'application/gpx+xml;charset=utf-8' });
}
// Use the built-in ASCII font: transliterate Latin accents; replace unsupported
// glyphs. Keeping the stream ASCII makes PDF cross-reference byte offsets exact.
function pdfText(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/([\\()])/g, '\\$1');
}
function wrap(value: string, width: number) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  const result: string[] = [];
  let line = '';
  for (let word of words) {
    if (line && line.length + word.length + 1 > width) { result.push(line); line = ''; }
    while (word.length > width) { result.push(word.slice(0, width)); word = word.slice(width); }
    line += (line ? ' ' : '') + word;
  }
  if (line) result.push(line);
  return result;
}
function validateSatellite(image: GeneratedSatelliteImage): void {
  const { west, south, east, north } = image.bounds || { west: 0, south: 0, east: 1, north: 1 };
  if (!(image.jpegBytes instanceof Uint8Array) || image.jpegBytes.length < 4 || image.jpegBytes.length > 10_000_000 ||
    image.jpegBytes[0] !== 255 || image.jpegBytes[1] !== 216 || image.jpegBytes[image.jpegBytes.length - 2] !== 255 ||
    image.jpegBytes[image.jpegBytes.length - 1] !== 217 ||
    !Number.isInteger(image.width) || image.width < 1 || image.width > 10000 ||
    !Number.isInteger(image.height) || image.height < 1 || image.height > 10000 ||
    ![west, south, east, north].every(Number.isFinite) || west >= east || south >= north ||
    west < -180 || east > 180 || south < -85.05112878 || north > 85.05112878 || (!image.precomposed && !image.bounds) || !image.attribution.trim())
    throw new Error('Invalid attributed satellite image or Web Mercator bounds.');
}
function satelliteProjector(bounds: NonNullable<GeneratedSatelliteImage['bounds']>, x: number, y: number, width: number, height: number) {
  const mercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 360));
  const bottom = mercator(bounds.south), top = mercator(bounds.north);
  return (lng: number, lat: number) => [
    x + (lng - bounds.west) / (bounds.east - bounds.west) * width,
    y + (mercator(lat) - bottom) / (top - bottom) * height,
  ];
}
export function generatedPdfBlob(route: GeneratedExportRoute, satellite?: GeneratedSatelliteImage, options: GeneratedPdfOptions = {}): Blob {
  validate(route);
  const commands: string[] = [];
  const text = (value: string, x: number, y: number, size = 11) =>
    commands.push('BT /F1 ' + size + ' Tf ' + x + ' ' + y + ' Td (' + pdfText(value) + ') Tj ET');
  text('FindMyWalk / generated walk', 40, 800, 12);
  const title = wrap(route.title, 27);
  title.slice(0, 2).forEach((line, i) => text(line + (i === 1 && title.length > 2 ? '...' : ''), 40, 766 - i * 24, 20));
  if (options.format === 'guide') {
    commands.push('0.94 0.97 0.94 rg 32 608 531 120 re f', '0 0 0 rg');
    text('Plan your walk', 40, 714, 11);
  }
  text('Distance: ' + (route.distanceMeters / 1000).toFixed(2) + ' km | Estimated time: ' +
    Math.max(1, Math.round(route.durationMinutes)) + ' minutes', 40, 697, 12);
  text('Requested distance: ' + route.targetKm.toFixed(1) + ' km', 40, 678);
  wrap('Start: ' + (route.start.label || 'Selected map location'), 49).slice(0, 2)
    .forEach((line, i) => text(line, 40, 656 - i * 15));
  text('Start coordinates: ' + route.start.lat.toFixed(5) + ', ' + route.start.lng.toFixed(5), 40, 619);
  // Unwrap longitude so a local walk across the antimeridian stays local.
  let previous = route.geometry.coordinates[0][0];
  const latitudeScale = Math.max(0.01, Math.cos(route.start.lat * Math.PI / 180));
  const projected = route.geometry.coordinates.map(([lng, lat]) => {
    while (lng - previous > 180) lng -= 360;
    while (lng - previous < -180) lng += 360;
    previous = lng;
    return [lng * latitudeScale, lat];
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of projected) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const scale = Math.min(475 / Math.max(maxX - minX, 1e-8), 260 / Math.max(maxY - minY, 1e-8));
  const points = projected.map(([x, y]) => [297.5 + (x - (minX + maxX) / 2) * scale, 450 + (y - (minY + maxY) / 2) * scale]);
  commands.push('0.92 0.94 0.92 rg 40 300 515 300 re f', '0.08 0.38 0.23 RG 2 w');
  points.forEach(([x, y], i) => commands.push(x.toFixed(2) + ' ' + y.toFixed(2) + (i ? ' l' : ' m')));
  commands.push('S');
  const [sx, sy] = points[0];
  commands.push('0.08 0.38 0.23 rg ' + (sx - 4).toFixed(2) + ' ' + (sy - 4).toFixed(2) + ' 8 8 re f', '0 0 0 rg');
  text('N ^', 518, 578, 10);
  text('Route sketch - north up; square marks the route start.', 40, 283, 10);
  wrap(safety, 49).forEach((line, i) => text(line, 40, 251 - i * 16));
  text('Mapped places near this walk', 40, 166, 11);
  let facilityY = 151;
  const extraFacilityLines: string[] = [];
  let facilityOverflow = false;
  for (const line of [facilitySummary(route)[0], proximity, ...facilitySummary(route).slice(1)]) {
    const wrappedLines = wrap(line, 60);
    // Move a complete note to the continuation page if it would hit the footer.
    if (facilityOverflow || facilityY - (wrappedLines.length - 1) * 12 < 91) {
      facilityOverflow = true;
      extraFacilityLines.push(...wrappedLines);
      continue;
    }
    for (const wrapped of wrappedLines) { text(wrapped, 40, facilityY, 9); facilityY -= 12; }
  }
  if (extraFacilityLines.length) text('Additional place notes follow.', 40, 79, 8);
  text(attribution, 40, 49, 9);
  text('Generated by FindMyWalk. Walking time is an estimate.', 40, 31, 9);
  const savedUrl = savedWalkUrl(options);
  if (savedUrl) {
    const qr = QRCode.create(savedUrl, { errorCorrectionLevel: 'M' });
    const quiet = 4, size = 70, unit = size / (qr.modules.size + quiet * 2);
    commands.push('1 1 1 rg 465 92 70 70 re f', '0 0 0 rg');
    for (let row = 0; row < qr.modules.size; row++) {
      for (let col = 0; col < qr.modules.size; col++) {
        if (qr.modules.get(row, col)) commands.push(
          (465 + (col + quiet) * unit).toFixed(3) + ' ' +
          (92 + size - (row + quiet + 1) * unit).toFixed(3) + ' ' +
          unit.toFixed(3) + ' ' + unit.toFixed(3) + ' re f');
      }
    }
    text('Saved walk webpage', 462, 82, 8);
  }
  const stream = commands.join('\n') + '\n';
  const hasDirections = Boolean(route.directions?.length);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream',
  ];
  const pageIds = [3];
  if (hasDirections) {
    const directions = route.directions!.slice(0, 500);
    const truncated = route.directionsTruncated || route.directions!.length > directions.length;
    let directionPage = 0;
    let y = 720;
    const beginPage = () => {
      directionPage++;
      commands.length = 0;
      text('FindMyWalk / turn instructions', 40, 800, 18);
      text('Computer-generated directions; verify signs and access.', 40, 773, 11);
      text('Directions page ' + directionPage + '. Carry a suitable navigation map.', 40, 755, 10);
      y = 720;
    };
    const finishPage = () => {
      if (truncated) text('Directions incomplete: upstream safety limit reached; some turns omitted.', 40, 92, 9);
      text('Verify the complete route with a suitable navigation map.', 40, 75, 10);
      text(attribution, 40, 49, 9);
      const pageStream = commands.join('\n') + '\n';
      const pageId = objects.length + 1;
      pageIds.push(pageId);
      objects.push(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ' + (pageId + 1) + ' 0 R >>',
        '<< /Length ' + pageStream.length + ' >>\nstream\n' + pageStream + 'endstream',
      );
    };
    beginPage();
    directions.forEach((direction, index) => {
      const meters = Number.isFinite(direction.lengthMeters) && direction.lengthMeters >= 0
        ? Math.round(direction.lengthMeters) + ' m' : 'distance unavailable';
      const rows = wrap((index + 1) + '. [' + meters + '] ' + direction.instruction, 55);
      // Keep each instruction together when it fits on a fresh page.
      if (y < 115 + Math.min(rows.length - 1, 49) * 12) { finishPage(); beginPage(); }
      for (const line of rows) {
        if (y < 115) { finishPage(); beginPage(); }
        text(line, 40, y, 9);
        y -= 12;
      }
      y -= 8;
    });
    finishPage();
  }
  if (satellite) {
    validateSatellite(satellite);
    const savedCommands = [...commands];
    const imageId = objects.length + 1;
    // Hex encoding keeps the entire PDF ASCII; offsets remain byte-exact.
    let hex = '';
    for (const byte of satellite.jpegBytes) hex += byte.toString(16).padStart(2, '0');
    const imageStream = hex + '>\n';
    objects.push('<< /Type /XObject /Subtype /Image /Width ' + satellite.width + ' /Height ' + satellite.height +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ' +
      imageStream.length + ' >>\nstream\n' + imageStream + 'endstream');
    const guidePages: number[] = [];
    const addPage = () => {
      const body = commands.join('\n') + '\n';
      const id = objects.length + 1;
      guidePages.push(id);
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Satellite ' +
        imageId + ' 0 R >> >> /Contents ' + (id + 1) + ' 0 R >>',
        '<< /Length ' + body.length + ' >>\nstream\n' + body + 'endstream');
    };
    // Preserve a physical page 2 when this walk has no supplied turn directions.
    if (!hasDirections) {
      commands.length = 0;
      text('FindMyWalk / turn instructions', 40, 800, 18);
      text('Turn instructions are unavailable for this generated walk.', 40, 760);
      text('Use the GPX track and a suitable navigation map.', 40, 738);
      text(attribution, 40, 49, 9);
      const placeholderBody = commands.join('\n') + '\n';
      const id = objects.length + 1;
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ' +
        (id + 1) + ' 0 R >>', '<< /Length ' + placeholderBody.length + ' >>\nstream\n' + placeholderBody + 'endstream');
      pageIds.push(id);
    }
    commands.length = 0;
    text('FindMyWalk / satellite route map', 40, 800, 18);
    text('GPX track and numbered mapped places', 40, 777, 11);
    const imageWidth = Math.min(515, 340 * satellite.width / satellite.height);
    const imageHeight = imageWidth * satellite.height / satellite.width;
    const imageX = 40 + (515 - imageWidth) / 2;
    const imageY = 405 + (340 - imageHeight) / 2;
    const project = satelliteProjector(satellite.bounds || { west: 0, south: 0, east: 1, north: 1 }, imageX, imageY, imageWidth, imageHeight);
    const projectedRoute = route.geometry.coordinates.map(([lng, lat]) => project(lng, lat));
    if (!satellite.precomposed && projectedRoute.some(([x, y]) => x < imageX - 0.1 || x > imageX + imageWidth + 0.1 || y < imageY - 0.1 || y > imageY + imageHeight + 0.1))
      throw new Error('Satellite imagery does not cover the complete route.');
    commands.push('q ' + imageX + ' ' + imageY + ' ' + imageWidth + ' ' + imageHeight + ' re W n',
      'q ' + imageWidth + ' 0 0 ' + imageHeight + ' ' + imageX + ' ' + imageY + ' cm /Satellite Do Q');
    const path = projectedRoute.map(([x, y], i) => x.toFixed(2) + ' ' + y.toFixed(2) + (i ? ' l' : ' m')).join('\n');
    if (!satellite.precomposed) commands.push('1 1 1 RG 5 w', path, 'S', '0.02 0.25 0.85 RG 2.5 w', path, 'S');
    const places = (route.facilities?.places || []).slice(0, 150);
    const outside = new Set<number>();
    places.forEach((place, index) => {
      if (satellite.precomposed) return;
      if (!Number.isFinite(place.lng) || !Number.isFinite(place.lat)) { outside.add(index); return; }
      const [x, y] = project(place.lng, place.lat);
      if (x < imageX + 8 || x > imageX + imageWidth - 8 || y < imageY + 8 || y > imageY + imageHeight - 8) { outside.add(index); return; }
      commands.push('1 1 1 rg 0 0 0 RG 0.8 w ' + (x - 8).toFixed(2) + ' ' + (y - 8).toFixed(2) + ' 16 16 re B', '0 0 0 rg');
      text(String(index + 1), x - (index >= 99 ? 6 : index >= 9 ? 4 : 2), y - 3, 8);
    });
    commands.push('Q', '0 0 0 rg');
    wrap('Imagery: ' + satellite.attribution, 90).slice(0, 2).forEach((line, i) => text(line, 40, 390 - i * 11, 8));
    if (satellite.capturedAt) text('Imagery date supplied by provider: ' + satellite.capturedAt.slice(0, 40), 40, 365, 8);
    let tableY = 325;
    text('Mapped places / contact details', 40, 345, 12);
    text('No.  Place / category', 40, tableY, 9);
    text('Mapped contact details', 285, tableY, 9);
    tableY -= 18;
    const tableHeader = () => {
      commands.length = 0;
      text('FindMyWalk / mapped places continued', 40, 800, 18);
      text('Numbering matches the satellite map on page 3.', 40, 777, 10);
      text('No.  Place / category', 40, 750, 9);
      text('Mapped contact details', 285, 750, 9);
      tableY = 732;
    };
    const footer = () => {
      wrap(proximity, 85).forEach((line, i) => text(line, 40, 78 - i * 11, 8));
      text('Contacts are mapped source data; availability and opening are unverified.', 40, 49, 8);
      text(attribution, 40, 32, 8);
    };
    if (!places.length) text('No mapped place details available; this does not mean none exist.', 40, tableY, 10);
    places.forEach((place, index) => {
      const left = wrap((index + 1) + '. ' + place.name + (place.category ? ' / ' + place.category.replaceAll('_', ' ') : '') +
        (outside.has(index) ? ' [outside imagery]' : ''), 30);
      const right = [place.phone ? 'Phone: ' + place.phone : 'Phone: not mapped',
        place.website ? 'Web: ' + place.website : 'Web: not mapped',
        place.email ? 'Email: ' + place.email : 'Email: not mapped'].flatMap(line => wrap(line, 38));
      const rows = Math.max(left.length, right.length);
      if (tableY < 110 + Math.min(rows - 1, 54) * 11) { footer(); addPage(); tableHeader(); }
      for (let row = 0; row < rows; row++) {
        if (tableY < 110) { footer(); addPage(); tableHeader(); }
        if (left[row]) text(left[row], 40, tableY, 8);
        if (right[row]) text(right[row], 285, tableY, 8);
        tableY -= 11;
      }
      tableY -= 10;
    });
    if ((route.facilities?.places?.length || 0) > places.length) {
      if (tableY < 125) { footer(); addPage(); tableHeader(); }
      text('Contact table capped at 150 mapped places; additional places omitted.', 40, tableY, 9);
    }
    const supplemental = route.facilities?.nearbyPlaces || [];
    if (supplemental.length) {
      if (tableY < 175) { footer(); addPage(); tableHeader(); }
      text('Other Collingham cafe listings - approximate positions', 40, tableY, 10);
      tableY -= 16;
      text('Not numbered on the satellite map or included in the 100 m route count.', 40, tableY, 8);
      tableY -= 16;
      for (const place of supplemental) {
        const lines = [
          place.name + (place.address ? ' - ' + place.address : ''),
          place.statusNote || 'Location and opening should be checked.',
          'Source checked ' + (place.verifiedAt || 'date unavailable') + ': ' + (place.sourceUrl || 'Collingham village guide'),
        ].flatMap(line => wrap(line, 84));
        if (tableY < 110 + Math.min(lines.length - 1, 54) * 11) { footer(); addPage(); tableHeader(); }
        for (const line of lines) {
          if (tableY < 110) { footer(); addPage(); tableHeader(); }
          text(line, 40, tableY, 8);
          tableY -= 11;
        }
        tableY -= 7;
      }
    }
    footer(); addPage();
    // The first satellite page is always physical page 3. Contacts overflow
    // immediately after it; remaining turn instruction pages then follow.
    pageIds.splice(2, 0, ...guidePages);
    commands.splice(0, commands.length, ...savedCommands);
  }
  if (extraFacilityLines.length) {
    commands.length = 0;
    let noteY = 765;
    const addNotesPage = () => {
      const body = commands.join('\n') + '\n';
      const id = objects.length + 1;
      pageIds.push(id);
      objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ' +
        (id + 1) + ' 0 R >>', '<< /Length ' + body.length + ' >>\nstream\n' + body + 'endstream');
      commands.length = 0;
    };
    const heading = () => { text('FindMyWalk / additional place notes', 40, 800, 16); noteY = 765; };
    heading();
    for (const line of extraFacilityLines) {
      if (noteY < 90) { text(attribution, 40, 49, 9); addNotesPage(); heading(); }
      text(line, 40, noteY, 9);
      noteY -= 12;
    }
    text(attribution, 40, 49, 9);
    addNotesPage();
  }
  objects[1] = '<< /Type /Pages /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] /Count ' + pageIds.length + ' >>';
  const objectCount = objects.length + 1;
  let output = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => { offsets.push(output.length); output += (i + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = output.length;
  output += 'xref\n0 ' + objectCount + '\n0000000000 65535 f \n' +
    offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + objectCount + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Blob([output], { type: 'application/pdf' });
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the download before revoking the Blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
export function downloadGeneratedGpx(route: GeneratedExportRoute): void {
  download(generatedGpxBlob(route), generatedFilename(route.title, 'gpx'));
}
export function downloadGeneratedPdf(route: GeneratedExportRoute, options: GeneratedPdfOptions = {}): void {
  download(generatedPdfBlob(route, undefined, options), generatedFilename(route.title, 'pdf'));
}


/** Supply imagery returned by the authorized server adapter; no provider key is needed here. */
export async function generatedPdfBlobWithSatellite(route: GeneratedExportRoute, image: GeneratedSatelliteImage | Promise<GeneratedSatelliteImage>, options: GeneratedPdfOptions = {}): Promise<Blob> {
  return generatedPdfBlob(route, await image, options);
}
export async function downloadGeneratedPdfWithSatellite(route: GeneratedExportRoute, image: GeneratedSatelliteImage | Promise<GeneratedSatelliteImage>, options: GeneratedPdfOptions = {}): Promise<void> {
  download(await generatedPdfBlobWithSatellite(route, image, options), generatedFilename(route.title, 'pdf'));
}
