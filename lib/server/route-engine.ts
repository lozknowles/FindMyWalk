import {ApiError,limitedText} from './core';

export type Coordinate=[number,number];
export type PedestrianRoute={geometry:{type:'LineString';coordinates:Coordinate[]};distanceMeters:number;durationMinutes:number;source:'valhalla-pedestrian';warnings:string[];directions?:{instruction:string;lengthMeters:number}[];directionsTruncated?:boolean};

export function decodePolyline6(encoded:string):Coordinate[]{
 const points:Coordinate[]=[];let lat=0,lng=0,index=0;
 const next=()=>{let result=0,shift=0,byte:number;do{if(index>=encoded.length||shift>35)throw new Error('Invalid route geometry');byte=encoded.charCodeAt(index++)-63;result|=(byte&31)<<shift;shift+=5;}while(byte>=32);return result&1?~(result>>1):result>>1};
 while(index<encoded.length){lat+=next();lng+=next();points.push([lng/1e6,lat/1e6]);if(points.length>50000)throw new Error('Route geometry too large')}
 return points;
}

export async function routePedestrian(waypoints:Coordinate[],timeoutMs=12000,signal?:AbortSignal):Promise<PedestrianRoute>{
 const base=process.env.VALHALLA_URL;
 if(!base)throw new ApiError(503,'Pedestrian routing is not configured.','ROUTING_UNAVAILABLE');
 const controller=new AbortController();
 const abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,timeoutMs);
 try{
  const response=await fetch(new URL('/route',base),{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({locations:waypoints.map(([lon,lat])=>({lon,lat})),costing:'pedestrian',units:'kilometers',directions_options:{units:'kilometers'}}),
   signal:controller.signal,cache:'no-store'
  });
  if(!response.ok)throw new ApiError(422,'Pedestrian routing could not connect these waypoints.','NO_PEDESTRIAN_ROUTE');
  const data=JSON.parse(await limitedText(response as unknown as Request,6_000_000));
  const trip=data?.trip,legs=trip?.legs;
  if(!Array.isArray(legs)||!Number.isFinite(trip?.summary?.length)||!Number.isFinite(trip?.summary?.time))throw new Error('Invalid routing response');
  const coordinates:Coordinate[]=[];
  for(const leg of legs){const decoded=decodePolyline6(leg.shape);if(coordinates.length+decoded.length>100001)throw new Error('Route geometry too large');coordinates.push(...(coordinates.length?decoded.slice(1):decoded))}
  if(coordinates.length<2)throw new Error('Empty route');
  const maneuvers:{instruction?:unknown;length?:unknown}[]=legs.flatMap((leg:{maneuvers?:{instruction?:unknown;length?:unknown}[]})=>Array.isArray(leg.maneuvers)?leg.maneuvers:[]);
  const directions=maneuvers.flatMap(m=>typeof m.instruction==='string'?[{instruction:m.instruction.slice(0,300),lengthMeters:typeof m.length==='number'&&Number.isFinite(m.length)?Math.max(0,Math.round(m.length*1000)):0}]:[]);
  return {geometry:{type:'LineString',coordinates},distanceMeters:Math.max(1,Math.round(trip.summary.length*1000)),durationMinutes:Math.max(1,Math.round(trip.summary.time/60)),source:'valhalla-pedestrian',directions:directions.slice(0,500),directionsTruncated:directions.length>500,warnings:['Mapped paths do not establish public rights of way or current safety.']};
 }catch(error){
  if(error instanceof ApiError)throw error;
  if(signal?.aborted)throw new ApiError(503,'Route generation was cancelled.','ROUTING_UNAVAILABLE');
  throw new ApiError(503,'Pedestrian routing is temporarily unavailable.','ROUTING_UNAVAILABLE');
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
