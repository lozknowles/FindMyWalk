import {failure,json,origin} from '../../../lib/server/core';
import {createAdmission} from '../../../lib/server/resource-limits';
import {SATELLITE_ATTRIBUTION,satelliteImage,satelliteRequest} from '../../../lib/server/satellite';
export const runtime='nodejs';
const state=globalThis as unknown as {walkSatelliteAdmission?:ReturnType<typeof createAdmission>};
export async function POST(request:Request){
 let release:(()=>void)|undefined;
 try{
  origin(request);release=(state.walkSatelliteAdmission??=createAdmission(12,2))();
  const input=satelliteRequest(await json(request,300_000));
  const image=await satelliteImage(input);
  return new Response(new Uint8Array(image),{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Map-Attribution':SATELLITE_ATTRIBUTION}});
 }catch(error){const response=failure(error);response.headers.set('Cache-Control','no-store');return response}
 finally{release?.()}
}
export function GET(){
 const available=Boolean(process.env.ARCGIS_STATIC_MAPS_KEY);
 return Response.json({available,provider:available?'ArcGIS Static Maps':null},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
}
