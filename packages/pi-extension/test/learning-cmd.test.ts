import { expect, it, vi } from 'vitest';
import { tokenizeLearningArgs, handleLearningCommand } from '../src/learning-cmd.js';
import type { CmdCtx } from '../src/commands.js';
it('preserves quoted paths and ordinary decision notes without shell evaluation',()=>{
  expect(tokenizeLearningArgs(`decide reports --note "Both complete outputs, not excerpts" --state '/private/a b'`)).toEqual(['decide','reports','--note','Both complete outputs, not excerpts','--state','/private/a b']);
  expect(tokenizeLearningArgs(`guide --state '$HOME/$(command)'`)).toEqual(['guide','--state','$HOME/$(command)']);
  expect(()=>tokenizeLearningArgs('review "unfinished')).toThrow(/quote/);
});
it('refuses an interactive quality workflow without an actual UI',async()=>{
  const ctx:CmdCtx={cwd:process.cwd(),hasUI:false,ui:{notify:()=>{}}};
  await expect(handleLearningCommand('review reports',ctx)).rejects.toThrow(/interactive/);
});

it('routes session help through noninteractive Pi without any model or shell execution',async()=>{
 const output=vi.spyOn(console,'log').mockImplementation(()=>{});
 try{
  await handleLearningCommand('session help',{cwd:process.cwd(),hasUI:false,ui:{notify:()=>{}}});
  expect(output.mock.calls.flat().join(' ')).toContain('retrospective, no model calls');
  expect(output.mock.calls.flat().join(' ')).toContain('session preview');
 }finally{output.mockRestore();}
});
