import {places} from '../../../lib/server/discovery';
import {failure} from '../../../lib/server/core';
export async function GET(r:Request){try{return Response.json(await places(new URL(r.url).searchParams.get('bbox')))}catch(e){return failure(e)}}

