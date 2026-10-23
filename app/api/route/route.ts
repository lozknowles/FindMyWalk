import {NextRequest,NextResponse} from 'next/server';
import {ApiError,coordinate,failure,json,origin} from '../../../lib/server/core';
import {admitRouting} from '../../../lib/server/resource-limits';
import {routePedestrian,type Coordinate} from '../../../lib/server/route-engine';

export async function POST(request:NextRequest){
 let release:(()=>void)|undefined;
 try{
  origin(request);
  release=admitRouting();
  const body=await json(request,16_384);
  const waypoints=body?.waypoints as Coordinate[];
  if(!Array.isArray(waypoints)||waypoints.length<2||waypoints.length>25||
    waypoints.some(p=>!Array.isArray(p)||p.length!==2||!coordinate(p[0],p[1])))
   throw new ApiError(400,'Provide 2 to 25 valid [longitude, latitude] waypoints','INVALID_WAYPOINTS');
  return NextResponse.json(await routePedestrian(waypoints));
 }catch(error){return failure(error)}
 finally{release?.()}
}
