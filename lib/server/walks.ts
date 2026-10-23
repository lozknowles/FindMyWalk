import {ApiError,coordinate,db,writesEnabled} from './core';
import {checkOwnerQuota} from './resource-limits';
import type {PoolClient} from 'pg';
export type Waypoint={id:string;lat:number;lng:number;kind:string;label?:string};
export type WalkInput={title:string;description:string;waypoints:Waypoint[];geometry:{type:'LineString';coordinates:number[][]};distanceMeters:number;durationMinutes:number;visibility:'private'|'unlisted'|'public';geometrySource?:'manual'|'walking-router'|'gpx-import'|'unknown'};
export function validate(x:WalkInput):WalkInput {
 if(!x||typeof x.title!=='string'||!x.title.trim()||x.title.length>160)throw new ApiError(400,'Enter a title of 1-160 characters.','INVALID_ROUTE');
 if(x.description!==undefined&&(typeof x.description!=='string'||x.description.length>10000))throw new ApiError(400,'Description is too long.','INVALID_ROUTE');
 if(!Array.isArray(x.waypoints)||x.waypoints.length<2||x.waypoints.length>200)throw new ApiError(400,'A walk needs 2-200 waypoints.','INVALID_ROUTE');
 const ids=new Set();const waypoints=x.waypoints.map(w=>{if(!w||typeof w.id!=='string'||!w.id||w.id.length>100||ids.has(w.id)||!coordinate(w.lng,w.lat))throw new ApiError(400,'Waypoints need unique IDs and valid coordinates.','INVALID_ROUTE');ids.add(w.id);return {id:w.id,lat:w.lat,lng:w.lng,kind:typeof w.kind==='string'?w.kind.slice(0,40):'waypoint',...(typeof w.label==='string'&&w.label.trim()?{label:w.label.trim().slice(0,160)}:{})}});
 const g=x.geometry;if(!g||g.type!=='LineString'||!Array.isArray(g.coordinates)||g.coordinates.length<2||g.coordinates.length>100000||g.coordinates.some(c=>!Array.isArray(c)||c.length!==2||!coordinate(c[0],c[1])))throw new ApiError(400,'A valid GeoJSON LineString is required.','INVALID_ROUTE');
 if(!Number.isFinite(x.distanceMeters)||x.distanceMeters<=0||x.distanceMeters>2000000||!Number.isFinite(x.durationMinutes)||x.durationMinutes<=0||x.durationMinutes>100000)throw new ApiError(400,'Distance and duration must be positive.','INVALID_ROUTE');
 if(!['private','unlisted','public'].includes(x.visibility))throw new ApiError(400,'Invalid visibility.','INVALID_ROUTE');
 if(x.geometrySource!==undefined&&!['manual','walking-router','gpx-import','unknown'].includes(x.geometrySource))throw new ApiError(400,'Invalid geometry source.','INVALID_ROUTE');
 return {geometrySource:x.geometrySource||'unknown',title:x.title.trim(),description:x.description||'',waypoints,geometry:g,distanceMeters:x.distanceMeters,durationMinutes:x.durationMinutes,visibility:x.visibility};
}
export function canRead(row:{owner_id:string;visibility:string;published_at:unknown},who:string|null){return row.owner_id===who||Boolean(row.published_at&&row.visibility!=='private')}
function present(r:any){return {id:r.id,title:r.title,description:r.description,waypoints:r.waypoints,geometry:JSON.parse(r.geojson),distanceMeters:Number(r.distance_meters),durationMinutes:Number(r.duration_minutes),visibility:r.visibility,geometrySource:r.geometry_source,revision:r.revision,publishedAt:r.published_at,createdAt:r.created_at,updatedAt:r.updated_at}}
const select='SELECT *, ST_AsGeoJSON(geometry) AS geojson FROM walks';
export function routeId(id:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw new ApiError(404,'Walk not found.','NOT_FOUND');return id}
export async function get(id:string,who:string|null){routeId(id);const {rows}=await db().query(select+' WHERE id=$1',[id]);if(!rows[0]||!canRead(rows[0],who))throw new ApiError(404,'Walk not found.','NOT_FOUND');return rows[0].owner_id===who?present(rows[0]):rows[0].published_snapshot||(()=>{throw new ApiError(404,'Walk not found.','NOT_FOUND')})()}
export async function list(who:string){const {rows}=await db().query(select+' WHERE owner_id=$1 ORDER BY updated_at DESC LIMIT 200',[who]);return rows.map(present)}

