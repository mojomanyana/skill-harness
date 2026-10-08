/** Executed in a fresh bounded process. Never writes native sessions or private reasoning. */
export const DECISION_WORKER_SOURCE = String.raw`
import { readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const emit = value => process.stdout.write(JSON.stringify(value)+'\n');
let session;
try {
  const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const [major,minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 19) throw Error('Pi requires Node >=22.19');
  const host = await realpath(config.piPackage);
  const pkg = JSON.parse(await readFile(join(host,'package.json'),'utf8'));
  if (pkg.name !== '@earendil-works/pi-coding-agent' || pkg.version !== '1.0.4') throw Error('Exact Pi 1.0.4 required');
  const { createAgentSession, DefaultResourceLoader, SettingsManager, SessionManager, ModelRuntime } = await import(pathToFileURL(join(host,'dist/index.js')).href);
  const settingsManager = SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false},packages:[],extensions:[],skills:[],prompts:[],themes:[]});
  const resourceLoader = new DefaultResourceLoader({cwd:config.cwd,agentDir:config.agentDir,settingsManager,noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,systemPrompt:config.systemPrompt});
  await resourceLoader.reload();
  if (resourceLoader.getExtensions().extensions.length || resourceLoader.getSkills().skills.length || resourceLoader.getPrompts().prompts.length || resourceLoader.getAgentsFiles().agentsFiles.length || resourceLoader.getAppendSystemPrompt().length) throw Error('Unexpected inherited resources');
  const runtime = await ModelRuntime.create({authPath:config.authPath,modelsPath:join(config.agentDir,'models.json'),modelsStorePath:join(config.agentDir,'models-store.json'),allowModelNetwork:false});
  if (config.provider !== 'openai-codex' || !runtime.isUsingOAuth(config.provider) || !runtime.isUsingSubscription(config.provider)) throw Error('Existing OAuth subscription route required');
  const model = runtime.getModel(config.provider,config.model);
  if (!model || !(await runtime.getAvailable(config.provider)).some(m=>m.id===config.model)) throw Error('Exact selected model unavailable');
  const manager = SessionManager.inMemory(config.cwd);
  const created = await createAgentSession({cwd:config.cwd,agentDir:config.agentDir,modelRuntime:runtime,model,thinkingLevel:config.thinking,settingsManager,resourceLoader,sessionManager:manager,noTools:'all',tools:[],customTools:[]});
  session = created.session;
  if (created.modelFallbackMessage || session.getActiveToolNames().length) throw Error('Unexpected fallback or tools');
  let updateSent=false;
  session.subscribe(event=>{
    if (event.type==='message_update') {if(!updateSent){emit({type:'message_update'});updateSent=true;}return;}
    if (['agent_start','turn_start','message_start','turn_end','agent_end','agent_settled'].includes(event.type)) {emit({type:event.type});updateSent=false;return;}
    if (event.type==='tool_execution_start'||event.type==='tool_execution_end') {emit({type:'decision-forbidden-tool'});return;}
    if(event.type!=='message_end'||event.message?.role!=='assistant')return;
    const m=event.message;
    if(m.content.some(b=>b.type!=='text'&&b.type!=='thinking')) {emit({type:'decision-forbidden-tool'});return;}
    emit({type:'message_end',message:{role:'assistant',content:m.content.filter(b=>b.type==='text').map(b=>({type:'text',text:b.text})),stopReason:m.stopReason,provider:m.provider,model:m.model,usage:m.usage,timestamp:m.timestamp}});updateSent=false;
  });
  await session.prompt(config.prompt);
  await session.waitForIdle();
  const leaf=manager.getLeafEntry();
  if(session.isStreaming||leaf?.type!=='message'||leaf.message.role!=='assistant'||leaf.message.stopReason!=='stop')throw Error('Final native leaf unavailable');
  const text=leaf.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');
  emit({type:'decision-receipt',piVersion:'1.0.4',provider:leaf.message.provider,model:leaf.message.model,sessionId:manager.getSessionId(),messageId:leaf.id,finalSha256:createHash('sha256').update(text).digest('hex'),oauth:true,subscription:true,tools:0,retry:false,compaction:false});
} catch {
  // SDK/provider errors may include raw responses or credentials. Deliberately sanitize.
  emit({type:'decision-worker-error'});process.exitCode=1;
} finally {if(session) await session.dispose();}
`;
