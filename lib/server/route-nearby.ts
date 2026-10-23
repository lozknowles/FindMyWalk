import {ApiError,db} from './core';
import {routePedestrian, type Coordinate} from './route-engine';
import type {RouteFacility} from './route-facilities';

const radiusMeters = 1200; // Geographic shortlist, never a walking-distance claim.
const maxCandidates = 8;
const maxDetourMeters = 2000; // Visible maximum extra walking, out and back.
const sourceUrl = '/data-licenses';
const state = globalThis as unknown as {nearbyRouting?:{active:number;queue:(()=>void)[]}};
function routingSlot(signal:AbortSignal):Promise<()=>void> {
 const budget=state.nearbyRouting??={active:0,queue:[]};
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new ApiError(503,'Nearby routing cancelled.','ROUTING_UNAVAILABLE'));return}
  const abort=()=>{
   const index=budget.queue.indexOf(acquire);
   if(index>=0)budget.queue.splice(index,1);
   reject(new ApiError(503,'Nearby routing cancelled.','ROUTING_UNAVAILABLE'));
  };
  const acquire=()=>{
   signal.removeEventListener('abort',abort);
   if(signal.aborted){reject(new ApiError(503,'Nearby routing cancelled.','ROUTING_UNAVAILABLE'));budget.queue.shift()?.();return}
   budget.active++;
   resolve(()=>{budget.active--;budget.queue.shift()?.()});
  };
  if(budget.active<3)acquire();else{budget.queue.push(acquire);signal.addEventListener('abort',abort,{once:true})}
 });
}
function metres(a:Coordinate,b:Coordinate):number {
 const mean=(a[1]+b[1])*Math.PI/360;
 return Math.hypot((a[0]-b[0])*111_000*Math.cos(mean),(a[1]-b[1])*111_000);
}
function normalized(name:string):string {
 return name.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function duplicate(a:RouteFacility,b:RouteFacility):boolean {
 if(a.group!==b.group||metres([a.lng,a.lat],[b.lng,b.lat])>35)return false;
 const one=normalized(a.name),two=normalized(b.name);
 return one===two||one.length>=8&&two.startsWith(one+' ')||two.length>=8&&one.startsWith(two+' ');
}
function group(category:string):RouteFacility['group'] {return category==='pub'?'pub':'cafe'}
function unavailable(error:unknown):boolean {
 return !(error instanceof ApiError&&error.code==='NO_PEDESTRIAN_ROUTE');
}

/** Find mapped venues near a route and check the complete pedestrian return diversion. */
export async function discoverNearbyPlaces(coordinates:Coordinate[],mapped:RouteFacility[],signal?:AbortSignal):Promise<{places:RouteFacility[];status:'available'|'partial'|'unavailable';release:string|null}> {
 const budgetSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000);
 if(budgetSignal.aborted)return {places:[],status:'unavailable',release:null};
 const geometry=JSON.stringify({type:'LineString',coordinates});
 let rows:Record<string,unknown>[],release:string|null=null,coverage:'available'|'partial'='partial';
 try {
  const result=await db().query(`
   WITH route AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS geom),
   candidates AS (
    SELECT 'osm' AS source,p.osm_type||'/'||p.osm_id AS id,p.name,p.category,
      ST_X(p.location) AS lng,ST_Y(p.location) AS lat,
      ST_Distance(p.location::geography,route.geom::geography) AS straight_m,
      ST_X(ST_ClosestPoint(route.geom,p.location)) AS entry_lng,
      ST_Y(ST_ClosestPoint(route.geom,p.location)) AS entry_lat,
      'https://www.openstreetmap.org/'||p.osm_type||'/'||p.osm_id AS url,
      NULL::text AS release,NULL::double precision AS confidence,
      to_jsonb(p)->>'phone' AS phone,to_jsonb(p)->>'website' AS website,NULL::text AS address
    FROM osm_pois p CROSS JOIN route
    WHERE p.family='place' AND p.category IN ('cafe','restaurant','fast_food','pub')
      AND ST_DWithin(p.location::geography,route.geom::geography,$2)
    UNION ALL
    SELECT 'overture',p.id::text,p.name,p.category,
      ST_X(p.location),ST_Y(p.location),
      ST_Distance(p.location::geography,route.geom::geography),
      ST_X(ST_ClosestPoint(route.geom,p.location)),ST_Y(ST_ClosestPoint(route.geom,p.location)),
      $3::text,p.source_release,p.confidence,p.phone,p.website,p.address
    FROM overture_pois p CROSS JOIN route
    WHERE p.operating_status IS DISTINCT FROM 'permanently_closed'
      AND ST_DWithin(p.location::geography,route.geom::geography,$2)
   ) SELECT * FROM candidates ORDER BY CASE WHEN category='cafe' THEN 0 WHEN category IN ('restaurant','fast_food') THEN 1 ELSE 2 END,straight_m,source,id LIMIT 81`,[geometry,radiusMeters,sourceUrl]);
  rows=result.rows;
  const metadata=await db().query('SELECT source_release,ST_Covers(bbox,ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS covered FROM overture_extracts WHERE id=1',[geometry]);
  release=metadata.rows[0]?.source_release||null;
  if(!release)return {places:[],status:'unavailable',release:null};
  coverage=metadata.rows[0]?.covered ? 'available' : 'partial';
 } catch {return {places:[],status:'unavailable',release:null}}
 const unique:RouteFacility[]=[];
 const shortlisted:{place:RouteFacility;entry:Coordinate}[]=[];
 let truncated=rows.length>=81;
 for(const row of rows){
  const category=String(row.category),name=String(row.name);
  const point:[number,number]=[Number(row.lng),Number(row.lat)];
  if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))continue;
  const place:RouteFacility={id:String(row.source)+':'+String(row.id),name,category,group:group(category),
   lat:point[1],lng:point[0],distanceMeters:Math.round(Number(row.straight_m)),progress:0,
   url:String(row.url),source:row.source==='osm'?'osm':'overture',sourceUrl:String(row.url),
   positionQuality:'mapped',statusNote:'Mapped point; confirm the entrance and current opening.',
   confidence:row.confidence==null?undefined:Number(row.confidence),sourceRelease:row.release==null?undefined:String(row.release),
   phone:row.phone==null?null:String(row.phone),website:row.website==null?null:String(row.website),address:row.address==null?undefined:String(row.address)};
  if(mapped.some(other=>duplicate(other,place))||unique.some(other=>duplicate(other,place)))continue;
  if(shortlisted.length>=maxCandidates){truncated=true;break}
  unique.push(place);
  shortlisted.push({place,entry:[Number(row.entry_lng),Number(row.entry_lat)]});
 }
 const results:RouteFacility[]=[];
 let routingFailed=false,evaluated=0;
 await Promise.all(shortlisted.map(async({place,entry})=>{
  if(budgetSignal.aborted){routingFailed=true;return}
  let releaseSlot:(()=>void)|undefined;
  try{
   releaseSlot=await routingSlot(budgetSignal);
   if(budgetSignal.aborted){routingFailed=true;return}
   const routed=await routePedestrian([entry,[place.lng,place.lat],entry],2500,budgetSignal);
   const shape=routed.geometry.coordinates;
   const visited=shape.some(point=>metres(point,[place.lng,place.lat])<=80);
   if(metres(entry,shape[0])>80||metres(entry,shape.at(-1)!)>80||!visited){evaluated++;return}
   evaluated++;
   if(routed.distanceMeters>maxDetourMeters)return;
   results.push({...place,detourMeters:routed.distanceMeters,detourMinutes:routed.durationMinutes});
  }catch(error){if(unavailable(error))routingFailed=true;else evaluated++}
  finally{releaseSlot?.()}
 }));
 const status=results.length>0&&budgetSignal.aborted?'partial':budgetSignal.aborted||routingFailed&&evaluated===0?'unavailable':routingFailed||truncated||coverage==='partial'?'partial':'available';
 return {places:results.sort((a,b)=>(a.detourMeters||Infinity)-(b.detourMeters||Infinity)),status,release};
}
