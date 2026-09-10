import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixture=vi.hoisted(()=>({stats:new Map<string,string>(),scanError:null as Error|null}));
vi.mock('node:fs',async()=>{
 const actual=await vi.importActual<typeof import('node:fs')>('node:fs');
 return {...actual,
  readdirSync:(path:any,options:any)=>{
   if(path!=='/proc')return actual.readdirSync(path,options);
   if(fixture.scanError)throw fixture.scanError;
   // Node may lstat DT_UNKNOWN entries while constructing Dirents. A PID can
   // disappear there, BEFORE the caller reaches its per-entry error handler.
   if(options?.withFileTypes)throw Object.assign(Error("ENOENT: lstat '/proc/700099'"),{code:'ENOENT',syscall:'lstat',path:'/proc/700099'});
   return ['self','700099',...fixture.stats.keys()];
  },
  readFileSync:(path:any,options:any)=>{
   if(path==='/proc/sys/kernel/random/boot_id')return 'fixture-boot';
   const match=typeof path==='string'&&/^\/proc\/(\d+)\/stat$/.exec(path);
   if(match){const value=fixture.stats.get(match[1]);if(value===undefined)throw Object.assign(Error('fixture process vanished'),{code:'ENOENT'});return value;}
   return actual.readFileSync(path,options);
  },
 };
});
import { cleanupQualificationProcessGroupAfterLeaderExit } from '../src/qualification-process.js';
function stat(group:number,start:string){const fields=Array(20).fill('0');fields[0]='S';fields[1]='1';fields[2]=String(group);fields[19]=start;return `1 (fixture process) ${fields.join(' ')}`;}
const original={pid:700001,platform:'linux' as const,boot_id:'fixture-boot',start_ticks:'7'};
const platform=Object.getOwnPropertyDescriptor(process,'platform')!;
beforeEach(()=>{
 // The filesystem and signals are virtual: exercise the Linux algorithm on every test host.
 Object.defineProperty(process,'platform',{...platform,value:'linux'});
 fixture.stats.clear();fixture.scanError=null;vi.spyOn(process,'kill').mockImplementation(()=>true);
});
afterEach(()=>{vi.restoreAllMocks();Object.defineProperty(process,'platform',platform);});
describe('qualification process enumeration under /proc churn',()=>{
 it('reaps matching survivors despite an unrelated disappearing directory entry',async()=>{
  fixture.stats.set('700002',stat(700001,'8'));fixture.stats.set('700003',stat(42,'9'));
  await cleanupQualificationProcessGroupAfterLeaderExit(original.pid,original);
  expect(process.kill).toHaveBeenCalledTimes(2);
  expect(process.kill).toHaveBeenNthCalledWith(1,700002,'SIGTERM');expect(process.kill).toHaveBeenNthCalledWith(2,700002,'SIGKILL');
 });
 it('never signals a group with a reused leader occurrence',async()=>{
  fixture.stats.set('700001',stat(700001,'99'));fixture.stats.set('700002',stat(700001,'8'));
  await cleanupQualificationProcessGroupAfterLeaderExit(original.pid,original);expect(process.kill).not.toHaveBeenCalled();
 });
 it('rechecks each occurrence before escalation rather than trusting its numeric PID',async()=>{
  fixture.stats.set('700002',stat(700001,'8'));
  vi.mocked(process.kill).mockImplementation(()=>{fixture.stats.set('700002',stat(700001,'99'));return true;});
  await cleanupQualificationProcessGroupAfterLeaderExit(original.pid,original);
  expect(process.kill).toHaveBeenCalledTimes(1);expect(process.kill).toHaveBeenCalledWith(700002,'SIGTERM');
 });
 it('keeps a whole-directory failure loud rather than reporting an empty group',async()=>{
  fixture.scanError=Object.assign(Error('fixture unreadable proc'),{code:'EACCES'});
  await expect(cleanupQualificationProcessGroupAfterLeaderExit(original.pid,original)).rejects.toBe(fixture.scanError);
  expect(process.kill).not.toHaveBeenCalled();
 });
});
