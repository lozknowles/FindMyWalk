import {ApiError,coordinate,failure,json,origin} from '../../../lib/server/core';
import {admitFacilities} from '../../../lib/server/resource-limits';
import {routeFacilities} from '../../../lib/server/route-facilities';
import type {Coordinate} from '../../../lib/server/route-engine';

export const runtime='nodejs';
export async function POST(request:Request){
 let release:(()=>void)|undefined;
 try{
  origin(request);release=admitFacilities();
  const body=await json(request,250_000);
  const points=body?.geometry?.coordinates as Coordinate[];
  if(body?.geometry?.type!=='LineString'||!Array.isArray(points)||points.length<2||points.length>5000||
    points.some(p=>!Array.isArray(p)||p.length!==2||!coordinate(p[0],p[1])))
   throw new ApiError(400,'Choose a valid walking route.','INVALID_ROUTE');
  const lngs=points.map(p=>p[0]),lats=points.map(p=>p[1]);
  if(Math.max(...lngs)-Math.min(...lngs)>.2||Math.max(...lats)-Math.min(...lats)>.2)
   throw new ApiError(400,'This route is wider than the current local discovery area.','INVALID_ROUTE');
  return Response.json(await routeFacilities(points),{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
 }catch(error){return failure(error)}
 finally{release?.()}
}
