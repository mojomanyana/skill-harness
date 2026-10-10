import { constants } from 'node:fs';
import { open, opendir } from 'node:fs/promises';
import { join, parse, relative, sep } from 'node:path';
import { resolveDataRoot } from './data-root.mjs';
import { learningDigest, readBoundedArtifact } from './learning-data.mjs';

const DIRECTORY = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const LIMITS = Object.freeze({ entries:10_000, directories:10_000, bytes:32 * 1024 * 1024 });
const SESSION = /^session-([a-f0-9]{64})$/;
const SELECTION = /^selection-[A-Za-z0-9]{6}$/;
const RUN = /^run-[A-Za-z0-9]{6}$/;
const IDENTIFIER = /^[A-Za-z0-9~@][A-Za-z0-9~._:/@+-]{0,255}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sessionIdentity = value => typeof value === 'string' && value.trim() && value.length <= 256 &&
  !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);

// Hold directory descriptors during enumeration. Never recurse through a path symlink.
async function openRoot(root) {
  const anchor = parse(root).root;
  let handle = await open(anchor, DIRECTORY);
  try {
    for (const name of relative(anchor, root).split(sep).filter(Boolean)) {
      const next = await open(`/proc/self/fd/${handle.fd}/${name}`, DIRECTORY);
      await handle.close(); handle = next;
    }
    return handle;
  } catch (error) { await handle.close(); throw error; }
}

/** Metadata inventory only: neither source validation, eligibility nor a training designation. */
export async function listCollections(value) {
  const root = resolveDataRoot({override:value});
  if (process.platform !== 'linux') throw Error('Collection inventory requires Linux no-follow directory descriptors');
  const result = { schema:1, kind:'decision-collection-inventory', meaning:'inventory-only-not-validation',
    collections:[], count:0, gaps:[], truncated:false, limits:{...LIMITS},
    trainingEligible:false, exportEligible:false };
  let entries=0, directories=0, bytesRead=0;
  const gap = (path, reason) => result.gaps.push({path,reason});
  const limit = path => { if (!result.truncated) gap(path,'inventory-limit-reached'); result.truncated=true; };
  const directoryFailure = (path,error) => gap(path,error.code === 'ENOENT' ? 'directory-missing' : 'linked-or-unreadable-directory');
  async function visit(parent,name,path,fn,optional=false) {
    if (result.truncated) return;
    if (directories >= LIMITS.directories) { limit(path); return; }
    let handle;
    try { handle=await open(`/proc/self/fd/${parent.fd}/${name}`,DIRECTORY); directories++; }
    catch(error) { if (!optional || error.code !== 'ENOENT') directoryFailure(path,error); return; }
    try { await fn(handle); } finally { await handle.close(); }
  }
  async function each(handle,path,fn) {
    let directory;
    try { directory=await opendir(`/proc/self/fd/${handle.fd}`); }
    catch { gap(path,'unreadable-directory'); return; }
    try {
      for await (const entry of directory) {
        if (entries >= LIMITS.entries) { limit(path); break; }
        entries++;
        await fn(entry);
        if (result.truncated) break;
      }
    } catch { gap(path,'directory-changed-or-unreadable'); }
  }
  async function selection(path,kind,expectedSession) {
    const file=kind === 'jev-workflow' ? 'selection.json' : 'selected-data.json';
    const relativePath=`${path}/${file}`;
    const maximum=kind === 'jev-workflow' ? 1024*1024 : 4*1024*1024;
    if (LIMITS.bytes-bytesRead < maximum) { limit(path); return; }
    let bytes;
    try { bytes=await readBoundedArtifact(join(root,relativePath),maximum); }
    catch(error) { gap(relativePath,error.code === 'ENOENT' ? 'selection-missing' : 'linked-oversized-or-unreadable-selection'); return; }
    bytesRead+=bytes.length;
    let record;
    try { record=JSON.parse(bytes.toString('utf8')); }
    catch { gap(relativePath,'invalid-selection-json'); return; }
    const workflow=kind === 'jev-workflow';
    const recognized=object(record) && (workflow
      ? ((record.schema===2 && record.kind==='skill-harness-selected-decision-v2') ||
         (record.schema===3 && record.kind==='skill-harness-selected-decision-v3'))
      : record.schema===1 && record.kind==='decision-session-selected-data');
    if (!recognized || !sessionIdentity(record.sessionId) || record.trainingEligible!==false ||
        (workflow ? record.exportEligible!==false : !Array.isArray(record.cases))) {
      gap(relativePath,'unrecognized-or-incomplete-selection'); return;
    }
    const sessionSha256=learningDigest(record.sessionId);
    if (expectedSession && expectedSession!==sessionSha256) { gap(relativePath,'session-partition-mismatch'); return; }
    let provider=null,model=null;
    if (workflow) {
      provider=typeof record.provider==='string' && IDENTIFIER.test(record.provider) ? record.provider : null;
      model=typeof record.model==='string' && IDENTIFIER.test(record.model) ? record.model : null;
      if (provider===null || model===null) gap(relativePath,'invalid-provider-model-metadata');
    }
    result.collections.push({path:relativePath,sha256:learningDigest(bytes),bytes:bytes.length,sessionSha256,
      recordType:record.kind,recordSchema:record.schema,caseCount:workflow ? 1 : record.cases.length,
      provider,model,trainingEligible:false,exportEligible:false});
  }
  async function family(handle,path,kind) {
    await each(handle,path,async entry=>{
      const session=SESSION.exec(entry.name);
      const legacy=kind==='jev-workflow' && SELECTION.test(entry.name);
      if (session) {
        const sessionPath=`${path}/${entry.name}`;
        await visit(handle,entry.name,sessionPath,async sessionHandle=>{
          await each(sessionHandle,sessionPath,async child=>{
            const matches=(kind==='jev-workflow' ? SELECTION : RUN).test(child.name);
            if (!matches) {
              if (child.isSymbolicLink() || /^(selection|run)-/.test(child.name)) gap(sessionPath,'unrecognized-collection-entry');
              return;
            }
            const childPath=`${sessionPath}/${child.name}`;
            await visit(sessionHandle,child.name,childPath,()=>selection(childPath,kind,session[1]));
          });
        });
      } else if (legacy) {
        const childPath=`${path}/${entry.name}`;
        await visit(handle,entry.name,childPath,()=>selection(childPath,kind,null));
      } else if (entry.isSymbolicLink() || /^(session|selection|run)-/.test(entry.name)) {
        gap(path,'unrecognized-collection-entry');
      }
    });
  }
  let handle;
  try { handle=await openRoot(root); }
  catch(error) { directoryFailure('.',error); return result; }
  try {
    for (const kind of ['jev-workflow','jev-manual'])
      await visit(handle,kind,kind,child=>family(child,kind,kind),true);
  } finally { await handle.close(); }
  result.collections.sort((a,b)=>a.path.localeCompare(b.path));
  result.gaps.sort((a,b)=>a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason));
  result.count=result.collections.length;
  return result;
}
