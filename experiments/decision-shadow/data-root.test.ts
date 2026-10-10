import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSessionCollection, resolveDataRoot, writePrivateNew } from './data-root.mjs';
import { retainHandoffSource } from '../../packages/pi-extension/src/jev-packet.js';

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function temporary(){const root=await mkdtemp(join(tmpdir(),'central-learning-data-'));roots.push(root);return root;}
const linux=process.platform==='linux'?describe:describe.skip;
linux('central private session collections',()=>{
  it('resolves explicit configuration without creating files and refuses relative or empty roots',async()=>{
    const root=await temporary(), custom=join(root,'configured'), explicit=join(root,'override');
    expect(resolveDataRoot({env:{},home:root})).toBe(join(root,'.skill-harness'));
    expect(resolveDataRoot({env:{SKILL_HARNESS_DATA_ROOT:custom},home:root})).toBe(custom);
    expect(resolveDataRoot({env:{SKILL_HARNESS_DATA_ROOT:custom},home:root,override:explicit})).toBe(explicit);
    for(const override of ['', 'relative/path', 'bad\0path', join(root,'bad\npath'), join(root,'bad\u001bpath'), join(root,'bad\u202epath')])expect(()=>resolveDataRoot({override})).toThrow(/absolute path/);
    expect(await readdir(root)).toEqual([]);
    expect(()=>retainHandoffSource({} as never,()=>{throw Error('storage permission revoked');},custom))
      .toThrow('storage permission revoked');
    expect(await readdir(root)).toEqual([]);
  });

  it('allocates distinct concurrent records under the same global root with session partitions',async()=>{
    const parent=await temporary(),root=join(parent,'data'),run=promisify(execFile);
    const module=new URL('./data-root.mjs',import.meta.url).href;
    const paths=await Promise.all(['session-one','session-one','session-two'].map(async session=>{
      const script=`import {createSessionCollection} from ${JSON.stringify(module)}; console.log(createSessionCollection(${JSON.stringify(root)},'jev-workflow',${JSON.stringify(session)}));`;
      const result=await run(process.execPath,['--input-type=module','-e',script]);return result.stdout.trim();
    }));
    expect(new Set(paths).size).toBe(3);
    expect(dirname(paths[0])).toBe(dirname(paths[1]));expect(dirname(paths[0])).not.toBe(dirname(paths[2]));
    for(const path of paths){expect(path).toMatch(/jev-workflow\/session-[a-f0-9]{64}\/selection-/);expect((await stat(path)).mode&0o777).toBe(0o700);}
    const manual=createSessionCollection(root,'jev-manual','session-one');
    expect(manual).toMatch(/jev-manual\/session-[a-f0-9]{64}\/run-/);
    const file=join(manual,'selection.json');writePrivateNew(file,'original');
    expect((await stat(file)).mode&0o777).toBe(0o600);
    expect(()=>writePrivateNew(file,'replacement')).toThrow();expect(await readFile(file,'utf8')).toBe('original');
    expect((await stat(root)).mode&0o777).toBe(0o700);
  });

  it('rejects linked ancestors without creating artifacts through them',async()=>{
    const root=await temporary(),target=join(root,'target'),alias=join(root,'alias');
    await mkdir(target,{mode:0o700});await symlink(target,alias,'dir');
    expect(()=>createSessionCollection(join(alias,'collection'),'jev-workflow','session-one')).toThrow(/not links/);
    expect(await readdir(target)).toEqual([]);
    expect(()=>createSessionCollection(join(root,'unused'),'other','session-one')).toThrow(/kind/);
    await expect(stat(join(root,'unused'))).rejects.toMatchObject({code:'ENOENT'});
  });
});
