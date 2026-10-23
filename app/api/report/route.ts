import {ApiError,db,failure,json,origin} from '../../../lib/server/core';
import {admitReport} from '../../../lib/server/resource-limits';

export const runtime='nodejs';

export async function POST(request:Request){
 let release:undefined|(()=>void);
 try{
  origin(request);
  release=admitReport();
  const body=await json(request,2048) as {routeId?:unknown;reason?:unknown;details?:unknown};
  const reason=body?.reason;
  const details=body?.details;
  const routeId=body?.routeId;
  if(!['safety','inappropriate','privacy','other'].includes(String(reason))||
     typeof details!=='string'||details.trim().length<5||details.length>1000||
     (routeId!==undefined&&routeId!==null&&(typeof routeId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(routeId))))
   throw new ApiError(400,'Choose a reason and describe the concern (5–1000 characters).','INVALID_REPORT');
  await db().query(
   `INSERT INTO route_reports(route_id,reason,details)
    VALUES((SELECT id FROM walks WHERE id=$1 AND visibility IN ('public','unlisted') LIMIT 1),$2,$3)`,
   [routeId??null,reason,details.trim()]);
  return Response.json({received:true},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(error){return failure(error)}finally{release?.()}
}
