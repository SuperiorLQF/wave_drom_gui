#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
function parse(text){
 const signals=[],names=new Set();let signal;
 const fail=(line,message)=>{throw Error(`Line ${line}: ${message}`)};
 text.replace(/^\uFEFF/,'').split(/\r?\n/).forEach((raw,index)=>{
  const line=index+1;let value=raw.trim();if(!value||value.startsWith('#'))return;
  if(value.startsWith('@')){
   const header=/^@(.+?)[,，]\s*type\s*[=＝]\s*(bin|bus)\s*$/i.exec(value);
   if(!header)fail(line,'expected @signal_name, type=bin or type=bus');
   const name=header[1].trim();if(names.has(name))fail(line,'duplicate signal '+name);names.add(name);
   signal={name,type:header[2].toLowerCase(),samples:[],line};signals.push(signal);return;
  }
  if(!signal)fail(line,'value before a signal header');
  let force=false;if(value.endsWith('!')){force=true;value=value.slice(0,-1).trim()}
  let kind,label;
  if(/^[xz]$/i.test(value)){kind='state';label=value.toLowerCase()}
  else if(signal.type==='bin'){
   if(!/^[01]$/.test(value))fail(line,'bin accepts exactly 0, 1, x or z (one cycle per line)');
   kind='state';label=value;
  }else if(value.startsWith('"')||/^[“”]/.test(value)){
   if(/^[“”]/.test(value)&&/[“”]$/.test(value))value=JSON.stringify(value.slice(1,-1));
   try{label=JSON.parse(value)}catch{fail(line,'invalid quoted bus string')}
   if(typeof label!=='string')fail(line,'expected a quoted string');kind='data';
  }else{
   if(!/^(?:-?\d+|0[xX][\da-fA-F]+|0[bB][01]+)$/.test(value))fail(line,'bus accepts integer labels, quoted strings, x or z');
   kind='data';label=value;
  }
  signal.samples.push({kind,value:label,force,line});
 });
 if(!signals.length)throw Error('No signals');
 for(const s of signals)if(!s.samples.length)fail(s.line,'signal has no cycles: '+s.name);
 return signals;
}
function inspect(signals,{allowUnequal=false}={}){
 const errors=[],warnings=[];const ticks=signals[0].samples.length;
 for(const s of signals){
  if(s.samples.length!==ticks)(allowUnequal?warnings:errors).push(`${s.name}: ${s.samples.length} cycles; expected ${ticks}; no implicit padding`);
  for(let t=0;t<s.samples.length;t++)if(s.samples[t].force){
   const p=s.samples[t-1],c=s.samples[t];
   if(p&&p.kind===c.kind&&p.value===c.value)warnings.push(`${s.name} cycle ${t} (line ${c.line}): intentional repeated boundary (!); confirm task/transaction intent`);
  }
 }
 return{errors,warnings};
}
function compile(signals){
 return{signal:signals.map(s=>{let wave='',previous;const data=[];
  for(const sample of s.samples){const same=previous&&previous.kind===sample.kind&&previous.value===sample.value;
   if(same&&!sample.force)wave+='.';else if(sample.kind==='data'){wave+='=';data.push(sample.value)}else wave+=sample.value;
   previous=sample;
  }
  return{name:s.name,wave,...(data.length?{data}:{})};
 }),head:{tick:0}};
}
function report(signals,result){
 const lines=signals.map(s=>`${s.name} [${s.type}]: ${s.samples.length} cycles\n  `+s.samples.map((c,t)=>`${t}:${c.kind==='data'?JSON.stringify(c.value):c.value}${c.force?'!':''}`).join(' '));
 return [...lines,...result.errors.map(m=>'ERROR '+m),...result.warnings.map(m=>'WARN '+m),`${result.errors.length} errors, ${result.warnings.length} warnings`].join('\n')+'\n';
}
if(require.main===module){try{
 const args=process.argv.slice(2);let input,output,check=false,allowUnequal=false;
 for(let i=0;i<args.length;i++){
  const a=args[i];if(a==='--check')check=true;else if(a==='--allow-unequal')allowUnequal=true;
  else if(a==='--out'||a==='-o'){output=args[++i];if(!output||output.startsWith('-'))throw Error('Missing output path')}
  else if(a==='--help'){console.log('node compile.cjs input.lwf [--check] [--out generated.json] [--allow-unequal]\n--check inspects readable LWF without generating JSON. Existing outputs are never overwritten.');process.exit(0)}
  else if(a==='-'||!a.startsWith('-')){if(input)throw Error('Only one input file is allowed');input=a}
  else throw Error('Unknown argument '+a);
 }
 if(!input)throw Error('Missing LWF input; use --help');
 if(check&&output)throw Error('--check does not write generated output');
 const signals=parse(fs.readFileSync(input==='-'?0:input,'utf8')),result=inspect(signals,{allowUnequal});
 if(check){process.stdout.write(report(signals,result));if(result.errors.length)process.exitCode=1}
 else{
  // Compilation also inspects LWF. Errors never produce partial JSON.
  for(const m of result.errors)console.error('ERROR '+m);for(const m of result.warnings)console.error('WARN '+m);
  if(result.errors.length)process.exitCode=1;
  else{const json=JSON.stringify(compile(signals),null,2)+'\n';if(output)fs.writeFileSync(output,json,{flag:'wx'});else process.stdout.write(json)}
 }
}catch(e){console.error(e.message);process.exitCode=1}}
module.exports={parse,inspect,compile,report};
