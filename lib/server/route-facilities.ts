import {ApiError,db} from './core';
import type {Coordinate} from './route-engine';
import {LOCAL_LISTINGS} from './local-listings';

export type RouteFacility={id:string;name:string;category:string;group:'pub'|'cafe'|'landmark';lat:number;lng:number;distanceMeters:number;progress:number;url:string;phone?:string|null;website?:string|null;email?:string|null;source?:'osm'|'collingham-guide';sourceUrl?:string;verifiedAt?:string;positionQuality?:'approximate'|'site';statusNote?:string;address?:string};
export type RouteFacilities={places:RouteFacility[];nearbyPlaces?:RouteFacility[];counts:{pub:number;cafe:number;landmark:number};truncated:boolean;coverage:'full'|'partial';sourceTimestamp:string|null;attribution:string;note:string};
const categories=['pub','cafe','restaurant','fast_food','historic','viewpoint','attraction','museum','gallery','peak','hill','ridge','waterfall','cave_entrance','tower','lighthouse','windmill'];
function group(category:string):RouteFacility['group']{return category==='pub'?'pub':['cafe','restaurant','fast_food'].includes(category)?'cafe':'landmark'}
function contactText(value:unknown,limit:number):string|null{
 if(typeof value!=='string')return null;
 const text=value.trim();
 return text&&text.length<=limit&&!/[\u0000-\u001f\u007f]/.test(text)?text:null;
}
function contactWebsite(value:unknown):string|null{
 const text=contactText(value,2048);
 if(!text||/\s|[<>"\\]/.test(text)||!/^https?:\/\//i.test(text))return null;
 try{const url=new URL(text);return ['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:null}catch{return null}
}
function contactEmail(value:unknown):string|null{
 const text=contactText(value,254);
 return text&&/^[^\s@<>";,]+@[^\s@<>";,]+\.[^\s@<>";,]+$/.test(text)?text:null;
}
function near(a:RouteFacility,b:RouteFacility){
 const dy=(a.lat-b.lat)*111_000,dx=(a.lng-b.lng)*111_000*Math.cos(a.lat*Math.PI/180);
 return Math.hypot(dx,dy)<20;
}
// Used only to decide whether a supplemental listing is relevant; approximate
// guide points are never presented as precise distances or routed destinations.
export function localDistanceToRouteMeters(coordinates:Coordinate[],lng:number,lat:number):number{
 const scale=Math.cos(lat*Math.PI/180),metres=111_000;
 const px=lng*scale*metres,py=lat*metres;
 let best=Infinity;
 for(let i=1;i<coordinates.length;i++){
  const [ax,ay]=[coordinates[i-1][0]*scale*metres,coordinates[i-1][1]*metres];
  const [bx,by]=[coordinates[i][0]*scale*metres,coordinates[i][1]*metres];
  const length=(bx-ax)**2+(by-ay)**2;
  const t=length?Math.max(0,Math.min(1,((px-ax)*(bx-ax)+(py-ay)*(by-ay))/length)):0;
  best=Math.min(best,Math.hypot(px-(ax+t*(bx-ax)),py-(ay+t*(by-ay))));
 }
 return best;
}
function sameMappedPlace(a:RouteFacility,b:{name:string;category:string;lat:number;lng:number}):boolean{
 return a.category===b.category&&a.name.trim().toLowerCase()===b.name.trim().toLowerCase()&&
  Math.hypot((a.lat-b.lat)*111_000,(a.lng-b.lng)*111_000*Math.cos(b.lat*Math.PI/180))<150;
}
export async function routeFacilities(coordinates:Coordinate[],corridorMeters=100):Promise<RouteFacilities>{
 if(coordinates.length<2||coordinates.length>5000)throw new ApiError(400,'Choose a route with 2–5,000 points.','INVALID_ROUTE');
 const geometry=JSON.stringify({type:'LineString',coordinates});
 const {rows}=await db().query(`
  WITH route AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS geom),
  candidate AS (
   SELECT p.osm_type,p.osm_id,p.name,p.category,
    to_jsonb(p)->>'phone' AS phone,to_jsonb(p)->>'website' AS website,to_jsonb(p)->>'email' AS email,ST_Y(p.location) AS lat,ST_X(p.location) AS lng,
    ST_Distance(p.location::geography,route.geom::geography) AS distance_m,
    ST_LineLocatePoint(route.geom,p.location) AS progress
   FROM osm_pois p CROSS JOIN route
   WHERE p.family='place' AND p.category=ANY($2::text[])
    AND ST_DWithin(p.location::geography,route.geom::geography,$3)
   ORDER BY progress,distance_m,p.osm_type,p.osm_id LIMIT 151
  )
  SELECT candidate.*,extract.source_timestamp,ST_Covers(extract.coverage,route.geom) AS covered
  FROM candidate CROSS JOIN osm_extracts extract CROSS JOIN route WHERE extract.id=1
  ORDER BY progress,distance_m,osm_type,osm_id`,[geometry,categories,corridorMeters]);
 const {rows:meta}=await db().query('SELECT source_timestamp,ST_Covers(coverage,ST_SetSRID(ST_GeomFromGeoJSON($1),4326)) AS covered FROM osm_extracts WHERE id=1',[geometry]);
 if(!meta.length)throw new ApiError(503,'Local map discovery is unavailable.','DISCOVERY_NOT_READY');
 const places:RouteFacility[]=[];
 for(const row of rows){
  const category=String(row.category),name=String(row.name);
  if(group(category)==='landmark'&&name.toLowerCase()===category.replaceAll('_',' ').toLowerCase())continue;
  const item:RouteFacility={id:row.osm_type+'/'+row.osm_id,name,category,group:group(category),lat:Number(row.lat),lng:Number(row.lng),distanceMeters:Math.round(Number(row.distance_m)),progress:Number(row.progress),url:'https://www.openstreetmap.org/'+row.osm_type+'/'+row.osm_id,source:'osm',phone:contactText(row.phone,100),website:contactWebsite(row.website),email:contactEmail(row.email)};
  if(places.some(p=>p.category===item.category&&p.name.trim().toLowerCase()===item.name.trim().toLowerCase()&&near(p,item)))continue;
  places.push(item);
 }
 const bounded=places.slice(0,24);
 const nearbyPlaces:RouteFacility[]=LOCAL_LISTINGS.flatMap(listing=>{
  const distance=localDistanceToRouteMeters(coordinates,listing.lng,listing.lat);
  if(distance>1500||places.some(place=>sameMappedPlace(place,listing)))return [];
  return [{id:listing.id,name:listing.name,category:listing.category,group:'cafe' as const,
   lat:listing.lat,lng:listing.lng,distanceMeters:Math.round(distance),progress:0,
   url:listing.sourceUrl,source:'collingham-guide' as const,sourceUrl:listing.sourceUrl,
   verifiedAt:listing.verifiedAt,positionQuality:listing.positionQuality,
   statusNote:listing.statusNote,address:listing.address}];
 });
 return {places:bounded,nearbyPlaces,counts:{pub:bounded.filter(p=>p.group==='pub').length,cafe:bounded.filter(p=>p.group==='cafe').length,landmark:bounded.filter(p=>p.group==='landmark').length},truncated:rows.length>150||places.length>24,coverage:meta[0].covered?'full':'partial',sourceTimestamp:meta[0].source_timestamp??null,attribution:'© OpenStreetMap contributors',note:'Mapped OpenStreetMap places within '+corridorMeters+' m of the route. Supplemental Collingham listings are separate and use approximate guide positions. Proximity does not establish access, current opening or a safe detour.'};
}
