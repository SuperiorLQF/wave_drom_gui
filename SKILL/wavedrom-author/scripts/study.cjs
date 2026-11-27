#!/usr/bin/env node
'use strict';
// Local study aids: verifies reference pairs and prepares work; never claims to train a model.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {parse,inspect,compile}=require('./compile.cjs');
const {validate}=require('./validate.cjs');
const root=path.resolve(__dirname,'..'),examples=path.join(root,'examples');
const catalog=JSON.parse(fs.readFileSync(path.join(examples,'catalog.json'),'utf8'));
const read=name=>fs.readFileSync(path.join(examples,name),'utf8');
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
function samples(signals){return signals.map(s=>({name:s.name,type:s.type,samples:s.samples.map(({kind,value,force})=>({kind,value,force}))}))}
function compare(id,file){
 const lesson=catalog.cases.find(c=>c.id===id);assert(lesson,'Unknown lesson: '+id);
 assert(lesson.lwf,'Native reference: read the prompt and explain supported/unsupported features; no exact LWF comparison');
 const candidate=parse(fs.readFileSync(file,'utf8')),reference=parse(read(lesson.lwf));
 assert.deepEqual(inspect(candidate).errors,[]);
 // Header/comments/whitespace and ordering do not change semantics. Force markers DO.
 const sort=x=>samples(x).sort((a,b)=>a.name.localeCompare(b.name));
 assert.deepEqual(sort(candidate),sort(reference),'LWF differs: review names, ticks, state vs label, and forced boundaries');
 assert.deepEqual(compile(reference),JSON.parse(read(lesson.json)),'Reference LWF/JSON out of sync');
 console.log('PASS '+id+': all explicit values and intentional boundaries match');
}
function audit(){
 const listed=new Set(['catalog.json']),ids=new Set();let pairs=0;
 for(const c of catalog.cases){
  assert(/^[a-z0-9-]+$/.test(c.id)&&!ids.has(c.id),'Invalid/duplicate lesson ID');ids.add(c.id);
  assert(['paired','syntax','native-reference'].includes(c.kind),'Invalid lesson kind');
  for(const name of [c.prompt,c.lwf,c.json].filter(Boolean)){
   assert(!path.isAbsolute(name)&&!name.split('/').includes('..'),'Invalid example path');listed.add(name);assert(read(name).trim(),'Empty example '+name);
  }
  const json=JSON.parse(read(c.json));assert.deepEqual(validate(json).errors,[],c.json);
  if(c.lwf){const s=parse(read(c.lwf));assert.deepEqual(inspect(s).errors,[],c.lwf);assert.deepEqual(compile(s),json,c.id+': reference pair drift');pairs++}
 }
 for(const name of fs.readdirSync(examples))if(/\.(lwf|json)$/.test(name))assert(listed.has(name),'Unlisted example: '+name);
 for(const name of fs.readdirSync(path.join(examples,'lessons')))assert(listed.has('lessons/'+name),'Unlisted exercise: '+name);
 return {lessons:ids.size,pairs};
}
function snapshot(){
 const files={};
 function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else files[path.relative(root,p).split(path.sep).join('/')]=digest(fs.readFileSync(p))}}
 walk(examples);
 for(const name of ['SKILL.md','references/lwf.md','references/continuations.md','references/protocols.md','references/self-study.md','references/image-to-lwf.md','scripts/compile.cjs','scripts/validate.cjs','scripts/study.cjs','scripts/test-examples.cjs','scripts/test.cjs','scripts/test-lwf.cjs'])files[name]=digest(fs.readFileSync(path.join(root,name)));
 return {version:1,files};
}
function prepare(stateFile,out){
 const counts=audit(),now=snapshot();let old;
 if(fs.existsSync(stateFile)){old=JSON.parse(fs.readFileSync(stateFile,'utf8'));assert.equal(old.version,1,'Unknown study state version');assert(old.files&&typeof old.files==='object','Invalid study state')}
 const changed=[...new Set([...Object.keys(old?.files||{}),...Object.keys(now.files)])].filter(k=>old?.files[k]!==now.files[k]).sort();
 const queue=changed.length?catalog.cases:[]; // Revisit all references when rules or examples change.
 let report=`# WaveDrom 自学待办\n\n结构检查：PASS（${counts.lessons} 个样例，${counts.pairs} 对 LWF/JSON）。\n对比基线：${old?'上次检查快照':'无，首次检查'}。变更文件：${changed.length}。\n\n`;
 report+='这是自动检查和练习清单，不是 AI 已完成学习或模型训练。该快照记录的是已检查版本，不是已掌握版本。\n\n';
 report+='## 变更\n\n'+(changed.map(p=>'- '+p).join('\n')||'未检测到变更。')+'\n\n## 练习\n\n';
 for(const c of queue)report+=`- ${c.id}：先读 examples/${c.prompt}，独立写 LWF/解释，保存后再读参考 ${c.lwf||c.json}。${c.lwf?`执行 study.cjs compare ${c.id} <自己的.lwf>。`:'解释原生扩展与 LWF 边界。'}\n`;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'study-task.md'),report);
 fs.writeFileSync(path.join(out,'snapshot.json'),JSON.stringify(now,null,2)+'\n');
 fs.mkdirSync(path.dirname(path.resolve(stateFile)),{recursive:true});fs.writeFileSync(stateFile,JSON.stringify(now,null,2)+'\n');
 console.log(report);
}
if(require.main===module){try{
 const [command,...args]=process.argv.slice(2);
 if(command==='compare'){assert.equal(args.length,2,'Usage: study.cjs compare <id> <candidate.lwf>');compare(...args)}
 else if(command==='audit'){assert.equal(args.length,0);console.log('PASS',audit())}
 else if(command==='prepare'){assert.equal(args.length,2,'Usage: study.cjs prepare <state.json> <report-dir>');prepare(...args)}
 else throw Error('Usage: study.cjs audit | compare <id> <candidate.lwf> | prepare <state.json> <report-dir>');
}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={audit,compare,snapshot};
