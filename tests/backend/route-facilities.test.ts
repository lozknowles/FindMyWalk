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
