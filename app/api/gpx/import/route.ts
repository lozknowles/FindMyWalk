import {admitMutation} from '../../../../lib/server/resource-limits';
import {importGpx} from '../../../../lib/server/gpx';
import {origin,limitedText,failure} from '../../../../lib/server/core';
export const runtime='nodejs';
export async function POST(r:Request){let release:(()=>void)|undefined;try{origin(r);release=admitMutation();return Response.json(importGpx(await limitedText(r,6_000_000)))}catch(e){return failure(e)}finally{release?.()}}

