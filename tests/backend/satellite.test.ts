import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({cookies:vi.fn()}));
import {satelliteImage,satelliteRequest} from '../../lib/server/satellite';
import {GET,POST} from '../../app/api/satellite/route';
const request={geometry:{type:'LineString',coordinates:[[-.86,53.14],[-.85,53.15]]},facilities:[{coordinate:[-.855,53.145],number:12}]};
beforeEach(()=>{vi.stubEnv('ARCGIS_STATIC_MAPS_KEY','test-secret');vi.stubEnv('PUBLIC_ORIGIN','http://localhost');vi.stubEnv('WRITES_ENABLED','true');vi.stubGlobal('fetch',vi.fn())});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
describe('licensed satellite map adapter',()=>{
 it('requires configured provider without a request',async()=>{
  vi.stubEnv('ARCGIS_STATIC_MAPS_KEY','');
  await expect(satelliteImage(satelliteRequest(request))).rejects.toMatchObject({code:'SATELLITE_NOT_CONFIGURED',status:503});
  expect(fetch).not.toHaveBeenCalled();
 });
 it('composes route and numbered facilities with attribution at fixed provider',async()=>{
  vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}}));
  const image=await satelliteImage(satelliteRequest({...request,url:'https://attacker.invalid',token:'client-token'}));
  expect(image[0]).toBe(255);
  const [url,options]=vi.mocked(fetch).mock.calls[0];
  expect(url).toBe('https://static-maps-api.arcgis.com/arcgis/rest/services/static-maps-service/v1/static-maps/arcgis/imagery/with-overlay');
  expect(options).toMatchObject({redirect:'error',headers:{Authorization:'Bearer test-secret'}});
  const body=JSON.parse(options!.body as string);
  expect(body.image).toMatchObject({format:'jpeg',attribution:'auto',width:1024,height:640});
  expect(body.overlay[0].geometry.paths).toEqual([request.geometry.coordinates]);
  expect(body.overlay[2]).toMatchObject({type:'point',geometry:{x:-.855,y:53.145},symbol:{label:'12'}});
  expect(options!.body).not.toContain('client-token');
 });
 it.each([401,403,429,500])('redacts provider rejection %s',async status=>{
  vi.mocked(fetch).mockResolvedValue(new Response('test-secret upstream details',{status}));
  await expect(satelliteImage(satelliteRequest(request))).rejects.toMatchObject({message:'Satellite imagery is currently unavailable. Try again later.',code:'SATELLITE_UNAVAILABLE'});
 });
 it('rejects invalid imagery and large responses',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response('JSON error',{headers:{'Content-Type':'image/jpeg'}})).mockResolvedValueOnce(new Response('large',{headers:{'Content-Type':'image/jpeg','Content-Length':'5000001'}}));
  for(let i=0;i<2;i++)await expect(satelliteImage(satelliteRequest(request))).rejects.toMatchObject({code:'SATELLITE_UNAVAILABLE'});
 });
 it.each([{...request,width:2048},{...request,geometry:{type:'LineString',coordinates:[[0,0],[1,1]]}},{...request,facilities:[{coordinate:[-.855,53.145],number:100}]},{...request,facilities:[request.facilities[0],request.facilities[0]]},{...request,geometry:{type:'LineString',coordinates:[[0,86],[0,86]]}}])('bounds request geometry and markers',input=>expect(()=>satelliteRequest(input)).toThrow());
 it('exposes only configured availability',async()=>{
  expect(await GET().json()).toEqual({available:true,provider:'ArcGIS Static Maps'});
  vi.stubEnv('ARCGIS_STATIC_MAPS_KEY','');
  const response=GET();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({available:false,provider:null});
 });
 it('enforces origin, validation, and clean missing-key response at endpoint',async()=>{
  const post=(body:unknown,origin='http://localhost')=>POST(new Request('http://localhost/api/satellite',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
  expect((await post(request,'http://other.invalid')).status).toBe(403);
  expect((await post({...request,width:9000})).status).toBe(400);
  vi.stubEnv('ARCGIS_STATIC_MAPS_KEY','');
  const response=await post(request);expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({code:'SATELLITE_NOT_CONFIGURED'});
  expect(fetch).not.toHaveBeenCalled();
 });
});

describe('provider response bounds',()=>{
 it('cancels a streamed image once its byte budget is exhausted',async()=>{
  const cancel=vi.fn();
  const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5_000_001))},cancel});
  vi.mocked(fetch).mockResolvedValue(new Response(body,{headers:{'Content-Type':'image/jpeg'}}));
  await expect(satelliteImage(satelliteRequest(request))).rejects.toMatchObject({code:'SATELLITE_UNAVAILABLE'});
  expect(cancel).toHaveBeenCalled();
 });
 it('bounds an upstream stall and returns a redacted failure',async()=>{
  vi.useFakeTimers();
  try{
   vi.mocked(fetch).mockImplementation((_url,init)=>new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(new Error('secret provider failure')))}));
   const result=expect(satelliteImage(satelliteRequest(request))).rejects.toMatchObject({code:'SATELLITE_UNAVAILABLE',message:'Satellite imagery is currently unavailable. Try again later.'});
   await vi.advanceTimersByTimeAsync(12_000);
   await result;
  }finally{vi.useRealTimers()}
 });
});
