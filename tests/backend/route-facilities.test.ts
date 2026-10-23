import {beforeEach,describe,it,expect,vi} from 'vitest';
const {query}=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../../lib/server/core',async()=>{const actual=await vi.importActual<typeof import('../../lib/server/core')>('../../lib/server/core');return {...actual,db:()=>({query})}});
vi.mock('next/headers',()=>({cookies:vi.fn()}));
import {routeFacilities} from '../../lib/server/route-facilities';
const feature={osm_type:'node',osm_id:'1',name:'Mapped cafe',category:'cafe',lat:53.14,lng:-.86,distance_m:12,progress:.5};
beforeEach(()=>query.mockReset());
function rows(contact:Record<string,unknown>){query.mockResolvedValueOnce({rows:[{...feature,...contact}]}).mockResolvedValueOnce({rows:[{covered:true,source_timestamp:'2026-10-22'}]})}
describe('mapped route contacts',()=>{
 it('retains bounded contacts and keeps the OSM source URL',async()=>{
  rows({phone:' +44 1234 567890 ',website:'https://example.org/contact',email:'walks@example.org'});
  const result=await routeFacilities([[-.86,53.14],[-.85,53.15]]);
  expect(result.places[0]).toMatchObject({phone:'+44 1234 567890',website:'https://example.org/contact',email:'walks@example.org',url:'https://www.openstreetmap.org/node/1'});
 });
 it('leaves unmapped contacts null and supports an older DB schema',async()=>{
  rows({});const result=await routeFacilities([[-.86,53.14],[-.85,53.15]]);
  expect(result.places[0]).toMatchObject({phone:null,website:null,email:null});
  expect(query.mock.calls[0][0]).toContain("to_jsonb(p)->>'phone'");
 });
 it.each(['javascript:alert(1)','https://user:password@example.org','https://example.org/\\evil','https://example.org/with space','https://example.org/'+ 'x'.repeat(2048)])('rejects unsafe website %s',async website=>{
  rows({website,phone:'x'.repeat(101),email:'bad@example.org;evil@example.org'});
  const result=await routeFacilities([[-.86,53.14],[-.85,53.15]]);
  expect(result.places[0]).toMatchObject({phone:null,website:null,email:null});
 });
});

describe('reviewed Collingham cafe listings',()=>{
 const route:[number,number][]=[[-.76047,53.14499],[-.7608,53.14336]];
 it('shows both cafes separately without inflating the 100 m OSM count',async()=>{
  query.mockResolvedValueOnce({rows:[{...feature,name:'Royal Oak',category:'pub',lat:53.144991,lng:-.760471,distance_m:13}]})
   .mockResolvedValueOnce({rows:[{covered:true,source_timestamp:'2026-10-20'}]});
  const result=await routeFacilities(route);
  expect(result.counts).toMatchObject({pub:1,cafe:0});
  expect(result.nearbyPlaces?.map(place=>place.name)).toEqual(['Beyond Coffee','The Allotment']);
  expect(result.nearbyPlaces?.map(place=>place.positionQuality)).toEqual(['approximate','site']);
  expect(result.nearbyPlaces?.every(place=>place.source==='collingham-guide'&&Boolean(place.sourceUrl))).toBe(true);
  expect(result.places).toHaveLength(1);
 });
 it('suppresses a local listing when the same cafe is mapped at the same site',async()=>{
  query.mockResolvedValueOnce({rows:[{...feature,name:'Beyond Coffee',category:'cafe',lat:53.145808,lng:-.76015,distance_m:55}]})
   .mockResolvedValueOnce({rows:[{covered:true,source_timestamp:'2026-10-20'}]});
  const result=await routeFacilities(route);
  expect(result.counts.cafe).toBe(1);
  expect(result.nearbyPlaces?.map(place=>place.name)).toEqual(['The Allotment']);
 });
 it('does not show Collingham listings on a route elsewhere',async()=>{
  query.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{covered:true,source_timestamp:'2026-10-20'}]});
  const result=await routeFacilities([[-1.2,53.1],[-1.19,53.11]]);
  expect(result.nearbyPlaces).toEqual([]);
 });
});
