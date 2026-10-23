import {describe,it,expect} from 'vitest';
import {bearing,distance,project,smoothHeading,destinationLink} from '../../lib/ar/projection';
import {readCompass,stopStream,compassUsable} from '../../lib/ar/sensors';
const origin={lat:53,lng:0};
const north={id:'north',name:'North feature',lat:53.001,lng:0};
describe('AR geospatial approximation',()=>{
 it('computes cardinal bearings and distances',()=>{expect(bearing(origin,north)).toBeCloseTo(0);expect(bearing(origin,{lat:53,lng:.001})).toBeCloseTo(90,2);expect(distance(origin,north)).toBeCloseTo(111.195,1);});
 it('projects north in centre and excludes places behind the camera',()=>{const labels=project([north,{...north,id:'south',lat:52.999}],origin,0);expect(labels).toHaveLength(1);expect(labels[0].x).toBeCloseTo(50);});
 it('handles heading wrap without jumping south',()=>{expect(smoothHeading(359,1)).toBeCloseTo(359.4);expect(project([north],origin,359)[0].x).toBeGreaterThan(50);});
 it('declutters deterministically regardless of provider order',()=>{const crowded=Array.from({length:12},(_,i)=>({...north,id:'p'+i,lat:53.001+i*.0001}));const a=project(crowded,origin,0),b=project([...crowded].reverse(),origin,0);expect(a.map(p=>p.feature.id)).toEqual(b.map(p=>p.feature.id));expect(a).toHaveLength(3);expect(new Set(a.map(p=>p.lane)).size).toBe(3);});
 it('excludes colocated and distant features',()=>{expect(project([{...north,...origin},{...north,id:'far',lat:54}],origin,0)).toHaveLength(0);});
 it('encodes builder destination contract',()=>{expect(destinationLink({...north,name:'Church & café'})).toBe('/create?to=0,53.001&name=Church%20%26%20caf%C3%A9');expect(destinationLink(north,'walk-123')).toBe('/create?id=walk-123&to=0,53.001&name=North%20feature');});
});
describe('sensor fixtures',()=>{
 const fixture=(data:Record<string,unknown>)=>data as unknown as DeviceOrientationEvent;
 it('rejects relative and invalid compass data',()=>{expect(readCompass(fixture({absolute:false,alpha:12}))).toBeNull();expect(readCompass(fixture({webkitCompassHeading:20,webkitCompassAccuracy:-1}))).toBeNull();expect(readCompass(fixture({absolute:true,alpha:null}))).toBeNull();});
 it('reads absolute Android orientation with screen rotation',()=>{expect(readCompass(fixture({absolute:true,alpha:270}),90)?.heading).toBe(180);});
 it('prefers iOS compass with its accuracy',()=>{expect(readCompass(fixture({webkitCompassHeading:25,webkitCompassAccuracy:8,alpha:100,absolute:true}))).toEqual({heading:25,accuracy:8,source:'webkit-compass'});});
 it('suppresses known poor compass accuracy while allowing unknown accuracy',()=>{expect(compassUsable(31)).toBe(false);expect(compassUsable(30)).toBe(true);expect(compassUsable(null)).toBe(true);});
 it('stops every camera track',()=>{let stopped=0;stopStream({getTracks:()=>[{stop:()=>stopped++},{stop:()=>stopped++}]} as unknown as MediaStream);expect(stopped).toBe(2);stopStream(null);});
});
