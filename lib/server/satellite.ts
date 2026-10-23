import 'server-only';
import {ApiError,coordinate} from './core';
import type {Coordinate} from './route-engine';
export type SatelliteRequest={geometry:{type:'LineString';coordinates:Coordinate[]};facilities:{coordinate:Coordinate;number:number}[];width:number;height:number};
export const SATELLITE_ATTRIBUTION='Esri and imagery providers; full data attribution embedded in image';
const UPSTREAM='https://static-maps-api.arcgis.com/arcgis/rest/services/static-maps-service/v1/static-maps/arcgis/imagery/with-overlay';
const MAX_BYTES=5_000_000;
function invalid():never{throw new ApiError(400,'Choose a valid local route and numbered facilities for the satellite map.','INVALID_SATELLITE_REQUEST')}
function point(value:unknown):value is Coordinate{return Array.isArray(value)&&value.length===2&&coordinate(value[0],value[1])&&Math.abs(value[1])<=85}
export function satelliteRequest(value:unknown):SatelliteRequest{
 const b=value as Partial<SatelliteRequest>|null;
 if(!b||b.geometry?.type!=='LineString'||!Array.isArray(b.geometry.coordinates)||b.geometry.coordinates.length<2||b.geometry.coordinates.length>5000||!b.geometry.coordinates.every(point))invalid();
 const facilities=b.facilities??[];
 if(!Array.isArray(facilities)||facilities.length>60)invalid();
 const numbers=new Set<number>();
 for(const f of facilities){if(!f||!point(f.coordinate)||!Number.isInteger(f.number)||f.number<1||f.number>99||numbers.has(f.number))invalid();numbers.add(f.number)}
 const width=b.width??1024,height=b.height??640;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<128||width>1024||height<128||height>1024)invalid();
 const points=[...b.geometry.coordinates,...facilities.map(f=>f.coordinate)],lngs=points.map(p=>p[0]),lats=points.map(p=>p[1]);
 if(Math.max(...lngs)-Math.min(...lngs)>.5||Math.max(...lats)-Math.min(...lats)>.5)invalid();
 return {geometry:b.geometry,facilities,width,height};
}
function unavailable():never{throw new ApiError(503,'Satellite imagery is currently unavailable. Try again later.','SATELLITE_UNAVAILABLE')}
export async function satelliteImage(input:SatelliteRequest):Promise<Uint8Array>{
 const key=process.env.ARCGIS_STATIC_MAPS_KEY;
 if(!key)throw new ApiError(503,'Satellite imagery needs a configured licensed imagery provider.','SATELLITE_NOT_CONFIGURED');
 const spatialReference={wkid:4326};
 // Auto-fit renders every geometry and attribution together, avoiding client projection assumptions.
 const overlay=[
  {type:'polyline',geometry:{paths:[input.geometry.coordinates],spatialReference},symbol:{style:'solid',color:'FFFFFF',width:7}},
  {type:'polyline',geometry:{paths:[input.geometry.coordinates],spatialReference},symbol:{style:'solid',color:'E87524',width:4}},
  ...input.facilities.map(f=>({type:'point',geometry:{x:f.coordinate[0],y:f.coordinate[1],spatialReference},symbol:{style:'circle',color:'146647',scale:1.3,label:String(f.number)}}))
 ];
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12_000);
 try{
  const response=await fetch(UPSTREAM,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'image/jpeg'},body:JSON.stringify({overlay,image:{width:input.width,height:input.height,format:'jpeg',padding:[8],attribution:'auto'}}),signal:controller.signal,redirect:'error',cache:'no-store'});
  if(!response.ok||response.headers.get('content-type')?.split(';')[0].trim()!=='image/jpeg'||Number(response.headers.get('content-length')??0)>MAX_BYTES||!response.body){await response.body?.cancel();unavailable()}
  const reader=response.body.getReader(),parts:Uint8Array[]=[];let bytes=0;
  while(true){const result=await reader.read();if(result.done)break;bytes+=result.value.length;if(bytes>MAX_BYTES){await reader.cancel();unavailable()}parts.push(result.value)}
  const image=Buffer.concat(parts);
  if(image.length<4||image[0]!==255||image[1]!==216||image[2]!==255)unavailable();
  return image;
 }catch{unavailable()}finally{clearTimeout(timer)}
}
