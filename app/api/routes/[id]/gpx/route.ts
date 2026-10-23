import {get} from '../../../../../lib/server/walks';
import {owner,failure} from '../../../../../lib/server/core';
import {exportGpx} from '../../../../../lib/server/gpx';
export const runtime='nodejs';
export async function GET(r:Request,c:{params:Promise<{id:string}>}){try{const walk=await get((await c.params).id,new URL(r.url).searchParams.get('published')==='1'?null:await owner());return new Response(exportGpx(walk),{headers:{'Content-Type':'application/gpx+xml; charset=utf-8','Content-Disposition':'attachment; filename="findmywalk-'+walk.id+'.gpx"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}catch(e){return failure(e)}}

