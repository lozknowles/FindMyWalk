import {ApiError,coordinate,db,failure,json,origin} from '../../../lib/server/core';
import {admitGeneration} from '../../../lib/server/resource-limits';
import {generateWalks,type GeneratedWalk} from '../../../lib/server/generate-walks';
import type {Coordinate} from '../../../lib/server/route-engine';
import {routeFacilities} from '../../../lib/server/route-facilities';

export const runtime='nodejs';
export const maxDuration=35;

export async function POST(request:Request){
 let release:(()=>void)|undefined;
 const deadline=new AbortController();
 const cancel=()=>deadline.abort();
 request.signal.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,32000);
 try{
  origin(request);
  release=admitGeneration();
  const body=await json(request,1024);
  const start=body?.start as Coordinate,shortestKm=body?.shortestKm,count=body?.count,label=body?.label;
  if(!Array.isArray(start)||start.length!==2||!coordinate(start[0],start[1])||
    !Number.isInteger(shortestKm)||shortestKm<1||shortestKm>6||
    !Number.isInteger(count)||count<1||count>5||
    (label!==undefined&&(typeof label!=='string'||label.length>100)))
   throw new ApiError(400,'Choose a Nottinghamshire start, shortest length 1–6 km and 1–5 walks.','INVALID_GENERATION');
  const {rows}=await db().query(
   'SELECT ST_Covers(coverage,ST_SetSRID(ST_MakePoint($1,$2),4326)) AS covered FROM osm_extracts WHERE id=1',
   start);
  if(!rows[0]?.covered)throw new ApiError(422,'This start is outside the Nottinghamshire beta coverage.','OUTSIDE_COVERAGE');
  const covers=async(points:Coordinate[])=>{
   const type=points.length===1?'Point':'LineString';
   const geometry={type,coordinates:type==='Point'?points[0]:points};
   const result=await db().query('SELECT ST_Covers(coverage,ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS covered FROM osm_extracts WHERE id=1',[JSON.stringify(geometry)]);
   return Boolean(result.rows[0]?.covered);
  };
  const result=await generateWalks(start,(label||'Starting point').trim()||'Starting point',shortestKm,count,{covers,signal:deadline.signal});
  const enrichment=new AbortController();
  const stopEnrichment=()=>enrichment.abort();
  deadline.signal.addEventListener('abort',stopEnrichment,{once:true});
  const enrichmentTimer=setTimeout(stopEnrichment,8000);
  const enriched=await Promise.all(result.routes.map(async(route:GeneratedWalk)=>{
   try{if(deadline.signal.aborted)throw new Error('Deadline exceeded');return {...route,facilities:await routeFacilities(route.geometry.coordinates,100,enrichment.signal),facilityStatus:'available' as const,warnings:[...route.warnings,'Generated suggestions have not been inspected for access, closures, terrain or suitability.']}}
   catch{return {...route,facilityStatus:'unavailable' as const,warnings:[...route.warnings,'Nearby map facilities could not be loaded.']}}
  }));
  clearTimeout(enrichmentTimer);deadline.signal.removeEventListener('abort',stopEnrichment);
  return Response.json({...result,routes:enriched,coverage:'Nottinghamshire only',attribution:'© OpenStreetMap contributors'},{
   headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}
  });
 }catch(error){return failure(error)}
 finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);release?.()}
}
