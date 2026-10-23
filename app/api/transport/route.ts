import {transport} from '../../../lib/server/discovery';
import {ApiError,failure} from '../../../lib/server/core';
export async function GET(r:Request){try{const p=new URL(r.url).searchParams;if(!p.has('lat')||!p.has('lng'))throw new ApiError(400,'Latitude and longitude are required.');return Response.json(await transport(Number(p.get('lat')),Number(p.get('lng'))))}catch(e){return failure(e)}}

