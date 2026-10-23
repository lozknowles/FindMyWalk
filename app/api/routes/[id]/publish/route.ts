import {owner,origin,json,revision,ApiError,failure} from '../../../../../lib/server/core';
import {publish} from '../../../../../lib/server/walks';
export const runtime='nodejs';
export async function POST(r:Request,c:{params:Promise<{id:string}>}){try{origin(r);const who=await owner();if(!who)throw new ApiError(401,'This browser does not own the walk.','UNAUTHORIZED');const b=await json(r);return Response.json({route:await publish((await c.params).id,who,revision(b.revision),b.visibility||'public')})}catch(e){return failure(e)}}

