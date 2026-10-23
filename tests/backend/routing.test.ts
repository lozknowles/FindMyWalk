import {describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {POST} from '../../app/api/route/route';
import {validate} from '../../lib/server/walks';
vi.mock('next/headers',()=>({cookies:vi.fn()}));
function encode(points:number[][]){
 let lastLat=0,lastLng=0,result='';
 const part=(delta:number)=>{let n=delta<0?~(delta<<1):delta<<1;do{const b=n&31;n>>>=5;result+=String.fromCharCode((n?b|32:b)+63);}while(n);};
 for(const [lng,lat] of points){const a=Math.round(lat*1e6),b=Math.round(lng*1e6);part(a-lastLat);part(b-lastLng);lastLat=a;lastLng=b;}
 return result;
}
describe('pedestrian route boundary',()=>{
 it('returns a saveable positive duration for a real but very short route',async()=>{
  const coordinates=[[-0.76,53.14],[-0.76,53.14001]];
  const original=process.env.VALHALLA_URL;process.env.VALHALLA_URL='http://routing.test';
  const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({trip:{summary:{length:0.001,time:1},legs:[{shape:encode(coordinates)}]}}),{status:200}));
  try {
   const req=new NextRequest('http://localhost/api/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({waypoints:coordinates})});
   const response=await POST(req),result=await response.json();
   expect(response.status).toBe(200);expect(result.distanceMeters).toBe(1);expect(result.durationMinutes).toBe(1);
   expect(fetchMock).toHaveBeenCalledOnce();
   expect(validate({title:'Short walk',description:'',waypoints:coordinates.map(([lng,lat],i)=>({id:String(i),lng,lat,kind:i?'finish':'start'})),geometry:result.geometry,distanceMeters:result.distanceMeters,durationMinutes:result.durationMinutes,visibility:'private'}).durationMinutes).toBe(1);
  } finally {fetchMock.mockRestore();if(original===undefined)delete process.env.VALHALLA_URL;else process.env.VALHALLA_URL=original;}
 });
});
