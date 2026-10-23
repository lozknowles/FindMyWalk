// Adapted coordinate validation, duplicate removal and GPX structure from user-owned
// Collingham src/utils/gpxImporter.ts + gpxGenerator.ts at 969a12a8665bf7e9b7fe5cac97c17359ca13a189.
// Server parser and XML escaping are new; no Collingham runtime/data/auth dependencies.
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {randomUUID} from 'node:crypto';
import {ApiError,coordinate} from './core';
export function distance(a:number[],b:number[]){const rad=Math.PI/180;const dlat=(b[1]-a[1])*rad,dlng=(b[0]-a[0])*rad;const h=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)))}
const array=(v:any):any[]=>v===undefined?[]:Array.isArray(v)?v:[v];
export function importGpx(xml:string){
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new ApiError(400,'GPX document type declarations and entities are not supported.','INVALID_GPX');
 if(XMLValidator.validate(xml)!==true)throw new ApiError(400,'The GPX XML is malformed.','INVALID_GPX');
 const doc=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',removeNSPrefix:true,processEntities:true}).parse(xml);
 if(!doc.gpx)throw new ApiError(400,'This file is not GPX.','INVALID_GPX');
 const tracks=array(doc.gpx.trk);const segments=tracks.flatMap(t=>array(t.trkseg)).filter(s=>array(s.trkpt).length);
 const routes=array(doc.gpx.rte);
 if(segments.length>1||(!segments.length&&routes.length>1))throw new ApiError(400,'Import a single connected GPX track or route. Multiple segments would need artificial connecting lines.','DISCONNECTED_GPX');
 const points=segments.length?array(segments[0].trkpt):array(routes[0]?.rtept);
 if(points.length<2||points.length>100000)throw new ApiError(400,'GPX must contain 2-100000 track or route points.','INVALID_GPX');
 const coordinates:number[][]=[];for(const p of points){if(p.lon===undefined||p.lat===undefined||!coordinate(Number(p.lon),Number(p.lat)))throw new ApiError(400,'GPX contains an invalid coordinate.','INVALID_GPX');const c=[Number(p.lon),Number(p.lat)];const prev=coordinates.at(-1);if(!prev||Math.abs(c[0]-prev[0])>0.000001||Math.abs(c[1]-prev[1])>0.000001)coordinates.push(c)}
 if(coordinates.length<2)throw new ApiError(400,'GPX needs two distinct points.','INVALID_GPX');
 const distanceMeters=coordinates.slice(1).reduce((s,c,i)=>s+distance(coordinates[i],c),0);
 const title=String(tracks[0]?.name||routes[0]?.name||doc.gpx.metadata?.name||'Imported walk').slice(0,160);
 return {title,waypoints:[coordinates[0],coordinates.at(-1)!].map((c,i)=>({id:randomUUID(),lng:c[0],lat:c[1],kind:i?'finish':'start'})),geometry:{type:'LineString' as const,coordinates},distanceMeters,durationMinutes:Math.max(1,Math.round(distanceMeters/75)),warnings:['Duration is an estimate at 4.5 km/h. Imported tracks have not been checked for access or safety.']};
}
export function escapeXml(s:string){return s.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!))}
export function exportGpx(route:{title:string;geometry:{coordinates:number[][]}}){const name=escapeXml(route.title);return '<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="FindMyWalk" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>'+name+'</name></metadata><trk><name>'+name+'</name><trkseg>'+route.geometry.coordinates.map(c=>'<trkpt lat="'+c[1]+'" lon="'+c[0]+'"></trkpt>').join('')+'</trkseg></trk></gpx>'}

