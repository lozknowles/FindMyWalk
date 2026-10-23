import {type Coordinate,routePedestrian,type PedestrianRoute} from './route-engine';
import type {RouteFacilities} from './route-facilities';

export type GeneratedWalk=PedestrianRoute&{title:string;targetKm:number;start:{lat:number;lng:number;label:string};waypoints:{id:string;lat:number;lng:number;label:string;kind:string}[];facilities?:RouteFacilities;facilityStatus?:'available'|'unavailable'};
export const MAX_ATTEMPTS=60;
const R=6371000;
function distance(a:Coordinate,b:Coordinate){
 const p=Math.PI/180,dy=(b[1]-a[1])*p,dx=(b[0]-a[0])*p,h=Math.sin(dy/2)**2+Math.cos(a[1]*p)*Math.cos(b[1]*p)*Math.sin(dx/2)**2;
 return R*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function destination(start:Coordinate,bearing:number,meters:number):Coordinate{
 const p=Math.PI/180,lat=start[1]*p,lon=start[0]*p,angular=meters/R,b=bearing*p;
 const nextLat=Math.asin(Math.sin(lat)*Math.cos(angular)+Math.cos(lat)*Math.sin(angular)*Math.cos(b));
 const nextLon=lon+Math.atan2(Math.sin(b)*Math.sin(angular)*Math.cos(lat),Math.cos(angular)-Math.sin(lat)*Math.sin(nextLat));
 return [nextLon/p,nextLat/p];
}
function roundedCell(p:Coordinate){return Math.round(p[0]*2400)+','+Math.round(p[1]*4000)}
export function routeEdges(coordinates:Coordinate[]){
 const cells:string[]=[];
 for(const point of coordinates){const key=roundedCell(point);if(cells[cells.length-1]!==key)cells.push(key)}
 const edges:string[]=[];
 for(let i=1;i<cells.length;i++)edges.push([cells[i-1],cells[i]].sort().join('|'));
 return edges;
}
export function loopQuality(route:PedestrianRoute,start:Coordinate,targetKm:number,existing:GeneratedWalk[]){
 const coords=route.geometry.coordinates;
 if(coords.length<4||distance(coords[0],start)>120||distance(coords[coords.length-1],start)>120)return false;
 if(route.distanceMeters<targetKm*750||route.distanceMeters>targetKm*1250)return false;
 const edges=routeEdges(coords),set=new Set(edges);
 if(edges.length<8||set.size/edges.length<0.72)return false;
 for(const other of existing){
  if(Math.abs(other.distanceMeters-route.distanceMeters)<Math.max(300,route.distanceMeters*.12))return false;
  const prior=new Set(routeEdges(other.geometry.coordinates));
  const shared=[...set].filter(e=>prior.has(e)).length;
  if(shared/Math.min(set.size,prior.size)>.68)return false;
 }
 return true;
}
export async function generateWalks(start:Coordinate,startLabel:string,shortestKm:number,count:number,options?:{
 route?:(points:Coordinate[],timeoutMs:number,signal?:AbortSignal)=>Promise<PedestrianRoute>;
 covers?:(coordinates:Coordinate[])=>Promise<boolean>;
 signal?:AbortSignal;
 now?:()=>number;
}):Promise<{routes:GeneratedWalk[];attempts:number;warning?:string}>{
 const route=options?.route??routePedestrian,covers=options?.covers??(async()=>true),now=options?.now??Date.now;
 const began=now(),routes:GeneratedWalk[]=[];let attempts=0,unavailable=false;
 for(let i=0;i<count;i++){
  const targetKm=shortestKm+i;
  const patterns=[{bearing:240,angle:90,scale:.9},{bearing:0,angle:120,scale:.7},{bearing:60,angle:90,scale:.9},{bearing:180,angle:60,scale:.9},{bearing:30,angle:90,scale:.9},{bearing:0,angle:120,scale:.9},{bearing:90,angle:60,scale:.9},{bearing:150,angle:120,scale:.7},{bearing:330,angle:90,scale:.9},{bearing:120,angle:90,scale:.9},{bearing:210,angle:90,scale:.7},{bearing:300,angle:120,scale:.9}];
  for(let j=0;j<patterns.length;j++){
   if(options?.signal?.aborted||attempts>=MAX_ATTEMPTS||now()-began>21000)break;
   attempts++;
   const pattern=patterns[(j+i)%patterns.length];
   const radius=targetKm*1000/3.73*pattern.scale;
   const a=destination(start,pattern.bearing,radius),b=destination(start,pattern.bearing+pattern.angle,radius);
   if(!(await covers([a,b])))continue;
   try{
    const result=await route([start,a,b,start],Math.min(3500,Math.max(500,21000-(now()-began))),options?.signal);
    if(!loopQuality(result,start,targetKm,routes))continue;
    if(!(await covers(result.geometry.coordinates)))continue;
    routes.push({...result,title:`Circular walk ${routes.length+1} · ${(result.distanceMeters/1000).toFixed(1)} km`,targetKm,start:{lng:start[0],lat:start[1],label:startLabel},waypoints:[
     {id:'start',lng:start[0],lat:start[1],label:startLabel,kind:'start'},
     {id:'via-1',lng:a[0],lat:a[1],label:'Along the way',kind:'stop'},
     {id:'via-2',lng:b[0],lat:b[1],label:'Along the way',kind:'stop'}
    ]});
    break;
   }catch(error){
    if(error instanceof Error&&'code' in error&&error.code==='ROUTING_UNAVAILABLE'){unavailable=true;break}
   }
  }
  if(unavailable||options?.signal?.aborted||now()-began>21000)break;
 }
 return {routes,attempts,warning:routes.length<count?(unavailable?'The walking router became unavailable.':'Only '+routes.length+' distinct mapped loop'+(routes.length===1?' was':'s were')+' found near this start within the requested lengths. Try another starting point or shorter distances.'):undefined};
}
