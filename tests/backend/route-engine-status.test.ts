import {afterEach,describe,it,expect,vi} from 'vitest';
import {routePedestrian} from '../../lib/server/route-engine';

afterEach(()=>{vi.unstubAllGlobals();delete process.env.VALHALLA_URL});
describe('pedestrian router response classification',()=>{
 it.each([[503,'ROUTING_UNAVAILABLE'],[429,'ROUTING_UNAVAILABLE'],[400,'NO_PEDESTRIAN_ROUTE']] as const)('classifies HTTP %i as %s',async(status,code)=>{
  process.env.VALHALLA_URL='http://router.test';
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status})));
  await expect(routePedestrian([[0,0],[.01,.01]],100)).rejects.toMatchObject({code});
 });
});
