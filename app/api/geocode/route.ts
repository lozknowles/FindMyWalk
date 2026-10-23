import {ApiError,db,failure} from '../../../lib/server/core';
import {admitDiscovery} from '../../../lib/server/resource-limits';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
 const q=new URL(request.url).searchParams.get('q')?.trim();
 if(!q||q.length<2||q.length>100)return Response.json({error:'Enter a place or landmark name (2–100 characters)',code:'INVALID_QUERY'},{status:400});
 let release:(()=>void)|undefined;
 try{
  release=admitDiscovery();
  const {rows}=await db().query(
   `SELECT name,ST_Y(location) AS lat,ST_X(location) AS lng,category
      FROM osm_pois
      WHERE name ILIKE '%' || $1 || '%' AND length(name)>1
      ORDER BY CASE WHEN lower(name)=lower($1) THEN 0 ELSE 1 END,
               CASE WHEN category IN ('city','town','village','hamlet','suburb','neighbourhood') THEN 0 ELSE 1 END,
               CASE WHEN lower(name) LIKE lower($1)||'%' THEN 0 ELSE 1 END,
               CASE WHEN family='place' THEN 0 ELSE 1 END,name
      LIMIT 5`,[q.replace(/[\\%_]/g,'\\$&')]);
  return Response.json({results:rows.map((row:{name:string;lat:number;lng:number;category:string})=>({label:row.name+' ('+row.category.replaceAll('_',' ')+')',lat:row.lat,lng:row.lng})),source:'Local OpenStreetMap extract',attribution:'© OpenStreetMap contributors',coverage:'Nottinghamshire only'},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch(e){
  if(e instanceof ApiError)return failure(e);
  return Response.json({error:'Location search is temporarily unavailable',code:'GEOCODER_UNAVAILABLE'},{status:503});
 }finally{release?.()}
}
