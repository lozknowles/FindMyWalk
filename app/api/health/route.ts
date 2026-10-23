import {db} from '../../../lib/server/core';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){try{await db().query('SELECT id FROM walks LIMIT 0');const configured=Boolean(process.env.SESSION_SECRET&&process.env.SESSION_SECRET.length>=32);return Response.json({status:configured?'ready':'not_ready',database:'ready',sessions:configured?'ready':'unconfigured'},{status:configured?200:503,headers:{'Cache-Control':'no-store'}})}catch{return Response.json({status:'not_ready',database:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}}

