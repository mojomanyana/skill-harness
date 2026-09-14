import { runLearningCommand, learningDisplay, type LearningUI } from '@skill-harness/cli/learning';
import type { CmdCtx } from './commands.js';

/** Quoted human text, no shell expansion/interpolation/execution. */
export function tokenizeLearningArgs(text: string): string[] {
  const tokens:string[]=[];let current='',quote='',started=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='\\' && quote!=="'") {if(i+1===text.length)throw Error('unfinished learning argument escape');current+=text[++i];started=true;}
    else if(quote) {if(c===quote)quote='';else current+=c;started=true;}
    else if(c==='"'||c==="'") {quote=c;started=true;}
    else if(/\s/.test(c)) {if(started)tokens.push(current);current='';started=false;}
    else {current+=c;started=true;}
  }
  if(quote)throw Error('unfinished learning argument quote');if(started)tokens.push(current);return tokens;
}
export async function handleLearningCommand(text: string, ctx: CmdCtx) {
  const say=(text:string,level:'info'|'warning'|'error'='info')=>ctx.hasUI?ctx.ui.notify(learningDisplay(text),level):console.log(learningDisplay(text));
  let ui:LearningUI|undefined;
  if(ctx.hasUI && ctx.ui.select && ctx.ui.input && ctx.ui.editor && ctx.ui.confirm) {
    // Current Pi returns selected strings/undefined; older harness test doubles return indices/null.
    const actual=ctx.ui as unknown as LearningUI;
    ui={notify:say,
      select:async(title,choices)=>{const answer=await actual.select(title,choices) as unknown;return typeof answer==='number'?choices[answer]:typeof answer==='string'?answer:undefined;},
      input:async(title,initial)=>(await actual.input(title,initial))??undefined,
      editor:async(title,text)=>(await actual.editor(title,text))??undefined,
      confirm:(title,detail)=>actual.confirm(title,detail)};
  }
  const args=tokenizeLearningArgs(text);
  if(!ui && (!args.length || args[0]==='review'))throw Error('guided learning requires interactive Pi; use explicit learning subcommands for offline reads/writes');
  await runLearningCommand(args,{cwd:ctx.cwd,write:t=>say(t),ui});
}
