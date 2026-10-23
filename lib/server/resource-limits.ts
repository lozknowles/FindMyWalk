import {ApiError} from './core';

// One shared admission budget per Node process: no client-controlled identity can bypass it.
export function createAdmission(maxPerMinute:number,maxConcurrent:number,now=Date.now){
 let active=0,start=now(),used=0;
 return ()=>{
  const time=now();
  if(time-start>=60_000){start=time;used=0}
  if(active>=maxConcurrent||used>=maxPerMinute)throw new ApiError(429,'The service is busy. Try again in a minute.','RESOURCE_LIMIT');
  active++;used++;
  let released=false;
  return ()=>{if(!released){released=true;active--}};
 };
}
export function createRoutingAdmission(now=Date.now){return createAdmission(60,4,now)}
const state=globalThis as unknown as {walkRoutingAdmission?:ReturnType<typeof createRoutingAdmission>;walkReportAdmission?:ReturnType<typeof createAdmission>;walkDiscoveryAdmission?:ReturnType<typeof createAdmission>;walkMutationAdmission?:ReturnType<typeof createAdmission>};
export function admitRouting(){return (state.walkRoutingAdmission??=createRoutingAdmission())()}
export function admitMutation(){return (state.walkMutationAdmission??=createAdmission(60,4))()}
export function admitDiscovery(){return (state.walkDiscoveryAdmission??=createAdmission(240,8))()}
export function admitReport(){return (state.walkReportAdmission??=createAdmission(20,2))()}
export const OWNER_ROUTE_LIMIT=25;
export const OWNER_GEOMETRY_POINT_LIMIT=250_000;
export function checkOwnerQuota(count:number,points:number,incomingPoints:number){
 if(count>=OWNER_ROUTE_LIMIT||points+incomingPoints>OWNER_GEOMETRY_POINT_LIMIT)
  throw new ApiError(429,'This browser has reached its saved walk limit. Delete a walk or reduce its geometry before saving.','OWNER_STORAGE_LIMIT');
}

export const GLOBAL_ROUTE_LIMIT=1000;
export const GLOBAL_GEOMETRY_POINT_LIMIT=1_000_000;
export function checkGlobalQuota(count:number,points:number,incomingPoints:number){
 if(count>=GLOBAL_ROUTE_LIMIT||points+incomingPoints>GLOBAL_GEOMETRY_POINT_LIMIT)
  throw new ApiError(503,'The beta has reached its current storage capacity. New saves are temporarily unavailable.','GLOBAL_STORAGE_LIMIT');
}
