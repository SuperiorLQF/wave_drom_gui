const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');const {parse,inspect,compile}=require('./compile.cjs');
const run=s=>compile(parse(s));
assert.equal(run('@a,type=bin\n0\n1\n1\n0').signal[0].wave,'01.0');
assert.equal(run('@a,type=bin\n1\n1\n1\n1\n1').signal[0].wave,'1....');
assert.equal(run('@a,type=bin\n1\n1!\n1\n1').signal[0].wave,'11..');
assert.deepEqual(run('@b,type=bus\n2\nz\n5\n6\n"INIT"').signal[0],{name:'b',wave:'=z===',data:['2','5','6','INIT']});
assert.deepEqual(run('@b,type=bus\n"A"\n"A"\n"A" !\n"A"').signal[0],{name:'b',wave:'=.=.',data:['A','A']});
assert.deepEqual(run('@b,type=bus\nx\n"x"\n"x"\nz\n"z"').signal[0],{name:'b',wave:'x=.z=',data:['x','z']});
assert.equal(run('@a，type＝bin\n# not a cycle\n\n0\n0').signal[0].wave,'0.');
assert.deepEqual(run('@b,type=bus\n”INIT”\n"DONE!"\n"9007199254740993"').signal[0].data,['INIT','DONE!','9007199254740993']);
for(const invalid of ['1','@a,type=bin\n.','@a,type=bin\n0 1','@a,type=clock\np','@a,type=bus\nINIT','@a,type=bin\n0\n@a,type=bin\n1','@a,type=bin'])assert.throws(()=>parse(invalid));
const unequal=parse('@a,type=bin\n0\n@b,type=bin\n1\n1');assert.equal(inspect(unequal).errors.length,1);assert.equal(inspect(unequal,{allowUnequal:true}).warnings.length,1);assert.equal(compile(unequal).signal[0].wave.length,1);
// Iterate in LWF, then regenerate; the neighbouring samples remain explicit in the source.
const before='@a,type=bin\n0\n0\n0\n0\n';const after='@a,type=bin\n0\n0\n1\n0\n';assert.equal(run(before).signal[0].wave,'0...');assert.equal(run(after).signal[0].wave,'0.10');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lwf-test-')),input=path.join(dir,'input.lwf'),output=path.join(dir,'output.json'),cli=path.join(__dirname,'compile.cjs');
try{
 fs.writeFileSync(input,after);let r=spawnSync(process.execPath,[cli,input,'--check'],{encoding:'utf8'});assert.ifError(r.error);assert.equal(r.status,0);assert.match(r.stdout,/0:0 1:0 2:1 3:0/);assert.ok(!fs.existsSync(output));
 r=spawnSync(process.execPath,[cli,input,'--out',output],{encoding:'utf8'});assert.ifError(r.error);assert.equal(r.status,0);assert.equal(JSON.parse(fs.readFileSync(output)).signal[0].wave,'0.10');
 const saved=fs.readFileSync(output,'utf8');r=spawnSync(process.execPath,[cli,input,'--out',output],{encoding:'utf8'});assert.ifError(r.error);assert.notEqual(r.status,0);assert.equal(fs.readFileSync(output,'utf8'),saved);
 fs.writeFileSync(input,'@a,type=bin\n1\n@b,type=bin\n0\n0');r=spawnSync(process.execPath,[cli,input],{encoding:'utf8'});assert.ifError(r.error);assert.notEqual(r.status,0);assert.equal(r.stdout,'');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
for(const name of fs.readdirSync(path.join(__dirname,'../examples')).filter(n=>n.endsWith('.lwf'))){const s=parse(fs.readFileSync(path.join(__dirname,'../examples',name),'utf8'));assert.deepEqual(inspect(s).errors,[],name)}
console.log('PASS: LWF parsing, explicit per-cycle checks, compression, forced boundaries, special states, source iteration, malformed inputs, unequal lengths and no-overwrite CLI');
