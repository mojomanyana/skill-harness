import { buildAdoptionBinding, authorizeAdoption, classifyProductionObservation } from '../../packages/core/dist/index.js';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Applies a fixture policy through the real registry, then observes an actual
 * next-order artifact. Neither a declared eligible fact nor a worker success is
 * authenticated production acceptance. Both are kept explicitly separate. */
export async function replayAppliedAdoption({order,budgets,effects,registry,baseline,charter,authority,evaluation,directory,domain,previousController}){
 const candidate={...baseline,suffixBase64:Buffer.from('candidate:').toString('base64')};
 const now=Date.now(),candidateDigest=order.fixedPolicyDigest(candidate);
 const binding=buildAdoptionBinding({hypothesisDigest:evaluation.frozen.digest,experimentDigest:order.factoryOrderDigest(charter),candidateDigest,scopeDigest:charter.scopeDigest,assessmentPolicyDigest:candidate.acceptancePolicyDigest,rollbackCandidateDigest:order.fixedPolicyDigest(baseline),activationBoundary:'next-orders',expiresAt:now+120000});
 const facts={experimentDigest:binding.experimentDigest,candidateDigest,scopeDigest:binding.scopeDigest,assessmentPolicyDigest:binding.assessmentPolicyDigest,eligible:true};
 const adoptionAuthority={id:authority.id,adoptions:[binding.id],rollbacks:[]};
 const receipt=authorizeAdoption(binding,adoptionAuthority,facts,now);
 const request={version:'factory-activation-v1',requestId:`${domain}:fixture-activation`,expectedRevision:0,expectedCandidateDigest:order.fixedPolicyDigest(baseline),candidate,binding,receipt};
 const host={...authority,adoption:adoptionAuthority,facts:[{bindingId:binding.id,facts}],activationDigests:[order.activationRequestDigest(request)]};
 const store=order.openFactoryRegistry(registry);
 // Missing exact activation permission must fail without consuming a revision.
 let refused=false;try{await store.activate(request,{...host,activationDigests:[]});}catch(error){if(!/independent activation authority/.test(String(error)))throw error;refused=true;}
 if(!refused||(await store.inspect()).revision!==0)throw Error('unauthorized activation changed registry');
 const applied=await store.activate(request,host),idempotent=await store.activate(request,host);
 if(applied.revision!==1||idempotent.revision!==1||applied.candidateDigest!==candidateDigest)throw Error('activation did not apply once');
 const prior=(await previousController.inspect()).policyPin;if(prior.revision!==0||prior.candidateDigest!==order.fixedPolicyDigest(baseline)||prior.adoptionId!==null)throw Error('old order was retroactively repinned');
 const budget=await budgets.createExperimentBudget({directory:join(directory,'adopted-budget'),authorityDigest:sha(`${domain} synthetic next-order budget`),limits:{maxAttempts:2,maxInputBytes:4096,maxConcurrent:2}});
 const common=Buffer.from(charter.commonBase64,'base64').toString();
 const next={...charter,orderId:`${domain}:adopted-order`,directory:join(directory,'adopted-order'),budget,pin:{revision:1,candidateDigest},nodes:charter.nodes.map((n,i)=>({...n,decision:null,attempts:[{...n.attempts[0],executionId:`${domain}:adopted-fixed:${i}`}],expectedDigest:domain==='layout'&&i===1?'f'.repeat(64):sha(common+'candidate:'+i)}))};
 host.orderDigests=[...host.orderDigests,order.factoryOrderDigest(next)];
 await order.createFactoryOrder(registry,next,host);const controller=await order.openFactoryOrder(registry,next.orderId,host);
 const run=await controller.advance(await effects.prepareDigestProfile(budget));const final=await run.completion;
 const resources=await budgets.openResourceBudget(budget).inspect();
 if(final.control!=='not-assessed'||resources.active!==0||resources.attempts!==2||final.policyPin.adoptionId!==receipt.id||final.nodes[1].state!==(domain==='software'?'satisfied':'exhausted'))throw Error('applied next-order result or accounting mismatch');
 const bytes=await controller.readArtifact(final.nodes[0].executionId),artifactDigest=sha(bytes);
 writeFileSync(join(directory,'adopted-observed-artifact.json'),bytes,{mode:0o600});
 const observation=classifyProductionObservation(receipt,{id:`${domain}:actual-next-order`,adoptionId:final.policyPin.adoptionId,candidateDigest:final.policyPin.candidateDigest,scopeDigest:binding.scopeDigest,originalRequirementDigest:evaluation.frozen.inputs.rubricSha256,currentRequirementDigest:evaluation.frozen.inputs.rubricSha256,outcome:'unknown',acceptanceDigest:null,acceptedArtifactDigest:null,observedArtifactDigest:artifactDigest,evidence:[artifactDigest]});
 if(observation.state!=='unknown'||observation.automaticRollback!==false)throw Error('unqualified outcome became confirmed');
 const result={kind:'applied-fixture-policy-next-order',liveQualified:false,eligibilityBasis:'synthetic-host-declaration-not-independent-qualification',binding,receipt,revision:applied.revision,priorPolicyPin:prior,nextPolicyPin:final.policyPin,resources,nodes:final.nodes,observation,automaticDefault:false,grantExpansion:false};
 writeFileSync(join(directory,'applied-adoption.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
