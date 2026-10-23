import {describe,it,expect,vi} from 'vitest';
vi.mock('next/headers',()=>({cookies:vi.fn()}));
import {createAdmission,checkOwnerQuota} from '../../lib/server/resource-limits';
describe('public resource budgets',()=>{
 it('holds concurrency across minute rollover and releases once',()=>{
  let time=0;const admit=createAdmission(10,2,()=>time);
  const first=admit(),second=admit();
  expect(()=>admit()).toThrow();
  time=60_000;expect(()=>admit()).toThrow();
  first();first();const third=admit();
  expect(()=>admit()).toThrow();
  second();third();expect(()=>admit()).not.toThrow();
 });
 it('counts completed work in the rate budget and resets on the next minute',()=>{
  let time=0;const admit=createAdmission(2,1,()=>time);
  admit()();admit()();expect(()=>admit()).toThrow();
  time=60_000;expect(()=>admit()).not.toThrow();
 });
 it('permits the geometry boundary and rejects route/geometry overflow',()=>{
  expect(()=>checkOwnerQuota(24,249998,2)).not.toThrow();
  expect(()=>checkOwnerQuota(25,0,2)).toThrow();
  expect(()=>checkOwnerQuota(24,249999,2)).toThrow();
 });
});
