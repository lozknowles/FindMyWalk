import {it,expect,vi} from 'vitest';
const {owner,save,remove}=vi.hoisted(()=>({owner:vi.fn(async()=>'rotating-browser'),save:vi.fn(async()=>({id:'saved'})),remove:vi.fn()}));
vi.mock('next/headers',()=>({cookies:vi.fn()}));
vi.mock('../../lib/server/core',async()=>{
 const actual=await vi.importActual<typeof import('../../lib/server/core')>('../../lib/server/core');
 return {...actual,owner};
});
vi.mock('../../lib/server/walks',()=>({list:vi.fn(),save,remove,get:vi.fn(),validate:(input:unknown)=>input}));
import {POST} from '../../app/api/routes/route';
import {DELETE} from '../../app/api/routes/[id]/route';
it('shares mutation rate budget across paths regardless of anonymous owner identity',async()=>{
 delete process.env.WRITES_ENABLED;
 process.env.PUBLIC_ORIGIN='https://walk.example';
 for(let i=0;i<60;i++){
  owner.mockResolvedValueOnce('browser-'+i);
  const response=await POST(new Request('http://internal/api/routes',{method:'POST',headers:{origin:'https://walk.example'},body:'{}'}));
  expect(response.status).toBe(201);
 }
 const blocked=await DELETE(new Request('http://internal/api/routes/id?revision=1',{method:'DELETE',headers:{origin:'https://walk.example'}}),{params:Promise.resolve({id:'id'})});
 expect(blocked.status).toBe(429);
 expect((await blocked.json()).code).toBe('RESOURCE_LIMIT');
 expect(owner).toHaveBeenCalledTimes(60);
 expect(save).toHaveBeenCalledTimes(60);
 expect(remove).not.toHaveBeenCalled();
 delete process.env.PUBLIC_ORIGIN;
});
