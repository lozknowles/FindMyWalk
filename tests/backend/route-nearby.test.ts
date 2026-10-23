import {beforeEach,describe,it,expect,vi} from 'vitest';
const {query,route}=vi.hoisted(()=>({query:vi.fn(),route:vi.fn()}));
vi.mock('../../lib/server/core',async()=>{const actual=await vi.importActual<typeof import('../../lib/server/core')>('../../lib/server/core');return {...actual,db:()=>({query})}});
vi.mock('../../lib/server/route-engine',()=>({routePedestrian:route}));
import {discoverNearbyPlaces} from '../../lib/server/route-nearby';
const geometry:[number,number][]=[[-.76047,53.14499],[-.7608,53.14336]];
const source='https://docs.overturemaps.org/guides/places/';
function candidate(name:string,id:string,lng:number,lat:number,straight_m:number){return {source:'overture',id,name,category:'cafe',lng,lat,straight_m,entry_lng:-.76047,entry_lat:53.14499,url:source,release:'2026-10-21.0',confidence:.9}}
beforeEach(()=>{query.mockReset();route.mockReset()});
describe('geographic food detours',()=>{
 it('finds named cafes without name-specific branches and measures an out-and-back walk',async()=>{
  const rows=[candidate('Beyond Coffee Collingham','first',-.75762493,53.14597125,219),candidate('The Allotment Kitchen And Deli','second',-.7501196,53.144838,693)];
  query.mockResolvedValueOnce({rows}).mockResolvedValueOnce({rows:[{source_release:'2026-10-21.0',covered:true}]});
  route.mockImplementation(async([start,end,last]:[number,number][])=>({geometry:{coordinates:[start,end,last]},distanceMeters:end[0]<-.755?480:1560,durationMinutes:end[0]<-.755?6:20}));
  const result=await discoverNearbyPlaces(geometry,[]);
  expect(result.status).toBe('available');
  expect(result.places.map(p=>p.name)).toEqual(['Beyond Coffee Collingham','The Allotment Kitchen And Deli']);
  expect(result.places.map(p=>p.detourMeters)).toEqual([480,1560]);
  expect(query.mock.calls[0][0]).toContain('ST_DWithin');
  expect(query.mock.calls[0][0]).not.toContain('Beyond Coffee');
 });
 it('deduplicates nearby mapped records and drops disconnected or badly snapped points',async()=>{
  const rows=[candidate('Beyond Coffee Collingham','first',-.75762493,53.14597125,219),candidate('The Allotment Kitchen And Deli','second',-.7501196,53.144838,693)];
  query.mockResolvedValueOnce({rows}).mockResolvedValueOnce({rows:[{source_release:'2026-10-21.0',covered:true}]});
  route.mockResolvedValue({geometry:{coordinates:[[1,1],[-.7501196,53.144838],[1,1]]},distanceMeters:400,durationMinutes:5});
  const mapped=[{id:'osm:1',name:'Beyond Coffee',category:'cafe',group:'cafe' as const,lat:53.14597125,lng:-.75762493,distanceMeters:20,progress:0,url:'https://openstreetmap.org'}];
  const result=await discoverNearbyPlaces(geometry,mapped);
  expect(result.places).toEqual([]);
  expect(route).toHaveBeenCalledTimes(1);
 });
 it('does not suggest a cafe when pedestrian routing cannot connect it',async()=>{
  query.mockResolvedValueOnce({rows:[candidate('Riverside Cafe','across-river',-.758,53.145,180)]})
    .mockResolvedValueOnce({rows:[{source_release:'2026-10-21.0',covered:true}]});
  route.mockRejectedValueOnce(new (await import('../../lib/server/core')).ApiError(422,'No pedestrian route','NO_PEDESTRIAN_ROUTE'));
  const result=await discoverNearbyPlaces(geometry,[]);
  expect(result.status).toBe('available');
  expect(result.places).toEqual([]);
 });
 it('keeps distinct businesses sharing a common word',async()=>{
  const rows=[candidate('Central Coffee','central',-.7576,53.1459,210),candidate('Riverside Coffee','riverside',-.75761,53.14591,212)];
  query.mockResolvedValueOnce({rows}).mockResolvedValueOnce({rows:[{source_release:'2026-10-21.0',covered:true}]});
  route.mockImplementation(async([start,end,last]:[number,number][])=>({geometry:{coordinates:[start,end,last]},distanceMeters:500,durationMinutes:6}));
  expect((await discoverNearbyPlaces(geometry,[])).places.map(p=>p.name)).toEqual(['Central Coffee','Riverside Coffee']);
 });
 it('marks routing outages unavailable and mixed results partial',async()=>{
  const rows=[candidate('Central Coffee','central',-.7576,53.1459,210),candidate('Riverside Coffee','riverside',-.75761,53.14591,212)];
  query.mockResolvedValueOnce({rows}).mockResolvedValueOnce({rows:[{source_release:'2026-10-21.0',covered:true}]});
  route.mockRejectedValueOnce(new Error('timeout')).mockImplementationOnce(async([start,end,last]:[number,number][])=>({geometry:{coordinates:[start,end,last]},distanceMeters:500,durationMinutes:6}));
  const result=await discoverNearbyPlaces(geometry,[]);
  expect(result.status).toBe('partial');expect(result.places).toHaveLength(1);
 });
 it('cancels queued routing promptly without dispatching a late request',async()=>{
  const rows=[candidate('Queued Coffee','one',-.7576,53.1459,210)];
  query.mockImplementation(async sql=>({rows:sql.includes('overture_extracts')?[{source_release:'2026-10-21.0',covered:true}]:rows}));
  const finish:((value:unknown)=>void)[]=[];
  route.mockImplementation(()=>new Promise(resolve=>finish.push(resolve)));
  const active=[0,1,2].map(()=>discoverNearbyPlaces(geometry,[]));
  for(let i=0;i<20&&route.mock.calls.length<3;i++)await new Promise(resolve=>setTimeout(resolve,0));
  expect(route).toHaveBeenCalledTimes(3);
  const cancel=new AbortController();
  const queued=discoverNearbyPlaces(geometry,[],cancel.signal);
  for(let i=0;i<10&&query.mock.calls.length<8;i++)await new Promise(resolve=>setTimeout(resolve,0));
  cancel.abort();
  const result=await Promise.race([queued,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('queued cancellation stalled')),100))]);
  expect(result.status).toBe('unavailable');
  expect(route).toHaveBeenCalledTimes(3);
  finish.forEach(resolve=>resolve({geometry:{coordinates:[geometry[0],[-.7576,53.1459],geometry[0]]},distanceMeters:500,durationMinutes:6}));
  await Promise.all(active);
  expect(route).toHaveBeenCalledTimes(3);
 });
 it('preserves completed detours as partial when later routing is cancelled',async()=>{
  const rows=[candidate('First Coffee','one',-.7576,53.1459,210),candidate('Second Coffee','two',-.7577,53.1458,220)];
  query.mockResolvedValueOnce({rows}).mockResolvedValueOnce({rows:[{source_release:'2026-10-21.0',covered:true}]});
  route.mockImplementationOnce(async([start,end,last]:[number,number][])=>({geometry:{coordinates:[start,end,last]},distanceMeters:500,durationMinutes:6}))
    .mockImplementationOnce((_,__,signal:AbortSignal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
  const cancel=new AbortController();
  const pending=discoverNearbyPlaces(geometry,[],cancel.signal);
  for(let i=0;i<20&&route.mock.calls.length<2;i++)await new Promise(resolve=>setTimeout(resolve,0));
  cancel.abort();
  const result=await pending;
  expect(result.status).toBe('partial');
  expect(result.places.map(p=>p.name)).toEqual(['First Coffee']);
 });
 it('marks provider failure unavailable rather than claiming no cafes',async()=>{
  query.mockRejectedValueOnce(new Error('index unavailable'));
  expect(await discoverNearbyPlaces(geometry,[])).toMatchObject({places:[],status:'unavailable'});
 });
});
