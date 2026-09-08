import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function exerciseDashboardControls({root,host,config,budget,authority,ordinary,directory,domain,work}){
 const load=p=>import(pathToFileURL(join(root,'packages/pi-daddy/src',p+'.ts')).href);
 const [{ordinaryCancellationDigest},{dashboardHostRequestDigest},{openResourceBudget},{dispatchRequestDigest},{intentRequestDigest},{buildWorkRevisionEvent,buildWorkSnapshotEvent,projectWorkLedger}]=await Promise.all(['ordinary-children','dashboard-host','resource-budget','dispatch-control','intent-control','work-ledger'].map(load));
 const invoke=async(operation,payload,id)=>{const frame=await host.frame(),request={version:'1.0',requestId:id,hostDigest:host.hostDigest,selectionDigest:frame.selectionDigest,expectedTip:frame.tip,operation,payload};authority.requestDigests.push(dashboardHostRequestDigest(request));const result=await host.action(request);if(result.state!=='acknowledged')throw Error('original host control was not acknowledged');return {request,result};};
 const done=ordinary.run('one');await ordinary.ready('one');const before=ordinary.port.inspect();if(before.children.length!==1||before.children[0].state!=='active')throw Error('original ordinary lifetime missing');
 const resource=openResourceBudget(budget),dispatch=await resource.controls(null).inspect();const pause={version:'1.0',requestId:`${domain}:pause`,bindingDigest:config.budgetDigest,expectedRevision:dispatch.revision,action:'pause-dispatch',targetExecutionId:null};authority.dispatch.requestDigests.push(dispatchRequestDigest(pause));await invoke('dispatch',pause,`${domain}:host-pause`);
 const previous=readFileSync(join(directory,'order-work.jsonl'),'utf8'),events=previous.trim().split('\n').map(JSON.parse),snapshot=events.find(e=>e.eventId===config.selection.event.eventId&&e.digest===config.selection.event.digest)?.payload.snapshot;if(!snapshot)throw Error('actual selected snapshot unavailable');
 const replacements=new Map(),changed=[];const replace=r=>r&&replacements.get(r.digest)||r;
 for(const kind of ['goal','obligation'])for(const selected of snapshot.revisions.filter(r=>r.kind===kind)){
  const source=events.find(e=>e.event==='work_revision'&&e.payload.revision.digest===selected.digest);if(!source)throw Error('selected revision source missing');
  const {digest:_digest,...body}=source.payload.revision;const next=buildWorkRevisionEvent({eventId:`${domain}:successor:${selected.id}`,now:new Date('2026-01-02T00:00:00.000Z'),revision:{...body,revision:body.revision+1,predecessor:selected,parent:replace(body.parent),contentDigest:sha('explicit fixture successor:'+body.contentDigest)}});
  const revision={kind:next.payload.revision.kind,id:next.payload.revision.id,revision:next.payload.revision.revision,digest:next.payload.revision.digest};replacements.set(selected.digest,revision);changed.push(next);
 }
 const next=buildWorkSnapshotEvent({eventId:`${domain}:successor-selection`,now:new Date('2026-01-02T00:00:00.000Z'),snapshot:{snapshotId:`${domain}-successor-selection`,scope:snapshot.scope,revisions:snapshot.revisions.map(replace),bindings:snapshot.bindings.map(b=>Object.fromEntries(Object.entries(b).map(([k,v])=>[k,replace(v)])))}});
 const selection={snapshot:{id:next.payload.snapshot.snapshotId,digest:next.payload.snapshot.digest},event:{eventId:next.eventId,digest:next.digest}},intentState=await resource.intentControls(null).inspect();
 const request={version:'intent-request-v2',requestId:`${domain}:revise-selected`,bindingDigest:config.budgetDigest,expectedRevision:intentState.revision,expectedSelection:config.selection,action:'revise-selection',events:[...changed,next],selection,priorities:work.priorities.map(p=>({...p,obligation:replace(p.obligation)}))};
 authority.dispatch.requestDigests.push(intentRequestDigest(request));const pending=await invoke('intent',request,`${domain}:host-revise`);
 if(pending.result.result.state!=='pending-ordinary-boundary'||readFileSync(join(directory,'order-work.jsonl'),'utf8')!==previous||ordinary.port.inspect().admission!=='held-by-original-owner')throw Error('busy original child did not defer selection and hold admission');
 const blocked=await ordinary.run('blocked');if(!String(blocked.error).includes('ordinary dispatch held')||ordinary.port.inspect().children.length!==1)throw Error('pending intent admitted another ordinary child');
 await host.action(pending.request);if(readFileSync(join(directory,'order-work.jsonl'),'utf8')!==previous)throw Error('duplicate pending request applied selection');
 const cancel={version:'ordinary-cancel-v1',requestId:`${domain}:ordinary-stop`,bindingDigest:ordinary.port.bindingDigest,expectedRevision:ordinary.port.inspect().revision,target:before.children[0].target};authority.ordinary={bindingDigest:ordinary.port.bindingDigest,requestDigests:[ordinaryCancellationDigest(cancel)]};
 const cancellation=await invoke('ordinary-cancel',cancel,`${domain}:host-stop`),caller=await done;
 if(cancellation.result.result.state!=='abort-requested'||caller.error?.code!=='CHILD_CANCELLED'||ordinary.port.inspect().children[0].state!=='settled')throw Error('original caller cancellation did not settle');
 const settled=JSON.stringify(ordinary.port.inspect());await host.action(cancellation.request);if(JSON.stringify(ordinary.port.inspect())!==settled)throw Error('duplicate cancellation changed original outcome');
 if(readFileSync(join(directory,'order-work.jsonl'),'utf8')!==previous||ordinary.port.inspect().admission!=='held-by-original-owner')throw Error('settlement auto-applied or released pending direction');
 const applied=await invoke('intent-reconcile',request,`${domain}:host-reconcile`);if(applied.result.result.records[0].application!=='applied'||ordinary.port.inspect().admission!=='open')throw Error('actual successor reconciliation failed');
 const after=readFileSync(join(directory,'order-work.jsonl'),'utf8');if(!after.startsWith(previous))throw Error('successor erased old work bytes');await host.action(applied.request);if(readFileSync(join(directory,'order-work.jsonl'),'utf8')!==after)throw Error('duplicate successor appended twice');
 const projected=projectWorkLedger(after,{selectedSnapshot:selection,authority:null});if(projected.scopeState!=='valid'||projected.obligations.some(o=>o.acceptance==='accepted-under-supplied-authority'))throw Error('successor inherited acceptance');
 return {originalCancellation:'settled-original-caller',caller,ordinary:ordinary.port.inspect(),successor:{selection,admissionBoundary:'pending-busy-until-explicit-reconcile',scopeUnchanged:JSON.stringify(next.payload.snapshot.scope)===JSON.stringify(snapshot.scope),application:'applied',priorPrefixPreserved:true,acceptance:'not-assessed'},liveQualified:false};
}
