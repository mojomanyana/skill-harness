import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { learningCopy, learningFile } from './learning-journal.js';
import type { CodexSdkBinding } from './codex-sdk-transport.js';
export interface CodexDiagnosticModelPin {path:string;sha256:string}
const closed=(v:any,keys:string[])=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join()!==keys.sort().join())throw Error('closed diagnostic model definition required');};
/** Local catalogue declaration only, NOT canonical resolution or account entitlement. */
export function validateCodexDiagnosticModel(raw:unknown):CodexSdkBinding['model'] {
 const m=learningCopy(raw) as any;closed(m,['id','name','provider','api','baseUrl','reasoning','input','cost','contextWindow','maxTokens','thinkingLevelMap','compat']);
 if(m.id!=='gpt-6-astra'||m.name!=='GPT-6 Astra'||m.provider!=='openai-codex'||m.api!=='openai-codex-responses'||m.baseUrl!=='https://chatgpt.com/backend-api'||m.reasoning!==true||JSON.stringify(m.input)!=='["text","image"]'||![m.contextWindow,m.maxTokens].every(n=>Number.isSafeInteger(n)&&n>0))throw Error('diagnostic model identity/capability mismatch');
 closed(m.thinkingLevelMap,['off','minimal','low','medium','high','xhigh','max']);if(m.thinkingLevelMap.off!==null||m.thinkingLevelMap.minimal!=='low'||['low','medium','high','xhigh','max'].some(k=>m.thinkingLevelMap[k]!==k))throw Error('diagnostic effort mapping mismatch');
 closed(m.compat,['supportsOpenAIGrammarTools','supportsAdditionalTools','supportsToolSearch']);if(!Object.values(m.compat).every(v=>typeof v==='boolean'))throw Error('diagnostic compatibility mismatch');
 const prices=['input','output','cacheRead','cacheWrite'];closed(m.cost,[...prices,'tiers']);if(!Array.isArray(m.cost.tiers)||m.cost.tiers.length>8)throw Error('diagnostic cost declaration');
 for(const [i,cost] of [m.cost,...m.cost.tiers].entries()){if(i)closed(cost,['inputTokensAbove',...prices]);if(![...prices,...(i?['inputTokensAbove']:[])].every(k=>typeof cost[k]==='number'&&Number.isFinite(cost[k])&&cost[k]>=0))throw Error('diagnostic cost declaration');}
 return m;
}
export function loadCodexDiagnosticModel(pin:CodexDiagnosticModelPin){
 closed(pin,['path','sha256']);if(typeof pin.path!=='string'||!isAbsolute(pin.path)||!/^[a-f0-9]{64}$/.test(pin.sha256))throw Error('diagnostic definition pin required');
 const bytes=learningFile(pin.path,8192);if(createHash('sha256').update(bytes).digest('hex')!==pin.sha256)throw Error('diagnostic definition source mismatch');return validateCodexDiagnosticModel(JSON.parse(bytes.toString('utf8')));
}
