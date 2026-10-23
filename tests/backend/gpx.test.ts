import {describe,it,expect,vi} from 'vitest';
vi.mock('next/headers',()=>({cookies:vi.fn()}));
import {importGpx,exportGpx} from '../../lib/server/gpx';
const xml='<gpx><trk><name>River &amp; meadow</name><trkseg><trkpt lat="53" lon="-0.7"/><trkpt lat="53" lon="-0.7"/><trkpt lat="53.01" lon="-0.7"/></trkseg></trk></gpx>';
describe('GPX boundary',()=>{
 it('imports track order, removes adjacent duplicates and estimates distance',()=>{const r=importGpx(xml);expect(r.geometry.coordinates).toEqual([[-.7,53],[-.7,53.01]]);expect(r.distanceMeters).toBeGreaterThan(1100);expect(r.distanceMeters).toBeLessThan(1120);expect(r.waypoints).toHaveLength(2)});
 it('imports namespaced route points',()=>{expect(importGpx('<g:gpx xmlns:g="x"><g:rte><g:rtept lat="53" lon="0"/><g:rtept lat="54" lon="0"/></g:rte></g:gpx>').geometry.coordinates).toHaveLength(2)});
 it('rejects DTDs, malformed files, missing coordinates and disjoint segments',()=>{for(const text of ['<!DOCTYPE gpx [<!ENTITY a SYSTEM "file:///etc/passwd">]><gpx/>','<gpx>','<gpx><rte><rtept lat="53"/><rtept lat="54" lon="0"/></rte></gpx>','<gpx><trk><trkseg><trkpt lat="53" lon="0"/></trkseg><trkseg><trkpt lat="54" lon="0"/></trkseg></trk></gpx>'])expect(()=>importGpx(text)).toThrow()});
 it('escapes XML title and round trips geometry',()=>{const r=importGpx(xml);const out=exportGpx({...r,title:'<River> & "Meadow"'});expect(out).toContain('&lt;River&gt; &amp; &quot;Meadow&quot;');expect(importGpx(out).geometry.coordinates).toEqual(r.geometry.coordinates)});
});