// Serialize quota checks with writes for this owner across application processes.
async function ownedWrite<T>(who:string,operation:(client:PoolClient)=>Promise<T>){
 writesEnabled();
 const client=await db().connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[who]);
  const result=await operation(client);
  await client.query('COMMIT');
  return result;
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
async function quota(client:PoolClient,who:string,id:string|null,kind:'geometry'|'snapshot',incoming:number){
 const {rows}=await client.query(
  "SELECT COUNT(*) FILTER (WHERE id IS DISTINCT FROM $2::uuid) AS count, COALESCE(SUM(CASE WHEN id=$2::uuid AND $3='geometry' THEN 0 ELSE ST_NPoints(geometry) END + CASE WHEN id=$2::uuid AND $3='snapshot' THEN 0 ELSE COALESCE(jsonb_array_length(published_snapshot->'geometry'->'coordinates'),0) END),0) AS points FROM walks WHERE owner_id=$1",
  [who,id,kind]);
 checkOwnerQuota(kind==='snapshot'?0:Number(rows[0].count),Number(rows[0].points),incoming);
}
export async function save(x:WalkInput,who:string,id?:string,rev?:number){
 if(x.visibility==='public'&&process.env.ALLOW_PUBLIC_PUBLISH!=='true')throw new ApiError(403,'Public publication is disabled in this beta. Share by unlisted link instead.','PUBLIC_PUBLISH_DISABLED');
 if(id)routeId(id);
 const saved=await ownedWrite(who,async client=>{
  await quota(client,who,id||null,'geometry',x.geometry.coordinates.length);
  const values:unknown[]=[x.title,x.description,JSON.stringify(x.waypoints),JSON.stringify(x.geometry),x.distanceMeters,x.durationMinutes,x.visibility,who,x.geometrySource||'unknown'];
  let sql='INSERT INTO walks(title,description,waypoints,geometry,distance_meters,duration_minutes,visibility,owner_id,geometry_source) VALUES($1,$2,$3::jsonb,ST_SetSRID(ST_GeomFromGeoJSON($4),4326),$5,$6,$7,$8,$9) RETURNING id';
  if(id){
   values.push(id,rev);
   sql="UPDATE walks SET title=$1,description=$2,waypoints=$3::jsonb,geometry=ST_SetSRID(ST_GeomFromGeoJSON($4),4326),distance_meters=$5,duration_minutes=$6,visibility=$7,revision=revision+1,updated_at=now(),published_at=CASE WHEN $7='private' THEN NULL ELSE published_at END,geometry_source=$9 WHERE owner_id=$8 AND id=$10 AND revision=$11 RETURNING id";
  }
  const {rows}=await client.query(sql,values);
  if(!rows.length)throw new ApiError(409,'This walk changed or is no longer available. Reload before saving.','REVISION_CONFLICT');
  return rows[0].id;
 });
 return get(saved,who);
}
export async function publish(id:string,who:string,rev:number,visibility:string){
 routeId(id);
 if(!['public','unlisted'].includes(visibility))throw new ApiError(400,'Choose public or unlisted.');
 if(visibility==='public'&&process.env.ALLOW_PUBLIC_PUBLISH!=='true')throw new ApiError(403,'Public publishing is not available during this beta. Use an unlisted link.','PUBLIC_PUBLISH_DISABLED');
 await ownedWrite(who,async client=>{
  const current=await client.query('SELECT ST_NPoints(geometry) AS points FROM walks WHERE id=$1 AND owner_id=$2 AND revision=$3',[id,who,rev]);
  if(!current.rows.length)throw new ApiError(409,'This walk changed or is no longer available.','REVISION_CONFLICT');
  await quota(client,who,id,'snapshot',Number(current.rows[0].points));
  const {rows}=await client.query("UPDATE walks SET visibility=$1,published_at=COALESCE(published_at,now()),published_snapshot=jsonb_build_object('id',id,'title',title,'description',description,'waypoints',waypoints,'geometry',ST_AsGeoJSON(geometry)::jsonb,'distanceMeters',distance_meters,'durationMinutes',duration_minutes,'geometrySource',geometry_source,'visibility',$1::text,'revision',revision+1,'publishedAt',now(),'createdAt',created_at,'updatedAt',now()),revision=revision+1,updated_at=now() WHERE id=$2 AND owner_id=$3 AND revision=$4 RETURNING id",[visibility,id,who,rev]);
  if(!rows.length)throw new ApiError(409,'This walk changed or is no longer available.','REVISION_CONFLICT');
 });
 return get(id,who);
}
export async function remove(id:string,who:string,rev:number){writesEnabled();routeId(id);const {rowCount}=await db().query('DELETE FROM walks WHERE id=$1 AND owner_id=$2 AND revision=$3',[id,who,rev]);if(!rowCount)throw new ApiError(409,'This walk changed or is no longer available.','REVISION_CONFLICT')}

