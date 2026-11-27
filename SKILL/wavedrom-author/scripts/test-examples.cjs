'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parse}=require('./compile.cjs');const {audit,compare}=require('./study.cjs');
audit();
const load=id=>Object.fromEntries(parse(fs.readFileSync(path.join(__dirname,'../examples',id+'.lwf'),'utf8')).map(s=>[s.name,s.samples.map(c=>c.value)]));
const edges=v=>v.flatMap((x,t)=>t&&v[t-1]==='0'&&x==='1'?[t]:[]);
function sync(s,clock,names){const allowed=edges(s[clock]);for(const n of names)for(let t=1;t<s[n].length;t++)if(s[n][t]!==s[n][t-1])assert(allowed.includes(t),n+' off-edge '+t)}
let s=load('rising-edge');assert.deepEqual(edges(s.CLK),[1,3,5,7,9,11]);sync(s,'CLK',['Q','DATA']);
s=load('wide-clock');assert.deepEqual(edges(s.CLK),[1,5,9]);sync(s,'CLK',['Q']);
s=load('icg-gated');assert.deepEqual(edges(s.CLK_GATED),[1,5,9,13]);sync(s,'CLK_GATED',['Q_GATED']);
for(let t=0;t<16;t++){assert.equal(s.CLK_GATED[t],s.CLK_IN[t]==='1'&&s.ICG_EN[t]==='1'?'1':'0');if(t&&s.ICG_EN[t]!==s.ICG_EN[t-1])assert.equal(s.CLK_IN[t],'0')}
s=load('clock-div2');assert.deepEqual(edges(s.CLK_DIV2),[1,5,9,13]);sync(s,'CLK_IN',['CLK_DIV2']);sync(s,'CLK_DIV2',['Q_DIV2']);
for(let t=1;t<16;t++)assert.equal(s.CLK_DIV2[t]!==s.CLK_DIV2[t-1],edges(s.CLK_IN).includes(t));
function handshakes(s,clock,v,r){return edges(s[clock]).filter(t=>s[v][t-1]==='1'&&s[r][t-1]==='1')}
function hold(s,clock,v,r,payload){const rises=edges(s[clock]);for(let i=0;i<rises.length;i++){const t=rises[i];if(s[v][t-1]!=='1'||s[r][t-1]!=='0')continue;const next=rises[i+1];assert(next,'Unresolved stall');for(const n of [v,...payload])for(let k=t;k<next;k++)assert.equal(s[n][k],s[n][t-1],n+' changed during stall')}}
s=load('ready-valid-sync');sync(s,'CLK',['VALID','READY','DATA']);assert.deepEqual(handshakes(s,'CLK','VALID','READY'),[7,9]);hold(s,'CLK','VALID','READY',['DATA']);
s=load('axi4-write-sync');sync(s,'ACLK',Object.keys(s).filter(n=>n!=='ACLK'));
assert.deepEqual(handshakes(s,'ACLK','AWVALID','AWREADY'),[11]);
const w=handshakes(s,'ACLK','WVALID','WREADY');assert.deepEqual(w,[13,15,21,23]);assert.deepEqual(w.map(t=>s.WDATA[t-1]),['D0','D1','D2','D3']);assert.deepEqual(w.map(t=>s.WLAST[t-1]),['0','0','0','1']);
assert.deepEqual(handshakes(s,'ACLK','BVALID','BREADY'),[29]);assert.equal(s.BVALID[23],'0');assert.equal(s.BVALID[25],'1');assert.equal(s.BID[28],s.AWID[10]);
hold(s,'ACLK','AWVALID','AWREADY',['AWID','AWADDR','AWLEN','AWSIZE','AWBURST']);hold(s,'ACLK','WVALID','WREADY',['WDATA','WSTRB','WLAST']);hold(s,'ACLK','BVALID','BREADY',['BID','BRESP']);
// A bad exercise and a missing intentional boundary must fail semantic comparison.
const os=require('node:os');const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wave-study-'));
try{const p=path.join(tmp,'wrong.lwf');fs.writeFileSync(p,'@enable,type=bin\n0\n0\n0\n0\n0\n@data,type=bus\n"INIT"\n"INIT"\n"INIT"\n"INIT"\n"INIT"');assert.throws(()=>compare('stable',p));fs.writeFileSync(p,fs.readFileSync(path.join(__dirname,'../examples/tasks.lwf'),'utf8').replaceAll(' !',''));assert.throws(()=>compare('tasks',p));}finally{fs.rmSync(tmp,{recursive:true,force:true})}
console.log('PASS: reference coverage, rising edges, full ICG pulses, toggle divider, pre-edge handshakes, stalls, AXI beat/response order and rejected incorrect exercises');
