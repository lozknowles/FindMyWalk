export type Coordinate = {lat:number;lng:number};
export type Feature = Coordinate & {id:string;name:string;category?:string;kind?:string;url?:string};
const rad=Math.PI/180;
export function wrap(degrees:number){return ((degrees+180)%360+360)%360-180;}
export function distance(a:Coordinate,b:Coordinate){const h=Math.sin((b.lat-a.lat)*rad/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin((b.lng-a.lng)*rad/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function bearing(a:Coordinate,b:Coordinate){const dl=(b.lng-a.lng)*rad;return (Math.atan2(Math.sin(dl)*Math.cos(b.lat*rad),Math.cos(a.lat*rad)*Math.sin(b.lat*rad)-Math.sin(a.lat*rad)*Math.cos(b.lat*rad)*Math.cos(dl))/rad+360)%360;}
export function smoothHeading(previous:number|null,next:number){return previous===null?next:(previous+wrap(next-previous)*.2+360)%360;}
/** Approximate compass projection; no terrain, elevation, object recognition or occlusion. */
export function project(features:Feature[],origin:Coordinate,heading:number,fov=65){
 const visible=features.map(feature=>({feature,distance:distance(origin,feature),angle:wrap(bearing(origin,feature)-heading)})).filter(p=>p.distance>=5&&p.distance<=2000&&Math.abs(p.angle)<fov/2);
 // Distance then ID makes selection deterministic across provider ordering and sensor updates.
 visible.sort((a,b)=>a.distance-b.distance||a.feature.id.localeCompare(b.feature.id));
 const labels: Array<typeof visible[number]&{x:number;lane:number}>=[];
 for(const p of visible){const x=50+Math.tan(p.angle*rad)/Math.tan(fov*rad/2)*50;const lane=[0,1,2].find(l=>!labels.some(q=>q.lane===l&&Math.abs(q.x-x)<30));if(lane!==undefined)labels.push({...p,x,lane});if(labels.length===6)break;}
 return labels;
}
export function destinationLink(feature:Feature,routeId?:string){return '/create?'+(routeId?'id='+encodeURIComponent(routeId)+'&':'')+'to='+feature.lng+','+feature.lat+'&name='+encodeURIComponent(feature.name);}
