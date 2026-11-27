const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {validate}=require('./validate.cjs');
for(const name of fs.readdirSync(path.join(__dirname,'../examples')).filter(name=>name.endsWith('.json'))){const doc=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples',name)));assert.deepEqual(validate(doc).errors,[],name);}
assert.equal(validate({signal:[{wave:'1....'}]}).warnings.length,0);
assert.equal(validate({signal:[{wave:'11111'}]}).warnings.length,4);
assert.equal(validate({signal:[{wave:'010101'}]}).warnings.length,0);
assert.ok(validate({signal:[{wave:'x.==',data:['A']}]}).errors.some(m=>m.includes('labels')));
assert.ok(validate({signal:[{wave:'0...',node:'.a..'}],edge:['a->b']} ).errors.some(m=>m.includes('unknown node b')));
assert.ok(validate({signal:[{wave:'0',node:'a'},{wave:'1',node:'a'}]}).errors.some(m=>m.includes('duplicate')));
assert.ok(validate({signal:[{wave:'0',period:0}]}).errors.some(m=>m.includes('period')));
assert.ok(validate({signal:[{wave:'1<0'}]}).errors.some(m=>m.includes('unclosed')));
assert.ok(validate({signal:[{wave:'0 1'}]}).errors.some(m=>m.includes('whitespace')));
const rv=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/ready-valid.json')));
function at(w,t){let c;for(let i=0;i<=Math.floor(t);i++)if(w[i]!=='.')c=w[i];return c;}
assert.equal(at(rv.signal[1].wave,3.5), '1');assert.equal(at(rv.signal[2].wave,3.5),'0');
for(const t of [4.5,5.5])assert.ok(at(rv.signal[1].wave,t)==='1'&&at(rv.signal[2].wave,t)==='1');
assert.equal(at(rv.signal[1].wave,6.5),'0');
console.log('PASS: examples, continuation defaults, deliberate glitch warnings, real pulse preservation, labels/nodes, malformed timing and ready/valid sampling');
