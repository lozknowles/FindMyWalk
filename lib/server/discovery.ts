import {ApiError,coordinate,db} from './core';
const attribution='© OpenStreetMap contributors, ODbL';
const provider='Local OpenStreetMap extract';
type Coverage={region:string;source_url:string;source_timestamp:string|null;imported_at:string;pbf_sha256:string;covered:boolean;overlap:boolean;clipped_geojson:string};
async function coverage(geometrySql:string,values:number[]):Promise<Coverage>{
 const {rows}=await db().query('WITH requested AS (SELECT '+geometrySql+' AS geometry) SELECT region,source_url,source_timestamp,imported_at,pbf_sha256,ST_Covers(coverage,requested.geometry) AS covered,ST_Area(ST_Intersection(coverage,requested.geometry))>0 AS overlap,ST_AsGeoJSON(ST_Intersection(coverage,requested.geometry)) AS clipped_geojson FROM osm_extracts CROSS JOIN requested WHERE id=1',values);
 if(!rows.length)throw new ApiError(503,'Local map discovery has not been imported yet.','DISCOVERY_NOT_READY');
 if(!rows[0].overlap)throw new ApiError(422,'This area does not overlap the imported '+rows[0].region+' discovery coverage.','OUTSIDE_COVERAGE');
 return rows[0];
}
function metadata(c:Coverage){return {provider,attribution,coverage:{region:c.region,sourceUrl:c.source_url,sourceTimestamp:c.source_timestamp,importedAt:c.imported_at,pbfSha256:c.pbf_sha256,partial:!c.covered},warnings:[...(!c.covered?['Only part of this search area is inside the imported '+c.region+' coverage. Results cover that part only.']:[]),'Map features reflect the imported OpenStreetMap extract and may be incomplete or out of date.']}}
export async function places(bbox:string|null){
 const parts=(bbox||'').split(',');const b=parts.map(Number);
 if(parts.length!==4||parts.some(p=>!p.trim())||!coordinate(b[0],b[1])||!coordinate(b[2],b[3])||b[0]>=b[2]||b[1]>=b[3]||b[2]-b[0]>0.15||b[3]-b[1]>0.15)throw new ApiError(400,'Choose a map area no wider than 0.15 degrees.','INVALID_BOUNDS');
 const c=await coverage('ST_MakeEnvelope($1,$2,$3,$4,4326)',b);
 const {rows}=await db().query("SELECT osm_type,osm_id,name,category,ST_Y(location) AS lat,ST_X(location) AS lng FROM osm_pois WHERE family='place' AND ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),location) ORDER BY name,osm_type,osm_id LIMIT 101",[c.clipped_geojson]);
 return {...metadata(c),truncated:rows.length>100,places:rows.slice(0,100).map(e=>({id:e.osm_type+'/'+e.osm_id,name:e.name,category:e.category,lat:e.lat,lng:e.lng,source:'OpenStreetMap',url:'https://www.openstreetmap.org/'+e.osm_type+'/'+e.osm_id}))};
}
export async function transport(lat:number,lng:number){
 if(!coordinate(lng,lat))throw new ApiError(400,'Valid latitude and longitude are required.','INVALID_COORDINATE');
 const values=[lng,lat];
 const c=await coverage('ST_Buffer(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,2000)::geometry',values);
 const {rows}=await db().query("SELECT osm_type,osm_id,name,category,ST_Y(location) AS lat,ST_X(location) AS lng,ST_Distance(location::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance FROM osm_pois WHERE family='transport' AND ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON($3),4326),location) AND ST_DWithin(location::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,2000) ORDER BY distance,osm_type,osm_id LIMIT 81",[...values,c.clipped_geojson]);
 return {...metadata(c),truncated:rows.length>80,stops:rows.slice(0,80).map(e=>({id:e.osm_type+'/'+e.osm_id,name:e.name,kind:e.category,lat:e.lat,lng:e.lng,distanceMeters:Math.round(e.distance),source:'OpenStreetMap'})),journeyPlannerUrl:'https://www.traveline.info/',warnings:[...metadata(c).warnings,'Nearby mapped stops only. Check current services and timetables with the operator or Traveline.']};
}

