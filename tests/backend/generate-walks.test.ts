import {describe,it,expect} from 'vitest';
import {ApiError} from '../../lib/server/core';
import {generateWalks,loopQuality,MAX_ATTEMPTS} from '../../lib/server/generate-walks';
import type {PedestrianRoute,Coordinate} from '../../lib/server/route-engine';

const start:Coordinate=[-.76,53.14];
function circle(turns=1):PedestrianRoute{
 const coordinates:Coordinate[]=[];
 for(let i=0;i<=36*turns;i++){
  const angle=2*Math.PI*i/36;
  coordinates.push([start[0]+.004*Math.cos(angle)-.004,start[1]+.002*Math.sin(angle)]);
 }
 return {geometry:{type:'LineString',coordinates},distanceMeters:2000*turns,durationMinutes:25*turns,source:'valhalla-pedestrian',warnings:[]};
}
describe('generated loop acceptance',()=>{
 it('accepts a closed distinct walk and rejects a reversed duplicate',()=>{
  const first=circle();
  expect(loopQuality(first,start,2,[])).toBe(true);
  const reversed={...first,geometry:{type:'LineString' as const,coordinates:[...first.geometry.coordinates].reverse()}};
  expect(loopQuality(reversed,start,2,[{...first,title:'First',targetKm:2,start:{lat:start[1],lng:start[0],label:'Start'},waypoints:[]}])).toBe(false);
 });
 it('rejects repeated traversal, disconnected starts and wrong actual length',()=>{
  expect(loopQuality(circle(2),start,4,[])).toBe(false);
  expect(loopQuality({...circle(),distanceMeters:3000},start,2,[])).toBe(false);
  const shifted=circle();shifted.geometry.coordinates=shifted.geometry.coordinates.map(([lng,lat])=>[lng+.02,lat]);
  expect(loopQuality(shifted,start,2,[])).toBe(false);
 });
 it('bounds failed candidate searches and returns an honest partial result',async()=>{
  const result=await generateWalks(start,'Collingham',2,5,{route:async()=>{throw new ApiError(422,'No pedestrian route','NO_PEDESTRIAN_ROUTE')},covers:async()=>true,now:()=>0});
  expect(result.attempts).toBe(MAX_ATTEMPTS);
  expect(result.routes).toHaveLength(0);
  expect(result.warning).toMatch(/Only 0 distinct mapped loops/);
 });
});
