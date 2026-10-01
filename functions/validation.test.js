const {test} = require('node:test');
const assert = require('node:assert/strict');
const {catalog,validateImage,validateExtraction} = require('./validation');
test('22 SKU and distinct squid variants',()=>{
  assert.equal(catalog.length,22); assert.equal(new Set(catalog.map(x=>x.barcode)).size,22);
  const result=validateExtraction({rows:[{barcode:'8809929791271',name:'오징어',quantity:7,uncertain:false},{barcode:'8809929791226',name:'오징어',quantity:3,uncertain:false}],total:10,warnings:[]});
  assert.equal(result.rows[0].name,'손질오징어(할복) 500g'); assert.equal(result.rows[1].name,'손질오징어(통) 500g'); assert.equal(result.needsReview,false);
});
test('unknown barcode never falls back to matching name',()=>{
  const r=validateExtraction({rows:[{barcode:'999',name:catalog[0].name,quantity:1,uncertain:false}],total:1,warnings:[]});
  assert.equal(r.rows.length,0); assert.equal(r.needsReview,true);
});
test('uncertain rows and total mismatch block transfer',()=>{
  const r=validateExtraction({rows:[{barcode:null,name:catalog[0].name,quantity:2,uncertain:false},{barcode:null,name:catalog[1].name,quantity:null,uncertain:true}],total:6,warnings:[]});
  assert.equal(r.total,2); assert.equal(r.needsReview,true); assert.equal(r.warnings.length,2);
});
test('duplicate pivot rows aggregate, totals do not',()=>{
  const row={barcode:catalog[0].barcode,name:'',quantity:2,uncertain:false};
  const r=validateExtraction({rows:[row,row],total:4,warnings:[]}); assert.equal(r.rows.length,1);assert.equal(r.total,4);
});
test('reject remote URLs, bad base64 and oversized input',()=>{
  assert.throws(()=>validateImage('https://example.com/a.png'));assert.throws(()=>validateImage('data:image/png;base64,a'));
  assert.throws(()=>validateImage('data:image/png;base64,'+'A'.repeat(7_000_000)));
});
