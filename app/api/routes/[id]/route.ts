import {admitMutation} from '../../../../lib/server/resource-limits';
import {owner,origin,json,revision,ApiError,failure} from '../../../../lib/server/core';
import {get,save,validate,remove} from '../../../../lib/server/walks';
export const runtime='nodejs';
type C={params:Promise<{id:string}>};
export async function GET(r:Request,c:C){try{return Response.json({route:await get((await c.params).id,new URL(r.url).searchParams.get('published')==='1'?null:await owner())},{headers:{'Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function PUT(r:Request,c:C){let release:(()=>void)|undefined;try{origin(r);release=admitMutation();const who=await owner();if(!who)throw new ApiError(401,'This browser does not own the walk.','UNAUTHORIZED');const b=await json(r);return Response.json({route:await save(validate(b),who,(await c.params).id,revision(b.revision))})}catch(e){return failure(e)}finally{release?.()}}
export async function DELETE(r:Request,c:C){let release:(()=>void)|undefined;try{origin(r);release=admitMutation();const who=await owner();if(!who)throw new ApiError(401,'This browser does not own the walk.','UNAUTHORIZED');await remove((await c.params).id,who,revision(Number(new URL(r.url).searchParams.get('revision'))));return new Response(null,{status:204})}catch(e){return failure(e)}finally{release?.()}}

