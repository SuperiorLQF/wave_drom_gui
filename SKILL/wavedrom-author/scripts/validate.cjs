#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const STYLES=new Set(['-','~','-~','~-','-|','|-','-|-','->','~>','-~>','~->','-|>','|->','-|->','<->','<~>','<-~>','<-|>','<-|->','+']);
function validate(doc){
 const errors=[],warnings=[],nodes=new Set(),spans=[];
 const error=(p,m)=>errors.push(`${p}: ${m}`),warn=(p,m)=>warnings.push(`${p}: ${m}`);
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||!Array.isArray(doc.signal))return{errors:['signal: expected an array'],warnings};
 function visit(items,p){items.forEach((lane,i)=>{
  const at=`${p}[${i}]`;
  if(Array.isArray(lane)){if(typeof lane[0]!=='string')error(at,'group must start with a name');visit(lane.slice(1),at+'.children');return;}
  if(!lane||typeof lane!=='object'){error(at,'expected signal/group object');return;}
  if(!Object.keys(lane).length)return; // native spacer
  if(typeof lane.wave!=='string'){error(at+'.wave','expected a string');return;}
  const w=lane.wave;
  if(/[^01xzpPnNhHlLud=2-9.|<>]/.test(w))error(at+'.wave','unsupported character; whitespace is not a portable blank cycle');
  let sub=false,span=0;
  for(const c of w){if(c==='<'){if(sub)error(at+'.wave','nested < is unsupported');sub=true;}else if(c==='>'){if(!sub)error(at+'.wave','unmatched >');sub=false;}else span+=sub?0.5:(lane.period??1);}
  if(sub)error(at+'.wave','unclosed <');
  const period=lane.period??1,phase=lane.phase??0;
  if(typeof period!=='number'||!Number.isFinite(period)||period<=0)error(at+'.period','must be a positive finite number');
  if(typeof phase!=='number'||!Number.isFinite(phase))error(at+'.phase','must be finite');
  spans.push([at,span-phase*period]);
  const count=(w.match(/[=2-9]/g)||[]).length;
  if(lane.data!==undefined){const data=Array.isArray(lane.data)?lane.data:typeof lane.data==='string'?lane.data.trim().split(/\s+/):null;
   if(!data)error(at+'.data','expected array or space-separated labels');else if(data.length!==count)error(at+'.data',`${count} bus states but ${data.length} labels`);
  }else if(count)warn(at+'.data','unlabelled bus states; confirm intended');
  if(lane.node!==undefined){if(typeof lane.node!=='string')error(at+'.node','expected string');else{
   if(lane.node.length!==w.length)warn(at+'.node','length differs from wave; check node placement');
   [...lane.node].forEach((c,t)=>{if(c==='.')return;if(!/[a-zA-Z]/.test(c)){error(at+'.node','only single ASCII letters and . are supported');return;}if(nodes.has(c))error(at+'.node',`duplicate node ${c}`);nodes.add(c);if(t>=w.length||'<>'.includes(w[t]))error(at+'.node',`node ${c} is outside a drawable slot`);});
  }}
  let previous=null;
  for(let t=0;t<w.length;t++){const c=w[t];if(c==='.')continue;const group='1hH'.includes(c)?'high':'0lL'.includes(c)?'low':null;
   if(group&&group===previous)warn(at+'.wave',`cycle ${t}: repeated ${group} state; normally use .; keep only for intentional task boundaries/glitches`);
   previous=group;
  }
 });}
 visit(doc.signal,'signal');
 if(doc.edge!==undefined&&!Array.isArray(doc.edge))error('edge','expected array');
 for(const [i,e]of(Array.isArray(doc.edge)?doc.edge:[]).entries()){
  const m=typeof e==='string'&&/^\s*([a-zA-Z])([~|+<>-]+)([a-zA-Z])(?:\s+.*)?$/.exec(e);
  if(!m||!STYLES.has(m[2])){error(`edge[${i}]`,'unsupported edge expression');continue;}
  for(const n of [m[1],m[3]])if(!nodes.has(n))error(`edge[${i}]`,`unknown node ${n}`);
 }
 if(spans.length>1&&spans.some(([,end])=>Math.abs(end-spans[0][1])>1e-6))warn('signal','different time extents after period/phase; confirm intentional alignment');
 return{errors,warnings};
}
if(require.main===module){try{const file=process.argv[2];if(!file)throw Error('Usage: node validate.cjs file.json (or - for stdin)');const doc=JSON.parse(fs.readFileSync(file==='-'?0:file,'utf8'));const result=validate(doc);for(const m of result.errors)console.error('ERROR '+m);for(const m of result.warnings)console.warn('WARN '+m);console.log(`${result.errors.length} errors, ${result.warnings.length} warnings`);process.exitCode=result.errors.length?1:0;}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={validate};
