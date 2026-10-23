import {importGpx} from '../../../../lib/server/gpx';
import {origin,limitedText,failure} from '../../../../lib/server/core';
export const runtime='nodejs';
export async function POST(r:Request){try{origin(r);return Response.json(importGpx(await limitedText(r,6_000_000)))}catch(e){return failure(e)}}

