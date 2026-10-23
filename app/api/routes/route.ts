import {admitMutation} from '../../../lib/server/resource-limits';
import {owner,origin,json,failure} from '../../../lib/server/core';
import {list,save,validate} from '../../../lib/server/walks';
export const runtime='nodejs';
export async function GET(){try{return Response.json({routes:await list((await owner(true))!)},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(r:Request){let release:(()=>void)|undefined;try{origin(r);release=admitMutation();return Response.json({route:await save(validate(await json(r)),(await owner(true))!)},{status:201})}catch(e){return failure(e)}finally{release?.()}}

