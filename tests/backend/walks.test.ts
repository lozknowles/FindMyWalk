import {describe,it,expect,vi,beforeEach} from 'vitest';
import {randomUUID} from 'node:crypto';
vi.mock('next/headers',()=>({cookies:vi.fn()}));
import {canRead,validate,save,publish,remove,get} from '../../lib/server/walks';
import {sign,verify,origin,revision} from '../../lib/server/core';
const query=vi.fn();
vi.mock('pg',()=>({Pool:class {query=query}}));
const who=randomUUID();
const input={title:'Test walk',description:'',waypoints:[{id:'a',lat:53,lng:-.7,kind:'start'},{id:'b',lat:53.01,lng:-.7,kind:'finish'}],geometry:{type:'LineString' as const,coordinates:[[-.7,53],[-.7,53.01]]},distanceMeters:1112,durationMinutes:15,visibility:'private' as const};
beforeEach(()=>{process.env.SESSION_SECRET='test-only-secret-at-least-thirty-two-characters';process.env.DATABASE_URL='postgres://unused';query.mockReset()});
describe('anonymous owner authority',()=>{
 it('accepts its signed owner and rejects tampering or appended data',()=>{const token=sign(who);expect(verify(token)).toBe(who);expect(verify(token.replace(who,randomUUID()))).toBeNull();expect(verify(token+'.extra')).toBeNull();expect(verify('bad')).toBeNull()});
 it('requires owner for drafts and private walks even after prior publication',()=>{expect(canRead({owner_id:who,visibility:'private',published_at:new Date()},null)).toBe(false);expect(canRead({owner_id:who,visibility:'public',published_at:null},null)).toBe(false);expect(canRead({owner_id:who,visibility:'private',published_at:null},who)).toBe(true);expect(canRead({owner_id:who,visibility:'unlisted',published_at:new Date()},null)).toBe(true)});
 it('binds update, publish and delete to owner AND revision',async()=>{query.mockResolvedValue({rows:[],rowCount:0});const id=randomUUID();await expect(save(input,who,id,2)).rejects.toMatchObject({status:409});expect(query.mock.calls[0][0]).toContain('owner_id=$8 AND id=$10 AND revision=$11');expect(query.mock.calls[0][0]).not.toContain('published_snapshot=');expect(query.mock.calls[0][1].slice(-4)).toEqual([who,'unknown',id,2]);await expect(publish(id,who,2,'public')).rejects.toMatchObject({status:409});expect(query.mock.calls[1][0]).toContain('published_snapshot=jsonb_build_object');expect(query.mock.calls[1][1]).toEqual(['public',id,who,2]);await expect(remove(id,who,2)).rejects.toMatchObject({status:409});expect(query.mock.calls[2][1]).toEqual([id,who,2])});
 it('serves immutable snapshot to visitors and current draft to owner',async()=>{const id=randomUUID();const snapshot={id,title:'Published title',geometry:input.geometry,revision:2};query.mockResolvedValue({rows:[{id,owner_id:who,visibility:'public',published_at:new Date(),published_snapshot:snapshot,title:'Changed draft',geojson:JSON.stringify(input.geometry)}]});expect(await get(id,null)).toEqual(snapshot);expect((await get(id,who)).title).toBe('Changed draft')});
 it('rejects cross origin mutation',()=>{expect(()=>origin(new Request('https://walk.example/api/routes',{headers:{origin:'https://evil.example'}}))).toThrow();expect(()=>origin(new Request('https://walk.example/api/routes',{headers:{origin:'https://walk.example'}}))).not.toThrow()});
});
describe('route contract',()=>{
 it('preserves ordered unique waypoint IDs',()=>{expect(validate(input).waypoints.map(w=>w.id)).toEqual(['a','b']);expect(()=>validate({...input,waypoints:[input.waypoints[0],input.waypoints[0]]})).toThrow()});
 it('rejects impossible geometry and missing revision',()=>{expect(()=>validate({...input,geometry:{type:'LineString',coordinates:[[181,53],[0,0]]}})).toThrow();expect(()=>revision(undefined)).toThrow();expect(()=>revision(0)).toThrow()});
});

