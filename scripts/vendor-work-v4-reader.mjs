#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
const [repo, commit, mode='--check']=process.argv.slice(2);
if(!repo||!/^[a-f0-9]{40}$/.test(commit??'')||!['--write','--check'].includes(mode))throw Error('usage: vendor-work-v4-reader.mjs <local repo> <exact commit> --write|--check');
const git=(...args)=>execFileSync('git',['-C',resolve(repo),...args],{maxBuffer:16*1024*1024});
if(git('rev-parse',`${commit}^{commit}`).toString().trim()!==commit)throw Error('pin mismatch');
const sha=b=>createHash('sha256').update(b).digest('hex');
const names=['work-ledger','work-ledger-types','work-ledger-json','work-ledger-validation','work-ledger-projection','work-ledger-snapshot','work-ledger-occurrences','execution-id'];
const mapping=Object.fromEntries(names.map(n=>[`${n}.ts`,`${n==='work-ledger'?'reader':n.replace(/^work-ledger-/, '')}.ts`]));
const out=new Map(), inputs={};
const prefix='packages/pi-daddy/contracts/ledger/v4/';
for(const line of git('ls-tree','-r',commit,'--',prefix).toString().trim().split('\n')){
 const m=/^100644 blob [a-f0-9]{40}\t(.+)$/.exec(line);if(!m)throw Error('nonregular work contract entry');
 const b=git('show',`${commit}:${m[1]}`);inputs[m[1]]=sha(b);out.set(`contracts/pi-daddy/work/v4/${m[1].slice(prefix.length)}`,b);
}
for(const [name,target]of Object.entries(mapping)){
 const path=`packages/pi-daddy/src/${name}`, bytes=git('show',`${commit}:${path}`);inputs[path]=sha(bytes);let source=bytes.toString();
 if(name==='work-ledger.ts'){
  const ast=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const deniedImports=new Set(['node:fs/promises','node:fs','./ledger-append.ts','./work-ledger-destination.ts','./file-lock.ts']);
  const deniedFunctions=new Set(['appendWorkLedgerEvent','inspectWorkLedger']);
  source=ast.statements.filter(s=>!(ts.isImportDeclaration(s)&&deniedImports.has(s.moduleSpecifier.text))&&!(ts.isFunctionDeclaration(s)&&deniedFunctions.has(s.name?.text))).map(s=>s.getText(ast)).join('\n')+'\n';
  if(/node:fs|appendLedgerLine|readWorkBytes|workDestination/.test(source))throw Error('read-only extraction drift');
 }
 for(const [from,to]of Object.entries(mapping))source=source.replaceAll(`./${from}`,`./${to.replace(/\.ts$/,'.js')}`);
 if(/from ["']\.\/.+\.ts["']/.test(source))throw Error('unmapped work reader dependency');
 out.set(`packages/adapters/src/generated/work-v4/${target}`,Buffer.from(`// GENERATED from pi-daddy ${commit} by scripts/vendor-work-v4-reader.mjs. Do not hand-edit.\n${source}`));
}
out.set('packages/adapters/src/generated/work-v4/pin.ts',Buffer.from(`// GENERATED: immutable work-v4 reader pin.\nexport const WORK_V4_READER_COMMIT = ${JSON.stringify(commit)};\n`));
out.set('contracts/pi-daddy/work/v4/PRODUCER-LICENSE',git('show',`${commit}:LICENSE`));
const generated=Object.fromEntries([...out].map(([p,b])=>[p,sha(b)]));
out.set('contracts/pi-daddy/work/v4/PINNED.json',Buffer.from(JSON.stringify({repository:'https://github.com/mojomanyana/pi-daddy',commit,tree:git('rev-parse',`${commit}^{tree}`).toString().trim(),source_sha256:inputs,generated_sha256:generated,extraction:'Only append/inspect functions and their filesystem imports removed from public facade; original pure builders/parser/projector retained.'},null,2)+'\n'));
const inventory=directory=>!existsSync(directory)?[]:readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const path=`${directory}/${entry.name}`;if(entry.isSymbolicLink())throw Error('symlink in work reader inventory');return entry.isDirectory()?inventory(path):[path];});
for(const path of [...inventory('contracts/pi-daddy/work/v4'),...inventory('packages/adapters/src/generated/work-v4')])if(!out.has(path))throw Error(`unexpected work reader file: ${path}`);
for(const [path,bytes]of out){if(mode==='--write'){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}else if(!readFileSync(path).equals(bytes))throw Error(`work reader drift: ${path}`);}
console.log(`${out.size} work-v4 read-only contract/reader files ${mode}; no producer writes or model calls`);
