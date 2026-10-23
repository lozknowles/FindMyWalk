import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {cookies} from 'next/headers';
import {Pool} from 'pg';
export class ApiError extends Error {constructor(public status:number,message:string,public code='REQUEST_FAILED'){super(message)}}
export function failure(e:unknown){if(e instanceof ApiError)return Response.json({error:e.message,code:e.code},{status:e.status});console.error('FindMyWalk API',e instanceof Error?e.message:'Unknown failure');return Response.json({error:'The service could not complete this request.',code:'SERVICE_UNAVAILABLE'},{status:503})}
const state=globalThis as unknown as {walkDb?:Pool};
export function db(){if(!process.env.DATABASE_URL)throw new ApiError(503,'Saved walks need a configured database.','DATABASE_NOT_CONFIGURED');return state.walkDb??=new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:5000})}
function secret(){const s=process.env.SESSION_SECRET;if(!s||s.length<32)throw new ApiError(503,'Saved walks need SESSION_SECRET (at least 32 characters).','SESSION_NOT_CONFIGURED');return s}
export function sign(id:string){return id+'.'+createHmac('sha256',secret()).update(id).digest('hex')}
export function verify(token:string|undefined){if(!token)return null;const [id,sig,...more]=token.split('.');if(more.length||!/^[a-f0-9-]{36}$/.test(id||'')||!/^[a-f0-9]{64}$/.test(sig||''))return null;return timingSafeEqual(Buffer.from(sig),Buffer.from(sign(id).split('.')[1]))?id:null}
export async function owner(create=false){const jar=await cookies();const id=verify(jar.get('findmywalk_session')?.value);if(id)return id;if(!create)return null;const fresh=randomUUID();jar.set('findmywalk_session',sign(fresh),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:31536000});return fresh}
export function origin(r:Request){
 let trusted=process.env.PUBLIC_ORIGIN;
 if(trusted){
  try {const parsed=new URL(trusted);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('Invalid origin');trusted=parsed.origin}
  catch {throw new ApiError(503,'PUBLIC_ORIGIN must be a valid HTTP or HTTPS origin.','ORIGIN_NOT_CONFIGURED')}
 }else if(process.env.NODE_ENV==='production'){
  throw new ApiError(503,'Writes need a configured PUBLIC_ORIGIN.','ORIGIN_NOT_CONFIGURED');
 }else{
  const url=new URL(r.url);trusted=r.headers.get('host')?url.protocol+'//'+r.headers.get('host'):url.origin;
 }
 writesEnabled();
 const supplied=r.headers.get('origin');
 if(supplied!==trusted)throw new ApiError(403,'Cross-origin writes are not allowed.','ORIGIN_REJECTED');
}
export function coordinate(lng:unknown,lat:unknown){return typeof lng==='number'&&typeof lat==='number'&&Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=90}
export function revision(v:unknown){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1)throw new ApiError(400,'A valid revision is required.','INVALID_REVISION');return v}
export async function limitedText(r:Request,limit:number){if(!r.body)return '';const reader=r.body.getReader();const parts:Uint8Array[]=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();throw new ApiError(413,'The uploaded file is too large.','TOO_LARGE')}parts.push(value)}return Buffer.concat(parts).toString('utf8')}
export function writesEnabled(){if(process.env.WRITES_ENABLED==='false')throw new ApiError(503,'Walk changes are temporarily paused.','WRITES_PAUSED')}
export async function json(r:Request,limit=6_000_000){try{return JSON.parse(await limitedText(r,limit))}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,'Invalid JSON.','INVALID_JSON')}}

