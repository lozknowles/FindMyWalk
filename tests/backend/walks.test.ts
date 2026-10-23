import {describe,it,expect,vi,beforeEach} from 'vitest';
import {randomUUID} from 'node:crypto';
vi.mock('next/headers',()=>({cookies:vi.fn()}));
import {canRead,validate,save,publish,remove,get} from '../../lib/server/walks';
import {sign,verify,origin,revision} from '../../lib/server/core';
const query=vi.fn();
vi.mock('pg',()=>({Pool:class {query=query;async connect(){return {query,release:vi.fn()}}}}));
const who=randomUUID();
const input={title:'Test walk',description:'',waypoints:[{id:'a',lat:53,lng:-.7,kind:'start'},{id:'b',lat:53.01,lng:-.7,kind:'finish'}],geometry:{type:'LineString' as const,coordinates:[[-.7,53],[-.7,53.01]]},distanceMeters:1112,durationMinutes:15,visibility:'private' as const};
beforeEach(()=>{delete process.env.WRITES_ENABLED;process.env.ALLOW_PUBLIC_PUBLISH='true';delete process.env.PUBLIC_ORIGIN;process.env.SESSION_SECRET='test-only-secret-at-least-thirty-two-characters';process.env.DATABASE_URL='postgres://unused';query.mockReset()});
describe('anonymous owner authority',()=>{
 it('accepts its signed owner and rejects tampering or appended data',()=>{const token=sign(who);expect(verify(token)).toBe(who);expect(verify(token.replace(who,randomUUID()))).toBeNull();expect(verify(token+'.extra')).toBeNull();expect(verify('bad')).toBeNull()});
 it('requires owner for drafts and private walks even after prior publication',()=>{expect(canRead({owner_id:who,visibility:'private',published_at:new Date()},null)).toBe(false);expect(canRead({owner_id:who,visibility:'public',published_at:null},null)).toBe(false);expect(canRead({owner_id:who,visibility:'private',published_at:null},who)).toBe(true);expect(canRead({owner_id:who,visibility:'unlisted',published_at:new Date()},null)).toBe(true)});
 it('binds update, publish and delete to owner AND revision',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT COUNT')?[{count:0,points:0}]:sql.startsWith('SELECT ST_NPoints')?[{points:2}]:[],rowCount:0}));
  const id=randomUUID();
  await expect(save(input,who,id,2)).rejects.toMatchObject({status:409});
  const update=query.mock.calls.find(c=>c[0].startsWith('UPDATE'))!;
  expect(update[0]).toContain('owner_id=$8 AND id=$10 AND revision=$11');
  expect(update[0]).not.toContain('published_snapshot=');
  expect(update[1].slice(-4)).toEqual([who,'unknown',id,2]);
  await expect(publish(id,who,2,'public')).rejects.toMatchObject({status:409});
  expect(query.mock.calls.find(c=>c[0].startsWith('SELECT ST_NPoints'))![1]).toEqual([id,who,2]);
  const publication=query.mock.calls.filter(c=>c[0].startsWith('UPDATE'))[1];
  expect(publication[0]).toContain('id=$2 AND owner_id=$3 AND revision=$4');
  expect(publication[1]).toEqual(['public',id,who,2]);
  await expect(remove(id,who,2)).rejects.toMatchObject({status:409});
  expect(query.mock.calls.at(-1)![1]).toEqual([id,who,2]);
 });
 it('locks the owner before checking aggregate quota and rolls back over-limit writes',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT COUNT')?[{count:25,points:50}]:[]}));
  await expect(save(input,who)).rejects.toMatchObject({status:429,code:'OWNER_STORAGE_LIMIT'});
  expect(query.mock.calls.map(c=>c[0]).slice(0,3)).toEqual(['BEGIN','SELECT pg_advisory_xact_lock(hashtextextended($1,0))',expect.stringContaining('SELECT COUNT')]);
  expect(query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
  expect(query.mock.calls.some(c=>c[0].startsWith('INSERT'))).toBe(false);
 });
 it('includes published geometry in storage quotas and checks replacement snapshot before publication',async()=>{
  query.mockImplementation(async(sql:string)=>({rows:sql.startsWith('SELECT ST_NPoints')?[{points:100}]:sql.startsWith('SELECT COUNT')?[{count:24,points:249950}]:[]}));
  await expect(publish(randomUUID(),who,2,'public')).rejects.toMatchObject({code:'OWNER_STORAGE_LIMIT'});
  const quotaQuery=query.mock.calls.find(c=>c[0].startsWith('SELECT COUNT'))!;
  expect(quotaQuery[0]).toContain("published_snapshot->'geometry'->'coordinates'");
  expect(quotaQuery[1][2]).toBe('snapshot');
  expect(query.mock.calls.some(c=>c[0].startsWith('UPDATE'))).toBe(false);
 });
 it('disallows public publishing by default before database work',async()=>{
  delete process.env.ALLOW_PUBLIC_PUBLISH;
  await expect(publish(randomUUID(),who,1,'public')).rejects.toMatchObject({status:403,code:'PUBLIC_PUBLISH_DISABLED'});
  await expect(save({...input,visibility:'public'},who)).rejects.toMatchObject({status:403,code:'PUBLIC_PUBLISH_DISABLED'});
  expect(query).not.toHaveBeenCalled();
 });
 it('pauses persistence before opening a database connection',async()=>{
  process.env.WRITES_ENABLED='false';
  await expect(save(input,who)).rejects.toMatchObject({code:'WRITES_PAUSED'});
  await expect(publish(randomUUID(),who,1,'public')).rejects.toMatchObject({code:'WRITES_PAUSED'});
  await expect(remove(randomUUID(),who,1)).rejects.toMatchObject({code:'WRITES_PAUSED'});
  expect(query).not.toHaveBeenCalled();
 });
 it('serves immutable snapshot to visitors and current draft to owner',async()=>{const id=randomUUID();const snapshot={id,title:'Published title',geometry:input.geometry,revision:2};query.mockResolvedValue({rows:[{id,owner_id:who,visibility:'public',published_at:new Date(),published_snapshot:snapshot,title:'Changed draft',geojson:JSON.stringify(input.geometry)}]});expect(await get(id,null)).toEqual(snapshot);expect((await get(id,who)).title).toBe('Changed draft')});
 it('uses explicitly configured external origin behind the production server',()=>{try{vi.stubEnv('NODE_ENV','production');process.env.PUBLIC_ORIGIN='https://walk.example';expect(()=>origin(new Request('http://internal:3108/api/routes',{headers:{origin:'https://walk.example',host:'internal:3108'}}))).not.toThrow();expect(()=>origin(new Request('http://internal:3108/api/routes',{headers:{origin:'https://evil.example','x-forwarded-host':'walk.example'}}))).toThrow();delete process.env.PUBLIC_ORIGIN;expect(()=>origin(new Request('http://internal/api/routes'))).toThrow('PUBLIC_ORIGIN')}finally{vi.unstubAllEnvs();delete process.env.PUBLIC_ORIGIN}});
 it('does not trust forwarded host headers or invalid origin configuration',()=>{process.env.PUBLIC_ORIGIN='https://walk.example/path';expect(()=>origin(new Request('https://walk.example/api/routes'))).toThrow('PUBLIC_ORIGIN');delete process.env.PUBLIC_ORIGIN;expect(()=>origin(new Request('http://localhost/api/routes',{headers:{host:'localhost',origin:'https://evil.example','x-forwarded-host':'evil.example'}}))).toThrow()});
 it('rejects cross origin mutation',()=>{expect(()=>origin(new Request('https://walk.example/api/routes',{headers:{origin:'https://evil.example'}}))).toThrow();expect(()=>origin(new Request('https://walk.example/api/routes',{headers:{origin:'https://walk.example'}}))).not.toThrow()});
});
describe('route contract',()=>{
 it('preserves ordered unique waypoint IDs',()=>{expect(validate(input).waypoints.map(w=>w.id)).toEqual(['a','b']);expect(()=>validate({...input,waypoints:[input.waypoints[0],input.waypoints[0]]})).toThrow()});
 it('preserves bounded destination labels from AR and place discovery',()=>{const walk=validate({...input,waypoints:[{...input.waypoints[0],label:'  My start  '},{...input.waypoints[1],label:'Long name'.repeat(40)}]});expect(walk.waypoints[0].label).toBe('My start');expect(walk.waypoints[1].label?.length).toBe(160)});
 it('rejects impossible geometry and missing revision',()=>{expect(()=>validate({...input,geometry:{type:'LineString',coordinates:[[181,53],[0,0]]}})).toThrow();expect(()=>revision(undefined)).toThrow();expect(()=>revision(0)).toThrow()});
});

