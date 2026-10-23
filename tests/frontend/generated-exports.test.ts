import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { generatedFilename, generatedGpxBlob, generatedPdfBlob, downloadGeneratedGpx, downloadGeneratedPdf, generatedPdfBlobWithSatellite, type GeneratedSatelliteImage, type GeneratedExportRoute } from '../../lib/client/generated-exports';

const route: GeneratedExportRoute = {
  title: 'Riverside & <wood> "walk" (test) \\ café',
  geometry: { type: 'LineString', coordinates: [[-0.75, 53.1], [-0.74, 53.11], [-0.75, 53.1]] },
  distanceMeters: 5432, durationMinutes: 67.2,
  start: { lat: 53.1, lng: -0.75, label: 'Village & green' }, targetKm: 5,
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
describe('generated route exports', () => {
  it('exports valid escaped GPX with original coordinates and actual route statistics', async () => {
    const blob = generatedGpxBlob(route);
    expect(blob.type).toContain('application/gpx+xml');
    const xml = await blob.text();
    expect(XMLValidator.validate(xml)).toBe(true);
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    expect(parsed.gpx.trk.name).toBe(route.title);
    expect(parsed.gpx.trk.trkseg.trkpt).toHaveLength(3);
    expect(parsed.gpx.trk.trkseg.trkpt[0]['@_lat']).toBe('53.1');
    expect(parsed.gpx.trk.trkseg.trkpt[0]['@_lon']).toBe('-0.75');
    expect(parsed.gpx.metadata.desc).toContain('5.43 km');
    expect(parsed.gpx.metadata.desc).toContain('67 minutes');
    expect(parsed.gpx.metadata.desc).toContain('OpenStreetMap contributors');
    expect(parsed.gpx.metadata.desc).toContain('Check access rights');
    expect(XMLValidator.validate(await generatedGpxBlob({ ...route, title: 'bad\u0000\ud800title' }).text())).toBe(true);
  });
  it('creates a PDF with correct object offsets, escaped labels, geometry and attribution', async () => {
    const blob = generatedPdfBlob(route);
    expect(blob.type).toBe('application/pdf');
    const pdf = await blob.text();
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offsets = [...pdf.matchAll(/(\d{10}) 00000 n /g)].map(match => Number(match[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((offset, i) => expect(pdf.slice(offset)).toMatch(new RegExp('^' + (i + 1) + ' 0 obj')));
    const stream = pdf.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/);
    expect(Number(stream?.[1])).toBe(stream?.[2].length);
    expect(pdf).toContain('Distance: 5.43 km');
    expect(pdf).toContain('67 minutes');
    expect(pdf).toContain('OpenStreetMap contributors');
    expect(pdf).toContain('Check access rights');
    expect(pdf).toContain(' l\n');
    expect(pdf).not.toMatch(/NaN|Infinity/);
    const special = await generatedPdfBlob({ ...route, title: 'test (brackets) \\ café' }).text();
    expect(special).toContain('test \\(brackets\\) \\\\ cafe');
  });
  it('includes mapped place counts, source date and proximity limits in both exports', async () => {
    const withPlaces = { ...route, facilities: { counts: { pub: 2, cafe: 3, landmark: 1 }, sourceTimestamp: '2026-10-22T16:00:00Z', coverage: 'partial' as const, truncated: true } };
    for (const blob of [generatedPdfBlob(withPlaces), generatedGpxBlob(withPlaces)]) {
      const content = await blob.text();
      expect(content).toContain('Mapped places near this walk');
      expect(content).toContain('2 pubs; 3 cafes / food; 1 landmarks mapped within 100 m');
      expect(content).toContain('2026-10-22');
      expect(content).toContain('Proximity does not establish access');
      expect(content).toContain('opening hours');
      expect(content).toContain('detour.');
      expect(content).toContain('Results may be incomplete');
    }
    const noPlaces = await generatedPdfBlob({ ...route, facilities: { counts: { pub: 0, cafe: 0, landmark: 0 }, sourceTimestamp: null } }).text();
    expect(noPlaces).toContain('facilities may');
    expect(noPlaces).not.toContain('Map source date');
    expect(await generatedPdfBlob(route).text()).toContain('Nearby mapped places unavailable.');
  });
  it('keeps long zero-count place notes clear of the first-page footer', async () => {
    const pdf = await generatedPdfBlob({ ...route, facilities: {
      counts: { pub: 0, cafe: 0, landmark: 0 }, sourceTimestamp: '2026-10-20T20:23:47Z',
      coverage: 'partial', truncated: true,
      nearbyPlaces: [
        { id: 'local:one', name: 'Beyond Coffee', category: 'cafe', lat: 53.1458, lng: -0.7601, address: 'High Street, Collingham', sourceUrl: 'https://example.test/one', verifiedAt: '2026-10-23', statusNote: 'Check opening.' },
        { id: 'local:two', name: 'The Allotment', category: 'cafe', lat: 53.145, lng: -0.7493, address: 'Green Way, Collingham', sourceUrl: 'https://example.test/two', verifiedAt: '2026-10-23', statusNote: 'Check opening.' },
      ],
    } }).text();
    expect(pdf).toContain('/Count 2');
    const streams = [...pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)];
    expect(streams).toHaveLength(2);
    expect(streams[0][2]).toContain('Additional place notes follow');
    expect(streams[0][2]).not.toContain('Also in Collingham');
    expect(streams[1][2]).toContain('Beyond Coffee; The Allotment');
    expect(streams[1][2]).toContain('No mapped places found');
    const firstPageNotes = [...streams[0][2].matchAll(/40 (\d+) Td \([^)]*(?:cafes \/ food|Proximity|Results may|Map source|mapped places found)[^)]*\)/g)];
    expect(firstPageNotes.every(match => Number(match[1]) >= 91)).toBe(true);
  });
  it('paginates every supplied direction and its full text with valid PDF offsets', async () => {
    const directions = Array.from({ length: 30 }, (_, i) => ({ instruction: i === 0 ? 'Turn left (signed footpath)' : 'Continue straight on the mapped path. '.repeat(12) + 'Unique instruction tail ' + i, lengthMeters: 120 + i }));
    const pdf = await generatedPdfBlob({ ...route, directions }).text();
    const pageCount = Number(pdf.match(/\/Count (\d+)/)?.[1]);
    expect(pageCount).toBeGreaterThan(2);
    expect(pdf.match(/MediaBox \[0 0 595 842\]/g)).toHaveLength(pageCount);
    expect(pdf).toContain('Computer-generated directions; verify signs and access.');
    for (let i = 0; i < directions.length; i++) expect(pdf).toContain((i + 1) + '. [' + (120 + i) + ' m]');
    const textRows = [...pdf.matchAll(/\((.*)\) Tj ET/g)].map(match => match[1]).join(' ');
    expect(textRows).toContain('Unique instruction tail 29');
    expect(pdf).not.toContain('some turns omitted');
    expect(pdf).not.toContain('shortened');
    expect(pdf).toContain('Route sketch - north up');
    const offsets = [...pdf.matchAll(/(\d{10}) 00000 n /g)].map(match => Number(match[1]));
    expect(offsets).toHaveLength(5 + (pageCount - 1) * 2);
    offsets.forEach((offset, i) => expect(pdf.slice(offset)).toMatch(new RegExp('^' + (i + 1) + ' 0 obj')));
    const streams = [...pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)];
    expect(streams).toHaveLength(pageCount);
    for (const stream of streams) expect(Number(stream[1])).toBe(stream[2].length);
    const xref = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    expect(await generatedPdfBlob({ ...route, directions: [] }).text()).toContain('/Count 1');
  });
  it('exports all 500 permitted instructions and discloses a true upstream cap', async () => {
    const directions = Array.from({ length: 500 }, (_, i) => ({ instruction: 'Turn instruction ' + (i + 1), lengthMeters: i }));
    const pdf = await generatedPdfBlob({ ...route, directions }).text();
    expect(pdf).toContain('500. [499 m] Turn instruction 500');
    expect(pdf).not.toContain('Directions incomplete');
    expect(await generatedPdfBlob({ ...route, directions, directionsTruncated: true }).text()).toContain('Directions incomplete: upstream safety limit reached; some turns omitted.');
  });
  it('adds attributed satellite imagery on physical page 3 with numbered contacts and complete directions', async () => {
    const image: GeneratedSatelliteImage = {
      jpegBytes: new Uint8Array(readFileSync(new URL('./fixtures/satellite-fixture.jpg', import.meta.url))),
      width: 600, height: 400, bounds: { west: -0.76, south: 53.09, east: -0.73, north: 53.12 },
      attribution: 'Fixture imagery for tests only', capturedAt: '2026-10-23',
    };
    const places = Array.from({ length: 12 }, (_, i) => ({
      id: 'node/' + i, name: 'Mapped pub ' + (i + 1), lat: 53.101 + i * 0.001, lng: -0.749,
      category: 'pub', phone: i === 0 ? '+44 1234 567890' : null, website: i === 0 ? 'https://example.test/pub' : null, email: null,
    }));
    const withGuide = { ...route, directions: Array.from({ length: 80 }, (_, i) => ({ instruction: 'Walk instruction ' + (i + 1), lengthMeters: 100 })),
      facilities: { counts: { pub: 12, cafe: 0, landmark: 0 }, places } };
    const pdf = await (await generatedPdfBlobWithSatellite(withGuide, Promise.resolve(image))).text();
    const kids = pdf.match(/\/Kids \[([^\]]+)\]/)?.[1].match(/\d+ 0 R/g) || [];
    expect(kids.length).toBeGreaterThan(4);
    const page3Id = Number(kids[2].split(' ')[0]);
    const page3 = pdf.slice(pdf.indexOf(page3Id + ' 0 obj'));
    const contentId = Number(page3.match(/\/Contents (\d+) 0 R/)?.[1]);
    const page3Body = pdf.slice(pdf.indexOf(contentId + ' 0 obj'));
    expect(page3Body.slice(0, page3Body.indexOf('endstream'))).toContain('satellite route map');
    expect(pdf).toContain('/Subtype /Image /Width 600 /Height 400');
    expect(pdf).toContain('/Filter [/ASCIIHexDecode /DCTDecode]');
    expect(pdf).toContain('/Satellite Do');
    expect(pdf).toContain('GPX track and numbered mapped places');
    expect(pdf).toContain('Fixture imagery for tests only');
    expect(pdf).toContain('mapped places continued');
    expect(pdf).toContain('12. Mapped pub 12');
    expect(pdf).toContain('Phone: +44 1234 567890');
    expect(pdf).toContain('Web: https://example.test/pub');
    expect(pdf).toContain('Email: not mapped');
    expect(pdf).toContain('80. [100 m] Walk instruction 80');
    const offsets = [...pdf.matchAll(/(\d{10}) 00000 n /g)].map(match => Number(match[1]));
    offsets.forEach((offset, i) => expect(pdf.slice(offset)).toMatch(new RegExp('^' + (i + 1) + ' 0 obj')));
    for (const stream of pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)) expect(Number(stream[1])).toBe(stream[2].length);
    expect(() => generatedPdfBlob(route, { ...image, bounds: { west: 10, east: 11, south: 20, north: 21 } })).toThrow('cover the complete route');
    expect(() => generatedPdfBlob(route, { ...image, jpegBytes: new Uint8Array([0, 1, 2]) })).toThrow();
    const noDirectionsPdf = await generatedPdfBlob(route, image).text();
    expect(noDirectionsPdf).toContain('/Count 3');
    expect(noDirectionsPdf).toContain('Turn instructions are unavailable');
  });
  it('keeps approximate village cafes outside precise counts and satellite numbering', async () => {
    const image: GeneratedSatelliteImage = {
      jpegBytes: new Uint8Array(readFileSync(new URL('./fixtures/satellite-fixture.jpg', import.meta.url))),
      width: 600, height: 400, precomposed: true, attribution: 'Fixture satellite provider',
    };
    const withLocal = { ...route, facilities: {
      counts: { pub: 5, cafe: 0, landmark: 0 }, places: [
        { id:'osm:oak',name:'Royal Oak',lat:53.101,lng:-.749,category:'pub' },
        { id:'osm:kings',name:"King's Head",lat:53.102,lng:-.748,category:'pub' },
        { id:'osm:three',name:'Pub Three',lat:53.103,lng:-.747,category:'pub' },
        { id:'osm:four',name:'Pub Four',lat:53.104,lng:-.746,category:'pub' },
        { id:'osm:five',name:'Pub Five',lat:53.105,lng:-.745,category:'pub' },
      ],
      nearbyPlaces: [
        { id:'collingham:beyond-coffee',name:'Beyond Coffee',lat:53.145808,lng:-.76015,address:'High Street, Collingham',positionQuality:'approximate' as const,verifiedAt:'2026-10-23',sourceUrl:'https://example.test/beyond',statusNote:'Confirm entrance and opening.' },
        { id:'collingham:the-allotment',name:'The Allotment',lat:53.14502,lng:-.749303,address:'Gusto House, Collingham',positionQuality:'site' as const,verifiedAt:'2026-10-23',sourceUrl:'https://example.test/allotment',statusNote:'Site point, not entrance.' },
      ],
    } };
    const standard=await generatedPdfBlob(withLocal).text();
    const satellite=await generatedPdfBlob(withLocal,image).text();
    expect(standard).toContain('0 cafes / food');
    expect(standard).toContain('Beyond Coffee; The Allotment');
    expect(satellite).toContain('Other Collingham cafe listings');
    expect(satellite).toContain('Not numbered on the satellite map');
    expect(satellite).toContain('Beyond Coffee');
    expect(satellite).toContain('The Allotment');
    expect(satellite).toContain('Confirm entrance and opening.');
    expect(satellite).toContain('Collingham listings continued');
    const continuation = satellite.slice(satellite.indexOf('Collingham listings continued'));
    expect(continuation.slice(0, continuation.indexOf('endstream'))).not.toContain('Numbering matches the satellite map');
    expect(continuation).toContain('The Allotment');
  });
  it('supports precomposed adapter imagery, guide planning box, and only a verified saved-page QR', async () => {
    const image: GeneratedSatelliteImage = {
      jpegBytes: new Uint8Array(readFileSync(new URL('./fixtures/satellite-fixture.jpg', import.meta.url))),
      width: 600, height: 400, precomposed: true, attribution: 'Fixture satellite provider',
    };
    const pdf = await generatedPdfBlob(route, image, { format: 'guide', savedWalk: {
      url: 'https://walks.example.test/walks/saved-123', publicOrigin: 'https://walks.example.test', published: true, visibility: 'unlisted',
    } }).text();
    expect(pdf).toContain('Plan your walk');
    expect(pdf).toContain('Saved walk webpage');
    expect(pdf).toContain('/Satellite Do');
    expect(pdf).not.toContain('0.02 0.25 0.85 RG');
    expect(await generatedPdfBlob(route, undefined, { format: 'guide' }).text()).not.toContain('Saved walk webpage');
    for (const url of ['https://evil.test/walks/saved-123', 'https://walks.example.test/create', 'https://walks.example.test/walks/saved-123?token=private']) {
      expect(await generatedPdfBlob(route, undefined, { savedWalk: { url, publicOrigin: 'https://walks.example.test', published: true, visibility: 'unlisted' } }).text()).not.toContain('Saved walk webpage');
    }
  });
  it('handles degenerate and antimeridian route sketches without invalid numbers', async () => {
    for (const coordinates of [[[1, 2], [1, 2]], [[179.99, 2], [-179.99, 2.01]]]) {
      expect(await generatedPdfBlob({ ...route, geometry: { type: 'LineString', coordinates } }).text()).not.toMatch(/NaN|Infinity/);
    }
  });
  it('rejects invalid routes and uses bounded safe filenames', () => {
    for (const geometry of [{ type: 'LineString' as const, coordinates: [] }, { type: 'LineString' as const, coordinates: [[NaN, 1], [2, 3]] }]) {
      expect(() => generatedGpxBlob({ ...route, geometry })).toThrow();
      expect(() => generatedPdfBlob({ ...route, geometry })).toThrow();
    }
    expect(() => generatedPdfBlob({ ...route, distanceMeters: -1 })).toThrow();
    expect(generatedFilename('../../CON:\u0000' + 'x'.repeat(300), 'pdf')).toMatch(/^findmywalk-[a-z0-9-]{1,80}\.pdf$/);
    expect(generatedFilename('🌳', 'gpx')).toBe('findmywalk-generated-walk.gpx');
  });
  it('clicks actual Blob downloads and cleans up anchors and object URLs', () => {
    vi.useFakeTimers();
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:generated-route');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    downloadGeneratedGpx(route);
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(anchor.download).toMatch(/\.gpx$/);
    downloadGeneratedPdf(route);
    expect(anchor.download).toMatch(/\.pdf$/);
    expect(anchor.click).toHaveBeenCalledTimes(2);
    expect(anchor.remove).toHaveBeenCalledTimes(2);
    expect(appendChild).toHaveBeenCalledTimes(2);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
